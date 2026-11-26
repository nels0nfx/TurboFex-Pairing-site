#!/usr/bin/env node
'use strict';
// Builds the PUBLIC hosting ZIP that the Deploy Centre serves at /download/TurboFex-hosting.zip.
//   node tools/prepare-hosting-zip.js path/to/TurboFex-hosting-vX_Y_Z.zip
// It removes private and development-only files, checks that everything the bot needs is still there, and writes
//   downloads/TurboFex-hosting.zip   (served as-is)
//   downloads/hosting.json           (version, size, checksum, what was removed)
// Then commit both files and deploy. Run it again for every new bot release: that is the whole update process.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zipkit = require('./zipkit');

// removed: private notes and keys-handling, AI-assistant instruction files, the developer test-suite, owner-only scripts
const REMOVE = [
  /(^|\/)[^/]*\.private\.[^/]*$/i, /^(CLAUDE|GEMINI|AGENTS)\.md$/i, /^\.(cursorrules|windsurfrules|clinerules)$/i, /^\.github\/copilot-instructions\.md$/i,
  /^KEY_ROTATION\.md$/i, /^PROJECT_GUIDE\.md$/i, /^tests\//, /^\.git\//, /^node_modules\//, /^(data|session|accounts)\//, /^(config\.env|\.env|accounts\.json|session_id\.txt)$/, /\.DS_Store$/,
];
// the bot cannot run, update or be hosted without these
const REQUIRED = ['package.json', 'index.js', 'config.js', 'update.json', 'changelog.txt', 'removed-files.txt', 'Dockerfile', 'docker-compose.yml', 'Procfile', 'ecosystem.config.js', 'hosting/turbofex.service', 'core/brand.js', 'core/sessionid.js', 'core/envfile.js', 'core/hostport.js', 'whatsapp/connection.js'];
const SECRETS = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /ghp_[A-Za-z0-9]{20,}/, /\bsk-[A-Za-z0-9]{20,}/, /service_role/, /SUPABASE_SERVICE/];

function build(srcBuf) {
  const all = zipkit.read(srcBuf).filter((e) => !e.dir);
  const strip = all.find((e) => e.name === 'package.json') ? '' : null;
  if (strip === null) throw new Error('package.json is not at the top level of the ZIP. Use the release ZIP, not a "Download ZIP" archive of the source code.');
  const removed = [], kept = [];
  for (const e of all) (REMOVE.some((r) => r.test(e.name)) ? removed : kept).push(e);
  const names = new Set(kept.map((e) => e.name)), problems = [];
  for (const r of REQUIRED) if (!names.has(r)) problems.push('missing required file: ' + r);
  const pkg = JSON.parse(kept.find((e) => e.name === 'package.json').data.toString('utf8'));
  if (!pkg.version || !/^\d+\.\d+\.\d+/.test(pkg.version)) problems.push('package.json has no version');
  // every relative require('./x') / require('../x') in the kept JavaScript must still point at a kept file
  const exists = (p) => names.has(p) || names.has(p + '.js') || names.has(p + '.json') || names.has(p + '/index.js');
  for (const e of kept) {
    if (!/\.js$/.test(e.name)) continue;
    const src = e.data.toString('utf8');
    for (const m of src.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(e.name), m[1]));
      if (!exists(target)) problems.push(`${e.name} requires ${m[1]} which is not in the ZIP`);
    }
  }
  for (const e of kept) {   // nothing private may be left behind
    if (/\.private\./i.test(e.name)) problems.push('private file left in: ' + e.name);
    if (/\.(js|json|md|txt|sh|yml|yaml|service)$|^(Dockerfile|Procfile)$/.test(e.name)) { const t = e.data.toString('utf8'); for (const s of SECRETS) if (s.test(t)) problems.push(`${e.name} looks like it holds a secret (${s})`); }
  }
  if (problems.length) { const err = new Error('The ZIP is not ready:\n - ' + problems.join('\n - ')); err.problems = problems; throw err; }
  const out = zipkit.write(kept.map((e) => ({ name: e.name, data: e.data, mode: e.mode || (/\.sh$/.test(e.name) ? 0o755 : 0o644) })));
  return { zip: out, version: pkg.version, files: kept.length, removed: removed.map((e) => e.name).sort() };
}
module.exports = { build, REMOVE, REQUIRED };

if (require.main === module) {
  const src = process.argv[2];
  if (!src) { console.error('Usage: node tools/prepare-hosting-zip.js path/to/TurboFex-hosting-vX_Y_Z.zip'); process.exit(2); }
  try {
    const srcBuf = fs.readFileSync(src), r = build(srcBuf), dir = path.join(__dirname, '..', 'downloads');
    fs.mkdirSync(dir, { recursive: true });
    const file = `TurboFex-hosting-v${r.version.replace(/\./g, '_')}.zip`;
    fs.writeFileSync(path.join(dir, 'TurboFex-hosting.zip'), r.zip);
    fs.writeFileSync(path.join(dir, 'hosting.json'), JSON.stringify({ version: r.version, file, size: r.zip.length, sha256: crypto.createHash('sha256').update(r.zip).digest('hex'), files: r.files, removed: r.removed, sourceSha256: crypto.createHash('sha256').update(srcBuf).digest('hex'), builtAt: new Date().toISOString() }, null, 2) + '\n');
    console.log(`Hosting ZIP v${r.version}: ${r.files} files kept, ${r.removed.length} removed:\n  ${r.removed.join('\n  ')}\nWrote downloads/TurboFex-hosting.zip and downloads/hosting.json. Commit both and deploy.`);
  } catch (err) { console.error(err.message); process.exit(1); }
}
