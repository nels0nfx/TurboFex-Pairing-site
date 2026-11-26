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
const ctx = (opts) => ({ origin: ORIGIN, opts: opts || {} });
const ALL = [['termux', {}], ['termux', { tmux: false }], ['vps', {}], ['vps', { manager: 'systemd' }], ['docker', {}], ['panel', {}], ['render', {}], ['koyeb', {}], ['webhost', {}], ['desktop', { os: 'mac' }], ['desktop', { os: 'windows' }]];

test('PREPARE and LAUNCH are strictly separate: Prepare has no session ID and never starts the bot; Launch is short and holds the only ID', () => {
  assert.deepStrictEqual(D.ids, ['termux', 'vps', 'docker', 'panel', 'render', 'koyeb', 'webhost', 'desktop']);
  for (const [id, o] of ALL) {
    const pr = JSON.stringify(D.prepare(id, ctx(o))), la = D.launch(id, ctx(o), REAL_ID);
    assert.ok(!pr.includes('K7M2') && !/SESSION_ID=TFX/.test(pr), id + ': no ID in Prepare');
    assert.ok(!/npm start|pm2 start(?!up)|systemctl start|docker compose up|session_id\.txt/.test(pr.replace(/Start the server once[^"]*/g, '').replace(/Set the startup command to: npm start/g, '').replace(/Start command: npm start[^"]*/g, '').replace(/Build command: npm install\. Start command[^"]*/g, '')), id + ': Prepare never starts the bot or writes the ID file: ' + pr.slice(0, 200));
    assert.ok(JSON.stringify(la).includes(REAL_ID), id + ': Launch has the ID');
    assert.ok(la.cmds.every((c) => c.lines.length === 1), id + ': one short launch line');
    assert.ok(!/apt |pkg install|npm install|docker compose build|unzip|curl/.test(JSON.stringify(la)), id + ': Launch installs nothing');
  }
  const t = D.prepare('termux', ctx()).cmds[0].lines.join('\n'); assert.ok(t.includes(ORIGIN + '/download/TurboFex-hosting.zip') && t.includes('npm install') && !t.includes('github.com'), 'Prepare downloads from this site');
  assert.throws(() => D.launch('termux', ctx(), 'TFX-0000-1111-2222'), /not a valid session ID/); assert.throws(() => D.prepare('nope', ctx()));
});

test('generated files: exact names, MIME types and contents, read back by the REAL bot', () => {
  const l = (id, o) => D.launch(id, ctx(o), REAL_ID), file = (r, n) => r.files.find((f) => f.name === n);
  const sf = file(l('panel'), 'session_id.txt'); assert.strictEqual(sf.text, 'SESSION_ID=' + REAL_ID + '\n'); assert.match(sf.mime, /^text\/plain/);
  assert.strictEqual(botReq('core/sessionid.js').parseIds(sf.text)[0].id, REAL_ID, 'the bot parses session_id.txt');
  assert.strictEqual(file(l('desktop', { os: 'mac' }), 'session_id.txt').text, sf.text);
  const env = file(l('docker', { tz: 'Africa/Lagos', prefix: '!' }), '.env'); assert.strictEqual(env.text, `SESSION_ID=${REAL_ID}\nTIMEZONE=Africa/Lagos\nBOT_PREFIX=!\n`);
  const compose = fs.readFileSync(path.join(bot(), 'docker-compose.yml'), 'utf8'), wanted = new Set([...compose.matchAll(/\$\{([A-Z_]+)[:}-]/g)].map((m) => m[1]));
  for (const line of env.text.trim().split('\n')) assert.ok(wanted.has(line.split('=')[0]), line + ' is a variable docker-compose.yml reads');
  assert.ok(/\.\/data:\/app\/data/.test(compose) && /\.\/session:\/app\/session/.test(compose) && /\.\/accounts:\/app\/accounts/.test(compose), 'the persistent volumes are in the compose file the ZIP ships');
  const cfg = file(D.prepare('panel', ctx({ tz: 'Africa/Lagos', prefix: '!' })), 'config.env'); assert.strictEqual(cfg.text, 'TIMEZONE=Africa/Lagos\nBOT_PREFIX=!\n');
  assert.deepStrictEqual(botReq('core/envfile.js').parse(cfg.text), { TIMEZONE: 'Africa/Lagos', BOT_PREFIX: '!' });
  assert.strictEqual(file(l('vps'), 'turbofex-launch.sh').mime.split(';')[0], 'text/x-shellscript');
  assert.strictEqual(file(D.prepare('render', ctx()), 'turbofex-variables.env').text.includes('SESSION_ID'), false, 'cloud variable file holds no ID');
  assert.deepStrictEqual(l('render').vars, [['SESSION_ID', REAL_ID]]);
  assert.deepStrictEqual(file(D.prepare('koyeb', ctx()), 'turbofex-variables.env').text.trim().split('\n'), ['SESSION_DIR=/data/session', 'TURBOFEX_DATA=/data/data', 'PORT=8000']);
  assert.ok(D.prepare('render', ctx()).vars.some((kv) => kv[0] === 'SESSION_DIR' && kv[1] === '/var/data/session'));
});

test('the bot really honours the generated settings (config.env written by the generated command, loaded by the bot\'s own code)', () => {
  const home = tmp('tfx-home-'), dir = path.join(home, 'TurboFex'); fs.cpSync(bot(), dir, { recursive: true });
  const line = D.prepare('termux', ctx({ tz: 'Africa/Lagos', prefix: '!' })).cmds[0].lines.find((x) => x.includes('config.env'));
  assert.strictEqual(run(line, home, home, stubs()).status, 0);
  const out = cp.spawnSync(process.execPath, ['-e', "require('./core/envfile').load(); const c=require('./config'); console.log(JSON.stringify({tz:c.timezone,p:c.prefix}))"], { cwd: dir, encoding: 'utf8', env: { ...process.env, TIMEZONE: '', BOT_PREFIX: '' } });
  assert.deepStrictEqual(JSON.parse(out.stdout), { tz: 'Africa/Lagos', p: '!' });
});

test('every LAUNCH command really runs: it writes a file the real bot parses, then starts the right thing', () => {
  const bin = stubs();
  const cases = [['termux', {}, "tmux new -A -s bot npm start"], ['termux', { tmux: false }, 'npm start'], ['vps', {}, 'pm2 start ecosystem.config.js\npm2 save'], ['vps', { manager: 'systemd' }, 'sudo systemctl start turbofex'], ['desktop', { os: 'mac' }, 'npm start']];
  for (const [id, o, expect] of cases) {
    const home = tmp('tfx-h-'), dir = path.join(home, 'TurboFex'); fs.mkdirSync(dir, { recursive: true });
    const r = run(D.launch(id, ctx(o), REAL_ID).cmds[0].lines[0], id === 'desktop' ? dir : home, home, bin); assert.strictEqual(r.status, 0, id + ' ' + r.stderr);   // the Mac/Windows command is run inside the TurboFex folder
    const text = fs.readFileSync(path.join(dir, 'session_id.txt'), 'utf8'); assert.strictEqual(botReq('core/sessionid.js').parseIds(text)[0].id, REAL_ID, id);
    assert.strictEqual(fs.readFileSync(path.join(home, 'calls.log'), 'utf8').trim(), expect, id + ' started with the right command');
  }
  const home = tmp('tfx-h-'), dir = path.join(home, 'TurboFex'); fs.mkdirSync(dir, { recursive: true });
  const r = run(D.launch('docker', ctx({ tz: 'Africa/Lagos' }), REAL_ID).cmds[0].lines[0], home, home, bin); assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(fs.readFileSync(path.join(dir, '.env'), 'utf8'), `SESSION_ID=${REAL_ID}\nTIMEZONE=Africa/Lagos\n`); assert.match(fs.readFileSync(path.join(home, 'calls.log'), 'utf8'), /docker compose up -d\ndocker compose logs -f/);
  // the launch script that can be downloaded
  const sh = D.launch('vps', ctx(), REAL_ID).files[0].text; assert.strictEqual(cp.spawnSync('bash', ['-n'], { input: sh }).status, 0, 'bash -n');
});

test('PREPARE scripts and commands are valid shell, and the systemd edit works on the real service file', () => {
  for (const [id, o] of [['vps', {}], ['vps', { manager: 'systemd' }]]) { const f = D.prepare(id, ctx(o)).files[0].text; assert.strictEqual(cp.spawnSync('bash', ['-n'], { input: f }).status, 0, id + JSON.stringify(o)); assert.ok(!f.includes('session_id')); }
  for (const [id, o] of ALL) for (const c of D.prepare(id, ctx(o)).cmds || []) if (!/PowerShell/.test(c.label)) assert.strictEqual(cp.spawnSync('bash', ['-n'], { input: c.lines.join('\n') }).status, 0, id + ' ' + c.label);
  const home = tmp('tfx-sd-'), dir = path.join(home, 'TurboFex'); fs.cpSync(bot(), dir, { recursive: true });
  const sedLine = D.prepare('vps', ctx({ manager: 'systemd' })).cmds[0].lines.find((l) => l.includes('sed -i'));
  assert.strictEqual(run(sedLine, home, home, stubs()).status, 0);
  const unit = fs.readFileSync(path.join(dir, 'hosting/turbofex.service'), 'utf8'); assert.ok(!unit.includes('YOUR_USER')); assert.ok(unit.includes('User=tester') && unit.includes('WorkingDirectory=' + home + '/TurboFex'), unit);
});

test('unsafe settings can never reach a command: bad time zone or prefix is rejected, quotes are escaped', () => {
  for (const bad of ["a'b", '$(x)', '/a', 'ab cd', '', 'abcd', '`x`', '"', 'a\nb']) assert.strictEqual(D.validPrefix(bad), false, JSON.stringify(bad));
  assert.ok(D.validPrefix('.') && D.validPrefix('!') && D.validPrefix('#'));
  for (const bad of ['Not/AZone', "x';rm -rf /", '$(id)', '']) assert.strictEqual(D.validZone(bad), false, bad);
  assert.ok(D.validZone('Africa/Lagos') && D.validZone('UTC'));
  assert.ok(D.validPrefix('..') && D.sh('..') === "'..'", 'allowed by the bot, and always quoted'); assert.strictEqual(D.sh("it's"), "'it'\\''s'"); assert.strictEqual(D.ps("it's"), "'it''s'");
  assert.strictEqual(D.normalizeId('tfx k7m2 9qxa 4bnp'), REAL_ID); assert.strictEqual(D.normalizeId('K7M29QXA4BNP'), REAL_ID); assert.strictEqual(D.normalizeId('TFX-0OIL-1111-2222'), null); assert.strictEqual(D.normalizeId("TFX-K7M2-9QXA-4BN'"), null);
});

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
  ctx.window = ctx; ctx.TFXDeploy = D; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(PUB, 'deploy.js'), 'utf8'), ctx);
  const all = (pred) => body.find(pred), btn = (label) => all((n) => n.tag === 'button' && n.textContent === label)[0], plat = (id) => all((n) => n.attrs['data-p'] === id)[0];
  return { ctx, body, all, btn, plat, text: () => body.textContent };
}
const R = (j, status = 200) => ({ ok: status < 300, status, json: () => Promise.resolve(j), text: () => Promise.resolve(typeof j === 'string' ? j : JSON.stringify(j)) });
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const META = { version: '1.8.4', file: 'TurboFex-hosting-v1_8_4.zip', size: 674127, sha256: 'ab'.repeat(32) };
const okHandler = (secondsLeft = 250) => (u, o) => (u === '/api/hosting' ? R(META) : u === '/api/deploy/check' ? R(JSON.parse(o.body).id === REAL_ID ? { valid: true, secondsLeft } : { valid: false, secondsLeft: 0 }) : R({ ok: true }));


const SESSIONLESS = (extra) => (u, o) => (u === D.LAUNCHER_PATH ? R(LAUNCHER) : okHandler()(u, o));
const LIVE_JOB = (secs = 240, extra = {}) => (u, o) => (u.startsWith('/api/job/') ? R({ state: 'linked', sessionId: REAL_ID, idSecondsLeft: secs, expired: false, used: false, ...extra }) : u === D.LAUNCHER_PATH ? R(LAUNCHER) : okHandler()(u, o));

test('menu visitor (no session ID): sees the host list first, no ID box, each host labelled with what it needs', async () => {
  const b = fakeBrowser({ job: null, handler: SESSIONLESS() }); await wait();
  const t = b.text(); assert.match(t, /Where will TurboFex run/); assert.match(t, /Pick your host\. You get exactly what it needs/); assert.strictEqual(b.all((n) => n.attrs['data-p']).length, 8);
  assert.ok(!/Your session ID is ready/.test(t) && b.all((n) => n.id === 'dp-id').length === 0, 'no ID box, no ID banner');
  assert.match(t, /Android phone · One command/); assert.match(t, /Pterodactyl and similar · One file: index\.js/); assert.match(t, /Containers · Bot files \(ZIP\)/); assert.match(t, /Cloud web service · GitHub \+ bot files/);
  assert.ok(b.btn('I already have a session ID'));
});

test('someone who just paired and pressed Deploy: the ID is already in, the first screen is different, and they skip "get your files"', async () => {
  const b = fakeBrowser({ job: 'job1234567', handler: LIVE_JOB(), hash: '#session' }); await wait(80);
  const t = b.text(); assert.match(t, /Your session ID is ready/); assert.match(t, /Pick your host and you get the one step you need now/); assert.ok(!t.includes(REAL_ID), 'hidden on screen'); assert.ok(!/Pick your host\. You get exactly what it needs/.test(t));
  b.plat('panel').click(); await wait(); const t2 = b.text(); assert.match(t2, /Do this now/); assert.ok(!/Do this first/.test(t2)); assert.match(t2, /Download your launcher and upload it/); assert.ok(b.btn('Download index.js'));
});

test('each host gets its OWN thing (menu visitor): terminals get commands, panels/computers get the file, Docker gets the ZIP, GitHub hosts go to GitHub', async () => {
  const seen = {};
  for (const id of D.ids) {
    const b = fakeBrowser({ job: null, handler: SESSIONLESS() }); await wait(); b.plat(id).click(); await wait();
    const t = b.text(), has = (re) => re.test(t), term = b.all((n) => n.className.includes('dp-term')).length, gh = b.all((n) => n.tag === 'a' && n.attrs.href === 'https://github.com/new').length, zip = b.all((n) => n.tag === 'a' && n.attrs.href === '/download/TurboFex-hosting.zip').length, lf = b.all((n) => n.tag === 'a' && n.attrs.href === '/download/index.js').length;
    seen[id] = { term, gh, zip, lf }; assert.match(t, /Do this first · no session ID needed/, id); assert.ok(!t.includes('K7M2'), id);
    assert.ok(b.all((n) => n.tag === 'a' && n.attrs.href === '/pair').length >= 1, id + ' leads on to pairing');
  }
  assert.deepStrictEqual(['termux', 'vps'].map((i) => [seen[i].term >= 2, seen[i].gh, seen[i].zip]), [[true, 0, 0], [true, 0, 0]], 'terminal hosts: commands, no GitHub, no ZIP');
  assert.deepStrictEqual(['panel', 'desktop'].map((i) => [seen[i].lf, seen[i].gh, seen[i].zip]), [[1, 0, 0], [1, 0, 0]], 'file hosts: the one file, no GitHub, no ZIP');
  assert.deepStrictEqual([seen.docker.zip >= 1, seen.docker.gh, seen.docker.lf], [true, 0, 0], 'Docker: the bot ZIP only');
  for (const i of ['render', 'koyeb', 'webhost']) assert.deepStrictEqual([seen[i].gh, seen[i].zip >= 1, seen[i].lf], [1, true, 0], i + ': GitHub + the bot ZIP');
});

test('with an ID, each host gets ONE short last step: file hosts get index.js with the ID (or a command), Docker the .env, cloud hosts a single variable', async () => {
  for (const id of D.ids) {
    const b = fakeBrowser({ job: 'job1234567', handler: LIVE_JOB(), hash: '#session' }); await wait(80); b.plat(id).click(); await wait();
    const t = b.text(); assert.match(t, /Do this now/, id); assert.ok(!t.includes(REAL_ID) && !t.includes('K7M2'), id + ': ID hidden'); assert.ok(!/Do this first/.test(t), id);
    b.all((n) => n.className.includes('dp-cp')).forEach((c) => c.click()); await wait();
    const copied = b.ctx.copied.join('\n');
    if (id === 'panel' || id === 'desktop') { assert.ok(b.btn('Download index.js'), id); b.btn('Download index.js').click(); await wait(60); assert.ok(b.ctx.downloads[0].blob.parts[0].includes("const SESSION_ID = '" + REAL_ID + "';"), id + ': the downloaded file has the ID'); }
    else assert.ok(copied.includes(REAL_ID), id + ': Copy carries the real ID');
    if (id === 'docker') assert.ok(b.all((n) => n.className.includes('dp-file')).some((n) => n.textContent.includes('.env')));
    if (['render', 'koyeb', 'webhost'].includes(id)) { assert.deepStrictEqual(b.all((n) => n.className.includes('dp-vars'))[0].children.length, 1, id + ': exactly one variable'); assert.match(t, /assumes your service is already set up/); }
  }
});

test('file hosts with an ID ask the one question that matters (already installed?), and the answer changes what they get', async () => {
  const b = fakeBrowser({ job: 'job1234567', handler: LIVE_JOB(), hash: '#session' }); await wait(80); b.plat('vps').click(); await wait();
  assert.match(b.text(), /Is TurboFex already installed on this host/); assert.match(b.text(), /Install TurboFex with your session ID/); assert.ok(!/Add your session ID and restart/.test(b.text()));
  b.btn('It is already installed').click(); await wait(); assert.match(b.text(), /Add your session ID and restart/); assert.ok(!/Install TurboFex with your session ID/.test(b.text()));
  b.all((n) => n.className.includes('dp-cp')).forEach((c) => c.click()); await wait();
  assert.ok(b.ctx.copied.some((c) => c === "cd ~/turbofex && printf 'SESSION_ID=%s\\n' '" + REAL_ID + "' > session_id.txt && pm2 restart turbofex"));
  // someone who already got the no-ID file and comes back is assumed installed
  const c = fakeBrowser({ job: null, handler: SESSIONLESS() }); await wait(); c.plat('panel').click(); await wait(); c.all((n) => n.tag === 'a' && n.attrs.href === '/download/index.js')[0].click(); await wait();
  assert.strictEqual(JSON.parse(c.ctx.storeWrites.at(-1)[1]).gotFiles, true);
});

test('ID box path: "I already have a session ID" verifies it, then the host screens use it; invalid and expired IDs get nothing', async () => {
  const b = fakeBrowser({ job: null, handler: SESSIONLESS() }); await wait(); b.btn('I already have a session ID').click(); await wait();
  b.all((n) => n.id === 'dp-id')[0].value = 'nope'; b.btn('Verify session ID').click(); await wait(); assert.match(b.text(), /does not look like a session ID/);
  b.all((n) => n.id === 'dp-id')[0].value = 'TFX-ABCD-EFGH-JKMN'; b.btn('Verify session ID').click(); await wait(60); assert.match(b.text(), /not valid any more/); assert.ok(!/Your session ID is ready/.test(b.text()));
  b.all((n) => n.id === 'dp-id')[0].value = 'tfx k7m2 9qxa 4bnp'; b.btn('Verify session ID').click(); await wait(60); assert.match(b.text(), /Your session ID is ready/);
  b.btn('Choose my host').click(); await wait(); b.plat('panel').click(); await wait(); b.btn('Download index.js').click(); await wait(60);
  const d = b.ctx.downloads[0]; assert.strictEqual(d.name, 'index.js'); assert.match(d.blob.type, /^text\/javascript/); assert.strictEqual(d.blob.parts[0], LAUNCHER.replace("'__TFX_SESSION_ID__'", "'" + REAL_ID + "'"));
  assert.ok(!b.ctx.storeWrites.some(([, v]) => v.includes('K7M2')), 'no storage holds the ID'); assert.ok(b.ctx.requests.filter((r) => String(r.o && r.o.body).includes('K7M2') || String(r.u).includes('K7M2')).every((r) => r.u === '/api/deploy/check'), 'the ID only went to the check, in its body');
  b.btn('Clear my session ID').click(); await wait(); b.ctx.copied.length = 0; b.all((n) => n.className.includes('dp-cp')).forEach((c) => c.click()); assert.ok(!b.ctx.copied.some((c) => c.includes(REAL_ID)), 'nothing can produce the ID after Clear');
});

test('expiry wipes the ID; a collected ID shows the honest note; a used ID is not offered again', async () => {
  const b = fakeBrowser({ job: null, handler: (u, o) => (u === '/api/deploy/check' ? R({ valid: true, secondsLeft: 1 }) : SESSIONLESS()(u, o)) }); await wait(); b.btn('I already have a session ID').click(); await wait();
  b.all((n) => n.id === 'dp-id')[0].value = REAL_ID; b.btn('Verify session ID').click(); await wait(60); assert.match(b.text(), /Your session ID is ready/); await wait(1500);
  assert.match(b.text(), /expired and was wiped/); assert.ok(!/Your session ID is ready/.test(b.text()));
  const c = fakeBrowser({ job: 'job1234567', handler: (u, o) => (u.startsWith('/api/job/') ? R({ state: 'linked', sessionId: null, idSecondsLeft: 0, expired: false, used: true }) : SESSIONLESS()(u, o)), hash: '#session' }); await wait(80);
  assert.ok(!/Your session ID is ready/.test(c.text()));
  const down = fakeBrowser({ job: null, handler: (u) => (u === '/api/deploy/check' ? Promise.reject(new Error('offline')) : R(META)) }); await wait(); down.btn('I already have a session ID').click(); await wait();
  down.all((n) => n.id === 'dp-id')[0].value = REAL_ID; down.btn('Verify session ID').click(); await wait(60); assert.match(down.text(), /Could not check it just now/);
});

test('optional settings flow into the commands (time zone, prefix) and bad values are refused', async () => {
  const b = fakeBrowser({ job: null, handler: SESSIONLESS() }); await wait(); b.plat('vps').click(); await wait();
  const [tz, pf] = b.all((n) => n.tag === 'input' && n.attrs.placeholder && (n.attrs.placeholder === 'Africa/Lagos' || n.attrs.placeholder === '.'));
  tz.value = 'Africa/Lagos'; tz.listeners.input.forEach((f) => f({})); pf.value = '!'; pf.listeners.input.forEach((f) => f({})); await wait();
  assert.ok(b.text().includes("printf 'TIMEZONE=%s\\nBOT_PREFIX=%s\\n' 'Africa/Lagos' '!' > config.env"));
  tz.value = "x';rm -rf"; tz.listeners.input.forEach((f) => f({})); await wait(); assert.ok(!b.text().includes("x';rm") && !b.text().includes('TIMEZONE=%s'), 'a bad time zone never reaches a command'); assert.match(b.text(), /Use a time zone name/);
});

test('mobile and themes (static): viewport meta, only existing design tokens, reduced motion, no fixed widths over 640px, copy/download controls reachable', () => {
  const html = fs.readFileSync(path.join(PUB, 'new-deploy.html'), 'utf8'), css = fs.readFileSync(path.join(PUB, 'tf2-deploy.css'), 'utf8'), base = fs.readFileSync(path.join(PUB, 'tf2.css'), 'utf8');
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/); assert.match(html, /tf2-theme\.js/); assert.match(html, /name="color-scheme" content="dark light"/);
  const defined = new Set([...base.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])), used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]));
  for (const u of used) if (!['--g1', '--g2'].includes(u)) assert.ok(defined.has(u), u + ' is a token of the site design system');
  assert.match(base, /\[data-theme="light"\]/, 'the site has a light theme that redefines these tokens');
  assert.match(css, /prefers-reduced-motion/); assert.ok(!/(^|[^-])width:\s*(7|8|9)\d\dpx/.test(css), 'no fixed wide widths');
  assert.ok(/overflow-x: auto/.test(css), 'code blocks scroll instead of overflowing the screen');
});

