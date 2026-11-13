const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');
const { hashPassword, newTotpSecret, totpCode } = require('../admin');
const { checkPlugin } = require('../plugin-check');

const TOKEN = 'a'.repeat(40);
const manifest = (o = {}) => JSON.stringify({ manifestVersion: 1, id: 'hello-plugin', version: '1.0.0', apiVersion: 1, name: 'Hello', description: 'Says hello', author: { name: 'Alice' }, permissions: ['chat.send'], commands: [{ name: 'hello', who: 'everyone', description: 'Say hello' }], ...o });
const CODE = "turbofex.command('hello', async (ctx) => { await ctx.reply('hi'); });\n// ok\n// ok\n";

// a stand-in for GitHub: the sign-in, the profile, and the raw plugin files
function fakeGithub() {
  const files = new Map(); const users = { good: { id: 42, login: 'alice' }, bob: { id: 77, login: 'bob' } }; const log = [];
  let nextUser = 'good';
  async function fetchImpl(url, o = {}) {
    log.push(url);
    const ok = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
    if (url === 'https://github.com/login/oauth/access_token') { const b = JSON.parse(o.body); return String(b.code).startsWith('badcode') ? ok({ error: 'bad_verification_code' }) : ok({ access_token: 'gho_SECRETTOKEN_' + nextUser }); }
    if (url === 'https://api.github.com/user') return ok(users[/_([a-z]+)$/.exec(o.headers.authorization)[1]]);
    if (url.startsWith('https://raw.githubusercontent.com/')) { const f = files.get(url.slice('https://raw.githubusercontent.com/'.length)); return f === undefined ? ok('404', 404) : ok(f); }
    throw new Error('unexpected ' + url);
  }
  return { fetchImpl, files, log, as: (u) => { nextUser = u; } };
}

async function boot(envExtra = {}, dataDir, extra = {}) {
  const gh = fakeGithub();
  const acct = { user: 'own', role: 'owner', hash: hashPassword('Correct-Horse-42'), totp: newTotpSecret() };
  const mod = { user: 'mod', role: 'moderator', hash: acct.hash, totp: newTotpSecret() };
  dataDir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-dev-'));
  const env = { GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'csecret', SITE_URL: 'https://turbofex-pair.example', REGISTRY_PULL_TOKEN: TOKEN, ADMIN_ACCOUNTS: JSON.stringify([acct, mod]), ...envExtra };
  const app = createApp({ engine: { start() { return { cancel() {} }; } }, dataDir, env, fetchImpl: gh.fetchImpl, ...extra });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const req = async (method, url, { cookie, headers, body, csrf } = {}) => {
    const h = { ...(headers || {}) }; if (cookie) h.cookie = cookie; if (csrf) h['x-csrf-token'] = csrf; if (body !== undefined) h['content-type'] = 'application/json';
    const r = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* html */ }
    return { status: r.status, json, text, headers: r, loc: r.headers.get('location'), cookies: r.headers.getSetCookie ? r.headers.getSetCookie() : [] };
  };
  // the whole GitHub sign-in as a given GitHub user; returns the cookie of the developer session
  async function signIn(who = 'good') {
    gh.as(who);
    const a = await req('GET', '/auth/github'); assert.strictEqual(a.status, 302);
    const state = new URL(a.loc).searchParams.get('state'); const oc = a.cookies[0].split(';')[0];
    const b = await req('GET', '/auth/github/callback?code=abc123xyz&state=' + state, { cookie: oc });
    assert.strictEqual(b.status, 302); assert.strictEqual(b.loc, '/developers', 'signed in: ' + b.loc);
    return b.cookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('tfx_dev='));
  }
  const dev = (cookie) => ({ cookie, headers: { 'x-requested-with': 'tfx' } });
  async function admin(user = 'own') {
    const sec = user === 'own' ? acct : mod;
    const a = await req('POST', '/admin/api/login', { body: { user, password: 'Correct-Horse-42' } });
    const b = await req('POST', '/admin/api/2fa', { body: { ticket: a.json.ticket, code: totpCode(sec.totp) } });
    const cookie = b.cookies[0].split(';')[0]; const me = await req('GET', '/admin/api/me', { cookie });
    return { cookie, csrf: me.json.csrf };
  }
  const put = (owner, repo, tag, folder, m, code) => { const b = `${owner}/${repo}/${tag}/${folder ? folder + '/' : ''}`; gh.files.set(b + 'turbofex-plugin.json', m); if (code !== undefined) gh.files.set(b + 'index.js', code); };
  return { app, gh, base, req, signIn, dev, admin, put, dataDir, close: () => app.close() };
}
const send = (t, c, body) => t.req('POST', '/api/dev/submit', { ...t.dev(c), body });
const GOOD = { repo: 'https://github.com/alice/hello', tag: 'v1.0.0' };

test('without the GitHub settings the Developer Centre says so and nothing can be done', async () => {
  const t = await boot({ GITHUB_CLIENT_ID: '', REGISTRY_PULL_TOKEN: '' });
  try {
    assert.deepStrictEqual((await t.req('GET', '/api/dev/me')).json, { configured: false, user: null });
    assert.strictEqual((await t.req('GET', '/auth/github')).loc, '/developers?e=off');
    assert.strictEqual((await t.req('GET', '/api/registry/approved', { headers: { authorization: 'Bearer ' + TOKEN } })).status, 404, 'no pull token set: the download does not exist');
    assert.strictEqual((await t.req('GET', '/developers')).status, 200);
  } finally { t.close(); }
});

test('GitHub sign-in: state is checked, the token is never kept, the cookie is locked down', async () => {
  const t = await boot();
  try {
    const a = await t.req('GET', '/auth/github');
    const u = new URL(a.loc);
    assert.strictEqual(u.origin + u.pathname, 'https://github.com/login/oauth/authorize');
    assert.strictEqual(u.searchParams.get('client_id'), 'cid'); assert.strictEqual(u.searchParams.get('redirect_uri'), 'https://turbofex-pair.example/auth/github/callback');
    assert.ok(!u.searchParams.get('scope'), 'no permission is requested');
    assert.match(a.cookies[0], /HttpOnly/); assert.match(a.cookies[0], /SameSite=Lax/); assert.match(a.cookies[0], /Secure/); assert.match(a.cookies[0], /Path=\/auth/);
    const state = u.searchParams.get('state'), oc = a.cookies[0].split(';')[0];
    // wrong state, no cookie, a cookie that was not made by us, a bad code: all go back with an error and sign nobody in
    assert.strictEqual((await t.req('GET', '/auth/github/callback?code=abc123xyz&state=nope', { cookie: oc })).loc, '/developers?e=login');
    assert.strictEqual((await t.req('GET', '/auth/github/callback?code=abc123xyz&state=' + state)).loc, '/developers?e=login');
    assert.strictEqual((await t.req('GET', '/auth/github/callback?code=abc123xyz&state=' + state, { cookie: 'tfx_oauth=' + state + '.' + '0'.repeat(32) })).loc, '/developers?e=login');
    const bad = await t.req('GET', '/auth/github/callback?code=badcode1&state=' + state, { cookie: oc });
    assert.strictEqual(bad.loc, '/developers?e=login'); assert.ok(!bad.cookies.some((c) => c.startsWith('tfx_dev=') && !/Max-Age=0/.test(c)));
    const cookie = await t.signIn();
    assert.match(cookie, /^tfx_dev=42\.\d+\.[a-f0-9]{32}$/);
    const me = await t.req('GET', '/api/dev/me', { cookie });
    assert.deepStrictEqual(me.json, { configured: true, user: { login: 'alice', verified: false }, submissions: [], ratings: {} });
    // a forged or edited cookie is nobody
    assert.strictEqual((await t.req('GET', '/api/dev/me', { cookie: cookie.replace('tfx_dev=42', 'tfx_dev=43') })).json.user, null);
    // the access token is not written anywhere
    const all = fs.readdirSync(t.dataDir, { recursive: true }).map((f) => path.join(t.dataDir, f)).filter((f) => fs.statSync(f).isFile()).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    assert.ok(!/SECRETTOKEN|gho_/.test(all), 'token not stored');
    assert.match(all, /"login":"alice"/);
  } finally { t.close(); }
});

