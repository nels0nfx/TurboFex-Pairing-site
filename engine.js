// Talks to WhatsApp: shows a pairing code (or a QR) for one login, waits until the phone has linked, hands back the
// finished login (creds.json), and sends the person their session ID as a WhatsApp message to themselves.
// One call = one temporary session folder, removed at the end.
const fs = require('fs');
const os = require('os');
const path = require('path');
const pairfix = require('./pairfix'); // WhatsApp's new step after a QR scan ("Couldn't link device" without it)

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// Sends `text` to the person's own WhatsApp (the "message yourself" chat). Never throws: the page shows the ID anyway.
async function sendDm(sock, creds, text, lib = {}, nap = sleep) {
  try {
    const raw = (sock && sock.user && sock.user.id) || (creds && creds.me && creds.me.id);
    if (!raw || !text) return false;
    const jid = typeof lib.jidNormalizedUser === 'function' ? lib.jidNormalizedUser(raw) : `${String(raw).split('@')[0].split(':')[0]}@s.whatsapp.net`;
    await withTimeout(sock.sendMessage(jid, { text }), 12000);
    await nap(2500); // give the message time to leave before the connection is closed
    return true;
  } catch (err) {
    console.log('[pair] could not send the session ID message:', err.message);
    return false;
  }
}

// method 'code': asks WhatsApp for a pairing code for `number`.  method 'qr': shows a QR to scan (no number needed).
// hooks: onCode(code "ABCD-EFGH"), onQr(text of the QR, a new one now and then), onPairing() (the phone accepted),
//        onLinked(creds) -> optional text to send to the person on WhatsApp, onDm(true|false) (was it sent), onFail(message)
function start(number, hooks, opts = {}) {
  const method = opts.method === 'qr' ? 'qr' : 'code';
  const tag = `[pair ${method} ${number ? number.slice(0, 4) + '…' : 'qr'}]`;
  const log = (...a) => console.log(tag, ...a);
  const nap = (ms) => sleep(opts.fast ? 5 : ms); // (tests run fast)
  const tmpRoot = opts.tmpDir || path.join(os.tmpdir(), 'tfx-pair');
  fs.mkdirSync(tmpRoot, { recursive: true });
  let workDir = null;
  let sock = null;
  let finished = false;
  let completing = false;
  let fallback = null;

  const cleanup = () => {
    clearTimeout(fallback);
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
    const lib = opts.lib || (await loadLib());
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

    const restartCode = (lib.DisconnectReason && lib.DisconnectReason.restartRequired) || 515;
    let asked = false;
    let reconnects = 0;
    let lastIqError = null;

    // The library only sets creds.registered for pairing CODES. After a QR scan the login is complete once creds.me is set.
    const isLinked = () => (method === 'qr' ? !!(state.creds.me && state.creds.me.id) : !!state.creds.registered);

    // the login is ready: save it, hand it over, message the person, close
    const complete = async (s) => {
      if (completing || finished) return;
      completing = true;
      clearTimeout(fallback);
      try {
        await nap(2500); // let the login be written to disk
        const creds = JSON.parse(fs.readFileSync(path.join(workDir, 'creds.json'), 'utf8'));
        if (!(creds.me && creds.me.id)) throw new Error('no account in the login');
        creds.registered = true; // so the bot recognises it as linked
        log('linked as', String(creds.me.id).split(':')[0].slice(0, 4) + '…');
        const text = await hooks.onLinked(creds);
        if (text && s) {
          const sent = await sendDm(s, creds, text, lib, nap);
          if (hooks.onDm) hooks.onDm(sent);
        } else if (hooks.onDm) hooks.onDm(false);
        finish(null);
      } catch (err) {
        log('could not finish:', err.message);
        completing = false;
        finish(hooks.onFail, 'Linked, but the login could not be saved. Please try again.');
      }
    };

    const connect = () => {
      if (finished) return;
      const s = lib.makeWASocket({
        auth: state,
        browser: lib.Browsers.ubuntu('Chrome'), // the identity WhatsApp accepted for pairing codes
        ...version,
        logger: opts.logger || require('pino')({ level: 'silent' }),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });
      sock = s;
      const linking = pairfix.install(s);
      linking.onRefresh((qr) => {
        log('WhatsApp asked for a refreshed QR');
        if (method === 'qr' && hooks.onQr) hooks.onQr(qr); // scan the new one
      });
      s.ev.on('creds.update', () => Promise.resolve(saveCreds()).catch(() => {}));

      if (s.ws && typeof s.ws.on === 'function') {
        s.ws.on('CB:iq,type:error', (node) => {
          const e = Array.isArray(node && node.content) ? node.content.find((c) => c && c.tag === 'error') : null;
          lastIqError = { at: Date.now(), code: e && e.attrs && e.attrs.code, text: e && e.attrs && e.attrs.text };
        });
      }

      s.ev.on('connection.update', async (u) => {
        if (finished || completing || s !== sock) return;
        if (u.connection) log('connection', u.connection);

        // QR mode: show every QR WhatsApp makes
        if (u.qr && method === 'qr' && !isLinked()) {
          asked = true;
          if (hooks.onQr) hooks.onQr(linking.fixQr(u.qr));
        }

        // code mode: the first QR event means the connection is ready, so ask for the pairing code (the QR is ignored)
        if (u.qr && method === 'code' && !asked && !isLinked()) {
          asked = true;
          const t0 = Date.now();
          try {
            const raw = await s.requestPairingCode(number);
            await nap(2500); // WhatsApp's refusal, if any, arrives a moment later
            if (finished) return;
            if (lastIqError && lastIqError.at >= t0 - 500) {
              log('code refused', lastIqError.code, lastIqError.text);
              return finish(hooks.onFail, `WhatsApp refused the pairing code (${lastIqError.code || '?'} ${lastIqError.text || ''}). Check the number and try again.`);
            }
            log('code shown');
            hooks.onCode(String(raw).match(/.{1,4}/g).join('-'));
          } catch (err) {
            log('no code:', err.message);
            return finish(hooks.onFail, `Could not get a pairing code: ${err.message}`);
          }
        }

        if (u.isNewLogin) {
          log('the phone accepted the link');
          if (hooks.onPairing) hooks.onPairing();
          // normally WhatsApp restarts the connection and we finish when it opens. If that never happens, finish anyway.
          clearTimeout(fallback);
          fallback = setTimeout(() => complete(sock && sock.user ? sock : null), 25000);
        }

        if (u.connection === 'open' && isLinked()) return void complete(s);

        if (u.connection === 'close') {
          const status = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
          log('closed, status', status);
          // after the phone accepts, WhatsApp asks for one reconnect (515): that finishes the link
          if ((isLinked() || status === restartCode || !asked) && reconnects < 4) {
            reconnects++;
            return void setTimeout(connect, 600);
          }
          return finish(hooks.onFail, status === 401 ? 'WhatsApp refused the link. Try again.' : 'The code or QR expired, or the connection closed. Try again.');
        }
      });
    };
    connect();
  })().catch((err) => finish(hooks.onFail, `Could not start: ${err.message}`));

  return { cancel: () => finish(null) };
}

module.exports = { start, sendDm };
