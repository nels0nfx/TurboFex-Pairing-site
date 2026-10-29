// Saves linked sessions for a short time, encrypted, and hands them out against a short session ID.
// - The ID looks like TFX-K7M2-9QXA-4BNP (12 random characters = 60 bits, so it cannot be guessed).
// - The file name is a hash of the ID, and the file is encrypted with a key made from the ID AND the site secret,
//   so the files on disk are useless without the ID.
// - By default an ID works once (ONE_TIME) and expires after SESSION_TTL_HOURS.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 letters/digits, no 0 O 1 I
const PREFIX = 'TFX';

function newId() {
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHABET[crypto.randomInt(32)];
  return `${PREFIX}-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

// accepts "tfx-k7m2-9qxa-4bnp", "TFX K7M2 9QXA 4BNP", "K7M29QXA4BNP"... returns the canonical ID or null
function normalizeId(input) {
  let s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith(PREFIX)) s = s.slice(PREFIX.length);
  if (s.length !== 12 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `${PREFIX}-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function makeStore({ dir, secret, ttlMs = 24 * 3600 * 1000, oneTime = true }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const fileOf = (id) => path.join(dir, crypto.createHash('sha256').update(id).digest('hex') + '.json');
  const keyOf = (id) => Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), Buffer.from(id), 32));

  function put(creds) {
    const id = newId();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyOf(id), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(creds), 'utf8'), cipher.final()]);
    const body = JSON.stringify({ exp: Date.now() + ttlMs, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
    const file = fileOf(id);
    fs.writeFileSync(file + '.tmp', body, { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
    return id;
  }

  // returns the saved login, or null when the ID is wrong, expired or already used
  function take(rawId) {
    const id = normalizeId(rawId);
    if (!id) return null;
    const file = fileOf(id);
    let rec;
    try {
      rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      return null;
    }
    if (!rec || Date.now() > rec.exp) {
      fs.rmSync(file, { force: true });
      return null;
    }
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', keyOf(id), Buffer.from(rec.iv, 'base64'));
      d.setAuthTag(Buffer.from(rec.tag, 'base64'));
      const plain = Buffer.concat([d.update(Buffer.from(rec.data, 'base64')), d.final()]).toString('utf8');
      const creds = JSON.parse(plain);
      if (oneTime) fs.rmSync(file, { force: true });
      return creds;
    } catch (err) {
      return null;
    }
  }

  function sweep() {
    let n = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (!rec || Date.now() > rec.exp) throw new Error('expired');
      } catch (err) {
        fs.rmSync(path.join(dir, f), { force: true });
        n++;
      }
    }
    return n;
  }

  return { put, take, sweep };
}

module.exports = { makeStore, newId, normalizeId };
