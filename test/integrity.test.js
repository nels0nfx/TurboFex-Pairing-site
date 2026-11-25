const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');
const { createCloud } = require('../cloud');
const { hashPassword, newTotpSecret, totpCode } = require('../admin');
const A = require('../analytics');

// A fake Supabase that behaves like the real one where it matters: unique keys with on_conflict + ignore-duplicates, id=gt paging,
// filters on t, a missing column (before the migration), refused rows (400) and a "lost answer" (row stored, then the connection breaks).
const jsonb = (v) => (Array.isArray(v) || v === null || typeof v !== 'object') ? v : Object.fromEntries(Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map((k) => [k, jsonb(v[k])]));
function fake({ migrated = true } = {}) {
  const db = { tfx_kv: [], tfx_events: [], tfx_audit: [] }; let nextId = 1, down = false, loseNextAnswer = false; const calls = [];
  const uniq = { tfx_events: 'eid', tfx_audit: 'h' };
  async function fetchImpl(url, o) {
    calls.push({ url, method: o.method });
    if (down) throw new Error('offline');
    const u = new URL(url), table = u.pathname.split('/').pop(), P = (k) => u.searchParams.get(k);
    const ok = (body, status = 200) => ({ ok: status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
    if (o.headers.apikey !== 'secret-key') return ok(undefined, 401);
    if (o.method === 'POST') {
      const body = JSON.parse(o.body);
      if (table === 'tfx_kv') { const i = db.tfx_kv.findIndex((r) => r.key === body.key); if (i >= 0) db.tfx_kv[i] = body; else db.tfx_kv.push(body); return ok(undefined, 201); }
      const col = uniq[table];
      if (body.some((r) => r.e && r.e.bad)) return ok({ message: 'rejected' }, 400);
      if (body.some((r) => col in r) && !migrated) return ok({ code: 'PGRST204', message: `Could not find the '${col}' column` }, 400);
      for (const r of body) {
        if (col in r && P('on_conflict') === col && db[table].some((x) => x[col] === r[col])) continue;   // ignore-duplicates
        db[table].push({ id: nextId++, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, jsonb(v)])) });
      }
      if (loseNextAnswer) { loseNextAnswer = false; throw new Error('connection reset after the rows were stored'); }
      return ok(undefined, 201);
    }
    let rows = db[table].slice();
    const f = (k, op) => { const v = P(k); return v && v.startsWith(op + '.') ? Number(v.slice(op.length + 1)) : null; };
    const lt = f('t', 'lt'), gte = f('t', 'gte'), gt = f('id', 'gt'), lte = f('id', 'lte');
    const keep = (r) => (lt === null || r.t < lt) && (gte === null || r.t >= gte) && (gt === null || r.id > gt) && (lte === null || r.id <= lte);
    if (o.method === 'DELETE') { db[table] = rows.filter((r) => !keep(r)); return ok(undefined, 204); }
    const k = P('key'); if (k && k.startsWith('like.')) rows = rows.filter((r) => r.key.startsWith(k.slice(5, -1))); else if (k) rows = rows.filter((r) => 'eq.' + r.key === k);
    rows = rows.filter(keep).sort((a, b) => (a.id || 0) - (b.id || 0));
    const off = Number(P('offset') || 0), lim = Number(P('limit') || 1000);
    return ok(rows.slice(off, off + lim));
  }
  return { db, fetchImpl, calls, setDown: (v) => { down = v; }, loseNext: () => { loseNextAnswer = true; } };
}
const mkCloud = (fk, extra = {}) => createCloud({ url: 'https://abc.supabase.co', key: 'secret-key', fetchImpl: fk.fetchImpl, flushMs: 60000, log() {}, ...extra });
const ev = (n, t = Date.now(), extra = {}) => ({ eid: 'e' + n, t, type: 'pair.start', client: 'c1', method: 'code', ...extra });

