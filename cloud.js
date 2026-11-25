'use strict';
// Optional permanent storage in Supabase, so the admin data survives a restart of the (free) host.
// It keeps a copy of three things: the saved state (blocks, settings, announcements), the activity log and the audit log.
// It NEVER receives session IDs, pairing codes, sessions or full numbers: only what the dashboard already shows masked.
// Writes are queued and retried; every activity line and audit line carries a unique key (eid / h), so a retry can never store one twice,
// and one bad row can never block the rows behind it. Saving a setting can also wait for the database (persistState) and say honestly if it did not arrive.
// It talks to Supabase's REST interface with plain fetch (no extra package). Set SUPABASE_URL and SUPABASE_SERVICE_KEY to turn it on.
const fs = require('fs');
const path = require('path');

const DAY = 24 * 3600 * 1000;
const A = require('./analytics');

function createCloud({ url, key, fetchImpl = globalThis.fetch, retentionMs = 7 * DAY, flushMs = 4000, log = (m) => console.log(m) } = {}) {
  const base = String(url || '').replace(/\/+$/, '');
  const enabled = /^https:\/\/[^/\s]+$/.test(base) && !!key && typeof fetchImpl === 'function';
  const st = { ok: null, lastOkAt: 0, lastError: '', restored: false, dropped: 0, rejected: 0 };
  // SAFETY: if the saved copy could not be read when the site started, the site starts empty. Sending that empty state up would
  // overwrite the good copy for ever, so nothing is sent until the next start can read it (held = true).
  let stateFail = false, kvFail = false;
  const isHeld = () => stateFail || kvFail;
  const HELD_MSG = 'The saved data could not be loaded the saved data at start-up, so new changes are NOT sent to Supabase (this protects the saved copy). Restart the site.';
  let evQueue = [], auQueue = [], stateDirty = null, flushing = false, stateTimer = null;
  const kvQueue = new Map();   // key -> value (the Developer Centre's records; the newest value of a key wins)

  const headers = (extra) => {
    const h = { apikey: key, 'content-type': 'application/json', ...extra };
    if (String(key).startsWith('eyJ')) h.authorization = 'Bearer ' + key;   // old-style (JWT) keys also go in Authorization; new "secret" keys do not
    return h;
  };
  async function call(method, pathAndQuery, body, extra) {
    let r;
    try {
      r = await fetchImpl(base + '/rest/v1/' + pathAndQuery, { method, headers: headers(extra), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    } catch (err) { st.ok = false; st.lastError = 'could not reach Supabase'; throw new Error(st.lastError); }
    if (!r.ok) {
      let detail = ''; try { detail = (await r.text()).slice(0, 300); } catch (e) { /* none */ }
      const err = new Error('Supabase answered ' + r.status); err.status = r.status; err.detail = detail;
      // a refused ROW (4xx) is not an outage: the connection works
      if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429 && r.status !== 401 && r.status !== 403) { st.ok = true; st.lastOkAt = Date.now(); } else { st.ok = false; st.lastError = err.message; }
      throw err;
    }
    st.ok = true; st.lastOkAt = Date.now(); st.lastError = '';
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  // ---- bring the saved data back when the site starts (before the site reads its files) ----
  // Pages are read by id (not by offset) until the database has nothing more, so nothing is left behind however many lines there are.
  async function pages(table, select, filter, cap = 2000000) {
    const out = []; let last = 0;
    while (out.length < cap) {
      const rows = await call('GET', `${table}?select=id,${select}&${filter}${filter ? '&' : ''}id=gt.${last}&order=id.asc&limit=1000`);
      if (!rows || !rows.length) break;
      out.push(...rows); last = rows[rows.length - 1].id;
      if (rows.length < 1000) break;
    }
    return out;
  }
  const lineId = (line) => 'l' + require('crypto').createHash('sha1').update(line).digest('hex').slice(0, 15);
  async function restore(dir) {
    if (!enabled) return false;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const kv = await call('GET', 'tfx_kv?select=value&key=eq.state&limit=1');
      if (kv && kv[0] && kv[0].value) fs.writeFileSync(path.join(dir, 'admin-state.json'), JSON.stringify(kv[0].value), { mode: 0o600 });
      // activity lines of the last 7 days
      const from = Date.now() - retentionMs, rows = await pages('tfx_events', 'e', `t=gte.${from}`);
      const byId = new Map(), noId = [];
      for (const r of rows) { const e = r.e; if (!e || typeof e.type !== 'string') continue; if (e.eid) byId.set(e.eid, e); else noId.push(e); }
      // lines that are only in the local file (the site stopped before they were sent) are kept and sent again; the unique key makes that safe
      let local = []; try { local = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean); } catch (err) { /* none */ }
      let requeued = 0;
      for (const line of local) { try { const e = JSON.parse(line); if (!e || typeof e.type !== 'string' || !(e.t >= from)) continue; if (!e.eid) { if (rows.length) continue; e.eid = lineId(line); } if (!byId.has(e.eid)) { byId.set(e.eid, e); pushEvent(e); requeued++; } } catch (err) { /* skipped */ } }
      const ev = [...noId, ...byId.values()].sort((a, b) => a.t - b.t).map((e) => JSON.stringify(e));
      if (ev.length) fs.writeFileSync(path.join(dir, 'events.jsonl'), ev.join('\n') + '\n', { mode: 0o600 });
      // audit lines (kept for ever so the hash chain stays valid)
      const au = (await pages('tfx_audit', 'line', '')).map((r) => JSON.stringify(r.line));
      if (au.length) fs.writeFileSync(path.join(dir, 'admin-audit.jsonl'), au.join('\n') + '\n', { mode: 0o600 });
      // daily totals (kept for ever): merged upwards with anything already on disk
      let days = new Map();
      try { for (const r of (JSON.parse(fs.readFileSync(path.join(dir, 'daily.json'), 'utf8')).days || [])) { const c = A.cleanDaily(r); if (c) days.set(c.day, c); } } catch (err) { /* none */ }
      for (let off = 0; off < 100000; off += 500) {
        const kr = await call('GET', `tfx_kv?select=key,value&key=like.daily:*&order=key.asc&limit=500&offset=${off}`);
        for (const r of kr || []) { const c = A.cleanDaily(r.value); if (c) days.set(c.day, A.mergeMax(days.get(c.day), c)); }
        if (!kr || kr.length < 500) break;
      }
      if (days.size) fs.writeFileSync(path.join(dir, 'daily.json'), JSON.stringify({ days: [...days.values()] }), { mode: 0o600 });
      st.restored = true; stateFail = false; if (!isHeld()) { st.ok = true; st.lastError = ''; }
      log(`Supabase: restored ${ev.length} activity lines, ${au.length} audit lines and ${days.size} daily records` + (requeued ? ` (${requeued} local lines sent again)` : ''));
      return true;
    } catch (err) { stateFail = true; st.ok = false; st.lastError = (st.lastError ? st.lastError + '. ' : '') + HELD_MSG; log('Supabase: could not restore (' + err.message + '); starting from local files, sending of settings and audit paused'); return false; }
  }

  // ---- records of the Developer Centre: keys that start with a prefix such as "dc:" are written back as small files (dir/<key with : as _>.json) ----
  async function restoreKv(prefix, dir) {
    if (!enabled || !/^[a-z]{1,8}:$/.test(prefix)) return 0;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      let n = 0;
      for (let off = 0; off < 20000; off += 500) {
        const rows = await call('GET', `tfx_kv?select=key,value&key=like.${encodeURIComponent(prefix)}*&order=key.asc&limit=500&offset=${off}`);
        for (const r of rows || []) {
          const name = String(r.key).slice(prefix.length).replace(/[^a-z0-9:_-]/gi, '').replace(/:/g, '_');
          if (!name || r.value == null) continue;
          fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(r.value), { mode: 0o600 }); n++;
        }
        if (!rows || rows.length < 500) break;
      }
      kvFail = false; log(`Supabase: restored ${n} developer records`);
      return n;
    } catch (err) { kvFail = true; st.ok = false; st.lastError = (st.lastError ? st.lastError + '. ' : '') + HELD_MSG; log('Supabase: could not restore developer records (' + err.message + '); sending paused'); return 0; }
  }

  // ---- send changes up (queued, so a slow or broken connection never slows the site) ----
  // Rows are taken out of a queue only after the database accepted them (by identity, so a queue that was trimmed meanwhile cannot make the wrong rows disappear).
  const EV_CAP = 100000, AU_CAP = 50000;
  const MIGRATE_MSG = 'Run tools/supabase-migrate-v3.31.sql in Supabase: until then a retried line can be stored twice.';
  const legacy = { tfx_events: false, tfx_audit: false };   // true while the new unique-key columns (tools/supabase-migrate-v3.31.sql) are not in the database yet
  const KEYCOL = { tfx_events: 'eid', tfx_audit: 'h' };
  const is4xx = (e) => e && e.status >= 400 && e.status < 500 && ![401, 403, 408, 429].includes(e.status);
  function pushEvent(e) {
    if (!enabled) return; evQueue.push({ eid: e.eid || null, t: e.t, e });
    if (evQueue.length > EV_CAP) { const n = evQueue.length - Math.floor(EV_CAP * 0.9); evQueue = evQueue.slice(n); st.dropped += n; st.lastError = 'The unsent activity queue was full: ' + st.dropped + ' lines were dropped.'; }
  }
  function pushAudit(line) {
    if (!enabled) return; auQueue.push({ h: line && line.h ? line.h : null, line });
    if (auQueue.length > AU_CAP) { const n = auQueue.length - Math.floor(AU_CAP * 0.9); auQueue = auQueue.slice(n); st.dropped += n; st.lastError = 'The unsent audit queue was full: ' + st.dropped + ' lines were dropped.'; }
  }
  function pushKv(key, value) {
    if (!enabled) return; kvQueue.set(String(key), value);
    clearTimeout(stateTimer); stateTimer = setTimeout(() => { flush().catch(() => {}); }, 500); stateTimer.unref();
  }
  const pushDaily = (rec) => { if (rec && rec.day) pushKv('daily:' + rec.day, rec); };
  let latestState = null, stateSeq = 0, stateSent = 0, chain = Promise.resolve();
  function pushState(state) {
    if (!enabled) return; latestState = state; stateDirty = state; stateSeq++;
    clearTimeout(stateTimer); stateTimer = setTimeout(() => { flush().catch(() => {}); }, 500); stateTimer.unref();
  }
  // state writes run one after another and always send the NEWEST state, so an older write can never land after a newer one
  const sendState = () => { const run = chain.then(async () => { if (!stateDirty) return; const seq = stateSeq, s = latestState; await call('POST', 'tfx_kv?on_conflict=key', { key: 'state', value: s, updated_at: new Date().toISOString() }, { Prefer: 'resolution=merge-duplicates,return=minimal' }); stateSent = seq; if (stateSeq === seq) stateDirty = null; }); chain = run.catch(() => {}); return run; };
  // For a setting the person just saved: wait until the database has it, and say honestly if it does not. { durable, reason }
  async function persistState(state) {
    if (!enabled) return { durable: false, reason: 'not_configured' };
    pushState(state);
    if (isHeld()) return { durable: false, reason: 'held' };
    try { await sendState(); return { durable: true }; } catch (err) { return { durable: false, reason: 'unreachable' }; }
  }
  async function insertRows(table, rows) {
    const col = KEYCOL[table], use = !legacy[table];
    const body = use ? rows.map((r) => ({ [col]: r[col], ...(table === 'tfx_events' ? { t: r.t, e: r.e } : { line: r.line }) })) : rows.map((r) => (table === 'tfx_events' ? { t: r.t, e: r.e } : { line: r.line }));
    try { await call('POST', use ? `${table}?on_conflict=${col}` : table, body, { Prefer: use ? 'resolution=ignore-duplicates,return=minimal' : 'return=minimal' }); }
    catch (err) {
      // the database does not have the unique-key column yet (migration not run): carry on the old way and show it on the dashboard
      if (use && is4xx(err) && /eid|"h"|column|PGRST204|42703|42P10|on_conflict/i.test(err.detail || '')) { legacy[table] = true; st.lastError = MIGRATE_MSG; return insertRows(table, rows); }
      throw err;
    }
  }
  async function drain(table, get, set, size) {
    while (get().length) {
      const part = get().slice(0, size), gone = new Set(part);
      const remove = (items) => { const s = new Set(items); set(get().filter((x) => !s.has(x))); };
      if (!part.every((r) => r[KEYCOL[table]])) for (const r of part) if (!r[KEYCOL[table]]) r[KEYCOL[table]] = table === 'tfx_events' ? lineId(JSON.stringify(r.e)) : lineId(JSON.stringify(r.line));
      try { await insertRows(table, part); remove(part); }
      catch (err) {
        if (!is4xx(err)) throw err;     // outage or timeout: everything stays queued and is tried again
        // the database refused something in this batch: find the refused row(s) so they cannot block everything behind them
        for (const r of part) { try { await insertRows(table, [r]); remove([r]); } catch (e2) { if (is4xx(e2)) { remove([r]); st.rejected++; log('Supabase refused one ' + table + ' row (' + e2.status + '); it was skipped'); } else throw e2; } }
      }
      void gone;
    }
  }
  let flushP = null;
  function flush() {
    if (!enabled) return Promise.resolve();
    if (flushP) return flushP;
    flushP = (async () => {
      try {
        // activity lines carry a unique key and only ever add rows, so they are sent even when the saved settings could not be loaded
        if (!isHeld()) {
          if (stateDirty) await sendState();
          for (const [k, v] of [...kvQueue]) { await call('POST', 'tfx_kv?on_conflict=key', { key: k, value: v, updated_at: new Date().toISOString() }, { Prefer: 'resolution=merge-duplicates,return=minimal' }); if (kvQueue.get(k) === v) kvQueue.delete(k); }
          await drain('tfx_audit', () => auQueue, (q) => { auQueue = q; }, 200);
        }
        await drain('tfx_events', () => evQueue, (q) => { evQueue = q; }, 500);
      } catch (err) { /* kept in the queue, tried again at the next tick */ } finally { flushP = null; }
    })();
    return flushP;
  }
  // Before old activity lines are deleted they are summed into daily records (kept for ever). Only whole days are ever summed and deleted.
  async function prune() {
    if (!enabled || isHeld()) return;
    try {
      const cutoff = Date.now() - retentionMs; let rows = [], last = 0, more = false;
      for (let page = 0; page < 60; page++) {
        const r = await call('GET', `tfx_events?select=id,t,e&t=lt.${cutoff}&id=gt.${last}&order=id.asc&limit=1000`);
        if (!r || !r.length) break;
        rows.push(...r); last = r[r.length - 1].id;
        if (r.length < 1000) break; if (page === 59) more = true;
      }
      if (!rows.length) return;
      let boundary = cutoff;
      if (more) { const lastDay = A.dayKey(Math.max(...rows.map((r) => r.t))); boundary = A.dayStart(lastDay); rows = rows.filter((r) => r.t < boundary); }
      const sums = A.summarize(rows.filter((r) => r.e).map((r) => ({ ...r.e, t: r.t })));
      for (const [day, rec] of Object.entries(sums)) {
        const old = await call('GET', `tfx_kv?select=value&key=eq.daily:${day}&limit=1`);
        const merged = A.mergeMax(old && old[0] && A.cleanDaily(old[0].value), rec);
        await call('POST', 'tfx_kv?on_conflict=key', { key: 'daily:' + day, value: merged, updated_at: new Date().toISOString() }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
      }
      await call('DELETE', `tfx_events?t=lt.${boundary}&id=lte.${last}`, undefined, { Prefer: 'return=minimal' });
    } catch (err) { /* later */ }
  }

  const timer = enabled ? setInterval(() => { flush(); }, flushMs) : null; if (timer) timer.unref();
  const pruneTimer = enabled ? setInterval(prune, 3600 * 1000) : null; if (pruneTimer) pruneTimer.unref();
  const status = () => ({ enabled, ok: enabled ? st.ok : null, lastOkAt: st.lastOkAt, lastError: st.lastError || ((legacy.tfx_events || legacy.tfx_audit) ? MIGRATE_MSG : ''), restored: st.restored, held: isHeld(), queued: evQueue.length + auQueue.length + kvQueue.size + (stateDirty ? 1 : 0), dropped: st.dropped, rejected: st.rejected, migrationNeeded: legacy.tfx_events || legacy.tfx_audit });
  async function close() { if (timer) clearInterval(timer); if (pruneTimer) clearInterval(pruneTimer); clearTimeout(stateTimer); await flush(); await flush(); }
  return { enabled, restore, restoreKv, pushEvent, pushAudit, pushState, pushKv, pushDaily, persistState, flush, prune, status, close };
}

const fromEnv = (env) => createCloud({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY });
module.exports = { createCloud, fromEnv };
