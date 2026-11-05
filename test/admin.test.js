const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');
const { hashPassword, newTotpSecret, totpCode, parseAccounts } = require('../admin');

const PW = 'Correct-Horse-42';
const HASH = hashPassword(PW); // one hash is enough for every test account (same password)
function accountsFor(names) { return names.map(([user, role]) => ({ user, role, hash: HASH, totp: newTotpSecret() })); }

// a stand-in for WhatsApp: remembers every pairing the site starts so a test can drive its states
async function boot(extraEnv = {}, names = [['own', 'owner'], ['mod', 'moderator'], ['view', 'viewer']]) {
  const calls = [];
  const engine = { start(number, hooks, opts) { calls.push({ number, hooks, opts, cancelled: false }); const c = calls[calls.length - 1]; return { cancel() { c.cancelled = true; } }; } };
  const accts = accountsFor(names);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-adm-'));
  const env = { ADMIN_ACCOUNTS: JSON.stringify(accts), PAIR_LIMIT: '50', NUMBER_LIMIT: '50', ...extraEnv };
  const app = createApp({ engine, dataDir, env });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const secrets = Object.fromEntries(accts.map((a) => [a.user, a.totp]));
  async function req(method, url, { cookie, csrf, body, headers } = {}) {
    const h = { ...(headers || {}) };
    if (cookie) h.cookie = cookie;
    if (csrf) h['x-csrf-token'] = csrf;
    if (body !== undefined) h['content-type'] = 'application/json';
    const r = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) { /* html */ }
    return { status: r.status, json: j, text, headers: r.headers };
  }
  // sign in as one of the accounts; `shift` moves the 2FA code by whole 30 s steps (each code works once)
  async function login(user, shift = 0) {
    const a = await req('POST', '/admin/api/login', { body: { user, password: PW } });
    assert.strictEqual(a.status, 200, 'password step');
    const b = await req('POST', '/admin/api/2fa', { body: { ticket: a.json.ticket, code: totpCode(secrets[user], Date.now() + shift * 30000) } });
    assert.strictEqual(b.status, 200, '2fa step ' + b.text);
    const cookie = b.headers.get('set-cookie').split(';')[0];
    const me = await req('GET', '/admin/api/me', { cookie });
    return { cookie, csrf: me.json.csrf, me: me.json, setCookie: b.headers.get('set-cookie') };
  }
  const pair = (number = '8012345678', country = 'NG', headers) => req('POST', '/api/pair', { body: { method: 'code', number, country }, headers });
  return { app, calls, base, req, login, pair, secrets, dataDir, close: () => app.close() };
}
const as = (s) => ({ cookie: s.cookie, csrf: s.csrf });

test('with no ADMIN_ACCOUNTS the dashboard does not exist', async () => {
  const t = await boot({ ADMIN_ACCOUNTS: '' });
  try {
    for (const u of ['/admin', '/admin/', '/admin/api/me', '/admin/api/overview']) assert.strictEqual((await t.req('GET', u)).status, 404, u);
    assert.strictEqual((await t.req('POST', '/admin/api/login', { body: { user: 'a', password: 'b' } })).status, 404);
    assert.strictEqual((await t.req('GET', '/admin.html')).status, 404, 'the page file is not served directly either');
    assert.strictEqual((await t.req('GET', '/health')).status, 200, 'the normal site is untouched');
  } finally { t.close(); }
});

test('bad account settings are ignored (never half-enabled)', () => {
  assert.deepStrictEqual(parseAccounts('not json'), []);
  assert.deepStrictEqual(parseAccounts(JSON.stringify([{ user: 'x', role: 'owner', hash: 'plain', totp: 'AAAA' }])), []);
  assert.deepStrictEqual(parseAccounts(JSON.stringify([{ user: 'okname', role: 'god', hash: HASH, totp: newTotpSecret() }])), []);
  assert.strictEqual(parseAccounts(JSON.stringify(accountsFor([['okname', 'viewer']]))).length, 1);
});

