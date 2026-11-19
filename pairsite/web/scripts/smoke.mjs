// Smoke check: starts the real TurboFex server with the built files and fetches the routes.
// Run it after "npm run build" (npm run verify does this for you). No browser needed, so it works in Termux.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '..', 'dist');
const site = path.resolve(here, '..', '..');
const require = createRequire(import.meta.url);

let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) bad++; };

if (!existsSync(path.join(dist, 'index.html'))) { console.error('No build found. Run "npm run build" first.'); process.exit(1); }
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');

let createApp;
try { ({ createApp } = require(path.join(site, 'server.js'))); }
catch (e) { console.error('Could not load the site server. Run "npm install" in the site folder first.\n' + e.message); process.exit(1); }

const dataDir = mkdtempSync(path.join(tmpdir(), 'tfx-smoke-'));
const app = createApp({ engine: { start() { return { cancel() {} }; } }, dataDir, nextDir: dist, env: { PAIR_LIMIT: '50' } });
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.server.address().port}`;
const get = (p, o) => fetch(base + p, { redirect: 'manual', ...o });

try {
  let r = await get('/next');
  check(r.status === 302 && r.headers.get('location') === '/next/', '/next goes to /next/');
  r = await get('/next/');
  check(r.status === 200 && (r.headers.get('content-type') || '').includes('text/html'), '/next/ serves the app page');
  check((r.headers.get('content-security-policy') || '').includes("script-src 'self'"), 'the app page has the strict security policy');
  for (const route of ['/next/pair', '/next/design', '/next/some/unknown/page']) {
    r = await get(route);
    check(r.status === 200 && (r.headers.get('content-type') || '').includes('text/html'), `${route} falls back to the app page`);
  }
  const assets = [...html.matchAll(/(?:src|href)="(\/[^"]*\/assets\/[^"]+)"/g)].map((m) => m[1]);
  check(assets.length >= 2, `the page points to ${assets.length} built files (a script and a stylesheet)`);
  for (const a of assets) {
    r = await get(a);
    const type = r.headers.get('content-type') || '';
    const want = a.endsWith('.js') ? 'javascript' : a.endsWith('.css') ? 'css' : '';
    check(r.status === 200 && type.includes(want) && /immutable/.test(r.headers.get('cache-control') || ''), `${a} is served with the right type and long cache`);
  }
  // fonts are served by the site itself (the security policy allows only 'self')
  const fonts = [...(await Promise.all(assets.filter((a) => a.endsWith('.css')).map(async (a) => (await (await get(a)).text()).match(/url\(([^)]+\.woff2)\)/g) || []))).flat()];
  check(fonts.length >= 3, `the stylesheet points to ${fonts.length} self-hosted font files (woff2)`);
  // the new pairing page reads the country table from the same file the server uses
  r = await get('/countries.js');
  check(r.status === 200 && (await r.text()).includes('TFX_PHONE'), '/countries.js (shared country table) is served');
  check(html.includes('/countries.js'), 'the built page loads /countries.js');
  r = await get('/next/assets/missing-file.js');
  check(r.status === 404, 'a missing built file is a 404, not the app page');
  r = await get('/next/..%2f..%2fserver.js');
  check(r.status === 404 || r.status === 400, 'a path trying to leave the folder is refused');
  r = await get('/next/', { method: 'POST' });
  check(r.status !== 200, 'POST to /next/ is not served');
  // the old site must be untouched
  r = await get('/health');
  const h = await r.json();
  check(r.status === 200 && h.ok === true && typeof h.version === 'string', `/health still answers (version ${h.version})`);
  for (const p of ['/', '/pair', '/plugins', '/developers', '/plugin-guide', '/community', '/about']) {
    r = await get(p);
    check(r.status === 200 && (r.headers.get('content-type') || '').includes('text/html'), `the current page ${p} still loads`);
  }
} finally {
  app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
console.log(bad ? `\n${bad} check(s) FAILED` : '\nAll smoke checks passed');
process.exit(bad ? 1 : 0);
