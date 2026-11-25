'use strict';
// A small activity log for the admin dashboard: one line per thing that happened (a pairing started, a code was shown, someone was
// rate limited ...). It NEVER holds a full phone number, a full internet address, a session ID or a login: only a masked number, a short
// one-way fingerprint of the number and of the visitor, and the country. Lines older than 7 days are dropped, but before that each
// finished UTC day is summed into a small "daily" record (counts only, no identifiers) that is kept for ever (see analytics.js).
// Every line has a unique id (eid) so a line that is sent to the database twice is stored once.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const A = require('./analytics');

function createEvents({ dir, retentionMs = 7 * 24 * 3600 * 1000, memMax = 150000, onRecord = null, onDaily = null, now = () => Date.now() }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'events.jsonl'), dailyFile = path.join(dir, 'daily.json');
  let list = [], truncated = false, writeErrors = 0;
  const daily = new Map();   // 'YYYY-MM-DD' -> record
  const keepFrom = () => now() - retentionMs;
  const atomic = (f, text) => { fs.writeFileSync(f + '.tmp', text, { mode: 0o600 }); fs.renameSync(f + '.tmp', f); };

  function load() {
    let dropped = false;
    const ids = new Set();
    try {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line) continue;
        try {
          const e = JSON.parse(line);
          if (!e || typeof e.type !== 'string' || !(e.t >= keepFrom())) { dropped = true; continue; }
          if (e.eid) { if (ids.has(e.eid)) { dropped = true; continue; } ids.add(e.eid); }
          list.push(e);
        } catch (err) { dropped = true; }
      }
    } catch (err) { /* first start: no file yet */ }
    // the database hands lines back in the order they were stored; the dashboard needs them in time order
    for (let i = 1; i < list.length; i++) if (list[i].t < list[i - 1].t) { list.sort((a, b) => a.t - b.t); break; }
    if (list.length > memMax) { list = list.slice(-memMax); truncated = true; dropped = true; }
    try { for (const r of (JSON.parse(fs.readFileSync(dailyFile, 'utf8')).days || [])) { const c = A.cleanDaily(r); if (c) daily.set(c.day, c); } } catch (err) { /* none yet */ }
    rollup();
    if (dropped) compact();
  }
  function compact() {
    rollup();   // days are summed BEFORE their lines are dropped
    list = list.filter((e) => e.t >= keepFrom());
    try { atomic(file, list.map((e) => JSON.stringify(e)).join('\n') + (list.length ? '\n' : '')); } catch (err) { writeErrors++; }
  }
  function saveDaily() { try { atomic(dailyFile, JSON.stringify({ days: [...daily.values()].sort((a, b) => (a.day < b.day ? -1 : 1)) })); } catch (err) { writeErrors++; } }
  // sum every UTC day that is still in the log into its daily record. Safe to run any number of times: records only ever grow.
  function rollup() {
    const sums = A.summarize(list);
    let changed = false;
    for (const [k, rec] of Object.entries(sums)) {
      const before = daily.get(k), merged = A.mergeMax(before, rec);
      if (!before || JSON.stringify(before) !== JSON.stringify(merged)) { daily.set(k, merged); changed = true; if (onDaily) { try { onDaily(merged); } catch (err) { /* never break the site */ } } }
    }
    if (changed) saveDaily();
  }
  // used when the saved copy is read back from the database: merged upwards, never replacing
  function mergeDaily(rec) { const c = A.cleanDaily(rec); if (!c) return; daily.set(c.day, A.mergeMax(daily.get(c.day), c)); }
  function record(type, fields = {}) {
    const e = { eid: crypto.randomBytes(8).toString('hex'), t: now(), type, ...fields };
    list.push(e);
    if (list.length > memMax) { list = list.slice(-Math.floor(memMax * 0.9)); truncated = true; }
    fs.appendFile(file, JSON.stringify(e) + '\n', { mode: 0o600 }, (err) => { if (err) writeErrors++; });
    if (onRecord) { try { onRecord(e); } catch (err) { /* never break the site */ } }
    return e;
  }
  const since = (ms) => { const from = now() - ms; let i = list.length; while (i > 0 && list[i - 1].t >= from) i--; return list.slice(i); };
  load();
  const timer = setInterval(compact, 3600 * 1000); timer.unref();
  return { record, since, all: () => list, first: () => (list[0] ? list[0].t : null), dailies: () => [...daily.values()].sort((a, b) => (a.day < b.day ? -1 : 1)), mergeDaily, rollup, stats: () => ({ truncated, writeErrors, lines: list.length, days: daily.size }), close: () => clearInterval(timer) };
}
module.exports = { createEvents };
