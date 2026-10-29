// TurboFex pairing site. Visitors type their number, get a pairing code, enter it on their phone, and receive a short
// session ID. The ID is later given to the bot (SESSION_ID), which downloads the login from here.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { makeStore, normalizeId } = require('./store');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const JOB_TTL = 10 * 60 * 1000; // a finished or failed job stays readable this long
const JOB_MAX = 4 * 60 * 1000; // a pairing attempt lasts at most 4 minutes

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
    ttlMs: (Number(env.SESSION_TTL_HOURS) || 24) * 3600 * 1000,
    oneTime: String(env.ONE_TIME || '1') !== '0',
  });
  const engine = opts.engine || require('./engine');
  const trustProxy = String(env.TRUST_PROXY || '') === '1';
  const pairLimit = Number(env.PAIR_LIMIT) || 4;
  const maxJobs = Number(env.MAX_JOBS) || 15;

  const jobs = new Map(); // id -> job
  const hits = new Map(); // "kind:ip" -> [timestamps]

  // allows max hits per windowMs for one visitor
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

  function startJob(number) {
    const id = crypto.randomBytes(16).toString('hex');
    const job = { id, number, state: 'starting', code: null, sessionId: null, error: null, createdAt: Date.now(), doneAt: 0, handle: null };
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
      onPairing: () => {
        if (job.state === 'code') job.state = 'linking';
      },
      onLinked: (creds) => {
        try {
          job.sessionId = store.put(creds);
          job.state = 'linked';
          job.code = null;
        } catch (err) {
          job.state = 'failed';
          job.error = 'Linked, but the session could not be saved. Please try again.';
        }
        done();
      },
      onFail: (message) => {
        job.state = 'failed';
        job.error = message;
        job.code = null;
        done();
      },
    });
    job.timer = setTimeout(() => {
      if (job.state === 'linked' || job.state === 'failed') return;
      try {
        job.handle.cancel();
      } catch (err) {
        // already stopped
      }
      job.state = 'failed';
      job.error = 'Time ran out. Start again and enter the code quickly.';
      job.code = null;
      done();
    }, JOB_MAX);
    jobs.set(id, job);
    return job;
  }

  const active = () => [...jobs.values()].filter((j) => !j.doneAt);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const ip = ipOf(req);

    if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true });

    // 1) start a pairing
    if (req.method === 'POST' && p === '/api/pair') {
      if (limited('pair', ip, pairLimit, 15 * 60 * 1000)) return send(res, 429, { error: 'Too many tries. Please wait a few minutes.' });
      let body;
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch (err) {
        return send(res, 400, { error: 'Bad request.' });
      }
      const number = cleanNumber(body.number);
      if (number.length < 8 || number.length > 15) return send(res, 400, { error: 'Enter the full number with the country code, digits only.' });
      if (String(body.number).trim().startsWith('0')) return send(res, 400, { error: 'Start with the country code (for example 234…), not 0.' });
      if (active().some((j) => j.number === number)) return send(res, 409, { error: 'This number is already linking. Wait a minute and try again.' });
      if (active().length >= maxJobs) return send(res, 503, { error: 'The site is busy. Try again in a minute.' });
      const job = startJob(number);
      return send(res, 200, { job: job.id });
    }

    // 2) the page asks how it is going
    if (req.method === 'GET' && p.startsWith('/api/job/')) {
      const job = jobs.get(p.slice('/api/job/'.length));
      if (!job) return send(res, 404, { error: 'Not found. Start again.' });
      return send(res, 200, { state: job.state, code: job.code, sessionId: job.sessionId, error: job.error, secondsLeft: Math.max(0, Math.round((job.createdAt + JOB_MAX - Date.now()) / 1000)) });
    }

    // 3) the bot downloads its login with the session ID
    if (req.method === 'GET' && p.startsWith('/api/session/')) {
      if (limited('fetch', ip, 20, 60 * 1000)) return send(res, 429, { error: 'Too many tries.' });
      const id = decodeURIComponent(p.slice('/api/session/'.length));
      if (!normalizeId(id)) return send(res, 400, { error: 'That is not a session ID.' });
      const creds = store.take(id);
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
  }, 60 * 1000);
  sweeper.unref();

  return { server, store, jobs, close: () => { clearInterval(sweeper); for (const j of jobs.values()) try { j.handle.cancel(); } catch (e) {} server.close(); } };
}

module.exports = { createApp };

if (require.main === module) {
  process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
  process.on('uncaughtException', (e) => console.error('Crash prevented:', e));
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  app.server.listen(port, () => console.log(`TurboFex pairing site running on port ${port}`));
}
