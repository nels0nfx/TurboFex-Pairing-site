'use strict';
// Optional permanent storage in Supabase, so the admin data survives a restart of the (free) host.
// It keeps a copy of three things: the saved state (blocks, settings, announcements), the activity log and the audit log.
// It NEVER receives session IDs, pairing codes, sessions or full numbers: only what the dashboard already shows masked.
// Everything is best effort: if Supabase cannot be reached the site keeps working from its local files and retries later.
// It talks to Supabase's REST interface with plain fetch (no extra package). Set SUPABASE_URL and SUPABASE_SERVICE_KEY to turn it on.
const fs = require('fs');
const path = require('path');

const DAY = 24 * 3600 * 1000;

function createCloud({ url, key, fetchImpl = globalThis.fetch, retentionMs = 7 * DAY, flushMs = 4000, log = (m) => console.log(m) } = {}) {
  const base = String(url || '').replace(/\/+$/, '');
  const enabled = /^https:\/\/[^/\s]+$/.test(base) && !!key && typeof fetchImpl === 'function';
  const st = { ok: null, lastOkAt: 0, lastError: '', restored: false };
  let evQueue = [], auQueue = [], stateDirty = null, flushing = false, stateTimer = null;

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
    if (!r.ok) { st.ok = false; st.lastError = 'Supabase answered ' + r.status; throw new Error(st.lastError); }
    st.ok = true; st.lastOkAt = Date.now(); st.lastError = '';
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  // ---- bring the saved data back when the site starts (before the site reads its files) ----
  async function restore(dir) {
    if (!enabled) return false;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const kv = await call('GET', 'tfx_kv?select=value&key=eq.state&limit=1');
      if (kv && kv[0] && kv[0].value) fs.writeFileSync(path.join(dir, 'admin-state.json'), JSON.stringify(kv[0].value), { mode: 0o600 });
      const from = Date.now() - retentionMs, ev = [];
      for (let off = 0; off < 30000; off += 1000) {
        const rows = await call('GET', `tfx_events?select=e&t=gte.${from}&order=t.asc,id.asc&limit=1000&offset=${off}`);
        for (const r of rows || []) ev.push(JSON.stringify(r.e));
        if (!rows || rows.length < 1000) break;
      }
      if (ev.length) fs.writeFileSync(path.join(dir, 'events.jsonl'), ev.join('\n') + '\n', { mode: 0o600 });
      const au = [];
      for (let off = 0; off < 50000; off += 1000) {
        const rows = await call('GET', `tfx_audit?select=line&order=id.asc&limit=1000&offset=${off}`);
        for (const r of rows || []) au.push(JSON.stringify(r.line));
        if (!rows || rows.length < 1000) break;
      }
      if (au.length) fs.writeFileSync(path.join(dir, 'admin-audit.jsonl'), au.join('\n') + '\n', { mode: 0o600 });
      st.restored = true;
      log(`Supabase: restored ${ev.length} activity lines and ${au.length} audit lines`);
      return true;
    } catch (err) { log('Supabase: could not restore (' + err.message + '); starting from local files'); return false; }
  }

  // ---- send changes up (queued, so a slow or broken connection never slows the site) ----
  function pushEvent(e) { if (!enabled) return; evQueue.push({ t: e.t, e }); if (evQueue.length > 5000) evQueue = evQueue.slice(-4000); }
  function pushAudit(line) { if (!enabled) return; auQueue.push({ line }); if (auQueue.length > 5000) auQueue = auQueue.slice(-4000); }
  function pushState(state) {
    if (!enabled) return; stateDirty = state;
    clearTimeout(stateTimer); stateTimer = setTimeout(() => { flush().catch(() => {}); }, 500); stateTimer.unref();
  }
  async function flush() {
    if (!enabled || flushing) return; flushing = true;
    try {
      if (stateDirty) { const s = stateDirty; await call('POST', 'tfx_kv?on_conflict=key', { key: 'state', value: s, updated_at: new Date().toISOString() }, { Prefer: 'resolution=merge-duplicates,return=minimal' }); if (stateDirty === s) stateDirty = null; }
      while (auQueue.length) { const part = auQueue.slice(0, 200); await call('POST', 'tfx_audit', part, { Prefer: 'return=minimal' }); auQueue = auQueue.slice(part.length); }
      while (evQueue.length) { const part = evQueue.slice(0, 500); await call('POST', 'tfx_events', part, { Prefer: 'return=minimal' }); evQueue = evQueue.slice(part.length); }
    } catch (err) { /* kept in the queue, tried again at the next tick */ } finally { flushing = false; }
  }
  async function prune() { if (!enabled) return; try { await call('DELETE', `tfx_events?t=lt.${Date.now() - retentionMs}`, undefined, { Prefer: 'return=minimal' }); } catch (err) { /* later */ } }

  const timer = enabled ? setInterval(() => { flush(); }, flushMs) : null; if (timer) timer.unref();
  const pruneTimer = enabled ? setInterval(prune, 3600 * 1000) : null; if (pruneTimer) pruneTimer.unref();
  const status = () => ({ enabled, ok: enabled ? st.ok : null, lastOkAt: st.lastOkAt, lastError: st.lastError, restored: st.restored, queued: evQueue.length + auQueue.length + (stateDirty ? 1 : 0) });
  async function close() { if (timer) clearInterval(timer); if (pruneTimer) clearInterval(pruneTimer); clearTimeout(stateTimer); await flush(); }
  return { enabled, restore, pushEvent, pushAudit, pushState, flush, status, close };
}

const fromEnv = (env) => createCloud({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY });
module.exports = { createCloud, fromEnv };
