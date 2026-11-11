'use strict';
// The Developer Centre: developers sign in with GitHub, send in a plugin, and the owner reviews it in the admin dashboard.
//
// What is kept about a developer: their GitHub number and username (both public on GitHub) and their submissions. The GitHub access token
// is used once, to read that public profile, and is thrown away at once. No e-mail address and no GitHub permission is requested.
// What a submission is: the plugin's manifest and code, copied from the developer's GitHub repository at the tag they name. The COPY is what
// gets reviewed and published, so moving the tag afterwards changes nothing.
// Nothing here publishes anything. Approved plugins wait until the owner runs the phone command (tools/registry.js pull), which downloads them
// with REGISTRY_PULL_TOKEN, checks them again, and signs them with the registry key that never leaves the owner's phone.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { checkPlugin } = require('./plugin-check');

const DEV_COOKIE = 'tfx_dev', OAUTH_COOKIE = 'tfx_oauth';
const DEV_DAYS = 7;
const MAX_PENDING = 5, MAX_PER_DAY = 10;
const reLogin = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, reRepo = /^[A-Za-z0-9._-]{1,100}$/, reTag = /^[A-Za-z0-9._\/-]{1,60}$/, reFolder = /^[A-Za-z0-9._\/-]{0,80}$/;
const LIVE = ['pending', 'approved', 'published'];   // a submission in one of these states holds its plugin id + version

