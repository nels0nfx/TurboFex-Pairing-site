'use strict';
// Builds and signs the plugin store ON THE SITE, so approving or withdrawing a plugin needs no command on the owner's phone.
// It makes the same files the phone tool (tools/registry.js in the bot) makes: index.json, index.json.sig and one folder per
// plugin version. The bot checks the signature with the public keys it ships with, so a signing key only works after its
// PUBLIC key is inside the bot (registry-key.json). The key is read from the REGISTRY_SIGNING_KEY setting and is never shown,
// logged or sent anywhere.
const crypto = require('crypto');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const semverCmp = (a, b) => { const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const reId = /^[a-z0-9-]{3,32}$/;

// the key may be written as normal PEM text, as PEM with \n typed out (some hosts do that), or as base64 of the PEM
function loadKey(raw) {
  let t = String(raw || '').trim();
  if (!t) return null;
  if (!t.includes('BEGIN')) { try { t = Buffer.from(t, 'base64').toString('utf8'); } catch (e) { return null; } }
  t = t.replace(/\\n/g, '\n');
  try {
    const priv = crypto.createPrivateKey(t);
    if (priv.asymmetricKeyType !== 'ed25519') return null;
    return { priv, publicPem: crypto.createPublicKey(priv).export({ type: 'spki', format: 'pem' }) };
  } catch (e) { return null; }
}

function cleanCollections(arr) {
  const out = [];
  for (const c of Array.isArray(arr) ? arr : []) {
    if (!c || typeof c !== 'object' || !reId.test(String(c.id)) || !Array.isArray(c.plugins) || out.some((x) => x.id === c.id)) continue;
    const ids = [...new Set(c.plugins.filter((x) => reId.test(String(x))).map(String))];
    if (ids.length < 2 || ids.length > 8) continue;
    const name = String(c.name || '').trim().slice(0, 40); if (!name) continue;
    out.push({ id: String(c.id), name, description: String(c.description || '').trim().slice(0, 200), plugins: ids });
  }
  return out.slice(0, 20);
}

const isoOf = (t) => { try { return new Date(t || Date.now()).toISOString(); } catch (e) { return new Date().toISOString(); } };

// subs: the submissions the site keeps. Only published versions (and withdrawn ones, which bots must still hear about) go in.
function build(subs, collections, key) {
  const files = new Map();   // 'plugins/<id>/<version>/<file>' -> Buffer
  const plugins = {}, revoked = [];
  const list = subs.filter((s) => (s.status === 'published' || s.status === 'revoked') && s.manifest && reId.test(String(s.manifest.id)) && /^\d+\.\d+\.\d+$/.test(String(s.manifest.version)) && typeof s.manifestRaw === 'string' && typeof s.entrySource === 'string')
    .sort((a, b) => (a.publishedAt || a.createdAt) - (b.publishedAt || b.createdAt));
  for (const s of list) {
    const id = s.manifest.id, version = s.manifest.version, entry = String(s.manifest.entry || 'index.js');
    if (!/^[\w.-]{1,80}$/.test(entry) || entry.includes('..')) continue;
    const manifestBuf = Buffer.from(s.manifestRaw), entryBuf = Buffer.from(s.entrySource);
    if (sha(manifestBuf) !== s.manifestSha || sha(entryBuf) !== s.entrySha) continue;   // the stored copy must still be exactly what was reviewed
    const base = `plugins/${id}/${version}/`;
    files.set(base + 'turbofex-plugin.json', manifestBuf); files.set(base + entry, entryBuf);
    const e = { manifestSha: s.manifestSha, entrySha: s.entrySha, entry, permissions: s.manifest.permissions || [], domains: s.manifest.domains || [], publishedAt: isoOf(s.publishedAt || s.createdAt) };
    for (const [k, f] of [['readme', 'README.md'], ['changelog', 'CHANGELOG.md']]) {
      if (typeof s[k] === 'string' && s[k]) { const b = Buffer.from(s[k]); if (sha(b) === s[k + 'Sha']) { files.set(base + f, b); e[k + 'Sha'] = s[k + 'Sha']; } }
    }
    if (typeof s.icon === 'string' && s.icon) { const b = Buffer.from(s.icon, 'base64'); if (sha(b) === s.iconSha) { files.set(base + 'icon.png', b); e.iconSha = s.iconSha; } }
    if (Array.isArray(s.shots) && s.shots.length && s.shots.length <= 3 && Array.isArray(s.shotShas) && s.shotShas.length === s.shots.length) {
      const bs = s.shots.map((t) => Buffer.from(t, 'base64'));
      if (bs.every((b, i) => sha(b) === s.shotShas[i])) { bs.forEach((b, i) => files.set(base + `screenshot${i + 1}.png`, b)); e.shotShas = s.shotShas.slice(); }
    }
    const p = plugins[id] || (plugins[id] = { versions: {} });
    p.versions[version] = e;
    if (s.status === 'revoked' && s.revoke) revoked.push({ id, version, reason: String(s.revoke.reason || '').slice(0, 200), at: isoOf(s.revoke.at) });
  }
  for (const [id, p] of Object.entries(plugins)) {   // name, description and author come from the newest version
    const latest = Object.keys(p.versions).sort(semverCmp).pop();
    const s = list.find((x) => x.manifest.id === id && x.manifest.version === latest);
    p.name = s.manifest.name; p.description = s.manifest.description; p.author = s.manifest.author;
  }
  const index = { format: 1, updated: new Date().toISOString(), plugins: Object.fromEntries(Object.entries(plugins).sort()), revoked };
  const cols = cleanCollections(collections); if (cols.length) index.collections = cols;
  const bytes = Buffer.from(JSON.stringify(index, null, 1) + '\n');
  const sig = Buffer.from(crypto.sign(null, bytes, key.priv).toString('base64') + '\n');
  files.set('index.json', bytes); files.set('index.json.sig', sig);
  return { files, index };
}
module.exports = { loadKey, build, cleanCollections };
