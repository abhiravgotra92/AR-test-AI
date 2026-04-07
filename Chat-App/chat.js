// ── Gun.js setup ──────────────────────────────────────────────────────────────
const gun = Gun([
  'https://gun-manhattan.herokuapp.com/gun',
  'https://gun-us.herokuapp.com/gun',
  'https://gunjs.herokuapp.com/gun'
]);

const messages = gun.get('livechat-messages-v2');
const presence = gun.get('livechat-presence-v2');
const typing   = gun.get('livechat-typing-v2');
const meta     = gun.get('livechat-meta-v2');

// ── State ─────────────────────────────────────────────────────────────────────
let userName    = '';
let userColor   = '';
let userKey     = '';
let typingTimer = null;
let seenIds     = new Set();
let onlineUsers = {};
let clearEpoch  = 0;
let autoRefresh = true;
let refreshInterval = null;

const COLORS = [
  '#6c63ff','#a78bfa','#34d399','#f59e0b',
  '#f87171','#38bdf8','#fb7185','#4ade80'
];

function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }
function uid()         { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(ts) {
  const d     = new Date(ts);
  const today = new Date();
  const time  = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === today.toDateString()
    ? time
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const joinScreen   = document.getElementById('join-screen');
const chatScreen   = document.getElementById('chat-screen');
const nameInput    = document.getElementById('name-input');
const joinBtn      = document.getElementById('join-btn');
const joinError    = document.getElementById('join-error');
const messagesEl   = document.getElementById('messages');
const msgForm      = document.getElementById('msg-form');
const msgInput     = document.getElementById('msg-input');
const leaveBtn     = document.getElementById('leave-btn');
const clearBtn     = document.getElementById('clear-btn');
const refreshBtn   = document.getElementById('refresh-btn');
const onlineNum    = document.getElementById('online-num');
const typingText   = document.getElementById('typing-text');
const confirmModal = document.getElementById('confirm-modal');
const confirmYes   = document.getElementById('confirm-yes');
const confirmNo    = document.getElementById('confirm-no');
const connStatus   = document.getElementById('conn-status');

// ── Join ──────────────────────────────────────────────────────────────────────
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinChat(); });
joinBtn.addEventListener('click', joinChat);

function joinChat() {
  const name = nameInput.value.trim();
  if (!name)           { joinError.textContent = 'Please enter your name.'; return; }
  if (name.length < 2) { joinError.textContent = 'Name must be at least 2 characters.'; return; }

  userName  = escapeHtml(name);
  userColor = randomColor();
  userKey   = uid();

  joinScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  msgInput.focus();

  setupPresence();
  listenClearEpoch();
  listenTyping();
  listenOnlineCount();
  startAutoRefresh();
  updateConnStatus(true);
}

// ── Leave ─────────────────────────────────────────────────────────────────────
leaveBtn.addEventListener('click', leaveChat);
window.addEventListener('beforeunload', leaveChat);

function leaveChat() {
  if (!userName) return;
  sendSystemMessage(userName + ' left the chat');
  presence.get(userKey).put(null);
  typing.get(userKey).put(null);
  stopAutoRefresh();
  userName = '';
  chatScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');
  messagesEl.innerHTML = '';
  nameInput.value = '';
}

// ── Connection status dot ─────────────────────────────────────────────────────
function updateConnStatus(online) {
  connStatus.classList.toggle('conn-online',  online);
  connStatus.classList.toggle('conn-offline', !online);
  connStatus.title = online ? 'Connected' : 'Reconnecting...';
}

// Detect connection drops
gun.on('hi',  () => updateConnStatus(true));
gun.on('bye', () => updateConnStatus(false));

// ── Auto-refresh ──────────────────────────────────────────────────────────────
function startAutoRefresh() {
  refreshInterval = setInterval(() => {
    if (autoRefresh) refreshMessages();
  }, 5000); // check every 5 seconds
}

function stopAutoRefresh() {
  clearInterval(refreshInterval);
}

// Manual refresh button — toggles auto-refresh on/off
refreshBtn.addEventListener('click', () => {
  autoRefresh = !autoRefresh;
  refreshBtn.title      = autoRefresh ? 'Auto-refresh ON (click to pause)' : 'Auto-refresh OFF (click to resume)';
  refreshBtn.style.opacity = autoRefresh ? '1' : '0.4';
  if (autoRefresh) refreshMessages(); // immediate refresh when re-enabled
});