test('a write whose answer was lost is retried and stored ONCE (unique key)', async () => {
  const fk = fake(), c = mkCloud(fk);
  c.pushEvent(ev(1)); c.pushEvent(ev(2));
  fk.loseNext(); await c.flush();
  assert.strictEqual(fk.db.tfx_events.length, 2, 'the rows reached the database');
  assert.ok(c.status().queued > 0, 'the site could not know, so it keeps them queued');
  await c.flush();
  assert.strictEqual(fk.db.tfx_events.length, 2, 'the retry did not store them again');
  assert.strictEqual(c.status().queued, 0);
  c.pushAudit({ h: 'abc', a: 1 }); fk.loseNext(); await c.flush(); await c.flush();
  assert.strictEqual(fk.db.tfx_audit.length, 1, 'audit lines are not doubled either');
});

test('one refused row cannot block the rows behind it; nothing is silently lost', async () => {
  const fk = fake(), c = mkCloud(fk);
  c.pushEvent(ev(1)); c.pushEvent({ eid: 'e2', t: Date.now(), type: 'x', bad: true }); c.pushEvent(ev(3));
  await c.flush();
  assert.strictEqual(c.status().queued, 0, 'queue is empty, not stuck');
  assert.strictEqual(c.status().rejected, 1, 'the refusal is counted and shown');
  assert.strictEqual(fk.db.tfx_events.length, 2);
});

test('before the migration is run the site still saves (old way) and says the migration is needed', async () => {
  const fk = fake({ migrated: false }), c = mkCloud(fk);
  c.pushEvent(ev(1)); c.pushEvent(ev(2)); await c.flush();
  assert.strictEqual(fk.db.tfx_events.length, 2); assert.strictEqual(c.status().migrationNeeded, true); assert.match(c.status().lastError, /migrate/);
});