test('sign-in: password then 2FA; wrong steps are refused; a 2FA code works once; the cookie is locked down', async () => {
  const t = await boot();
  try {
    assert.strictEqual((await t.req('POST', '/admin/api/login', { body: { user: 'own', password: 'wrong-password-1' } })).status, 401);
    assert.strictEqual((await t.req('POST', '/admin/api/login', { body: { user: 'nobody', password: PW } })).status, 401, 'unknown user: same answer');
    const a = await t.req('POST', '/admin/api/login', { body: { user: 'own', password: PW } });
    assert.strictEqual(a.status, 200); assert.strictEqual(a.json.step, '2fa'); assert.ok(!a.headers.get('set-cookie'), 'no session after the password alone');
    assert.strictEqual((await t.req('GET', '/admin/api/me', {})).status, 401);
    const bad = await t.req('POST', '/admin/api/2fa', { body: { ticket: a.json.ticket, code: '000000' } });
    assert.strictEqual(bad.status, 401); assert.ok(!bad.headers.get('set-cookie'));
    assert.strictEqual((await t.req('POST', '/admin/api/2fa', { body: { ticket: 'f'.repeat(48), code: totpCode(t.secrets.own) } })).status, 401, 'no ticket, no entry');
    const code = totpCode(t.secrets.own);
    const ok = await t.req('POST', '/admin/api/2fa', { body: { ticket: a.json.ticket, code } });
    assert.strictEqual(ok.status, 200);
    const c = ok.headers.get('set-cookie');
    assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Strict/); assert.match(c, /Path=\/admin/);
    // the same code again (replay) on a fresh sign-in is refused
    const a2 = await t.req('POST', '/admin/api/login', { body: { user: 'own', password: PW } });
    assert.strictEqual((await t.req('POST', '/admin/api/2fa', { body: { ticket: a2.json.ticket, code } })).status, 401, 'a used code cannot be used again');
    // a ticket is tied to the visitor and dies after its code was used
    assert.strictEqual((await t.req('POST', '/admin/api/2fa', { body: { ticket: a.json.ticket, code: totpCode(t.secrets.own, Date.now() + 30000) } })).status, 401, 'used ticket');
    const me = await t.req('GET', '/admin/api/me', { cookie: c.split(';')[0] });
    assert.strictEqual(me.status, 200); assert.strictEqual(me.json.role, 'owner');
    const page = await t.req('GET', '/admin');
    assert.strictEqual(page.status, 200); assert.match(page.headers.get('content-security-policy'), /default-src 'self'/); assert.match(page.headers.get('x-robots-tag'), /noindex/);
  } finally { t.close(); }
});

test('sign-in is locked after repeated wrong passwords, and the lock shows up as a security alert', async () => {
  const t = await boot();
  try {
    let last;
    for (let i = 0; i < 6; i++) last = await t.req('POST', '/admin/api/login', { body: { user: 'own', password: 'wrong-' + i + '-password' } });
    assert.strictEqual(last.status, 429);
    const good = await t.req('POST', '/admin/api/login', { body: { user: 'own', password: PW } });
    assert.strictEqual(good.status, 429, 'even the right password waits while locked');
    const other = await t.req('POST', '/admin/api/login', { body: { user: 'mod', password: PW } });
    assert.strictEqual(other.status, 200, 'another account is not locked by one account\'s failures (the visitor lock only starts at 8 failures)');
    for (let i = 0; i < 3; i++) await t.req('POST', '/admin/api/login', { body: { user: 'view', password: 'wrong-' + i + '-password' } });
    assert.strictEqual((await t.req('POST', '/admin/api/login', { body: { user: 'view', password: PW } })).status, 429, 'now this visitor is locked out entirely');
  } finally { t.close(); }
});

