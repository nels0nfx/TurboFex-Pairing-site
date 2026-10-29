const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');
const { newId, normalizeId, makeStore } = require('../store');

const CREDS = { registered: true, me: { id: '2348012345678:5@s.whatsapp.net' }, noiseKey: { private: 'x' } };

// stand-in for WhatsApp: gives a code, then "links"
function fakeEngine(behaviour = 'ok') {
  return {
    start(number, hooks, opts = {}) {
      setTimeout(() => {
        if (behaviour === 'refuse') return hooks.onFail('WhatsApp refused the pairing code (400 bad-request).');
        if (opts.method === 'qr') hooks.onQr('2@' + 'x'.repeat(60) + ',' + 'A'.repeat(43) + '=,' + 'B'.repeat(43) + '=,' + 'C'.repeat(43) + '=,1');
        else hooks.onCode('ABCD-EFGH');
        setTimeout(() => {
          hooks.onPairing();
          setTimeout(() => hooks.onLinked(CREDS), 20);
        }, 20);
      }, 10);
      return { cancel() {} };
    },
  };
}

async function boot(env = {}, behaviour) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pairsite-test-'));
  const app = createApp({ engine: fakeEngine(behaviour), dataDir, env: { PAIR_LIMIT: '50', ...env } });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return { app, base, close: () => { app.close(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const until = async (fn, ms = 2000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } throw new Error('timeout'); };

test('session IDs: format, normalising, uniqueness', () => {
  const id = newId();
  assert.match(id, /^TFX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.strictEqual(normalizeId(id.toLowerCase().replace(/-/g, ' ')), id);
  assert.strictEqual(normalizeId('TFX-0000-1111-IIII'), null);
  assert.strictEqual(normalizeId('nope'), null);
  assert.notStrictEqual(newId(), newId());
});

test('store: encrypted on disk, one-time, expiry, wrong secret', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
  const st = makeStore({ dir, secret: 's1', ttlMs: 60000, oneTime: true });
  const id = st.put(CREDS);
  const raw = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
  assert.ok(!raw.includes('2348012345678') && !raw.includes(id), 'nothing readable on disk');
  assert.deepStrictEqual(makeStore({ dir, secret: 'other' }).take(id), null);
  assert.deepStrictEqual(st.take(id), CREDS);
  assert.strictEqual(st.take(id), null, 'second use fails');
  const short = makeStore({ dir, secret: 's1', ttlMs: -1 });
  assert.strictEqual(short.take(short.put(CREDS)), null, 'expired');
  const keep = makeStore({ dir, secret: 's1', oneTime: false });
  const k = keep.put(CREDS);
  assert.deepStrictEqual(keep.take(k), CREDS);
  assert.deepStrictEqual(keep.take(k), CREDS);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('full flow: number -> code -> linked -> session ID -> bot download (once)', async () => {
  const s = await boot();
  const r = await post(`${s.base}/api/pair`, { number: '+234 801 234 5678' });
  assert.strictEqual(r.status, 200);
  const { job } = await r.json();
  const code = await until(async () => { const j = await (await fetch(`${s.base}/api/job/${job}`)).json(); return j.state === 'code' || j.state === 'linking' ? j : null; });
  assert.strictEqual(code.code, 'ABCD-EFGH');
  assert.strictEqual(code.sessionId, null);
  const done = await until(async () => { const j = await (await fetch(`${s.base}/api/job/${job}`)).json(); return j.state === 'linked' ? j : null; });
  assert.match(done.sessionId, /^TFX-/);
  const got = await fetch(`${s.base}/api/session/${done.sessionId}`);
  assert.strictEqual(got.status, 200);
  assert.deepStrictEqual(await got.json(), CREDS);
  assert.strictEqual((await fetch(`${s.base}/api/session/${done.sessionId}`)).status, 404, 'used once');
  s.close();
});

test('refusal from WhatsApp is shown, bad input is rejected', async () => {
  const s = await boot({}, 'refuse');
  assert.strictEqual((await post(`${s.base}/api/pair`, { number: '123' })).status, 400);
  assert.strictEqual((await post(`${s.base}/api/pair`, { number: '08012345678' })).status, 400, 'leading 0');
  const { job } = await (await post(`${s.base}/api/pair`, { number: '2348012345678' })).json();
  const j = await until(async () => { const x = await (await fetch(`${s.base}/api/job/${job}`)).json(); return x.state === 'failed' ? x : null; });
  assert.match(j.error, /refused/);
  assert.strictEqual((await fetch(`${s.base}/api/job/doesnotexist`)).status, 404);
  assert.strictEqual((await fetch(`${s.base}/api/session/not-an-id`)).status, 400);
  s.close();
});

test('rate limit; a new attempt for the same number replaces the old one', async () => {
  const s = await boot({ PAIR_LIMIT: '3' });
  const first = await (await post(`${s.base}/api/pair`, { number: '2348011111111' })).json();
  const second = await post(`${s.base}/api/pair`, { number: '2348011111111' });
  assert.strictEqual(second.status, 200, 'not blocked');
  const old = await (await fetch(`${s.base}/api/job/${first.job}`)).json();
  assert.strictEqual(old.state, 'failed');
  assert.strictEqual((await post(`${s.base}/api/pair`, { number: '2348022222222' })).status, 200);
  assert.strictEqual((await post(`${s.base}/api/pair`, { number: '2348033333333' })).status, 429);
  s.close();
});

test('QR mode: no number needed, a scannable QR picture is served, then linked', async () => {
  const s = await boot();
  const r = await post(`${s.base}/api/pair`, { method: 'qr' });
  assert.strictEqual(r.status, 200);
  const { job } = await r.json();
  const j = await until(async () => { const x = await (await fetch(`${s.base}/api/job/${job}`)).json(); return x.state === 'qr' ? x : null; });
  assert.strictEqual(j.method, 'qr');
  assert.match(j.qr, /^data:image\/svg\+xml;base64,/);
  assert.match(Buffer.from(j.qr.split(',')[1], 'base64').toString(), /<svg[^>]*viewBox/);
  const done = await until(async () => { const x = await (await fetch(`${s.base}/api/job/${job}`)).json(); return x.state === 'linked' ? x : null; });
  assert.match(done.sessionId, /^TFX-/);
  assert.strictEqual(done.qr, null);
  assert.deepStrictEqual(await (await fetch(`${s.base}/api/session/${done.sessionId}`)).json(), CREDS);
  s.close();
});

test('page and assets are served with safe headers', async () => {
  const s = await boot();
  const r = await fetch(s.base + '/');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await r.text(), /<title>TurboFex Pair<\/title>/);
  const js = await fetch(s.base + '/app.js');
  assert.strictEqual(js.status, 200);
  assert.match(await js.text(), /api\/pair/);
  assert.strictEqual((await fetch(s.base + '/logo.png')).headers.get('content-type'), 'image/png');
  assert.strictEqual((await fetch(s.base + '/..%2fserver.js')).status, 404);
  assert.strictEqual((await fetch(s.base + '/server.js')).status, 404);
  s.close();
});
