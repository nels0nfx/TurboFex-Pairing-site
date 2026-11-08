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
  assert.match(fail, /did not accept/);
  assert.ok(!/400|bad-request/.test(fail), 'no internal WhatsApp error text is shown');
});

test('connection failure while asking for the code: a plain message, no internal error text', async () => {
  const lib = fakeLib((sock) => {
    sock.requestPairingCode = async () => { throw new Error('Connection Closed at Baileys/lib/Socket/socket.js:123'); };
    up(sock, { qr: '2@x' });
  });
  let fail = null, code = null;
  const restore = quiet();
  engine.start('2348011112222', { onCode: (c) => (code = c), onFail: (m) => (fail = m) }, { method: 'code', lib, fast: true, logger: {} });
  await until(() => fail);
  restore();
  assert.strictEqual(code, null, 'no code is shown');
  assert.match(fail, /Could not get a pairing code/);
  assert.ok(!/Baileys|socket\.js|Connection Closed/.test(fail));
});

test('VERIFY_WHATSAPP: a number WhatsApp says has no account stops before any code; "could not check" does not block', async () => {
  const mk = (answer) => fakeLib((sock) => { sock.onWhatsApp = async () => answer(); up(sock, { qr: '2@x' }); });
  let fail = null, code = null;
  let restore = quiet();
  engine.start('2348011112222', { onCode: (c) => (code = c), onFail: (m) => (fail = m) }, { method: 'code', verify: true, lib: mk(() => [{ exists: false, jid: 'x' }]), fast: true, logger: {} });
  await until(() => fail || code); restore();
  assert.strictEqual(code, null); assert.match(fail, /not registered on WhatsApp/);
  fail = null; code = null; restore = quiet();
  engine.start('2348011112222', { onCode: (c) => (code = c), onFail: (m) => (fail = m) }, { method: 'code', verify: true, lib: mk(() => { throw new Error('not-authorized'); }), fast: true, logger: {} });
  await until(() => fail || code); restore();
  assert.strictEqual(fail, null, 'a failed check is not treated as "no account"'); assert.ok(code);
  fail = null; code = null; restore = quiet();
  engine.start('2348011112222', { onCode: (c) => (code = c), onFail: (m) => (fail = m) }, { method: 'code', lib: mk(() => [{ exists: false }]), fast: true, logger: {} });
  await until(() => fail || code); restore();
  assert.ok(code && !fail, 'without VERIFY_WHATSAPP the check is not made');
});

test('custom pairing code: TFX + 5 random characters is asked for first; the shown code is what the library returned', async () => {
  const asked = [];
  const lib = fakeLib((sock) => {
    sock.requestPairingCode = async (n, c) => { asked.push(c); return c || 'ABCDEFGH'; };
    up(sock, { qr: '2@x' });
  });
  let code = null, fail = null;
  const restore = quiet();
  engine.start('2348011112222', { onCode: (c) => (code = c), onFail: (m) => (fail = m) }, { method: 'code', lib, fast: true, logger: {} });
  await until(() => code || fail); restore();
  assert.strictEqual(fail, null);
  assert.match(asked[0], /^TFX[2-9A-HJKMNP-TV-Z]{5}$/);
  assert.strictEqual(code, asked[0].slice(0, 4) + '-' + asked[0].slice(4));
  const set = new Set(Array.from({ length: 200 }, () => engine.makeCustomCode()));
  assert.ok(set.size > 190, 'the 5 characters are random');
});

test('custom pairing code: the library throws or WhatsApp refuses it -> one normal code is asked for, the visitor sees no error', async () => {
  for (const mode of ['throws', 'refused']) {
    const asked = [];
    const lib = fakeLib((sock) => {
      sock.requestPairingCode = async (n, c) => {
        asked.push(c);
        if (c && mode === 'throws') throw new Error('Custom pairing code must be 8 characters');
        if (c && mode === 'refused') sock.ws.emit('CB:iq,type:error', { content: [{ tag: 'error', attrs: { code: '400', text: 'bad-request' } }] });
        return c ? 'WXYZ1234' : 'NORMAL12';
      };
      up(sock, { qr: '2@x' });
    });
    let code = null, fail = null;
    const restore = quiet();
    engine.start('2348011112222', { onCode: (c) => (code = c), onFail: (m) => (fail = m) }, { method: 'code', lib, fast: true, logger: {} });
    await until(() => code || fail, 6000); restore();
    assert.strictEqual(fail, null, mode);
    assert.strictEqual(code, 'NORM-AL12', mode);
    assert.strictEqual(asked.length, 2, mode);
    assert.strictEqual(asked[1], undefined, 'the second request is a normal one');
  }
});

test('custom pairing code can be switched off (customCode: false)', async () => {
  const asked = [];
  const lib = fakeLib((sock) => { sock.requestPairingCode = async (n, c) => { asked.push(c); return 'ABCDEFGH'; }; up(sock, { qr: '2@x' }); });
  let code = null;
  const restore = quiet();
  engine.start('2348011112222', { onCode: (c) => (code = c), onFail() {} }, { method: 'code', customCode: false, lib, fast: true, logger: {} });
  await until(() => code); restore();
  assert.deepStrictEqual(asked, [undefined]);
});

test('pickBrowser: unchanged unless PAIR_BROWSER=android, and guarded', () => {
  const { pickBrowser } = require('../engine');
  const B = { ubuntu: (b) => ['Ubuntu', b, '22.04'], android: (v) => ['Android', 'Chrome', v] };
  assert.deepStrictEqual(pickBrowser(B, {}), ['Ubuntu', 'Chrome', '22.04']);
  assert.deepStrictEqual(pickBrowser(B, { PAIR_BROWSER: 'web' }), ['Ubuntu', 'Chrome', '22.04']);
  assert.deepStrictEqual(pickBrowser(B, { PAIR_BROWSER: 'android' }), ['Android', 'Chrome', '13']);
  assert.deepStrictEqual(pickBrowser(B, { PAIR_BROWSER: ' ANDROID'.trim() }), ['Android', 'Chrome', '13']);
  assert.deepStrictEqual(pickBrowser({ ubuntu: B.ubuntu }, { PAIR_BROWSER: 'android' }), ['Ubuntu', 'Chrome', '22.04'], 'falls back (with a log line) when the library has no android identity');
});