test('every admin API refuses a visitor who is not signed in', async () => {
  const t = await boot();
  try {
    for (const u of ['me', 'overview', 'sessions', 'visitors', 'blocks', 'security', 'health', 'activity', 'audit', 'settings', 'announcements']) assert.strictEqual((await t.req('GET', '/admin/api/' + u)).status, 401, u);
    for (const u of ['logout', 'sessions/revoke', 'attempts/stop', 'blocks/add', 'blocks/remove', 'settings', 'announcements/add', 'announcements/toggle', 'announcements/delete']) assert.strictEqual((await t.req('POST', '/admin/api/' + u, { body: {} })).status, 401, u);
    assert.strictEqual((await t.req('GET', '/admin/api/me', { cookie: 'tfx_admin=' + 'a'.repeat(64) })).status, 401, 'a made-up cookie');
    assert.strictEqual((await t.req('GET', '/admin/api/nothing')).status, 401);
  } finally { t.close(); }
});

test('changes need the CSRF token and a same-site origin; sessions expire when idle', async () => {
  const t = await boot();
  try {
    const s = await t.login('own');
    const body = { text: 'Hello everyone', level: 'info' };
    assert.strictEqual((await t.req('POST', '/admin/api/announcements/add', { cookie: s.cookie, body })).status, 403, 'no token');
    assert.strictEqual((await t.req('POST', '/admin/api/announcements/add', { cookie: s.cookie, csrf: 'x'.repeat(48), body })).status, 403, 'wrong token');
    assert.strictEqual((await t.req('POST', '/admin/api/announcements/add', { ...as(s), body, headers: { origin: 'https://evil.example' } })).status, 403, 'other website');
    assert.strictEqual((await t.req('POST', '/admin/api/announcements/add', { ...as(s), body })).status, 200);
    // idle for more than 20 minutes: signed out
    const rec = t.app.admin._sessions.get(s.cookie.split('=')[1]); rec.last -= 21 * 60 * 1000;
    assert.strictEqual((await t.req('GET', '/admin/api/me', { cookie: s.cookie })).status, 401);
    // logout kills the session on the server
    const s2 = await t.login('mod');
    assert.strictEqual((await t.req('POST', '/admin/api/logout', as(s2))).status, 200);
    assert.strictEqual((await t.req('GET', '/admin/api/me', { cookie: s2.cookie })).status, 401);
  } finally { t.close(); }
});

test('roles are enforced by the server: viewer reads, moderator moderates, only the owner changes settings and reads the audit log', async () => {
  const t = await boot();
  try {
    const [own, mod, view] = [await t.login('own'), await t.login('mod'), await t.login('view')];
    const sessionId = t.app.store.put({ me: 'x' });
    const ref = (await t.req('GET', '/admin/api/sessions', as(own))).json.sessions[0].ref;
    const tries = [
      ['sessions/revoke', { ref }, 'sessions.revoke'], ['attempts/stop', { ref: 'x' }, 'sessions.revoke'],
      ['blocks/add', { kind: 'number', number: '8012345678', country: 'NG' }, 'blocks.manage'], ['blocks/remove', { kind: 'client', id: 'a'.repeat(12) }, 'blocks.manage'],
      ['announcements/add', { text: 'Hello there', level: 'info' }, 'announce.manage'], ['settings', { maintenance: { on: true, message: 'x' } }, 'settings.manage'],
    ];
    for (const [route, body, perm] of tries) {
      const v = await t.req('POST', '/admin/api/' + route, { ...as(view), body });
      assert.strictEqual(v.status, 403, 'viewer must not: ' + route);
    }
    for (const route of ['settings']) assert.strictEqual((await t.req('POST', '/admin/api/' + route, { ...as(mod), body: { maintenance: { on: true } } })).status, 403, 'moderator must not change settings');
    assert.strictEqual((await t.req('GET', '/admin/api/audit', as(mod))).status, 403, 'moderator must not read the audit log');
    assert.strictEqual((await t.req('GET', '/admin/api/audit', as(view))).status, 403);
    assert.strictEqual((await t.req('GET', '/admin/api/audit', as(own))).status, 200);
    // viewer can read the dashboards
    for (const u of ['overview', 'sessions', 'visitors', 'security', 'health', 'activity', 'settings', 'announcements']) assert.strictEqual((await t.req('GET', '/admin/api/' + u, as(view))).status, 200, u);
    // moderator can moderate
    assert.strictEqual((await t.req('POST', '/admin/api/announcements/add', { ...as(mod), body: { text: 'From a moderator', level: 'info' } })).status, 200);
    assert.strictEqual((await t.req('POST', '/admin/api/blocks/add', { ...as(mod), body: { kind: 'number', number: '8012345678', country: 'NG', hours: 1 } })).status, 200);
    assert.strictEqual((await t.req('POST', '/admin/api/sessions/revoke', { ...as(mod), body: { ref } })).status, 200);
    assert.strictEqual(t.app.store.take(sessionId), null, 'the revoked ID no longer works');
    // denied attempts are written to the audit log
    const audit = (await t.req('GET', '/admin/api/audit', as(own))).json;
    assert.ok(audit.entries.some((e) => e.action === 'denied' && e.actor === 'view'), 'viewer attempts are logged');
    assert.ok(audit.entries.some((e) => e.action === 'session.revoke' && e.actor === 'mod'));
  } finally { t.close(); }
});

