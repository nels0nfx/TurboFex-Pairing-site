// Saves linked sessions for a short time, encrypted, and hands them out against a short session ID.
// - The ID looks like TFX-K7M2-9QXA-4BNP (12 random characters = 60 bits, so it cannot be guessed).
// - The file name is a hash of the ID, and the file is encrypted with a key made from the ID AND the site secret,
//   so the files on disk are useless without the ID.
// - An ID works once and expires 5 minutes after it was made (the expiry time is saved with the record,
//   protected against edits, and checked on every use, so it stays correct across restarts).
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

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function makeStore({ dir, secret, ttlMs = DEFAULT_TTL_MS, oneTime = true }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const fileOf = (id) => path.join(dir, crypto.createHash('sha256').update(id).digest('hex') + '.json');
  const keyOf = (id) => Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), Buffer.from(id), 32));

  // `now` is when the ID is made; the ID stops working at now + ttlMs
  function put(creds, now = Date.now()) {
    const id = newId();
    const exp = now + ttlMs;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyOf(id), iv);
    cipher.setAAD(Buffer.from('v2:' + exp)); // the expiry time is part of what is signed: editing it breaks the record
    const data = Buffer.concat([cipher.update(JSON.stringify(creds), 'utf8'), cipher.final()]);
    const body = JSON.stringify({ v: 2, exp, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
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
    // expired (or an old-format record): rejected right here, even if the clean-up has not run yet
    if (!rec || rec.v !== 2 || !Number.isFinite(rec.exp) || Date.now() >= rec.exp) {
      fs.rmSync(file, { force: true });
      return null;
    }
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', keyOf(id), Buffer.from(rec.iv, 'base64'));
      d.setAAD(Buffer.from('v2:' + rec.exp));
      d.setAuthTag(Buffer.from(rec.tag, 'base64'));
      const plain = Buffer.concat([d.update(Buffer.from(rec.data, 'base64')), d.final()]).toString('utf8');
      const creds = JSON.parse(plain);
      // used immediately: removed in the same step, before the answer goes out (nothing can run in between)
      if (oneTime) fs.rmSync(file, { force: true });
      return creds;
    } catch (err) {
      return null; // wrong key or an edited record: nothing is returned (the clean-up removes it when it expires)
    }
  }

  function sweep() {
    let n = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (!rec || rec.v !== 2 || !Number.isFinite(rec.exp) || Date.now() >= rec.exp) throw new Error('expired');
      } catch (err) {
        fs.rmSync(path.join(dir, f), { force: true });
        n++;
      }
    }
    return n;
  }

  return { put, take, sweep, ttlMs };
}

module.exports = { makeStore, newId, normalizeId, DEFAULT_TTL_MS };
