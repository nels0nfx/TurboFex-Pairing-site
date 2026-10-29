const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const engine = require('../engine');

// A stand-in for the WhatsApp library. `script(sock, state)` plays what WhatsApp would do on each connection.
function fakeLib(script) {
  const sockets = [];
  return {
    sockets,
    Browsers: { ubuntu: (b) => ['Ubuntu', b, '22.04'] },
    DisconnectReason: { restartRequired: 515 },
    jidNormalizedUser: (j) => String(j).replace(/:\d+@/, '@'),
    async useMultiFileAuthState(dir) {
      const state = { creds: { registered: false }, keys: {} };
      return { state, saveCreds: async () => fs.writeFileSync(path.join(dir, 'creds.json'), JSON.stringify(state.creds)) };
    },
    makeWASocket({ auth }) {
      const sock = { ev: new EventEmitter(), ws: new EventEmitter(), authState: auth, sent: [], ended: false, user: null };
      sock.requestPairingCode = async () => 'ABCDEFGH';
      sock.sendMessage = async (jid, msg) => sock.sent.push({ jid, msg });
      sock.end = () => { sock.ended = true; };
      sockets.push(sock);
      setTimeout(() => script(sock, auth, sockets.length), 5);
      return sock;
    },
  };
}
const up = (s, u) => s.ev.emit('connection.update', u);
const until = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 10)); } throw new Error('timeout'); };
const quiet = () => { const o = console.log; console.log = () => {}; return () => { console.log = o; }; };

test('QR flow: library never sets "registered", we still finish, message the person, and hand over a registered login', async () => {
  const lib = fakeLib((sock, auth, n) => {
    if (n === 1) {
      up(sock, { qr: '2@first,a,b,c,1' });
      setTimeout(() => {
        auth.creds.me = { id: '2348012345678:7@s.whatsapp.net', name: 'x' }; // pair-success sets me, NOT registered
        sock.ev.emit('creds.update', {});
        up(sock, { isNewLogin: true, qr: undefined });
        up(sock, { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } });
      }, 20);
    } else {
      sock.user = { id: '2348012345678:7@s.whatsapp.net' };
      up(sock, { connection: 'open' });
    }
  });
  const seen = { qrs: [], pairing: 0, linked: null, fail: null };
  const restore = quiet();
  engine.start('', { onQr: (q) => seen.qrs.push(q), onPairing: () => seen.pairing++, onLinked: (c) => { seen.linked = c; return 'TFX-TEST'; }, onFail: (m) => (seen.fail = m) }, { method: 'qr', lib, fast: true, logger: {} });
  await until(() => seen.linked || seen.fail);
  restore();
  assert.strictEqual(seen.fail, null);
  assert.deepStrictEqual(seen.qrs.length >= 1, true);
  assert.strictEqual(seen.pairing, 1);
  assert.strictEqual(seen.linked.registered, true);
  assert.strictEqual(seen.linked.me.id, '2348012345678:7@s.whatsapp.net');
  await until(() => lib.sockets[1].sent.length);
  assert.strictEqual(lib.sockets[1].sent[0].jid, '2348012345678@s.whatsapp.net');
  assert.strictEqual(lib.sockets[1].sent[0].msg.text, 'TFX-TEST');
});

test('code flow: shows the code, finishes after the restart, and messages the person', async () => {
  const lib = fakeLib((sock, auth, n) => {
    if (n === 1) {
      up(sock, { qr: '2@x' });
      setTimeout(() => {
        auth.creds.registered = true;
        auth.creds.me = { id: '2348099999999:3@s.whatsapp.net' };
        sock.ev.emit('creds.update', {});
        up(sock, { isNewLogin: true });
        up(sock, { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } });
      }, 60);
    } else {
      sock.user = { id: '2348099999999:3@s.whatsapp.net' };
      up(sock, { connection: 'open' });
    }
  });
  const seen = { code: null, linked: null, fail: null };
  const restore = quiet();
  engine.start('2348099999999', { onCode: (c) => (seen.code = c), onPairing() {}, onLinked: () => 'hello', onFail: (m) => (seen.fail = m) }, { method: 'code', lib, fast: true, logger: {} });
  await until(() => seen.linked === null && seen.code && lib.sockets[1] && lib.sockets[1].sent.length);
  restore();
  assert.strictEqual(seen.code, 'ABCD-EFGH');
  assert.strictEqual(seen.fail, null);
});

test('if WhatsApp never reopens the connection, the fallback still delivers the login', async () => {
  const lib = fakeLib((sock, auth) => {
    sock.user = { id: '2348011112222:1@s.whatsapp.net' };
    up(sock, { qr: '2@x' });
    setTimeout(() => {
      auth.creds.me = { id: '2348011112222:1@s.whatsapp.net' };
      sock.ev.emit('creds.update', {});
      up(sock, { isNewLogin: true });
    }, 20);
  });
  const seen = { linked: null, fail: null };
  const realSet = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => realSet(fn, ms === 25000 ? 50 : ms, ...a); // do not wait 25 real seconds
  const restore = quiet();
  try {
    engine.start('', { onQr() {}, onPairing() {}, onLinked: (c) => { seen.linked = c; return 'x'; }, onFail: (m) => (seen.fail = m) }, { method: 'qr', lib, fast: true, logger: {} });
    await until(() => seen.linked || seen.fail);
  } finally {
    global.setTimeout = realSet;
    restore();
  }
  assert.strictEqual(seen.fail, null);
  assert.strictEqual(seen.linked.registered, true);
});

test('a refused pairing code is reported', async () => {
  const lib = fakeLib((sock) => {
    sock.requestPairingCode = async () => { sock.ws.emit('CB:iq,type:error', { content: [{ tag: 'error', attrs: { code: '400', text: 'bad-request' } }] }); return 'ABCDEFGH'; };
    up(sock, { qr: '2@x' });
  });
  let fail = null;
  const restore = quiet();
  engine.start('2348011112222', { onCode() {}, onFail: (m) => (fail = m) }, { method: 'code', lib, fast: true, logger: {} });
  await until(() => fail);
  restore();
  assert.match(fail, /refused/);
});