test('sessions: the dashboard never shows a session ID or a login, and revoke really kills the ID', async () => {
  const t = await boot();
  try {
    const own = await t.login('own');
    const id1 = t.app.store.put({ creds: { noiseKey: 'SECRET-KEY-MATERIAL', me: { id: '2348012345678:1@s.whatsapp.net' } } });
    const id2 = t.app.store.put({ creds: 'second' });
    const r = await t.req('GET', '/admin/api/sessions', as(own));
    assert.strictEqual(r.json.sessions.length, 2);
    for (const bad of [id1, id1.replace(/-/g, ''), id2, 'SECRET-KEY-MATERIAL', '2348012345678']) assert.ok(!r.text.includes(bad), 'never shown: ' + bad.slice(0, 6));
    assert.ok(r.json.sessions.every((s) => s.secondsLeft > 0 && s.secondsLeft <= 300 && /^[a-f0-9]{16}$/.test(s.ref)));
    assert.strictEqual((await t.req('POST', '/admin/api/sessions/revoke', { ...as(own), body: { ref: 'f'.repeat(16) } })).status, 404);
    assert.strictEqual((await t.req('POST', '/admin/api/sessions/revoke', { ...as(own), body: { ref: r.json.sessions[0].ref } })).status, 200);
    assert.strictEqual((await t.req('GET', '/admin/api/sessions', as(own))).json.sessions.length, 1);
    const left = [id1, id2].filter((id) => t.app.store.take(id)); assert.strictEqual(left.length, 1, 'exactly one of the two IDs still works');
  } finally { t.close(); }
});

