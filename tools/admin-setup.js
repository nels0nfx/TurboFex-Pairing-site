#!/usr/bin/env node
'use strict';
// Makes an admin account for the TurboFex dashboard. Run it on YOUR phone/computer (Termux is fine), not on the server:
//   node tools/admin-setup.js
// It asks for a username, a role and a password, then prints (1) a QR code to scan with an authenticator app (Google Authenticator,
// Microsoft Authenticator, Aegis, 2FAS ...) and (2) one line to paste into Render > Environment > ADMIN_ACCOUNTS.
// The password is never printed or saved: only its scrypt hash goes into the line. To add a second admin, paste the old ADMIN_ACCOUNTS
// value when asked and the new account is added to it.
const readline = require('readline');
const { hashPassword, newTotpSecret, PERMS } = require('../admin');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let muted = false;
const origWrite = rl._writeToOutput;
rl._writeToOutput = function (s) { if (muted) { if (s.includes('\n') || s.includes('\r')) origWrite.call(rl, s); } else if (origWrite) origWrite.call(rl, s); };
// lines are queued as they arrive, so typing ahead or piping input also works
const queue = [], waiting = [];
rl.on('line', (l) => { if (waiting.length) waiting.shift()(l); else queue.push(l); });
const ask = (q, hidden) => new Promise((res) => {
  process.stdout.write(q); muted = !!hidden;
  const done = (a) => { muted = false; res(a); };
  if (queue.length) done(queue.shift()); else waiting.push(done);
});

(async () => {
  console.log('\nTurboFex admin setup\n');
  const user = String(await ask('Username (3-32 letters, numbers . _ -): ')).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(user)) { console.log('That username is not allowed.'); process.exit(1); }
  const role = String(await ask('Role (owner / moderator / viewer) [owner]: ')).trim().toLowerCase() || 'owner';
  if (!PERMS[role]) { console.log('Role must be owner, moderator or viewer.'); process.exit(1); }
  const pw = await ask('Password (at least 12 characters, hidden): ', true); console.log('');
  const pw2 = await ask('Type the password again: ', true); console.log('');
  if (pw !== pw2) { console.log('The two passwords are not the same.'); process.exit(1); }
  if (pw.length < 12) { console.log('Use at least 12 characters.'); process.exit(1); }
  const existingRaw = String(await ask('Paste your current ADMIN_ACCOUNTS value to ADD this admin to it (or just press Enter): ')).trim();
  let list = [];
  if (existingRaw) { try { list = JSON.parse(existingRaw); if (!Array.isArray(list)) throw new Error('x'); } catch (e) { console.log('That value is not valid. Nothing was changed.'); process.exit(1); } }
  if (list.some((a) => a && a.user === user)) { console.log('That username already exists in the value you pasted.'); process.exit(1); }
  const totp = newTotpSecret();
  list.push({ user, role, hash: hashPassword(pw), totp });
  const uri = `otpauth://totp/TurboFex:${encodeURIComponent(user)}?secret=${totp}&issuer=TurboFex&period=30&digits=6`;
  console.log('\n1) Scan this QR code with your authenticator app (or type the key by hand):\n');
  try { require('qrcode-terminal').generate(uri, { small: true }); } catch (e) { console.log('(QR not available here)'); }
  console.log('Key to type by hand: ' + totp.match(/.{1,4}/g).join(' ') + '\n');
  console.log('2) In Render open your service > Environment, add (or replace) this variable, then save and let it redeploy:\n');
  console.log('ADMIN_ACCOUNTS=' + JSON.stringify(list) + '\n');
  console.log('3) Open https://YOUR-SITE/admin and sign in with the username, the password and the 6-digit code.\n');
  console.log('Keep the line private (it holds password hashes and 2FA keys). Do not paste it into chats or commit it to GitHub.\n');
  rl.close();
})();
