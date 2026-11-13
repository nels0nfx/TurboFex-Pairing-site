'use strict';
// Anonymous statistics from bots whose owner turned them on (`.plugin stats on`).
// Kept per bot: a random id, a hash of its secret, when it last reported, its bot version, and for each store plugin: version, on/off, failure count.
// Never received or stored: chat text, phone numbers, group names, the session, the IP address (only used in memory for rate limits).
// A bot that is turned off is deleted at once (/bot/forget); a bot that stops reporting is deleted after 90 days.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_BOTS = 20000, MIN_GAP_MS = 20 * 3600 * 1000, ACTIVE_MS = 8 * 86400000, KEEP_MS = 90 * 86400000, UNUSED_MS = 7 * 86400000;
const reBot = /^[0-9a-f]{16}$/, reSecret = /^[0-9a-f]{32}$/, reId = /^[a-z0-9-]{3,32}$/, reVer = /^\d{1,4}\.\d{1,5}\.\d{1,5}$/;
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createBotStats({ dataDir, cloud, now = Date.now }) {
  const dir = path.join(dataDir, 'devcentre'); fs.mkdirSync(dir, { recursive: true });
  const bots = new Map();
  for (const f of fs.readdirSync(dir)) {
    const m = /^bot_([0-9a-f]{16})\.json$/.exec(f); if (!m) continue;
    try { const v = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (v && !v.gone && v.h) bots.set(m[1], v); else fs.rmSync(path.join(dir, f), { force: true }); } catch (e) { /* unreadable: ignored */ }
  }
  const file = (id) => path.join(dir, 'bot_' + id + '.json');
  function save(rec) { const f = file(rec.id), tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(rec), { mode: 0o600 }); fs.renameSync(tmp, f); if (cloud && cloud.pushKv) cloud.pushKv('dc:bot:' + rec.id, rec); }
  function drop(id) { bots.delete(id); fs.rmSync(file(id), { force: true }); if (cloud && cloud.pushKv) cloud.pushKv('dc:bot:' + id, { gone: true }); }
  let cache = null, cacheAt = 0;
  function purge() { const t = now(); let n = 0; for (const [id, r] of [...bots]) if ((r.at && t - r.at > KEEP_MS) || (!r.at && t - r.created > UNUSED_MS)) { drop(id); n++; } cache = null; return n; }
  purge();

  function register() {
    if (bots.size >= MAX_BOTS) { purge(); if (bots.size >= MAX_BOTS) return { status: 503, error: 'Statistics are full right now.' }; }
    const id = crypto.randomBytes(8).toString('hex'), secret = crypto.randomBytes(16).toString('hex');
    const rec = { id, h: hash(secret), created: now(), at: 0, v: '', p: {} }; bots.set(id, rec); save(rec);
    return { status: 200, json: { botId: id, secret } };
  }
  function auth(header) {   // "Bearer <botId>.<secret>"
    const m = /^Bearer ([0-9a-f]{16})\.([0-9a-f]{32})$/.exec(String(header || '')); if (!m) return null;
    const rec = bots.get(m[1]); if (!rec) return null;
    const a = Buffer.from(rec.h), b = Buffer.from(hash(m[2])); return a.length === b.length && crypto.timingSafeEqual(a, b) ? rec : null;
  }
  function heartbeat(header, body) {
    const rec = auth(header); if (!rec) return { status: 401, error: 'Unknown bot.' };
    if (rec.at && now() - rec.at < MIN_GAP_MS) return { status: 429, error: 'Once a day is enough.' };
    if (!body || typeof body !== 'object' || !Array.isArray(body.plugins) || body.plugins.length > 50) return { status: 400, error: 'Bad request.' };
    const p = {};
    for (const x of body.plugins) {
      if (!x || typeof x !== 'object' || !reId.test(x.id) || !reVer.test(x.version) || typeof x.enabled !== 'boolean' || !Number.isInteger(x.errors) || x.errors < 0 || x.errors > 1000) return { status: 400, error: 'Bad request.' };
      p[x.id] = [x.version, x.enabled ? 1 : 0, x.errors];
    }
    rec.p = p; rec.at = now(); rec.v = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(String(body.v)) ? String(body.v) : ''; save(rec); cache = null;
    return { status: 200, json: { ok: true } };
  }
  // a bot owner's own rating of a plugin the bot has installed (only counted for bots that share statistics)
  function rate(header, body) {
    const rec = auth(header); if (!rec) return { status: 401, error: 'Unknown bot.' };
    if (!body || typeof body !== 'object' || !reId.test(String(body.plugin)) || !Number.isInteger(body.stars) || body.stars < 1 || body.stars > 5) return { status: 400, error: 'Bad request.' };
    if (!rec.p || !rec.p[body.plugin]) return { status: 400, error: 'This bot has not reported that plugin yet.' };
    rec.r = rec.r || {}; if (!rec.r[body.plugin] && Object.keys(rec.r).length >= 50) return { status: 400, error: 'Too many ratings.' };
    rec.r[body.plugin] = body.stars; save(rec); cache = null; return { status: 200, json: { ok: true } };
  }
  function forget(header) { const rec = auth(header); if (!rec) return { status: 401, error: 'Unknown bot.' }; drop(rec.id); cache = null; return { status: 200, json: { ok: true } }; }

  // per plugin: how many bots (that share statistics and reported in the last 8 days) have it installed / on, which versions, failures in their last report

  function totals() {
    if (cache && now() - cacheAt < 300000) return cache;
    const out = new Map(), t = now();
    for (const r of bots.values()) {
      if (!r.at || t - r.at > ACTIVE_MS) continue;
      for (const [id, [v, en, err]] of Object.entries(r.p)) { const o = out.get(id) || { installs: 0, enabled: 0, versions: {}, errors: 0 }; o.installs++; o.enabled += en; o.versions[v] = (o.versions[v] || 0) + 1; o.errors += err; out.set(id, o); }
      for (const [id, st] of Object.entries(r.r || {})) { const o = out.get(id); if (o && Number.isInteger(st)) { o.rs = (o.rs || 0) + st; o.rc = (o.rc || 0) + 1; } }
    }
    cache = out; cacheAt = t; return out;
  }
  const of = (id) => totals().get(id) || null;

  async function handle(req, res, p, { ip, send, readBody, limited }) {
    if (!p.startsWith('/bot/')) return false;
    if (req.method !== 'POST' || !['/bot/register', '/bot/heartbeat', '/bot/forget', '/bot/rate'].includes(p)) { send(res, 404, { error: 'Not found.' }); return true; }
    if (limited('bot' + p, ip, p === '/bot/register' ? 10 : 120, 3600 * 1000)) { send(res, 429, { error: 'Please wait.' }); return true; }
    let body = {}; try { body = JSON.parse((await readBody(req, 8192)) || '{}'); } catch (e) { send(res, 400, { error: 'Bad request.' }); return true; }
    const r = p === '/bot/register' ? register() : p === '/bot/heartbeat' ? heartbeat(req.headers.authorization, body) : p === '/bot/rate' ? rate(req.headers.authorization, body) : forget(req.headers.authorization);
    send(res, r.status, r.error ? { error: r.error } : r.json); return true;
  }
  return { handle, of, totals, purge, count: () => bots.size };
}
module.exports = { createBotStats };