test('sending a plugin: the checks, the ownership rules and the limits', async () => {
  const t = await boot();
  try {
    const c = await t.signIn();
    assert.strictEqual((await t.req('POST', '/api/dev/submit', { cookie: c, body: GOOD })).status, 403, 'a request from another site (no header) is blocked');
    assert.strictEqual((await t.req('POST', '/api/dev/submit', { cookie: c, headers: { 'x-requested-with': 'tfx', origin: 'https://evil.example' }, body: GOOD })).status, 403);
    assert.strictEqual((await t.req('POST', '/api/dev/submit', { headers: { 'x-requested-with': 'tfx' }, body: GOOD })).status, 401, 'signed out');
    // wrong owner, junk addresses, junk tags and folders
    assert.match((await send(t, c, { repo: 'https://github.com/bob/hello', tag: 'v1.0.0' })).json.error, /your own GitHub account/);
    for (const repo of ['http://github.com/alice/x', 'https://evil.example/alice/x', 'https://github.com/alice/x/../y', 'javascript:alert(1)', '']) assert.strictEqual((await send(t, c, { repo, tag: 'v1' })).status, 400, repo);
    for (const tag of ['', 'a b', '../x', 'v1;rm', '/x']) assert.strictEqual((await send(t, c, { repo: GOOD.repo, tag })).status, 400, tag);
    assert.strictEqual((await send(t, c, { ...GOOD, folder: '../etc' })).status, 400);
    // nothing at that tag
    assert.match((await send(t, c, GOOD)).json.error, /could not find turbofex-plugin\.json/);
    // a manifest that is not valid lists the problems
    t.put('alice', 'hello', 'v1.0.0', '', manifest({ permissions: ['nope'], id: 'X' }), CODE);
    const bad = await send(t, c, GOOD); assert.strictEqual(bad.status, 400); assert.ok(bad.json.problems.some((p) => /unknown permission/.test(p)));
    // a good one
    t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE);
    const ok = await send(t, c, GOOD); assert.strictEqual(ok.status, 200, ok.text);
    assert.strictEqual(ok.json.submission.status, 'pending'); assert.strictEqual(ok.json.submission.pluginId, 'hello-plugin');
    assert.ok(!('entrySource' in ok.json.submission) && !('manifestRaw' in ok.json.submission), 'the developer is not sent the stored code back');
    // the same version twice is refused; a new version works; a folder works
    assert.match((await send(t, c, GOOD)).json.error, /already sent/);
    t.put('alice', 'hello', 'v1.1.0', 'sub/dir', manifest({ version: '1.1.0' }), CODE);
    assert.strictEqual((await send(t, c, { ...GOOD, tag: 'v1.1.0', folder: 'sub/dir' })).status, 200);
    // another developer cannot take the same id
    const cb = await t.signIn('bob');
    t.put('bob', 'copy', 'v1', '', manifest({ version: '9.0.0' }), CODE);
    assert.match((await send(t, cb, { repo: 'https://github.com/bob/copy', tag: 'v1' })).json.error, /belongs to another developer/);
    // a rejected / withdrawn version can be sent again
    const list = (await t.req('GET', '/api/dev/me', { cookie: c })).json.submissions;
    assert.strictEqual(list.length, 2);
    assert.strictEqual((await t.req('POST', '/api/dev/withdraw', { ...t.dev(c), body: { id: list[1].id } })).status, 200);
    assert.strictEqual((await t.req('POST', '/api/dev/withdraw', { ...t.dev(cb), body: { id: list[0].id } })).status, 404, 'cannot touch somebody else\'s submission');
    assert.strictEqual((await send(t, c, GOOD)).status, 200, 'a withdrawn version can be sent again');
    // at most 5 waiting
    for (let i = 0; i < 3; i++) { t.put('alice', 'many' + i, 'v1', '', manifest({ id: 'many-' + i + '-plug' }), CODE); assert.strictEqual((await send(t, c, { repo: 'https://github.com/alice/many' + i, tag: 'v1' })).status, 200); }
    t.put('alice', 'more', 'v1', '', manifest({ id: 'more-plug' }), CODE);
    assert.match((await send(t, c, { repo: 'https://github.com/alice/more', tag: 'v1' })).json.error, /5 plugins waiting/);
  } finally { t.close(); }
});

test('the copy is what counts: the code is stored when sent, and a big file or a GitHub error is refused', async () => {
  const t = await boot();
  try {
    const c = await t.signIn();
    t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE);
    const ok = await send(t, c, GOOD); assert.strictEqual(ok.status, 200);
    t.put('alice', 'hello', 'v1.0.0', '', manifest(), 'evil();');   // the tag is moved afterwards
    const stored = [...t.app.devcentre._subs.values()][0]; assert.strictEqual(stored.entrySource, CODE);
    t.put('alice', 'big', 'v1', '', manifest({ id: 'big-plug' }), 'x'.repeat(1024 * 1024 + 5));
    assert.match((await send(t, c, { repo: 'https://github.com/alice/big', tag: 'v1' })).json.error, /too big|bigger/);
  } finally { t.close(); }
});

test('the flags: the checker marks risky code and reports the highest permission risk', () => {
  const r = checkPlugin(manifest({ permissions: ['chat.send', 'group.manage'] }), "const x = eval('1');\nrequire('fs');\n//\n//\n");
  assert.strictEqual(r.ok, true); assert.strictEqual(r.risk, 'high'); assert.strictEqual(r.flags.length, 2);
  assert.strictEqual(checkPlugin(manifest(), CODE).risk, 'low'); assert.deepStrictEqual(checkPlugin(manifest(), CODE).flags, []);
  assert.strictEqual(checkPlugin(manifest({ events: ['message'] }), CODE).ok, false, 'an event needs its permission');
  assert.strictEqual(checkPlugin(manifest({ pricing: { model: 'paid' } }), CODE).ok, false, 'only free plugins');
  assert.strictEqual(checkPlugin(manifest(), '').ok, false);
});

