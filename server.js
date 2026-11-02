// TurboFex pairing site. Visitors type their number, get a pairing code, enter it on their phone, and receive a short
// session ID. The ID is later given to the bot (SESSION_ID), which downloads the login from here.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { makeStore, normalizeId, DEFAULT_TTL_MS } = require('./store');
const qrImage = require('./qr');

const PUBLIC = path.join(__dirname, 'public');
const VERSION = require('./package.json').version;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.m4a': 'audio/mp4' };
const JOB_TTL = 10 * 60 * 1000; // a finished or failed job stays readable this long
const JOB_MAX = 4 * 60 * 1000; // a pairing attempt lasts at most 4 minutes

// The WhatsApp messages the person receives (see dmMessages for the order).
const LINKS = { whatsapp: 'https://whatsapp.com/channel/0029VbDpuKM8qIzkoQscOE2w', telegram: 'https://t.me/+7PwU2Vo9czE1NTRk' };
const dmText = () =>
  `✅ *TurboFex linked!*\n\nYour session ID is in the next message. Press and hold it, then tap *Copy*.\n\nAdd it to your bot as *SESSION_ID*, then start the bot.\nIt works once and expires in 5 minutes. Don't share it with anyone.`;
// crisp heading letters (bold sans-serif) that look sharp in WhatsApp
const bold = (s) => String(s).replace(/[A-Za-z]/g, (c) => String.fromCodePoint((c <= 'Z' ? 0x1d5d4 + c.charCodeAt(0) - 65 : 0x1d5ee + c.charCodeAt(0) - 97)));
const communityText = () =>
  `${bold('Join the TurboFex community')} 🚀\n\n📣 ${bold('WhatsApp Channel')}\n${LINKS.whatsapp}\n\n✈️ ${bold('Telegram')}\n${LINKS.telegram}`;
// Order: the community links first (one message, both links, the WhatsApp Channel's own link card), then the note, and the
// session ID LAST and alone (so it is the newest message and one long-press copies only it).
const dmMessages = (id) => [{ text: communityText(), previewOf: LINKS.whatsapp }, dmText(), id];