test('pair page: the Deploy button leads into the wizard at the Session step and stays hidden until the page shows a valid ID', () => {
  const html = fs.readFileSync(path.join(PUB, 'pair.html'), 'utf8'), js = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
  assert.match(html, /id="deploybtn" href="\/deploy#session" hidden/); assert.ok(!/Your bot is logged in/.test(html) && !/Bot connected/.test(js));
  assert.match(js, /deploybtn'\)\.hidden = false/); assert.match(js, /deploybtn'\)\.hidden = true/);
});

test('static: the Deploy page code never puts the ID in storage, the address or history', () => {
  const js = fs.readFileSync(path.join(PUB, 'deploy.js'), 'utf8');
  assert.ok(!/localStorage|pushState|location\.(search|href)\s*=/.test(js)); assert.ok(!/replaceState/.test(js));
  assert.ok(/JSON\.stringify\(\{ p: S\.p, opts: S\.opts, tz: S\.tz, prefix: S\.prefix, tzRaw: S\.tzRaw, prefixRaw: S\.prefixRaw, gotFiles: S\.gotFiles, installed: S\.installed, manual: S\.manual \}\)/.test(js), 'only the wizard choices are saved');
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

test('menu and footer link to the Deploy page, and the page is served inside the normal site shell', async () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'partials', 'head2.html'), 'utf8'), /<li><a href="\/deploy">[\s\S]*?Deploy your bot/);
  assert.match(fs.readFileSync(path.join(ROOT, 'partials', 'foot2.html'), 'utf8'), /<a href="\/deploy">Deploy your bot<\/a>/);
  const { app } = boot(); const base = await listen(app); const html = await (await fetch(base + '/deploy')).text(); assert.match(html, /href="\/deploy"/); assert.match(html, /Pair WhatsApp/); app.close();
});

