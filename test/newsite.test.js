const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');
const { validate, build, clean } = require('../tools/refresh-commands');

const root = path.join(__dirname, '..');
const snap = JSON.parse(fs.readFileSync(path.join(root, 'public', 'commands.json'), 'utf8'));

async function boot(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'newsite-test-'));
  const app = createApp({ engine: { start() { return { cancel() {} }; } }, dataDir, env: { PAIR_LIMIT: '50', ...env } });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${app.server.address().port}`, close: () => { app.close(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

test('commands.json is valid and consistent', () => {
  assert.deepStrictEqual(validate(snap, [], null), []);
  assert.strictEqual(snap.categories.reduce((n, c) => n + c.count, 0), snap.bot.commands);
  assert.strictEqual(snap.categories.length, snap.bot.categories);
});

test('refresh script checks: load errors, duplicates, odd names, big drops', () => {
  const copy = () => JSON.parse(JSON.stringify(snap));
  assert.ok(validate(snap, ['x.js: boom'], null).length, 'a command file that failed to load stops the update');
  const dup = copy(); dup.categories[0].commands[1].name = dup.categories[0].commands[0].name;
  assert.ok(validate(dup, [], null).some((m) => /twice/.test(m)));
  const odd = copy(); odd.categories[0].commands[0].name = 'bad name!';
  assert.ok(validate(odd, [], null).some((m) => /Odd command name/.test(m)));
  const wrong = copy(); wrong.categories[0].count = 1;
  assert.ok(validate(wrong, [], null).length);
  const small = copy(); small.bot.commands = Math.floor(snap.bot.commands * 0.5);
  assert.ok(validate(small, [], snap).some((m) => /fell/.test(m)), 'a big drop is refused');
  assert.strictEqual(clean('a\n b\u0000  c'), 'a b c');
});

test('build() groups member commands only and counts them', () => {
  const groupByCategory = (list) => [{ key: 'ai', meta: { title: 'AI' }, cmds: list.filter((c) => !c.ownerOnly) }];
  const out = build({ list: [{ name: 'a', description: 'x' }, { name: 'b', ownerOnly: true }], groupByCategory, version: '1.2.3' });
  assert.strictEqual(out.bot.commands, 1); assert.strictEqual(out.categories[0].title, 'AI');
});

test('/new serves the redesigned Home with real numbers, header, footer and status pill', async () => {
  const t = await boot();
  try {
    const r = await fetch(t.base + '/new');
    assert.strictEqual(r.status, 200);
    const h = await r.text();
    assert.ok(!h.includes('<!--tfx:'), 'all markers replaced');
    assert.ok(h.includes(`<b>${snap.bot.commands}</b><span>Commands</span>`) && h.includes(`<b>${snap.bot.categories}</b><span>Categories</span>`));
    assert.ok(h.includes(`v${snap.bot.version} · Open source`));
    assert.ok(h.includes('class="foot"') && h.includes('id="sitestatus"') && h.includes('id="tmenupanel"'), 'footer, status and menu');
    assert.ok(!/All systems online/i.test(h), 'no fixed "online" claim in the page');
    assert.ok(!/ style=|<style|<script>/.test(h), 'no inline style or script (the site security rule)');
    assert.ok(h.includes('unofficial WhatsApp Web connection'), 'honest WhatsApp warning');
    assert.strictEqual((await fetch(t.base + '/new/')).status, 200);
    assert.strictEqual((await fetch(t.base + '/tf2.css')).status, 200);
    assert.strictEqual((await fetch(t.base + '/tf2.js')).status, 200);
    assert.strictEqual((await fetch(t.base + '/commands.json')).status, 200);
    assert.strictEqual((await fetch(t.base + '/partials/head2.html')).status, 404, 'partials are not served on their own');
  } finally { t.close(); }
});

test('the old Home and pages are unchanged and /new can be switched off', async () => {
  const on = await boot();
  try {
    const home = await (await fetch(on.base + '/')).text();
    assert.ok(home.includes('tfx.css') && !home.includes('tf2.css'), 'the live Home still uses the old look');
    assert.strictEqual((await fetch(on.base + '/pair')).status, 200);
  } finally { on.close(); }
  const off = await boot({ NEW_SITE: 'off' });
  try {
    assert.strictEqual((await fetch(off.base + '/new')).status, 404);
    assert.strictEqual((await fetch(off.base + '/new-home.html')).status, 404);
    assert.strictEqual((await fetch(off.base + '/')).status, 200);
  } finally { off.close(); }
});

test('footer and menu only link to pages that exist', async () => {
  const t = await boot();
  try {
    const html = fs.readFileSync(path.join(root, 'partials', 'head2.html'), 'utf8') + fs.readFileSync(path.join(root, 'partials', 'foot2.html'), 'utf8') + fs.readFileSync(path.join(root, 'public', 'new-home.html'), 'utf8');
    const own = [...new Set([...html.matchAll(/href="(\/[a-z0-9\-/]*)"/g)].map((m) => m[1]))];
    assert.ok(own.length > 8);
    for (const p of own) assert.strictEqual((await fetch(t.base + p)).status, 200, p);
  } finally { t.close(); }
});


test('Install page: honest WhatsApp warning, three steps, six ways to run it with a Copy button', async () => {
  const t = await boot();
  try {
    const r = await fetch(t.base + '/new/install'); assert.strictEqual(r.status, 200);
    const h = await r.text();
    assert.ok(!h.includes('<!--tfx:') && !/ style=|<style|<script>/.test(h));
    assert.ok(h.includes('unofficial WhatsApp Web connection, not the official WhatsApp Business Platform'));
    assert.strictEqual((h.match(/role="tab"/g) || []).length, 6);
    assert.strictEqual((h.match(/data-p="/g) || []).length, 6);
    assert.ok((h.match(/data-copy/g) || []).length >= 5);
    assert.ok(h.includes('href="/new/pair"') && !h.includes('class="foot"'));
    assert.ok(!/tested on|all systems online/i.test(h), 'no claims we cannot back up');
  } finally { t.close(); }
});

test('Home, menu and footer send people to Install; the Bot, Community and Status pages are gone', async () => {
  for (const f of ['partials/head2.html', 'partials/foot2.html']) {
    const x = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(x.includes('href="/new/install"'), f);
    for (const gone of ['/new/bot', '/new/community', '/new/status']) assert.ok(!x.includes('href="' + gone + '"'), f + ' no longer links to ' + gone);
  }
  const home = fs.readFileSync(path.join(root, 'public', 'new-home.html'), 'utf8');
  assert.ok(home.includes('href="/new/install"') && !/href="\/new\/(bot|community|status)"/.test(home));
  for (const f of fs.readdirSync(path.join(root, 'public')).filter((n) => /\.html$/.test(n) && n !== 'admin.html')) assert.ok(!/href="\/new\/(bot|community|status)\/?"/.test(fs.readFileSync(path.join(root, 'public', f), 'utf8')), f + ' has no link to a removed page');
  const t = await boot();
  try { for (const n of ['bot', 'community', 'status']) assert.strictEqual((await fetch(t.base + '/new/' + n)).status, 404, n); } finally { t.close(); }
});

test('dark / light switch: every new page sets the mode before drawing, has the button, and light colours exist', async () => {
  const t = await boot();
  try {
    const h0 = await (await fetch(t.base + '/new')).text();
    for (const n of ['', '/pair', '/install', '/plugins', '/docs', '/developers', '/about', '/support', '/playground', '/privacy', '/terms', '/rules']) {
      const h = await (await fetch(t.base + '/new' + n)).text();
      assert.ok(h.includes('src="/tf2-theme.js"') && h.indexOf('tf2-theme.js') < h.indexOf('tf2.css'), n + ' sets the mode first');
      assert.ok(h.includes('id="ttheme"'), n + ' has the switch');
    }
    assert.ok((await (await fetch(t.base + '/pair')).text()).includes('id="ttheme"'), 'live /pair has the switch');
    const css = fs.readFileSync(path.join(root, 'public', 'tf2.css'), 'utf8');
    assert.ok(css.includes(':root[data-theme="light"]') && !/data:|url\(/.test(css));
    for (const f of ['logo-light.png', 'logo-dark.png']) assert.ok(fs.existsSync(path.join(root, 'public', f)), f);
    assert.ok(h0.includes('class="mark"') && h0.includes('/logo-light.png') && h0.includes('/logo-dark.png'), 'the header shows the TurboFex logo');
    assert.ok(css.includes('@keyframes tfspin') && css.includes('.cu b'), 'the 3D block turns and has a light look');
    const js = fs.readFileSync(path.join(root, 'public', 'tf2-theme.js'), 'utf8') + fs.readFileSync(path.join(root, 'public', 'tf2.js'), 'utf8');
    assert.ok(js.includes("'tfx-theme'") && !/innerHTML/.test(js));
  } finally { t.close(); }
});

test('Pair preview: every id the pairing script needs is on the page, no id appears twice, same script as the live pairing page', async () => {
  const t = await boot();
  try {
    const r = await fetch(t.base + '/new/pair'); assert.strictEqual(r.status, 200);
    const h = await r.text();
    assert.ok(!h.includes('<!--tfx:') && !/ style=|<style|<script>/.test(h));
    const need = [...new Set([...fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8').matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]))];
    assert.ok(need.length > 40);
    for (const id of need) assert.ok(h.includes(`id="${id}"`), 'app.js needs #' + id);
    const ids = [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(ids.filter((x, i) => ids.indexOf(x) !== i), [], 'no duplicate ids');
    assert.ok(h.includes('src="/app.js"') && h.includes('src="/countries.js"') && h.includes('src="/pair.js"'));
    assert.ok(!h.includes('notice.js') && !h.includes('shell.js') && !h.includes('src="/theme.js"'), 'no old header scripts (they would fight the new header)');
    assert.ok(h.includes('unofficial WhatsApp Web connection'), 'honest warning in the safety answers');
    assert.ok(!h.includes('<footer') && h.includes('id="yr"'), 'the pairing page has no footer (only the landing page does)');
    const live = await (await fetch(t.base + '/pair')).text();
    assert.ok(live === h && live.includes('tf2-pair.css'), 'the live /pair is the new pairing page');
    const classic = await (await fetch(t.base + '/pair-classic')).text();
    assert.ok(classic.includes('src="/app.js"') && classic.includes('tfx.css') && !classic.includes('tf2.css'), 'the old pairing page is kept at /pair-classic for rollback');
  } finally { t.close(); }
});


test('NEW_SITE=off hides the Pair preview too', async () => {
  const t = await boot({ NEW_SITE: 'off' });
  try { for (const p of ['/new/pair', '/new-pair.html']) assert.strictEqual((await fetch(t.base + p)).status, 404, p); } finally { t.close(); }
});

test('text pages: same wording as the live pages, new look, footer, no inline code', async () => {
  const t = await boot();
  const text = (h) => (h.match(/<article[^>]*class="prose"[^>]*>([\s\S]*?)<\/article>/) || [, ''])[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  try {
    for (const n of ['about', 'terms', 'privacy', 'rules', 'support']) {
      const r = await fetch(t.base + '/new/' + n); assert.strictEqual(r.status, 200, n);
      const h = await r.text();
      assert.ok(!h.includes('<!--tfx:') && !/ style=|<style|<script>/.test(h), n + ' has no inline code');
      assert.ok(h.includes('tf2.css') && h.includes('tf2-doc.css') && !h.includes('tfx.css') && !h.includes('<footer') && h.includes('noindex'), n);
      const live = await (await fetch(t.base + '/' + n)).text();
      assert.strictEqual(text(h).replace(/\s?\/ ?/g, ''), text(live).replace(/ Community(?= Plugins and developers)/, '').replace(/\s?\/ ?/g, ''), n + ' wording is unchanged (apart from the removed Community link)');
      assert.strictEqual((await fetch(t.base + '/new/' + n + '/')).status, 200);
    }
    const priv = await (await fetch(t.base + '/new/privacy')).text();
    assert.ok(priv.includes('Last updated: 11 November 2026') && priv.includes('src="/doc.js"'));
    const sup = await (await fetch(t.base + '/new/support')).text();
    for (const id of ['sb-pair', 'qs', 'qnone', 'faq']) assert.ok(sup.includes('id="' + id + '"'), 'support needs #' + id);
    assert.ok(sup.includes('src="/support.js"'));
    assert.strictEqual((await fetch(t.base + '/tf2-doc.css')).status, 200);
  } finally { t.close(); }
});

test('Docs and Playground previews: same wording, same ids and scripts, Playground may run WebAssembly like the live one', async () => {
  const t = await boot();
  const text = (h) => (h.match(/<article[^>]*class="prose"[^>]*>([\s\S]*?)<\/article>/) || [, ''])[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  try {
    for (const [n, live] of [['docs', 'plugin-guide'], ['playground', 'playground']]) {
      const r = await fetch(t.base + '/new/' + n); assert.strictEqual(r.status, 200, n);
      const h = await r.text(); const l = await (await fetch(t.base + '/' + live)).text();
      assert.ok(!h.includes('<!--tfx:') && !/ style=|<style|<script>/.test(h) && h.includes('tf2-doc.css') && !h.includes('tfx.css') && !h.includes('<footer'), n);
      assert.strictEqual(text(h).replace(/\s?\/ ?/g, ''), text(l).replace(/\s?\/ ?/g, ''), n + ' wording is unchanged');
      assert.strictEqual((await fetch(t.base + '/new/' + n + '/')).status, 200);
    }
    const pg = await fetch(t.base + '/new/playground'); const csp = pg.headers.get('content-security-policy') || '';
    assert.ok(csp.includes("'wasm-unsafe-eval'"), 'the Playground preview can start the engine');
    const live = await fetch(t.base + '/playground'); assert.strictEqual(live.headers.get('content-security-policy'), csp, 'same rule as the live Playground');
    const h = await pg.text(); const js = fs.readFileSync(path.join(root, 'public', 'playground.js'), 'utf8');
    for (const id of new Set([...js.matchAll(/\$\('([a-z-]+)'\)/g)].map((m) => m[1]))) assert.ok(h.includes('id="' + id + '"'), 'Playground needs #' + id);
    assert.ok(h.includes('src="/playground-broker.js"') && h.includes('src="/playground.js"'));
    assert.ok(!(await (await fetch(t.base + '/new/docs')).text()).match(/href="\/(plugin-guide|playground)"/), 'Docs links stay inside the preview');
  } finally { t.close(); }
});

test('NEW_SITE=off hides the text page previews', async () => {
  const t = await boot({ NEW_SITE: 'off' });
  try { for (const n of ['about', 'terms', 'privacy', 'rules', 'support', 'docs', 'playground']) for (const p of ['/new/' + n, '/new-' + n + '.html']) assert.strictEqual((await fetch(t.base + p)).status, 404, p); } finally { t.close(); }
});

test('colour system: every category has a colour family, one family per category everywhere, four button looks, icons come from the sprite', async () => {
  const t = await boot();
  try {
    const snap = JSON.parse(fs.readFileSync(path.join(root, 'public', 'commands.json'), 'utf8'));
    const home = await (await fetch(t.base + '/new')).text();
    const tones = new Set([...home.matchAll(/class="row[^"]*"[^>]*><span class="ico ([a-z-]+)"/g)].map((m) => m[1]));
    assert.ok(tones.size >= 5, 'the landing icons use at least five different colours: ' + [...tones]);
    const css = fs.readFileSync(path.join(root, 'public', 'tf2.css'), 'utf8');
    for (const f of ['vio', 'sky', 'cyan', 'pink', 'fuc', 't-ok', 't-warn']) assert.ok(css.includes('.' + f + ' {'), f + ' is styled');
    for (const b of ['.btn.p', '.btn.q', '.btn.d']) assert.ok(css.includes(b + ' {') || css.includes(b + ','), b + ' exists');
    assert.ok(!/\.btn\.p \{[^}]*#f4f4f6/.test(css), 'the main button is violet, not white');
    for (const n of ['', '/install', '/pair', '/about', '/plugins', '/docs']) {
      const h = await (await fetch(t.base + '/new' + n)).text();
      assert.ok(h.includes('symbol id="i-key"'), n + ' has the icon sprite');
      const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      assert.strictEqual(ids.length, new Set(ids).size, n + ' has no repeated ids');
    }
  } finally { t.close(); }
});

test('Plugins preview: same script and ids as the live store, simple layout, stays hidden when NEW_SITE=off', async () => {
  const t = await boot();
  try {
    const r = await fetch(t.base + '/new/plugins'); assert.strictEqual(r.status, 200);
    const h = await r.text();
    assert.ok(!h.includes('<!--tfx:') && !/ style=|<style|<script>/.test(h) && h.includes('tf2-plugins.css') && !h.includes('tfx.css') && h.includes('noindex'));
    const js = fs.readFileSync(path.join(root, 'public', 'tf2-plugins.js'), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(js), 'the list is never turned into HTML');
    assert.ok(h.includes('tf2-store.css'));
    for (const id of new Set([...js.matchAll(/getElementById\('([a-z-]+)'\)/g)].map((m) => m[1]))) assert.ok(h.includes('id="' + id + '"'), 'store needs #' + id);
    assert.ok(h.includes('src="/tf2-plugins.js"') && !h.includes('src="/shell.js"'));
    assert.strictEqual((await fetch(t.base + '/new/plugins/')).status, 200);
    assert.strictEqual((await fetch(t.base + '/plugins')).status, 200);
  } finally { t.close(); }
  const off = await boot({ NEW_SITE: 'off' });
  try { for (const p of ['/new/plugins', '/new-plugins.html']) assert.strictEqual((await fetch(off.base + p)).status, 404, p); } finally { off.close(); }
});

test('Developer Centre preview: same script, every id it needs, every view, hidden when NEW_SITE=off', async () => {
  const t = await boot();
  try {
    const r = await fetch(t.base + '/new/developers'); assert.strictEqual(r.status, 200);
    const h = await r.text();
    assert.ok(!h.includes('<!--tfx:') && !/ style=|<style|<script>/.test(h) && h.includes('tf2-dev.css') && !h.includes('tfx.css') && h.includes('noindex'));
    const js = fs.readFileSync(path.join(root, 'public', 'dash.js'), 'utf8');
    for (const id of new Set([...js.matchAll(/getElementById\('([a-z-]+)'\)/g)].map((m) => m[1]))) assert.ok(h.includes('id="' + id + '"'), 'Developer Centre needs #' + id);
    for (const v of ['home', 'plugins', 'send', 'stats', 'account']) { assert.ok(h.includes('id="v-' + v + '"') && h.includes('id="n-' + v + '"'), 'screen ' + v); }
    assert.ok(h.includes('src="/dash.js"') && !h.includes('src="/shell.js"') && !h.includes('v-plugins-list') && !/Your plugins/.test(h.split('id="v-plugins"')[0]));
    const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]); assert.strictEqual(ids.length, new Set(ids).size, 'no repeated ids');
    const live = await (await fetch(t.base + '/developers')).text();
    for (const f of ['drepo', 'dtag', 'dfolder', 'dhrepo', 'dhfolder']) assert.ok(live.includes('id="' + f + '"') && h.includes('id="' + f + '"'), f);
    assert.strictEqual((await fetch(t.base + '/new/developers/')).status, 200);
  } finally { t.close(); }
  const off = await boot({ NEW_SITE: 'off' });
  try { for (const p of ['/new/developers', '/new-developers.html']) assert.strictEqual((await fetch(off.base + p)).status, 404, p); } finally { off.close(); }
});
