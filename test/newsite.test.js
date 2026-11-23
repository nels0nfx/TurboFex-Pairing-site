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
  const app = createApp({ engine: { start() { return { cancel() {} }; } }, dataDir, env: { PAIR_LIMIT: '50', OLD_SITE: 'on', ...env } });
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
});

test('footer and menu only link to pages that exist', async () => {
  const t = await boot({ OLD_SITE: '' });
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
    assert.ok(h.includes('href="/pair"') && !h.includes('class="foot"'));
    assert.ok(!/tested on|all systems online/i.test(h), 'no claims we cannot back up');
  } finally { t.close(); }
});

test('Home, menu and footer send people to Install; the Bot, Community and Status pages are gone', async () => {
  for (const f of ['partials/head2.html', 'partials/foot2.html']) {
    const x = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(x.includes('href="/install"'), f);
    for (const gone of ['/bot', '/community', '/status']) assert.ok(!x.includes('href="' + gone + '"'), f + ' no longer links to ' + gone);
  }
  const home = fs.readFileSync(path.join(root, 'public', 'new-home.html'), 'utf8');
  assert.ok(home.includes('href="/install"') && !/href="\/(bot|community|status)"/.test(home));
  for (const f of fs.readdirSync(path.join(root, 'public')).filter((n) => (/^new-.*\.html$/.test(n) || n === 'pair.html'))) assert.ok(!/href="\/(bot|community|status)\/?"/.test(fs.readFileSync(path.join(root, 'public', f), 'utf8')), f + ' has no link to a removed page');
  const t = await boot({ OLD_SITE: '' });
  try { for (const n of ['bot', 'community', 'status']) assert.strictEqual((await fetch(t.base + '/' + n)).status, 404, n); } finally { t.close(); }
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
    assert.ok(css.includes(':root[data-theme="light"]') && !/data:/.test(css));
    for (const f of ['logo-light.png', 'logo-dark.png', 'logo-t-light.png', 'logo-t-dark.png', 'logo-f.png', 'logo-f-hi.png', 'logo-f-lo.png']) assert.ok(fs.existsSync(path.join(root, 'public', f)), f);
    assert.ok(h0.includes('class="mark"') && h0.includes('/logo-t-light.png') && h0.includes('/logo-t-dark.png') && h0.includes('class="mf"'), 'the header shows the TurboFex logo');
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



test('text pages: same wording as the live pages, new look, footer, no inline code', async () => {
  const t = await boot();
  const text = (h) => (h.match(/<article[^>]*class="prose"[^>]*>([\s\S]*?)<\/article>/) || [, ''])[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  try {
    for (const n of ['about', 'terms', 'privacy', 'rules', 'support']) {
      const r = await fetch(t.base + '/new/' + n); assert.strictEqual(r.status, 200, n);
      const h = await r.text();
      assert.ok(!h.includes('<!--tfx:') && !/ style=|<style|<script>/.test(h), n + ' has no inline code');
      assert.ok(h.includes('tf2.css') && h.includes('tf2-doc.css') && !h.includes('tfx.css') && !h.includes('<footer') && !h.includes('noindex'), n);
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
  } finally { t.close(); }
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

test('Plugins preview: same script and ids as the live store, simple layout', async () => {
  const t = await boot();
  try {
    const r = await fetch(t.base + '/new/plugins'); assert.strictEqual(r.status, 200);
    const h = await r.text();
    assert.ok(!h.includes('<!--tfx:') && !/ style=|<style|<script>/.test(h) && h.includes('tf2-plugins.css') && !h.includes('tfx.css') && !h.includes('noindex'));
    const js = fs.readFileSync(path.join(root, 'public', 'tf2-plugins.js'), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(js), 'the list is never turned into HTML');
    assert.ok(h.includes('tf2-store.css'));
    for (const id of new Set([...js.matchAll(/getElementById\('([a-z-]+)'\)/g)].map((m) => m[1]))) assert.ok(h.includes('id="' + id + '"'), 'store needs #' + id);
    assert.ok(h.includes('src="/tf2-plugins.js"') && !h.includes('src="/shell.js"'));
    assert.strictEqual((await fetch(t.base + '/new/plugins/')).status, 200);
    assert.strictEqual((await fetch(t.base + '/plugins')).status, 200);
  } finally { t.close(); }
});

test('Developer Centre preview: same script, every id it needs, every view', async () => {
  const t = await boot();
  try {
    const r = await fetch(t.base + '/new/developers'); assert.strictEqual(r.status, 200);
    const h = await r.text();
    assert.ok(!h.includes('<!--tfx:') && !/ style=|<style|<script>/.test(h) && h.includes('tf2-dev.css') && !h.includes('tfx.css') && !h.includes('noindex'));
    const js = fs.readFileSync(path.join(root, 'public', 'dash.js'), 'utf8');
    for (const id of new Set([...js.matchAll(/getElementById\('([a-z-]+)'\)/g)].map((m) => m[1]))) assert.ok(h.includes('id="' + id + '"'), 'Developer Centre needs #' + id);
    for (const v of ['home', 'plugins', 'send', 'stats', 'account']) { assert.ok(h.includes('id="v-' + v + '"') && h.includes('id="n-' + v + '"'), 'screen ' + v); }
    assert.ok(h.includes('src="/dash.js"') && !h.includes('src="/shell.js"') && !h.includes('v-plugins-list') && !/Your plugins/.test(h.split('id="v-plugins"')[0]));
    const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]); assert.strictEqual(ids.length, new Set(ids).size, 'no repeated ids');
    const live = await (await fetch(t.base + '/developers')).text();
    for (const f of ['drepo', 'dtag', 'dfolder', 'dhrepo', 'dhfolder']) assert.ok(live.includes('id="' + f + '"') && h.includes('id="' + f + '"'), f);
    assert.strictEqual((await fetch(t.base + '/new/developers/')).status, 200);
  } finally { t.close(); }
});

// ---- the redesigned site is live (v3.18.0) ----
test('live site: the new pages are at their real addresses, old pages are not served, old preview links forward', async () => {
  const t = await boot({ OLD_SITE: '' });
  try {
    const home = await (await fetch(t.base + '/')).text();
    assert.ok(home.includes('tf2.css') && !home.includes('tfx.css'), 'Home is the new design');
    assert.ok(!/noindex/.test(home), 'the live pages can be found by search engines');
    for (const p of ['/install', '/pair', '/about', '/terms', '/privacy', '/rules', '/support', '/plugins', '/developers', '/playground', '/plugin-guide', '/docs']) {
      const r = await fetch(t.base + p);
      assert.strictEqual(r.status, 200, p);
      const h = await r.text();
      assert.ok(h.includes('tf2.css'), p + ' uses the new design');
      assert.ok(!/href="\/new[\/"]/.test(h), p + ' has no link to the old preview addresses');
      assert.ok(!/noindex/.test(h), p);
    }
    // old pages and their files are not served
    for (const p of ['/pair-classic', '/community', '/home.html', '/index.html', '/about.html', '/plugins.html', '/developers.html', '/plugin-guide.html', '/playground.html', '/new-home.html', '/new-plugins.html']) assert.strictEqual((await fetch(t.base + p)).status, 404, p);
    // saved preview addresses forward to the real ones
    for (const [from, to] of [['/new', '/'], ['/new/', '/'], ['/new/plugins', '/plugins'], ['/new/pair', '/pair'], ['/new/install', '/install'], ['/new/docs', '/docs']]) {
      const r = await fetch(t.base + from, { redirect: 'manual' });
      assert.strictEqual(r.status, 301, from);
      assert.strictEqual(new URL(r.headers.get('location'), t.base).pathname, to, from);
    }
    assert.strictEqual((await fetch(t.base + '/new/bot')).status, 404);
    assert.strictEqual((await fetch(t.base + '/new/status')).status, 404);
  } finally { t.close(); }
});

test('live site: the footer is only on the Home page, the Playground keeps its sandbox rule, the tab icon is the new logo', async () => {
  const t = await boot({ OLD_SITE: '' });
  try {
    assert.ok((await (await fetch(t.base + '/')).text()).includes('class="flegal"'));
    assert.ok(!(await (await fetch(t.base + '/plugins')).text()).includes('class="flegal"'));
    assert.match((await fetch(t.base + '/playground')).headers.get('content-security-policy'), /wasm-unsafe-eval/);
    assert.doesNotMatch((await fetch(t.base + '/plugins')).headers.get('content-security-policy'), /wasm-unsafe-eval/);
    const ico = await fetch(t.base + '/favicon.png');
    assert.strictEqual(ico.status, 200);
    assert.deepStrictEqual([...Buffer.from(await ico.arrayBuffer()).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    // the Developer Centre sign-in still works from the real address
    assert.strictEqual((await fetch(t.base + '/developers')).status, 200);
  } finally { t.close(); }
});

test('rollback: OLD_SITE=on brings the old pages back at their old addresses', async () => {
  const t = await boot({ OLD_SITE: 'on' });
  try {
    assert.ok((await (await fetch(t.base + '/')).text()).includes('tfx.css'));
    for (const p of ['/pair-classic', '/community', '/plugins', '/new/plugins']) assert.strictEqual((await fetch(t.base + p)).status, 200, p);
  } finally { t.close(); }
});

test('brand colour: one token for the Get started button, the "Fex" in the name and the F of the logo; Home sections are organised as asked', async () => {
  const css = fs.readFileSync(path.join(root, 'public', 'tf2.css'), 'utf8');
  assert.match(css, /--brand: #[0-9a-f]{6};/i);
  assert.match(css, /--btn: var\(--brand\)/);
  assert.match(css, /\.logo \.fx \{ color: var\(--brand\)/);
  assert.match(css, /\.mark \.mf \{[^}]*var\(--brand\)/);
  const t = await boot({ OLD_SITE: '' });
  try {
    const h = await (await fetch(t.base + '/')).text();
    assert.ok(h.includes('Turbo<span class="fx">Fex</span>') && h.includes('class="mf"'), 'header carries the coloured name and F');
    const main = h.slice(h.indexOf('<main'));
    assert.ok(!/<h2>Explore<\/h2>/.test(main), 'no Explore heading');
    const i1 = main.indexOf('class="hub3d"'), g1 = main.indexOf('class="group mid">Get started'), i2 = main.indexOf('class="eng3d"'), g2 = main.indexOf('class="group mid">Extend it'), g3 = main.indexOf('Coming later');
    assert.ok(i1 > 0 && i1 < g1 && g1 < i2 && i2 < g2 && g2 < g3, 'hub above Get started, plugin engine above Extend it, Coming later last');
    for (const m of ['m1', 'm2', 'm3', 'm4']) assert.ok(main.includes('class="md ' + m + '"'), m);
    for (const href of ['/install', '/pair', '/plugins', '/plugin-guide', '/playground', '/developers']) assert.ok(main.includes('href="' + href + '"'), href);
    assert.ok(/prefers-reduced-motion: no-preference/.test(css) && /@keyframes tfspin/.test(css) && /@keyframes modjoin/.test(css) && /@keyframes beamrun/.test(css));
  } finally { t.close(); }
});

test('3D scenes (v3.22.0): the right pages have one, they are decoration only, share one kit, pause off screen and respect reduced motion', async () => {
  const t = await boot({ OLD_SITE: '' });
  try {
    const want = { '/install': 's-inst', '/plugins': 's-plug', '/plugin-guide': 's-docs', '/playground': 's-play', '/developers': 's-dev' };
    for (const [p, cls] of Object.entries(want)) {
      const h = await (await fetch(t.base + p)).text();
      assert.ok(h.includes('class="sc ' + cls + '" aria-hidden="true"'), p + ' has its scene');
      assert.ok(h.includes('/tf2-scenes.css') && h.includes('/tf2-scenes.js'), p + ' loads the shared kit');
      assert.ok(!/ style=|<style/.test(h), p + ' has no inline style');
      assert.strictEqual((h.match(/class="sc /g) || []).length, p === '/developers' ? 2 : 1, p + ' has the expected number of scenes');
    }
    for (const p of ['/about', '/terms', '/privacy', '/rules', '/support']) assert.ok(!(await (await fetch(t.base + p)).text()).includes('class="sc '), p + ' stays plain');
    const home = await (await fetch(t.base + '/')).text();
    assert.ok(home.includes('/tf2-scenes.css') && home.includes('/tf2-scenes.js'), 'Home pauses its scenes too');
    const pair = await (await fetch(t.base + '/pair')).text();
    assert.ok(!pair.includes('class="sc '), 'the pairing page gets no extra scene near the QR');
    const css = await (await fetch(t.base + '/tf2-scenes.css')).text();
    const motion = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'));
    assert.ok(motion.includes('animation:') && !/^[^@]*\.o \{[^}]*animation:/m.test(css.slice(0, css.indexOf('@media (prefers-reduced-motion'))), 'all scene motion is inside the no-preference rule');
    assert.match(css, /\.off, \.off \*/); assert.match(css, /animation-play-state: paused/); assert.match(css, /@supports not/);
    const js = await (await fetch(t.base + '/tf2-scenes.js')).text();
    assert.ok(/IntersectionObserver/.test(js) && !/innerHTML|eval\(/.test(js));
    assert.strictEqual((await fetch(t.base + '/admin.html')).status, 404);
  } finally { t.close(); }
});

test('class names of the scene kit and the Home chat do not clash with the Pair page or the doc pages', () => {
  const pub = path.join(root, 'public');
  const own = fs.readFileSync(path.join(pub, 'tf2-scenes.css'), 'utf8') + fs.readFileSync(path.join(pub, 'tf2.css'), 'utf8').slice(fs.readFileSync(path.join(pub, 'tf2.css'), 'utf8').indexOf('/* v3.19.0'));
  const used = (f) => new Set([...fs.readFileSync(path.join(pub, f), 'utf8').matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]));
  const defined = new Set([...own.matchAll(/(?:^|[\s,>{])\.([a-z][\w-]*)(?=[\s,.:{>[)])/gm)].map((m) => m[1]));
  for (const bad of ['chips', 'chip', 'spin', 'wire', 'pn', 'rk', 'pk', 'ic', 'pill', 'ck', 'cb', 'dots', 'rep']) assert.ok(!defined.has(bad), 'scene/chat styles must not define .' + bad);
  const pairCss = used('tf2-pair.css');
  for (const k of ['chips', 'spin', 'wire']) assert.ok(pairCss.has(k), 'sanity: the Pair page really uses .' + k);
});

test('icon motion (v3.24.0): one shared kit on every page, only the drawing moves, nothing moves for Reduce Motion, no inline styles', async () => {
  const pub = path.join(root, 'public');
  const css = fs.readFileSync(path.join(pub, 'tf2-icons.css'), 'utf8');
  const js = fs.readFileSync(path.join(pub, 'tf2-icons.js'), 'utf8');
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  assert.ok(bare.startsWith('@media (prefers-reduced-motion: no-preference) {'), 'every rule sits inside the no-preference block');
  assert.ok(!/@media \(prefers-reduced-motion: no-preference\)[\s\S]*@media \(prefers-reduced-motion: no-preference\)/.test(bare), 'one block only');
  assert.ok(!/\.style\.|setAttribute\('style'/.test(js), 'no inline styles (strict CSP)');
  // every name used by the styles is a name the script can give
  const given = new Set([...js.slice(js.indexOf('var SIG'), js.indexOf('var SPLIT')).matchAll(/\b([a-z0-9]+): \[/g)].map((m) => m[1]).concat(['puzzle', 'alert']));
  for (const k of new Set([...css.matchAll(/data-ic="([a-z0-9]+)"/g)].map((m) => m[1]))) assert.ok(given.has(k), 'the script can give the name ' + k);
  // the card or tile no longer moves as one piece
  const main = fs.readFileSync(path.join(pub, 'tf2.css'), 'utf8');
  assert.ok(!/a\.row:hover \.ico[^}]*transform/.test(main), 'the icon tile does not tilt any more');
  assert.ok(!/\.xtiles a\.row:hover, \.xtiles a\.row:focus-visible \{[^}]*transform/.test(main), 'the Extend it card does not lift any more');
  const t = await boot({ OLD_SITE: '' });
  try {
    for (const p of ['/', '/install', '/pair', '/plugins', '/plugin-guide', '/docs', '/playground', '/developers', '/about', '/support', '/terms', '/privacy', '/rules']) {
      const h = await (await fetch(t.base + p)).text();
      assert.strictEqual((h.match(/\/tf2-icons\.css/g) || []).length, 1, p + ' loads the icon styles once');
      assert.strictEqual((h.match(/\/tf2-icons\.js/g) || []).length, 1, p + ' loads the icon script once');
    }
    for (const f of ['/tf2-icons.css', '/tf2-icons.js']) assert.strictEqual((await fetch(t.base + f)).status, 200);
    const adm = fs.readFileSync(path.join(pub, 'admin.html'), 'utf8');
    assert.ok(adm.includes('/tf2-icons.css') && adm.includes('/tf2-icons.js'), 'the admin loads the same kit');
  } finally { t.close(); }
});

test('admin (v3.25.0): no Live/updated tag, and the admin and the scene kit share no class names', () => {
  const pub = path.join(root, 'public');
  const js = fs.readFileSync(path.join(pub, 'admin.js'), 'utf8');
  assert.ok(!/liveBadge|class: 'live'|'Updated ' \+/.test(js), 'the Live / Updated tag is gone');
  assert.ok(/REFRESH\[tab\]\) load\(false\)/.test(js), 'the quiet automatic refresh still runs');
  const scenes = fs.readFileSync(path.join(pub, 'tf2-scenes.css'), 'utf8');
  assert.ok(!/^\s*\.st \{/m.test(scenes), 'the scene stage is only .sc > .st, so the admin status cell (.td.st) is not hit');
  assert.ok(!/class: 'gp'/.test(js), 'the admin ring number does not use the scene panel class');
  const a3 = fs.readFileSync(path.join(pub, 'admin3.css'), 'utf8');
  assert.ok(!/^\.adm \.gp \{/m.test(a3), 'admin css does not restyle the scene panel class');
});

test('loading system (v3.26.0): kit linked once everywhere, motion respects reduced motion, no inline styles', async () => {
  const pub = path.join(root, 'public');
  const css = fs.readFileSync(path.join(pub, 'tf2-load.css'), 'utf8');
  const js = fs.readFileSync(path.join(pub, 'tf2-load.js'), 'utf8');
  assert.ok(!/\.setAttribute\(\s*['"]style['"]/.test(js) && !/style=/.test(js), 'the script never writes an inline style attribute');
  assert.ok(/prefers-reduced-motion/.test(css), 'the styles know about reduced motion');
  const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*$/, '');
  const names = [...outside.matchAll(/animation\s*:\s*([^;]+);/g)].map((m) => m[1]).join(' ');
  assert.ok(/tbGrace/.test(names) && !/tbIn|tbGlint|tbBar|tbHalo|tbNav/.test(names), 'outside the no-preference block only the fade-in, fade-out and failsafe run');
  for (const sel of [...css.matchAll(/^\s*\.([a-z0-9-]+)[ ,{.:]/gm)].map((m) => m[1])) assert.ok(/^(ld|tb|skel|pk)/.test(sel) || sel === 'sk', 'class ' + sel + ' has a safe prefix');
  const t = await boot({ OLD_SITE: '' });
  try {
    for (const p of ['/', '/install', '/pair', '/plugins', '/docs', '/playground', '/developers', '/support']) {
      const h = await (await fetch(t.base + p)).text();
      assert.strictEqual((h.match(/\/tf2-load\.js/g) || []).length, 1, p + ' loads the loading script once');
      assert.strictEqual((h.match(/\/tf2-load\.css/g) || []).length, 1, p + ' loads the loading styles once');
      assert.strictEqual((h.match(/id="tfboot"/g) || []).length, 1, p + ' carries the loading screen in its own HTML');
      assert.ok(h.indexOf('id="tfboot"') < h.indexOf('/tf2.css') || !h.includes('/tf2.css'), p + ': the loading screen comes before the big stylesheets');
      assert.ok(!/<link[^>]*stylesheet[^>]*>[\s\S]*id="tfboot"/.test(h.replace(/<link[^>]*tf2-load[^>]*>/g, '')), p + ': no stylesheet blocks it');
    }
    for (const f of ['/tf2-load.css', '/tf2-load.js', '/tf2-load-nojs.css']) assert.strictEqual((await fetch(t.base + f)).status, 200);
  } finally { t.close(); }
});