function refreshMessages() {
  // Re-subscribe to any new messages gun may have missed
  messages.map().once((msg, id) => {
    if (!msg || !msg.ts || seenIds.has(id)) return;
    if (msg.ts <= clearEpoch) return;
    seenIds.add(id);
    renderMessage(msg);
  });
}

// ── Presence ──────────────────────────────────────────────────────────────────
function setupPresence() {
  presence.get(userKey).put({ name: userName, ts: Date.now() });
  setInterval(() => {
    if (userName) presence.get(userKey).put({ name: userName, ts: Date.now() });
  }, 20000);
}

function listenOnlineCount() {
  presence.map().on((data, key) => {
    if (!data || !data.name || Date.now() - data.ts > 60000) {
      delete onlineUsers[key];
    } else {
      onlineUsers[key] = data.name;
    }
    onlineNum.textContent = Math.max(1, Object.keys(onlineUsers).length);
  });
}

// ── Clear epoch ───────────────────────────────────────────────────────────────
function listenClearEpoch() {
  meta.get('clearEpoch').on(val => {
    const newEpoch = val || 0;
    if (newEpoch > clearEpoch) {
      clearEpoch = newEpoch;
      messagesEl.innerHTML = '';
      seenIds = new Set();
    }
    listenMessages();
    sendSystemMessage(userName + ' joined the chat');
  });
}

// ── Messages ──────────────────────────────────────────────────────────────────
function listenMessages() {
  // Load ALL history then listen for new ones in real time
  messages.map().on((msg, id) => {
    if (!msg || !msg.ts || seenIds.has(id)) return;
    if (msg.ts <= clearEpoch) return;
    seenIds.add(id);
    renderMessage(msg);
  });
}

function renderMessage(msg) {
  if (msg.type === 'system') {
    const el = document.createElement('div');
    el.className = 'msg-system';
    el.textContent = msg.text;
    messagesEl.appendChild(el);
  } else {
    const isMe = msg.name === userName;
    const row  = document.createElement('div');
    row.className = 'msg-row ' + (isMe ? 'me' : 'other');
    row.innerHTML =
      (!isMe ? '<div class="msg-name" style="color:' + msg.color + '">' + escapeHtml(msg.name) + '</div>' : '') +
      '<div class="msg-bubble">' + escapeHtml(msg.text) + '</div>' +
      '<div class="msg-time">' + formatTime(msg.ts) + '</div>';
    messagesEl.appendChild(row);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function sendSystemMessage(text) {
  messages.get(uid()).put({ type: 'system', text, ts: Date.now() });
}

// ── Send message ──────────────────────────────────────────────────────────────
msgForm.addEventListener('submit', e => {
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text || !userName) return;
  messages.get(uid()).put({
    type: 'user', name: userName, color: userColor, text, ts: Date.now()
  });
  msgInput.value = '';
  clearTypingIndicator();
});

// ── Clear history ─────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => confirmModal.classList.remove('hidden'));
confirmNo.addEventListener('click',  () => confirmModal.classList.add('hidden'));

confirmYes.addEventListener('click', () => {
  confirmModal.classList.add('hidden');
  const epoch = Date.now();
  meta.get('clearEpoch').put(epoch);
  clearEpoch = epoch;
  messagesEl.innerHTML = '';
  seenIds = new Set();
  sendSystemMessage(userName + ' cleared the chat history');
});

// ── Typing indicator ──────────────────────────────────────────────────────────
msgInput.addEventListener('input', () => {
  if (!userName) return;
  typing.get(userKey).put({ name: userName, ts: Date.now() });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(clearTypingIndicator, 3000);
});

function clearTypingIndicator() {
  if (userName) typing.get(userKey).put(null);
  clearTimeout(typingTimer);
}

function listenTyping() {
  typing.map().on(() => {
    const typers = [];
    typing.map().once((d, k) => {
      if (d && d.name && k !== userKey && Date.now() - d.ts < 4000) typers.push(d.name);
    });
    if (typers.length === 0)      typingText.textContent = '';
    else if (typers.length === 1) typingText.textContent = typers[0] + ' is typing...';
    else                          typingText.textContent = typers.join(', ') + ' are typing...';
  });
}