test('the review screen: only the owner, a note is needed to reject, approval is exact, everything is audited', async () => {
  const t = await boot();
  try {
    const c = await t.signIn(); t.put('alice', 'hello', 'v1.0.0', '', manifest({ name: '<img src=x onerror=alert(1)>' }), CODE);
    const sub = (await send(t, c, GOOD)).json.submission;
    assert.strictEqual((await t.req('GET', '/admin/api/plugins/submissions')).status, 401, 'signed out');
    const m = await t.admin('mod');
    assert.strictEqual((await t.req('GET', '/admin/api/plugins/submissions', { cookie: m.cookie })).status, 403, 'a moderator cannot review plugins');
    const o = await t.admin('own'); const A = { cookie: o.cookie, csrf: o.csrf };
    const list = await t.req('GET', '/admin/api/plugins/submissions', A);
    assert.strictEqual(list.json.counts.pending, 1); assert.strictEqual(list.json.configured, true); assert.strictEqual(list.json.pullOn, true);
    const one = await t.req('GET', '/admin/api/plugins/submission?id=' + sub.id, A);
    assert.strictEqual(one.json.entrySource, CODE); assert.strictEqual(one.json.login, 'alice'); assert.strictEqual(one.json.risk, 'low');
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { cookie: o.cookie, body: { id: sub.id, decision: 'approve' } })).status, 403, 'a change needs the CSRF token');
    assert.match((await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: sub.id, decision: 'reject', note: ' ' } })).json.error, /reason/);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: sub.id, decision: 'approve', note: 'looks fine' } })).status, 200);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: sub.id, decision: 'approve' } })).status, 400, 'only a waiting one');
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/dev', { ...A, body: { githubId: 42, verified: true } })).status, 200);
    assert.strictEqual((await t.req('GET', '/admin/api/plugins/devs', A)).json.developers[0].verified, true);
    const audit = (await t.req('GET', '/admin/api/audit', A)).json.entries.map((e) => e.action);
    assert.ok(audit.includes('plugin.approve') && audit.includes('plugin.developer'), audit.join());
    // a rejection shows the developer the reason
    t.put('alice', 'hello', 'v1.1.0', '', manifest({ version: '1.1.0' }), CODE);
    const s2 = (await send(t, c, { ...GOOD, tag: 'v1.1.0' })).json.submission;
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: s2.id, decision: 'reject', note: 'Please explain the network use.' } })).status, 200);
    const mine = (await t.req('GET', '/api/dev/me', { cookie: c })).json.submissions;
    assert.strictEqual(mine.find((x) => x.id === s2.id).note, 'Please explain the network use.');
    assert.strictEqual(mine.find((x) => x.id === sub.id).note, '', 'a private note on an approval is not shown');
    // a blocked developer is signed out and cannot sign in again
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/dev', { ...A, body: { githubId: 42, blocked: true } })).status, 200);
    assert.strictEqual((await t.req('GET', '/api/dev/me', { cookie: c })).json.user, null);
    t.gh.as('good'); const a = await t.req('GET', '/auth/github');
    const cb = await t.req('GET', '/auth/github/callback?code=abc123xyz&state=' + new URL(a.loc).searchParams.get('state'), { cookie: a.cookies[0].split(';')[0] });
    assert.strictEqual(cb.loc, '/developers?e=blocked');
  } finally { t.close(); }
});

test('the phone command: only with the token, only approved plugins, and "published" is recorded', async () => {
  const t = await boot();
  try {
    const c = await t.signIn(); t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE);
    const sub = (await send(t, c, GOOD)).json.submission;
    const H = { authorization: 'Bearer ' + TOKEN };
    assert.strictEqual((await t.req('GET', '/api/registry/approved')).status, 401);
    assert.strictEqual((await t.req('GET', '/api/registry/approved', { headers: { authorization: 'Bearer ' + 'b'.repeat(40) } })).status, 401);
    assert.deepStrictEqual((await t.req('GET', '/api/registry/approved', { headers: H })).json.plugins, [], 'a waiting plugin is not handed out');
    const o = await t.admin('own');
    await t.req('POST', '/admin/api/plugins/review', { cookie: o.cookie, csrf: o.csrf, body: { id: sub.id, decision: 'approve' } });
    const got = (await t.req('GET', '/api/registry/approved', { headers: H })).json.plugins;
    assert.strictEqual(got.length, 1); assert.strictEqual(got[0].id, 'hello-plugin'); assert.strictEqual(got[0].entrySource, CODE); assert.strictEqual(got[0].submission, sub.id);
    assert.match(got[0].manifestSha, /^[a-f0-9]{64}$/); assert.strictEqual(got[0].developer, 'alice');
    assert.strictEqual((await t.req('POST', '/api/registry/published', { headers: H, body: { ids: ['nothere', sub.id] } })).json.marked, 1);
    assert.deepStrictEqual((await t.req('GET', '/api/registry/approved', { headers: H })).json.plugins, []);
    assert.strictEqual((await t.req('GET', '/api/dev/me', { cookie: c })).json.submissions[0].status, 'published');
    assert.strictEqual((await t.req('POST', '/api/dev/withdraw', { ...t.dev(c), body: { id: sub.id } })).status, 400, 'a published one cannot be withdrawn here');
  } finally { t.close(); }
});

test('records survive a restart', async () => {
  const t = await boot(); const dir = t.dataDir;
  const c = await t.signIn(); t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE); await send(t, c, GOOD);
  t.app.close();
  const t2 = await boot({}, dir);
  try {
    const c2 = await t2.signIn();
    assert.strictEqual((await t2.req('GET', '/api/dev/me', { cookie: c2 })).json.submissions.length, 1);
  } finally { t2.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the pages exist, say nothing risky and add everything as text', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/developers.html'), 'utf8'), js = fs.readFileSync(path.join(__dirname, '../public/developers.js'), 'utf8');
  assert.match(html, /Sign in|dstate/); assert.ok(!/<script>[^<]/.test(html), 'no inline script'); assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(js), 'no HTML injection in the page script');
  assert.match(html, /14 days/);
  for (const f of ['index', 'about', 'terms', 'privacy', 'plugins', 'developers']) assert.match(fs.readFileSync(path.join(__dirname, `../public/${f}.html`), 'utf8'), /id="m-dev"/, f);
  const adminJs = fs.readFileSync(path.join(__dirname, '../public/admin.js'), 'utf8'); assert.ok(!/confirm\(|prompt\(|innerHTML/.test(adminJs.slice(adminJs.indexOf('Plugins (submissions'), adminJs.indexOf('// ---------- Settings'))), 'review screen: no native dialogs, no innerHTML');
  assert.match(fs.readFileSync(path.join(__dirname, '../public/privacy.html'), 'utf8'), /Developers and raters only/);
});

test('the Plugins page shows the developer, the verified mark, the source link and the version history', async () => {
  const view = { updated: 'x', total: 2, plugins: [
    { id: 'hello-plugin', name: 'Hello', description: 'd', author: 'Alice', version: '1.0.0', publishedAt: '2026-11-11', permissions: [], domains: [], history: [{ version: '1.0.0', publishedAt: '2026-11-11' }] },
    { id: 'other-plugin', name: 'Other', description: 'd', author: 'Z', version: '1.0.0', permissions: [], domains: [], history: [] }] };
  const t = await boot({}, undefined, { registry: { list: async () => view } });
  try {
    const c = await t.signIn(); t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE);
    const sub = (await send(t, c, GOOD)).json.submission;
    let plugins = (await t.req('GET', '/api/plugins')).json.plugins;
    assert.ok(!plugins[0].dev, 'a plugin that is only waiting or approved shows nothing');
    const o = await t.admin('own'); const A = { cookie: o.cookie, csrf: o.csrf };
    await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: sub.id, decision: 'approve' } });
    await t.req('POST', '/api/registry/published', { headers: { authorization: 'Bearer ' + TOKEN }, body: { ids: [sub.id] } });
    plugins = (await t.req('GET', '/api/plugins')).json.plugins;
    assert.deepStrictEqual(plugins[0].dev, { developer: 'alice', verified: false, source: 'https://github.com/alice/hello/tree/v1.0.0' });
    assert.ok(!plugins[1].dev, 'a plugin from the owner has no developer record');
    await t.req('POST', '/admin/api/plugins/dev', { ...A, body: { githubId: 42, verified: true } });
    assert.strictEqual((await t.req('GET', '/api/plugins')).json.plugins[0].dev.verified, true);
    await t.req('POST', '/admin/api/plugins/dev', { ...A, body: { githubId: 42, blocked: true } });
    assert.strictEqual((await t.req('GET', '/api/plugins')).json.plugins[0].dev.verified, false, 'a blocked developer is not shown as verified');
    assert.strictEqual(plugins[0].history.length, 1);
  } finally { t.close(); }
});

