const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createApp } = require('../server');
const D = require('../public/deploy-data.js');
const A = require('../analytics');

const PUB = path.join(__dirname, '..', 'public');
const REAL_ID = 'TFX-K7M2-9QXA-4BNP';
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
function boot() {
  const calls = [];
  const engine = { start(number, hooks) { const c = { number, hooks }; calls.push(c); return { cancel() {} }; } };
  const app = createApp({ engine, dataDir: tmp('tfx-dp-'), env: { PAIR_LIMIT: '50', NUMBER_LIMIT: '50', SITE_SECRET: 's' } });
  return { app, calls };
}
async function listen(app) { await new Promise((r) => app.server.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${app.server.address().port}`; }
const post = (base, u, b) => fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

// ---------- the data: one source, matches the Install page, never holds a real ID ----------
test('every platform has requirements, steps, checks and troubleshooting; ids are unique; no real session ID is stored', () => {
  assert.deepStrictEqual(D.ids, ['termux', 'vps', 'docker', 'panel', 'render', 'koyeb', 'webhost', 'desktop']);
  for (const p of D.platforms) {
    assert.ok(p.needs.length && p.steps.length && p.verify.length && p.trouble.length && p.files.length, p.id);
    assert.ok(p.steps.every((s) => s.t), p.id);
  }
  assert.ok(!JSON.stringify(D.platforms).match(/TFX-(?!XXXX)[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/), 'no concrete ID in the data (the XXXX example is fine)');
  // every command line that uses the ID is flagged so the page blocks copying without a live ID
  for (const p of D.platforms) for (const s of p.steps) for (const c of s.cmds || []) assert.strictEqual(!!c.session, c.lines.some(D.usesSession), p.id + ': ' + c.label);
});

test('fill(): the real ID only appears when one is passed; otherwise a mask', () => {
  assert.strictEqual(D.fill("echo '{{ID}}'", REAL_ID), "echo 'TFX-K7M2-9QXA-4BNP'");
  assert.ok(D.fill("echo '{{ID}}'").includes(D.MASK) && !D.fill("echo '{{ID}}'").includes('K7M2'));
  assert.ok(D.ID_RE.test(REAL_ID) && !D.ID_RE.test('TFX-0OIL-1111-2222'));
});

test('the file-writing commands produce exactly what the bot reads (SESSION_ID=<id> on one line)', () => {
  const cmd = D.byId.termux.steps.find((s) => s.cmds && s.cmds[0].session).cmds[0].lines[0];
  assert.strictEqual(D.fill(cmd, REAL_ID), "printf 'SESSION_ID=%s\\n' 'TFX-K7M2-9QXA-4BNP' > session_id.txt");
  const dir = tmp('tfx-cmd-');
  require('child_process').execSync(D.fill(cmd, REAL_ID), { cwd: dir, shell: '/bin/sh' });
  assert.strictEqual(fs.readFileSync(path.join(dir, 'session_id.txt'), 'utf8'), 'SESSION_ID=TFX-K7M2-9QXA-4BNP\n');
});

test('Deploy reuses the Install page commands (no competing copy): every Install command is in Deploy, except the editor step it replaces', () => {
  const html = fs.readFileSync(path.join(PUB, 'new-install.html'), 'utf8');
  const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
  const panels = {};
  for (const m of html.matchAll(/<div class="code" data-p="(\d)">([\s\S]*?)(?=<div class="code" data-p=|<\/div><\/section>)/g)) panels[m[1]] = [...m[2].matchAll(/<span class="ln">([\s\S]*?)<\/span>/g)].map((x) => decode(x[1]));
  const deployLines = (id) => D.byId[id].steps.flatMap((s) => (s.cmds || []).flatMap((c) => c.lines));
  const map = { 0: 'termux', 1: 'vps', 2: 'docker', 5: 'desktop' };
  for (const [n, id] of Object.entries(map)) {
    const have = deployLines(id).join('\n');
    for (const line of panels[n]) {
      if (line === 'nano session_id.txt') continue;                       // replaced by the write-the-file command (nano still mentioned in the note)
      if (line.includes('TFX-XXXX-XXXX-XXXX')) { assert.ok(have.includes('SESSION_ID='), id); continue; }   // the Docker .env line, now filled with the real ID
      assert.ok(have.includes(line), id + ' is missing: ' + line);
    }
  }
});

// ---------- server ----------
test('/deploy is served; /install is untouched and still served', async () => {
  const { app } = boot(); const base = await listen(app);
  const d = await fetch(base + '/deploy'); const dh = await d.text();
  assert.strictEqual(d.status, 200); assert.match(dh, /Deploy your bot/); assert.match(dh, /\/deploy\.js/);
  assert.ok(!dh.includes('<!--tfx:'), 'the shared header was filled in');
  const i = await fetch(base + '/install'); assert.strictEqual(i.status, 200); assert.match(await i.text(), /Install TurboFex/);
  for (const f of ['deploy.js', 'deploy-data.js', 'tf2-deploy.css']) assert.strictEqual((await fetch(base + '/' + f)).status, 200, f);
  app.close();
});

test('choosing a host is counted only for a real finished pairing, once per host, and never carries the session ID', async () => {
  const { app, calls } = boot(); const base = await listen(app);
  const started = await post(base, '/api/pair', { method: 'code', number: '8023456789', country: 'NG' });
  const job = started.json.job;
  assert.strictEqual((await post(base, '/api/deploy/choose', { job, platform: 'vps' })).status, 400, 'pairing not finished');
  calls[0].hooks.onLinked({ me: { id: '2348023456789:1@s.whatsapp.net' } });
  assert.strictEqual((await post(base, '/api/deploy/choose', { job: 'nope-nope-nope', platform: 'vps' })).status, 400, 'unknown job');
  assert.strictEqual((await post(base, '/api/deploy/choose', { job, platform: 'made-up' })).status, 400, 'unknown host');
  assert.strictEqual((await post(base, '/api/deploy/choose', { job, platform: 'vps' })).status, 200);
  assert.strictEqual((await post(base, '/api/deploy/choose', { job, platform: 'vps' })).status, 200);   // a repeat
  assert.strictEqual((await post(base, '/api/deploy/choose', { job, platform: 'docker' })).status, 200);
  const picks = app.events.all().filter((e) => e.type === 'deploy.platform');
  assert.deepStrictEqual(picks.map((e) => e.platform), ['vps', 'docker']);
  assert.ok(!JSON.stringify(picks).match(/TFX-[A-Z0-9]{4}-/), 'no session ID in the log');
  const sum = A.total(Object.values(A.summarize(app.events.all())));
  assert.strictEqual(sum.totals.deploy, 2); assert.deepStrictEqual(sum.deployPlatforms.map((x) => x.platform).sort(), ['docker', 'vps']);
  app.close();
});

// ---------- the page itself, run against a small fake browser ----------
function fakeBrowser({ job, jobReply, clipboard }) {
  class N {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this._text = ''; this.hidden = false; this.disabled = false; this.className = ''; this.style = {}; this.parent = null; this.id = ''; const self = this; this.classList = { add: (c) => { self.className += ' ' + c; }, remove: (c) => { self.className = self.className.split(' ').filter((x) => x !== c).join(' '); }, toggle: (c, on) => { self.classList.remove(c); if (on) self.classList.add(c); } }; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); if (k === 'class') this.className = String(v); }
    appendChild(c) { c.parent = this; this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
    get firstChild() { return this.children[0] || null; }
    get lastChild() { return this.children[this.children.length - 1] || null; }
    set textContent(v) { this.children = []; this._text = String(v); }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    click() { (this.listeners.click || []).forEach((f) => f({})); }
    select() {} set value(v) { this._v = v; } get value() { return this._v; }
    find(pred, out = []) { if (pred(this)) out.push(this); this.children.forEach((c) => c.find && c.find(pred, out)); return out; }
  }
  const text = (s) => { const n = new N('#text'); n._text = s; n.find = () => []; return n; };
  const body = new N('body'), app = new N('div'); app.id = 'app'; body.appendChild(app);
  const toastEl = new N('div'); toastEl.id = 'dp-toast'; body.appendChild(toastEl);
  const document = { getElementById: (id) => body.find((n) => n.id === id)[0] || null, createElement: (t) => new N(t), createElementNS: (ns, t) => new N(t), createTextNode: text, body, addEventListener() {}, execCommand: () => false, hidden: false };
  const copied = [];
  const ctx = {
    document, window: null, console, setTimeout: (f, ms) => { const h = setTimeout(f, ms); h.unref(); return h; }, clearTimeout, setInterval: (f, ms) => { const h = setInterval(f, ms); h.unref(); return h; }, clearInterval,
    sessionStorage: { getItem: () => (job ? JSON.stringify({ job, method: 'code' }) : null), setItem() { throw new Error('the Deploy page must not write to storage'); } },
    localStorage: { setItem() { throw new Error('no localStorage'); }, getItem() { return null; } },
    navigator: { clipboard: { writeText: (t) => { copied.push(t); return Promise.resolve(); } } },
    location: { hash: '' }, history: { replaceState() {} }, matchMedia: () => ({ matches: true }), scrollTo() {}, scrollY: 0,
    fetch: (u, o) => { ctx.fetched.push({ u, o }); return Promise.resolve(jobReply(u, o)); }, fetched: [], addEventListener() {},
  };
  ctx.window = ctx; ctx.TFXDeploy = D;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(PUB, 'deploy.js'), 'utf8'), ctx);
  return { ctx, body, copied, all: (pred) => body.find(pred) };
}
const reply = (j, status = 200) => ({ ok: status < 300, status, json: () => Promise.resolve(j) });
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('page: no pairing in this tab -> gate, no hosts, no deploy claim', async () => {
  const b = fakeBrowser({ job: null, jobReply: () => reply({}) }); await wait();
  const t = b.body.textContent;
  assert.match(t, /Pair your WhatsApp first/); assert.ok(!/Where will your bot run/.test(t) && !/online|connected/i.test(t.replace('Pair your WhatsApp first', '')));
});

test('page: ready -> masked ID on screen, hosts offered, copy gives the real ID, nothing stored, nothing claimed as connected', async () => {
  const b = fakeBrowser({ job: 'job1234567', jobReply: () => reply({ state: 'linked', sessionId: REAL_ID, idSecondsLeft: 200, expired: false, used: false }) }); await wait();
  const t = b.body.textContent;
  assert.ok(!t.includes(REAL_ID) && !t.includes('K7M2'), 'the ID is not in the page text');
  assert.match(t, /Where will your bot run/); assert.match(t, /Waiting/);
  assert.match(t, /Not visible to TurboFex/, 'connection is not claimed');
  const plat = b.all((n) => n.attrs['data-p'] === 'termux')[0]; plat.click(); await wait();
  assert.ok(!b.body.textContent.includes(REAL_ID), 'still not on screen after choosing a host');
  const copies = b.all((n) => n.className.includes('dp-cp'));
  copies.forEach((c) => c.click()); await wait();
  assert.ok(b.copied.some((c) => c.includes("'" + REAL_ID + "' > session_id.txt")), 'the file command carries the real ID');
  assert.ok(b.copied.some((c) => c === REAL_ID), 'Copy session ID copies the bare ID');
  assert.ok(b.copied.some((c) => c === 'npm start'), 'plain commands copy as they are');
  const choose = b.ctx.fetched.find((f) => f.u === '/api/deploy/choose');
  assert.ok(choose && !String(choose.o.body).includes('K7M2'), 'the choice sent to the server holds no ID');
  assert.ok(!b.ctx.fetched.some((f) => String(f.u).includes('K7M2')), 'the ID is never in a request address');
});

test('page: after the bot collected the ID -> says only that, hides the ID, blocks ID commands, and WhatsApp stays unconfirmed until the person says so', async () => {
  const b = fakeBrowser({ job: 'job1234567', jobReply: () => reply({ state: 'linked', sessionId: null, idSecondsLeft: 0, expired: false, used: true }) }); await wait();
  let t = b.body.textContent;
  assert.match(t, /Your bot collected its login/); assert.match(t, /not yet proof that WhatsApp connected/);
  assert.ok(!/Your bot is (logged in|connected)/i.test(t));
  assert.strictEqual(b.all((n) => n.className.includes('dp-badge you')).length, 0, 'nothing is marked confirmed by the person yet');
  b.all((n) => n.attrs['data-p'] === 'vps')[0].click(); await wait();
  const blocked = b.all((n) => n.className.includes('dp-cp') && n.disabled);
  assert.ok(blocked.length >= 1, 'copy buttons that need the ID are disabled');
  const wa = b.all((n) => n.tag === 'button' && n.textContent === 'I can see it online')[0]; wa.click();
  assert.match(b.body.textContent, /You confirmed/);
});

test('page: expired ID -> says so honestly and offers to pair again', async () => {
  const b = fakeBrowser({ job: 'job1234567', jobReply: () => reply({ state: 'linked', sessionId: null, idSecondsLeft: 0, expired: true, used: false }) }); await wait();
  const t = b.body.textContent; assert.match(t, /session ID has expired/); assert.match(t, /Pair again/);
  assert.ok(b.all((n) => n.attrs.href === '/pair').length >= 1);
});

test('page: the server forgot the job (404) -> gate, not a stale deploy screen', async () => {
  const b = fakeBrowser({ job: 'job1234567', jobReply: () => reply({ error: 'x' }, 404) }); await wait();
  assert.match(b.body.textContent, /Pair your WhatsApp first/);
});

test('page: pairing still running -> asks to finish pairing, no hosts', async () => {
  const b = fakeBrowser({ job: 'job1234567', jobReply: () => reply({ state: 'code', sessionId: null }) }); await wait();
  assert.match(b.body.textContent, /Pairing is not finished yet/); assert.ok(!/Where will your bot run/.test(b.body.textContent));
});

// ---------- pair page ----------
test('pair page: the Deploy button is hidden until the page shows a valid ID, and the wording no longer calls a collected ID "connected"', () => {
  const html = fs.readFileSync(path.join(PUB, 'pair.html'), 'utf8'), js = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
  assert.match(html, /id="deploybtn" href="\/deploy" hidden/);
  assert.ok(!/Your bot is logged in/.test(html) && !/Bot connected/.test(js));
  assert.match(js, /deploybtn'\)\.hidden = false/); assert.match(js, /deploybtn'\)\.hidden = true/);
});

test('static checks: the Deploy page code never touches storage or the address for the ID', () => {
  const js = fs.readFileSync(path.join(PUB, 'deploy.js'), 'utf8');
  assert.ok(!/localStorage|sessionStorage\.setItem|location\.(search|href)\s*=|history\.pushState/.test(js));
  assert.ok(!/replaceState\(null, '', '#' \+ sid/.test(js));
});
