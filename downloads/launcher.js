// TurboFex - one-file launcher.
// Upload ONLY this file (index.js) to your host and start it. It downloads the bot, installs it, links your WhatsApp
// number with the session ID written below, and starts the bot. It needs nothing but Node.js 18 or newer.
//
// FOR THE PAIR SITE: replace the text  __TFX_SESSION_ID__  on the line below with the person's session ID
// (TFX-XXXX-XXXX-XXXX) and give the result to them as a download named  index.js.
const SESSION_ID = '__TFX_SESSION_ID__';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn, spawnSync } = require('child_process');

const ROOT = __dirname;
const ZIP_URL = process.env.TFX_BOT_ZIP || 'https://github.com/nels0nfx/TurboFex/releases/latest/download/TurboFex-hosting.zip';
const ID_RE = /^TFX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const say = (t) => console.log(`⚡ TurboFex: ${t}`);

function fail(t) {
  console.error(`\n❌ TurboFex: ${t}`);
  process.exit(1);
}

if (Number(process.versions.node.split('.')[0]) < 18) fail(`This host runs Node.js ${process.versions.node}. TurboFex needs Node.js 18 or newer (20 is best). Choose a newer Node.js version in your host settings and start again.`);

// ---------------------------------------------------------------- the download
async function download(url) {
  let lastErr = null;
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (i < 3) await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- a small ZIP reader (no packages needed)
function unzip(buf, onFile) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('the download is not a valid ZIP file');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('the ZIP file is damaged');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + csize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!data) throw new Error(`the ZIP file uses a method this launcher cannot read (${method})`);
    onFile(name, data);
  }
}

function safePath(name) {
  const clean = name.replace(/\\/g, '/').replace(/^\/+/, '');
  const target = path.resolve(ROOT, clean);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null; // never write outside this folder
  return target;
}

// ---------------------------------------------------------------- the session ID
function cleanId() {
  const raw = String(process.env.SESSION_ID || SESSION_ID || '').trim().toUpperCase();
  return ID_RE.test(raw) ? raw : '';
}

function writeSession(id) {
  if (!id) return false;
  if (fs.existsSync(path.join(ROOT, 'session', 'creds.json'))) return false; // already linked: an old ID must not replace a working login
  fs.writeFileSync(path.join(ROOT, 'session_id.txt'), `# TURBOFEX SESSION ID (written by the launcher)\nSESSION_ID=${id}\n`);
  return true;
}

// ---------------------------------------------------------------- start the bot
function start() {
  if (process.env.TFX_NO_START === '1') return say('Installed. (start skipped)');
  say('Starting the bot...');
  const child = spawn(process.execPath, [path.join(ROOT, 'index.js')], { cwd: ROOT, stdio: 'inherit', env: process.env });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
  child.on('exit', (code) => process.exit(code ?? 0));
}

async function main() {
  const id = cleanId();
  const DONE = path.join(ROOT, '.tfx-installed'); // written just before this file is replaced: without it the install is simply done again
  const installed = fs.existsSync(DONE) && fs.existsSync(path.join(ROOT, 'core', 'boot.js'));

  if (!installed) {
    if (!id && !fs.existsSync(path.join(ROOT, 'session', 'creds.json'))) {
      say('No valid session ID is written in this file. Get one on the pairing site and download a new index.js there.');
    }
    say('Downloading the bot (about 1 MB)...');
    let buf;
    try {
      buf = await download(ZIP_URL);
    } catch (err) {
      return fail(`I could not download the bot (${String(err.message).slice(0, 80)}). Check that your host allows internet access, then start again.`);
    }

    let launcherReplacement = null;
    let files = 0;
    try {
      unzip(buf, (name, data) => {
        const target = safePath(name);
        if (!target) return;
        if (path.basename(target) === 'index.js' && path.dirname(target) === ROOT) {
          launcherReplacement = data; // written LAST, so a stopped install can simply be started again
          return;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (/^(session_id\.txt|config\.env)$/.test(name) && fs.existsSync(target)) return; // never replace the person's own settings
        fs.writeFileSync(target, data);
        files += 1;
      });
    } catch (err) {
      return fail(`The downloaded bot could not be unpacked (${String(err.message).slice(0, 80)}). Start again to retry.`);
    }
    if (!launcherReplacement || !fs.existsSync(path.join(ROOT, 'package.json'))) return fail('The downloaded bot is incomplete. Start again to retry.');
    say(`Unpacked ${files + 1} files.`);

    if (process.env.TFX_SKIP_INSTALL !== '1') {
      say('Installing the bot packages (this takes a few minutes the first time)...');
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const r = spawnSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit' });
      if (r.status !== 0) return fail('The packages could not be installed. Check that your host has npm and internet access, then start again.');
    }

    if (writeSession(id)) say('Your session ID is saved.');
    fs.writeFileSync(DONE, new Date().toISOString());
    fs.writeFileSync(path.join(ROOT, 'index.js.new'), launcherReplacement);
    fs.renameSync(path.join(ROOT, 'index.js.new'), path.join(ROOT, 'index.js')); // from now on, this file IS the bot's own index.js
    say('Install finished.');
    return start();
  }

  // already installed (this file was started again before it was replaced): save the ID if there is a new one, then start
  if (writeSession(id)) say('Your session ID is saved.');
  return start();
}

main().catch((err) => fail(`Something went wrong: ${String(err.message).slice(0, 100)}. Start again to retry.`));
