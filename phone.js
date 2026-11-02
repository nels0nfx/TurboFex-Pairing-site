'use strict';
// Server-side number check. The page checks while you type, but the SERVER decides: nothing the browser says is trusted.
// 1) the country table in public/countries.js (the same file the page uses)  2) the libphonenumber-js library, when it is installed
// (it is listed as an optional dependency, so Render installs it)  3) nothing here can tell whether the number HAS WhatsApp:
// WhatsApp does not offer a reliable check before pairing, so a code is only shown after WhatsApp accepts the real pairing request.
const crypto = require('crypto');
const P = require('./public/countries.js');

let lib = null;
try { lib = require('libphonenumber-js/max'); } catch (err) { try { lib = require('libphonenumber-js'); } catch (err2) { lib = null; } }
const setLib = (l) => { lib = l; };

function check(raw, iso, env = process.env) {
  const text = String(raw == null ? '' : raw);
  if (text.length > 40) return { ok: false, state: 'invalid', error: 'That does not look like a phone number.' };
  if (/[^\d\s()+.\-]/.test(text)) return { ok: false, state: 'invalid', error: 'Use digits only (spaces, + and - are fine).' };
  const a = P.analyze(text, P.byIso(iso) ? iso : '');
  if (a.state === 'empty') return { ok: false, state: 'empty', error: 'Enter your WhatsApp number.' };
  if (a.state === 'incomplete') return { ok: false, state: 'incomplete', error: `That number is too short for ${(P.byIso(a.iso) || {}).name || 'this country'}: ${a.remaining} more digit${a.remaining > 1 ? 's' : ''} needed.` };
  if (a.state === 'toolong' || a.state === 'invalid') return { ok: false, state: a.state, error: a.message || 'That number is not valid for the selected country.' };
  let checkedBy = 'table';
  if (lib && String(env.STRICT_PHONE || '1') !== '0') {
    try {
      const p = (lib.parsePhoneNumberFromString || lib.parsePhoneNumber)('+' + a.e164);
      if (p) {
        checkedBy = 'libphonenumber';
        if (!p.isValid()) return { ok: false, state: 'invalid', error: 'That number is not valid for the selected country.' };
      }
    } catch (err) { /* the library could not read it: the table result stands */ }
  }
  return { ok: true, state: 'valid', e164: a.e164, iso: a.iso, checkedBy };
}

// a number is never stored or logged in full: counting uses a one-way hash, logs show the country code and the last two digits
const hashOf = (e164, secret = '') => crypto.createHash('sha256').update(secret + ':' + e164).digest('hex').slice(0, 24);
const mask = (e164) => { const s = String(e164 || ''); return s.length > 4 ? s.slice(0, 2) + '…' + s.slice(-2) : '…'; };

module.exports = { check, hashOf, mask, setLib, P };