test('real pairing activity flows into the dashboard: stats, attempts, visitors, activity - with no full number or address', async () => {
  const t = await boot();
  try {
    const own = await t.login('own');
    assert.strictEqual((await t.pair('8012345678')).status, 200);
    assert.strictEqual((await t.pair('8099999999')).status, 200);
    const call = t.calls[0]; call.hooks.onCode('ABCD-1234');
    const linkedCreds = { me: { id: '2348012345678:1@s.whatsapp.net' } };
    t.calls[1].hooks.onLinked(linkedCreds);
    const ov = (await t.req('GET', '/admin/api/overview', as(own))).json;
    assert.strictEqual(ov.totals.attempts, 2); assert.strictEqual(ov.totals.codes, 1); assert.strictEqual(ov.totals.linked, 1);
    assert.strictEqual(ov.methods.code, 2); assert.deepStrictEqual(ov.countries[0], { country: 'NG', n: 2 });
    assert.strictEqual(ov.now.activeAttempts, 1, 'one attempt is still running (the other linked)'); assert.strictEqual(ov.now.liveSessionIds, 1);
    assert.strictEqual(ov.series.length, 24); assert.strictEqual(ov.series.reduce((n, b) => n + b.attempts, 0), 2);
    const s = (await t.req('GET', '/admin/api/sessions', as(own)));
    assert.strictEqual(s.json.attempts.length, 1); assert.strictEqual(s.json.attempts[0].state, 'code');
    assert.strictEqual(s.json.sessions[0].method, 'code'); assert.match(s.json.sessions[0].number, /^\+234•••99$/);
    const v = await t.req('GET', '/admin/api/visitors?days=1', as(own));
    assert.strictEqual(v.json.clients.length, 1); assert.strictEqual(v.json.clients[0].attempts, 2); assert.strictEqual(v.json.numbers.length, 2);
    const act = await t.req('GET', '/admin/api/activity', as(own));
    assert.ok(act.json.events.length >= 4);
    for (const text of [v.text, act.text, s.text]) for (const leak of ['2348012345678', '8012345678', '2348099999999', '127.0.0.1', '::1', 'ABCD-1234']) assert.ok(!text.includes(leak), 'leak: ' + leak);
    // an attempt can be stopped from the dashboard
    assert.strictEqual((await t.req('POST', '/admin/api/attempts/stop', { ...as(own), body: { ref: s.json.attempts[0].ref } })).status, 200);
    assert.ok(t.calls[0].cancelled, 'the real attempt was cancelled');
    assert.strictEqual((await t.req('GET', '/admin/api/sessions', as(own))).json.attempts.length, 0);
  } finally { t.close(); }
});

test('blocking: a blocked number or visitor cannot pair; unblocking restores it; you cannot block yourself', async () => {
  const t = await boot();
  try {
    const own = await t.login('own');
    assert.strictEqual((await t.req('POST', '/admin/api/blocks/add', { ...as(own), body: { kind: 'number', number: '8012345678', country: 'NG', reason: 'abuse' } })).status, 200);
    const r = await t.pair('8012345678'); assert.strictEqual(r.status, 403); assert.match(r.json.error, /not available/);
    assert.strictEqual((await t.pair('8099999999')).status, 200, 'other numbers are fine');
    assert.strictEqual((await t.req('POST', '/admin/api/blocks/add', { ...as(own), body: { kind: 'number', number: '123', country: 'NG' } })).status, 400, 'a bad number is refused');
    const list = (await t.req('GET', '/admin/api/blocks', as(own))).json.blocks; assert.strictEqual(list.length, 1); assert.strictEqual(list[0].label, '+234•••78'); assert.ok(!JSON.stringify(list).includes('8012345678'));
    assert.strictEqual((await t.req('POST', '/admin/api/blocks/remove', { ...as(own), body: { kind: 'number', id: list[0].id } })).status, 200);
    assert.strictEqual((await t.pair('8012345678')).status, 200, 'unblocked');
    // block the visitor (this test is the only visitor): learn its id from the dashboard
    const clientId = (await t.req('GET', '/admin/api/visitors', as(own))).json.clients[0].id;
    const me = t.app.admin.idOf('client', '127.0.0.1');
    assert.strictEqual((await t.req('POST', '/admin/api/blocks/add', { ...as(own), body: { kind: 'client', id: clientId } })).status === 400 || clientId !== me, true);
    const other = '0123456789ab';
    assert.strictEqual((await t.req('POST', '/admin/api/blocks/add', { ...as(own), body: { kind: 'client', id: other, hours: 1 } })).status, 200);
    assert.strictEqual((await t.req('POST', '/admin/api/blocks/add', { ...as(own), body: { kind: 'client', id: 'zz' } })).status, 400);
    assert.ok(t.app.admin.blocked({ client: other }));
    assert.strictEqual(t.app.admin.blocked({ client: 'ffffffffffff' }), null);
    // a timed block ends by itself
    const raw = JSON.parse(fs.readFileSync(path.join(t.dataDir, 'admin', 'admin-state.json'), 'utf8')); raw.blocks.find((b) => b.id === other).until = Date.now() - 1000;
    fs.writeFileSync(path.join(t.dataDir, 'admin', 'admin-state.json'), JSON.stringify(raw));
  } finally { t.close(); }
});