test('withdrawing a published plugin: hidden at once, handed to the phone command, then confirmed', async () => {
  const view = { updated: 'x', total: 1, plugins: [{ id: 'hello-plugin', name: 'Hello', description: 'd', author: 'Alice', version: '1.0.0', permissions: [], domains: [], history: [] }] };
  const t = await boot({}, undefined, { registry: { list: async () => view } });
  try {
    const c = await t.signIn(); t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE);
    const sub = (await send(t, c, GOOD)).json.submission; const H = { authorization: 'Bearer ' + TOKEN };
    const o = await t.admin('own'); const A = { cookie: o.cookie, csrf: o.csrf };
    assert.match((await t.req('POST', '/admin/api/plugins/revoke', { ...A, body: { id: sub.id, reason: 'bad' } })).json.error, /published/, 'a waiting plugin cannot be withdrawn');
    await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: sub.id, decision: 'approve' } });
    await t.req('POST', '/api/registry/published', { headers: H, body: { ids: [sub.id] } });
    assert.strictEqual((await t.req('GET', '/api/plugins')).json.plugins.length, 1);
    const m = await t.admin('mod'); assert.strictEqual((await t.req('POST', '/admin/api/plugins/revoke', { cookie: m.cookie, csrf: m.csrf, body: { id: sub.id, reason: 'Found a problem' } })).status, 403);
    assert.match((await t.req('POST', '/admin/api/plugins/revoke', { ...A, body: { id: sub.id, reason: ' ' } })).json.error, /reason/);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/revoke', { ...A, body: { id: sub.id, reason: 'Found a problem' } })).status, 200);
    assert.match((await t.req('POST', '/admin/api/plugins/revoke', { ...A, body: { id: sub.id, reason: 'Again please' } })).json.error, /only once/);
    const pub = (await t.req('GET', '/api/plugins')).json; assert.strictEqual(pub.plugins.length, 0); assert.strictEqual(pub.total, 0);
    const pull = (await t.req('GET', '/api/registry/approved', { headers: H })).json;
    assert.deepStrictEqual(pull.revocations, [{ submission: sub.id, id: 'hello-plugin', version: '1.0.0', reason: 'Found a problem' }]);
    assert.ok((await t.req('GET', '/admin/api/audit', A)).json.entries.some((e) => e.action === 'plugin.revoke'));
    assert.strictEqual((await t.req('POST', '/api/registry/published', { headers: H, body: { revoked: [sub.id, 'nothere'] } })).json.revoked, 1);
    assert.deepStrictEqual((await t.req('GET', '/api/registry/approved', { headers: H })).json.revocations, []);
    assert.strictEqual((await t.req('GET', '/api/dev/me', { cookie: c })).json.submissions[0].status, 'revoked');
    assert.match((await send(t, c, GOOD)).json.error, /already sent/, 'the same version cannot come back');
  } finally { t.close(); }
});

