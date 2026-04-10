# 🌿 GreenEdge Landscaping — NFC Truck Tracking System

A full-stack landscaping website with real-time NFC-based truck tracking.

---

## Quick Start

1. Install [Node.js](https://nodejs.org) (v18+)
2. Double-click **`START.bat`**
3. Browser opens at `http://localhost:3000`

---

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Homepage | `/` | Services, hero, CTA |
| Truck Dashboard | `/dashboard.html` | Live truck count + log |
| Admin Panel | `/admin.html` | Manage trucks, manual log, analytics, NFC simulator |
| About & Contact | `/about.html` | Team, contact form |

---

## NFC Hardware Integration

The system exposes a single endpoint for NFC readers:

```
POST /api/nfc
Content-Type: application/json

{ "nfc_tag": "NFC-A1B2C3" }
```

**How it works:**
- NFC reader at the yard gate reads the truck's tag
- Reader POSTs the tag ID to `/api/nfc`
- System auto-detects entry vs exit (toggles based on last action)
- All connected dashboard browsers update in real-time via WebSocket (~1 second)

**Compatible NFC readers** (any that can make HTTP POST requests):
- ACR122U + Raspberry Pi bridge script
- Impinj readers with webhook support
- Any reader with a REST/HTTP output mode

**Example Raspberry Pi bridge (Python):**
```python
import nfc, requests

def on_connect(tag):
    tag_id = tag.identifier.hex().upper()
    requests.post("http://YOUR_SERVER_IP:3000/api/nfc", json={"nfc_tag": f"NFC-{tag_id}"})
    return True

with nfc.ContactlessFrontend('usb') as clf:
    while True:
        clf.connect(rdwr={'on-connect': on_connect})
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Current yard count + trucks in yard |
| GET | `/api/trucks` | List all trucks |
| POST | `/api/trucks` | Add truck `{name, nfc_tag, driver}` |
| PUT | `/api/trucks/:id` | Update truck |
| DELETE | `/api/trucks/:id` | Delete truck |
| POST | `/api/nfc` | NFC tap `{nfc_tag}` |
| POST | `/api/logs` | Manual log `{truck_id, action, note}` |
| GET | `/api/logs` | Last 200 log entries |

---

## Database

Uses **SQLite** (`landscaping.db`) — zero setup, zero cost, file-based.

Tables:
- `trucks` — id, nfc_tag, name, driver, created_at
- `logs` — id, truck_id, action (entry/exit), timestamp, note

---

## Deployment

**Option A — VPS (recommended):**
```bash
npm install -g pm2
pm2 start server.js --name greenedge
pm2 save
```

**Option B — Railway / Render:**
- Push to GitHub, connect repo, set start command to `node server.js`

**Environment Variables:**
```
PORT=3000   # default
```

---

## Security Notes

- All log entries are append-only (no edits, only new entries)
- NFC tag IDs are validated against the trucks table — unknown tags are rejected
- For production: add an `ADMIN_TOKEN` header check on `/api/trucks` and `/api/logs` POST routes
