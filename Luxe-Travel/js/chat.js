'use strict';

// ── Config ─────────────────────────────────────────────────────────────────
const BROKER  = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC   = 'livechat/public/v6/';
const T_MSG   = TOPIC + 'msg';
const T_CLEAR = TOPIC + 'clear';
const T_TYPE  = TOPIC + 'typing';
const T_PRES  = TOPIC + 'presence';
const LS_HIST = 'lc_history_v6';
const LS_EPOCH= 'lc_epoch_v6';

// ── State ──────────────────────────────────────────────────────────────────
let mqttClient     = null;
let chatUsername   = '';
let userColor      = '';
let userKey        = '';
let clearEpoch     = 0;
let heartbeatTimer = null;
let typTimer       = null;
let isFloatingOpen = false;
const seenIds      = new Set();
const onlineMap    = {};
const typMap       = {};

const COLORS   = ['#6c63ff','#a78bfa','#34d399','#f59e0b','#f87171','#38bdf8','#fb7185','#4ade80'];
const pickColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
const makeId    = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowMs     = () => Date.now();

function esc(s) {
    return String(s || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtTime(ts) {
    const d = new Date(ts);
    const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString()
        ? t
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + t;
}

// ── MQTT ───────────────────────────────────────────────────────────────────
function connectMQTT() {
    if (typeof mqtt === 'undefined') return;

    const brokers = [
        'wss://broker.emqx.io:8084/mqtt',
        'wss://broker.hivemq.com:8884/mqtt',
        'wss://test.mosquitto.org:8081/mqtt'
    ];
    let brokerIndex = 0;

    function tryConnect() {
        if (brokerIndex >= brokers.length) {
            setTimeout(() => { brokerIndex = 0; tryConnect(); }, 5000);
            return;
        }
        mqttClient = mqtt.connect(brokers[brokerIndex], {
            clientId: 'arlux_' + makeId(),
            clean: true,
            reconnectPeriod: 0,
            connectTimeout: 8000
        });

        mqttClient.on('connect', () => {
            setConnStatus(true);
            mqttClient.subscribe([T_MSG, T_CLEAR, T_TYPE, T_PRES], err => {
                if (!err) {
                    publish(T_MSG,  { type: 'system', text: chatUsername + ' joined the chat', ts: nowMs() });
                    publish(T_PRES, { key: userKey, name: chatUsername, ts: nowMs() });
                    setTimeout(() => publish(T_PRES, { key: userKey, name: chatUsername, ts: nowMs() }), 1000);
                    startHeartbeat();
                }
            });
        });

        mqttClient.on('error', () => { mqttClient.end(true); brokerIndex++; setTimeout(tryConnect, 1000); });
        mqttClient.on('close', () => { if (chatUsername) { setConnStatus(false); setTimeout(() => { brokerIndex = 0; tryConnect(); }, 3000); } });
        mqttClient.on('reconnect', () => setConnStatus(false));
        mqttClient.on('offline',   () => setConnStatus(false));

        mqttClient.on('message', (topic, raw) => {
            try {
                const data = JSON.parse(raw.toString());
                if (topic === T_MSG)   handleMsg(data);
                if (topic === T_CLEAR) handleClear(data);
                if (topic === T_TYPE)  handleTyping(data);
                if (topic === T_PRES)  handlePresence(data);
            } catch (_) {}
        });
    }
    tryConnect();
}

function publish(topic, data) {
    if (mqttClient && mqttClient.connected) {
        mqttClient.publish(topic, JSON.stringify(data));
    }
}

function setConnStatus(ok) {
    const dot = document.getElementById('chatConnDot');
    if (dot) { dot.className = ok ? 'chat-conn-dot online' : 'chat-conn-dot offline'; dot.title = ok ? 'Connected' : 'Reconnecting...'; }
}

// ── History ────────────────────────────────────────────────────────────────
function getHistory() {
    try { return JSON.parse(localStorage.getItem(LS_HIST) || '[]'); } catch (_) { return []; }
}
function saveHistory(arr) {
    try { localStorage.setItem(LS_HIST, JSON.stringify(arr)); } catch (_) {}
}
function addToHistory(msg) {
    const h = getHistory();
    const key = String(msg.ts) + '|' + String(msg.name || '') + '|' + String(msg.text || '');
    if (h.some(m => String(m.ts)+'|'+String(m.name||'')+'|'+String(m.text||'') === key)) return;
    h.push(msg);
    saveHistory(h);
}
function renderHistory(container) {
    const h = getHistory().filter(m => m.ts > clearEpoch);
    h.sort((a, b) => a.ts - b.ts);
    h.forEach(m => renderMsg(m, false, container));
}

// ── Messages ───────────────────────────────────────────────────────────────
function handleMsg(msg) {
    if (!msg || !msg.ts) return;
    if (msg.ts <= clearEpoch) return;
    const dedupKey = String(msg.ts) + '|' + String(msg.name || '') + '|' + String(msg.text || '');
    if (seenIds.has(dedupKey)) return;
    seenIds.add(dedupKey);
    renderMsg(msg, true, document.getElementById('chatMessages'));
    renderMsg(msg, true, document.getElementById('floatingChatMessages'));
    if (msg.type === 'user') addToHistory(msg);
    updateChatBadge();
}

function renderMsg(msg, animate, container) {
    if (!container) return;
    if (msg.type === 'system') {
        const el = document.createElement('div');
        el.className = 'chat-system-message';
        el.textContent = msg.text;
        container.appendChild(el);
    } else {
        const isMe = msg.name === chatUsername;
        const div = document.createElement('div');
        div.className = 'chat-message' + (isMe ? ' own' : '') + (animate ? ' pop' : '');
        div.innerHTML = `
            <div class="chat-message-header">
                <span class="chat-username" style="color:${msg.color || '#a78bfa'}">${esc(msg.name)}</span>
                <span class="chat-time">${fmtTime(msg.ts)}</span>
            </div>
            <div class="chat-message-text">${esc(msg.text)}</div>
        `;
        container.appendChild(div);
    }
    container.scrollTop = container.scrollHeight;
}

function sendChatMessage(inputId, containerId) {
    const input = document.getElementById(inputId);
    const text = input.value.trim();
    if (!text || !chatUsername) return;
    input.value = '';

    const msg = { type: 'user', name: chatUsername, color: userColor, text, ts: nowMs() };
    const dedupKey = String(msg.ts) + '|' + msg.name + '|' + msg.text;
    seenIds.add(dedupKey);

    publish(T_MSG, msg);
    renderMsg(msg, true, document.getElementById('chatMessages'));
    renderMsg(msg, true, document.getElementById('floatingChatMessages'));
    addToHistory(msg);
    doStopTyping();
}

// ── Clear ──────────────────────────────────────────────────────────────────
function handleClear(data) {
    if (!data || !data.epoch || data.epoch <= clearEpoch) return;
    applyClear(data.epoch, data.by);
}

function applyClear(epoch, by) {
    clearEpoch = epoch;
    localStorage.setItem(LS_EPOCH, String(epoch));
    saveHistory([]);
    seenIds.clear();
    ['chatMessages', 'floatingChatMessages'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.innerHTML = ''; const d = document.createElement('div'); d.className = 'chat-system-message'; d.textContent = (by || 'Someone') + ' cleared the chat history'; el.appendChild(d); }
    });
}