function createApp(opts = {}) {
  const env = opts.env || process.env;
  const dataDir = opts.dataDir || path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  let secret = env.SITE_SECRET;
  if (!secret) {
    const f = path.join(dataDir, 'secret.key');
    if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    secret = fs.readFileSync(f, 'utf8').trim();
  }
  const store = makeStore({
    dir: path.join(dataDir, 'sessions'),
    secret,
    ttlMs: (Number(env.SESSION_TTL_SECONDS) > 0 ? Number(env.SESSION_TTL_SECONDS) * 1000 : DEFAULT_TTL_MS), // 5 minutes unless changed
    oneTime: true, // an ID can only be used once
  });
  try { store.sweep(); } catch (err) { /* clear anything that expired while the site was off */ }
  const engine = opts.engine || require('./engine');
  const trustProxy = String(env.TRUST_PROXY || '') === '1';
  const pairLimit = Number(env.PAIR_LIMIT) || 10;   // a few "Try again" taps must still work
  const maxJobs = Number(env.MAX_JOBS) || 15;

  const jobs = new Map(); // id -> job
  const hits = new Map(); // "kind:ip" -> [timestamps]

  // allows `max` hits per `windowMs` for one visitor
  const limited = (kind, ip, max, windowMs) => {
    const key = `${kind}:${ip}`;
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return true;
    }
    list.push(now);
    hits.set(key, list);
    return false;
  };

  const ipOf = (req) => (trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';

  const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
    });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  // the music file: iPhones only play audio from a server that answers byte-range requests (206)
  const sendAudio = (req, res, buf) => {
    const head = { 'Content-Type': 'audio/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    if (!m || (m[1] === '' && m[2] === '')) { res.writeHead(200, { ...head, 'Content-Length': buf.length }); return res.end(buf); }
    let start = m[1] === '' ? Math.max(0, buf.length - Number(m[2])) : Number(m[1]);
    let end = m[1] === '' || m[2] === '' ? buf.length - 1 : Math.min(Number(m[2]), buf.length - 1);
    if (start > end || start >= buf.length) { res.writeHead(416, { ...head, 'Content-Range': `bytes */${buf.length}` }); return res.end(); }
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': end - start + 1 });
    return res.end(buf.subarray(start, end + 1));
  };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 2048) {
          reject(new Error('too big'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });

  const phone = require('./phone');
  const numberLimit = Number(env.NUMBER_LIMIT) || 5;   // pairing attempts per phone number per 15 minutes
  const hashSecret = crypto.randomBytes(8).toString('hex');

  function startJob(number, method) {
    const id = crypto.randomBytes(16).toString('hex');
    const job = { id, number, method, dm: null, state: 'starting', code: null, qr: null, qrSvg: null, sessionId: null, error: null, createdAt: Date.now(), doneAt: 0, handle: null };
    const done = () => {
      job.doneAt = Date.now();
      clearTimeout(job.timer);
    };
    job.handle = engine.start(number, {
      onCode: (code) => {
        if (job.state === 'starting') {
          job.state = 'code';
          job.code = code;
        }
      },
      onQr: (text) => {
        if (job.state === 'starting' || job.state === 'qr') {
          job.state = 'qr';
          job.qr = text; // the picture is made when the page asks (see /api/job)
        }
      },
      onPairing: () => {
        if (job.state === 'code' || job.state === 'qr') {
          job.state = 'linking';
          job.qr = null;
          job.qrSvg = null;
        }
      },
      onLinked: (creds) => {
        try {
          job.idMadeAt = Date.now();
          job.sessionId = store.put(creds, job.idMadeAt);
          job.idExp = job.idMadeAt + store.ttlMs;
          job.state = 'linked';
          job.code = null;
          job.qr = null;
        } catch (err) {
          job.state = 'failed';
          job.error = 'Linked, but the session could not be saved. Please try again.';
          done();
          throw err;
        }
        done();
        return dmMessages(job.sessionId); // the engine sends these to the person on WhatsApp
      },
      onDm: (sent) => {
        job.dm = !!sent;
      },
      onFail: (message) => {
        if (job.state === 'linked') return; // already delivered: a later close is not a failure
        job.state = 'failed';
        job.error = message;
        job.code = null;
        done();
      },
    }, { method, verify: String(env.VERIFY_WHATSAPP || '') === '1' });
    job.timer = setTimeout(() => {
      if (job.state === 'linked' || job.state === 'failed') return;
      stopJob(job, 'Time ran out. Start again.' + (job.method === 'code' ? ' Enter the code quickly.' : ''));
    }, JOB_MAX);
    jobs.set(id, job);
    return job;
  }

  const active = () => [...jobs.values()].filter((j) => !j.doneAt);

  function stopJob(job, message) {
    try {
      job.handle.cancel();
    } catch (err) {
      // already stopped
    }
    clearTimeout(job.timer);
    job.state = 'failed';
    job.error = message;
    job.code = null;
    job.qr = null;
    job.doneAt = Date.now();
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const ip = ipOf(req);

    if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true, version: VERSION, sessionMinutes: Math.round(store.ttlMs / 600) / 100 });

    // 1) start a pairing
    if (req.method === 'POST' && p === '/api/pair') {
      if (limited('pair', ip, pairLimit, 15 * 60 * 1000)) return send(res, 429, { error: 'Too many tries. Please wait a few minutes.' });
      let body;
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch (err) {
        return send(res, 400, { error: 'Bad request.' });
      }
      const method = body.method === 'qr' ? 'qr' : 'code';
      let number = '';
      if (method === 'code') {
        const v = phone.check(body.number, body.country, env);
        if (!v.ok) return send(res, 400, { error: v.error, state: v.state });
        number = v.e164;
        // abuse guard: one number can only be tried so often (counted by a one-way hash, the number itself is never kept)
        if (limited('num', phone.hashOf(number, hashSecret), numberLimit, 15 * 60 * 1000)) return send(res, 429, { error: 'Too many attempts for this number. Please wait a few minutes before trying again.' });
        // the same number asking again means the person started over: stop the old attempt instead of blocking them
        for (const j of active()) if (j.number === number) stopJob(j, 'Replaced by a new attempt.');
      }
      if (active().length >= maxJobs) return send(res, 503, { error: 'The site is busy. Try again in a minute.' });
      const job = startJob(number, method);
      return send(res, 200, { job: job.id });
    }

    // 1b) "Try again" / "Start over": the page stops the attempt it no longer needs (the job id is random and only the page that started it knows it)
    if (req.method === 'POST' && p.startsWith('/api/cancel/')) {
      if (limited('cancel', ip, 30, 15 * 60 * 1000)) return send(res, 429, { error: 'Too many tries.' });
      const job = jobs.get(p.slice('/api/cancel/'.length));
      if (job && !job.doneAt) stopJob(job, 'Replaced by a new attempt.');
      return send(res, 200, { ok: true });
    }

    // 2) the page asks how it is going
    if (req.method === 'GET' && p.startsWith('/api/job/')) {
      const job = jobs.get(p.slice('/api/job/'.length));
      if (!job) return send(res, 404, { error: 'Not found. Start again.' });
      let qr = null;
      if (job.state === 'qr' && job.qr) {
        if (!job.qrSvg || job.qrSvg.text !== job.qr) job.qrSvg = { text: job.qr, url: qrImage.toDataUrl(job.qr) };
        qr = job.qrSvg.url;
      }
      // a finished ID is only shown while it is still valid (the server decides, not the page)
      const idLeft = job.idExp ? Math.max(0, Math.ceil((job.idExp - Date.now()) / 1000)) : 0;
      const used = !!job.usedAt; // the bot has already logged in with this ID
      const idExpired = job.state === 'linked' && idLeft === 0 && !used;
      if (idExpired || used) job.sessionId = null;
      return send(res, 200, { state: job.state, method: job.method, dm: job.dm, qr, code: job.code, sessionId: job.sessionId, idSecondsLeft: idLeft, expired: idExpired, used, error: job.error, secondsLeft: Math.max(0, Math.round((job.createdAt + JOB_MAX - Date.now()) / 1000)) });
    }

    // 3) the bot downloads its login with the session ID
    if (req.method === 'GET' && p.startsWith('/api/session/')) {
      if (limited('fetch', ip, 20, 60 * 1000)) return send(res, 429, { error: 'Too many tries.' });
      const id = decodeURIComponent(p.slice('/api/session/'.length));
      if (!normalizeId(id)) return send(res, 400, { error: 'That is not a session ID.' });
      const creds = store.take(id); // checks the expiry itself and marks the ID as used
      if (!creds) return send(res, 404, { error: 'Session ID not found, expired, or already used.' });
      // tell the page that waits for it: this ID has now been used by the bot
      const canon = normalizeId(id);
      for (const j of jobs.values()) if (j.sessionId && normalizeId(j.sessionId) === canon) { j.usedAt = Date.now(); j.sessionId = null; }
      return send(res, 200, creds);
    }

    // static page
    if (req.method === 'GET') {
      const PAGES = { '/about': 'about.html', '/terms': 'terms.html' }; // clean addresses for the two text pages
      const name = p === '/' ? 'index.html' : PAGES[p] || p.slice(1);
      if (/^[a-z0-9._-]+$/i.test(name) && TYPES[path.extname(name)]) {
        try {
          const buf = fs.readFileSync(path.join(PUBLIC, name));
          if (path.extname(name) === '.m4a') return sendAudio(req, res, buf);
          return send(res, 200, buf, TYPES[path.extname(name)]);
        } catch (err) {
          // fall through
        }
      }
    }
    return send(res, 404, { error: 'Not found.' });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { error: 'Something went wrong.' });
    });
  });

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [id, j] of jobs) if (j.doneAt && now - j.doneAt > JOB_TTL) jobs.delete(id);
    for (const [k, list] of hits) if (!list.some((t) => now - t < 15 * 60 * 1000)) hits.delete(k);
    try {
      store.sweep();
    } catch (err) {
      // not important
    }
  }, 30 * 1000);
  sweeper.unref();

  return { server, store, jobs, close: () => { clearInterval(sweeper); for (const j of jobs.values()) { clearTimeout(j.timer); try { j.handle.cancel(); } catch (e) {} } server.close(); } };
}

module.exports = { createApp, dmText, dmMessages, bold };

if (require.main === module) {
  process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
  process.on('uncaughtException', (e) => console.error('Crash prevented:', e));
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  app.server.listen(port, () => console.log(`TurboFex pairing site running on port ${port}`));
}
