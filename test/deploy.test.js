const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const cp = require('child_process');
const { createApp } = require('../server');
const D = require('../public/deploy-data.js');
const A = require('../analytics');
const zipkit = require('../tools/zipkit');
const { build } = require('../tools/prepare-hosting-zip');

const ROOT = path.join(__dirname, '..'), PUB = path.join(ROOT, 'public'), DL = path.join(ROOT, 'downloads');
const REAL_ID = 'TFX-K7M2-9QXA-4BNP', ORIGIN = 'https://tfx.test';
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

// ---------- the real bot, unpacked from the ZIP this site serves ----------
let _bot; function bot() {
  if (_bot) return _bot;
  _bot = tmp('tfx-bot-');
  for (const e of zipkit.read(fs.readFileSync(path.join(DL, 'TurboFex-hosting.zip'))).filter((x) => !x.dir)) { const f = path.join(_bot, e.name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, e.data); }
  return _bot;
}
const botReq = (m) => require(path.join(bot(), m));
// stub programs, so the generated LAUNCH commands can really be run
function stubs() {
  const bin = tmp('tfx-bin-');
  for (const b of ['tmux', 'npm', 'pm2', 'systemctl', 'sudo', 'docker']) { fs.writeFileSync(path.join(bin, b), '#!/bin/sh\necho "$(basename $0) $*" >> "$HOME/calls.log"\n', { mode: 0o755 }); }
  return bin;
}
function run(line, cwd, home, bin) { return cp.spawnSync('bash', ['-c', line], { cwd, env: { ...process.env, HOME: home, USER: 'tester', PATH: bin + ':' + process.env.PATH }, encoding: 'utf8' }); }

