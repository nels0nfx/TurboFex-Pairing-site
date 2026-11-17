'use strict';
// The new TurboFex interface (built from the web/ folder) is served under /next while it is being built, page by page.
// It is OFF by itself: nothing here answers unless web/dist/index.html exists (you build it with `npm run build`), so the live
// site is exactly as before until the new interface is built. Set NEXT_UI=off to turn it off again at any time.
// It only reads files from the dist folder and never touches the backend, the APIs or the sign-in.
const fs = require('node:fs');
const path = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
// no inline or outside scripts; styles may be inline because the animation library sets some style values
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function createNextUi({ dir, env }) {
  const off = String((env && env.NEXT_UI) || '') === 'off';
  const root = path.resolve(dir);
  let seenAt = 0; let seen = false;
  const built = () => { // is there a build? (looked at most every 5 seconds)
    const t = Date.now();
    if (t - seenAt > 5000) { seenAt = t; try { seen = fs.statSync(path.join(root, 'index.html')).isFile(); } catch (e) { seen = false; } }
    return seen;
  };
  const headers = (type, cache) => ({
    'Content-Type': type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': CSP, 'X-Robots-Tag': 'noindex',
  });
  // returns true when the request was answered, false when it is not for the new interface (the site then goes on as before)
  function serve(req, res, pathname) {
    if (off || (pathname !== '/next' && !pathname.startsWith('/next/'))) return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    if (!built()) return false;
    if (pathname === '/next') { res.writeHead(302, { Location: '/next/', 'Cache-Control': 'no-store' }); res.end(); return true; }
    let rel;
    try { rel = decodeURIComponent(pathname.slice('/next/'.length)); } catch (e) { return false; }
    if (rel.includes('\0') || rel.split(/[\\/]/).includes('..')) return false;
    const file = path.resolve(root, rel);
    if (file !== root && !file.startsWith(root + path.sep)) return false;
    const ext = path.extname(rel).toLowerCase();
    let target = null;
    try { if (rel && fs.statSync(file).isFile()) target = file; } catch (e) { target = null; }
    let type; let cache;
    if (target) {
      type = TYPES[ext]; if (!type) return false;
      cache = /^assets\//.test(rel) ? 'public, max-age=31536000, immutable' : 'no-cache';
    } else if (!ext) { // a page of the new interface (the router in the browser draws it)
      target = path.join(root, 'index.html'); type = TYPES['.html']; cache = 'no-store';
    } else return false;
    let body;
    try { body = fs.readFileSync(target); } catch (e) { return false; }
    res.writeHead(200, { ...headers(type, cache), 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }
  return { serve, built };
}
module.exports = { createNextUi, CSP };