test('plan(): the "get" stage never holds an ID; the "launch" stage always does; the stage follows the ID, the kind follows the host', () => {
  const kinds = { termux: 'file', vps: 'file', desktop: 'file', panel: 'file', docker: 'bot', render: 'github', koyeb: 'github', webhost: 'github' };
  for (const id of D.ids) {
    const g = D.plan(id, ctx(), ''), q = D.plan(id, ctx(), REAL_ID, false), i = D.plan(id, ctx(), REAL_ID, true);
    assert.strictEqual(g.stage, 'get'); assert.strictEqual(q.stage, 'launch'); assert.strictEqual(g.kind, kinds[id]);
    assert.ok(!JSON.stringify(g).includes('K7M2'), id + ': no ID before pairing'); assert.ok(JSON.stringify(i).includes(REAL_ID) || JSON.stringify(q).includes(REAL_ID) || q.artifacts.some((a) => a.type === 'launcher-id'), id);
  }
  assert.throws(() => D.plan('vps', ctx(), 'bad id'), /not a valid session ID/);
  assert.ok(D.plan('render', ctx(), '').links.some((l) => l.href === 'https://github.com/new'), 'GitHub hosts are sent to GitHub');
  assert.ok(!(D.plan('vps', ctx(), '').links || []).length && !(D.plan('panel', ctx(), '').links || []).length, 'hosts that do not need GitHub are not sent there');
  assert.ok(D.plan('docker', ctx(), '').artifacts.some((a) => a.type === 'zip') && !D.plan('docker', ctx(), '').artifacts.some((a) => /launcher/.test(a.type)), 'Docker needs the bot files, not index.js');
  assert.ok(D.plan('termux', ctx(), REAL_ID, false).cmds.every((c) => !c.lines.join('').includes('.zip')), 'the one-file hosts never download the bot ZIP themselves');
});

