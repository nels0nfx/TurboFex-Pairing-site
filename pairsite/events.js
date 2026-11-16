'use strict';
// A small activity log for the admin dashboard: one line per thing that happened (a pairing started, a code was shown, someone was
// rate limited ...). It NEVER holds a full phone number, a full internet address, a session ID or a login: only a masked number, a short
// one-way fingerprint of the number and of the visitor, and the country. Lines older than 7 days are dropped.
const fs = require('fs');
const path = require('path');

function createEvents({ dir, retentionMs = 7 * 24 * 3600 * 1000, memMax = 20000, onRecord = null }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'events.jsonl');
  let list = [];
  const keepFrom = () => Date.now() - retentionMs;

  function load() {
    let dropped = false;
    try {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line) continue;
        try { const e = JSON.parse(line); if (e && e.t >= keepFrom() && typeof e.type === 'string') list.push(e); else dropped = true; } catch (err) { dropped = true; }
      }
    } catch (err) { /* first start: no file yet */ }
    if (list.length > memMax) { list = list.slice(-memMax); dropped = true; }
    if (dropped) compact();
  }
  function compact() {
    list = list.filter((e) => e.t >= keepFrom());
    try { fs.writeFileSync(file + '.tmp', list.map((e) => JSON.stringify(e)).join('\n') + (list.length ? '\n' : ''), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); } catch (err) { /* best effort */ }
  }
  function record(type, fields = {}) {
    const e = { t: Date.now(), type, ...fields };
    list.push(e);
    if (list.length > memMax) list = list.slice(-Math.floor(memMax * 0.9));
    fs.appendFile(file, JSON.stringify(e) + '\n', { mode: 0o600 }, () => {});
    if (onRecord) { try { onRecord(e); } catch (err) { /* never break the site */ } }
    return e;
  }
  const since = (ms) => { const from = Date.now() - ms; let i = list.length; while (i > 0 && list[i - 1].t >= from) i--; return list.slice(i); };
  load();
  const timer = setInterval(compact, 3600 * 1000); timer.unref();
  return { record, since, all: () => list, first: () => (list[0] ? list[0].t : null), close: () => clearInterval(timer) };
}
module.exports = { createEvents };
