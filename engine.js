// Talks to WhatsApp: asks for a pairing code for one number, waits until the person has entered it on the phone,
// and hands back the finished login (creds.json). One call = one temporary session folder, removed at the end.
const fs = require('fs');
const os = require('os');
const path = require('path');

let libPromise = null;
function loadLib() {
  if (!libPromise) {
    libPromise = (async () => {
      const mod = await import('@whiskeysockets/baileys');
      const def = mod.default;
      const lib = { ...(def && typeof def === 'object' ? def : {}), ...mod };
      lib.makeWASocket = mod.makeWASocket || (typeof def === 'function' ? def : def && (def.makeWASocket || def.default));
      if (typeof lib.makeWASocket !== 'function') throw new Error('The WhatsApp library has no makeWASocket function.');
      return lib;
    })();
  }
  return libPromise;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// hooks: onCode(code "ABCD-EFGH"), onPairing() (the phone accepted the code), onLinked(creds), onFail(message)
function start(number, hooks, opts = {}) {
  const tmpRoot = opts.tmpDir || path.join(os.tmpdir(), 'tfx-pair');
  fs.mkdirSync(tmpRoot, { recursive: true });
  let workDir = null;
  let sock = null;
  let finished = false;

  const cleanup = () => {
    try {
      if (sock) sock.end(undefined); // closes the connection; does NOT log the phone out
    } catch (err) {
      // already closed
    }
    sock = null;
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  };
  const finish = (fn, arg) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (fn) fn(arg);
  };

  (async () => {
    const lib = await loadLib();
    workDir = fs.mkdtempSync(path.join(tmpRoot, 'p-'));
    const { state, saveCreds } = await lib.useMultiFileAuthState(workDir);

    let version = {};
    try {
      const fetcher = lib.fetchLatestWaWebVersion || lib.fetchLatestBaileysVersion;
      const found = fetcher ? await withTimeout(fetcher(), 10000) : null;
      if (found && Array.isArray(found.version)) version = { version: found.version };
    } catch (err) {
      // use the built-in version
    }

    const pino = require('pino');
    const restartCode = (lib.DisconnectReason && lib.DisconnectReason.restartRequired) || 515;
    let asked = false;
    let reconnects = 0;
    let lastIqError = null;

    const connect = () => {
      if (finished) return;
      const s = lib.makeWASocket({
        auth: state,
        browser: lib.Browsers.ubuntu('Chrome'), // the identity WhatsApp accepted for pairing codes
        ...version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });
      sock = s;
      s.ev.on('creds.update', () => Promise.resolve(saveCreds()).catch(() => {}));

      if (s.ws && typeof s.ws.on === 'function') {
        s.ws.on('CB:iq,type:error', (node) => {
          const e = Array.isArray(node && node.content) ? node.content.find((c) => c && c.tag === 'error') : null;
          lastIqError = { at: Date.now(), code: e && e.attrs && e.attrs.code, text: e && e.attrs && e.attrs.text };
        });
      }

      s.ev.on('connection.update', async (u) => {
        if (finished || s !== sock) return;

        // the first QR event means the connection is ready: ask for the pairing code (QR itself is ignored)
        if (u.qr && !asked && !state.creds.registered) {
          asked = true;
          const t0 = Date.now();
          try {
            const raw = await s.requestPairingCode(number);
            await new Promise((r) => setTimeout(r, 2500)); // WhatsApp's refusal, if any, arrives a moment later
            if (finished) return;
            if (lastIqError && lastIqError.at >= t0 - 500) {
              return finish(hooks.onFail, `WhatsApp refused the pairing code (${lastIqError.code || '?'} ${lastIqError.text || ''}). Check the number and try again.`);
            }
            hooks.onCode(String(raw).match(/.{1,4}/g).join('-'));
          } catch (err) {
            return finish(hooks.onFail, `Could not get a pairing code: ${err.message}`);
          }
        }

        if (u.isNewLogin && hooks.onPairing) hooks.onPairing(); // the phone accepted the code

        if (u.connection === 'open' && state.creds.registered) {
          await new Promise((r) => setTimeout(r, 2500)); // let the login be saved to disk
          try {
            const creds = JSON.parse(fs.readFileSync(path.join(workDir, 'creds.json'), 'utf8'));
            if (!creds.registered || !(creds.me && creds.me.id)) throw new Error('not registered');
            return finish(hooks.onLinked, creds);
          } catch (err) {
            return finish(hooks.onFail, 'Linked, but the login could not be saved. Please try again.');
          }
        }

        if (u.connection === 'close') {
          const status = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
          // after the code is accepted, WhatsApp asks for one reconnect (515): that finishes the link
          if ((state.creds.registered || status === restartCode || !asked) && reconnects < 4) {
            reconnects++;
            return void setTimeout(connect, 600);
          }
          return finish(hooks.onFail, status === 401 ? 'WhatsApp refused the link. Try again.' : 'The code expired or the connection closed. Try again.');
        }
      });
    };
    connect();
  })().catch((err) => finish(hooks.onFail, `Could not start: ${err.message}`));

  return { cancel: () => finish(null) };
}

module.exports = { start };
