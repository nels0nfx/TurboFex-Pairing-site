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
    assert.ok(h.includes('class="foot"') && h.includes('id="status"') && h.includes('id="menupanel"'), 'footer, status and menu');
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