// ================= the hosting ZIP =================
test('the shipped hosting ZIP is the real bot package: root-level index.js/package.json, valid archive, no private or development files', () => {
  const buf = fs.readFileSync(path.join(DL, 'TurboFex-hosting.zip')), meta = JSON.parse(fs.readFileSync(path.join(DL, 'hosting.json'), 'utf8'));
  assert.strictEqual(buf.subarray(0, 4).toString('hex'), '504b0304', 'ZIP header');
  assert.strictEqual(buf.length, meta.size); assert.strictEqual(crypto.createHash('sha256').update(buf).digest('hex'), meta.sha256);
  const names = zipkit.read(buf).filter((e) => !e.dir).map((e) => e.name);
  for (const r of ['index.js', 'package.json', 'core/sessionid.js', 'docker-compose.yml', 'Dockerfile', 'Procfile', 'ecosystem.config.js', 'hosting/turbofex.service', 'update.json', 'changelog.txt']) assert.ok(names.includes(r), r);
  assert.ok(!names.some((n) => /\.private\.|^(CLAUDE|GEMINI|AGENTS)\.md$|^\.cursorrules$|^KEY_ROTATION|^PROJECT_GUIDE|^tests\/|^\.git\//i.test(n)), 'nothing private or development-only');
  const pkg = JSON.parse(zipkit.read(buf).find((e) => e.name === 'package.json').data.toString());
  assert.strictEqual(pkg.version, meta.version); assert.match(meta.file, /^TurboFex-hosting-v\d+_\d+_\d+\.zip$/);
  assert.ok(!names.some((n) => /^[^/]+\/package\.json$/.test(n)) || names.includes('package.json'), 'not wrapped in an extra folder like a source-code archive');
  assert.strictEqual(cp.spawnSync('unzip', ['-tq', path.join(DL, 'TurboFex-hosting.zip')], { encoding: 'utf8' }).status, 0, 'unzip -t passes');
});

test('the unpacked bot is complete: every file parses and every relative require resolves', () => {
  const dir = bot(), bad = [];
  (function walk(d) { for (const x of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, x.name); if (x.isDirectory()) walk(f); else if (f.endsWith('.js')) { const r = cp.spawnSync(process.execPath, ['--check', f]); if (r.status) bad.push(f); } } })(dir);
  assert.deepStrictEqual(bad, []);
  assert.ok(botReq('core/integrity.js').ok(), 'the bot name check still passes');
});

test('prepare-hosting-zip: strips private/dev files, and refuses a package that is incomplete, broken or holds a secret', () => {
  const base = [['package.json', '{"name":"turbofex","version":"9.9.9"}'], ['index.js', "require('./core/brand');"], ['config.js', ''], ['update.json', '{}'], ['changelog.txt', 'x'], ['removed-files.txt', ''], ['Dockerfile', ''], ['docker-compose.yml', ''], ['Procfile', ''], ['ecosystem.config.js', ''], ['hosting/turbofex.service', ''], ['core/brand.js', ''], ['core/sessionid.js', ''], ['core/envfile.js', ''], ['core/hostport.js', ''], ['whatsapp/connection.js', '']];
  const mk = (extra, drop) => zipkit.write(base.concat(extra || []).filter((x) => x[0] !== drop).map(([name, data]) => ({ name, data: Buffer.from(data) })));
  const ok = build(mk([['CLAUDE.md', 'x'], ['OWNER_PREFERENCES.private.md', 'x'], ['tests/a.test.js', 'x'], ['tools/release.private.sh', 'x'], ['KEY_ROTATION.md', 'x']]));
  assert.deepStrictEqual(ok.removed, ['CLAUDE.md', 'KEY_ROTATION.md', 'OWNER_PREFERENCES.private.md', 'tests/a.test.js', 'tools/release.private.sh']); assert.strictEqual(ok.version, '9.9.9');
  assert.throws(() => build(mk([], 'index.js')), /missing required file: index.js/);
  assert.throws(() => build(mk([['core/x.js', "require('./nope')"]])), /requires \.\/nope which is not in the ZIP/);
  assert.throws(() => build(mk([['core/x.js', 'const k="-----BEGIN RSA PRIVATE KEY-----"']])), /holds a secret/);
  assert.throws(() => build(zipkit.write([{ name: 'TurboFex-main/package.json', data: Buffer.from('{}') }])), /not at the top level/);
});

// ================= server =================
function boot(opts = {}) {
  const calls = [];
  const engine = { start(number, hooks) { const c = { number, hooks }; calls.push(c); return { cancel() {} }; } };
  const app = createApp({ engine, dataDir: tmp('tfx-dp-'), env: { PAIR_LIMIT: '50', NUMBER_LIMIT: '50', SITE_SECRET: 's' }, ...opts });
  return { app, calls };
}
async function listen(app) { await new Promise((r) => app.server.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${app.server.address().port}`; }
const post = (base, u, b) => fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

test('/download/TurboFex-hosting.zip is a genuine direct download of the hosting ZIP (no redirect, right headers, same bytes, counted once)', async () => {
  const { app } = boot(); const base = await listen(app), meta = JSON.parse(fs.readFileSync(path.join(DL, 'hosting.json'), 'utf8'));
  const r = await fetch(base + '/download/TurboFex-hosting.zip', { redirect: 'manual' });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('location'), null);
  assert.strictEqual(r.headers.get('content-type'), 'application/zip'); assert.match(r.headers.get('content-disposition'), /^attachment; filename="TurboFex-hosting-v\d+_\d+_\d+\.zip"$/); assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  const body = Buffer.from(await r.arrayBuffer());
  assert.ok(body.equals(fs.readFileSync(path.join(DL, 'TurboFex-hosting.zip'))), 'identical bytes'); assert.strictEqual(crypto.createHash('sha256').update(body).digest('hex'), meta.sha256);
  assert.strictEqual(Number(r.headers.get('content-length')), meta.size);
  const h = await fetch(base + '/download/TurboFex-hosting.zip', { method: 'HEAD' }); assert.strictEqual(h.status, 200); assert.strictEqual(Number(h.headers.get('content-length')), meta.size);
  const n = await fetch(base + '/download/TurboFex-hosting.zip', { headers: { 'if-none-match': r.headers.get('etag') } }); assert.strictEqual(n.status, 304);
  await new Promise((rs) => setTimeout(rs, 50));
  assert.strictEqual(app.events.all().filter((e) => e.type === 'hosting.download').length, 1, 'only the full GET counts: HEAD and 304 do not');
  const info = await (await fetch(base + '/api/hosting')).json(); assert.deepStrictEqual([info.version, info.sha256, info.size], [meta.version, meta.sha256, meta.size]);
  app.close();
});

test('the download is unavailable (404, not a broken file) when the ZIP is missing or does not match its record', async () => {
  const d = tmp('tfx-dl-'), { app } = boot({ downloadsDir: d }); const base = await listen(app);
  assert.strictEqual((await fetch(base + '/download/TurboFex-hosting.zip')).status, 404);
  fs.copyFileSync(path.join(DL, 'hosting.json'), path.join(d, 'hosting.json')); fs.writeFileSync(path.join(d, 'TurboFex-hosting.zip'), 'truncated');
  assert.strictEqual((await fetch(base + '/download/TurboFex-hosting.zip')).status, 404, 'size mismatch is refused');
  app.close();
});

test('session check: answers only valid + seconds left, never uses the ID up, is not logged or recorded, and is rate limited', async () => {
  const { app } = boot(); const base = await listen(app); const logs = [], orig = { l: console.log, e: console.error, w: console.warn }; for (const k of ['log', 'error', 'warn']) console[k] = (...a) => logs.push(a.join(' '));
  const id = app.store.put({ me: { id: '2348023456789:1@s.whatsapp.net' }, noiseKey: 'k' }, Date.now());
  try {
    const a = await post(base, '/api/deploy/check', { id }), b = await post(base, '/api/deploy/check', { id: id.toLowerCase() });
    assert.deepStrictEqual(Object.keys(a.json).sort(), ['secondsLeft', 'valid']); assert.strictEqual(a.json.valid, true); assert.ok(a.json.secondsLeft > 250 && a.json.secondsLeft <= 300); assert.strictEqual(b.json.valid, true);
    assert.ok(app.store.take(id), 'after two checks the bot can still collect it');
    assert.deepStrictEqual((await post(base, '/api/deploy/check', { id })).json, { valid: false, secondsLeft: 0 }, 'once collected it is no longer valid');
    assert.deepStrictEqual((await post(base, '/api/deploy/check', { id: 'nonsense' })).json, { valid: false, secondsLeft: 0 });
    assert.deepStrictEqual((await post(base, '/api/deploy/check', {})).json, { valid: false, secondsLeft: 0 });
    for (let i = 0; i < 5; i++) await post(base, '/api/deploy/check', { id });
    assert.strictEqual((await post(base, '/api/deploy/check', { id })).status, 429, 'more than 10 a minute is refused');
  } finally { console.log = orig.l; console.error = orig.e; console.warn = orig.w; }
  assert.ok(!logs.join('\n').includes(id) && !JSON.stringify(app.events.all()).includes(id.slice(4)), 'the ID is in no log and no event');
  app.close();
});

test('store.peek never changes the record', () => {
  const { app } = boot(); const id = app.store.put({ me: { id: '1:1@s.whatsapp.net' } }, Date.now());
  for (let i = 0; i < 5; i++) assert.ok(app.store.peek(id).secondsLeft > 0);
  assert.strictEqual(app.store.list().length, 1); assert.ok(app.store.take(id)); assert.strictEqual(app.store.peek(id), null); app.close();
});

test('choosing a host is public, counted once per visitor and host per day, and carries no session ID', async () => {
  const { app } = boot(); const base = await listen(app);
  assert.strictEqual((await post(base, '/api/deploy/choose', { platform: 'made-up' })).status, 400);
  assert.strictEqual((await post(base, '/api/deploy/choose', { platform: 'vps' })).status, 200); await post(base, '/api/deploy/choose', { platform: 'vps' }); await post(base, '/api/deploy/choose', { platform: 'docker' });
  const picks = app.events.all().filter((e) => e.type === 'deploy.platform'); assert.deepStrictEqual(picks.map((e) => e.platform), ['vps', 'docker']);
  const sum = A.total(Object.values(A.summarize(app.events.all()))); assert.strictEqual(sum.totals.deploy, 2);
  assert.strictEqual((await fetch(base + '/deploy')).status, 200); assert.strictEqual((await fetch(base + '/install')).status, 200);
  app.close();
});

test('the Install page is byte-for-byte what it was before the Deploy Centre existed', () => {
  const h = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(PUB, f))).digest('hex');
  assert.strictEqual(h('new-install.html'), '397a4bd7ae4a17b4a93c81ce8438cca26452afa4741206d34de5750d3cdccb1f');
  assert.strictEqual(h('tf2-install.css'), '81c6bb6aabbcf40d75b77065df5085b2067ad5ff2bb893b48a858ec2774b9b93');
});

// ================= generators, validated against the real bot =================

// ================= the page, run against a small fake browser =================
function fakeBrowser({ job, handler, hash = '', stored }) {
  class N {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this._text = ''; this.hidden = false; this.disabled = false; this.className = ''; this.style = {}; this.id = ''; this.checked = false; const s = this; this.classList = { add: (c) => { s.className += ' ' + c; }, remove: (c) => { s.className = s.className.split(' ').filter((x) => x !== c).join(' '); }, toggle: (c, on) => { s.classList.remove(c); if (on) s.classList.add(c); } }; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); if (k === 'class') this.className = String(v); if (k === 'hidden') this.hidden = true; }
    appendChild(c) { this.children.push(c); return c; } removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
    get firstChild() { return this.children[0] || null; } get lastChild() { return this.children[this.children.length - 1] || null; }
    set textContent(v) { this.children = []; this._text = String(v); } get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    click() { if (this.tag === 'a' && this.attrs.download !== undefined && this.attrs.href && this.attrs.href.startsWith('blob:')) ctx.downloads.push({ name: this.attrs.download, blob: ctx.blobs[this.attrs.href] }); (this.listeners.click || []).forEach((f) => f({})); }
    select() {} focus() {} set value(v) { this._v = v; } get value() { return this._v === undefined ? (this.attrs.value || '') : this._v; }
    find(pred, out = []) { if (pred(this)) out.push(this); this.children.forEach((c) => c.find && c.find(pred, out)); return out; }
  }
  const text = (s) => { const n = new N('#text'); n._text = s; n.find = () => []; return n; };
  const body = new N('body'), app = new N('div'); app.id = 'app'; body.appendChild(app); const toastEl = new N('div'); toastEl.id = 'dp-toast'; body.appendChild(toastEl);
  const store = Object.assign({}, stored || {}), writes = [];
  const ctx = {
    document: { getElementById: (id) => body.find((n) => n.id === id)[0] || null, createElement: (t) => new N(t), createElementNS: (ns, t) => new N(t), createTextNode: text, body, addEventListener() {}, execCommand: () => false, hidden: false },
    console, setTimeout: (f, ms) => { const h = setTimeout(f, ms); h.unref(); return h; }, clearTimeout, setInterval: (f, ms) => { const h = setInterval(f, ms); h.unref(); return h; }, clearInterval,
    sessionStorage: { getItem: (k) => (k === 'tfx-job' ? (job ? JSON.stringify({ job }) : null) : store[k] || null), setItem: (k, v) => { store[k] = v; writes.push([k, v]); } },
    navigator: { clipboard: { writeText: (t) => { ctx.copied.push(t); return Promise.resolve(); } } },
    location: { hash, origin: ORIGIN, protocol: 'https:', host: 'tfx.test' }, matchMedia: () => ({ matches: true }), scrollTo() {}, addEventListener() {},
    Blob: class { constructor(parts, o) { this.parts = parts; this.type = o.type; } }, URL: { createObjectURL: (b) => { const u = 'blob:' + Object.keys(ctx.blobs).length; ctx.blobs[u] = b; return u; }, revokeObjectURL() {} },
    fetch: (u, o) => { ctx.requests.push({ u, o }); return Promise.resolve(handler(u, o)); },
    copied: [], downloads: [], blobs: {}, requests: [], storeWrites: writes,
  };
  ctx.window = ctx; ctx.TFXDeploy = D; ctx.TFXZip = require('../public/zip-lite.js'); vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(PUB, 'deploy.js'), 'utf8'), ctx);
  const all = (pred) => body.find(pred), btn = (label) => all((n) => n.tag === 'button' && n.textContent === label)[0], tab = (id) => all((n) => n.tag === 'button' && n.attrs['data-p'] === id)[0];
  return { ctx, body, all, btn, tab, text: () => body.textContent };
}
const R = (j, status = 200) => ({ ok: status < 300, status, json: () => Promise.resolve(j), text: () => Promise.resolve(typeof j === 'string' ? j : JSON.stringify(j)) });
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const META = { version: '1.8.4', file: 'TurboFex-hosting-v1_8_4.zip', size: 674127, sha256: 'ab'.repeat(32) };
const okHandler = (secondsLeft = 250) => (u, o) => (u === '/api/hosting' ? R(META) : u === '/api/deploy/check' ? R(JSON.parse(o.body).id === REAL_ID ? { valid: true, secondsLeft } : { valid: false, secondsLeft: 0 }) : R({ ok: true }));


const SESSIONLESS = (extra) => (u, o) => (u === D.LAUNCHER_PATH ? R(LAUNCHER) : okHandler()(u, o));
const LIVE_JOB = (secs = 240, extra = {}) => (u, o) => (u.startsWith('/api/job/') ? R({ state: 'linked', sessionId: REAL_ID, idSecondsLeft: secs, expired: false, used: false, ...extra }) : u === D.LAUNCHER_PATH ? R(LAUNCHER) : okHandler()(u, o));

test('pair page: the Deploy button leads into the wizard at the Session step and stays hidden until the page shows a valid ID', () => {
  const html = fs.readFileSync(path.join(PUB, 'pair.html'), 'utf8'), js = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
  assert.match(html, /id="deploybtn" href="\/deploy#session" hidden/); assert.ok(!/Your bot is logged in/.test(html) && !/Bot connected/.test(js));
  assert.match(js, /deploybtn'\)\.hidden = false/); assert.match(js, /deploybtn'\)\.hidden = true/);
});

// ================= the one-file launcher (deploy-index.js) =================
const LAUNCHER = fs.readFileSync(path.join(DL, 'launcher.js'), 'utf8');
const { checkLauncher } = require('../tools/prepare-hosting-zip');
const execFile = require('util').promisify(cp.execFile);

test('buildLauncher changes exactly one thing: the quoted placeholder becomes the (normalised) ID; bad IDs and bad templates are refused', () => {
  const out = D.buildLauncher(LAUNCHER, 'tfx k7m2 9qxa 4bnp');
  assert.strictEqual(out, LAUNCHER.replace("'__TFX_SESSION_ID__'", "'" + REAL_ID + "'"), 'nothing else differs, byte for byte');
  assert.strictEqual(out.split(REAL_ID).length - 1, 1, 'the ID appears once'); assert.doesNotThrow(() => new vm.Script(out));
  assert.match(out, /^const SESSION_ID = 'TFX-K7M2-9QXA-4BNP';$/m);
  assert.throws(() => D.buildLauncher(LAUNCHER, "TFX-K7M2-9QXA-4BN'"), /not a valid session ID/); assert.throws(() => D.buildLauncher(LAUNCHER, ''), /not a valid session ID/);
  assert.throws(() => D.buildLauncher('const SESSION_ID = "";', REAL_ID), /not in the expected format/);
  assert.throws(() => D.buildLauncher(LAUNCHER + "\nconst X = '__TFX_SESSION_ID__';", REAL_ID), /not in the expected format/, 'two placeholders are refused');
});

test('prepare tool: only a launcher with one placeholder, valid syntax and no ID/secret is accepted; the ZIP build takes it out of the public ZIP', () => {
  assert.ok(checkLauncher(Buffer.from(LAUNCHER)));
  assert.throws(() => checkLauncher(Buffer.from('const SESSION_ID = "x";')), /exactly once/);
  assert.throws(() => checkLauncher(Buffer.from("const SESSION_ID = '__TFX_SESSION_ID__'; const = ;")), /syntax error/);
  assert.throws(() => checkLauncher(Buffer.from("// TFX-K7M2-9QXA-4BNP\nconst SESSION_ID = '__TFX_SESSION_ID__';")), /already holds a session ID/);
  const base = [['package.json', '{"name":"turbofex","version":"9.9.9"}'], ['index.js', ''], ['config.js', ''], ['update.json', '{}'], ['changelog.txt', 'x'], ['removed-files.txt', ''], ['Dockerfile', ''], ['docker-compose.yml', ''], ['Procfile', ''], ['ecosystem.config.js', ''], ['hosting/turbofex.service', ''], ['core/brand.js', ''], ['core/sessionid.js', ''], ['core/envfile.js', ''], ['core/hostport.js', ''], ['whatsapp/connection.js', ''], ['deploy-index.js', LAUNCHER]];
  const r = build(zipkit.write(base.map(([name, data]) => ({ name, data: Buffer.from(data) }))));
  assert.ok(Buffer.from(r.launcher).equals(Buffer.from(LAUNCHER)), 'the launcher is handed out separately');
  assert.ok(!zipkit.read(r.zip).some((e) => e.name === 'deploy-index.js'), 'and is not in the public hosting ZIP'); assert.ok(r.removed.includes('deploy-index.js'));
});

test('/download/index.js serves the launcher with its placeholder (never an ID), as an index.js attachment; choosing the launcher is counted', async () => {
  const { app } = boot(); const base = await listen(app);
  const r = await fetch(base + '/download/index.js'), body = await r.text(), meta = JSON.parse(fs.readFileSync(path.join(DL, 'launcher.json'), 'utf8'));
  assert.strictEqual(r.status, 200); assert.match(r.headers.get('content-disposition'), /attachment; filename="index\.js"/); assert.match(r.headers.get('content-type'), /javascript/);
  assert.strictEqual(body, LAUNCHER); assert.strictEqual(crypto.createHash('sha256').update(body).digest('hex'), meta.sha256); assert.ok(body.includes("'__TFX_SESSION_ID__'"));
  assert.strictEqual((await fetch(base + '/download/index.js', { method: 'HEAD' })).status, 200);
  assert.strictEqual((await post(base, '/api/deploy/choose', { platform: 'launcher' })).status, 200); assert.strictEqual((await post(base, '/api/deploy/choose', { platform: 'launcher-first' })).status, 200);
  assert.deepStrictEqual(app.events.all().filter((e) => e.type === 'deploy.platform').map((e) => e.platform), ['launcher', 'launcher-first']);
  app.close();
  const none = boot({ downloadsDir: tmp('tfx-nl-') }); const b2 = await listen(none.app); assert.strictEqual((await fetch(b2 + '/download/index.js')).status, 404); none.app.close();
});

test('END TO END: the launcher the site generates really installs the bot package and saves the ID where the bot reads it (run for real against the hosting ZIP the site serves)', async () => {
  const { app } = boot(); const base = await listen(app);
  const env = (dir) => ({ ...process.env, TFX_BOT_ZIP: base + '/download/TurboFex-hosting.zip', TFX_SKIP_INSTALL: '1', TFX_NO_START: '1', SESSION_ID: '' });
  // 1) with the ID filled in by the site
  const dir = tmp('tfx-e2e-'); fs.writeFileSync(path.join(dir, 'index.js'), D.buildLauncher(LAUNCHER, REAL_ID));
  const r = await execFile(process.execPath, ['index.js'], { cwd: dir, env: env(dir), timeout: 60000 });
  assert.match(r.stdout, /Unpacked \d+ files/); assert.match(r.stdout, /Your session ID is saved/); assert.match(r.stdout, /Install finished/);
  assert.strictEqual(botReq('core/sessionid.js').parseIds(fs.readFileSync(path.join(dir, 'session_id.txt'), 'utf8'))[0].id, REAL_ID, 'the real bot parser reads what the launcher wrote');
  assert.ok(fs.existsSync(path.join(dir, '.tfx-installed')) && fs.existsSync(path.join(dir, 'core', 'boot.js')) && fs.existsSync(path.join(dir, 'package.json')));
  assert.strictEqual(fs.readFileSync(path.join(dir, 'index.js'), 'utf8').includes('__TFX_SESSION_ID__'), false, 'the launcher replaced itself with the bot\'s own index.js');
  assert.ok(!fs.existsSync(path.join(dir, 'tests')) && !fs.readdirSync(dir).some((f) => /private/i.test(f)), 'no private or development files were installed');
  // 2) the file WITHOUT an ID (install first): installs, writes no session file, and says so
  const dir2 = tmp('tfx-e2e2-'); fs.writeFileSync(path.join(dir2, 'index.js'), LAUNCHER);
  const r2 = await execFile(process.execPath, ['index.js'], { cwd: dir2, env: env(dir2), timeout: 60000 });
  assert.match(r2.stdout, /No valid session ID is written in this file/); assert.match(r2.stdout, /Install finished/); assert.ok(!fs.existsSync(path.join(dir2, 'session_id.txt')) || !/SESSION_ID=TFX/.test(fs.readFileSync(path.join(dir2, 'session_id.txt'), 'utf8')));
  // 3) an already-linked bot is never overwritten by an old ID
  const dir3 = tmp('tfx-e2e3-'); fs.mkdirSync(path.join(dir3, 'session'), { recursive: true }); fs.writeFileSync(path.join(dir3, 'session', 'creds.json'), '{}'); fs.writeFileSync(path.join(dir3, 'index.js'), D.buildLauncher(LAUNCHER, REAL_ID));
  await execFile(process.execPath, ['index.js'], { cwd: dir3, env: env(dir3), timeout: 60000 });
  assert.ok(!fs.existsSync(path.join(dir3, 'session_id.txt')) || !fs.readFileSync(path.join(dir3, 'session_id.txt'), 'utf8').includes(REAL_ID), 'a working login is not replaced');
  app.close();
});


// ================= the smart plans, run for real =================
function stubBin(names) { const bin = tmp('tfx-sb-'); for (const b of names) fs.writeFileSync(path.join(bin, b), '#!/bin/sh\necho "$(basename $0) $*" >> "$HOME/calls.log"\n', { mode: 0o755 }); return bin; }
const runAsync = (line, home, env) => execFile('bash', ['-c', line], { cwd: home, env: { ...process.env, HOME: home, ...env }, timeout: 90000 });


// ================= hosts: what each one gets (data) =================
const ctx = (extra) => ({ origin: ORIGIN, ...(extra || {}) });
const HOSTS = { file: ['termux', 'vps', 'panel', 'desktop'], docker: ['docker'], github: ['render', 'koyeb', 'webhost'] };
const flat = (r) => JSON.stringify(r);

test('plan(): ID-first hosts ask for the ID before anything; GitHub hosts set up first; the ZIP and GitHub appear only where they are needed', () => {
  assert.deepStrictEqual([...D.ids].sort(), [...HOSTS.file, ...HOSTS.docker, ...HOSTS.github].sort());
  for (const id of [...HOSTS.file, ...HOSTS.docker]) { const p = D.plan(id, ctx(), ''); assert.strictEqual(p.needsId, true, id); assert.deepStrictEqual(p.steps, [], id + ': nothing is given out before the ID'); }
  for (const id of HOSTS.github) { const p = D.plan(id, ctx(), ''); assert.ok(p.steps.length >= 5, id); assert.ok(p.steps.some((s) => s.action === 'github') && p.steps.some((s) => s.action === 'bot-zip'), id + ': GitHub + the bot files'); assert.ok(p.steps.at(-1).action === 'id', id + ': the ID comes last'); assert.ok(!flat(p).includes('K7M2')); }
  for (const id of [...HOSTS.file, ...HOSTS.docker]) { const s = flat(D.plan(id, ctx(), REAL_ID, {})); assert.ok(!/bot-zip|"github"|TurboFex-hosting\.zip|github\.com\/new/.test(s), id + ' is not sent to GitHub and gets no bot ZIP'); }
  assert.ok(D.plan('docker', ctx(), REAL_ID).steps.some((s) => s.action === 'docker-zip'), 'Docker gets its three small files');
  for (const id of ['panel', 'desktop']) assert.ok(D.plan(id, ctx(), REAL_ID, {}).steps.some((s) => s.action === 'launcher-id'), id + ': the index.js file with the ID');
  for (const id of ['termux', 'vps']) assert.ok(D.plan(id, ctx(), REAL_ID, {}).steps.some((s) => (s.cmds || []).some((c) => c.lines.join('').includes('curl -fL -o index.js ' + ORIGIN + '/download/index.js'))), id + ': one command that fetches index.js');
  assert.deepStrictEqual(D.plan('render', ctx(), REAL_ID).steps.at(-1).vars, [['SESSION_ID', REAL_ID]], 'GitHub hosts finish with exactly one variable');
  assert.throws(() => D.plan('vps', ctx(), 'bad id'), /not a valid session ID/); assert.throws(() => D.plan('nope', ctx(), ''));
});

test('Docker package: three small files (Dockerfile, compose, index.js with the ID), a valid ZIP, the same persistent volumes as the bot\'s own compose file', () => {
  const files = D.dockerFiles(LAUNCHER, REAL_ID), Z = require('../public/zip-lite.js');
  assert.deepStrictEqual(files.map((f) => f.name), ['Dockerfile', 'docker-compose.yml', 'index.js']);
  assert.strictEqual(files[2].text, LAUNCHER.replace("'__TFX_SESSION_ID__'", "'" + REAL_ID + "'")); assert.ok(!files[0].text.includes('K7M2') && !files[1].text.includes('K7M2'), 'the ID is only in index.js');
  const real = fs.readFileSync(path.join(bot(), 'Dockerfile'), 'utf8'), realCompose = fs.readFileSync(path.join(bot(), 'docker-compose.yml'), 'utf8');
  assert.ok(/FROM node:22-slim/.test(files[0].text) && /apt-get install[^\n]*git ffmpeg/.test(files[0].text) && /COPY index\.js/.test(files[0].text) && /CMD \["node", "index\.js"\]/.test(files[0].text));
  assert.ok(/FROM node:22-slim/.test(real) && /git ffmpeg/.test(real), 'same base image and packages as the real Dockerfile');
  for (const v of ['./data:/app/data', './session:/app/session', './accounts:/app/accounts']) { assert.ok(files[1].text.includes(v), v); assert.ok(realCompose.includes(v), v + ' is in the real compose too'); }
  assert.ok(/restart: unless-stopped/.test(files[1].text));
  const y = cp.spawnSync('python3', ['-c', 'import sys,yaml; d=yaml.safe_load(sys.stdin); print(d["services"]["turbofex"]["build"], len(d["services"]["turbofex"]["volumes"]))'], { input: files[1].text, encoding: 'utf8' });
  if (y.status === 0) assert.strictEqual(y.stdout.trim(), '. 3', 'the compose file is valid YAML');
  const zip = Buffer.from(Z.build(files)), dir = tmp('tfx-dz-'); fs.writeFileSync(path.join(dir, 'turbofex-docker.zip'), zip);
  assert.strictEqual(cp.spawnSync('unzip', ['-tq', path.join(dir, 'turbofex-docker.zip')]).status, 0, 'unzip accepts it');
  for (const e of zipkit.read(zip)) assert.strictEqual(e.data.toString('utf8'), files.find((f) => f.name === e.name).text, e.name + ' comes back intact');
});

// ================= the commands, run for real =================
const cmdOf = (id, o, sid, installed) => D.plan(id, { origin: o }, sid, { installed }).steps.flatMap((s) => s.cmds || []);

test('END TO END (Termux): the generated "install with your session ID" command fetches the launcher from the site, fills the ID, installs the real bot package and saves the ID', async () => {
  const { app } = boot(); const base = await listen(app), home = tmp('tfx-tm-');
  const line = cmdOf('termux', base, REAL_ID, false)[1].lines[0], dir = path.join(home, 'turbofex');
  const r = await runAsync(line, home, { TFX_BOT_ZIP: base + '/download/TurboFex-hosting.zip', TFX_SKIP_INSTALL: '1', TFX_NO_START: '1', SESSION_ID: '' });
  assert.match(r.stdout, /Your session ID is saved/); assert.strictEqual(botReq('core/sessionid.js').parseIds(fs.readFileSync(path.join(dir, 'session_id.txt'), 'utf8'))[0].id, REAL_ID);
  assert.ok(fs.existsSync(path.join(dir, 'core', 'boot.js')), 'the real bot was installed');
  app.close();
});

test('VPS commands run for real: only the launcher\'s placeholder changes (same bytes as the browser edit), pm2 is called; "installed" writes the ID and restarts', async () => {
  const { app } = boot(); const base = await listen(app), bin = stubBin(['pm2']), env = { PATH: bin + ':' + process.env.PATH };
  const home = tmp('tfx-vp-'); await runAsync(cmdOf('vps', base, REAL_ID, false)[1].lines[0], home, env);
  assert.strictEqual(fs.readFileSync(path.join(home, 'turbofex', 'index.js'), 'utf8'), LAUNCHER.replace("'__TFX_SESSION_ID__'", "'" + REAL_ID + "'"));
  assert.strictEqual(fs.readFileSync(path.join(home, 'calls.log'), 'utf8').trim(), 'pm2 start index.js --name turbofex\npm2 save');
  const home2 = tmp('tfx-vp2-'); fs.mkdirSync(path.join(home2, 'turbofex'), { recursive: true }); await runAsync(cmdOf('vps', base, REAL_ID, true)[0].lines[0], home2, env);
  assert.strictEqual(botReq('core/sessionid.js').parseIds(fs.readFileSync(path.join(home2, 'turbofex', 'session_id.txt'), 'utf8'))[0].id, REAL_ID); assert.strictEqual(fs.readFileSync(path.join(home2, 'calls.log'), 'utf8').trim(), 'pm2 restart turbofex');
  app.close();
});

test('Termux "already installed" writes the ID for the real bot, then restarts; the no-ID "install first" command installs the bot and says it has no ID', async () => {
  const bin = stubBin(['node']), home = tmp('tfx-ti-'); fs.mkdirSync(path.join(home, 'turbofex'), { recursive: true });
  await runAsync(cmdOf('termux', ORIGIN, REAL_ID, true)[0].lines[0], home, { PATH: bin + ':' + process.env.PATH });
  assert.strictEqual(botReq('core/sessionid.js').parseIds(fs.readFileSync(path.join(home, 'turbofex', 'session_id.txt'), 'utf8'))[0].id, REAL_ID); assert.strictEqual(fs.readFileSync(path.join(home, 'calls.log'), 'utf8').trim(), 'node index.js');
  const { app } = boot(); const base = await listen(app), h2 = tmp('tfx-tf-'), first = D.plan('termux', { origin: base }, '', { first: true }).steps.flatMap((s) => s.cmds || [])[1].lines[0];
  const r = await runAsync(first, h2, { TFX_BOT_ZIP: base + '/download/TurboFex-hosting.zip', TFX_SKIP_INSTALL: '1', TFX_NO_START: '1', SESSION_ID: '' });
  assert.match(r.stdout, /No valid session ID is written in this file/); assert.ok(fs.existsSync(path.join(h2, 'turbofex', 'core', 'boot.js'))); app.close();
});

// ================= the page =================
const hostText = async (b, id) => { b.tab(id).click(); await wait(); return b.text(); };

test('page: the site\'s own components (tabs, step panels, code blocks), eight hosts, Termux first like the Install page', async () => {
  const b = fakeBrowser({ job: null, handler: SESSIONLESS() }); await wait();
  assert.deepStrictEqual(b.all((n) => n.tag === 'button' && n.attrs.role === 'tab').map((n) => n.textContent), ['Termux', 'VPS', 'Docker', 'Hosting panel', 'Render', 'Koyeb', 'Other web host', 'Windows / Mac']);
  assert.strictEqual(b.tab('termux').attrs['aria-selected'], 'true'); assert.ok(b.all((n) => n.className.includes('tabs')).length === 1);
  const css = fs.readFileSync(path.join(PUB, 'new-deploy.html'), 'utf8'); assert.match(css, /tf2-install\.css/); assert.ok(!/Optional settings/.test(b.text()), 'no extra settings clutter');
});

test('menu visitor, ID-first hosts: the box for the session ID comes first, nothing is given out before it is verified', async () => {
  for (const id of ['panel', 'termux', 'vps', 'desktop', 'docker']) {
    const b = fakeBrowser({ job: null, handler: SESSIONLESS() }); await wait(); const t = await hostText(b, id);
    assert.ok(b.all((n) => n.id === 'dp-id').length === 1, id + ': ID box'); assert.ok(b.btn('Verify'), id); assert.match(t, /Pair WhatsApp/);
    assert.ok(!b.btn('Download index.js') && !b.btn('Download turbofex-docker.zip') && !b.all((n) => n.className === 'code').length, id + ': no empty file, no commands yet');
  }
});

test('GitHub hosts: set-up steps first, GitHub and the bot files where they belong, the session ID last', async () => {
  for (const id of ['render', 'koyeb', 'webhost']) {
    const b = fakeBrowser({ job: null, handler: SESSIONLESS() }); await wait(); const t = await hostText(b, id);
    assert.ok(b.all((n) => n.tag === 'a' && n.attrs.href === 'https://github.com/new').length === 1, id + ': GitHub'); assert.ok(b.all((n) => n.tag === 'a' && n.attrs.href === '/download/TurboFex-hosting.zip').length === 1, id + ': the bot files');
    assert.match(t, /Add your session ID/); assert.ok(b.all((n) => n.id === 'dp-id').length === 1, id + ': ID box at the end'); assert.match(t, /Add variables/);
  }
});

test('someone who just paired: the ID is already in (no box), hidden on screen, and every host gets its one thing', async () => {
  const b = fakeBrowser({ job: 'job1234567', handler: LIVE_JOB(), hash: '#session' }); await wait(80);
  let t = b.text(); assert.match(t, /Session ID verified/); assert.ok(!t.includes(REAL_ID) && !t.includes('K7M2')); assert.strictEqual(b.all((n) => n.id === 'dp-id').length, 0);
  // panel / desktop: the index.js file, with the ID in it
  for (const id of ['panel', 'desktop']) { b.ctx.downloads.length = 0; await hostText(b, id); b.btn('Download index.js').click(); await wait(60); assert.strictEqual(b.ctx.downloads[0].blob.parts[0], LAUNCHER.replace("'__TFX_SESSION_ID__'", "'" + REAL_ID + "'"), id); assert.strictEqual(b.ctx.downloads[0].name, 'index.js'); assert.match(b.ctx.downloads[0].blob.type, /^text\/javascript/); }
  // docker: three small files in a ZIP
  b.ctx.downloads.length = 0; await hostText(b, 'docker'); b.btn('Download turbofex-docker.zip').click(); await wait(60);
  const dz = b.ctx.downloads[0]; assert.strictEqual(dz.name, 'turbofex-docker.zip'); assert.strictEqual(dz.blob.type, 'application/zip'); assert.deepStrictEqual(zipkit.read(Buffer.from(dz.blob.parts[0])).map((e) => e.name), ['Dockerfile', 'docker-compose.yml', 'index.js']);
  assert.ok(zipkit.read(Buffer.from(dz.blob.parts[0])).find((e) => e.name === 'index.js').data.toString().includes("'" + REAL_ID + "'"));
  // termux / vps: commands that carry the ID only when copied
  for (const id of ['termux', 'vps']) { b.ctx.copied.length = 0; t = await hostText(b, id); assert.ok(!t.includes(REAL_ID), id + ': hidden'); b.all((n) => n.className.includes('cb')).forEach((c) => c.click()); await wait(); assert.ok(b.ctx.copied.some((c) => c.includes("'" + REAL_ID + "'") && c.includes('curl -fL -o index.js')), id + ': the one install command'); }
  // github hosts: exactly one variable
  for (const id of ['render', 'koyeb', 'webhost']) { b.ctx.copied.length = 0; await hostText(b, id); b.all((n) => n.className.includes('cb')).forEach((c) => c.click()); await wait(); assert.ok(b.ctx.copied.includes('SESSION_ID=' + REAL_ID), id + ': SESSION_ID=…'); }
  assert.ok(b.ctx.requests.filter((r) => String(r.o && r.o.body).includes('K7M2') || String(r.u).includes('K7M2')).length === 0, 'the ID never went to any request');
  assert.ok(!b.ctx.storeWrites.some(([, v]) => v.includes('K7M2')), 'nor into storage'); assert.deepStrictEqual(Object.keys(JSON.parse(b.ctx.storeWrites.at(-1)[1])).sort(), ['installed', 'p']);
});

test('file hosts with no ZIP, no GitHub, no clutter; "already installed" changes what they get; "slow host" explains the no-ID route', async () => {
  const b = fakeBrowser({ job: 'job1234567', handler: LIVE_JOB(), hash: '#session' }); await wait(80);
  for (const id of ['termux', 'vps', 'panel', 'desktop']) { const t = await hostText(b, id); assert.ok(!/\bZIP\b|GitHub/i.test(t), id + ' mentions no ZIP or GitHub'); assert.match(t, /Run the steps now/); assert.match(t, /My host is slow to install/); }
  await hostText(b, 'vps'); assert.match(b.text(), /Install TurboFex with your session ID/);
  b.btn('Already installed? Add the ID only.').click(); await wait(); assert.match(b.text(), /Add your session ID and restart/); assert.ok(!/Install TurboFex with your session ID/.test(b.text()));
  b.ctx.copied.length = 0; b.all((n) => n.className.includes('cb')).forEach((c) => c.click()); await wait(); assert.ok(b.ctx.copied.includes("cd ~/turbofex && printf 'SESSION_ID=%s\\n' '" + REAL_ID + "' > session_id.txt && pm2 restart turbofex"));
  b.btn('Not installed yet? Install with this ID.').click(); await wait(); assert.match(b.text(), /Install TurboFex with your session ID/);
});

test('paste flow: invalid and expired IDs get nothing; a good ID unlocks the host; Clear removes it; running out wipes it', async () => {
  const b = fakeBrowser({ job: null, handler: SESSIONLESS() }); await wait(); await hostText(b, 'panel');
  b.all((n) => n.id === 'dp-id')[0].value = 'nope'; b.btn('Verify').click(); await wait(); assert.match(b.text(), /does not look like a session ID/);
  b.all((n) => n.id === 'dp-id')[0].value = 'TFX-ABCD-EFGH-JKMN'; b.btn('Verify').click(); await wait(60); assert.match(b.text(), /not valid any more/); assert.ok(!b.btn('Download index.js'));
  b.all((n) => n.id === 'dp-id')[0].value = 'tfx k7m2 9qxa 4bnp'; b.btn('Verify').click(); await wait(60); assert.ok(b.btn('Download index.js'));
  assert.ok(b.ctx.requests.filter((r) => String(r.o && r.o.body).includes('K7M2') || String(r.u).includes('K7M2')).every((r) => r.u === '/api/deploy/check'), 'the ID only went to the check, in its body');
  b.btn('Clear').click(); await wait(); assert.ok(!b.btn('Download index.js')); assert.ok(b.all((n) => n.id === 'dp-id').length === 1);
  const e = fakeBrowser({ job: null, handler: (u, o) => (u === '/api/deploy/check' ? R({ valid: true, secondsLeft: 1 }) : SESSIONLESS()(u, o)) }); await wait(); await hostText(e, 'panel');
  e.all((n) => n.id === 'dp-id')[0].value = REAL_ID; e.btn('Verify').click(); await wait(60); assert.ok(e.btn('Download index.js')); await wait(1500);
  assert.match(e.text(), /expired and was wiped/); assert.ok(!e.btn('Download index.js'), 'nothing left to download');
});

test('a used ID is not offered again, the collected note is honest, and a failed check is stated', async () => {
  const c = fakeBrowser({ job: 'job1234567', handler: (u, o) => (u.startsWith('/api/job/') ? R({ state: 'linked', sessionId: null, idSecondsLeft: 0, expired: false, used: true }) : SESSIONLESS()(u, o)), hash: '#session' }); await wait(80);
  assert.ok(!/Session ID verified/.test(c.text()));
  const down = fakeBrowser({ job: null, handler: (u) => (u === '/api/deploy/check' ? Promise.reject(new Error('offline')) : R(META)) }); await wait(); await hostText(down, 'panel');
  down.all((n) => n.id === 'dp-id')[0].value = REAL_ID; down.btn('Verify').click(); await wait(60); assert.match(down.text(), /Could not check it just now/);
  const g = fakeBrowser({ job: null, handler: (u, o) => (u === D.LAUNCHER_PATH ? R('', 500) : okHandler()(u, o)) }); await wait(); await hostText(g, 'panel');
  g.all((n) => n.id === 'dp-id')[0].value = REAL_ID; g.btn('Verify').click(); await wait(60); g.btn('Download index.js').click(); await wait(60); assert.match(g.text(), /launcher could not be loaded/); assert.strictEqual(g.ctx.downloads.length, 0, 'no broken file is handed out');
});

test('menu and footer link to Deploy, and the page is served inside the normal site shell with the site stylesheets', async () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'partials', 'head2.html'), 'utf8'), /<li><a href="\/deploy">[\s\S]*?Deploy your bot/); assert.match(fs.readFileSync(path.join(ROOT, 'partials', 'foot2.html'), 'utf8'), /<a href="\/deploy">Deploy your bot<\/a>/);
  const { app } = boot(); const base = await listen(app); const html = await (await fetch(base + '/deploy')).text();
  for (const s of ['tf2.css', 'tf2-install.css', 'tf2-deploy.css', '/zip-lite.js', '/deploy-data.js', '/deploy.js']) assert.ok(html.includes(s), s); assert.match(html, /class="wrap ph"/); assert.match(html, /class="wrap sec"/); assert.ok(!html.includes('<!--tfx:')); app.close();
});

test('design (static): uses only existing site tokens and components, light and dark, reduced motion off by default (no custom animations), code scrolls', () => {
  const html = fs.readFileSync(path.join(PUB, 'new-deploy.html'), 'utf8'), css = fs.readFileSync(path.join(PUB, 'tf2-deploy.css'), 'utf8'), base = fs.readFileSync(path.join(PUB, 'tf2.css'), 'utf8'), js = fs.readFileSync(path.join(PUB, 'deploy.js'), 'utf8');
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/); assert.match(html, /tf2-theme\.js/); assert.match(html, /name="color-scheme" content="dark light"/);
  const defined = new Set([...base.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])), used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]));
  for (const u of used) assert.ok(defined.has(u), u + ' is a token of the site design system'); assert.match(base, /\[data-theme="light"\]/);
  for (const cls of ['tabs', 'panel steps', 'code', 'bar2', 'warnbox', 'btns', 'btn p', 'num', 'tx', 'cb', 'sub', 'hint', 'err']) assert.ok(js.includes("'" + cls) || js.includes(cls + "'") || js.includes(cls), cls + ' is used');
  assert.ok(!/@keyframes|animation:/.test(css), 'no custom animation CSS: the site\'s own motion rules apply'); assert.ok(!/width:\s*(7|8|9)\d\dpx/.test(css));
});

test('static: the page code keeps the session ID out of storage, the address and history; only the chosen host is saved', () => {
  const js = fs.readFileSync(path.join(PUB, 'deploy.js'), 'utf8');
  assert.ok(!/localStorage|pushState|replaceState|location\.(search|href|hash)\s*=/.test(js));
  assert.ok(/JSON\.stringify\(\{ p: S\.p, installed: S\.installed \}\)/.test(js), 'only the host is saved');
});

test('simple: every host has at most 5 short steps, step text stays short, and long install commands are split over short lines', () => {
  for (const id of D.ids) {
    const sets = [D.plan(id, ctx(), REAL_ID, {}), D.plan(id, ctx(), REAL_ID, { installed: true }), D.plan(id, ctx(), '')];
    for (const p of sets) { assert.ok(p.steps.length <= 5, id + ': ' + p.steps.length + ' steps'); for (const s of p.steps) { assert.ok(s.title.length <= 40, id + ' title: ' + s.title); assert.ok((s.text || '').length <= 130, id + ' text too long: ' + s.text); } }
  }
  for (const id of ['termux', 'vps']) { const line = cmdOf(id, ORIGIN, REAL_ID, false)[1].lines[0]; assert.ok(line.split('\n').every((l) => l.length <= 78), id + ': no long line'); assert.strictEqual(cp.spawnSync('bash', ['-n'], { input: line }).status, 0); }
});
