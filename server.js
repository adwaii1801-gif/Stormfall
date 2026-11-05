// Stormfall Royale game server.
// Serves the game page and relays each player's state to everyone in their lobby.
// No dependencies: plain Node.js 18 or newer. Run with `node server.js`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const MAX_PER_ROOM = 16;
const MAX_MESSAGE = 16 * 1024;
const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(html);
  } else if (url === '/health') {
    res.end('ok');
  } else {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
});

// ---------- minimal WebSocket (RFC 6455) ----------
function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

class Socket {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.open = true; this.alive = true;
    this.onmessage = () => {}; this.onclose = () => {};
    sock.on('data', d => this._data(d));
    sock.on('close', () => this._closed());
    sock.on('error', () => this._closed());
  }
  send(text) { if (this.open && this.sock.writableLength < 512 * 1024) this.sock.write(frame(1, Buffer.from(text))); }
  ping() { if (this.open) this.sock.write(frame(9, Buffer.alloc(0))); }
  close() { if (this.open) { try { this.sock.write(frame(8, Buffer.alloc(0))); } catch (e) {} this.sock.end(); } this._closed(); }
  _closed() { if (!this.open) return; this.open = false; this.sock.destroy(); this.onclose(); }
  _data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1], op = b0 & 0x0f, masked = b1 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; const big = this.buf.readBigUInt64BE(2); if (big > BigInt(MAX_MESSAGE)) return this.close(); len = Number(big); off = 10; }
      if (!masked || len > MAX_MESSAGE || !(b0 & 0x80)) return this.close();   // browsers always mask; we don't accept fragments
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4), data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 1) this.onmessage(data.toString('utf8'));
      else if (op === 8) return this.close();
      else if (op === 9) this.sock.write(frame(10, data));
      else if (op === 10) this.alive = true;
    }
  }
}

// ---------- lobbies ----------
const rooms = new Map();
let counter = 0;

server.on('upgrade', (req, sock) => {
  const u = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (u.pathname !== '/ws' || !key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  const ws = new Socket(sock);

  const name = (u.searchParams.get('room') || 'main').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'main';
  if (!rooms.has(name)) rooms.set(name, new Map());
  const room = rooms.get(name);
  if (room.size >= MAX_PER_ROOM) { ws.close(); if (!room.size) rooms.delete(name); return; }

  // ids sort by join order, so the earliest player in a lobby becomes host
  const id = Date.now().toString(36).padStart(9, '0') + (counter++ % 1679616).toString(36).padStart(4, '0');
  const client = { ws, pr: {} };
  room.set(id, client);
  ws.send(JSON.stringify({ t: 'hello', id }));

  ws.onmessage = text => {
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    if (m && m.t === 'p' && m.p && typeof m.p === 'object' && !Array.isArray(m.p) && text.length <= 4200) client.pr = m.p;
  };
  ws.onclose = () => { room.delete(id); if (!room.size) rooms.delete(name); };
});

// 20 snapshots a second to everyone in each lobby
setInterval(() => {
  for (const room of rooms.values()) {
    const msg = JSON.stringify({ t: 's', peers: [...room].map(([id, c]) => [id, c.pr]) });
    for (const c of room.values()) c.ws.send(msg);
  }
}, 50);

// drop players whose connection died without closing
setInterval(() => {
  for (const room of rooms.values()) for (const c of room.values()) {
    if (!c.ws.alive) { c.ws.close(); continue; }
    c.ws.alive = false; c.ws.ping();
  }
}, 15000);

server.listen(PORT, () => console.log(`Stormfall Royale running on http://localhost:${PORT}`));
