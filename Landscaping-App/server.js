const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const path = require('path');
const { getDb, all, get, run } = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ── Config ────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'greenedge2025';
const PORT = process.env.PORT || 3000;
const sessions = new Set(); // simple in-memory session tokens
const nfcDebounce = new Map(); // tag → last tap timestamp
const DEBOUNCE_MS = 5000;

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Rate limiter for NFC endpoint — max 20 taps/min per IP
const nfcLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

// Auth middleware for admin routes
function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Helpers ───────────────────────────────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}

function getTrucksInYard() {
  return all(`
    SELECT t.id, t.name, t.driver, l.timestamp as since
    FROM trucks t
    JOIN logs l ON l.id = (
      SELECT id FROM logs WHERE truck_id = t.id ORDER BY timestamp DESC LIMIT 1
    )
    WHERE l.action = 'entry'
  `);
}

// ── Auth ──────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password' });
  const token = uuidv4();
  sessions.add(token);
  res.json({ token });
});

app.post('/api/auth/logout', (req, res) => {
  sessions.delete(req.headers['x-admin-token']);
  res.json({ ok: true });
});

// ── Trucks ────────────────────────────────────────────────
app.get('/api/trucks', (req, res) => {
  res.json(all('SELECT * FROM trucks ORDER BY name'));
});

app.post('/api/trucks', requireAuth, (req, res) => {
  const { name, nfc_tag, driver } = req.body;
  if (!name || !nfc_tag) return res.status(400).json({ error: 'name and nfc_tag required' });
  const existing = get('SELECT id FROM trucks WHERE nfc_tag=?', [nfc_tag]);
  if (existing) return res.status(409).json({ error: 'NFC tag already assigned to another truck' });
  const id = uuidv4();
  run('INSERT INTO trucks (id, name, nfc_tag, driver) VALUES (?,?,?,?)', [id, name, nfc_tag, driver || '']);
  res.json({ id, name, nfc_tag, driver });
});

app.put('/api/trucks/:id', requireAuth, (req, res) => {
  const { name, nfc_tag, driver } = req.body;
  if (!name || !nfc_tag) return res.status(400).json({ error: 'name and nfc_tag required' });
  const conflict = get('SELECT id FROM trucks WHERE nfc_tag=? AND id!=?', [nfc_tag, req.params.id]);
  if (conflict) return res.status(409).json({ error: 'NFC tag already in use' });
  run('UPDATE trucks SET name=?, nfc_tag=?, driver=? WHERE id=?', [name, nfc_tag, driver || '', req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/trucks/:id', requireAuth, (req, res) => {
  run('DELETE FROM logs WHERE truck_id=?', [req.params.id]);
  run('DELETE FROM trucks WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── NFC Tap ───────────────────────────────────────────────
app.post('/api/nfc', nfcLimiter, (req, res) => {
  const { nfc_tag } = req.body;
  if (!nfc_tag) return res.status(400).json({ error: 'nfc_tag required' });

  // Debounce — ignore duplicate taps within 5 seconds
  const lastTap = nfcDebounce.get(nfc_tag);
  if (lastTap && Date.now() - lastTap < DEBOUNCE_MS) {
    return res.status(429).json({ error: 'Duplicate tap ignored', debounce_ms: DEBOUNCE_MS });
  }
  nfcDebounce.set(nfc_tag, Date.now());

  const truck = get('SELECT * FROM trucks WHERE nfc_tag=?', [nfc_tag]);
  if (!truck) return res.status(404).json({ error: 'Unknown NFC tag' });

  const last = get('SELECT action FROM logs WHERE truck_id=? ORDER BY timestamp DESC LIMIT 1', [truck.id]);
  const action = (!last || last.action === 'exit') ? 'entry' : 'exit';

  run('INSERT INTO logs (truck_id, action, source) VALUES (?,?,?)', [truck.id, action, 'nfc']);

  const yard = getTrucksInYard();
  broadcast({ type: 'update', yard, count: yard.length, truck, action });
  res.json({ truck, action, count: yard.length });
});

// ── Logs ──────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  res.json(all(`
    SELECT l.*, t.name as truck_name, t.driver
    FROM logs l JOIN trucks t ON t.id = l.truck_id
    ORDER BY l.timestamp DESC LIMIT 200
  `));
});

app.post('/api/logs', requireAuth, (req, res) => {
  const { truck_id, action, note } = req.body;
  if (!truck_id || !['entry','exit'].includes(action))
    return res.status(400).json({ error: 'truck_id and valid action required' });
  const truck = get('SELECT id FROM trucks WHERE id=?', [truck_id]);
  if (!truck) return res.status(404).json({ error: 'Truck not found' });
  run('INSERT INTO logs (truck_id, action, note, source) VALUES (?,?,?,?)', [truck_id, action, note || '', 'manual']);
  const yard = getTrucksInYard();
  broadcast({ type: 'update', yard, count: yard.length });
  res.json({ ok: true, count: yard.length });
});

app.put('/api/logs/:id', requireAuth, (req, res) => {
  const { action, note } = req.body;
  if (!['entry','exit'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  const log = get('SELECT id FROM logs WHERE id=?', [req.params.id]);
  if (!log) return res.status(404).json({ error: 'Log not found' });
  run('UPDATE logs SET action=?, note=? WHERE id=?', [action, note || '', req.params.id]);
  const yard = getTrucksInYard();
  broadcast({ type: 'update', yard, count: yard.length });
  res.json({ ok: true });
});

app.delete('/api/logs/:id', requireAuth, (req, res) => {
  run('DELETE FROM logs WHERE id=?', [req.params.id]);
  const yard = getTrucksInYard();
  broadcast({ type: 'update', yard, count: yard.length });
  res.json({ ok: true });
});

// ── Status ────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  const yard = getTrucksInYard();
  res.json({ count: yard.length, yard });
});

// ── Fallback ──────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Start ─────────────────────────────────────────────────
getDb().then(() => {
  server.listen(PORT, () => {
    console.log(`✅ GreenEdge server running at http://localhost:${PORT}`);
    console.log(`🔑 Admin password: ${ADMIN_PASSWORD}`);
  });
}).catch(err => {
  console.error('❌ Database init failed:', err.message);
  process.exit(1);
});
