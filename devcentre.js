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
const LIVE = ['pending', 'approved', 'published', 'revoked'];   // a submission in one of these states holds its plugin id + version

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
  const devs = new Map(), subs = new Map(), ratings = new Map(), reports = new Map();   // reports: plugin id -> { pluginId, items: { githubId: { reason, text, login, at, status } } }   // ratings: plugin id -> { pluginId, votes: { githubId: { stars, text, login, at, hidden } } }
  for (const f of fs.readdirSync(dir)) {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (/^dev_\d+\.json$/.test(f) && v && v.githubId) devs.set(String(v.githubId), v);
      else if (/^sub_[a-f0-9]{8}\.json$/.test(f) && v && v.id) subs.set(v.id, v);
      else if (/^rat_[a-z0-9-]{3,32}\.json$/.test(f) && v && v.pluginId && v.votes) ratings.set(v.pluginId, v);
      else if (/^rep_[a-z0-9-]{3,32}\.json$/.test(f) && v && v.pluginId && v.items) reports.set(v.pluginId, v);
    } catch (err) { /* a damaged file is skipped */ }
  }
  // the owner's pause switch: while paused the store shows nothing and nobody can send, rate or report (bots and the signed registry are not affected)
  let paused = false;
  try { paused = JSON.parse(fs.readFileSync(path.join(dir, 'switch.json'), 'utf8')).paused === true; } catch (err) { /* not set: open */ }
  // featured plugins: ids the owner picked to show first with a badge (a plugin id, not a version)
  let featured = new Set();
  try { const f = JSON.parse(fs.readFileSync(path.join(dir, 'featured.json'), 'utf8')); if (Array.isArray(f.ids)) featured = new Set(f.ids.filter((x) => /^[a-z0-9-]{3,32}$/.test(x)).slice(0, 50)); } catch (err) { /* none yet */ }
  function setFeatured(id, on) {
    id = String(id || ''); if (!/^[a-z0-9-]{3,32}$/.test(id)) return { status: 400, error: 'Bad plugin id.' };
    if (on) { if (!featured.has(id) && featured.size >= 6) return { status: 400, error: 'Up to 6 plugins can be featured. Remove one first.' }; featured.add(id); } else featured.delete(id);
    const rec = { ids: [...featured], at: now() }; const f = path.join(dir, 'featured.json'), tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(rec), { mode: 0o600 }); fs.renameSync(tmp, f);
    if (cloud && cloud.pushKv) cloud.pushKv('dc:featured', rec);
    return { ok: true, featured: on === true };
  }
  function setPaused(v) {
    paused = v === true; const rec = { paused, at: now() };
    const f = path.join(dir, 'switch.json'), tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(rec), { mode: 0o600 }); fs.renameSync(tmp, f);
    if (cloud && cloud.pushKv) cloud.pushKv('dc:switch', rec);
    return paused;
  }
  function save(kind, rec) {
    const name = kind === 'dev' ? 'dev_' + rec.githubId : kind === 'rat' ? 'rat_' + rec.pluginId : kind === 'rep' ? 'rep_' + rec.pluginId : 'sub_' + rec.id;
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
  const pubSub = (s) => ({ id: s.id, pluginId: s.manifest.id, version: s.manifest.version, name: s.manifest.name, status: s.status, note: (s.status === 'rejected' || s.status === 'changes') ? s.note || '' : '', createdAt: s.createdAt, repo: s.repo, tag: s.tag, replies: (s.replies || []).map((r) => ({ text: r.text, at: r.at })) });
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
    // optional README.md and CHANGELOG.md next to the plugin: plain text, up to 16 KB, only ever shown as text
    const docs = {};
    for (const [k, f] of [['readme', 'README.md'], ['changelog', 'CHANGELOG.md']]) {
      let t = null;
      try { t = await rawText(base + f, 16 * 1024); } catch (err) { if (/too big/.test(err.message)) return { status: 400, error: f + ' is bigger than 16 KB. Make it shorter.' }; return { status: 502, error: 'GitHub could not be reached just now. Please try again in a minute.' }; }
      if (t === null || !t.trim()) continue;
      if (Buffer.byteLength(t) > 16 * 1024 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/.test(t)) return { status: 400, error: f + ' must be plain text (UTF-8) up to 16 KB.' };
      docs[k] = t; docs[k + 'Sha'] = crypto.createHash('sha256').update(Buffer.from(t)).digest('hex');
    }
    const c = checkPlugin(manifestRaw, entrySource);
    if (!c.ok) return { status: 400, error: 'The plugin cannot be accepted yet:', problems: c.errors };
    const { id, version } = c.manifest;
    for (const s of subs.values()) {
      if (s.manifest.id !== id) continue;
      if (s.githubId !== d.githubId && LIVE.includes(s.status)) return { status: 409, error: 'The plugin id "' + id + '" already belongs to another developer. Choose a different id.' };
      if (s.githubId === d.githubId && s.manifest.version === version && LIVE.includes(s.status)) return { status: 409, error: 'Version ' + version + ' of "' + id + '" was already sent. Raise the version number for a new release.' };
    }
    const s = { id: crypto.randomBytes(4).toString('hex'), githubId: d.githubId, login: d.login, repo: `https://github.com/${r.owner}/${r.repo}`, tag, folder, status: 'pending', createdAt: now(), updatedAt: now(), manifest: c.manifest, manifestRaw, entrySource, manifestSha: c.manifestSha, entrySha: c.entrySha, ...docs, flags: c.flags, risk: c.risk, note: '', reviewedBy: '' };
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
  const adminRow = (s) => { const d = devs.get(String(s.githubId)); return { id: s.id, pluginId: s.manifest.id, version: s.manifest.version, name: s.manifest.name, status: s.status, risk: s.risk, flags: s.flags.length, login: s.login, verified: !!(d && d.verified), createdAt: s.createdAt, permissions: s.manifest.permissions, revoke: s.revoke ? { reason: s.revoke.reason, at: s.revoke.at, done: !!s.revoke.done } : null }; };
  const order = { pending: 0, changes: 1, approved: 2, published: 3, revoked: 4, rejected: 5, withdrawn: 6 };
  const adminList = () => ({ paused, submissions: [...subs.values()].sort((a, b) => (order[a.status] - order[b.status]) || (b.createdAt - a.createdAt)).slice(0, 300).map(adminRow), configured, pullOn, counts: Object.fromEntries(Object.keys(order).map((k) => [k, [...subs.values()].filter((s) => s.status === k).length])) });
  // what changed since the last version the owner accepted (line by line, with 2 lines of context); never fails the page
  function lineDiff(a, b) {
    const x = a.split('\n'), y = b.split('\n');
    if (x.length > 1500 || y.length > 1500) return { tooBig: true, lines: [] };
    const n = x.length, m = y.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const all = []; let i = 0, j = 0;
    while (i < n && j < m) { if (x[i] === y[j]) { all.push({ t: ' ', s: x[i] }); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) all.push({ t: '-', s: x[i++] }); else all.push({ t: '+', s: y[j++] }); }
    while (i < n) all.push({ t: '-', s: x[i++] }); while (j < m) all.push({ t: '+', s: y[j++] });
    const keep = new Array(all.length).fill(false);
    all.forEach((l, k) => { if (l.t !== ' ') for (let q = Math.max(0, k - 2); q <= Math.min(all.length - 1, k + 2); q++) keep[q] = true; });
    const lines = []; let skipped = false;
    all.forEach((l, k) => { if (keep[k]) { if (skipped) lines.push({ t: '~', s: '…' }); skipped = false; lines.push({ t: l.t, s: l.s.slice(0, 300) }); } else skipped = true; });
    return { tooBig: false, lines: lines.slice(0, 600), added: all.filter((l) => l.t === '+').length, removed: all.filter((l) => l.t === '-').length };
  }
  function changesSince(s) {
    const prev = [...subs.values()].filter((o) => o.id !== s.id && o.manifest.id === s.manifest.id && o.githubId === s.githubId && ['published', 'approved'].includes(o.status) && o.createdAt < s.createdAt).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!prev) return null;
    const pp = prev.manifest.permissions || [], cp = s.manifest.permissions || [], pd = (prev.manifest.network && prev.manifest.network.domains) || prev.manifest.domains || [], cd = (s.manifest.network && s.manifest.network.domains) || s.manifest.domains || [];
    return { version: prev.manifest.version, status: prev.status, permsAdded: cp.filter((x) => !pp.includes(x)), permsRemoved: pp.filter((x) => !cp.includes(x)), domainsAdded: cd.filter((x) => !pd.includes(x)), code: lineDiff(String(prev.entrySource || ''), String(s.entrySource || '')), manifest: lineDiff(String(prev.manifestRaw || ''), String(s.manifestRaw || '')) };
  }
  function adminGet(id) {
    const s = subs.get(String(id)); if (!s) return null;
    const d = devs.get(String(s.githubId));
    return { ...adminRow(s), replies: (s.replies || []).map((r) => ({ text: r.text, at: r.at })), featured: featured.has(s.pluginId), repo: s.repo, tag: s.tag, folder: s.folder, manifest: s.manifest, manifestRaw: s.manifestRaw, entrySource: s.entrySource, readme: s.readme || '', changelog: s.changelog || '', manifestSha: s.manifestSha, entrySha: s.entrySha, flagList: s.flags, note: s.note, reviewedBy: s.reviewedBy, reviewedAt: s.reviewedAt || 0, dev: d ? { githubId: d.githubId, login: d.login, verified: !!d.verified, blocked: !!d.blocked, firstSeen: d.firstSeen } : null, changes: (() => { try { return changesSince(s); } catch (err) { return null; } })(), otherVersions: [...subs.values()].filter((x) => x.manifest.id === s.manifest.id && x.id !== s.id).map((x) => ({ id: x.id, version: x.manifest.version, status: x.status })) };
  }
  function adminReview(id, decision, note, by) {
    const s = subs.get(String(id)); if (!s) return { status: 404, error: 'Not found.' };
    note = String(note || '').trim().slice(0, 400);
    if (decision === 'approve') {
      if (s.status !== 'pending') return { status: 400, error: 'Only a waiting submission can be approved.' };
      const c = checkPlugin(s.manifestRaw, s.entrySource);   // the stored copy is checked again, so nothing changes between sending and approving
      if (!c.ok || c.entrySha !== s.entrySha || c.manifestSha !== s.manifestSha) return { status: 400, error: 'The stored plugin no longer passes the check.' };
      for (const o of subs.values()) if (o.id !== s.id && o.manifest.id === s.manifest.id && o.githubId !== s.githubId && ['approved', 'published', 'revoked'].includes(o.status)) return { status: 409, error: 'Another developer already owns this plugin id.' };
      s.status = 'approved';
    } else if (decision === 'reject') {
      if (!['pending', 'approved'].includes(s.status)) return { status: 400, error: 'This submission cannot be rejected now.' };
      if (note.length < 3) return { status: 400, error: 'Write a short reason (at least 3 characters). The developer will see it.' };
      s.status = 'rejected';
    } else if (decision === 'changes') {
      if (s.status !== 'pending') return { status: 400, error: 'Only a waiting submission can be sent back for changes.' };
      if (note.length < 3) return { status: 400, error: 'Say what should change (at least 3 characters). The developer will see it.' };
      s.status = 'changes';
    } else return { status: 400, error: 'Bad request.' };
    s.note = note; s.reviewedBy = String(by || '').slice(0, 40); s.reviewedAt = now(); s.updatedAt = now(); save('sub', s);
    return { status: 200, ok: true };
  }
  // withdraw a published plugin: the site hides it at once and the phone command signs the withdrawal (bots switch it off after that)
  function adminRevoke(id, reason, by) {
    const s = subs.get(String(id)); if (!s) return { status: 404, error: 'Not found.' };
    reason = String(reason || '').trim().slice(0, 200);
    if (s.status !== 'published' || s.revoke) return { status: 400, error: 'Only a published plugin can be withdrawn, and only once.' };
    if (reason.length < 3) return { status: 400, error: 'Write a short reason (at least 3 characters).' };
    s.revoke = { reason, at: now(), by: String(by || '').slice(0, 40), done: false }; s.updatedAt = now(); save('sub', s);
    return { status: 200, ok: true };
  }
  const hidden = () => new Set([...subs.values()].filter((s) => s.revoke).map((s) => s.manifest.id + '@' + s.manifest.version));
  function adminDev(githubId, patch) {
    const d = devs.get(String(githubId)); if (!d) return { status: 404, error: 'Not found.' };
    if (typeof patch.verified === 'boolean') d.verified = patch.verified;
    if (typeof patch.blocked === 'boolean') d.blocked = patch.blocked;
    save('dev', d); return { status: 200, ok: true };
  }
  const adminDevs = () => [...devs.values()].sort((a, b) => b.lastLogin - a.lastLogin).slice(0, 200).map((d) => ({ githubId: d.githubId, login: d.login, verified: !!d.verified, blocked: !!d.blocked, lastLogin: d.lastLogin, submissions: [...subs.values()].filter((s) => s.githubId === d.githubId).length }));

  // ---------- ratings: one 1-5 star vote (and a short review) per GitHub account per plugin ----------
  const rePlug = /^[a-z0-9-]{3,32}$/, MAX_VOTES = 2000;
  const clean = (t) => String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  const visible = (r) => Object.values((r && r.votes) || {}).filter((v) => !v.hidden);
  function ratingOf(pluginId) {
    const v = visible(ratings.get(pluginId)); if (!v.length) return null;
    return { avg: Math.round((v.reduce((a, x) => a + x.stars, 0) / v.length) * 10) / 10, count: v.length };
  }
  async function rate(d, b, listed) {
    const id = String(b.plugin || '');
    if (!rePlug.test(id)) return { status: 400, error: 'Unknown plugin.' };
    if (!(await listed(id))) return { status: 404, error: 'That plugin is not in the store.' };
    let rec = ratings.get(id);
    if (b.remove === true) {
      if (rec && rec.votes[d.githubId]) { delete rec.votes[d.githubId]; save('rat', rec); }
      return { status: 200, ok: true };
    }
    const stars = Number(b.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { status: 400, error: 'Choose 1 to 5 stars.' };
    if ([...subs.values()].some((s) => s.githubId === d.githubId && s.manifest.id === id)) return { status: 403, error: 'You cannot rate your own plugin.' };
    if (!rec) { rec = { pluginId: id, votes: {} }; ratings.set(id, rec); }
    const old = rec.votes[d.githubId];
    if (!old && Object.keys(rec.votes).length >= MAX_VOTES) return { status: 429, error: 'This plugin has reached the limit of ratings.' };
    rec.votes[d.githubId] = { stars, text: clean(b.text), login: d.login, at: now(), hidden: old ? !!old.hidden : false };
    save('rat', rec);
    return { status: 200, ok: true, rating: ratingOf(id) };
  }
  const reviewsOf = (id, limit = 30) => visible(ratings.get(id)).filter((v) => v.text).sort((a, b) => b.at - a.at).slice(0, limit).map((v) => ({ login: v.login, stars: v.stars, text: v.text, at: v.at }));
  const myRatings = (d) => { const out = {}; for (const [id, r] of ratings) { const v = r.votes[d.githubId]; if (v) out[id] = { stars: v.stars, text: v.text }; } return out; };
  const adminReviews = () => { const out = []; for (const r of ratings.values()) for (const [gid, v] of Object.entries(r.votes)) out.push({ plugin: r.pluginId, githubId: Number(gid), login: v.login, stars: v.stars, text: v.text, at: v.at, hidden: !!v.hidden }); return out.sort((a, b) => b.at - a.at).slice(0, 300); };
  function adminHide(plugin, githubId, hide) {
    const rec = ratings.get(String(plugin)), v = rec && rec.votes[String(githubId)];
    if (!v) return { status: 404, error: 'Not found.' };
    v.hidden = hide === true; save('rat', rec); return { status: 200, ok: true };
  }

  // ---------- reports: a signed-in person tells you a plugin is a problem; you see them in the admin dashboard ----------
  const REASONS = { harmful: 'Harmful or dangerous', spam: 'Spam or unwanted messages', stealing: 'Takes data or does things it did not say', copy: 'Copies someone else\'s work', broken: 'Does not work', other: 'Something else' };
  // the developer answers the reviewer (about a waiting, sent-back or rejected version): short messages the reviewer sees next to the code
  function reply(d, b) {
    const s = subs.get(String(b.id));
    if (!s || s.githubId !== d.githubId) return { status: 404, error: 'Not found.' };
    if (!['pending', 'changes', 'rejected'].includes(s.status)) return { status: 400, error: 'You can only write to the reviewer about a waiting, sent-back or rejected version.' };
    const text = String(b.text || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 500);
    if (text.length < 2) return { status: 400, error: 'Write a short message.' };
    s.replies = s.replies || []; if (s.replies.length >= 10) return { status: 429, error: 'You have reached the limit of 10 messages for this version.' };
    s.replies.push({ text, at: now() }); s.updatedAt = now(); save('sub', s);
    return { status: 200, ok: true };
  }
  async function report(d, b, listed) {
    const id = String(b.plugin || '');
    if (!rePlug.test(id)) return { status: 400, error: 'Unknown plugin.' };
    if (!Object.prototype.hasOwnProperty.call(REASONS, b.reason)) return { status: 400, error: 'Choose a reason.' };
    if (!(await listed(id))) return { status: 404, error: 'That plugin is not in the store.' };
    let rec = reports.get(id); if (!rec) { rec = { pluginId: id, items: {} }; reports.set(id, rec); }
    const old = rec.items[d.githubId];
    if (!old && Object.keys(rec.items).length >= MAX_VOTES) return { status: 429, error: 'This plugin has reached the limit of reports.' };
    const mineToday = [...reports.values()].reduce((n, r) => n + ((r.items[d.githubId] && now() - r.items[d.githubId].at < 86400000) ? 1 : 0), 0);
    if (!old && mineToday >= 10) return { status: 429, error: 'You have sent many reports today. Please try again tomorrow.' };
    rec.items[d.githubId] = { reason: b.reason, text: clean(b.text), login: d.login, at: now(), status: 'open' };   // reporting again replaces the earlier report and opens it again
    save('rep', rec);
    return { status: 200, ok: true };
  }
  const adminReports = () => { const out = []; for (const r of reports.values()) for (const [gid, v] of Object.entries(r.items)) out.push({ plugin: r.pluginId, githubId: Number(gid), login: v.login, reason: v.reason, reasonText: REASONS[v.reason] || v.reason, text: v.text, at: v.at, status: v.status }); return out.sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.at - a.at).slice(0, 300); };
  const openReports = () => adminReports().filter((r) => r.status === 'open').length;
  function adminReportSet(plugin, githubId, status) {
    const rec = reports.get(String(plugin)), v = rec && rec.items[String(githubId)];
    if (!v) return { status: 404, error: 'Not found.' };
    if (status !== 'open' && status !== 'closed') return { status: 400, error: 'Bad request.' };
    v.status = status; save('rep', rec); return { status: 200, ok: true };
  }

  // everything this module keeps, as one file the owner can save (the free Supabase plan has no backups). No passwords or tokens exist in these records.
  const exportAll = () => ({ format: 'turbofex-devcentre-backup-1', at: now(), paused, featured: [...featured], developers: [...devs.values()], submissions: [...subs.values()], ratings: [...ratings.values()], reports: [...reports.values()] });

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
  const approvedForPull = () => [...subs.values()].filter((s) => s.status === 'approved').sort((a, b) => a.createdAt - b.createdAt).map((s) => { const d = devs.get(String(s.githubId)); return { submission: s.id, id: s.manifest.id, version: s.manifest.version, manifestRaw: s.manifestRaw, entrySource: s.entrySource, manifestSha: s.manifestSha, entrySha: s.entrySha, ...(s.readme ? { readme: s.readme, readmeSha: s.readmeSha } : {}), ...(s.changelog ? { changelog: s.changelog, changelogSha: s.changelogSha } : {}), developer: s.login, githubId: s.githubId, verified: !!(d && d.verified) }; });
  const revocationsForPull = () => [...subs.values()].filter((s) => s.revoke && !s.revoke.done).map((s) => ({ submission: s.id, id: s.manifest.id, version: s.manifest.version, reason: s.revoke.reason }));
  function markRevoked(ids) {
    let n = 0;
    for (const id of Array.isArray(ids) ? ids.slice(0, 100) : []) { const s = subs.get(String(id)); if (s && s.revoke && !s.revoke.done) { s.revoke.done = true; s.status = 'revoked'; s.updatedAt = now(); save('sub', s); n++; } }
    return n;
  }
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
      const nx = new URL(req.url, 'http://x').searchParams.get('next');   // where to land after signing in (only these two pages)
      const to = 'https://github.com/login/oauth/authorize?' + new URLSearchParams({ client_id: clientId, redirect_uri: site + '/auth/github/callback', state, allow_signup: 'false' });
      return redirect(to, [setCookie(OAUTH_COOKIE, state + '.' + mac('oauth:' + state), 600, '/auth'), setCookie('tfx_next', nx === 'plugins' ? 'plugins' : 'developers', 600, '/auth')]);
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
      return redirect(cookieOf(req, 'tfx_next') === 'plugins' ? '/plugins' : '/developers', [clear, setCookie('tfx_next', 'x', 0, '/auth'), devCookie(d)]);
    }

    if (p === '/api/dev/me' && req.method === 'GET') {
      const d = devOf(req);
      let stats; if (d && ctx.statsOf) { stats = {}; for (const s of mine(d)) if (s.status === 'published' && !stats[s.pluginId]) { const t = ctx.statsOf(s.pluginId); if (t) stats[s.pluginId] = t; } }
      return send(res, 200, d ? { configured, user: publicDev(d), submissions: mine(d), ratings: myRatings(d), ...(stats && Object.keys(stats).length ? { stats } : {}) } : { configured, user: null }), true;
    }
    if (p === '/api/plugin-reviews' && req.method === 'GET') {
      if (limited('reviews', ip, 60, 60 * 1000)) return send(res, 429, { error: 'Please wait a moment.' }), true;
      const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
      return send(res, 200, rePlug.test(id) ? { rating: ratingOf(id), reviews: reviewsOf(id) } : { rating: null, reviews: [] }), true;
    }
    if (p === '/api/dev/logout' || p === '/api/dev/submit' || p === '/api/dev/withdraw' || p === '/api/dev/rate' || p === '/api/dev/report' || p === '/api/dev/reply') {
      if (req.method !== 'POST') return send(res, 405, { error: 'Not allowed.' }), true;
      // a form on another website cannot send this header, and the cookie is SameSite=Lax: together they stop cross-site requests
      let sameSite = req.headers['x-requested-with'] === 'tfx';
      const o = req.headers.origin; if (o) { try { sameSite = sameSite && new URL(o).host === req.headers.host; } catch (err) { sameSite = false; } }
      if (!sameSite) return send(res, 403, { error: 'Blocked.' }), true;
      if (paused && p !== '/api/dev/logout' && p !== '/api/dev/withdraw') return send(res, 503, { error: 'The plugin store is paused for a little while. Please try again later.' }), true;
      if (p === '/api/dev/logout') return res.setHeader('Set-Cookie', setCookie(DEV_COOKIE, 'x', 0, '/')), send(res, 200, { ok: true }), true;
      const d = devOf(req);
      if (!d) return send(res, 401, { error: 'Please sign in with GitHub first.' }), true;
      if (limited('devpost', ip, 30, 10 * 60 * 1000)) return send(res, 429, { error: 'Please slow down a little.' }), true;
      let b; try { b = JSON.parse((await readBody(req)) || '{}') || {}; } catch (err) { return send(res, 400, { error: 'Bad request.' }), true; }
      const out = p === '/api/dev/submit' ? await submit(d, b) : p === '/api/dev/rate' ? await rate(d, b, ctx.listed || (async () => false)) : p === '/api/dev/report' ? await report(d, b, ctx.listed || (async () => false)) : p === '/api/dev/reply' ? reply(d, b) : withdraw(d, b.id);
      const { status, ...rest } = out; return send(res, status, rest), true;
    }

    if (p === '/api/registry/approved' || p === '/api/registry/published' || p === '/api/registry/backup') {
      if (!pullOn) return send(res, 404, { error: 'Not found.' }), true;
      if (limited('regpull', ip, 30, 60 * 1000)) return send(res, 429, { error: 'Too many tries.' }), true;
      if (!pullAuthorized(req)) return send(res, 401, { error: 'Not allowed.' }), true;
      if (p.endsWith('backup') && req.method === 'GET') return send(res, 200, exportAll()), true;   // same file as the admin "Download backup", for the phone command
      if (p.endsWith('approved') && req.method === 'GET') return send(res, 200, { plugins: approvedForPull(), revocations: revocationsForPull() }), true;
      if (p.endsWith('published') && req.method === 'POST') {
        let b; try { b = JSON.parse((await readBody(req)) || '{}') || {}; } catch (err) { return send(res, 400, { error: 'Bad request.' }), true; }
        return send(res, 200, { ok: true, marked: markPublished(b.ids), revoked: markRevoked(b.revoked) }), true;
      }
      return send(res, 405, { error: 'Not allowed.' }), true;
    }
    return false;
  }

  return { configured, pullOn, exportAll, isPaused: () => paused, setPaused, setFeatured, isFeatured: (id) => featured.has(id), handle, adminList, adminGet, adminReview, adminDev, adminDevs, adminRevoke, hidden, publicInfo, ratingOf, adminReviews, adminHide, adminReports, adminReportSet, openReports, _subs: subs, _devs: devs };
}

module.exports = { createDevCentre };
