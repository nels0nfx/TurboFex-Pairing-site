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
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const JOB_TTL = 10 * 60 * 1000; // a finished or failed job stays readable this long
const JOB_MAX = 4 * 60 * 1000; // a pairing attempt lasts at most 4 minutes

// The WhatsApp messages the person receives: a short note, then the session ID ALONE (so one press-and-hold copies just the ID),
// then our community links, each with its own small link card.
const LINKS = { whatsapp: 'https://whatsapp.com/channel/0029VbDpuKM8qIzkoQscOE2w', telegram: 'https://t.me/+7PwU2Vo9czE1NTRk' };
const dmText = () =>
  `✅ *TurboFex linked!*\n\nYour session ID is in the next message. Press and hold it, then tap *Copy*.\n\nAdd it to your bot as *SESSION_ID*, then start the bot.\nIt works once and expires in 5 minutes. Don't share it with anyone.`;
const dmMessages = (id) => [
  dmText(),
  id,
  { text: `📣 *Join the TurboFex WhatsApp Channel*\n${LINKS.whatsapp}`, linkPreview: { 'canonical-url': LINKS.whatsapp, 'matched-text': LINKS.whatsapp, title: 'TurboFex on WhatsApp', description: 'News, updates and tips from TurboFex.' } },
  { text: `✈️ *Join us on Telegram*\n${LINKS.telegram}`, linkPreview: { 'canonical-url': LINKS.telegram, 'matched-text': LINKS.telegram, title: 'TurboFex on Telegram', description: 'Community and support for TurboFex.' } },
];

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
  const pairLimit = Number(env.PAIR_LIMIT) || 4;
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

  const cleanNumber = (raw) => String(raw || '').replace(/\D/g, '');

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
    }, { method });
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
        number = cleanNumber(body.number);
        if (number.length < 8 || number.length > 15) return send(res, 400, { error: 'Enter the full number with the country code, digits only.' });
        if (String(body.number).trim().startsWith('0')) return send(res, 400, { error: 'Start with the country code (for example 234…), not 0.' });
        // the same number asking again means the person started over: stop the old attempt instead of blocking them
        for (const j of active()) if (j.number === number) stopJob(j, 'Replaced by a new attempt.');
      }
      if (active().length >= maxJobs) return send(res, 503, { error: 'The site is busy. Try again in a minute.' });
      const job = startJob(number, method);
      return send(res, 200, { job: job.id });
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
      const idExpired = job.state === 'linked' && idLeft === 0;
      if (idExpired) job.sessionId = null;
      return send(res, 200, { state: job.state, method: job.method, dm: job.dm, qr, code: job.code, sessionId: job.sessionId, idSecondsLeft: idLeft, expired: idExpired, error: job.error, secondsLeft: Math.max(0, Math.round((job.createdAt + JOB_MAX - Date.now()) / 1000)) });
    }

    // 3) the bot downloads its login with the session ID
    if (req.method === 'GET' && p.startsWith('/api/session/')) {
      if (limited('fetch', ip, 20, 60 * 1000)) return send(res, 429, { error: 'Too many tries.' });
      const id = decodeURIComponent(p.slice('/api/session/'.length));
      if (!normalizeId(id)) return send(res, 400, { error: 'That is not a session ID.' });
      const creds = store.take(id); // checks the expiry itself and marks the ID as used
      if (!creds) return send(res, 404, { error: 'Session ID not found, expired, or already used.' });
      return send(res, 200, creds);
    }

    // static page
    if (req.method === 'GET') {
      const name = p === '/' ? 'index.html' : p.slice(1);
      if (/^[a-z0-9._-]+$/i.test(name) && TYPES[path.extname(name)]) {
        try {
          return send(res, 200, fs.readFileSync(path.join(PUBLIC, name)), TYPES[path.extname(name)]);
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

  return { server, store, jobs, close: () => { clearInterval(sweeper); for (const j of jobs.values()) try { j.handle.cancel(); } catch (e) {} server.close(); } };
}

module.exports = { createApp, dmText, dmMessages };

if (require.main === module) {
  process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
  process.on('uncaughtException', (e) => console.error('Crash prevented:', e));
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  app.server.listen(port, () => console.log(`TurboFex pairing site running on port ${port}`));
}