test('END TO END (Termux): the generated "install with your session ID" command downloads the launcher from the site, fills the ID, installs the real bot package and saves the ID', async () => {
  const { app } = boot(); const base = await listen(app), home = tmp('tfx-tm-');
  const line = D.plan('termux', { origin: base, opts: { tz: 'Africa/Lagos', prefix: '!' } }, REAL_ID, false).cmds[1].lines[0];
  const r = await runAsync(line, home, { TFX_BOT_ZIP: base + '/download/TurboFex-hosting.zip', TFX_SKIP_INSTALL: '1', TFX_NO_START: '1', SESSION_ID: '' });
  const dir = path.join(home, 'turbofex');
  assert.match(r.stdout, /Your session ID is saved/); assert.strictEqual(botReq('core/sessionid.js').parseIds(fs.readFileSync(path.join(dir, 'session_id.txt'), 'utf8'))[0].id, REAL_ID);
  assert.deepStrictEqual(botReq('core/envfile.js').parse(fs.readFileSync(path.join(dir, 'config.env'), 'utf8')), { TIMEZONE: 'Africa/Lagos', BOT_PREFIX: '!' }, 'the optional settings were kept, not overwritten by the install');
  assert.ok(fs.existsSync(path.join(dir, 'core', 'boot.js')), 'the real bot was installed');
  app.close();
});

