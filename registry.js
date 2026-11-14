// The plugin list for the Plugins page. It reads the public TurboFex-Registry (index.json + index.json.sig from GitHub), checks the
// signature with the registry's public key (the same key the bots trust) and keeps the answer for a few minutes. The visitor's
// browser never talks to GitHub: only this server does, and it sends nothing about the visitor.
const crypto = require('crypto');

const BASE = 'https://raw.githubusercontent.com/nels0nfx/TurboFex-Registry/main/';
const PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA+QWRwLFB3HTFZI5W3zMy91aYJko0py7oCo4MCGC5/vU=\n-----END PUBLIC KEY-----\n';
const FRESH_MS = 10 * 60 * 1000;      // the list is asked for again after 10 minutes
const STALE_MS = 24 * 60 * 60 * 1000; // if GitHub cannot be reached, the last good list is shown for up to a day
// what each permission means, in plain words (the same wording the bot shows when installing)
const PERMS = {
  'chat.send': ['low', 'Send messages in the chat where it is used'],
  storage: ['low', 'Keep its own small saved notes'],
  'group.read': ['low', 'See the group name and how many members and admins it has'],
  'chat.react': ['low', 'React to the message that used it with an emoji'],
  'media.send': ['low', 'Send pictures, stickers and files in the chat where it is used'],
  'media.convert': ['medium', 'Turn pictures into stickers and audio into small MP3 files (uses a little of the bot\'s power, a few times a minute)'],
  schedule: ['medium', 'Run by itself on a timer'],
  'owner.notify': ['medium', 'Send the bot owner a short message now and then'],
  network: ['medium', 'Connect to the internet (only the sites it lists)'],
  'events.message': ['medium', 'Read the text of messages sent in the groups where it is allowed'],
  'events.members': ['medium', 'Know when members join or leave a group (no phone numbers)'],
  'group.manage': ['high', 'Remove members, open or close the group, and rename it (only where the bot is an admin, never the owner or an admin)'],
  'group.admins': ['high', 'Make a member an admin or take admin away (only through a command used by a group admin, where the bot is an admin; never the owner or the group creator)'],
};
const semverCmp = (a, b) => { const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const reSha = { test: (x) => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x) };
// the fingerprints of the optional README.md / CHANGELOG.md of every version, taken from the SIGNED index
function docShasOf(index) {
  const m = new Map();
  for (const [id, p] of Object.entries(index.plugins || {})) { if (!/^[a-z0-9-]{3,32}$/.test(id) || !p || typeof p.versions !== 'object') continue; for (const [v, e] of Object.entries(p.versions)) if (/^\d+\.\d+\.\d+$/.test(v) && e) m.set(id + '@' + v, { readme: reSha.test(e.readmeSha) ? e.readmeSha : '', changelog: reSha.test(e.changelogSha) ? e.changelogSha : '', icon: reSha.test(e.iconSha) ? e.iconSha : '', shots: (Array.isArray(e.shotShas) ? e.shotShas : []).slice(0, 3).filter((x) => reSha.test(x)) }); }
  return m;
}
function makeView(index) {
  const revoked = Array.isArray(index.revoked) ? index.revoked : [];
  const out = [];
  for (const [id, p] of Object.entries(index.plugins || {})) {
    if (!/^[a-z0-9-]{3,32}$/.test(id) || !p || typeof p.versions !== 'object') continue;
    const versions = Object.keys(p.versions).filter((v) => /^\d+\.\d+\.\d+$/.test(v) && !revoked.some((r) => r && r.id === id && (!r.version || r.version === v))).sort(semverCmp);
    if (!versions.length) continue;
    const version = versions[versions.length - 1]; const e = p.versions[version] || {};
    out.push({
      id, name: str(p.name, 40) || id, description: str(p.description, 200), author: str(p.author, 60), version, publishedAt: str(e.publishedAt, 40),
      permissions: (Array.isArray(e.permissions) ? e.permissions : []).slice(0, 12).map((k) => ({ key: str(k, 30), risk: (PERMS[k] || ['medium'])[0], text: (PERMS[k] || [0, 'Another permission'])[1] })),
      history: versions.slice().reverse().slice(0, 10).map((v) => ({ version: v, publishedAt: str((p.versions[v] || {}).publishedAt, 40) })),
      domains: (Array.isArray(e.domains) ? e.domains : []).slice(0, 10).map((d) => str(d, 80)).filter(Boolean),
      docs: { readme: reSha.test(e.readmeSha), changelog: reSha.test(e.changelogSha), icon: reSha.test(e.iconSha), shots: (Array.isArray(e.shotShas) ? e.shotShas : []).slice(0, 3).filter((x) => reSha.test(x)).length },
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  // collections (signed in the index): only plugins that are published now are kept; a set left with fewer than 2 is hidden
  const have = new Set(out.map((x) => x.id)), cols = [];
  for (const c of Array.isArray(index.collections) ? index.collections : []) {
    if (!c || !/^[a-z0-9-]{3,32}$/.test(String(c.id)) || !Array.isArray(c.plugins) || cols.some((x) => x.id === c.id)) continue;
    const ids = [...new Set(c.plugins.filter((x) => have.has(x)))].slice(0, 8);
    if (ids.length >= 2) cols.push({ id: String(c.id), name: str(c.name, 40) || String(c.id), description: str(c.description, 200), plugins: ids });
  }
  return { updated: str(index.updated, 40), total: out.length, plugins: out, ...(cols.length ? { collections: cols.slice(0, 20) } : {}) };
}

function createRegistry({ env = {}, fetcher, now = Date.now } = {}) {
  const base = String(env.REGISTRY_URL || BASE).replace(/\/?$/, '/');
  const key = env.REGISTRY_PUBLIC_KEY || PUBLIC_KEY;
  const get = fetcher || (async (url, max) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'TurboFex-Pair' } });
    if (!r.ok) throw new Error('status ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) throw new Error('too big');
    return buf;
  });
  let cache = null; let pending = null; let docShas = new Map(); const docCache = new Map();

  async function load() {
    const bytes = await get(base + 'index.json', 1024 * 1024);
    const sig = (await get(base + 'index.json.sig', 4096)).toString('utf8').trim();
    let ok = false;
    try { ok = crypto.verify(null, bytes, crypto.createPublicKey(key), Buffer.from(sig, 'base64')); } catch (e) { ok = false; }
    if (!ok) throw new Error('bad signature');
    const index = JSON.parse(bytes.toString('utf8'));
    if (!index || index.format !== 1 || typeof index.plugins !== 'object') throw new Error('bad index');
    docShas = docShasOf(index);
    return makeView(index);
  }
  async function list() {
    if (cache && now() - cache.t < FRESH_MS) return cache.view;
    if (!pending) {
      pending = load().then((view) => { cache = { t: now(), view }; return view; })
        .catch((e) => { if (cache && now() - cache.t < STALE_MS && e.message !== 'bad signature') return cache.view; throw e; })
        .finally(() => { pending = null; });
    }
    return pending;
  }
  // README.md or CHANGELOG.md of one version, read from the registry and accepted only when it matches the fingerprint in the signed index
  const FILES = { readme: 'README.md', changelog: 'CHANGELOG.md' };
  async function doc(id, version, which) {
    if (!/^[a-z0-9-]{3,32}$/.test(String(id)) || !/^\d+\.\d+\.\d+$/.test(String(version)) || !Object.prototype.hasOwnProperty.call(FILES, which)) return null;
    await list();
    const want = (docShas.get(id + '@' + version) || {})[which]; if (!want) return null;
    if (docCache.has(want)) return docCache.get(want);
    const buf = await get(base + `plugins/${id}/${version}/${FILES[which]}`, 16 * 1024 + 1);
    if (crypto.createHash('sha256').update(buf).digest('hex') !== want) return null;
    const text = buf.toString('utf8'); if (docCache.size > 200) docCache.clear(); docCache.set(want, text); return text;
  }
  // the logo of one version, as PNG bytes, accepted only when it matches the fingerprint in the signed index and really is a small square PNG
  async function icon(id, version) {
    if (!/^[a-z0-9-]{3,32}$/.test(String(id)) || !/^\d+\.\d+\.\d+$/.test(String(version))) return null;
    await list();
    const want = (docShas.get(id + '@' + version) || {}).icon; if (!want) return null;
    if (docCache.has('i' + want)) return docCache.get('i' + want);
    const buf = await get(base + `plugins/${id}/${version}/icon.png`, 32 * 1024 + 1);
    if (crypto.createHash('sha256').update(buf).digest('hex') !== want) return null;
    if (buf.length < 33 || buf.toString('latin1', 1, 4) !== 'PNG' || buf.readUInt32BE(16) !== buf.readUInt32BE(20)) return null;
    if (docCache.size > 200) docCache.clear(); docCache.set('i' + want, buf); return buf;
  }
  // screenshot n (1 to 3) of one version, only when it matches the signed fingerprint and is a PNG of a sensible size
  async function shot(id, version, n) {
    n = Number(n); if (!Number.isInteger(n) || n < 1 || n > 3) return null;
    if (!/^[a-z0-9-]{3,32}$/.test(String(id)) || !/^\d+\.\d+\.\d+$/.test(String(version))) return null;
    await list();
    const want = ((docShas.get(id + '@' + version) || {}).shots || [])[n - 1]; if (!want) return null;
    if (docCache.has('s' + want)) return docCache.get('s' + want);
    const buf = await get(base + `plugins/${id}/${version}/screenshot${n}.png`, 200 * 1024 + 1);
    if (crypto.createHash('sha256').update(buf).digest('hex') !== want) return null;
    if (buf.length < 33 || buf.toString('latin1', 1, 4) !== 'PNG' || buf.readUInt32BE(16) > 2000 || buf.readUInt32BE(20) > 2000) return null;
    if (docCache.size > 200) docCache.clear(); docCache.set('s' + want, buf); return buf;
  }
  return { list, doc, icon, shot };
}
module.exports = { createRegistry, makeView, docShasOf, PERMS, PUBLIC_KEY };