test('the Plugin Guide page is served, linked, and its examples are valid plugins', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/plugin-guide.html'), 'utf8');
  assert.ok(!/<script>[^<]/.test(html) && !/onclick=|style=/.test(html), 'no inline script or style');
  assert.match(fs.readFileSync(path.join(__dirname, '../public/developers.html'), 'utf8'), /href="\/plugin-guide"/);
  assert.match(html, /<meta name="description" content="How to write a TurboFex plugin/);
  // the manifest and code in the guide pass the very check that submissions go through
  const blocks = [...html.matchAll(/<pre class="gcode"><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  assert.ok(blocks.length >= 3);
  const r = checkPlugin(blocks[0], blocks[1]); assert.strictEqual(r.ok, true, r.errors && r.errors.join()); assert.deepStrictEqual(r.flags, []);
  // every permission of the real list is in the guide's table
  for (const k of Object.keys(require('../registry').PERMS)) assert.ok(html.includes('<code>' + k + '</code>'), k);
  const t = await boot();
  try { const r2 = await t.req('GET', '/plugin-guide'); assert.strictEqual(r2.status, 200); assert.match(r2.text, /Plugin <span class="gold">Guide/); } finally { t.close(); }
});

test('ratings: GitHub sign-in, one vote each, a short review, the owner can hide, own plugin is excluded', async () => {
  const view = { updated: 'x', total: 2, plugins: [
    { id: 'hello-plugin', name: 'Hello', description: 'd', author: 'Alice', version: '1.0.0', permissions: [], domains: [], history: [] },
    { id: 'other-plugin', name: 'Other', description: 'd', author: 'Z', version: '1.0.0', permissions: [], domains: [], history: [] }] };
  const t = await boot({}, undefined, { registry: { list: async () => view } });
  try {
    const rate = (c, body) => t.req('POST', '/api/dev/rate', { ...t.dev(c), body });
    const bob = await t.signIn('bob');
    assert.strictEqual((await t.req('POST', '/api/dev/rate', { headers: { 'x-requested-with': 'tfx' }, body: { plugin: 'hello-plugin', stars: 5 } })).status, 401, 'signed out');
    assert.strictEqual((await t.req('POST', '/api/dev/rate', { cookie: bob, body: { plugin: 'hello-plugin', stars: 5 } })).status, 403, 'needs the header');
    assert.strictEqual((await rate(bob, { plugin: 'hello-plugin', stars: 6 })).status, 400);
    assert.strictEqual((await rate(bob, { plugin: 'hello-plugin', stars: 0 })).status, 400);
    assert.strictEqual((await rate(bob, { plugin: 'hello-plugin', stars: 2.5 })).status, 400);
    assert.strictEqual((await rate(bob, { plugin: 'nothere-plugin', stars: 5 })).status, 404, 'only plugins in the store');
    assert.strictEqual((await rate(bob, { plugin: '../x', stars: 5 })).status, 400);
    const text = '<img src=x onerror=alert(1)> great\u202e\n\n  stuff ' + 'x'.repeat(400);
    const r1 = await rate(bob, { plugin: 'hello-plugin', stars: 4, text }); assert.strictEqual(r1.status, 200); assert.deepStrictEqual(r1.json.rating, { avg: 4, count: 1 });
    await rate(bob, { plugin: 'hello-plugin', stars: 2, text: 'changed my mind' });   // the same person again: replaces, never adds
    const pub = (await t.req('GET', '/api/plugin-reviews?id=hello-plugin')).json;
    assert.deepStrictEqual(pub.rating, { avg: 2, count: 1 }); assert.strictEqual(pub.reviews.length, 1); assert.strictEqual(pub.reviews[0].login, 'bob'); assert.strictEqual(pub.reviews[0].text, 'changed my mind');
    await rate(bob, { plugin: 'hello-plugin', stars: 3, text });
    const long = (await t.req('GET', '/api/plugin-reviews?id=hello-plugin')).json.reviews[0].text;
    assert.ok(long.length <= 300 && !/[\u202e\n]/.test(long) && long.includes('<img'), 'cleaned and cut (shown as text by the page)');
    // the Plugins list carries the average, and "me" carries my own rating
    assert.deepStrictEqual((await t.req('GET', '/api/plugins')).json.plugins[0].rating, { avg: 3, count: 1 });
    assert.strictEqual((await t.req('GET', '/api/dev/me', { cookie: bob })).json.ratings['hello-plugin'].stars, 3);
    // a developer cannot rate their own plugin (once they have sent it)
    const alice = await t.signIn('good'); t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE); await send(t, alice, GOOD);
    assert.match((await rate(alice, { plugin: 'hello-plugin', stars: 5 })).json.error, /own plugin/);
    assert.strictEqual((await rate(alice, { plugin: 'other-plugin', stars: 5 })).status, 200);
    assert.deepStrictEqual((await t.req('GET', '/api/plugins')).json.plugins[1].rating, { avg: 5, count: 1 });
    // the owner hides a rating: it disappears from the page and the average
    const o = await t.admin('own'); const A = { cookie: o.cookie, csrf: o.csrf };
    assert.strictEqual((await t.req('GET', '/admin/api/plugins/reviews', { cookie: (await t.admin('mod')).cookie })).status, 403);
    const all = (await t.req('GET', '/admin/api/plugins/reviews', A)).json.reviews; assert.strictEqual(all.length, 2);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review-hide', { ...A, body: { plugin: 'hello-plugin', githubId: 77, hidden: true } })).status, 200);
    assert.strictEqual((await t.req('GET', '/api/plugin-reviews?id=hello-plugin')).json.reviews.length, 0);
    assert.ok(!(await t.req('GET', '/api/plugins')).json.plugins[0].rating);
    assert.ok((await t.req('GET', '/admin/api/audit', A)).json.entries.some((e) => e.action === 'plugin.review.hide'));
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review-hide', { ...A, body: { plugin: 'hello-plugin', githubId: 999, hidden: true } })).status, 404);
    // a hidden rating stays hidden when its author edits it; removing works
    await rate(bob, { plugin: 'hello-plugin', stars: 5, text: 'again' }); assert.strictEqual((await t.req('GET', '/api/plugin-reviews?id=hello-plugin')).json.reviews.length, 0);
    assert.strictEqual((await rate(bob, { plugin: 'hello-plugin', remove: true })).status, 200);
    assert.strictEqual((await t.req('GET', '/api/dev/me', { cookie: bob })).json.ratings['hello-plugin'], undefined);
    // a blocked person is signed out
    await t.req('POST', '/admin/api/plugins/dev', { ...A, body: { githubId: 77, blocked: true } });
    assert.strictEqual((await rate(bob, { plugin: 'other-plugin', stars: 1 })).status, 401);
  } finally { t.close(); }
});

test('sign in from the Plugins page lands back on the Plugins page', async () => {
  const t = await boot();
  try {
    t.gh.as('good'); const a = await t.req('GET', '/auth/github?next=plugins');
    const b = await t.req('GET', '/auth/github/callback?code=abc123xyz&state=' + new URL(a.loc).searchParams.get('state'), { cookie: a.cookies.map((c) => c.split(';')[0]).join('; ') });
    assert.strictEqual(b.loc, '/plugins');
    const a2 = await t.req('GET', '/auth/github?next=https://evil.example'); const b2 = await t.req('GET', '/auth/github/callback?code=abc123xyz&state=' + new URL(a2.loc).searchParams.get('state'), { cookie: a2.cookies.map((c) => c.split(';')[0]).join('; ') });
    assert.strictEqual(b2.loc, '/developers', 'any other value goes to the Developer Centre');
  } finally { t.close(); }
});

test('reports: signed-in people report a plugin, the owner sees and closes them', async () => {
  const view = { updated: 'x', total: 1, plugins: [{ id: 'hello-plugin', name: 'Hello', description: 'd', author: 'A', version: '1.0.0', permissions: [], domains: [], history: [] }] };
  const t = await boot({}, undefined, { registry: { list: async () => view } });
  try {
    const rep = (c, body) => t.req('POST', '/api/dev/report', { ...t.dev(c), body });
    const bob = await t.signIn('bob');
    assert.strictEqual((await t.req('POST', '/api/dev/report', { headers: { 'x-requested-with': 'tfx' }, body: { plugin: 'hello-plugin', reason: 'spam' } })).status, 401, 'signed out');
    assert.strictEqual((await t.req('POST', '/api/dev/report', { cookie: bob, body: { plugin: 'hello-plugin', reason: 'spam' } })).status, 403, 'needs the header');
    assert.strictEqual((await rep(bob, { plugin: 'hello-plugin', reason: 'nope' })).status, 400);
    assert.strictEqual((await rep(bob, { plugin: 'hello-plugin', reason: '__proto__' })).status, 400);
    assert.strictEqual((await rep(bob, { plugin: '../x', reason: 'spam' })).status, 400);
    assert.strictEqual((await rep(bob, { plugin: 'nothere-plugin', reason: 'spam' })).status, 404);
    assert.strictEqual((await rep(bob, { plugin: 'hello-plugin', reason: 'spam', text: '<b>bad</b>\u202e ' + 'x'.repeat(400) })).status, 200);
    assert.strictEqual((await rep(bob, { plugin: 'hello-plugin', reason: 'harmful' })).status, 200);   // same person again: replaces
    const o = await t.admin('own'); const A = { cookie: o.cookie, csrf: o.csrf };
    assert.strictEqual((await t.req('GET', '/admin/api/plugins/reports', { cookie: (await t.admin('mod')).cookie })).status, 403);
    const list = (await t.req('GET', '/admin/api/plugins/reports', A)).json.reports;
    assert.strictEqual(list.length, 1); assert.strictEqual(list[0].reason, 'harmful'); assert.strictEqual(list[0].status, 'open'); assert.strictEqual(list[0].login, 'bob');
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/report-set', { ...A, body: { plugin: 'hello-plugin', githubId: list[0].githubId, status: 'closed' } })).status, 200);
    assert.strictEqual((await t.req('GET', '/admin/api/plugins/reports', A)).json.reports[0].status, 'closed');
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/report-set', { ...A, body: { plugin: 'hello-plugin', githubId: list[0].githubId, status: 'x' } })).status, 400);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/report-set', { ...A, body: { plugin: 'hello-plugin', githubId: 999, status: 'closed' } })).status, 404);
    assert.ok((await t.req('GET', '/admin/api/audit', A)).json.entries.some((e) => e.action === 'plugin.report.close'));
    await rep(bob, { plugin: 'hello-plugin', reason: 'spam' });   // reporting again opens it again
    assert.strictEqual((await t.req('GET', '/admin/api/plugins/reports', A)).json.reports[0].status, 'open');
  } finally { t.close(); }
});

test('pause switch: the store hides, sending/rating/reporting stop, withdraw and the phone command still work, it survives a restart', async () => {
  const view = { updated: 'x', total: 1, plugins: [{ id: 'hello-plugin', name: 'Hello', description: 'd', author: 'A', version: '1.0.0', permissions: [], domains: [], history: [] }] };
  const t = await boot({}, undefined, { registry: { list: async () => view } });
  try {
    const bob = await t.signIn('bob');
    const o = await t.admin('own'); const A = { cookie: o.cookie, csrf: o.csrf };
    assert.strictEqual((await t.req('GET', '/api/plugins')).json.plugins.length, 1);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/pause', { cookie: (await t.admin('mod')).cookie, body: { paused: true } })).status, 403);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/pause', { ...A, body: { paused: 'yes' } })).status, 400);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/pause', { ...A, body: { paused: true } })).status, 200);
    assert.strictEqual((await t.req('GET', '/admin/api/plugins/submissions', A)).json.paused, true);
    const pub = (await t.req('GET', '/api/plugins')).json; assert.strictEqual(pub.paused, true); assert.strictEqual(pub.plugins.length, 0);
    for (const [u, b] of [['/api/dev/rate', { plugin: 'hello-plugin', stars: 5 }], ['/api/dev/report', { plugin: 'hello-plugin', reason: 'spam' }], ['/api/dev/submit', { repo: 'https://github.com/bob/x', tag: 'v1.0.0' }]])
      assert.strictEqual((await t.req('POST', u, { ...t.dev(bob), body: b })).status, 503, u);
    assert.strictEqual((await t.req('POST', '/api/dev/logout', { ...t.dev(bob), body: {} })).status, 200, 'sign-out still works');
    assert.ok((await t.req('GET', '/admin/api/audit', A)).json.entries.some((e) => e.action === 'plugin.store.pause'));
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/pause', { ...A, body: { paused: false } })).status, 200);
    assert.strictEqual((await t.req('GET', '/api/plugins')).json.plugins.length, 1);
    assert.strictEqual((await t.req('POST', '/api/dev/rate', { ...t.dev(await t.signIn('bob')), body: { plugin: 'hello-plugin', stars: 5 } })).status, 200);
  } finally { t.close(); }
});

