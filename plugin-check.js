const BUILTIN = new Set((() => { try { return require('./builtin-commands.json'); } catch (e) { return []; } })());
// Checks a submitted plugin (the manifest text and the plugin file) before a human reviews it. These are the SAME rules the bot applies
// when it installs a plugin (core/plugins/manifest.js in the bot): keep the two in step. Passing this check never means "safe": it
// only means the plugin is well formed. A person still reads the code before anything is published.
const crypto = require('crypto');
const { PERMS } = require('./registry');

const PERMISSIONS = Object.keys(PERMS);
const EVENTS = { message: 'events.message', 'member.join': 'events.members', 'member.leave': 'events.members' };
const WHO = ['everyone', 'admin', 'owner'];
const reKey = /^[a-z][a-z0-9]{1,19}$/, SETTING_TYPES = ['text', 'number', 'toggle', 'choice'];
const reId = /^[a-z0-9-]{3,32}$/, reCmd = /^[a-z0-9]{2,20}$/, reSemver = /^\d+\.\d+\.\d+$/;
const reHost = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const MAX_ENTRY = 1024 * 1024;
const RANK = { low: 1, medium: 2, high: 3 };

function checkPlugin(manifestRaw, entrySource) {
  const errors = []; const bad = (m) => errors.push(m);
  if (typeof manifestRaw !== 'string' || manifestRaw.length > 64 * 1024) return { ok: false, errors: ['turbofex-plugin.json is missing or too big'] };
  let m; try { m = JSON.parse(manifestRaw); } catch (e) { return { ok: false, errors: ['turbofex-plugin.json is not valid JSON'] }; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, errors: ['turbofex-plugin.json must be an object'] };
  if (m.manifestVersion !== 1) bad('manifestVersion must be 1');
  if (typeof m.id !== 'string' || !reId.test(m.id)) bad('id must be 3-32 characters: lowercase letters, numbers and dashes');
  if (typeof m.version !== 'string' || !reSemver.test(m.version)) bad('version must look like 1.0.0');
  if (m.apiVersion !== 1) bad('apiVersion must be 1');
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 40) bad('name is required (up to 40 characters)');
  if (typeof m.description !== 'string' || !m.description.trim() || m.description.length > 200) bad('description is required (up to 200 characters)');
  if (!m.author || typeof m.author.name !== 'string' || !m.author.name.trim() || m.author.name.length > 60) bad('author.name is required');
  if (m.pricing !== undefined && !(m.pricing && m.pricing.model === 'free')) bad('only free plugins are supported');
  const perms = Array.isArray(m.permissions) ? m.permissions : (m.permissions === undefined ? [] : null);
  if (perms === null) bad('permissions must be a list');
  else { for (const p of perms) if (!PERMISSIONS.includes(p)) bad('unknown permission: ' + String(p).slice(0, 30)); if (new Set(perms).size !== perms.length) bad('permissions are listed twice'); }
  const events = Array.isArray(m.events) ? m.events : (m.events === undefined ? [] : null);
  if (events === null) bad('events must be a list');
  for (const ev of events || []) { if (typeof ev !== 'string' || !EVENTS[ev]) bad('unknown event: ' + String(ev).slice(0, 30)); else if (!perms || !perms.includes(EVENTS[ev])) bad('the event ' + ev + ' needs the permission ' + EVENTS[ev]); }
  const domains = m.network && Array.isArray(m.network.domains) ? m.network.domains : [];
  if (perms && perms.includes('network')) { if (!domains.length || domains.length > 10) bad('network needs 1-10 domains in network.domains'); for (const d of domains) if (typeof d !== 'string' || !reHost.test(d)) bad('bad domain: ' + String(d).slice(0, 40)); }
  else if (domains.length) bad('network.domains needs the network permission');
  const names = new Set(); const cmds = Array.isArray(m.commands) ? m.commands : [];
  if (m.commands !== undefined && !Array.isArray(m.commands)) bad('commands must be a list');
  if (cmds.length > 20) bad('too many commands (up to 20)');
  for (const c of cmds.slice(0, 20)) {
    if (!c || typeof c !== 'object') { bad('a command entry is not valid'); continue; }
    for (const n of [c.name, ...(Array.isArray(c.aliases) ? c.aliases : [])]) { if (typeof n !== 'string' || !reCmd.test(n)) { bad('bad command name: ' + String(n).slice(0, 20)); continue; } if (BUILTIN.has(n)) bad('command name "' + n + '" is already a TurboFex command; choose another'); if (names.has(n)) bad('command name used twice: ' + n); names.add(n); }
    if (!WHO.includes(c.who)) bad('command ' + c.name + ': who must be everyone, admin or owner');
    if (typeof c.description !== 'string' || !c.description.trim() || c.description.length > 120) bad('command ' + c.name + ': description is required (up to 120 characters)');
  }
  // settings: options the owner can change with `.plugin option` (the bot builds the screens, the plugin has no settings code). Keep in step with the pair site's plugin-check.js
  const setts = Array.isArray(m.settings) ? m.settings : [];
  if (m.settings !== undefined && !Array.isArray(m.settings)) bad('settings must be a list');
  if (setts.length > 10) bad('too many settings (up to 10)');
  const outSetts = []; const seenKeys = new Set();
  for (const t of setts.slice(0, 10)) {
    if (!t || typeof t !== 'object' || typeof t.key !== 'string' || !reKey.test(t.key) || seenKeys.has(t.key)) { bad('a setting needs its own key: a lowercase letter, then letters and numbers (up to 20)'); continue; }
    seenKeys.add(t.key); const k = t.key;
    if (!SETTING_TYPES.includes(t.type)) { bad('setting ' + k + ': type must be text, number, toggle or choice'); continue; }
    if (typeof t.label !== 'string' || !t.label.trim() || t.label.length > 60) bad('setting ' + k + ': label is required (up to 60 characters)');
    if (t.description !== undefined && (typeof t.description !== 'string' || t.description.length > 120)) bad('setting ' + k + ': description is too long (up to 120 characters)');
    if (t.perGroup !== undefined && typeof t.perGroup !== 'boolean') bad('setting ' + k + ': perGroup must be true or false');
    const o = { key: k, type: t.type, label: String(t.label || '').trim().slice(0, 60), description: String(t.description || '').slice(0, 120), perGroup: t.perGroup === true };
    if (t.type === 'toggle') { if (typeof t.default !== 'boolean') bad('setting ' + k + ': default must be true or false'); o.default = t.default === true; }
    else if (t.type === 'number') {
      const lo = t.min === undefined ? 0 : t.min; const hi = t.max === undefined ? 1000000 : t.max;
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi || Math.abs(lo) > 1e9 || Math.abs(hi) > 1e9) bad('setting ' + k + ': min and max are not valid');
      else if (typeof t.default !== 'number' || !Number.isFinite(t.default) || t.default < lo || t.default > hi) bad('setting ' + k + ': default must be a number between min and max');
      o.min = lo; o.max = hi; o.default = t.default;
    } else if (t.type === 'choice') {
      const opts = Array.isArray(t.options) ? t.options : [];
      if (opts.length < 2 || opts.length > 10 || opts.some((x) => typeof x !== 'string' || !x.trim() || x.length > 30) || new Set(opts.map((x) => x.toLowerCase())).size !== opts.length) bad('setting ' + k + ': options must be 2 to 10 different short texts');
      else if (typeof t.default !== 'string' || !opts.includes(t.default)) bad('setting ' + k + ': default must be one of the options');
      o.options = opts.slice(0, 10); o.default = t.default;
    } else {
      const max = t.maxLength === undefined ? 100 : t.maxLength;
      if (!Number.isInteger(max) || max < 1 || max > 200) bad('setting ' + k + ': maxLength must be 1-200');
      else if (typeof t.default !== 'string' || t.default.length > max || /[\u0000-\u001f\u007f]/.test(t.default)) bad('setting ' + k + ': default must be plain text within maxLength');
      o.maxLength = max; o.default = t.default;
    }
    outSetts.push(o);
  }
  const sched = Array.isArray(m.schedules) ? m.schedules : [];
  if (sched.length) { if (!perms || !perms.includes('schedule')) bad('schedules need the schedule permission'); for (const s of sched.slice(0, 5)) if (!s || !reCmd.test(String(s.id)) || !Number.isInteger(s.everyMinutes) || s.everyMinutes < 1 || s.everyMinutes > 10080) bad('a schedule is not valid'); if (sched.length > 5) bad('too many schedules (up to 5)'); }
  if (!cmds.length && !sched.length && !(events && events.length)) bad('the plugin needs at least one command, schedule or event');
  const entry = typeof m.entry === 'string' ? m.entry : 'index.js';
  if (!/^[\w.-]{1,80}$/.test(entry) || entry.includes('..')) bad('entry must be a file name in the plugin folder');
  if (typeof entrySource !== 'string' || !entrySource.length) bad('the plugin file ' + entry + ' is missing');
  else if (Buffer.byteLength(entrySource) > MAX_ENTRY) bad('the plugin file is bigger than 1 MB');
  if (errors.length) return { ok: false, errors: errors.slice(0, 8) };

  const flags = [];
  const src = entrySource;
  if (/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(/.test(src)) flags.push('Builds code while running (eval or Function). The sandbox blocks most of this, but look closely.');
  if (/\brequire\s*\(|\bimport\s*\(|\bprocess\b|globalThis\.constructor|__proto__|constructor\s*\.\s*constructor/.test(src)) flags.push('Tries to reach things outside the sandbox (require, import, process or the constructor chain).');
  if (/[A-Za-z0-9+/=]{2000,}/.test(src)) flags.push('Contains a very long block of encoded data.');
  if (/\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){20,}|\\u[0-9a-f]{4}(?:\\u[0-9a-f]{4}){20,}/i.test(src)) flags.push('Contains long escaped text, which can hide what the code does.');
  if ((src.match(/\n/g) || []).length < 3 && src.length > 4000) flags.push('Almost all the code is on a few lines (minified or hidden).');
  const risk = (perms || []).reduce((r, p) => (RANK[(PERMS[p] || ['medium'])[0]] > RANK[r] ? PERMS[p][0] : r), 'low');
  const manifest = { id: m.id, version: m.version, name: m.name.trim(), description: m.description.trim(), author: m.author.name.trim(), permissions: perms || [], events: events || [], domains, commands: cmds.map((c) => c.name), entry };
  return { ok: true, errors: [], manifest, flags, risk, manifestSha: crypto.createHash('sha256').update(manifestRaw).digest('hex'), entrySha: crypto.createHash('sha256').update(entrySource).digest('hex') };
}
module.exports = { checkPlugin, MAX_ENTRY };
