const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createApp } = require('../server');
const { createRegistry, makeView, PUBLIC_KEY } = require('../registry');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PEM = publicKey.export({ type: 'spki', format: 'pem' });
const sign = (bytes) => crypto.sign(null, bytes, privateKey).toString('base64');
const INDEX = {
  format: 1, updated: '2026-11-11T07:00:00.000Z',
  plugins: {
    'hello-plugin': { name: 'Hello', description: 'Greets you', author: 'TurboFex', versions: { '1.0.0': { permissions: ['chat.send', 'storage'], domains: [], publishedAt: '2026-11-11T07:00:00.000Z', manifestSha: 'x', entrySha: 'y', entry: 'index.js' } } },
    'lock-plugin': { name: 'Lock', description: 'Closes the group', author: 'TurboFex', versions: { '1.0.0': { permissions: ['group.manage', 'weird.new'], domains: [], publishedAt: '2026-11-11T07:00:00.000Z' }, '1.1.0': { permissions: ['group.manage'], domains: [], publishedAt: '2026-11-12T07:00:00.000Z' } } },
    'gone-plugin': { name: 'Gone', description: 'Withdrawn', author: 'X', versions: { '1.0.0': { permissions: [] } } },
    'net-plugin': { name: 'Net', description: '<script>alert(1)</script>', author: 'Dev', versions: { '1.0.0': { permissions: ['network'], domains: ['api.example.com'] } } },
  },
  revoked: [{ id: 'gone-plugin', version: null, reason: 'x' }],
};
const files = (index = INDEX, mutate) => {
  const bytes = Buffer.from(JSON.stringify(index, null, 1));
  const f = { 'index.json': mutate ? mutate(bytes) : bytes, 'index.json.sig': Buffer.from(sign(bytes)) };
  return async (url) => { const k = url.split('/').pop(); if (!f[k]) throw new Error('404'); return f[k]; };
};

async function boot(registry) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pairsite-plug-'));
  const app = createApp({ engine: { start() { return { cancel() {} }; } }, dataDir, env: {}, registry });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  return { app, base: `http://127.0.0.1:${app.server.address().port}`, close: () => { app.close(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

test('the list is read from the registry, the signature is checked, withdrawn plugins and old versions are hidden', async () => {
  const reg = createRegistry({ env: { REGISTRY_PUBLIC_KEY: PEM }, fetcher: files() });
  const v = await reg.list();
  assert.deepStrictEqual(v.plugins.map((p) => p.id), ['hello-plugin', 'lock-plugin', 'net-plugin']);
  assert.strictEqual(v.total, 3);
  const lock = v.plugins.find((p) => p.id === 'lock-plugin');
  assert.strictEqual(lock.version, '1.1.0'); assert.strictEqual(lock.permissions[0].risk, 'high'); assert.match(lock.permissions[0].text, /Remove members/);
  assert.deepStrictEqual(Object.keys(v.plugins[0]).sort(), ['author', 'description', 'domains', 'id', 'name', 'permissions', 'publishedAt', 'version']); // no hashes or file names
  const w = makeView({ plugins: { 'lock-plugin': INDEX.plugins['lock-plugin'] }, revoked: [{ id: 'lock-plugin', version: '1.1.0' }] });
  assert.strictEqual(w.plugins[0].version, '1.0.0'); // only the withdrawn version is hidden; an unknown permission is shown as medium
  assert.strictEqual(w.plugins[0].permissions[1].risk, 'medium');
});

test('a changed index, a wrong signature or a wrong key is refused', async () => {
  for (const [name, reg] of [
    ['changed', createRegistry({ env: { REGISTRY_PUBLIC_KEY: PEM }, fetcher: files(INDEX, (b) => Buffer.from(b.toString().replace('Greets you', 'Evil'))) })],
    ['other key', createRegistry({ env: { REGISTRY_PUBLIC_KEY: crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }) }, fetcher: files() })],
    ['built-in key', createRegistry({ fetcher: files() })],
  ]) await assert.rejects(() => reg.list(), /bad signature/, name);
  assert.match(PUBLIC_KEY, /MCowBQYDK2VwAyEA\+QWRwLFB3HTFZI5W3zMy91aYJko0py7oCo4MCGC5\/vU=/);
});

test('the answer is kept for a while, and the last good list is shown if GitHub is down', async () => {
  let calls = 0; let down = false; let t = 1000; const f = files();
  const reg = createRegistry({ env: { REGISTRY_PUBLIC_KEY: PEM }, now: () => t, fetcher: async (u, m) => { calls++; if (down) throw new Error('offline'); return f(u, m); } });
  await reg.list(); const first = calls; await reg.list(); assert.strictEqual(calls, first);
  t += 11 * 60 * 1000; down = true; assert.strictEqual((await reg.list()).total, 3); // stale but shown
  t += 25 * 60 * 60 * 1000; await assert.rejects(() => reg.list(), /offline/); // too old
  const fresh = createRegistry({ env: { REGISTRY_PUBLIC_KEY: PEM }, fetcher: async () => { throw new Error('offline'); } });
  await assert.rejects(() => fresh.list());
});

test('/api/plugins and the /plugins page', async () => {
  const s = await boot(createRegistry({ env: { REGISTRY_PUBLIC_KEY: PEM }, fetcher: files() }));
  try {
    const r = await fetch(s.base + '/api/plugins'); assert.equal(r.status, 200);
    assert.equal((await r.json()).total, 3);
    const page = await fetch(s.base + '/plugins'); assert.equal(page.status, 200);
    const html = await page.text(); assert.ok(html.includes('<title>Plugins')); assert.ok(html.includes('/plugins.js') && html.includes('/plugins.css'));
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'no inline script'); assert.ok(!/\sstyle=|<style/i.test(html), 'no inline style');
    for (const f of ['plugins.js', 'plugins.css']) assert.equal((await fetch(s.base + '/' + f)).status, 200);
  } finally { s.close(); }
});

test('/api/plugins says so plainly when the registry cannot be read', async () => {
  const s = await boot(createRegistry({ env: { REGISTRY_PUBLIC_KEY: PEM }, fetcher: async () => { throw new Error('offline'); } }));
  try { const r = await fetch(s.base + '/api/plugins'); assert.equal(r.status, 503); assert.match((await r.json()).error, /cannot be loaded right now/); } finally { s.close(); }
});

test('the page script never turns the list into HTML, and the menus of all pages link to Plugins', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'plugins.js'), 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(js));
  for (const f of ['index.html', 'about.html', 'terms.html', 'privacy.html', 'plugins.html']) assert.ok(fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8').includes('id="m-plugins"'), f);
});

test('both themes are covered and the page stays inside the screen on phones', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'plugins.css'), 'utf8');
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'colours come from style.css so both themes work');
  assert.ok(/overflow-wrap: anywhere/.test(css));
});