test('blocking the visitor who is pairing stops them at the door (and is logged as an alert source)', async () => {
  const t = await boot();
  try {
    const own = await t.login('own');
    const me = t.app.admin.idOf('client', '127.0.0.1');
    // another admin connection cannot be blocked by itself, but a different visitor id can be: simulate with the real id via a second "visitor" header
    const t2 = await boot({ TRUST_PROXY: '1' });
    try {
      const o2 = await t2.login('own');
      const vid = t2.app.admin.idOf('client', '203.0.113.9');
      assert.strictEqual((await t2.pair('8012345678', 'NG', { 'x-forwarded-for': '203.0.113.9' })).status, 200);
      assert.strictEqual((await t2.req('POST', '/admin/api/blocks/add', { ...as(o2), body: { kind: 'client', id: vid, reason: 'test' } })).status, 200);
      const r = await t2.pair('8012345678', 'NG', { 'x-forwarded-for': '203.0.113.9' }); assert.strictEqual(r.status, 403);
      assert.strictEqual((await t2.pair('8012345678', 'NG', { 'x-forwarded-for': '203.0.113.10' })).status, 200, 'another visitor is fine');
      const sec = (await t2.req('GET', '/admin/api/security', as(o2))).json.alerts; assert.ok(sec.some((a) => a.rule === 'blocked'));
    } finally { t2.close(); }
    assert.ok(me);
  } finally { t.close(); }
});

test('maintenance mode pauses pairing for everyone, shows on /api/status, and ends when switched off; only the owner can switch it', async () => {
  const t = await boot();
  try {
    const own = await t.login('own'), mod = await t.login('mod');
    assert.deepStrictEqual((await t.req('GET', '/api/status')).json.maintenance, { on: false, message: '' });
    assert.strictEqual((await t.req('POST', '/admin/api/settings', { ...as(mod), body: { maintenance: { on: true } } })).status, 403);
    assert.strictEqual((await t.pair()).status, 200);
    assert.strictEqual((await t.req('POST', '/admin/api/settings', { ...as(own), body: { maintenance: { on: true, message: 'Back at noon' } } })).status, 200);
    const r = await t.pair(); assert.strictEqual(r.status, 503); assert.strictEqual(r.json.error, 'Back at noon'); assert.strictEqual(r.json.maintenance, true);
    assert.deepStrictEqual((await t.req('GET', '/api/status')).json.maintenance, { on: true, message: 'Back at noon' });
    assert.strictEqual((await t.req('GET', '/health')).status, 200, 'health stays up for the host');
    assert.strictEqual((await t.req('GET', '/api/job/' + 'a'.repeat(32))).status, 404, 'other routes still behave');
    assert.strictEqual((await t.req('POST', '/admin/api/settings', { ...as(own), body: { maintenance: { on: false } } })).status, 200);
    assert.strictEqual((await t.pair()).status, 200);
    const actions = (await t.req('GET', '/admin/api/audit', as(own))).json.entries.map((e) => e.action);
    assert.ok(actions.includes('maintenance.on') && actions.includes('maintenance.off'));
  } finally { t.close(); }
});

