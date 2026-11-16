const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createDevCentre } = require('../devcentre');
const { checkPlugin } = require('../plugin-check');
const signer = require('../signer');

const kp = crypto.generateKeyPairSync('ed25519');
const KEY = kp.privateKey.export({ type: 'pkcs8', format: 'pem' });
const manifest = (version) => JSON.stringify({ manifestVersion: 1, id: 'mention-master', version, apiVersion: 1, name: 'MentionMaster', description: 'Mentions', author: { name: 'Alice' }, permissions: ['chat.send'], commands: [{ name: 'mentionhi', who: 'admin', description: 'Tag all' }] });
const CODE = "turbofex.command('mentionhi', async (ctx) => { await ctx.reply('hi'); });\n// ok\n// ok\n";
function make(env) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-auto-'));
  const dc = createDevCentre({ env: { GITHUB_CLIENT_ID: 'c', GITHUB_CLIENT_SECRET: 's', SITE_URL: 'https://x.example', ...env }, dataDir });
  let n = 0;
  const add = (version, extra = {}) => {
    const raw = manifest(version), c = checkPlugin(raw, CODE); assert.ok(c.ok, JSON.stringify(c.errors));
    const s = { id: 'sub' + (++n), githubId: 5, login: 'alice', repo: 'https://github.com/alice/mm', tag: 'v' + version, folder: '', status: 'pending', createdAt: 1000 * n, updatedAt: 1000 * n, manifest: c.manifest, manifestRaw: raw, entrySource: CODE, manifestSha: c.manifestSha, entrySha: c.entrySha, flags: [], risk: c.risk, note: '', reviewedBy: '', ...extra };
    dc._subs.set(s.id, s); return s;
  };
  return { dc, add };
}
const verified = (dc, rel) => dc.registryFile(rel);

test('with a signing key, approving publishes at once and the store is signed by the site', () => {
  const { dc, add } = make({ REGISTRY_SIGNING_KEY: KEY });
  assert.strictEqual(dc.autoOn, true);
  const s = add('1.0.0');
  assert.strictEqual(dc.adminReview(s.id, 'approve', '', 'own').status, 200);
  assert.strictEqual(s.status, 'published');
  const bytes = verified(dc, 'index.json'), sig = verified(dc, 'index.json.sig').toString().trim();
  assert.ok(crypto.verify(null, bytes, kp.publicKey, Buffer.from(sig, 'base64')), 'the signature matches');
  const idx = JSON.parse(bytes.toString());
  const e = idx.plugins['mention-master'].versions['1.0.0'];
  assert.strictEqual(e.entrySha, s.entrySha); assert.deepStrictEqual(e.permissions, ['chat.send']);
  const file = verified(dc, 'plugins/mention-master/1.0.0/index.js');
  assert.strictEqual(crypto.createHash('sha256').update(file).digest('hex'), e.entrySha);
  assert.strictEqual(verified(dc, 'plugins/mention-master/9.9.9/index.js'), null);
});

test('withdrawing signs the withdrawal at once; a new version shows as an update of the old one', () => {
  const { dc, add } = make({ REGISTRY_SIGNING_KEY: KEY });
  const a = add('1.0.0'); dc.adminReview(a.id, 'approve', '', 'own');
  const b = add('1.0.2');
  assert.strictEqual(dc.adminGet(b.id).updateOf, '1.0.0');
  assert.strictEqual(dc.adminList().submissions.find((x) => x.id === b.id).updateOf, '1.0.0');
  assert.strictEqual(dc.adminList().submissions.find((x) => x.id === a.id).updateOf, '');
  dc.adminReview(b.id, 'approve', '', 'own');
  assert.strictEqual(dc.adminRevoke(a.id, 'old and broken', 'own').status, 200);
  assert.strictEqual(a.status, 'revoked'); assert.strictEqual(a.revoke.done, true);
  const idx = JSON.parse(verified(dc, 'index.json').toString());
  assert.deepStrictEqual(idx.revoked.map((r) => [r.id, r.version]), [['mention-master', '1.0.0']]);
  assert.ok(idx.plugins['mention-master'].versions['1.0.2']);
  assert.strictEqual(idx.plugins['mention-master'].name, 'MentionMaster');
});

test('without a key nothing changes: approved waits for the phone command, and no store files are served', () => {
  const { dc, add } = make({});
  assert.strictEqual(dc.autoOn, false);
  const s = add('1.0.0'); dc.adminReview(s.id, 'approve', '', 'own');
  assert.strictEqual(s.status, 'approved');
  assert.strictEqual(dc.registryFile('index.json'), null);
});

test('a key set later finishes plugins that were approved or withdrawn while it was missing', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfx-auto-'));
  const env = { GITHUB_CLIENT_ID: 'c', GITHUB_CLIENT_SECRET: 's', SITE_URL: 'https://x.example' };
  fs.mkdirSync(path.join(dataDir, 'devcentre'), { recursive: true });
  const mk = (id, version, status, extra = {}) => { const raw = manifest(version), c = checkPlugin(raw, CODE); return { id, githubId: 5, login: 'alice', repo: 'https://github.com/alice/mm', tag: 'v' + version, folder: '', status, createdAt: 1, updatedAt: 1, manifest: c.manifest, manifestRaw: raw, entrySource: CODE, manifestSha: c.manifestSha, entrySha: c.entrySha, flags: [], risk: c.risk, note: '', reviewedBy: '', ...extra }; };
  const waiting = mk('aaaaaaa1', '1.0.0', 'approved'), leaving = mk('aaaaaaa2', '1.0.1', 'published', { publishedAt: 5, revoke: { reason: 'bad', at: 9, by: 'own', done: false } });
  for (const r of [waiting, leaving]) fs.writeFileSync(path.join(dataDir, 'devcentre', 'sub_' + r.id + '.json'), JSON.stringify(r));
  const off = createDevCentre({ env, dataDir });
  assert.strictEqual(off._subs.get('aaaaaaa1').status, 'approved');
  const on = createDevCentre({ env: { ...env, REGISTRY_SIGNING_KEY: KEY }, dataDir });
  assert.strictEqual(on._subs.get('aaaaaaa1').status, 'published');
  assert.strictEqual(on._subs.get('aaaaaaa2').status, 'revoked');
  const idx = JSON.parse(on.registryFile('index.json').toString());
  assert.deepStrictEqual(Object.keys(idx.plugins['mention-master'].versions).sort(), ['1.0.0', '1.0.1']);
  assert.strictEqual(idx.revoked.length, 1);
});

test('signer: a key written with typed-out \\n or as base64 is accepted, a wrong key is not', () => {
  assert.ok(signer.loadKey(KEY));
  assert.ok(signer.loadKey(KEY.trim().split('\n').join('\\n')));
  assert.ok(signer.loadKey(Buffer.from(KEY).toString('base64')));
  assert.strictEqual(signer.loadKey('nonsense'), null);
  assert.strictEqual(signer.loadKey(crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })), null);
  assert.strictEqual(signer.loadKey(''), null);
});
