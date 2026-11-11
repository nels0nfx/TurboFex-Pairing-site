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
    assert.deepStrictEqual(me.json, { configured: true, user: { login: 'alice', verified: false }, submissions: [] });
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
  assert.match(fs.readFileSync(path.join(__dirname, '../public/privacy.html'), 'utf8'), /Developers only/);
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
