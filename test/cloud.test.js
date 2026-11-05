const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');
const { createCloud } = require('../cloud');
const { hashPassword, newTotpSecret, totpCode } = require('../admin');

// a tiny stand-in for Supabase's REST interface (only what cloud.js uses)
function fakeSupabase() {
  const db = { tfx_kv: [], tfx_events: [], tfx_audit: [] }; let nextId = 1; const calls = []; let down = false;
  async function fetchImpl(url, o) {
    calls.push({ url, o });
    if (down) throw new Error('offline');
    const u = new URL(url); const table = u.pathname.split('/').pop(); const rows = db[table];
    const ok = (body, status = 200) => ({ ok: status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
    if (o.headers.apikey !== 'secret-key') return ok(undefined, 401);
    if (o.method === 'POST') {
      const body = JSON.parse(o.body);
      if (table === 'tfx_kv') { const i = rows.findIndex((r) => r.key === body.key); if (i >= 0) rows[i] = body; else rows.push(body); }
      else for (const r of body) rows.push({ id: nextId++, ...r });
      return ok(undefined, 201);
    }
    if (o.method === 'DELETE') { const lt = Number(u.searchParams.get('t').replace('lt.', '')); db[table] = rows.filter((r) => !(r.t < lt)); return ok(undefined, 204); }
    let out = rows.slice();
    const k = u.searchParams.get('key'); if (k) out = out.filter((r) => 'eq.' + r.key === k);
    const tt = u.searchParams.get('t'); if (tt) out = out.filter((r) => r.t >= Number(tt.replace('gte.', '')));
    const off = Number(u.searchParams.get('offset') || 0), lim = Number(u.searchParams.get('limit') || 1000);
    return ok(out.slice(off, off + lim));
  }
  return { db, fetchImpl, calls, setDown: (v) => { down = v; } };
}

const PW = 'Correct-Horse-42';
const ACCT = { user: 'own', role: 'owner', hash: hashPassword(PW), totp: newTotpSecret() };
function mkApp(dataDir, cloud) {
  const engine = { start() { return { cancel() {} }; } };
  return createApp({ engine, dataDir, cloud, env: { ADMIN_ACCOUNTS: JSON.stringify([ACCT]), PAIR_LIMIT: '50', NUMBER_LIMIT: '50' } });
}
async function web(app, shift = 0) {
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const req = async (m, u, { cookie, csrf, body } = {}) => { const h = {}; if (cookie) h.cookie = cookie; if (csrf) h['x-csrf-token'] = csrf; if (body !== undefined) h['content-type'] = 'application/json'; const r = await fetch(base + u, { method: m, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) { /* */ } return { status: r.status, json: j, text, headers: r.headers }; };
  const a = await req('POST', '/admin/api/login', { body: { user: 'own', password: PW } });
  const b = await req('POST', '/admin/api/2fa', { body: { ticket: a.json.ticket, code: totpCode(ACCT.totp, Date.now() + shift * 30000) } });
  const cookie = b.headers.get('set-cookie').split(';')[0];
  const me = await req('GET', '/admin/api/me', { cookie });
  return { base, req, s: { cookie, csrf: me.json.csrf } };
}

test('admin data survives a restart with an empty disk when Supabase is on', async () => {
  const fake = fakeSupabase();
  const mk = () => createCloud({ url: 'https://abc.supabase.co', key: 'secret-key', fetchImpl: fake.fetchImpl, flushMs: 60000, log() {} });
  const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-c1-'));
  const c1 = mk(); const app1 = mkApp(dir1, c1); const w1 = await web(app1, -1);
  await w1.req('POST', '/admin/api/announcements/add', { ...w1.s, body: { text: 'Back at 5pm', level: 'info' } });
  await w1.req('POST', '/admin/api/blocks/add', { ...w1.s, body: { kind: 'number', number: '8012345678', country: 'NG', reason: 'abuse' } });
  await w1.req('POST', '/admin/api/settings', { ...w1.s, body: { limits: { pair: 7 } } });
  await w1.req('POST', '/api/pair', { body: { method: 'code', number: '8023456789', country: 'NG' } });
  await new Promise((r) => setTimeout(r, 700)); await c1.flush();
  assert.strictEqual(c1.status().queued, 0, 'everything was sent');
  assert.ok(fake.db.tfx_events.length >= 1 && fake.db.tfx_audit.length >= 3 && fake.db.tfx_kv.length === 1);
  assert.ok(!JSON.stringify(fake.db).includes('8012345678') && !JSON.stringify(fake.db).includes('8023456789'), 'no full number reaches the database');
  const blob = JSON.stringify(fake.db); assert.ok(!/TFX-[A-Z0-9]{4}-/.test(blob), 'no session IDs in the database');
  app1.close();

  // new empty disk = what a redeploy on the free plan looks like
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-c2-'));
  const c2 = mk(); assert.strictEqual(await c2.restore(path.join(dir2, 'admin')), true);
  const app2 = mkApp(dir2, c2); const w2 = await web(app2, 0);
  assert.strictEqual((await w2.req('GET', '/api/status')).json.announcement.text, 'Back at 5pm');
  assert.strictEqual((await w2.req('GET', '/admin/api/settings', w2.s)).json.limits.pair, 7);
  assert.strictEqual((await w2.req('GET', '/admin/api/blocks', w2.s)).json.blocks.length, 1);
  const a = (await w2.req('GET', '/admin/api/audit', w2.s)).json;
  assert.strictEqual(a.chainOk, true, 'the audit chain is still valid after restoring');
  assert.ok(a.entries.some((e) => e.action === 'block.add'));
  assert.ok((await w2.req('GET', '/admin/api/activity', w2.s)).json.events.length >= 1, 'activity came back');
  // new actions continue the same chain
  await w2.req('POST', '/admin/api/announcements/add', { ...w2.s, body: { text: 'Second', level: 'info' } });
  assert.strictEqual((await w2.req('GET', '/admin/api/audit', w2.s)).json.chainOk, true);
  assert.deepStrictEqual(Object.keys((await w2.req('GET', '/admin/api/health', w2.s)).json.storage.cloud).sort(), ['enabled', 'lastError', 'lastOkAt', 'ok', 'queued', 'restored']);
  assert.ok(!JSON.stringify((await w2.req('GET', '/admin/api/health', w2.s)).json).includes('secret-key'), 'the key is never shown');
  app2.close();
});

test('if Supabase is down the site keeps working and catches up later', async () => {
  const fake = fakeSupabase(); fake.setDown(true);
  const c = createCloud({ url: 'https://abc.supabase.co', key: 'secret-key', fetchImpl: fake.fetchImpl, flushMs: 60000, log() {} });
  assert.strictEqual(await c.restore(fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-c3-'))), false, 'restore fails quietly');
  const app = mkApp(fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-c4-')), c); const w = await web(app, 1);
  const r = await w.req('POST', '/admin/api/announcements/add', { ...w.s, body: { text: 'Works offline', level: 'info' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await w.req('POST', '/api/pair', { body: { method: 'code', number: '8023456789', country: 'NG' } })).status, 200);
  await c.flush(); assert.strictEqual(c.status().ok, false); assert.ok(c.status().queued > 0);
  fake.setDown(false); await c.flush();
  assert.strictEqual(c.status().queued, 0); assert.strictEqual(c.status().ok, true); assert.ok(fake.db.tfx_audit.length >= 2);
  app.close();
});

test('a wrong key is reported as an error, never crashes, and without settings nothing is sent', async () => {
  const fake = fakeSupabase();
  const bad = createCloud({ url: 'https://abc.supabase.co', key: 'nope', fetchImpl: fake.fetchImpl, flushMs: 60000, log() {} });
  assert.strictEqual(await bad.restore(fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-c5-'))), false);
  assert.match(bad.status().lastError, /401/);
  const off = createCloud({ url: '', key: '' }); assert.strictEqual(off.enabled, false);
  off.pushEvent({ t: 1 }); await off.flush(); assert.strictEqual(fake.calls.length, 1, 'only the one failed restore call');
  assert.strictEqual(createCloud({ url: 'http://insecure.example', key: 'k' }).enabled, false, 'https only');
});