function createDevCentre({ env = process.env, dataDir, secret, cloud = null, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const clientId = String(env.GITHUB_CLIENT_ID || '').trim(), clientSecret = String(env.GITHUB_CLIENT_SECRET || '').trim();
  const site = String(env.SITE_URL || '').trim().replace(/\/+$/, '');
  const configured = !!clientId && !!clientSecret && /^https?:\/\/[^\s/]+$/.test(site) && typeof fetchImpl === 'function';
  const secure = site.startsWith('https://');
  const pullToken = String(env.REGISTRY_PULL_TOKEN || '').trim();
  const pullOn = pullToken.length >= 24;
  const dir = path.join(dataDir, 'devcentre');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  // ---------- records (small files, copied to Supabase when it is on) ----------
  const devs = new Map(), subs = new Map();
  for (const f of fs.readdirSync(dir)) {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (/^dev_\d+\.json$/.test(f) && v && v.githubId) devs.set(String(v.githubId), v);
      else if (/^sub_[a-f0-9]{8}\.json$/.test(f) && v && v.id) subs.set(v.id, v);
    } catch (err) { /* a damaged file is skipped */ }
  }
  function save(kind, rec) {
    const name = kind === 'dev' ? 'dev_' + rec.githubId : 'sub_' + rec.id;
    const f = path.join(dir, name + '.json'), tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(rec), { mode: 0o600 }); fs.renameSync(tmp, f);
    if (cloud && cloud.pushKv) cloud.pushKv('dc:' + name.replace('_', ':'), rec);
  }
  const mac = (s) => crypto.createHmac('sha256', secret).update(s).digest('hex').slice(0, 32);
  const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

  // ---------- cookies ----------
  const cookieOf = (req, name) => { const m = String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '=')); return m ? m.slice(name.length + 1) : ''; };
  const setCookie = (name, value, seconds, p) => `${name}=${value}; Path=${p}; Max-Age=${seconds}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  function devOf(req) {
    const m = /^(\d{1,12})\.(\d{10,14})\.([a-f0-9]{32})$/.exec(cookieOf(req, DEV_COOKIE));
    if (!m || Number(m[2]) < now() || !eq(m[3], mac('dev:' + m[1] + '.' + m[2]))) return null;
    const d = devs.get(m[1]);
    return d && !d.blocked ? d : null;
  }
  const devCookie = (d) => { const exp = now() + DEV_DAYS * 86400 * 1000; return setCookie(DEV_COOKIE, `${d.githubId}.${exp}.${mac('dev:' + d.githubId + '.' + exp)}`, DEV_DAYS * 86400, '/'); };

  // ---------- GitHub (only the sign-in and the plugin files; the visitor's browser never talks to GitHub from our pages) ----------
  async function gh(url, init) {
    const r = await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8000) });
    return r;
  }
  async function rawText(url, max) {
    const r = await gh(url, { headers: { 'user-agent': 'TurboFex-Pair' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('GitHub answered ' + r.status);
    const t = await r.text();
    if (t.length > max) throw new Error('A file in your repository is too big (the plugin file can be up to 1 MB).');
    return t;
  }
  async function githubUser(code) {
    const t = await gh('https://github.com/login/oauth/access_token', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'TurboFex-Pair' }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: site + '/auth/github/callback' }) });
    const tj = await t.json().catch(() => ({}));
    if (!tj || typeof tj.access_token !== 'string') throw new Error('no token');
    const u = await gh('https://api.github.com/user', { headers: { authorization: 'Bearer ' + tj.access_token, accept: 'application/vnd.github+json', 'user-agent': 'TurboFex-Pair' } });
    const uj = await u.json().catch(() => ({}));
    if (!uj || !Number.isInteger(uj.id) || uj.id < 1 || typeof uj.login !== 'string' || !reLogin.test(uj.login)) throw new Error('no profile');
    return { id: uj.id, login: uj.login };   // the token goes out of scope here and is never stored
  }

  // ---------- developers ----------
  const publicDev = (d) => ({ login: d.login, verified: !!d.verified });
  function upsertDev(u) {
    const key = String(u.id), t = now();
    const d = devs.get(key) || { githubId: u.id, firstSeen: t, verified: false, blocked: false };
    d.login = u.login; d.lastLogin = t; devs.set(key, d); save('dev', d); return d;
  }

  // ---------- submissions ----------
  const pubSub = (s) => ({ id: s.id, pluginId: s.manifest.id, version: s.manifest.version, name: s.manifest.name, status: s.status, note: s.status === 'rejected' ? s.note || '' : '', createdAt: s.createdAt, repo: s.repo, tag: s.tag });
  const mine = (d) => [...subs.values()].filter((s) => s.githubId === d.githubId).sort((a, b) => b.createdAt - a.createdAt).map(pubSub);

  function parseRepo(text, d) {
    const m = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(String(text || '').trim());
    if (!m || !reLogin.test(m[1]) || !reRepo.test(m[2]) || m[2] === '.' || m[2] === '..') return { error: 'Paste the address of your repository, like https://github.com/yourname/your-plugin' };
    if (m[1].toLowerCase() !== d.login.toLowerCase()) return { error: 'The repository must belong to your own GitHub account (' + d.login + ').' };
    return { owner: m[1], repo: m[2] };
  }

  async function submit(d, input) {
    if (d.blocked) return { status: 403, error: 'This account cannot send plugins.' };
    const r = parseRepo(input.repo, d); if (r.error) return { status: 400, error: r.error };
    const tag = String(input.tag || '').trim(), folder = String(input.folder || '').trim().replace(/^\/+|\/+$/g, '');
    if (!reTag.test(tag) || tag.includes('..') || tag.startsWith('/') || tag.endsWith('/')) return { status: 400, error: 'Write the release tag exactly as it is on GitHub, for example v1.0.0.' };
    if (!reFolder.test(folder) || folder.includes('..') || folder.includes('//')) return { status: 400, error: 'The folder can only contain letters, numbers, dots, dashes and slashes.' };
    const mineAll = [...subs.values()].filter((s) => s.githubId === d.githubId);
    if (mineAll.filter((s) => s.status === 'pending').length >= MAX_PENDING) return { status: 429, error: 'You already have ' + MAX_PENDING + ' plugins waiting for review. Wait for a decision first.' };
    if (mineAll.filter((s) => now() - s.createdAt < 86400000).length >= MAX_PER_DAY) return { status: 429, error: 'That is enough submissions for today. Please try again tomorrow.' };
    const base = `https://raw.githubusercontent.com/${r.owner}/${r.repo}/${tag}/${folder ? folder + '/' : ''}`;
    let manifestRaw, entrySource;
    try {
      manifestRaw = await rawText(base + 'turbofex-plugin.json', 64 * 1024);
      if (manifestRaw === null) return { status: 400, error: 'I could not find turbofex-plugin.json at that tag' + (folder ? ' in that folder' : '') + '. Check the repository is public and the tag exists.' };
      let entryName = 'index.js';
      try { const mj = JSON.parse(manifestRaw); if (mj && typeof mj.entry === 'string') entryName = mj.entry; } catch (err) { /* the check below reports it */ }
      if (!/^[\w.-]{1,80}$/.test(entryName) || entryName.includes('..')) return { status: 400, error: 'The "entry" in turbofex-plugin.json must be a file name in the plugin folder.' };
      entrySource = await rawText(base + entryName, 1024 * 1024 + 1);
      if (entrySource === null) entrySource = '';
    } catch (err) { return { status: 502, error: /too big/.test(err.message) ? err.message : 'GitHub could not be reached just now. Please try again in a minute.' }; }
    const c = checkPlugin(manifestRaw, entrySource);
    if (!c.ok) return { status: 400, error: 'The plugin cannot be accepted yet:', problems: c.errors };
    const { id, version } = c.manifest;
    for (const s of subs.values()) {
      if (s.manifest.id !== id) continue;
      if (s.githubId !== d.githubId && LIVE.includes(s.status)) return { status: 409, error: 'The plugin id "' + id + '" already belongs to another developer. Choose a different id.' };
      if (s.githubId === d.githubId && s.manifest.version === version && LIVE.includes(s.status)) return { status: 409, error: 'Version ' + version + ' of "' + id + '" was already sent. Raise the version number for a new release.' };
    }
    const s = { id: crypto.randomBytes(4).toString('hex'), githubId: d.githubId, login: d.login, repo: `https://github.com/${r.owner}/${r.repo}`, tag, folder, status: 'pending', createdAt: now(), updatedAt: now(), manifest: c.manifest, manifestRaw, entrySource, manifestSha: c.manifestSha, entrySha: c.entrySha, flags: c.flags, risk: c.risk, note: '', reviewedBy: '' };
    subs.set(s.id, s); save('sub', s);
    return { status: 200, submission: pubSub(s), flags: c.flags.length };
  }
  function withdraw(d, id) {
    const s = subs.get(String(id));
    if (!s || s.githubId !== d.githubId) return { status: 404, error: 'Not found.' };
    if (!['pending', 'approved'].includes(s.status)) return { status: 400, error: 'This submission can no longer be withdrawn here.' };
    s.status = 'withdrawn'; s.updatedAt = now(); save('sub', s); return { status: 200, ok: true };
  }

  // ---------- the owner's side (the admin dashboard calls these after it has checked the role) ----------
  const adminRow = (s) => { const d = devs.get(String(s.githubId)); return { id: s.id, pluginId: s.manifest.id, version: s.manifest.version, name: s.manifest.name, status: s.status, risk: s.risk, flags: s.flags.length, login: s.login, verified: !!(d && d.verified), createdAt: s.createdAt, permissions: s.manifest.permissions }; };
  const order = { pending: 0, approved: 1, published: 2, rejected: 3, withdrawn: 4 };
  const adminList = () => ({ submissions: [...subs.values()].sort((a, b) => (order[a.status] - order[b.status]) || (b.createdAt - a.createdAt)).slice(0, 300).map(adminRow), configured, pullOn, counts: Object.fromEntries(Object.keys(order).map((k) => [k, [...subs.values()].filter((s) => s.status === k).length])) });
  function adminGet(id) {
    const s = subs.get(String(id)); if (!s) return null;
    const d = devs.get(String(s.githubId));
    return { ...adminRow(s), repo: s.repo, tag: s.tag, folder: s.folder, manifest: s.manifest, manifestRaw: s.manifestRaw, entrySource: s.entrySource, manifestSha: s.manifestSha, entrySha: s.entrySha, flagList: s.flags, note: s.note, reviewedBy: s.reviewedBy, reviewedAt: s.reviewedAt || 0, dev: d ? { githubId: d.githubId, login: d.login, verified: !!d.verified, blocked: !!d.blocked, firstSeen: d.firstSeen } : null, otherVersions: [...subs.values()].filter((x) => x.manifest.id === s.manifest.id && x.id !== s.id).map((x) => ({ id: x.id, version: x.manifest.version, status: x.status })) };
  }
  function adminReview(id, decision, note, by) {
    const s = subs.get(String(id)); if (!s) return { status: 404, error: 'Not found.' };
    note = String(note || '').trim().slice(0, 400);
    if (decision === 'approve') {
      if (s.status !== 'pending') return { status: 400, error: 'Only a waiting submission can be approved.' };
      const c = checkPlugin(s.manifestRaw, s.entrySource);   // the stored copy is checked again, so nothing changes between sending and approving
      if (!c.ok || c.entrySha !== s.entrySha || c.manifestSha !== s.manifestSha) return { status: 400, error: 'The stored plugin no longer passes the check.' };
      for (const o of subs.values()) if (o.id !== s.id && o.manifest.id === s.manifest.id && o.githubId !== s.githubId && ['approved', 'published'].includes(o.status)) return { status: 409, error: 'Another developer already owns this plugin id.' };
      s.status = 'approved';
    } else if (decision === 'reject') {
      if (!['pending', 'approved'].includes(s.status)) return { status: 400, error: 'This submission cannot be rejected now.' };
      if (note.length < 3) return { status: 400, error: 'Write a short reason (at least 3 characters). The developer will see it.' };
      s.status = 'rejected';
    } else return { status: 400, error: 'Bad request.' };
    s.note = note; s.reviewedBy = String(by || '').slice(0, 40); s.reviewedAt = now(); s.updatedAt = now(); save('sub', s);
    return { status: 200, ok: true };
  }
  function adminDev(githubId, patch) {
    const d = devs.get(String(githubId)); if (!d) return { status: 404, error: 'Not found.' };
    if (typeof patch.verified === 'boolean') d.verified = patch.verified;
    if (typeof patch.blocked === 'boolean') d.blocked = patch.blocked;
    save('dev', d); return { status: 200, ok: true };
  }
  const adminDevs = () => [...devs.values()].sort((a, b) => b.lastLogin - a.lastLogin).slice(0, 200).map((d) => ({ githubId: d.githubId, login: d.login, verified: !!d.verified, blocked: !!d.blocked, lastLogin: d.lastLogin, submissions: [...subs.values()].filter((s) => s.githubId === d.githubId).length }));

  // what the public Plugins page may show about a published plugin: who sent it, whether you verified them, and where the code is
  function publicInfo(pluginId, version) {
    const all = [...subs.values()].filter((s) => s.status === 'published' && s.manifest.id === pluginId);
    const s = all.find((x) => x.manifest.version === version) || all.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))[0];
    if (!s) return null;
    const d = devs.get(String(s.githubId));
    return { developer: s.login, verified: !!(d && d.verified && !d.blocked), source: `${s.repo}/tree/${s.tag}` };
  }

  // ---------- the phone command ----------
  const pullAuthorized = (req) => { const m = /^Bearer (.{24,200})$/.exec(String(req.headers.authorization || '')); return pullOn && !!m && eq(m[1], pullToken); };
  const approvedForPull = () => [...subs.values()].filter((s) => s.status === 'approved').sort((a, b) => a.createdAt - b.createdAt).map((s) => { const d = devs.get(String(s.githubId)); return { submission: s.id, id: s.manifest.id, version: s.manifest.version, manifestRaw: s.manifestRaw, entrySource: s.entrySource, manifestSha: s.manifestSha, entrySha: s.entrySha, developer: s.login, githubId: s.githubId, verified: !!(d && d.verified) }; });
  function markPublished(ids) {
    let n = 0;
    for (const id of Array.isArray(ids) ? ids.slice(0, 100) : []) { const s = subs.get(String(id)); if (s && s.status === 'approved') { s.status = 'published'; s.publishedAt = now(); s.updatedAt = now(); save('sub', s); n++; } }
    return n;
  }

  // ---------- HTTP ----------
  // returns true when the request was for the Developer Centre (and has been answered)
  async function handle(req, res, p, ctx) {
    const { send, readBody, limited, ip } = ctx;
    const redirect = (to, cookies) => { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...(cookies ? { 'Set-Cookie': cookies } : {}) }); res.end(); return true; };

    if (req.method === 'GET' && p === '/auth/github') {
      if (!configured) return redirect('/developers?e=off');
      if (limited('devauth', ip, 20, 10 * 60 * 1000)) return redirect('/developers?e=wait');
      const state = crypto.randomBytes(18).toString('hex');
      const to = 'https://github.com/login/oauth/authorize?' + new URLSearchParams({ client_id: clientId, redirect_uri: site + '/auth/github/callback', state, allow_signup: 'false' });
      return redirect(to, setCookie(OAUTH_COOKIE, state + '.' + mac('oauth:' + state), 600, '/auth'));
    }
    if (req.method === 'GET' && p === '/auth/github/callback') {
      const q = new URL(req.url, 'http://x').searchParams;
      const clear = setCookie(OAUTH_COOKIE, 'x', 0, '/auth');
      if (!configured) return redirect('/developers?e=off', clear);
      if (limited('devcb', ip, 20, 10 * 60 * 1000)) return redirect('/developers?e=wait', clear);
      const ck = /^([a-f0-9]{36})\.([a-f0-9]{32})$/.exec(cookieOf(req, OAUTH_COOKIE));
      const state = String(q.get('state') || ''), code = String(q.get('code') || '');
      if (!ck || !eq(ck[1], state) || !eq(ck[2], mac('oauth:' + ck[1])) || !/^[A-Za-z0-9_-]{8,100}$/.test(code)) return redirect('/developers?e=login', clear);
      let u;
      try { u = await githubUser(code); } catch (err) { return redirect('/developers?e=login', clear); }
      const existing = devs.get(String(u.id));
      if (existing && existing.blocked) return redirect('/developers?e=blocked', clear);
      const d = upsertDev(u);
      return redirect('/developers', [clear, devCookie(d)]);
    }

    if (p === '/api/dev/me' && req.method === 'GET') {
      const d = devOf(req);
      return send(res, 200, d ? { configured, user: publicDev(d), submissions: mine(d) } : { configured, user: null }), true;
    }
    if (p === '/api/dev/logout' || p === '/api/dev/submit' || p === '/api/dev/withdraw') {
      if (req.method !== 'POST') return send(res, 405, { error: 'Not allowed.' }), true;
      // a form on another website cannot send this header, and the cookie is SameSite=Lax: together they stop cross-site requests
      let sameSite = req.headers['x-requested-with'] === 'tfx';
      const o = req.headers.origin; if (o) { try { sameSite = sameSite && new URL(o).host === req.headers.host; } catch (err) { sameSite = false; } }
      if (!sameSite) return send(res, 403, { error: 'Blocked.' }), true;
      if (p === '/api/dev/logout') return res.setHeader('Set-Cookie', setCookie(DEV_COOKIE, 'x', 0, '/')), send(res, 200, { ok: true }), true;
      const d = devOf(req);
      if (!d) return send(res, 401, { error: 'Please sign in with GitHub first.' }), true;
      if (limited('devpost', ip, 30, 10 * 60 * 1000)) return send(res, 429, { error: 'Please slow down a little.' }), true;
      let b; try { b = JSON.parse((await readBody(req)) || '{}') || {}; } catch (err) { return send(res, 400, { error: 'Bad request.' }), true; }
      const out = p === '/api/dev/submit' ? await submit(d, b) : withdraw(d, b.id);
      const { status, ...rest } = out; return send(res, status, rest), true;
    }

    if (p === '/api/registry/approved' || p === '/api/registry/published') {
      if (!pullOn) return send(res, 404, { error: 'Not found.' }), true;
      if (limited('regpull', ip, 30, 60 * 1000)) return send(res, 429, { error: 'Too many tries.' }), true;
      if (!pullAuthorized(req)) return send(res, 401, { error: 'Not allowed.' }), true;
      if (p.endsWith('approved') && req.method === 'GET') return send(res, 200, { plugins: approvedForPull() }), true;
      if (p.endsWith('published') && req.method === 'POST') {
        let b; try { b = JSON.parse((await readBody(req)) || '{}') || {}; } catch (err) { return send(res, 400, { error: 'Bad request.' }), true; }
        return send(res, 200, { ok: true, marked: markPublished(b.ids) }), true;
      }
      return send(res, 405, { error: 'Not allowed.' }), true;
    }
    return false;
  }

  return { configured, pullOn, handle, adminList, adminGet, adminReview, adminDev, adminDevs, publicInfo, _subs: subs, _devs: devs };
}

module.exports = { createDevCentre };