// ── Heartbeat ──────────────────────────────────────────────────────────────
function startHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
        if (!chatUsername) return;
        publish(T_PRES, { key: userKey, name: chatUsername, ts: nowMs() });
        updateOnlineCount();
    }, 10000);
}

// ── Presence ───────────────────────────────────────────────────────────────
function handlePresence(data) {
    if (!data || !data.key) return;
    if (!data.ts || nowMs() - data.ts > 90000) delete onlineMap[data.key];
    else onlineMap[data.key] = { name: data.name, ts: data.ts };
    updateOnlineCount();
}

function updateOnlineCount() {
    Object.keys(onlineMap).forEach(k => { if (nowMs() - onlineMap[k].ts > 90000) delete onlineMap[k]; });
    const count = 1 + Object.keys(onlineMap).filter(k => k !== userKey).length;
    const el = document.getElementById('chatOnlineCount');
    if (el) el.textContent = '🟢 ' + count + ' online';
}

// ── Typing ─────────────────────────────────────────────────────────────────
function handleTyping(data) {
    if (!data || !data.key || data.key === userKey) return;
    if (!data.ts || nowMs() - data.ts > 4000) delete typMap[data.key];
    else typMap[data.key] = data.name;
    const typers = Object.values(typMap);
    ['chatTypingBar', 'floatingTypingBar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = typers.length === 0 ? '' : typers.length === 1 ? typers[0] + ' is typing...' : typers.join(', ') + ' are typing...';
    });
}

function doStopTyping() {
    if (chatUsername) publish(T_TYPE, { key: userKey, name: chatUsername, ts: 0 });
    clearTimeout(typTimer);
}

