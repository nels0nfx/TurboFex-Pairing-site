'use strict';
// TurboFex admin dashboard - the BACKEND. Every rule here is enforced on the server; the page (public/admin.html) only shows what the server allows.
//
// Sign-in: username + password (scrypt) and then a 6-digit code from an authenticator app (TOTP, RFC 6238). Accounts come from the ADMIN_ACCOUNTS
// setting (see tools/admin-setup.js); with no account configured the whole dashboard answers 404 and does not exist.
// A signed-in browser gets a random session cookie (HttpOnly, SameSite=Strict, Secure on https) that lives on the server only, plus a
// CSRF token that every change must send back. Roles: viewer (read), moderator (read + revoke / block / announce), owner (everything).
// Nothing here can show a session ID, a login (creds) or a full phone number: those are not kept in readable form anywhere.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { monitorEventLoopDelay } = require('perf_hooks');
const phone = require('./phone');

const PERMS = {
  viewer: ['view'],
  moderator: ['view', 'sessions.revoke', 'blocks.manage', 'announce.manage'],
  owner: ['view', 'sessions.revoke', 'blocks.manage', 'announce.manage', 'settings.manage', 'audit.view', 'plugins.review'],
};
const SESSION_IDLE_MS = 20 * 60 * 1000;
const SESSION_MAX_MS = 8 * 3600 * 1000;
const WINDOW = 15 * 60 * 1000;
const COOKIE = 'tfx_admin';

