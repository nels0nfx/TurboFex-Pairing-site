const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');

// a pretend build of the new interface
function fakeDist() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextui-'));
  fs.mkdirSync(path.join(d, 'assets'));
  fs.writeFileSync(path.join(d, 'index.html'), '<!doctype html><div id="root"></div><script type="module" src="/next/assets/app-abc123.js"></script>');
  fs.writeFileSync(path.join(d, 'assets', 'app-abc123.js'), 'console.log(1)');
  fs.writeFileSync(path.join(d, 'assets', 'app-abc123.css'), 'body{}');
  fs.writeFileSync(path.join(d, 'assets', 'app.js.map'), '{}');
  fs.writeFileSync(path.join(d, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  return d;
}
async function boot(opts = {}, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pairsite-next-'));
  const app = createApp({ engine: { start() { return { cancel() {} }; } }, dataDir, env: { PAIR_LIMIT: '50', ...env }, ...opts });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  return { app, base: `http://127.0.0.1:${app.server.address().port}`, close: () => { app.close(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

test('without a build, /next does not exist and the rest of the site is unchanged', async () => {
  const s = await boot({ nextDir: path.join(os.tmpdir(), 'no-such-dist-folder') });
  try {
    assert.strictEqual((await fetch(s.base + '/next/')).status, 404);
    assert.strictEqual((await fetch(s.base + '/next/plugins')).status, 404);
    assert.strictEqual((await fetch(s.base + '/')).status, 200);
    assert.strictEqual((await fetch(s.base + '/plugins')).status, 200);
    assert.strictEqual((await fetch(s.base + '/health')).status, 200);
  } finally { s.close(); }
});

test('with a build: /next redirects, pages fall back to index.html, assets are cached for a year', async () => {
  const dist = fakeDist(); const s = await boot({ nextDir: dist });
  try {
    const r0 = await fetch(s.base + '/next', { redirect: 'manual' });
    assert.strictEqual(r0.status, 302); assert.strictEqual(r0.headers.get('location'), '/next/');
    for (const p of ['/next/', '/next/plugins', '/next/admin/review/42', '/next/design']) {
      const r = await fetch(s.base + p); const t = await r.text();
      assert.strictEqual(r.status, 200, p); assert.match(r.headers.get('content-type'), /text\/html/); assert.match(t, /id="root"/);
      assert.strictEqual(r.headers.get('cache-control'), 'no-store');
      assert.match(r.headers.get('content-security-policy'), /script-src 'self'/); assert.ok(!/unsafe-inline/.test(r.headers.get('content-security-policy').match(/script-src[^;]*/)[0]), 'scripts are never inline');
      assert.strictEqual(r.headers.get('x-frame-options'), 'DENY'); assert.strictEqual(r.headers.get('x-robots-tag'), 'noindex');
    }
    const js = await fetch(s.base + '/next/assets/app-abc123.js');
    assert.strictEqual(js.status, 200); assert.match(js.headers.get('content-type'), /javascript/); assert.match(js.headers.get('cache-control'), /immutable/);
    assert.match((await fetch(s.base + '/next/assets/app-abc123.css')).headers.get('content-type'), /text\/css/);
    assert.match((await fetch(s.base + '/next/favicon.svg')).headers.get('content-type'), /image\/svg/);
    assert.strictEqual((await fetch(s.base + '/next/assets/missing.js')).status, 404, 'a missing file is never answered with the page');
    assert.strictEqual((await fetch(s.base + '/next/assets/app.js.map')).status, 404, 'source maps are not served');
    const head = await fetch(s.base + '/next/', { method: 'HEAD' }); assert.strictEqual(head.status, 200); assert.strictEqual(await head.text(), '');
  } finally { s.close(); fs.rmSync(dist, { recursive: true, force: true }); }
});

test('with a build: nothing outside the folder can be read, other methods are not handled, the old site still answers', async () => {
  const dist = fakeDist(); const s = await boot({ nextDir: dist });
  try {
    for (const p of ['/next/..%2fserver.js', '/next/%2e%2e/server.js', '/next/assets/..%5c..%5cpackage.json', '/next/%00', '/next/%E0%A4%A']) {
      const r = await fetch(s.base + p); const t = await r.text();
      assert.ok(!/createApp|"name": "turbofex/.test(t), p); assert.notStrictEqual(r.status, 500, p);
    }
    assert.strictEqual((await fetch(s.base + '/next/', { method: 'POST', body: '{}' })).status, 404);
    const home = await fetch(s.base + '/'); assert.strictEqual(home.status, 200); assert.ok(!/id="root"/.test(await home.text()), 'the old home page is untouched');
    assert.strictEqual((await fetch(s.base + '/plugins')).status, 200);
    assert.strictEqual((await fetch(s.base + '/health')).status, 200);
  } finally { s.close(); fs.rmSync(dist, { recursive: true, force: true }); }
});

test('NEXT_UI=off turns the new interface off even when it is built', async () => {
  const dist = fakeDist(); const s = await boot({ nextDir: dist }, { NEXT_UI: 'off' });
  try { assert.strictEqual((await fetch(s.base + '/next/')).status, 404); assert.strictEqual((await fetch(s.base + '/')).status, 200); }
  finally { s.close(); fs.rmSync(dist, { recursive: true, force: true }); }
});