test('ask for changes: sent back with a note, the developer can fix and resend the same version; the owner sees what changed since the last accepted version', async () => {
  const t = await boot();
  try {
    const c = await t.signIn('good'); const o = await t.admin('own'); const A = { cookie: o.cookie, csrf: o.csrf };
    t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE);
    const s1 = (await send(t, c, GOOD)).json.submission;
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: s1.id, decision: 'approve' } })).status, 200);
    assert.strictEqual((await t.req('GET', '/admin/api/plugins/submission?id=' + s1.id, A)).json.changes, null, 'first version: nothing to compare');
    // version 1.1.0 asks for more and changes code
    const CODE2 = CODE.replace('hi', 'hello there') + "turbofex.command('more', async (ctx) => { await ctx.reply('x'); });\n";
    t.put('alice', 'hello', 'v1.1.0', '', manifest({ version: '1.1.0', permissions: ['chat.send', 'storage'] }), CODE2);
    const s2 = (await send(t, c, { ...GOOD, tag: 'v1.1.0' })).json.submission;
    const g = (await t.req('GET', '/admin/api/plugins/submission?id=' + s2.id, A)).json;
    assert.strictEqual(g.changes.version, '1.0.0'); assert.deepStrictEqual(g.changes.permsAdded, ['storage']); assert.deepStrictEqual(g.changes.permsRemoved, []);
    assert.ok(g.changes.code.added >= 2 && g.changes.code.removed >= 1, JSON.stringify([g.changes.code.added, g.changes.code.removed]));
    assert.ok(g.changes.code.lines.some((l) => l.t === '+' && /hello there/.test(l.s)) && g.changes.code.lines.some((l) => l.t === '-' && /'hi'/.test(l.s)));
    // asking for changes: needs a note, only from "waiting", owner only
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { cookie: (await t.admin('mod')).cookie, body: { id: s2.id, decision: 'changes', note: 'x y z' } })).status, 403);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: s2.id, decision: 'changes', note: '' } })).status, 400);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: s1.id, decision: 'changes', note: 'too late' } })).status, 400, 'an approved one cannot be sent back');
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: s2.id, decision: 'changes', note: 'Please drop the storage permission' } })).status, 200);
    const me = (await t.req('GET', '/api/dev/me', { cookie: c })).json.submissions.find((x) => x.id === s2.id);
    assert.strictEqual(me.status, 'changes'); assert.strictEqual(me.note, 'Please drop the storage permission');
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: s2.id, decision: 'approve' } })).status, 400, 'cannot approve while changes are open');
    assert.ok((await t.req('GET', '/admin/api/audit', A)).json.entries.some((e) => e.action === 'plugin.changes'));
    // the developer fixes it and sends the SAME version again
    t.put('alice', 'hello', 'v1.1.0', '', manifest({ version: '1.1.0' }), CODE2);
    const again = await send(t, c, { ...GOOD, tag: 'v1.1.0' }); assert.strictEqual(again.status, 200, again.text);
    const g2 = (await t.req('GET', '/admin/api/plugins/submission?id=' + again.json.submission.id, A)).json;
    assert.deepStrictEqual(g2.changes.permsAdded, []);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: again.json.submission.id, decision: 'approve' } })).status, 200);
  } finally { t.close(); }
});

test('backup download: owner only, one file with everything, nothing secret in it, audited', async () => {
  const t = await boot();
  try {
    const c = await t.signIn('good'); t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE); await send(t, c, GOOD);
    const o = await t.admin('own'); const A = { cookie: o.cookie, csrf: o.csrf };
    assert.strictEqual((await t.req('GET', '/admin/api/plugins/export', { cookie: (await t.admin('mod')).cookie })).status, 403);
    assert.strictEqual((await t.req('GET', '/admin/api/plugins/export')).status >= 400, true, 'signed out');
    const r = await t.req('GET', '/admin/api/plugins/export', { cookie: o.cookie });
    assert.strictEqual(r.status, 200); assert.match(r.headers.headers.get('content-disposition') || '', /attachment; filename="turbofex-plugin-store-backup\.json"/);
    const b = r.json; assert.strictEqual(b.format, 'turbofex-devcentre-backup-1');
    assert.strictEqual(b.developers.length, 1); assert.strictEqual(b.submissions.length, 1); assert.ok(Array.isArray(b.ratings) && Array.isArray(b.reports));
    assert.ok(!/token|secret|password/i.test(JSON.stringify({ ...b, submissions: [] })), 'no secrets in the records');
    assert.ok((await t.req('GET', '/admin/api/audit', A)).json.entries.some((e) => e.action === 'plugin.export'));
  } finally { t.close(); }
});

test('settings in a submitted manifest are checked with the same rules as the bot', () => {
  const good = [{ key: 'greeting', type: 'text', label: 'Greeting', default: 'hello', maxLength: 20, perGroup: true }, { key: 'times', type: 'number', label: 'Repeat', default: 1, min: 1, max: 5 }, { key: 'shout', type: 'toggle', label: 'Shout', default: false }, { key: 'mood', type: 'choice', label: 'Mood', default: 'calm', options: ['calm', 'happy'] }];
  assert.strictEqual(checkPlugin(manifest({ settings: good }), CODE).ok, true);
  for (const bad of ['nope', [{ key: 'Bad', type: 'text', label: 'x', default: '' }], [{ key: 'aa', type: 'file', label: 'x', default: 'a' }], [{ key: 'aa', type: 'number', label: 'x', default: 9, min: 1, max: 5 }], [{ key: 'aa', type: 'toggle', label: 'x', default: 'yes' }], [{ key: 'aa', type: 'choice', label: 'x', default: 'c', options: ['a', 'b'] }], [{ key: 'aa', type: 'choice', label: 'x', default: 'a', options: ['a'] }], [{ key: 'aa', type: 'text', label: 'x', default: 'long text here', maxLength: 5 }], [{ key: 'aa', type: 'text', label: '', default: 'a' }], Array.from({ length: 11 }, (_, i) => ({ key: 'k' + i + 'x', type: 'toggle', label: 'x', default: true }))])
    assert.strictEqual(checkPlugin(manifest({ settings: bad }), CODE).ok, false, JSON.stringify(bad).slice(0, 60));
});