// ---------- passwords and 2FA (no outside library) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(s) {
  let bits = '';
  for (const c of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function b32encode(buf) {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
const newTotpSecret = () => b32encode(crypto.randomBytes(20));
function totpAt(secret, counter) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = h[19] & 15;
  return String(((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1000000).padStart(6, '0');
}
const totpCode = (secret, now = Date.now()) => totpAt(secret, Math.floor(now / 30000));
// returns the matching time step (within one step either side), or -1
function totpVerify(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code))) return -1;
  const c = Math.floor(now / 30000);
  for (const d of [0, -1, 1]) {
    const want = Buffer.from(totpAt(secret, c + d)), got = Buffer.from(String(code));
    if (crypto.timingSafeEqual(want, got)) return c + d;
  }
  return -1;
}
const SCRYPT = { N: 16384, r: 8, p: 1 };
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(password), salt, 32, { ...SCRYPT, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${h.toString('base64')}`;
}
function checkPassword(password, stored) {
  const p = String(stored || '').split('$');
  if (p.length !== 6 || p[0] !== 'scrypt') return false;
  const [N, r, pp] = [Number(p[1]), Number(p[2]), Number(p[3])];
  if (!(N >= 1024 && N <= 1 << 20 && r >= 1 && r <= 16 && pp >= 1 && pp <= 4)) return false;
  try {
    const want = Buffer.from(p[5], 'base64');
    const got = crypto.scryptSync(String(password), Buffer.from(p[4], 'base64'), want.length, { N, r, p: pp, maxmem: 256 * 1024 * 1024 });
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  } catch (err) { return false; }
}
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex')); // so an unknown user costs the same time as a wrong password

function parseAccounts(raw) {
  let list = [];
  try { list = JSON.parse(raw || '[]'); } catch (err) { return []; }
  if (!Array.isArray(list)) return [];
  return list.filter((a) => a && /^[a-z0-9._-]{3,32}$/.test(String(a.user)) && PERMS[a.role] && /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(String(a.hash)) && /^[A-Z2-7]{16,}$/.test(String(a.totp)))
    .map((a) => ({ user: a.user, role: a.role, hash: a.hash, totp: a.totp, lastStep: -1 }));
}

// ---------- the dashboard ----------
function createAdmin({ env = process.env, dataDir, secret, store, events, jobs, stopJob, version, defaults, cloud = null, devcentre = null, now = () => Date.now() }) {
  const accounts = parseAccounts(env.ADMIN_ACCOUNTS);
  const enabled = accounts.length > 0;
  const trustProxy = String(env.TRUST_PROXY || '') === '1';
  const PUBLIC = path.join(__dirname, 'public');

  const hmac = (kind, value) => crypto.createHmac('sha256', secret).update(kind + ':' + value).digest('hex');
  // short one-way fingerprints used everywhere instead of internet addresses and phone numbers
  const idOf = (kind, value) => hmac('id:' + kind, value).slice(0, 12);
  const maskIp = (ip) => {
    const s = String(ip || '');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.split('.').slice(0, 2).join('.') + '.x.x';
    if (s.includes(':')) return s.replace(/^::ffff:/, '').split(':').slice(0, 2).join(':') + '::x';
    return 'unknown';
  };
  const maskNum = (e164) => { const s = String(e164 || ''); return s.length > 6 ? '+' + s.slice(0, 3) + '•••' + s.slice(-2) : '+•••'; };

  // ----- saved state: blocks, settings, announcements (one small file) -----
  const stateFile = path.join(dataDir, 'admin-state.json');
  let state = { maintenance: { on: false, message: '' }, limits: {}, blocks: [], announcements: [], trust: {} };
  try { const s = JSON.parse(fs.readFileSync(stateFile, 'utf8')); state = { ...state, ...s }; } catch (err) { /* first start */ }
  function save() {
    try { fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state), { mode: 0o600 }); fs.renameSync(stateFile + '.tmp', stateFile); } catch (err) { /* best effort */ }
    if (cloud) cloud.pushState(state);
  }
  const LIMITS = { pair: { min: 1, max: 200 }, number: { min: 1, max: 100 }, maxJobs: { min: 1, max: 100 } };
  const limits = () => ({ pair: state.limits.pair || defaults.pair, number: state.limits.number || defaults.number, maxJobs: state.limits.maxJobs || defaults.maxJobs });
  const maintenance = () => (state.maintenance.on ? { on: true, message: state.maintenance.message || 'TurboFex Pair is paused for maintenance. Please come back soon.' } : { on: false, message: '' });
  const liveBlock = (b) => !b.until || b.until > now();
  const blocked = ({ client, num }) => state.blocks.find((b) => liveBlock(b) && ((b.kind === 'client' && b.id === client) || (b.kind === 'number' && b.id === num))) || null;
  const publicStatus = () => {
    const a = state.announcements.filter((x) => x.active && (!x.endsAt || x.endsAt > now())).sort((p, q) => q.createdAt - p.createdAt)[0];
    return { maintenance: maintenance(), announcement: a ? { id: a.id, level: a.level, text: a.text } : null };
  };

  // ----- audit log: every admin action, each line chained to the one before (editing or deleting a line breaks the chain) -----
  const auditFile = path.join(dataDir, 'admin-audit.jsonl');
  let auditLast = '0'.repeat(64);
  const chainOf = (prev, body) => crypto.createHash('sha256').update(prev + JSON.stringify(body)).digest('hex');
  try { const lines = fs.readFileSync(auditFile, 'utf8').split('\n').filter(Boolean); if (lines.length) auditLast = JSON.parse(lines[lines.length - 1]).h; } catch (err) { /* none yet */ }
  function audit(actor, role, action, target, detail, client) {
    const body = { t: now(), actor, role, action, target: target || '', detail: detail || '', client: client || '' };
    const h = chainOf(auditLast, body);
    try { fs.appendFileSync(auditFile, JSON.stringify({ ...body, h }) + '\n', { mode: 0o600 }); } catch (err) { /* best effort */ }
    auditLast = h;
    if (cloud) cloud.pushAudit({ ...body, h });
    return body;
  }
  // the hash is over the fields in this fixed order, so a database that reorders JSON keys (Postgres jsonb does) cannot break the chain
  const canon = (e) => ({ t: e.t, actor: e.actor, role: e.role, action: e.action, target: e.target, detail: e.detail, client: e.client });
  function auditRead(limit) {
    let lines = [];
    try { lines = fs.readFileSync(auditFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (err) { /* none */ }
    let prev = '0'.repeat(64), ok = true;
    for (const e of lines) { const { h } = e; const body = canon(e); if (chainOf(prev, body) !== h) { ok = false; break; } prev = h; }
    return { entries: lines.slice(-limit).reverse().map(({ h, ...b }) => b), total: lines.length, chainOk: ok };
  }

  // ----- sign-in state (memory only: a restart signs everyone out) -----
  const sessions = new Map(); // sid -> {user, role, csrf, created, last, client}
  const tickets = new Map();  // ticket -> {user, exp, tries, client}
  const fails = new Map();    // "ip:x" / "user:y" -> [timestamps]
  const failList = (k) => { const l = (fails.get(k) || []).filter((t) => now() - t < WINDOW); fails.set(k, l); return l; };
  const noteFail = (ipId, user) => { failList('ip:' + ipId).push(now()); if (user) failList('user:' + user).push(now()); };
  const locked = (ipId, user) => failList('ip:' + ipId).length >= 8 || (user && failList('user:' + user).length >= 5);
  const sweeper = setInterval(() => {
    for (const [k, s] of sessions) if (now() - s.last > SESSION_IDLE_MS || now() - s.created > SESSION_MAX_MS) sessions.delete(k);
    for (const [k, t] of tickets) if (t.exp < now()) tickets.delete(k);
    for (const k of fails.keys()) if (!failList(k).length) fails.delete(k);
  }, 60 * 1000);
  sweeper.unref();

  // ----- server health sampler (real numbers from the running process) -----
  const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();
  const samples = [];
  let lastCpu = process.cpuUsage(), lastT = process.hrtime.bigint(), lastSys = os.cpus();
  const readNum = (f) => { try { const v = fs.readFileSync(f, 'utf8').trim(); return /^\d+$/.test(v) ? Number(v) : null; } catch (err) { return null; } };
  function sample() {
    const t = process.hrtime.bigint(), c = process.cpuUsage(), sys = os.cpus();
    const wallUs = Number(t - lastT) / 1000 || 1;
    const proc = ((c.user - lastCpu.user + c.system - lastCpu.system) / wallUs) * 100; // % of ONE core
    let idle = 0, total = 0;
    sys.forEach((cpu, i) => { const p = lastSys[i] || cpu; for (const k of Object.keys(cpu.times)) { const d = cpu.times[k] - (p.times[k] || 0); total += d; if (k === 'idle') idle += d; } });
    lastCpu = c; lastT = t; lastSys = sys;
    const m = process.memoryUsage();
    const s = { t: now(), proc: Math.max(0, Math.round(proc * 10) / 10), sys: total ? Math.round((1 - idle / total) * 1000) / 10 : 0, rss: m.rss, heap: m.heapUsed, lag: Math.round(loop.mean / 1e5) / 10 };
    loop.reset();
    samples.push(s); if (samples.length > 120) samples.shift();
  }
  const sampler = setInterval(sample, 5000); sampler.unref();
  function dirSize(d) { let n = 0; try { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); n += f.isDirectory() ? dirSize(p) : fs.statSync(p).size; } } catch (err) { /* gone */ } return n; }
  function healthNow() {
    if (!samples.length) sample();
    const m = process.memoryUsage(); const heapLimit = require('v8').getHeapStatistics().heap_size_limit;
    const cg = { limit: readNum('/sys/fs/cgroup/memory.max') || readNum('/sys/fs/cgroup/memory/memory.limit_in_bytes'), used: readNum('/sys/fs/cgroup/memory.current') || readNum('/sys/fs/cgroup/memory/memory.usage_in_bytes') };
    const containerLimit = cg.limit && cg.limit < os.totalmem() * 2 ? cg.limit : null;
    let disk = null;
    try { const s = fs.statfsSync(dataDir); disk = { total: Number(s.blocks) * Number(s.bsize), free: Number(s.bavail) * Number(s.bsize) }; } catch (err) { /* not available here */ }
    const last = samples[samples.length - 1];
    return {
      version, node: process.version, platform: process.platform + ' ' + os.arch(), cores: os.cpus().length,
      uptimeSec: Math.round(process.uptime()), startedAt: now() - Math.round(process.uptime()) * 1000,
      cpu: { process: last.proc, system: last.sys, load: os.loadavg().map((x) => Math.round(x * 100) / 100) },
      memory: { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, heapLimit, systemTotal: os.totalmem(), systemFree: os.freemem(), containerLimit, containerUsed: containerLimit ? cg.used : null },
      storage: { data: dirSize(dataDir), disk, cloud: cloud ? cloud.status() : { enabled: false } },
      eventLoopLagMs: last.lag,
      series: samples.map((s) => ({ t: s.t, cpu: s.proc, rss: s.rss, lag: s.lag })),
      pairing: { activeJobs: jobs().filter((j) => !j.doneAt).length, liveSessionIds: store.list().length },
    };
  }

  // ----- statistics and alerts, all computed from the real activity log -----
  const DAY = 24 * 3600 * 1000, HOUR = 3600 * 1000;
  function overview() {
    const ev = events.since(DAY), t0 = now();
    const c = (type) => ev.filter((e) => e.type === type).length;
    const starts = ev.filter((e) => e.type === 'pair.start');
    const linked = c('pair.linked'), failed = c('pair.failed');
    const buckets = Array.from({ length: 24 }, (_, i) => ({ t: t0 - (23 - i) * HOUR, attempts: 0, linked: 0, failed: 0 }));
    for (const e of ev) {
      const i = 23 - Math.floor((t0 - e.t) / HOUR); if (i < 0 || i > 23) continue;
      if (e.type === 'pair.start') buckets[i].attempts++; else if (e.type === 'pair.linked') buckets[i].linked++; else if (e.type === 'pair.failed') buckets[i].failed++;
    }
    const count = (arr, key) => { const m = {}; for (const e of arr) if (e[key]) m[e[key]] = (m[e[key]] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const act = jobs().filter((j) => !j.doneAt);
    return {
      since: events.first(), windowHours: 24,
      totals: { visits: c('site.visit'), visitors: new Set(ev.filter((e) => e.client && (e.type === 'site.visit' || e.type.startsWith('pair.'))).map((e) => e.client)).size, attempts: starts.length, codes: c('pair.code'), qrs: c('pair.qr'), linked, failed, limited: c('pair.limited'), blocked: c('pair.blocked'), invalid: c('pair.invalid'), sessionFetchOk: ev.filter((e) => e.type === 'session.fetch' && e.ok).length, sessionFetchBad: ev.filter((e) => e.type === 'session.fetch' && !e.ok).length },
      successRate: linked + failed ? Math.round((linked / (linked + failed)) * 1000) / 10 : null,
      methods: { code: starts.filter((e) => e.method === 'code').length, qr: starts.filter((e) => e.method === 'qr').length },
      countries: count(starts, 'country').slice(0, 6).map(([country, n]) => ({ country, n })),
      series: buckets,
      now: { activeAttempts: act.length, liveSessionIds: store.list().length, blocks: state.blocks.filter(liveBlock).length, maintenance: state.maintenance.on, announcements: state.announcements.filter((a) => a.active && (!a.endsAt || a.endsAt > now())).length },
      alerts: alerts().length, uptimeSec: Math.round(process.uptime()), version,
    };
  }
  function alerts() {
    const out = [], ev = events.since(DAY), t = now();
    const inWin = (e, ms) => t - e.t < ms;
    const group = (arr, key) => { const m = new Map(); for (const e of arr) { if (!e[key]) continue; if (!m.has(e[key])) m.set(e[key], []); m.get(e[key]).push(e); } return m; };
    const add = (rule, severity, title, detail, subject, evs) => out.push({ id: idOf('alert', rule + ':' + (subject ? subject.kind + subject.id : '')), rule, severity, title, detail, subject: subject || null, count: evs.length, firstSeen: Math.min(...evs.map((e) => e.t)), lastSeen: Math.max(...evs.map((e) => e.t)) });
    const recent = ev.filter((e) => inWin(e, HOUR));
    for (const [id, evs] of group(recent.filter((e) => e.type === 'pair.limited'), 'client')) if (evs.length >= 3) add('limited', 'high', 'Repeatedly rate limited', `This visitor hit a rate limit ${evs.length} times in the last hour.`, { kind: 'client', id }, evs);
    for (const [id, evs] of group(recent.filter((e) => e.type === 'pair.start' && e.num), 'client')) { const n = new Set(evs.map((e) => e.num)).size; if (n >= 4) add('many-numbers', 'medium', 'Many different numbers from one visitor', `${n} different phone numbers were tried from this visitor in the last hour.`, { kind: 'client', id }, evs); }
    for (const [id, evs] of group(recent.filter((e) => e.type === 'pair.start' && e.num), 'num')) { const n = new Set(evs.map((e) => e.client)).size; if (n >= 3) add('number-spread', 'medium', 'One number tried from many visitors', `This number was tried from ${n} different visitors in the last hour.`, { kind: 'number', id }, evs); }
    for (const [id, evs] of group(recent.filter((e) => e.type === 'pair.failed'), 'client')) { const ok = recent.some((e) => e.type === 'pair.linked' && e.client === id); if (evs.length >= 5 && !ok) add('failing', 'medium', 'Many failed attempts, none linked', `${evs.length} attempts failed and none linked in the last hour.`, { kind: 'client', id }, evs); }
    for (const [id, evs] of group(ev.filter((e) => e.type === 'session.fetch' && !e.ok && inWin(e, WINDOW)), 'client')) if (evs.length >= 8) add('id-guessing', 'high', 'Possible session ID guessing', `${evs.length} wrong or expired session IDs were tried from this visitor in 15 minutes.`, { kind: 'client', id }, evs);
    const bl = recent.filter((e) => e.type === 'pair.blocked'); if (bl.length) add('blocked', 'info', 'Blocked visitors tried again', `${bl.length} blocked attempt${bl.length > 1 ? 's' : ''} in the last hour.`, null, bl);
    const lf = ev.filter((e) => e.type === 'admin.login_failed' && inWin(e, HOUR)); if (lf.length >= 3) add('admin-login', 'high', 'Failed admin sign-ins', `${lf.length} failed admin sign-in attempts in the last hour.`, null, lf);
    const lk = ev.filter((e) => e.type === 'admin.locked' && inWin(e, HOUR)); if (lk.length) add('admin-locked', 'high', 'Admin sign-in was locked', 'Too many wrong attempts locked admin sign-in for a visitor or an account.', null, lk);
    const fl = recent.filter((e) => e.type === 'pair.failed'); if (fl.length >= 10 && fl.length > recent.filter((e) => e.type === 'pair.linked').length * 3) add('fail-spike', 'medium', 'Pairing failures are high', `${fl.length} pairing attempts failed in the last hour. WhatsApp may be refusing or the version is stale.`, null, fl);
    const rank = { high: 0, medium: 1, info: 2 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.lastSeen - a.lastSeen);
  }
  function visitors(windowMs) {
    const ev = events.since(windowMs).filter((e) => e.type.startsWith('pair.') || e.type === 'session.fetch' || e.type === 'site.visit');
    const clients = new Map(), nums = new Map();
    for (const e of ev) {
      if (e.client) { const c = clients.get(e.client) || { id: e.client, ip: e.ipm || '', visits: 0, attempts: 0, linked: 0, failed: 0, limited: 0, blocked: 0, lastSeen: 0, countries: new Set(), numbers: new Set() }; if (e.type === 'site.visit') c.visits++; if (e.type === 'pair.start') c.attempts++; if (e.type === 'pair.linked') c.linked++; if (e.type === 'pair.failed') c.failed++; if (e.type === 'pair.limited') c.limited++; if (e.type === 'pair.blocked') c.blocked++; if (e.country) c.countries.add(e.country); if (e.num) c.numbers.add(e.num); c.lastSeen = Math.max(c.lastSeen, e.t); clients.set(e.client, c); }
      if (e.num) { const n = nums.get(e.num) || { id: e.num, number: e.numm || '', attempts: 0, linked: 0, failed: 0, lastSeen: 0, clients: new Set() }; if (e.type === 'pair.start') n.attempts++; if (e.type === 'pair.linked') n.linked++; if (e.type === 'pair.failed') n.failed++; if (e.client) n.clients.add(e.client); n.lastSeen = Math.max(n.lastSeen, e.t); nums.set(e.num, n); }
    }
    const flag = (kind, id) => !!blocked(kind === 'client' ? { client: id } : { num: id });
    return {
      clients: [...clients.values()].map((c) => ({ ...c, countries: [...c.countries], numbers: c.numbers.size, blocked: flag('client', c.id) })).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 100),
      numbers: [...nums.values()].map((n) => ({ ...n, clients: n.clients.size, blocked: flag('number', n.id) })).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 100),
    };
  }
  const sessionRef = (fh) => hmac('ref', fh).slice(0, 16);
  const jobRef = (id) => hmac('job', id).slice(0, 16);
  function liveSessions() {
    const byFh = new Map();
    for (const j of jobs()) if (j.sessionId) { const fh = store.fileHashOf(j.sessionId); if (fh) byFh.set(fh, j); }
    return store.list().map((s) => { const j = byFh.get(s.fh); return { ref: sessionRef(s.fh), createdAt: s.createdAt, expiresAt: s.exp, secondsLeft: Math.max(0, Math.round((s.exp - now()) / 1000)), method: j ? j.method : null, country: j ? j.country || '' : '', number: j ? j.numberMasked || '' : '', client: j ? j.client || '' : '' }; }).sort((a, b) => b.createdAt - a.createdAt);
  }
  const liveJobs = () => jobs().filter((j) => !j.doneAt).map((j) => ({ ref: jobRef(j.id), state: j.state, method: j.method, country: j.country || '', number: j.numberMasked || '', client: j.client || '', ageSec: Math.round((now() - j.createdAt) / 1000) })).sort((a, b) => a.ageSec - b.ageSec);

  // ----- http plumbing -----
  const HEAD = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
  const json = (res, status, body, extra = {}) => { res.writeHead(status, { ...HEAD, 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(JSON.stringify(body)); };
  const cookieOf = (req) => { const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})').exec(req.headers.cookie || ''); return m ? m[1] : null; };
  const isHttps = (req) => !!req.socket.encrypted || (trustProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
  const setCookie = (req, sid, maxAge) => `${COOKIE}=${sid}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
  // "trust this device": a signed cookie that lets this phone skip the 6-digit code (the password is still asked) for 30 days.
  // It is tied to the account's 2FA key and a counter the owner can bump ("forget trusted devices"), so it can be cancelled at any time.
  const TRUST_COOKIE = 'tfx_trust', TRUST_MS = 30 * 24 * 3600 * 1000;
  const trustMac = (acct, exp, epoch) => crypto.createHmac('sha256', secret).update(`trust|${acct.user}|${exp}|${epoch}|${crypto.createHash('sha256').update(acct.totp).digest('hex')}`).digest('hex').slice(0, 40);
  const trustEpoch = (user) => (state.trust && state.trust[user]) || 0;
  const trustCookie = (req, acct) => { const exp = now() + TRUST_MS, ep = trustEpoch(acct.user); return `${TRUST_COOKIE}=${acct.user}.${exp}.${ep}.${trustMac(acct, exp, ep)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${TRUST_MS / 1000}${isHttps(req) ? '; Secure' : ''}`; };
  const clearTrustCookie = (req) => `${TRUST_COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0${isHttps(req) ? '; Secure' : ''}`;
  function isTrusted(req, acct) {
    const m = new RegExp('(?:^|;\\s*)' + TRUST_COOKIE + '=([a-z0-9_-]{1,40})\\.(\\d{10,15})\\.(\\d{1,6})\\.([a-f0-9]{40})').exec(req.headers.cookie || '');
    if (!m || m[1] !== acct.user || Number(m[2]) < now() || Number(m[3]) !== trustEpoch(acct.user)) return false;
    return eq(m[4], trustMac(acct, m[2], Number(m[3])));
  }
  const sameOrigin = (req) => { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host; } catch (err) { return false; } };
  const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

  // returns true when the request was for the dashboard (and has been answered)
  async function handle(req, res, p, ctx) {
    if (!(p === '/admin' || p === '/admin/' || p.startsWith('/admin/'))) return false;
    if (!enabled) { json(res, 404, { error: 'Not found.' }); return true; }
    const ip = ctx.ip, ipId = idOf('client', ip);
    if (p === '/admin' || p === '/admin/') {
      if (req.method !== 'GET') { json(res, 405, { error: 'Not allowed.' }); return true; }
      let page; try { page = fs.readFileSync(path.join(PUBLIC, 'admin.html')); } catch (err) { json(res, 500, { error: 'The dashboard page is missing.' }); return true; }
      res.writeHead(200, { ...HEAD, 'Content-Type': 'text/html; charset=utf-8' }); res.end(page); return true;
    }
    if (!p.startsWith('/admin/api/')) { json(res, 404, { error: 'Not found.' }); return true; }
    const route = p.slice('/admin/api/'.length);
    const post = req.method === 'POST';
    if (!post && req.method !== 'GET') { json(res, 405, { error: 'Not allowed.' }); return true; }
    // The sign-in page sends its form here (into a hidden frame) after a successful sign-in. It does nothing and never reads the body:
    // it only lets the phone's browser see a real form submission, which is what makes it offer to save the password.
    if (post && route === 'noop') { req.resume(); res.writeHead(200, { ...HEAD, 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': HEAD['Content-Security-Policy'].replace("frame-ancestors 'none'", "frame-ancestors 'self'") }); res.end('<!doctype html><meta charset="utf-8"><title>ok</title>'); return true; }
    if (post && !sameOrigin(req)) { json(res, 403, { error: 'Blocked.' }); return true; }
    const body = async () => { try { return JSON.parse((await ctx.readBody(req)) || '{}') || {}; } catch (err) { return null; } };

    // --- sign-in (no session needed) ---
    if (post && route === 'login') {
      const b = await body(); if (!b) return json(res, 400, { error: 'Bad request.' }), true;
      const user = String(b.user || '').toLowerCase().slice(0, 40);
      if (locked(ipId, user)) { events.record('admin.locked', { client: ipId, ipm: maskIp(ip) }); json(res, 429, { error: 'Too many attempts. Try again later.' }); return true; }
      const acct = accounts.find((a) => a.user === user);
      const ok = checkPassword(String(b.password || '').slice(0, 200), acct ? acct.hash : DUMMY_HASH) && !!acct;
      if (!ok) { noteFail(ipId, user); events.record('admin.login_failed', { client: ipId, ipm: maskIp(ip), stage: 'password' }); audit(user || '?', '', 'login.failed', 'password', '', ipId); json(res, 401, { error: 'Wrong username or password.' }); return true; }
      if (isTrusted(req, acct)) {   // known device: password was enough
        const sid = crypto.randomBytes(32).toString('hex'), csrf = crypto.randomBytes(24).toString('hex');
        sessions.set(sid, { user: acct.user, role: acct.role, csrf, created: now(), last: now(), client: ipId });
        audit(acct.user, acct.role, 'login', '', 'trusted device', ipId);
        json(res, 200, { ok: true, trusted: true }, { 'Set-Cookie': setCookie(req, sid, SESSION_MAX_MS / 1000) }); return true;
      }
      const ticket = crypto.randomBytes(24).toString('hex');
      tickets.set(ticket, { user: acct.user, exp: now() + 5 * 60 * 1000, tries: 0, client: ipId });
      json(res, 200, { step: '2fa', ticket }); return true;
    }
    if (post && route === '2fa') {
      const b = await body(); if (!b) return json(res, 400, { error: 'Bad request.' }), true;
      const t = tickets.get(String(b.ticket || ''));
      if (!t || t.exp < now() || t.client !== ipId) { json(res, 401, { error: 'Sign in again.' }); return true; }
      if (locked(ipId, t.user)) { events.record('admin.locked', { client: ipId, ipm: maskIp(ip) }); json(res, 429, { error: 'Too many attempts. Try again later.' }); return true; }
      const acct = accounts.find((a) => a.user === t.user);
      const step = acct ? totpVerify(acct.totp, String(b.code || '').replace(/\s/g, '')) : -1;
      if (step < 0 || step <= acct.lastStep) {   // wrong code, or this very code was already used (no replay)
        t.tries++; noteFail(ipId, t.user); if (t.tries >= 5) tickets.delete(String(b.ticket));
        events.record('admin.login_failed', { client: ipId, ipm: maskIp(ip), stage: '2fa' }); audit(t.user, acct ? acct.role : '', 'login.failed', '2fa', '', ipId);
        json(res, 401, { error: 'That code is not right.' }); return true;
      }
      acct.lastStep = step; tickets.delete(String(b.ticket));
      const sid = crypto.randomBytes(32).toString('hex'), csrf = crypto.randomBytes(24).toString('hex');
      sessions.set(sid, { user: acct.user, role: acct.role, csrf, created: now(), last: now(), client: ipId });
      audit(acct.user, acct.role, 'login', '', b.trust === true ? 'device trusted for 30 days' : '', ipId);
      json(res, 200, { ok: true }, { 'Set-Cookie': b.trust === true ? [setCookie(req, sid, SESSION_MAX_MS / 1000), trustCookie(req, acct)] : setCookie(req, sid, SESSION_MAX_MS / 1000) }); return true;
    }

    // --- everything below needs a signed-in session ---
    const sid = cookieOf(req), sess = sid ? sessions.get(sid) : null;
    if (!sess || now() - sess.last > SESSION_IDLE_MS || now() - sess.created > SESSION_MAX_MS) { if (sid) sessions.delete(sid); json(res, 401, { error: 'Sign in.' }); return true; }
    sess.last = now();
    if (post && !eq(req.headers['x-csrf-token'] || '', sess.csrf)) { json(res, 403, { error: 'Blocked.' }); return true; }
    const can = (perm) => PERMS[sess.role].includes(perm);
    const need = (perm) => { if (can(perm)) return true; audit(sess.user, sess.role, 'denied', route, perm, ipId); json(res, 403, { error: 'Your role is not allowed to do this.' }); return false; };
    const act = (action, target, detail) => audit(sess.user, sess.role, action, target, detail, ipId);

    if (post && route === 'logout') { sessions.delete(sid); act('logout', '', ''); json(res, 200, { ok: true }, { 'Set-Cookie': setCookie(req, '0'.repeat(64), 0) }); return true; }
    if (post && route === 'trust/forget') {   // any signed-in admin: cancel "trust this device" for their own account, everywhere
      state.trust = state.trust || {}; state.trust[sess.user] = trustEpoch(sess.user) + 1; save(); act('trust.forget', sess.user, ''); json(res, 200, { ok: true }, { 'Set-Cookie': clearTrustCookie(req) }); return true;
    }
    if (!post && route === 'me') { json(res, 200, { user: sess.user, role: sess.role, perms: PERMS[sess.role], csrf: sess.csrf, version, serverTime: now(), idleMs: SESSION_IDLE_MS }); return true; }
    if (!post && route === 'overview') { if (need('view')) json(res, 200, overview()); return true; }
    if (!post && route === 'sessions') { if (need('view')) json(res, 200, { sessions: liveSessions(), attempts: liveJobs(), ttlSeconds: Math.round(store.ttlMs / 1000) }); return true; }
    if (post && route === 'sessions/revoke') {
      if (!need('sessions.revoke')) return true;
      const b = await body(); const ref = String((b && b.ref) || '');
      const hit = store.list().find((s) => sessionRef(s.fh) === ref);
      if (!hit || !store.revoke(hit.fh)) { json(res, 404, { error: 'That session ID is gone already.' }); return true; }
      for (const j of jobs()) if (j.sessionId && store.fileHashOf(j.sessionId) === hit.fh) { j.idExp = now(); j.sessionId = null; }
      events.record('session.revoked', { by: sess.user }); act('session.revoke', ref, ''); json(res, 200, { ok: true }); return true;
    }
    if (post && route === 'attempts/stop') {
      if (!need('sessions.revoke')) return true;
      const b = await body(); const ref = String((b && b.ref) || '');
      const j = jobs().find((x) => !x.doneAt && jobRef(x.id) === ref);
      if (!j) { json(res, 404, { error: 'That attempt already ended.' }); return true; }
      stopJob(j, 'This attempt was stopped by the site.'); events.record('pair.stopped', { client: j.client, num: j.numId, by: sess.user }); act('attempt.stop', ref, ''); json(res, 200, { ok: true }); return true;
    }
    if (!post && route === 'visitors') { if (need('view')) { const w = Math.min(7, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('days')) || 1)); { const v = visitors(w * DAY); v.clients.forEach((c) => { c.isMe = c.id === ipId; }); json(res, 200, { days: w, ...v, blocks: state.blocks.filter(liveBlock) }); } } return true; }
    if (!post && route === 'blocks') { if (need('view')) json(res, 200, { blocks: state.blocks.filter(liveBlock) }); return true; }
    if (post && route === 'blocks/add') {
      if (!need('blocks.manage')) return true;
      const b = await body(); if (!b) return json(res, 400, { error: 'Bad request.' }), true;
      const kind = b.kind === 'number' ? 'number' : b.kind === 'client' ? 'client' : null;
      let id = String(b.id || ''), label = '';
      if (kind === 'number' && b.number) { const v = phone.check(b.number, b.country, env); if (!v.ok) { json(res, 400, { error: v.error }); return true; } id = idOf('num', v.e164); label = maskNum(v.e164); }
      if (!kind || !/^[a-f0-9]{12}$/.test(id)) { json(res, 400, { error: 'Choose a visitor or enter a phone number.' }); return true; }
      if (kind === 'client' && id === ipId) { json(res, 400, { error: 'You cannot block your own connection.' }); return true; }
      const hours = Math.min(24 * 365, Math.max(0, Number(b.hours) || 0));
      const reason = String(b.reason || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 120);
      state.blocks = state.blocks.filter((x) => !(x.kind === kind && x.id === id));
      state.blocks.push({ kind, id, label: label || String(b.label || '').slice(0, 40), reason, by: sess.user, at: now(), until: hours ? now() + hours * HOUR : null });
      save(); act('block.add', kind + ':' + id, `${hours ? hours + 'h' : 'permanent'} ${reason}`); json(res, 200, { ok: true }); return true;
    }
    if (post && route === 'blocks/remove') {
      if (!need('blocks.manage')) return true;
      const b = await body(); const before = state.blocks.length;
      state.blocks = state.blocks.filter((x) => !(x.kind === (b && b.kind) && x.id === (b && b.id)));
      if (state.blocks.length === before) { json(res, 404, { error: 'Not found.' }); return true; }
      save(); act('block.remove', `${b.kind}:${b.id}`, ''); json(res, 200, { ok: true }); return true;
    }
    if (!post && route === 'security') { if (need('view')) json(res, 200, { alerts: alerts() }); return true; }
    if (!post && route === 'health') { if (need('view')) json(res, 200, healthNow()); return true; }
    if (!post && route === 'activity') {
      if (!need('view')) return true;
      const q = new URL(req.url, 'http://x').searchParams, type = String(q.get('type') || ''), limit = Math.min(200, Math.max(1, Number(q.get('limit')) || 100));
      let ev = events.since(7 * DAY).filter((e) => !e.type.startsWith('admin.')).reverse();
      if (type) ev = ev.filter((e) => e.type === type || e.type.startsWith(type + '.'));
      json(res, 200, { events: ev.slice(0, limit).map((e) => ({ t: e.t, type: e.type, method: e.method || '', country: e.country || '', client: e.client || '', ip: e.ipm || '', num: e.num || '', number: e.numm || '', detail: e.detail || '', ok: e.ok === undefined ? null : e.ok })), total: ev.length }); return true;
    }
    if (!post && route === 'audit') { if (need('audit.view')) json(res, 200, auditRead(Math.min(500, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('limit')) || 100)))); return true; }
    if (!post && route === 'settings') { if (need('view')) json(res, 200, { maintenance: state.maintenance, limits: limits(), defaults, ranges: LIMITS, canEdit: can('settings.manage') }); return true; }
    if (post && route === 'settings') {
      if (!need('settings.manage')) return true;
      const b = await body(); if (!b) return json(res, 400, { error: 'Bad request.' }), true;
      const before = { maintenance: { ...state.maintenance }, limits: { ...state.limits } };
      if (b.maintenance) state.maintenance = { on: !!b.maintenance.on, message: String(b.maintenance.message || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 200) };
      if (b.limits) {
        const next = {};
        for (const k of Object.keys(LIMITS)) {
          if (b.limits[k] === undefined || b.limits[k] === null || b.limits[k] === '') continue;
          const n = Number(b.limits[k]);
          if (!Number.isInteger(n) || n < LIMITS[k].min || n > LIMITS[k].max) { json(res, 400, { error: `${k} must be a whole number from ${LIMITS[k].min} to ${LIMITS[k].max}.` }); return true; }
          if (n !== defaults[k]) next[k] = n;
        }
        state.limits = next;
      }
      save();
      if (before.maintenance.on !== state.maintenance.on) act(state.maintenance.on ? 'maintenance.on' : 'maintenance.off', '', state.maintenance.message);
      else if (JSON.stringify(before.maintenance) !== JSON.stringify(state.maintenance)) act('maintenance.message', '', state.maintenance.message);
      if (JSON.stringify(before.limits) !== JSON.stringify(state.limits)) act('limits.change', '', JSON.stringify(limits()));
      json(res, 200, { ok: true, maintenance: state.maintenance, limits: limits() }); return true;
    }
    if (!post && route === 'announcements') { if (need('view')) json(res, 200, { announcements: state.announcements.slice().sort((a, b) => b.createdAt - a.createdAt) }); return true; }
    if (post && route === 'announcements/add') {
      if (!need('announce.manage')) return true;
      const b = await body(); const text = String((b && b.text) || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 240);
      if (text.length < 3) { json(res, 400, { error: 'Write the announcement (at least 3 characters).' }); return true; }
      const level = ['info', 'warning', 'critical'].includes(b.level) ? b.level : 'info';
      const hours = Math.min(24 * 90, Math.max(0, Number(b.hours) || 0));
      const a = { id: crypto.randomBytes(6).toString('hex'), text, level, active: true, createdAt: now(), endsAt: hours ? now() + hours * HOUR : null, by: sess.user };
      state.announcements.push(a); if (state.announcements.length > 50) state.announcements = state.announcements.slice(-50);
      save(); act('announcement.add', a.id, `${level}: ${text}`); json(res, 200, { ok: true, id: a.id }); return true;
    }
    if (post && (route === 'announcements/toggle' || route === 'announcements/delete')) {
      if (!need('announce.manage')) return true;
      const b = await body(); const a = state.announcements.find((x) => x.id === (b && b.id));
      if (!a) { json(res, 404, { error: 'Not found.' }); return true; }
      if (route.endsWith('delete')) state.announcements = state.announcements.filter((x) => x !== a); else a.active = !a.active;
      save(); act(route.endsWith('delete') ? 'announcement.delete' : (a.active ? 'announcement.show' : 'announcement.hide'), a.id, ''); json(res, 200, { ok: true }); return true;
    }
    // --- plugin submissions from the Developer Centre (owner only: the owner decides what may be published) ---
    if (route.startsWith('plugins/')) {
      if (!devcentre) { json(res, 404, { error: 'Not found.' }); return true; }
      if (!need('plugins.review')) return true;
      if (!post && route === 'plugins/submissions') { json(res, 200, devcentre.adminList()); return true; }
      if (!post && route === 'plugins/devs') { json(res, 200, { developers: devcentre.adminDevs() }); return true; }
      if (!post && route === 'plugins/submission') {
        const one = devcentre.adminGet(new URL(req.url, 'http://x').searchParams.get('id') || '');
        if (!one) { json(res, 404, { error: 'Not found.' }); return true; }
        json(res, 200, one); return true;
      }
      if (post && route === 'plugins/review') {
        const b = await body(); if (!b) { json(res, 400, { error: 'Bad request.' }); return true; }
        const r = devcentre.adminReview(b.id, b.decision, b.note, sess.user);
        if (r.error) { json(res, r.status, { error: r.error }); return true; }
        const one = devcentre.adminGet(b.id); act('plugin.' + (b.decision === 'approve' ? 'approve' : 'reject'), String(b.id).slice(0, 12), `${one.pluginId}@${one.version} by ${one.login}` + (b.note ? ': ' + String(b.note).slice(0, 120) : ''));
        json(res, 200, { ok: true }); return true;
      }
      if (post && route === 'plugins/dev') {
        const b = await body(); if (!b) { json(res, 400, { error: 'Bad request.' }); return true; }
        const r = devcentre.adminDev(b.githubId, { verified: b.verified, blocked: b.blocked });
        if (r.error) { json(res, r.status, { error: r.error }); return true; }
        act('plugin.developer', String(b.githubId).slice(0, 12), (typeof b.verified === 'boolean' ? 'verified=' + b.verified : '') + (typeof b.blocked === 'boolean' ? ' blocked=' + b.blocked : ''));
        json(res, 200, { ok: true }); return true;
      }
      json(res, 404, { error: 'Not found.' }); return true;
    }
    json(res, 404, { error: 'Not found.' }); return true;
  }

  return {
    enabled, handle, idOf, maskIp, maskNum, blocked, limits, maintenance, publicStatus,
    close() { clearInterval(sweeper); clearInterval(sampler); loop.disable(); },
    _sessions: sessions,
  };
}

module.exports = { createAdmin, hashPassword, checkPassword, newTotpSecret, totpCode, totpVerify, parseAccounts, PERMS };