test('END TO END (Termux, no ID yet): the "install first" command installs the bot, writes no ID and says so', async () => {
  const { app } = boot(); const base = await listen(app), home = tmp('tfx-tg-');
  const line = D.plan('termux', { origin: base, opts: {} }, '').cmds[1].lines[0];
  const r = await runAsync(line, home, { TFX_BOT_ZIP: base + '/download/TurboFex-hosting.zip', TFX_SKIP_INSTALL: '1', TFX_NO_START: '1', SESSION_ID: '' });
  assert.match(r.stdout, /No valid session ID is written in this file/); assert.ok(fs.existsSync(path.join(home, 'turbofex', 'core', 'boot.js')));
  assert.ok(!fs.existsSync(path.join(home, 'turbofex', 'session_id.txt')) || !/SESSION_ID=TFX/.test(fs.readFileSync(path.join(home, 'turbofex', 'session_id.txt'), 'utf8')));
  app.close();
});

test('VPS commands run for real: the launcher is fetched from the site, only its placeholder changes, pm2 is called; "installed" just writes the ID and restarts', async () => {
  const { app } = boot(); const base = await listen(app), bin = stubBin(['pm2']);
  const home = tmp('tfx-vp-'), env = { PATH: bin + ':' + process.env.PATH };
  const q = D.plan('vps', { origin: base, opts: {} }, REAL_ID, false).cmds[1].lines[0];
  await runAsync(q, home, env);
  const file = fs.readFileSync(path.join(home, 'turbofex', 'index.js'), 'utf8');
  assert.strictEqual(file, LAUNCHER.replace("'__TFX_SESSION_ID__'", "'" + REAL_ID + "'"), 'the sed edit equals the browser-side edit, byte for byte');
  assert.strictEqual(fs.readFileSync(path.join(home, 'calls.log'), 'utf8').trim(), 'pm2 start index.js --name turbofex\npm2 save');
  const home2 = tmp('tfx-vp2-'); fs.mkdirSync(path.join(home2, 'turbofex'), { recursive: true });
  await runAsync(D.plan('vps', { origin: base, opts: {} }, REAL_ID, true).cmds[0].lines[0], home2, env);
  assert.strictEqual(botReq('core/sessionid.js').parseIds(fs.readFileSync(path.join(home2, 'turbofex', 'session_id.txt'), 'utf8'))[0].id, REAL_ID);
  assert.strictEqual(fs.readFileSync(path.join(home2, 'calls.log'), 'utf8').trim(), 'pm2 restart turbofex');
  for (const bad of ['PowerShell']) assert.ok(!D.plan('vps', ctx(), REAL_ID, false).cmds.some((c) => c.label.includes(bad)));
  app.close();
});

test('Termux "already installed" writes the ID file for the real bot to read, then restarts it', async () => {
  const bin = stubBin(['node']), home = tmp('tfx-ti-'); fs.mkdirSync(path.join(home, 'turbofex'), { recursive: true });
  await runAsync(D.plan('termux', ctx(), REAL_ID, true).cmds[0].lines[0], home, { PATH: bin + ':' + process.env.PATH });
  assert.strictEqual(botReq('core/sessionid.js').parseIds(fs.readFileSync(path.join(home, 'turbofex', 'session_id.txt'), 'utf8'))[0].id, REAL_ID); assert.strictEqual(fs.readFileSync(path.join(home, 'calls.log'), 'utf8').trim(), 'node index.js');
});