// ── Badge ──────────────────────────────────────────────────────────────────
function updateChatBadge() {
    if (!isFloatingOpen) {
        const badge = document.getElementById('chatBadge');
        if (badge) {
            const count = parseInt(badge.textContent || '0') + 1;
            badge.textContent = count;
            badge.style.display = 'flex';
        }
    }
}

// ── Username ───────────────────────────────────────────────────────────────
function promptUsername() {
    let name = localStorage.getItem('arlux-username');
    if (!name) {
        name = prompt('Enter your name to join chat:');
        if (!name || !name.trim()) name = 'User' + Math.floor(Math.random() * 9999);
        name = name.trim();
        localStorage.setItem('arlux-username', name);
    }
    return name;
}

function changeUsername() {
    const newName = prompt('Enter new username:', chatUsername);
    if (!newName || !newName.trim()) return;
    const oldName = chatUsername;
    chatUsername = newName.trim();
    localStorage.setItem('arlux-username', chatUsername);
    document.querySelectorAll('#currentUsername, #floatingUsername').forEach(el => el.textContent = chatUsername);
    publish(T_MSG, { type: 'system', text: oldName + ' is now ' + chatUsername, ts: nowMs() });
}

// ── Open / Close ───────────────────────────────────────────────────────────
function openChat() {
    if (!chatUsername) {
        chatUsername = promptUsername();
        userColor = pickColor();
        userKey   = makeId();
        clearEpoch = parseInt(localStorage.getItem(LS_EPOCH) || '0', 10);
        document.querySelectorAll('#currentUsername, #floatingUsername').forEach(el => el.textContent = chatUsername);
        renderHistory(document.getElementById('chatMessages'));
        connectMQTT();
    }
    document.getElementById('chatModal').style.display = 'flex';
}

function closeChat() {
    document.getElementById('chatModal').style.display = 'none';
}

function toggleFloatingChat() {
    isFloatingOpen = !isFloatingOpen;
    const win = document.getElementById('floatingChatWindow');
    if (isFloatingOpen) {
        if (!chatUsername) {
            chatUsername = promptUsername();
            userColor = pickColor();
            userKey   = makeId();
            clearEpoch = parseInt(localStorage.getItem(LS_EPOCH) || '0', 10);
            document.querySelectorAll('#currentUsername, #floatingUsername').forEach(el => el.textContent = chatUsername);
            renderHistory(document.getElementById('floatingChatMessages'));
            connectMQTT();
        }
        win.style.display = 'flex';
        const badge = document.getElementById('chatBadge');
        if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
    } else {
        win.style.display = 'none';
    }
}

// ── Init ───────────────────────────────────────────────────────────────────
function initChat() {
    document.getElementById('toggleChatBtn').addEventListener('click', openChat);
    document.getElementById('closeChatBtn').addEventListener('click', closeChat);
    document.getElementById('chatModalOverlay').addEventListener('click', closeChat);
    document.getElementById('changeUsernameBtn').addEventListener('click', changeUsername);
    document.getElementById('floatingChangeUsername').addEventListener('click', changeUsername);

    document.getElementById('sendMessageBtn').addEventListener('click', () => sendChatMessage('chatInput', 'chatMessages'));
    document.getElementById('chatInput').addEventListener('keypress', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage('chatInput', 'chatMessages'); }
    });
    document.getElementById('chatInput').addEventListener('input', () => {
        if (!chatUsername) return;
        publish(T_TYPE, { key: userKey, name: chatUsername, ts: nowMs() });
        clearTimeout(typTimer);
        typTimer = setTimeout(doStopTyping, 3000);
    });

    document.getElementById('floatingChatBtn').addEventListener('click', toggleFloatingChat);
    document.getElementById('minimizeChatBtn').addEventListener('click', toggleFloatingChat);
    document.getElementById('floatingSendBtn').addEventListener('click', () => sendChatMessage('floatingChatInput', 'floatingChatMessages'));
    document.getElementById('floatingChatInput').addEventListener('keypress', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage('floatingChatInput', 'floatingChatMessages'); }
    });
    document.getElementById('floatingChatInput').addEventListener('input', () => {
        if (!chatUsername) return;
        publish(T_TYPE, { key: userKey, name: chatUsername, ts: nowMs() });
        clearTimeout(typTimer);
        typTimer = setTimeout(doStopTyping, 3000);
    });

    window.addEventListener('beforeunload', () => {
        if (chatUsername && mqttClient) {
            publish(T_PRES, { key: userKey, name: chatUsername, ts: 0 });
            mqttClient.end(true);
        }
    });
}