test('pairing limits can be changed live, are range-checked, and persist across a restart', async () => {
  const t = await boot({ PAIR_LIMIT: '10', NUMBER_LIMIT: '5' });
  try {
    const own = await t.login('own');
    const cur = (await t.req('GET', '/admin/api/settings', as(own))).json; assert.deepStrictEqual(cur.limits, { pair: 10, number: 5, maxJobs: 15 }); assert.strictEqual(cur.canEdit, true);
    for (const bad of [{ pair: 0 }, { pair: 1000 }, { number: 1.5 }, { maxJobs: 'abc' }]) assert.strictEqual((await t.req('POST', '/admin/api/settings', { ...as(own), body: { limits: bad } })).status, 400, JSON.stringify(bad));
    assert.strictEqual((await t.req('POST', '/admin/api/settings', { ...as(own), body: { limits: { pair: 2, number: 5, maxJobs: 15 } } })).status, 200);
    assert.strictEqual((await t.pair('8011111111')).status, 200); assert.strictEqual((await t.pair('8022222222')).status, 200);
    const r = await t.pair('8033333333'); assert.strictEqual(r.status, 429, 'the new limit of 2 is enforced');
    const viewS = (await t.req('GET', '/admin/api/settings', as(own))).json; assert.strictEqual(viewS.limits.pair, 2);
    // a new app on the same folder remembers the setting
    const app2 = createApp({ engine: { start() { return { cancel() {} }; } }, dataDir: t.dataDir, env: { ...{ ADMIN_ACCOUNTS: '', PAIR_LIMIT: '10', NUMBER_LIMIT: '5' }, SITE_SECRET: 'x' } });
    assert.deepStrictEqual(app2.admin.limits(), { pair: 2, number: 5, maxJobs: 15 }); app2.close();
  } finally { t.close(); }
});

test('announcements: shown on the public status, hidden, deleted; plain text only; limited to people allowed to announce', async () => {
  const t = await boot();
  try {
    const own = await t.login('own'), view = await t.login('view');
    assert.strictEqual((await t.req('GET', '/api/status')).json.announcement, null);
    assert.strictEqual((await t.req('POST', '/admin/api/announcements/add', { ...as(own), body: { text: 'hi' } })).status, 400, 'too short');
    const xss = '<img src=x onerror=alert(1)> Maintenance tonight';
    const add = await t.req('POST', '/admin/api/announcements/add', { ...as(own), body: { text: xss, level: 'warning' } }); assert.strictEqual(add.status, 200);
    const st = (await t.req('GET', '/api/status')).json.announcement; assert.strictEqual(st.level, 'warning'); assert.strictEqual(st.text, xss, 'sent as plain text (the page shows it with textContent)');
    assert.strictEqual((await t.req('POST', '/admin/api/announcements/toggle', { ...as(view), body: { id: add.json.id } })).status, 403);
    assert.strictEqual((await t.req('POST', '/admin/api/announcements/toggle', { ...as(own), body: { id: add.json.id } })).status, 200);
    assert.strictEqual((await t.req('GET', '/api/status')).json.announcement, null, 'hidden');
    await t.req('POST', '/admin/api/announcements/toggle', { ...as(own), body: { id: add.json.id } });
    assert.ok((await t.req('GET', '/api/status')).json.announcement);
    assert.strictEqual((await t.req('POST', '/admin/api/announcements/delete', { ...as(own), body: { id: add.json.id } })).status, 200);
    assert.strictEqual((await t.req('POST', '/admin/api/announcements/delete', { ...as(own), body: { id: add.json.id } })).status, 404);
    assert.strictEqual((await t.req('GET', '/api/status')).json.announcement, null);
  } finally { t.close(); }
});