test('README and CHANGELOG next to the plugin: fetched at the tag, limits enforced, shown to the reviewer, handed to the phone command with fingerprints', async () => {
  const t = await boot();
  try {
    const c = await t.signIn('good'); const o = await t.admin('own'); const A = { cookie: o.cookie, csrf: o.csrf };
    t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE);
    const base = 'alice/hello/v1.0.0/';
    t.gh.files.set(base + 'README.md', '# Hello\nGreets people. <b>not html</b>\n'); t.gh.files.set(base + 'CHANGELOG.md', '1.0.0 first\n');
    // too big and not plain text are refused with a plain message
    t.gh.files.set(base + 'README.md', 'x'.repeat(16 * 1024 + 1)); let r = await send(t, c, GOOD); assert.strictEqual(r.status, 400); assert.match(r.json.error, /README\.md is bigger than 16 KB/);
    t.gh.files.set(base + 'README.md', 'a\u0000b'); r = await send(t, c, GOOD); assert.strictEqual(r.status, 400); assert.match(r.json.error, /plain text/);
    t.gh.files.set(base + 'README.md', 'é'.repeat(9000)); r = await send(t, c, GOOD); assert.strictEqual(r.status, 400, 'bytes are counted, not letters');
    t.gh.files.set(base + 'README.md', '# Hello\nGreets people. <b>not html</b>\n');
    r = await send(t, c, GOOD); assert.strictEqual(r.status, 200, r.text);
    const id = r.json.submission.id;
    const g = (await t.req('GET', '/admin/api/plugins/submission?id=' + id, A)).json; assert.match(g.readme, /Greets people/); assert.strictEqual(g.changelog, '1.0.0 first\n');
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id, decision: 'approve' } })).status, 200);
    const pull = (await t.req('GET', '/api/registry/approved', { headers: { authorization: 'Bearer ' + TOKEN } })).json.plugins[0];
    const sha = (x) => require('crypto').createHash('sha256').update(Buffer.from(x)).digest('hex');
    assert.strictEqual(pull.readmeSha, sha(pull.readme)); assert.strictEqual(pull.changelogSha, sha(pull.changelog)); assert.strictEqual(pull.changelog, '1.0.0 first\n');
    // a plugin without documents still works and the fields are simply absent
    t.put('alice', 'hello', 'v1.1.0', '', manifest({ version: '1.1.0' }), CODE);
    const r2 = await send(t, c, { ...GOOD, tag: 'v1.1.0' }); assert.strictEqual(r2.status, 200);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/review', { ...A, body: { id: r2.json.submission.id, decision: 'approve' } })).status, 200);
    const list = (await t.req('GET', '/api/registry/approved', { headers: { authorization: 'Bearer ' + TOKEN } })).json.plugins;
    assert.strictEqual(list.find((x) => x.version === '1.1.0').readme, undefined);
  } finally { t.close(); }
});

test('bot statistics: register, heartbeat, totals, forget', async () => {
  const t = await boot();
  try {
  const post = (path, body, tok) => t.req('POST', path, { body, headers: tok ? { authorization: 'Bearer ' + tok } : {} });
  const r = await post('/bot/register', {});
  assert.strictEqual(r.status, 200); assert.match(r.json.botId, /^[0-9a-f]{16}$/);
  const tok = r.json.botId + '.' + r.json.secret;
  assert.strictEqual((await post('/bot/heartbeat', { v: '1.6.0', plugins: [] }, 'x.y')).status, 401);
  const h = await post('/bot/heartbeat', { v: '1.6.0', plugins: [{ id: 'hello-plugin', version: '1.0.0', enabled: true, errors: 1 }] }, tok);
  assert.strictEqual(h.status, 200);
  assert.strictEqual((await post('/bot/heartbeat', { v: '1.6.0', plugins: [] }, tok)).status, 429);
  const f = await post('/bot/forget', {}, tok); assert.strictEqual(f.status, 200);
  assert.strictEqual((await post('/bot/heartbeat', { v: '1.6.0', plugins: [] }, tok)).status, 401);
  } finally { t.close(); }
});

test('a plugin command that is already a TurboFex command is refused by the check', () => {
  const r = checkPlugin(manifest({ commands: [{ name: 'ping', who: 'everyone', description: 'x' }] }), CODE);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => /already a TurboFex command/.test(e)), JSON.stringify(r.errors));
  assert.strictEqual(checkPlugin(manifest(), CODE).ok, true);
});

test('featured plugins: owner picks, the list marks them, max 6, survives restart, moderators and visitors cannot', async () => {
  const mkp = (id) => ({ id, name: id, description: 'd', author: 'A', version: '1.0.0', permissions: [], domains: [], history: [] });
  const view = { updated: 'x', total: 2, plugins: [mkp('aaa-plugin'), mkp('bbb-plugin')] };
  const t = await boot({}, undefined, { registry: { list: async () => view } });
  let dir;
  try {
    dir = t.dataDir;
    const o = await t.admin('own'); const A = { cookie: o.cookie, csrf: o.csrf };
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/feature', { body: { id: 'bbb-plugin', on: true } })).status, 401);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/feature', { cookie: (await t.admin('mod')).cookie, body: { id: 'bbb-plugin', on: true } })).status, 403);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/feature', { ...A, body: { id: 'bbb-plugin', on: 'yes' } })).status, 400);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/feature', { ...A, body: { id: 'B!', on: true } })).status, 400);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/feature', { ...A, body: { id: 'bbb-plugin', on: true } })).status, 200);
    const l = (await t.req('GET', '/api/plugins')).json.plugins;
    assert.strictEqual(l.find((x) => x.id === 'bbb-plugin').featured, true);
    assert.strictEqual(l.find((x) => x.id === 'aaa-plugin').featured, undefined);
    for (let i = 0; i < 5; i++) assert.strictEqual((await t.req('POST', '/admin/api/plugins/feature', { ...A, body: { id: 'p-' + 'x'.repeat(i + 2), on: true } })).status, 200);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/feature', { ...A, body: { id: 'one-too-many', on: true } })).status, 400);
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/feature', { ...A, body: { id: 'bbb-plugin', on: false } })).status, 200);
    assert.strictEqual((await t.req('GET', '/api/plugins')).json.plugins.find((x) => x.id === 'bbb-plugin').featured, undefined);
  } finally { t.close(); }
  const t2 = await boot({}, dir, { registry: { list: async () => view } });
  try { assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'devcentre', 'featured.json'), 'utf8')).ids.length, 5); } finally { t2.close(); }
});

test('bot ratings: a bot can rate only a plugin it reported; the list shows the average; forget removes it', async () => {
  const view = { updated: 'x', total: 1, plugins: [{ id: 'hello-plugin', name: 'Hello', description: 'd', author: 'A', version: '1.0.0', permissions: [], domains: [], history: [] }] };
  const t = await boot({}, undefined, { registry: { list: async () => view } });
  try {
    const mk = async () => { const r = await t.req('POST', '/bot/register', { body: {} }); return { authorization: 'Bearer ' + r.json.botId + '.' + r.json.secret }; };
    const a = await mk(), b = await mk();
    const rate = (h, plugin, stars) => t.req('POST', '/bot/rate', { headers: h, body: { plugin, stars } });
    assert.strictEqual((await rate({}, 'hello-plugin', 5)).status, 401);
    assert.strictEqual((await rate(a, 'hello-plugin', 5)).status, 400, 'not reported yet');
    for (const h of [a, b]) await t.req('POST', '/bot/heartbeat', { headers: h, body: { v: '1.5.5', plugins: [{ id: 'hello-plugin', version: '1.0.0', enabled: true, errors: 0 }] } });
    assert.strictEqual((await rate(a, 'hello-plugin', 6)).status, 400);
    assert.strictEqual((await rate(a, 'hello-plugin', 5)).status, 200);
    assert.strictEqual((await rate(a, 'hello-plugin', 4)).status, 200, 'changing your rating replaces it');
    assert.strictEqual((await rate(b, 'hello-plugin', 2)).status, 200);
    assert.strictEqual((await rate(a, 'other-plugin', 5)).status, 400);
    const item = () => t.req('GET', '/api/plugins').then((r) => r.json.plugins[0]);
    assert.deepStrictEqual((await item()).botRating, { avg: 3, count: 2 });
  } finally { t.close(); }
});

