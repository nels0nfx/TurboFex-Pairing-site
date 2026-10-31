const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');
const { newId, normalizeId, makeStore } = require('../store');
const { dmText } = require('../server');

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
          setTimeout(() => { try { const text = hooks.onLinked(CREDS); if (hooks.onDm) hooks.onDm(!!text); } catch (e) { /* the site is already shut down */ } }, 20);
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
  const after = await until(async () => { const x = await (await fetch(`${s.base}/api/job/${job}`)).json(); return x.dm !== null ? x : null; });
  assert.strictEqual(after.dm, true);
  assert.deepStrictEqual(await (await fetch(`${s.base}/api/session/${done.sessionId}`)).json(), CREDS);
  s.close();
});

test('page and assets are served with safe headers', async () => {
  const s = await boot();
  const r = await fetch(s.base + '/');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await r.text(), /<title>TurboFex Pair/);
  const js = await fetch(s.base + '/app.js');
  assert.strictEqual(js.status, 200);
  assert.match(await js.text(), /api\/pair/);
  assert.strictEqual((await fetch(s.base + '/logo-gold.png')).headers.get('content-type'), 'image/png');
  assert.strictEqual((await fetch(s.base + '/..%2fserver.js')).status, 404);
  assert.strictEqual((await fetch(s.base + '/server.js')).status, 404);
  s.close();
});

test('the WhatsApp message carries the session ID on its own line', () => {
  const t = dmText('TFX-ABCD-EFGH-JKLM');
  assert.match(t, /TurboFex linked/);
  assert.ok(t.includes('```TFX-ABCD-EFGH-JKLM```'));
  assert.match(t, /SESSION_ID/);
});

test('expiry: IDs last 5 minutes by default, are refused after that even before any clean-up, and survive a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttl-test-'));
  const st = makeStore({ dir, secret: 's1' });
  assert.strictEqual(st.ttlMs, 300000, 'default is exactly 5 minutes');
  const t0 = Date.now();
  const id = st.put(CREDS, t0);
  const file = path.join(dir, fs.readdirSync(dir)[0]);
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).exp, t0 + 300000, 'expiry saved with the record');
  const realNow = Date.now;
  try {
    // a "restarted" site (new store object on the same folder) at 4:59 still accepts it
    Date.now = () => t0 + 299000;
    assert.deepStrictEqual(makeStore({ dir, secret: 's1' }).take(id), CREDS, 'valid at 4:59 after a restart');
    // a second ID: refused at exactly 5:00, with no sweep having run
    Date.now = () => t0;
    const id2 = st.put(CREDS, t0);
    Date.now = () => t0 + 300000;
    assert.strictEqual(makeStore({ dir, secret: 's1' }).take(id2), null, 'refused at 5:00');
    assert.strictEqual(fs.readdirSync(dir).length, 0, 'the refused record was deleted too');
    // clean-up removes expired and leaves valid ones
    Date.now = () => t0;
    const a = st.put(CREDS, t0), b = st.put(CREDS, t0 + 200000);
    Date.now = () => t0 + 350000;
    assert.strictEqual(st.sweep(), 1, 'one expired record swept');
    Date.now = () => t0 + 399000;
    assert.deepStrictEqual(st.take(b), CREDS, 'the newer one is still valid');
    assert.strictEqual(st.take(a), null);
  } finally { Date.now = realNow; }
});

test('expiry: an edited expiry time is rejected, and old-format records are refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tamper-test-'));
  const st = makeStore({ dir, secret: 's1' });
  const id = st.put(CREDS, Date.now() - 299000); // 1 second left
  const file = path.join(dir, fs.readdirSync(dir)[0]);
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  rec.exp += 24 * 3600 * 1000; // try to stretch it to a day
  fs.writeFileSync(file, JSON.stringify(rec));
  assert.strictEqual(st.take(id), null, 'stretched expiry does not work');
  const old = path.join(dir, 'old.json');
  fs.writeFileSync(old, JSON.stringify({ exp: Date.now() + 1e7, iv: 'a', tag: 'a', data: 'a' }));
  assert.strictEqual(st.sweep() >= 1, true);
  assert.ok(!fs.existsSync(old), 'old 24h-style record removed');
});