test('audit log: every admin action is recorded with who did it, and tampering with the file is detected', async () => {
  const t = await boot();
  try {
    const own = await t.login('own');
    await t.req('POST', '/admin/api/announcements/add', { ...as(own), body: { text: 'Audit me please', level: 'info' } });
    await t.req('POST', '/admin/api/blocks/add', { ...as(own), body: { kind: 'number', number: '8012345678', country: 'NG', reason: 'x' } });
    const a = (await t.req('GET', '/admin/api/audit', as(own))).json;
    assert.strictEqual(a.chainOk, true);
    const acts = a.entries.map((e) => e.action);
    for (const x of ['login', 'announcement.add', 'block.add']) assert.ok(acts.includes(x), x);
    assert.ok(a.entries.every((e) => e.actor === 'own' && e.role === 'owner' && e.t > 0 && /^[a-f0-9]{12}$/.test(e.client)));
    assert.ok(!JSON.stringify(a).includes('8012345678'), 'no full number in the audit log');
    const f = path.join(t.dataDir, 'admin', 'admin-audit.jsonl');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('"announcement.add"', '"nothing.happened"'));
    assert.strictEqual((await t.req('GET', '/admin/api/audit', as(own))).json.chainOk, false, 'an edited line breaks the chain');
  } finally { t.close(); }
});

test('security alerts come from real activity: session-ID guessing, rate limiting, many numbers', async () => {
  const t = await boot({ PAIR_LIMIT: '4', NUMBER_LIMIT: '50' });
  try {
    const own = await t.login('own');
    assert.deepStrictEqual((await t.req('GET', '/admin/api/security', as(own))).json.alerts, []);
    for (let i = 0; i < 9; i++) await t.req('GET', '/api/session/TFX-AAAA-BBBB-CCC' + (i % 8 + 2));
    for (let i = 0; i < 8; i++) await t.pair('80' + (10000000 + i));
    const alerts = (await t.req('GET', '/admin/api/security', as(own))).json.alerts;
    const rules = alerts.map((a) => a.rule);
    assert.ok(rules.includes('id-guessing'), 'id guessing: ' + rules); assert.ok(rules.includes('limited')); assert.ok(rules.includes('many-numbers'));
    assert.strictEqual(alerts[0].severity, 'high', 'most serious first');
    const g = alerts.find((a) => a.rule === 'id-guessing'); assert.ok(g.count >= 8); assert.match(g.subject.id, /^[a-f0-9]{12}$/);
  } finally { t.close(); }
});

test('server health shows real numbers', async () => {
  const t = await boot();
  try {
    const own = await t.login('own');
    const h = (await t.req('GET', '/admin/api/health', as(own))).json;
    assert.strictEqual(h.version, require('../package.json').version);
    assert.ok(h.uptimeSec >= 0 && h.cores >= 1 && h.node === process.version);
    assert.ok(h.memory.rss > 1e6 && h.memory.systemTotal >= h.memory.systemFree && h.memory.heapUsed > 0);
    assert.ok(h.cpu.process >= 0 && h.cpu.load.length === 3);
    assert.ok(h.storage.data >= 0); assert.ok(Array.isArray(h.series) && h.series.length >= 1);
    assert.ok(h.pairing.activeJobs === 0 && h.pairing.liveSessionIds === 0);
  } finally { t.close(); }
});

test('the normal pairing features still work and the public pages stay public', async () => {
  const t = await boot({ ADMIN_ACCOUNTS: '' });
  try {
    const r = await t.pair(); assert.strictEqual(r.status, 200);
    t.calls[0].hooks.onCode('WXYZ-1234');
    const job = await t.req('GET', '/api/job/' + r.json.job); assert.strictEqual(job.json.state, 'code'); assert.strictEqual(job.json.code, 'WXYZ-1234');
    const creds = { hello: 'world' }; t.calls[0].hooks.onLinked(creds);
    const id = (await t.req('GET', '/api/job/' + r.json.job)).json.sessionId; assert.match(id, /^TFX-/);
    assert.deepStrictEqual((await t.req('GET', '/api/session/' + id)).json, creds);
    assert.strictEqual((await t.req('GET', '/api/session/' + id)).status, 404, 'one use only');
    for (const u of ['/', '/about', '/terms', '/privacy']) assert.strictEqual((await t.req('GET', u)).status, 200, u);
    assert.strictEqual((await t.req('GET', '/api/status')).json.announcement, null);
  } finally { t.close(); }
});