test('activity is still sent when the saved settings could not be loaded; settings and audit are not', async () => {
  const fk = fake(); fk.setDown(true);
  const c = mkCloud(fk); assert.strictEqual(await c.restore(fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-i1-'))), false);
  c.pushEvent(ev(1)); c.pushAudit({ h: 'x' }); c.pushState({ a: 1 }); fk.setDown(false); await c.flush();
  assert.strictEqual(fk.db.tfx_events.length, 1, 'append-only, idempotent activity is not lost'); assert.strictEqual(fk.db.tfx_audit.length, 0); assert.strictEqual(fk.db.tfx_kv.length, 0);
});

test('persistState tells the truth: durable only when the database really has it', async () => {
  const fk = fake(), c = mkCloud(fk); await c.restore(fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-i2-')));
  assert.deepStrictEqual(await c.persistState({ v: 1 }), { durable: true }); assert.deepStrictEqual(fk.db.tfx_kv.find((r) => r.key === 'state').value, { v: 1 });
  fk.setDown(true); const r = await c.persistState({ v: 2 }); assert.strictEqual(r.durable, false);
  fk.setDown(false); await c.flush(); assert.deepStrictEqual(fk.db.tfx_kv.find((r2) => r2.key === 'state').value, { v: 2 }, 'it was sent again by itself');
  assert.strictEqual((await createCloud({ url: '', key: '' }).persistState({})).durable, false);
});

test('restore reads every page: more than 1000 lines all come back (nothing is cut off)', async () => {
  const fk = fake(), c = mkCloud(fk);
  for (let i = 0; i < 2300; i++) fk.db.tfx_events.push({ id: i + 1, eid: 'x' + i, t: Date.now() - 1000 + i, e: ev(i, Date.now() - 1000 + i) });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-i3-')); assert.strictEqual(await c.restore(dir), true);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').trim().split('\n').length, 2300);
});

test('lines only in the local file (the site stopped before sending) are kept and sent, once', async () => {
  const fk = fake(), c = mkCloud(fk), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-i4-'));
  fs.writeFileSync(path.join(dir, 'events.jsonl'), JSON.stringify(ev(77)) + '\n');
  await c.restore(dir); await c.flush(); await c.flush();
  assert.strictEqual(fk.db.tfx_events.filter((r) => r.eid === 'e77').length, 1);
});

test('daily totals: old lines are summed BEFORE they are deleted, and a smaller recount never lowers a day', async () => {
  const fk = fake(), c = mkCloud(fk, { retentionMs: 7 * 24 * 3600 * 1000 });
  const old = Date.now() - 10 * 24 * 3600 * 1000, day = A.dayKey(old);
  for (let i = 0; i < 5; i++) c.pushEvent({ ...ev(i, old + i * 1000), type: 'pair.start' });
  c.pushEvent({ ...ev(9, old + 9000), type: 'pair.linked' }); c.pushEvent(ev(100, Date.now()));
  await c.flush(); await c.prune();
  const row = fk.db.tfx_kv.find((r) => r.key === 'daily:' + day); assert.ok(row, 'the day was saved');
  assert.strictEqual(row.value.attempts, 5); assert.strictEqual(row.value.linked, 1);
  assert.strictEqual(fk.db.tfx_events.length, 1, 'only the recent line is left in the event table');
  const lower = A.mergeMax(row.value, A.summarize([{ t: old, type: 'pair.start' }])[day]); assert.strictEqual(lower.attempts, 5, 'never lowered');
  await c.prune(); assert.strictEqual(fk.db.tfx_kv.find((r) => r.key === 'daily:' + day).value.attempts, 5, 'running it again changes nothing');
});

// ---------- whole-site tests ----------
const PW = 'Correct-Horse-42', ACCT = { user: 'own', role: 'owner', hash: hashPassword(PW), totp: newTotpSecret() };
function mk(dataDir, cloud, over = {}) {
  const calls = [];
  const engine = { start(number, hooks, opts) { const c = { number, hooks, opts, cancelled: false }; calls.push(c); return { cancel() { c.cancelled = true; } }; } };
  const app = createApp({ engine, dataDir, cloud, env: { ADMIN_ACCOUNTS: JSON.stringify([ACCT]), PAIR_LIMIT: '50', NUMBER_LIMIT: '50', SITE_SECRET: 'fixed-secret', ...over } });
  return { app, calls };
}
async function web(app, shift = 0) {
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const req = async (m, u, { cookie, csrf, body } = {}) => { const h = {}; if (cookie) h.cookie = cookie; if (csrf) h['x-csrf-token'] = csrf; if (body !== undefined) h['content-type'] = 'application/json'; const r = await fetch(base + u, { method: m, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* html */ } return { status: r.status, json: j, headers: r.headers }; };
  const a = await req('POST', '/admin/api/login', { body: { user: 'own', password: PW } });
  const b = await req('POST', '/admin/api/2fa', { body: { ticket: a.json.ticket, code: totpCode(ACCT.totp, Date.now() + shift * 30000) } });
  const cookie = b.headers.get('set-cookie').split(';')[0], me = await req('GET', '/admin/api/me', { cookie });
  return { base, req, s: { cookie, csrf: me.json.csrf } };
}
const pair = (w, number = '8023456789', extra = {}) => w.req('POST', '/api/pair', { body: { method: 'code', number, country: 'NG', ...extra } });
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('settings: a partial save keeps the other limits; the saved values survive a restart; a bad value changes nothing', async () => {
  const dir = tmp('tfx-s1-'), { app } = mk(dir); const w = await web(app, -1);
  assert.strictEqual((await w.req('POST', '/admin/api/settings', { ...w.s, body: { limits: { pair: 7, number: 3, maxJobs: 9 } } })).status, 200);
  const r = await w.req('POST', '/admin/api/settings', { ...w.s, body: { limits: { pair: 8 } } });   // only one field sent
  assert.deepStrictEqual([r.json.limits.pair, r.json.limits.number, r.json.limits.maxJobs], [8, 3, 9], 'the other two were NOT reset');
  assert.strictEqual((await w.req('POST', '/admin/api/settings', { ...w.s, body: { limits: { pair: 4, number: 99999 } } })).status, 400);
  assert.strictEqual((await w.req('GET', '/admin/api/settings', w.s)).json.limits.pair, 8, 'a rejected save changed nothing, not even the valid field');
  await w.req('POST', '/admin/api/settings', { ...w.s, body: { maintenance: { on: true, message: 'Back soon' } } });
  app.close();
  const { app: app2 } = mk(dir); const w2 = await web(app2, 0);
  const s = (await w2.req('GET', '/admin/api/settings', w2.s)).json;
  assert.deepStrictEqual([s.limits.pair, s.limits.number, s.limits.maxJobs, s.maintenance.on, s.maintenance.message], [8, 3, 9, true, 'Back soon']);
  app2.close();
});

test('a setting is only called durable when the database confirmed it; otherwise the dashboard gets a warning', async () => {
  const fk = fake(), c = mkCloud(fk), dir = tmp('tfx-s2-'); await c.restore(path.join(dir, 'admin'));
  const { app } = mk(dir, c); const w = await web(app, -1);
  const a = await w.req('POST', '/admin/api/settings', { ...w.s, body: { limits: { pair: 6 } } });
  assert.strictEqual(a.json.durable, true); assert.strictEqual(fk.db.tfx_kv.find((r) => r.key === 'state').value.limits.pair, 6);
  fk.setDown(true);
  const b = await w.req('POST', '/admin/api/settings', { ...w.s, body: { limits: { pair: 5 } } });
  assert.strictEqual(b.status, 200); assert.strictEqual(b.json.durable, false); assert.ok(b.json.warning);
  fk.setDown(false); await c.flush();
  assert.strictEqual(fk.db.tfx_kv.find((r) => r.key === 'state').value.limits.pair, 5, 'it was delivered later by itself');
  const noCloud = mk(tmp('tfx-s3-')); const w3 = await web(noCloud.app, 1);
  const d = await w3.req('POST', '/admin/api/settings', { ...w3.s, body: { limits: { pair: 6 } } });
  assert.strictEqual(d.json.durable, false); assert.strictEqual(d.json.storage, 'local'); assert.match(d.json.warning, /this server only/);
  app.close(); noCloud.app.close();
});

test('event accuracy: only things that really happened are counted, and the dashboard equals the stored events', async () => {
  const dir = tmp('tfx-e1-'), { app, calls } = mk(dir, null, { NUMBER_LIMIT: '2', MAX_JOBS: '3' }); const w = await web(app, -1);
  const count = async (days) => (await w.req('GET', '/admin/api/overview' + (days ? '?days=' + days : ''), w.s)).json;
  assert.strictEqual((await pair(w, '123')).status, 400);                                      // invalid number
  let o = await count(); assert.deepStrictEqual([o.totals.attempts, o.totals.invalid], [0, 1], 'an invalid number is not an attempt');
  const first = await pair(w, '8023456789'); assert.strictEqual(first.status, 200);
  calls[0].hooks.onCode('ABCD-1234');
  o = await count(); assert.deepStrictEqual([o.totals.attempts, o.totals.codes, o.totals.linked], [1, 1, 0], 'a code is not a link');
  // the same request sent again (same rid) gives the same attempt and is not counted again
  const r1 = await pair(w, '8034567890', { rid: 'retry-abc-12345' }), r2 = await pair(w, '8034567890', { rid: 'retry-abc-12345' });
  assert.strictEqual(r1.json.job, r2.json.job); assert.strictEqual(r2.json.repeated, true); assert.strictEqual(calls.length, 2, 'only one extra attempt was started');
  o = await count(); assert.strictEqual(o.totals.attempts, 2, 'a repeated request did not inflate the count');
  // a new press for the same number replaces the old attempt -> recorded as cancelled, not lost
  assert.strictEqual((await pair(w, '8023456789')).status, 200);
  o = await count(); assert.strictEqual(o.totals.cancelled, 1); assert.strictEqual(o.totals.attempts, 3);
  // the number limit (2 per window) refuses the 3rd try for that number and counts it as rate limited, not as an attempt
  const lim = await pair(w, '8023456789'); assert.strictEqual(lim.status, 429);
  o = await count(); assert.deepStrictEqual([o.totals.limited, o.totals.attempts], [1, 3]);
  // busy: three attempts are open, the fourth is refused and recorded as busy
  assert.strictEqual((await pair(w, '8045678901')).status, 200); const busy = await pair(w, '8056789012'); assert.strictEqual(busy.status, 503);
  o = await count(); assert.strictEqual(o.totals.busy, 1);
  // a genuine link: counted only when the engine confirms it
  calls[1].hooks.onLinked({ me: { id: '2348034567890:1@s.whatsapp.net' } });
  calls[2].hooks.onFail('WhatsApp refused');
  o = await count(); assert.deepStrictEqual([o.totals.linked, o.totals.failed], [1, 1]); assert.strictEqual(o.successRate, 50);
  // the dashboard totals equal a recount of the stored lines
  const stored = fs.readFileSync(path.join(dir, 'admin', 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const sum = A.total(Object.values(A.summarize(stored)));
  for (const k of ['attempts', 'codes', 'linked', 'failed', 'cancelled', 'limited', 'invalid', 'busy']) assert.strictEqual(o.totals[k], sum.totals[k], k);
  assert.ok(new Set(stored.map((e) => e.eid)).size === stored.length, 'every line has its own unique id');
  assert.ok(!JSON.stringify(stored).match(/80[2-5]\d{7}/), 'no full number in the log');
  app.close();
});

test('session fetch: success only after the login was delivered; every failure is recorded as a failure', async () => {
  const dir = tmp('tfx-f1-'), { app } = mk(dir); const w = await web(app, -1);
  const id = app.store.put({ me: { id: '2348023456789:1@s.whatsapp.net' }, noiseKey: 'k' }, Date.now());
  const types = async () => (await w.req('GET', '/admin/api/overview', w.s)).json.totals;
  assert.strictEqual((await w.req('GET', '/api/session/not-an-id')).status, 400);
  let t = await types(); assert.deepStrictEqual([t.sessionFetchOk, t.sessionFetchBad], [0, 1]);
  assert.strictEqual((await w.req('GET', '/api/session/' + encodeURIComponent(id))).status, 200);
  await new Promise((r) => setTimeout(r, 50));
  t = await types(); assert.deepStrictEqual([t.sessionFetchOk, t.sessionFetchBad], [1, 1]);
  assert.strictEqual((await w.req('GET', '/api/session/' + encodeURIComponent(id))).status, 404, 'an ID works once');
  t = await types(); assert.deepStrictEqual([t.sessionFetchOk, t.sessionFetchBad], [1, 2], 'the second use is a failure, not a second success');
  app.close();
});

test('history survives a restart: daily totals are kept and the 7/30-day views use them', async () => {
  const dir = tmp('tfx-h1-'), old = Date.now() - 20 * 24 * 3600 * 1000, day = A.dayKey(old);
  fs.mkdirSync(path.join(dir, 'admin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'admin', 'daily.json'), JSON.stringify({ days: [{ ...A.emptyDay(day), attempts: 12, linked: 9, failed: 3 }] }));
  const { app } = mk(dir); const w = await web(app, -1);
  const h = (await w.req('GET', '/admin/api/history?days=30', w.s)).json;
  assert.strictEqual(h.tz, 'UTC'); assert.strictEqual(h.days.find((d) => d.day === day).attempts, 12); assert.strictEqual(h.totals.linked, 9);
  assert.strictEqual((await w.req('GET', '/admin/api/overview?days=7', w.s)).json.totals.attempts, 0, 'a day outside the 7-day range is not in it');
  const o30 = (await w.req('GET', '/admin/api/overview?days=30', w.s)).json; assert.strictEqual(o30.totals.attempts, 12); assert.strictEqual(o30.range.bucket, 'day');
  assert.strictEqual((await w.req('GET', '/admin/api/overview', w.s)).json.series.length, 24);
  app.close();
});

test('time zone: hour bars start on whole UTC hours', async () => {
  const dir = tmp('tfx-t1-'), { app } = mk(dir); const w = await web(app, -1);
  const s = (await w.req('GET', '/admin/api/overview', w.s)).json.series;
  assert.ok(s.every((b) => b.t % 3600000 === 0)); assert.strictEqual(s[23].t, Math.floor(Date.now() / 3600000) * 3600000);
  app.close();
});