test('site: session endpoint is one-use, an expired ID is rejected, the page shows the time left', async () => {
  const t = await boot();
  const realNow = Date.now;
  try {
    const r = await (await post(t.base + '/api/pair', { method: 'code', number: '2348012345678' })).json();
    const j = await until(async () => { const x = await (await fetch(`${t.base}/api/job/${r.job}`)).json(); return x.state === 'linked' ? x : null; });
    assert.ok(j.idSecondsLeft > 295 && j.idSecondsLeft <= 300, 'about 5 minutes left: ' + j.idSecondsLeft);
    assert.strictEqual(j.expired, false);
    // retrieve once, then it is used up
    assert.strictEqual((await fetch(`${t.base}/api/session/${j.sessionId}`)).status, 200);
    assert.strictEqual((await fetch(`${t.base}/api/session/${j.sessionId}`)).status, 404, 'already used');
    // a new ID, left unused until it expires
    const r2 = await (await post(t.base + '/api/pair', { method: 'qr' })).json();
    const j2 = await until(async () => { const x = await (await fetch(`${t.base}/api/job/${r2.job}`)).json(); return x.state === 'linked' ? x : null; });
    Date.now = () => realNow() + 301000;
    const late = await (await fetch(`${t.base}/api/job/${r2.job}`)).json();
    assert.strictEqual(late.expired, true);
    assert.strictEqual(late.sessionId, null, 'the page is not given an expired ID');
    assert.strictEqual((await fetch(`${t.base}/api/session/${j2.sessionId}`)).status, 404, 'expired ID refused');
  } finally { Date.now = realNow; t.close(); }
});

test('mobile: the page does not draw under the phone status bar or navigation bar', async () => {
  const t = await boot();
  try {
    const html = await (await fetch(t.base + '/')).text();
    // "viewport-fit=cover" lets some Android browsers put the header under the status bar, so it must stay off
    assert.ok(/name="viewport"/.test(html) && !/viewport-fit\s*=\s*cover/.test(html));
    const css = await (await fetch(t.base + '/style.css')).text();
    assert.ok(/footer \{[^}]*calc\(60px \+ env\(safe-area-inset-bottom\)\)/.test(css), 'footer keeps room above the navigation bar');
    assert.ok(/\.island \{[^}]*position: fixed/.test(css), 'the floating bar stays in view');
  } finally { t.close(); }
});

test('navigation: one floating pill with logo, wordmark, theme and menu buttons; motion respects reduced-motion', async () => {
  const t = await boot();
  try {
    const html = await (await fetch(t.base + '/')).text();
    assert.strictEqual((html.match(/class="island"/g) || []).length, 1, 'only one floating bar');
    for (const id of ['theme', 'menu', 'menupanel', 'isl-text', 'secure-text']) assert.ok(html.includes(`id="${id}"`), id);
    assert.ok(html.includes('TURBOFEX') && html.includes('/logo-gold.png'));
    const css = await (await fetch(t.base + '/style.css')).text();
    assert.ok(/\.island \{[^}]*position: fixed/.test(css));
    assert.ok(/@keyframes run18/.test(css) && /@keyframes bloom/.test(css) && /@keyframes spark/.test(css) && /@keyframes breathe/.test(css));
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.ok(/\.flow rect, \.sparks i, \.bloom/.test(rm) && /animation: none !important/.test(rm), 'ambient animation off for reduced motion');
  } finally { t.close(); }
});

test('redesign: new sections exist, status comes from the real /health, nothing is made up', async () => {
  const t = await boot();
  try {
    const html = await (await fetch(t.base + '/')).text();
    for (const id of ['connect', 'how', 'security', 'st-server', 'st-ver', 'm-sound']) assert.ok(html.includes(`id="${id}"`), id);
    for (const word of ['Linked devices', 'Link a device', 'Security tips', 'POWERED BY INNOVATION']) assert.ok(html.includes(word), word);
    // no invented numbers, ratings, links or claims
    assert.ok(!/12,482|v0\.9\.0|100% Secure|discord|telegram|twitter|x\.com/i.test(html), 'no made-up figures or social links');
    // every in-page link points at something that exists
    for (const m of html.matchAll(/href="#([a-z-]+)"/g)) assert.ok(html.includes(`id="${m[1]}"`), 'anchor ' + m[1]);
    const h = await (await fetch(t.base + '/health')).json();
    assert.strictEqual(h.ok, true);
    assert.strictEqual(h.version, require('../package.json').version);
    assert.strictEqual(h.sessionMinutes, 5);
    for (const f of ['/skyline.svg', '/sound.js', '/logo-gold.png']) assert.strictEqual((await fetch(t.base + f)).status, 200, f);
    assert.ok(!/<script(?![^>]*src=)[^>]*>/.test(html) && !/ style=/.test(html), 'still no inline scripts or styles (CSP)');
  } finally { t.close(); }
});
