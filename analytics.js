'use strict';
// Statistics worked out from stored events. Everything is in UTC so the numbers do not change with the server's or the viewer's time zone.
// A "daily" record is a small summary of one UTC day (counts only, no visitor or number identifiers). Daily records are kept for ever
// (events themselves are kept 7 days) and are only ever merged upwards (mergeMax), so a restart that loaded fewer events can never shrink them.
const HOUR = 3600 * 1000, DAY = 24 * HOUR;
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const dayStart = (key) => Date.parse(key + 'T00:00:00.000Z');
const hourStart = (t) => Math.floor(t / HOUR) * HOUR;

// Event definitions (what each one means; recorded only after the server knows it is true):
//  site.visit      a person opened a page (once per visitor per 10 minutes; bots and health checks are not counted)
//  pair.start      the server accepted a request and began a pairing attempt (invalid, limited, blocked or busy requests are NOT starts)
//  pair.code       WhatsApp returned a pairing code for an attempt        pair.qr   WhatsApp returned a QR for an attempt
//  pair.linked     WhatsApp confirmed the account AND the login was saved  pair.failed  the attempt ended with an error or time-out
//  pair.cancelled  the attempt was ended by the visitor, replaced by a new one, or stopped by an admin (pair.stopped is the admin case)
//  pair.invalid / pair.limited / pair.blocked / pair.busy / pair.maintenance   the request was refused before an attempt began
//  session.fetch   a bot asked for a session ID: ok=true only when the login was actually sent; ok=false with a detail otherwise
function emptyDay(day) {
  return { day, visits: 0, visitors: 0, attempts: 0, codes: 0, qrs: 0, linked: 0, failed: 0, cancelled: 0, limited: 0, blocked: 0, invalid: 0, busy: 0, maintenance: 0,
    fetchOk: 0, fetchBad: 0, fetchLimited: 0, methods: { code: 0, qr: 0 }, countries: {}, hours: { attempts: Array(24).fill(0), linked: Array(24).fill(0), failed: Array(24).fill(0) } };
}
function summarize(events) {   // -> { 'YYYY-MM-DD': dailyRecord }
  const days = {}, seen = {};
  for (const e of events) {
    if (!e || typeof e.type !== 'string' || !Number.isFinite(e.t) || e.type.startsWith('admin.')) continue;
    const k = dayKey(e.t), d = days[k] || (days[k] = emptyDay(k)), hr = new Date(e.t).getUTCHours();
    if (e.client && (e.type === 'site.visit' || e.type.startsWith('pair.'))) (seen[k] || (seen[k] = new Set())).add(e.client);
    switch (e.type) {
      case 'site.visit': d.visits++; break;
      case 'pair.start': d.attempts++; d.hours.attempts[hr]++; if (e.method === 'qr') d.methods.qr++; else d.methods.code++; if (e.country) d.countries[e.country] = (d.countries[e.country] || 0) + 1; break;
      case 'pair.code': d.codes++; break;
      case 'pair.qr': d.qrs++; break;
      case 'pair.linked': d.linked++; d.hours.linked[hr]++; break;
      case 'pair.failed': d.failed++; d.hours.failed[hr]++; break;
      case 'pair.cancelled': case 'pair.stopped': d.cancelled++; break;
      case 'pair.limited': d.limited++; break;
      case 'pair.blocked': d.blocked++; break;
      case 'pair.invalid': d.invalid++; break;
      case 'pair.busy': d.busy++; break;
      case 'pair.maintenance': d.maintenance++; break;
      case 'session.fetch': if (e.ok) d.fetchOk++; else if (e.detail === 'rate_limited') d.fetchLimited++; else d.fetchBad++; break;
      default: break;
    }
  }
  for (const k of Object.keys(days)) days[k].visitors = seen[k] ? seen[k].size : 0;
  return days;
}
function mergeMax(a, b) {   // never lowers a number: the result is at least as large as either record
  if (!a) return b; if (!b) return a;
  const out = JSON.parse(JSON.stringify(a));
  const m = (x, y) => (typeof x === 'number' || typeof y === 'number' ? Math.max(x || 0, y || 0) : x);
  for (const k of Object.keys(b)) {
    if (k === 'day') continue;
    if (Array.isArray(b[k])) out[k] = b[k].map((v, i) => m((a[k] || [])[i], v));
    else if (b[k] && typeof b[k] === 'object') { out[k] = out[k] || {}; for (const kk of Object.keys(b[k])) out[k][kk] = Array.isArray(b[k][kk]) ? b[k][kk].map((v, i) => m(((a[k] || {})[kk] || [])[i], v)) : m((a[k] || {})[kk], b[k][kk]); }
    else out[k] = m(a[k], b[k]);
  }
  return out;
}
const cleanDaily = (r) => (r && typeof r === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String(r.day)) ? mergeMax(emptyDay(r.day), r) : null);
// adds up a list of daily records into one set of totals
function total(list) {
  const t = { visits: 0, visitors: 0, attempts: 0, codes: 0, qrs: 0, linked: 0, failed: 0, cancelled: 0, limited: 0, blocked: 0, invalid: 0, busy: 0, maintenance: 0, fetchOk: 0, fetchBad: 0, fetchLimited: 0 };
  const methods = { code: 0, qr: 0 }, countries = {};
  for (const d of list) {
    for (const k of Object.keys(t)) t[k] += d[k] || 0;
    methods.code += (d.methods || {}).code || 0; methods.qr += (d.methods || {}).qr || 0;
    for (const [c, n] of Object.entries(d.countries || {})) countries[c] = (countries[c] || 0) + n;
  }
  // "visitors" over several days is a sum of daily unique visitors (the same person on two days counts twice): labelled that way in the API
  return { totals: t, methods, countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).map(([country, n]) => ({ country, n })), successRate: t.linked + t.failed ? Math.round((t.linked / (t.linked + t.failed)) * 1000) / 10 : null };
}
module.exports = { HOUR, DAY, dayKey, dayStart, hourStart, emptyDay, summarize, mergeMax, cleanDaily, total };
