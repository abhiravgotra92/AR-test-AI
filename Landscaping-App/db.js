const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'landscaping.db');
let db;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_FILE)
    ? new SQL.Database(fs.readFileSync(DB_FILE))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS trucks (
      id         TEXT PRIMARY KEY,
      nfc_tag    TEXT UNIQUE NOT NULL,
      name       TEXT NOT NULL,
      driver     TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      truck_id   TEXT NOT NULL,
      action     TEXT NOT NULL,
      timestamp  DATETIME DEFAULT CURRENT_TIMESTAMP,
      note       TEXT DEFAULT '',
      source     TEXT DEFAULT 'nfc'
    );
  `);
  save();
  return db;
}

function save() {
  if (db) fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
}

module.exports = { getDb, all, get, run };