test('developer replies: only the owner of a waiting/sent-back/rejected version, short, max 10, shown to the reviewer', async () => {
  const t = await boot();
  try {
    const c = await t.signIn(); t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE);
    const sub = (await send(t, c, GOOD)).json.submission;
    const rep = (cookie, id, text) => t.req('POST', '/api/dev/reply', { ...t.dev(cookie), body: { id, text } });
    assert.strictEqual((await t.req('POST', '/api/dev/reply', { body: { id: sub.id, text: 'hi there' } })).status, 403, 'no same-site header');
    assert.strictEqual((await rep(await t.signIn('bob'), sub.id, 'hello')).status, 404, 'not the owner');
    assert.strictEqual((await rep(c, sub.id, 'x')).status, 400);
    assert.strictEqual((await rep(c, sub.id, 'I added the missing network domain.')).status, 200);
    const me = (await t.req('GET', '/api/dev/me', t.dev(c))).json.submissions[0];
    assert.strictEqual(me.replies.length, 1);
    const o = await t.admin('own');
    const g = await t.req('GET', '/admin/api/plugins/submission?id=' + sub.id, { cookie: o.cookie });
    assert.strictEqual(g.json.replies[0].text, 'I added the missing network domain.');
    for (let i = 0; i < 9; i++) assert.strictEqual((await rep(c, sub.id, 'message ' + i)).status, 200);
    assert.strictEqual((await rep(c, sub.id, 'one more')).status, 429);
    await t.req('POST', '/admin/api/plugins/review', { cookie: o.cookie, csrf: o.csrf, body: { id: sub.id, decision: 'approve' } });
    assert.strictEqual((await rep(c, sub.id, 'too late')).status, 400, 'approved: nothing to discuss');
  } finally { t.close(); }
});

test('site backup for the phone command: only with the token', async () => {
  const t = await boot();
  try {
    const c = await t.signIn(); t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE); await send(t, c, GOOD);
    assert.strictEqual((await t.req('GET', '/api/registry/backup')).status, 401);
    assert.strictEqual((await t.req('GET', '/api/registry/backup', { headers: { authorization: 'Bearer wrong' } })).status, 401);
    const r = await t.req('GET', '/api/registry/backup', { headers: { authorization: 'Bearer ' + TOKEN } });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.format, 'turbofex-devcentre-backup-1'); assert.strictEqual(r.json.submissions.length, 1);
    assert.ok(!/ghu_|access_token|secret/i.test(r.text.replace(/"[^"]*secret[^"]*":/gi, '')), 'no tokens in it');
  } finally { t.close(); }
});

test('developer page insights: rating, latest reviews and only the NUMBER of reports for own published plugins', async () => {
  const view = { updated: 'x', total: 1, plugins: [{ id: 'hello-plugin', name: 'Hello', description: 'd', author: 'Alice', version: '1.0.0', permissions: [], domains: [], history: [] }] };
  const t = await boot({}, undefined, { registry: { list: async () => view } });
  try {
    const alice = await t.signIn(); t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE);
    const sub = (await send(t, alice, GOOD)).json.submission;
    const o = await t.admin('own');
    await t.req('POST', '/admin/api/plugins/review', { cookie: o.cookie, csrf: o.csrf, body: { id: sub.id, decision: 'approve' } });
    await t.req('POST', '/api/registry/published', { headers: { authorization: 'Bearer ' + TOKEN }, body: { ids: [sub.id] } });
    assert.strictEqual((await t.req('GET', '/api/dev/me', t.dev(alice))).json.insights, undefined, 'nothing yet');
    const bob = await t.signIn('bob');
    assert.strictEqual((await t.req('POST', '/api/dev/rate', { ...t.dev(bob), body: { plugin: 'hello-plugin', stars: 4, text: 'Works well' } })).status, 200);
    assert.strictEqual((await t.req('POST', '/api/dev/report', { ...t.dev(bob), body: { plugin: 'hello-plugin', reason: 'spam' } })).status, 200);
    const me = (await t.req('GET', '/api/dev/me', t.dev(alice))).json;
    const i = me.insights['hello-plugin'];
    assert.strictEqual(i.rating.count, 1); assert.strictEqual(i.reviews[0].text, 'Works well'); assert.strictEqual(i.reports, 1);
    assert.ok(!JSON.stringify(me.insights).includes('"spam"') && !JSON.stringify(me.insights).includes('githubId'), 'no reason or reporter identity');
    assert.strictEqual((await t.req('GET', '/api/dev/me', t.dev(bob))).json.insights, undefined, 'bob has no published plugin');
  } finally { t.close(); }
});

test('invite-only beta: only listed GitHub names can send plugins; owner controls it; survives restart', async () => {
  const t = await boot(); let dir;
  try {
    dir = t.dataDir;
    const c = await t.signIn(); t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE);
    const o = await t.admin('own'); const A = { cookie: o.cookie, csrf: o.csrf };
    const inv = (body, who = A) => t.req('POST', '/admin/api/plugins/invites', { ...who, body });
    assert.strictEqual((await t.req('POST', '/admin/api/plugins/invites', { body: { on: true } })).status, 401);
    assert.strictEqual((await inv({ on: true }, { cookie: (await t.admin('mod')).cookie })).status, 403);
    assert.strictEqual((await inv({ add: 'bad name!' })).status, 400);
    assert.strictEqual((await inv({ on: true })).status, 200);
    const no = await send(t, c, GOOD); assert.strictEqual(no.status, 403); assert.match(no.json.error, /invite-only/);
    assert.strictEqual((await inv({ add: '@Alice' })).status, 200);
    assert.strictEqual((await send(t, c, GOOD)).status, 200, 'invited (name match ignores case and @)');
    assert.deepStrictEqual((await t.req('GET', '/admin/api/plugins/submissions', { cookie: o.cookie })).json.invites, { on: true, logins: ['alice'] });
    assert.strictEqual((await inv({ remove: 'alice', on: false })).status, 200);
    assert.strictEqual((await send(t, c, { ...GOOD, tag: 'v1.0.0' })).status === 403, false, 'open again');
  } finally { t.close(); }
  const t2 = await boot({}, dir);
  try { assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'devcentre', 'invites.json'), 'utf8')).on, false); } finally { t2.close(); }
});

test('private test codes: owner of the version only, one use, one hour, max 5, nothing for rejected versions', async () => {
  const t = await boot(); let dir;
  try {
    dir = t.dataDir;
    const c = await t.signIn(); t.put('alice', 'hello', 'v1.0.0', '', manifest(), CODE);
    const sub = (await send(t, c, GOOD)).json.submission;
    const mk = (cookie, id) => t.req('POST', '/api/dev/testcode', { ...t.dev(cookie), body: { id } });
    assert.strictEqual((await mk(await t.signIn('bob'), sub.id)).status, 404, 'not your version');
    const r = await mk(c, sub.id); assert.strictEqual(r.status, 200); assert.match(r.json.code, /^TFX-[A-Z2-9]{8}$/);
    assert.strictEqual((await t.req('GET', '/api/test-plugin?code=TFX-AAAAAAAA')).status, 404);
    const got = await t.req('GET', '/api/test-plugin?code=' + r.json.code.toLowerCase());
    assert.strictEqual(got.status, 200); assert.strictEqual(got.json.id, 'hello-plugin'); assert.strictEqual(got.json.developer, 'alice'); assert.strictEqual(got.json.entrySource, CODE); assert.match(got.json.entrySha, /^[a-f0-9]{64}$/);
    assert.strictEqual((await t.req('GET', '/api/test-plugin?code=' + r.json.code)).status, 404, 'the code works once');
    for (let i = 0; i < 5; i++) assert.strictEqual((await mk(c, sub.id)).status, 200);
    assert.strictEqual((await mk(c, sub.id)).status, 429);
    assert.ok(!fs.readFileSync(path.join(dir, 'devcentre', 'testcodes.json'), 'utf8').includes('TFX-'), 'codes are stored hashed');
    const o = await t.admin('own');
    await t.req('POST', '/admin/api/plugins/review', { cookie: o.cookie, csrf: o.csrf, body: { id: sub.id, decision: 'reject', note: 'not good' } });
    assert.strictEqual((await mk(c, sub.id)).status, 400, 'rejected: no test code');
  } finally { t.close(); }
});
