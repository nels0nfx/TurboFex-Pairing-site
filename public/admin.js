// TurboFex admin dashboard (browser side). It only DISPLAYS what the server returns and sends requests back; the server decides who may do what.
// Everything from the server is written with textContent (never innerHTML), so nothing a visitor typed can run as code.
(function () {
  'use strict';
  var root = document.documentElement, $ = function (id) { return document.getElementById(id); };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var me = null, csrf = '', tab = 'overview', timer = 0, ticket = '', busy = false;

  // ---------- tiny DOM helper ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) { var v = attrs[k]; if (v === null || v === undefined || v === false) continue; if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) c.forEach(function (x) { add(el, x); }); else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); }
  function svg(tag, attrs) { var el = document.createElementNS(SVGNS, tag); for (var k in attrs) el.setAttribute(k, attrs[k]); for (var i = 2; i < arguments.length; i++) if (arguments[i]) el.appendChild(arguments[i]); return el; }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  // ---------- formatting ----------
  function ago(t) { var s = Math.max(0, Math.round((Date.now() - t) / 1000)); if (s < 5) return 'just now'; if (s < 60) return s + 's ago'; if (s < 3600) return Math.round(s / 60) + 'm ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago'; }
  function when(t) { try { return new Date(t).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (e) { return String(t); } }
  function dur(s) { s = Math.round(s); var d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? d + 'd ' + hh + 'h' : hh ? hh + 'h ' + m + 'm' : m ? m + 'm ' + (s % 60) + 's' : s + 's'; }
  function mb(b) { return b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : (b / 1048576).toFixed(b >= 104857600 ? 0 : 1) + ' MB'; }
  function pct(n) { return (Math.round(n * 10) / 10) + '%'; }
  var NAMES = { 'pair.start': 'Pairing started', 'pair.code': 'Code shown', 'pair.qr': 'QR shown', 'pair.linked': 'Linked', 'pair.failed': 'Failed', 'pair.limited': 'Rate limited', 'pair.blocked': 'Blocked', 'pair.invalid': 'Invalid number', 'pair.maintenance': 'Paused (maintenance)', 'pair.stopped': 'Stopped by admin', 'session.fetch': 'Session ID used', 'session.revoked': 'ID revoked' };

  // ---------- talking to the server ----------
  function api(method, url, body) {
    var o = { method: method, credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (method !== 'GET') { o.headers['content-type'] = 'application/json'; o.headers['x-csrf-token'] = csrf; o.body = JSON.stringify(body || {}); }
    return fetch('/admin/api/' + url, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && url !== 'login' && url !== '2fa') { showLogin(me ? 'Your session ended. Please sign in again.' : ''); throw new Error('signed out'); }
        if (!r.ok) { var e = new Error(j.error || 'Something went wrong.'); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  var toastT = 0;
  function toast(msg, bad) { var t = $('toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3800); }
  function fail(e) { if (e && e.message !== 'signed out') toast(e.message || 'Something went wrong.', true); }
  function can(p) { return !!me && me.perms.indexOf(p) >= 0; }
  function act(btn, fn, okMsg, after) {
    if (btn.disabled) return; btn.disabled = true;
    fn().then(function () { if (okMsg) toast(okMsg); if (after) after(); }, fail).then(function () { btn.disabled = false; });
  }

  // ---------- sign in ----------
  function showLogin(msg) {
    me = null; csrf = ''; ticket = ''; clearInterval(timer);
    $('app').hidden = true; $('login').hidden = false;
    $('p').value = ''; $('c').value = ''; $('lg-err').textContent = msg || '';
    setTimeout(function () { $('u').focus(); }, 50);
  }
  function finishLogin() {
    // send the form once for real into a hidden frame: that is what makes phone browsers offer to save the password
    var f = $('f-login'), fr = $('tfxframe'), done = false;
    function go() { if (done) return; done = true; $('p').value = ''; $('c').value = ''; start().catch(function () {}); }
    fr.addEventListener('load', go, { once: true }); setTimeout(go, 900);
    try { f.submit(); } catch (e) { go(); }
  }
  $('f-login').addEventListener('submit', function (e) {
    e.preventDefault(); var b = $('b-login'); if (b.disabled) return; b.disabled = true; $('lg-err').textContent = '';
    var code = $('c').value.replace(/\s/g, '');
    api('POST', 'login', { user: $('u').value, password: $('p').value }).then(function (j) {
      if (j.trusted) return finishLogin();
      if (!code) { ticket = j.ticket; $('lg-err').textContent = 'Enter the 6-digit code from your authenticator app, then press Sign in again.'; $('c').focus(); return null; }
      return api('POST', '2fa', { ticket: j.ticket, code: code, trust: $('trust').checked }).then(function () { finishLogin(); });
    }).catch(function (er) { $('lg-err').textContent = er.message; if (/code is not right/.test(er.message)) { $('c').value = ''; $('c').focus(); } }).then(function () { b.disabled = false; });
  });
  $('out').addEventListener('click', function () { confirmThen('Sign out of the admin dashboard?', function () { api('POST', 'logout').then(function () { showLogin('You are signed out.'); }, function () { showLogin(); }); }, 'Sign out'); });

  // ---------- theme button ----------
  $('theme').addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.classList.add('switching'); root.setAttribute('data-theme', next); setTimeout(function () { root.classList.remove('switching'); }, 120);
    try { localStorage.setItem('tfx-theme', next); } catch (e) { /* not saved */ }
  });

  // ---------- navigation ----------
  var ICON = {
    overview: 'M4 13h6V4H4zM14 20h6V4h-6zM4 20h6v-3H4z', pairing: 'M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1',
    visitors: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 20c1-4 4-5 8-5s7 1 8 5', security: 'M12 3l7 3v5c0 4.500-3 8-7 10-4-2-7-5.500-7-10V6z', server: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
    activity: 'M3 12h4l3-8 4 16 3-8h4', audit: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5', announce: 'M4 10v4h3l7 4V6L7 10zM17 9a4 4 0 0 1 0 6', plugins: 'M9 3v3M15 3v3M8 6h8a1 1 0 0 1 1 1v4a5 5 0 0 1-10 0V7a1 1 0 0 1 1-1zM12 16v5', settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1-1-2h-4l-1 2-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1 1 2h4l1-2 2-1 2 1 2-4-2-1z' };
  var TABS = [
    ['overview', 'Overview', null], ['pairing', 'Pairing', null], ['visitors', 'Visitors', null], ['security', 'Security', null], ['server', 'Server', null],
    ['activity', 'Activity', null], ['audit', 'Audit log', 'audit.view'], ['announce', 'Announcements', null], ['plugins', 'Plugins', 'plugins.review'], ['settings', 'Settings', null],
  ];
  var alertCount = 0;
  function drawNav() {
    drawBar();
    var nav = clear($('nav'));
    TABS.forEach(function (t) {
      if (t[2] && !can(t[2])) return;
      var b = h('button', { type: 'button', role: 'tab', id: 'tab-' + t[0], 'aria-selected': t[0] === tab ? 'true' : 'false', onclick: function () { go(t[0]); } },
        svg('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': 'true' }, svg('path', { d: ICON[t[0]], fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })),
        t[1], t[0] === 'security' && alertCount ? h('span', { class: 'n', text: alertCount }) : null);
      nav.appendChild(b);
    });
  }
  function icon(name, size) { return svg('svg', { viewBox: '0 0 24 24', width: size || 22, height: size || 22, 'aria-hidden': 'true' }, svg('path', { d: ICON[name], fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })); }
  function drawBar() { var n = $('menu-n'); n.hidden = !alertCount; n.textContent = alertCount ? String(alertCount) : ''; }
  // phones: one menu button at the top (a bottom bar collides with the phone browser's own bottom toolbar)
  function openMenu() {
    var prev = document.activeElement, list = h('div', { class: 'amenu-l' });
    var bg = h('div', { class: 'modal-bg amenu-bg' }, h('div', { class: 'amenu', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sections' }, list));
    function close() { bg.remove(); document.removeEventListener('keydown', key); try { if (prev && prev.focus) prev.focus(); } catch (e) { /* fine */ } }
    function key(e) { if (e.key === 'Escape') close(); }
    TABS.forEach(function (t) {
      if (t[2] && !can(t[2])) return;
      list.appendChild(h('button', { type: 'button', id: 'm-' + t[0], 'aria-current': t[0] === tab ? 'page' : 'false', onclick: function () { close(); go(t[0]); } }, icon(t[0], 22), h('span', { text: t[1] }), t[0] === 'security' && alertCount ? h('i', { class: 'n', text: alertCount }) : null));
    });
    list.appendChild(h('span', { class: 'amenu-h', text: 'TurboFex site' }));
    [['Pairing page', '/'], ['Marketplace', '/plugins'], ['Developer Centre', '/developers'], ['Plugin guide', '/plugin-guide'], ['Playground', '/playground']].forEach(function (l) { list.appendChild(h('a', { href: l[1], text: l[0] })); });
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    document.addEventListener('keydown', key); document.body.appendChild(bg); var cur = list.querySelector('[aria-current=page]') || list.querySelector('button'); if (cur) cur.focus();
  }
  $('menu').addEventListener('click', openMenu);
  function go(t) {
    if (!VIEWS[t]) return;
    tab = t; try { history.replaceState(null, '', '#' + t); } catch (e) { /* fine */ }
    drawNav(); load(true); window.scrollTo(0, 0);
    var sel = $('tab-' + t); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  window.addEventListener('hashchange', function () { var t = location.hash.slice(1); if (me && t !== tab && VIEWS[t]) go(t); });
  var VIEWS = { overview: vOverview, pairing: vPairing, visitors: vVisitors, security: vSecurity, server: vServer, activity: vActivity, audit: vAudit, announce: vAnnounce, plugins: vPlugins, settings: vSettings };
  var REFRESH = { overview: 15000, pairing: 5000, visitors: 20000, security: 15000, server: 5000, activity: 8000, audit: 0, announce: 0, plugins: 0, settings: 0 };
  var state = { visitors: { days: 1, kind: 'clients' }, activity: { type: '' }, plug: { open: '' } };

  var lastLoad = 0;
  function skeleton() { return h('div', { class: 'askel', 'aria-label': 'Loading' }, h('i', { class: 'sk t' }), h('i', { class: 'sk s' }), h('div', { class: 'sk-g' }, h('i', { class: 'sk k' }), h('i', { class: 'sk k' }), h('i', { class: 'sk k' }), h('i', { class: 'sk k' })), h('i', { class: 'sk p' })); }
  function liveBadge() {
    if (!REFRESH[tab]) return null;
    var t = h('span', { class: 'lt', text: 'Live' });
    var b = h('button', { type: 'button', class: 'live', 'aria-label': 'Refresh now', onclick: function () { b.classList.add('spin'); load(false).then(function () { b.classList.remove('spin'); }); } }, h('i', { class: 'dot' }), t);
    b._t = t; return b;
  }
  setInterval(function () { var l = document.querySelector('.live .lt'); if (l && lastLoad) { var sec = Math.round((Date.now() - lastLoad) / 1000); l.textContent = sec < 4 ? 'Live' : 'Updated ' + sec + 's ago'; } }, 1000);
  function load(first) {
    var v = $('view'), t = tab;
    if (first) { clear(v); v.appendChild(skeleton()); }
    return VIEWS[t]().then(function (node) {
      if (t !== tab) return;
      lastLoad = Date.now(); var keep = window.scrollY; clear(v); node.classList.add(first ? 'enter' : 'same'); v.appendChild(node); if (!first) window.scrollTo(0, keep);
    }, function (e) { if (t === tab && first) { clear(v); v.appendChild(h('p', { class: 'empty', text: (e && e.message) || 'Could not load.' })); } fail(e); });
  }
  function schedule() {
    clearInterval(timer);
    timer = setInterval(function () {
      if (document.hidden || !me) return;
      var ae = document.activeElement;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && $('view').contains(ae)) return;   // never redraw while someone is typing
      if (REFRESH[tab]) load(false);
      pollAlerts();
    }, 5000);
  }
  // an alert counts as unread until the Security tab has shown it; it becomes unread again if more events join it
  function seenMap() { try { return JSON.parse(localStorage.getItem('tfx-adm-seen') || '{}') || {}; } catch (e) { return {}; } }
  function setAlerts(list, markSeen) {
    var m = seenMap(), unread = 0;
    if (markSeen) { m = {}; list.forEach(function (a) { m[a.id] = a.count; }); try { localStorage.setItem('tfx-adm-seen', JSON.stringify(m)); } catch (e) { /* not saved */ } }
    else list.forEach(function (a) { if (!(m[a.id] >= a.count)) unread++; });
    if (unread !== alertCount) { alertCount = unread; drawNav(); }
  }
  function pollAlerts() { api('GET', 'security').then(function (j) { setAlerts(j.alerts, tab === 'security'); }, function () {}); }

  // ---------- pieces ----------
  function head(title, sub, right) { return h('div', { class: 'vh' }, h('div', { class: 'vt' }, h('h2', { text: title }), sub ? h('div', { class: 'sub', text: sub }) : null), h('div', { class: 'avr' }, right || null, liveBadge())); }
  function stat(label, value, note, cls) { return h('div', { class: 'kpi ' + (cls || '') }, h('small', { text: label }), h('b', { text: value }), note ? h('em', { text: note }) : null); }
  function panel(title, small) { var p = h('section', { class: 'pnl' }); if (title) p.appendChild(h('h3', null, title, small ? h('small', { text: small }) : null)); for (var i = 2; i < arguments.length; i++) add(p, arguments[i]); return p; }
  function table(cols, rows, empty, widths) {
    if (!rows.length) return h('p', { class: 'empty', text: empty });
    var style = widths; // grid columns, set through a class list below (no inline styles allowed): rows use the --cols custom property via CSS rule
    var t = h('div', { class: 'tbl', role: 'table' });
    var hd = h('div', { class: 'th', role: 'row' }); cols.forEach(function (c) { hd.appendChild(h('div', { role: 'columnheader', text: c })); }); t.appendChild(hd);
    rows.forEach(function (r) { t.appendChild(r); });
    t.classList.add('c' + cols.length); void style;
    return t;
  }
  function row(cells, actions) {
    var r = h('div', { class: 'tr', role: 'row' });
    cells.forEach(function (c, i) {
      var st = i > 0 && c.node && /^(Status|State|Event|Action)$/.test(c.l);                       // shown in the card's corner on phones
      var zero = i > 0 && !c.node && /^(0|—|-|0 \/ 0|)$/.test(String(c.v == null ? '' : c.v).trim());   // nothing to say: hidden on phones
      r.appendChild(h('div', { class: 'td' + (c.mono ? ' mono' : '') + (st ? ' st' : '') + (zero ? ' z' : ''), 'data-l': c.l, role: 'cell' }, c.node || c.v));
    });
    r.appendChild(h('div', { class: 'td act' }, actions || null));
    return r;
  }
  function meter(label, value, text, max) { var p = Math.max(0, Math.min(100, max ? value / max * 100 : value)); return h('div', { class: 'meter' }, h('div', { class: 'mh' }, h('span', { text: label }), h('span', { text: text })), svg('svg', { viewBox: '0 0 100 10', preserveAspectRatio: 'none', role: 'img', 'aria-label': label + ' ' + text }, svg('rect', { class: 'track', x: 0, y: 0, width: 100, height: 10, rx: 5 }), svg('rect', { class: 'fill' + (p > 85 ? ' high' : ''), x: 0, y: 0, width: Math.max(1.5, p), height: 10, rx: 5 }))); }
  // round gauge: ring + percent in the middle + a line of plain numbers under it
  function gauge(label, ratio, caption, shared) {
    var p = Math.max(0, Math.min(100, ratio * 100)), R = 38, C = 2 * Math.PI * R, lvl = p >= 90 ? 'bad' : p >= 70 ? 'warn' : 'ok';
    if (shared && p < 97) lvl = 'ok';   // the machine is shared with other programs: its fullness is not an alarm for this site
    var ring = svg('svg', { viewBox: '0 0 100 100', class: 'gring', role: 'img', 'aria-label': label + ' ' + Math.round(p) + ' percent' },
      svg('circle', { class: 'rt', cx: 50, cy: 50, r: R, fill: 'none', 'stroke-width': 10 }),
      svg('circle', { class: 'rf ' + lvl, cx: 50, cy: 50, r: R, fill: 'none', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': (C * p / 100).toFixed(1) + ' ' + C.toFixed(1), transform: 'rotate(-90 50 50)' }));
    return h('div', { class: 'gauge' }, h('div', { class: 'gr' }, ring, h('b', { class: 'gp', text: (p < 10 ? p.toFixed(1) : String(Math.round(p))) + '%' })), h('div', { class: 'gl', text: label }), h('div', { class: 'gc', text: caption }));
  }
  function bars(series, a, b) {
    if (!series.some(function (x) { return x[a] || x[b]; })) return h('p', { class: 'empty', text: 'No pairing attempts in the last 24 hours.' });
    var W = 320, H = 110, pad = 16, max = Math.max.apply(null, series.map(function (s) { return Math.max(s[a], s[b]); }).concat([1]));
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + (H + 16), class: 'chart', role: 'img', 'aria-label': 'Pairing attempts and linked accounts per hour, last 24 hours' });
    var bw = (W - pad) / series.length;
    g.appendChild(svg('line', { class: 'axis', x1: 0, y1: H, x2: W, y2: H }));
    series.forEach(function (s, i) {
      var x = pad / 2 + i * bw, ha = s[a] / max * (H - 8), hb = s[b] / max * (H - 8);
      if (s[a]) g.appendChild(svg('rect', { class: 'abar', x: x + 1, y: H - ha, width: Math.max(2, bw - 3), height: ha, rx: 2 }));
      if (s[b]) g.appendChild(svg('rect', { class: 'bar2', x: x + 1, y: H - hb, width: Math.max(2, bw - 3), height: hb, rx: 2 }));
      if (i % 6 === 0) { var d = new Date(s.t); var tx = svg('text', { class: 'lbl', x: x, y: H + 12 }); tx.textContent = String(d.getHours()).padStart(2, '0') + ':00'; g.appendChild(tx); }
    });
    return g;
  }
  function spark(values, label) {
    var W = 320, H = 70, max = Math.max.apply(null, values.concat([1])), n = values.length;
    var pts = values.map(function (v, i) { return [n > 1 ? i / (n - 1) * W : W, H - 4 - v / max * (H - 10)]; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    return svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': label }, svg('path', { class: 'area', d: d + ' L' + W + ' ' + H + ' L0 ' + H + ' Z' }), svg('path', { class: 'line', d: d }));
  }
  // our own pop-up (the phone's built-in boxes look foreign): dlg({title, text, fields, ok, danger}, function (values) {...})
  function dlg(o, done) {
    var prev = document.activeElement, inputs = {};
    var card = h('form', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title, novalidate: 'novalidate' }, h('h2', { text: o.title }), o.text ? h('p', { text: o.text }) : null);
    (o.fields || []).forEach(function (f) {
      var inp = h('input', { id: 'dlg-' + f.name, type: f.type || 'text', value: f.value == null ? '' : f.value, placeholder: f.placeholder || '', autocomplete: 'off', inputmode: f.type === 'number' ? 'numeric' : null, min: f.type === 'number' ? '0' : null, maxlength: '120' });
      inputs[f.name] = inp; card.appendChild(h('div', { class: 'fld' }, h('label', { for: 'dlg-' + f.name, text: f.label }), inp));
    });
    var bg = h('div', { class: 'modal-bg' }, card);
    function close() { bg.remove(); document.removeEventListener('keydown', key); try { if (prev && prev.focus) prev.focus(); } catch (e) { /* fine */ } }
    function key(e) { if (e.key === 'Escape') close(); }
    card.appendChild(h('div', { class: 'dlg-b' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'), h('button', { class: 'btn solid' + (o.danger ? ' danger' : ''), type: 'submit' }, o.ok || 'OK')));
    card.addEventListener('submit', function (e) { e.preventDefault(); var v = {}; Object.keys(inputs).forEach(function (k) { v[k] = inputs[k].value; }); close(); done(v); });
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    document.addEventListener('keydown', key); document.body.appendChild(bg);
    var first = card.querySelector('input'); (first || card.querySelector('button[type=submit]')).focus();
  }
  function confirmThen(msg, fn, okLabel) { dlg({ title: 'Please confirm', text: msg, ok: okLabel || 'Yes, do it', danger: true }, fn); }

  // ---------- Overview ----------
  function vOverview() {
    return Promise.all([api('GET', 'overview'), api('GET', 'settings'), api('GET', 'announcements')]).then(function (r) {
      var o = r[0], s = r[1], an = r[2].announcements.filter(function (a) { return a.active && (!a.endsAt || a.endsAt > Date.now()); });
      var t = o.totals; pollAlerts();
      var n = h('div');
      n.appendChild(head('Overview', 'Last 24 hours' + (o.since ? ' · activity recorded since ' + when(o.since) : ''), h('span', { class: 'tag ' + (o.now.maintenance ? 'bad' : 'ok'), text: o.now.maintenance ? 'Maintenance ON' : 'Site live' })));
      if (o.now.maintenance) n.appendChild(h('div', { class: 'banner' }, 'Pairing is paused for everyone (maintenance mode).'));
      // what needs a look right now: each chip opens the tab that deals with it
      var items = [];
      if (o.alerts) items.push(['Security alerts', o.alerts, 'security', 'bad']);
      if (o.now.activeAttempts) items.push(['Pairings running', o.now.activeAttempts, 'pairing', '']);
      if (o.now.liveSessionIds) items.push(['Session IDs waiting', o.now.liveSessionIds, 'pairing', '']);
      if (o.now.blocks) items.push(['Active blocks', o.now.blocks, 'visitors', '']);
      var att = h('section', { class: 'attn' }, h('div', { class: 'at' }, h('b', { text: items.length ? 'Right now' : 'All quiet' }), h('small', { text: items.length ? 'Tap one to look' : 'Nothing needs your attention' })));
      if (items.length) att.appendChild(h('div', { class: 'ac' }, items.map(function (i) { return h('button', { type: 'button', class: 'chipb ' + i[3], onclick: function () { go(i[2]); } }, h('b', { text: String(i[1]) }), h('span', { text: i[0] })); })));
      n.appendChild(att);
      n.appendChild(h('div', { class: 'ahero' },
        stat('Visitors', String(t.visitors), t.visits + ' page visits'),
        stat('Pairing attempts', String(t.attempts), t.codes + ' codes · ' + t.qrs + ' QR'),
        stat('Linked', String(t.linked), 'accounts linked', 'good'),
        stat('Success rate', o.successRate === null ? '—' : pct(o.successRate), o.successRate === null ? 'no finished attempts yet' : 'linked ÷ finished')));
      n.appendChild(h('div', { class: 'mini' },
        h('div', null, h('b', { text: String(t.failed) }), h('span', { text: 'Failed' })),
        h('div', null, h('b', { text: String(t.invalid) }), h('span', { text: 'Invalid numbers' })),
        h('div', null, h('b', { text: String(t.limited) }), h('span', { text: 'Rate limited' })),
        h('div', null, h('b', { text: String(t.blocked) }), h('span', { text: 'Blocked tries' }))));
      n.appendChild(panel('Attempts per hour', '24 h', bars(o.series, 'attempts', 'linked'), h('div', { class: 'legend' }, h('span', null, h('i'), 'Attempts'), h('span', null, h('i', { class: 'g' }), 'Linked'))));
      n.appendChild(h('div', { class: 'cols' },
        panel('Method', null, h('div', { class: 'kv' }, h('div', null, h('span', { text: 'Pairing code' }), h('b', { text: String(o.methods.code) })), h('div', null, h('span', { text: 'QR code' }), h('b', { text: String(o.methods.qr) })), h('div', null, h('span', { text: 'Session IDs fetched by the bot' }), h('b', { text: t.sessionFetchOk + ' ok · ' + t.sessionFetchBad + ' wrong' })))),
        panel('Top countries', null, o.countries.length ? h('div', { class: 'kv' }, o.countries.map(function (c) { return h('div', null, h('span', { text: c.country || '—' }), h('b', { text: String(c.n) })); })) : h('p', { class: 'empty', text: 'No pairing attempts yet.' }))));
      n.appendChild(h('div', { class: 'cols' },
        panel('Site', null, h('div', { class: 'kv' }, h('div', null, h('span', { text: 'Version' }), h('b', { text: o.version })), h('div', null, h('span', { text: 'Uptime' }), h('b', { text: dur(o.uptimeSec) })), h('div', null, h('span', { text: 'Limits (per 15 min)' }), h('b', { text: s.limits.pair + ' per visitor · ' + s.limits.number + ' per number' })))),
        panel('Announcement', null, an.length ? h('p', { text: an[0].text }) : h('p', { class: 'empty', text: 'No announcement is showing.' }))));
      return n;
    });
  }

  // ---------- Pairing sessions ----------
  function vPairing() {
    return api('GET', 'sessions').then(function (j) {
      var n = h('div');
      n.appendChild(head('Pairing sessions', 'Live session IDs and running attempts', null));
      n.appendChild(h('p', { class: 'note', text: 'Session IDs and logins are never shown here. Each one is a one-time ID that expires after ' + Math.round(j.ttlSeconds / 60) + ' minutes. Revoking removes it so the bot can no longer use it.' }));
      var rows = j.sessions.map(function (s) {
        return row([{ l: 'Ref', v: s.ref.slice(0, 8), mono: true }, { l: 'Method', v: s.method || '—' }, { l: 'Number', v: s.number || '—', mono: true }, { l: 'Country', v: s.country || '—' }, { l: 'Created', v: ago(s.createdAt) }, { l: 'Expires in', v: dur(s.secondsLeft) }],
          can('sessions.revoke') ? h('button', { class: 'btn sm danger', type: 'button', onclick: function (e) { var b = e.currentTarget; confirmThen('Revoke this session ID? The bot will no longer be able to use it.', function () { act(b, function () { return api('POST', 'sessions/revoke', { ref: s.ref }); }, 'Session ID revoked', function () { load(false); }); }); } }, 'Revoke') : null);
      });
      n.appendChild(panel('Live session IDs', String(j.sessions.length), table(['Ref', 'Method', 'Number', 'Country', 'Created', 'Expires in', ''], rows, 'No live session IDs right now.')));
      var jr = j.attempts.map(function (a) {
        return row([{ l: 'State', node: h('span', { class: 'tag ' + (a.state === 'linking' ? 'ok' : 'warn'), text: a.state }) }, { l: 'Method', v: a.method }, { l: 'Number', v: a.number || '—', mono: true }, { l: 'Country', v: a.country || '—' }, { l: 'Visitor', v: a.client || '—', mono: true }, { l: 'Running', v: dur(a.ageSec) }],
          can('sessions.revoke') ? h('button', { class: 'btn sm danger', type: 'button', onclick: function (e) { var b = e.currentTarget; confirmThen('Stop this pairing attempt?', function () { act(b, function () { return api('POST', 'attempts/stop', { ref: a.ref }); }, 'Attempt stopped', function () { load(false); }); }); } }, 'Stop') : null);
      });
      n.appendChild(panel('Running attempts', String(j.attempts.length), table(['State', 'Method', 'Number', 'Country', 'Visitor', 'Running', ''], jr, 'No pairing attempts are running.')));
      return n;
    });
  }

  // ---------- Visitors and blocks ----------
  function vVisitors() {
    var st = state.visitors;
    return api('GET', 'visitors?days=' + st.days).then(function (j) {
      var n = h('div');
      n.appendChild(head('Visitors', 'Everyone who opened the site or tried to pair. There are no user accounts: visitors are shown as short fingerprints (one per internet address), numbers are masked.', null));
      var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Show' },
        h('button', { type: 'button', 'aria-pressed': st.kind === 'clients' ? 'true' : 'false', onclick: function () { st.kind = 'clients'; load(false); } }, 'Visitors'),
        h('button', { type: 'button', 'aria-pressed': st.kind === 'numbers' ? 'true' : 'false', onclick: function () { st.kind = 'numbers'; load(false); } }, 'Numbers'));
      var sel = h('select', { 'aria-label': 'Time window', onchange: function (e) { st.days = Number(e.target.value); load(false); } }, [1, 3, 7].map(function (d) { return h('option', { value: d, selected: d === st.days }, d === 1 ? 'Last 24 hours' : 'Last ' + d + ' days'); }));
      n.appendChild(h('div', { class: 'vh' }, seg, h('div', { class: 'fld' }, sel)));
      var rows;
      function blockBtn(kind, id, isBlocked, label) {
        if (!can('blocks.manage')) return null;
        if (isBlocked) return h('button', { class: 'btn sm', type: 'button', onclick: function (e) { var b = e.currentTarget; act(b, function () { return api('POST', 'blocks/remove', { kind: kind, id: id }); }, 'Unblocked', function () { load(false); }); } }, 'Unblock');
        return h('button', { class: 'btn sm danger', type: 'button', onclick: function (e) { var b = e.currentTarget; askBlock(label, function (hours, reason) { act(b, function () { return api('POST', 'blocks/add', { kind: kind, id: id, hours: hours, reason: reason, label: label }); }, 'Blocked', function () { load(false); }); }); } }, 'Block');
      }
      if (st.kind === 'clients') {
        rows = j.clients.map(function (c) {
          return row([{ l: 'Visitor', v: c.id, mono: true }, { l: 'Address', v: c.ip || '—', mono: true }, { l: 'Attempts', v: String(c.attempts) }, { l: 'Linked / failed', v: c.linked + ' / ' + c.failed }, { l: 'Page visits', v: String(c.visits) }, { l: 'Numbers', v: String(c.numbers) }, { l: 'Last seen', v: ago(c.lastSeen) }, { l: 'Status', node: h('span', { class: 'tag ' + (c.blocked ? 'bad' : 'ok'), text: c.isMe ? 'this is you' : c.blocked ? 'blocked' : 'ok' }) }], c.isMe ? null : blockBtn('client', c.id, c.blocked, 'visitor ' + c.id));
        });
        n.appendChild(panel('Visitors', String(j.clients.length), table(['Visitor', 'Address', 'Attempts', 'Linked / failed', 'Page visits', 'Numbers', 'Last seen', 'Status', ''], rows, 'No visitors in this period.')));
      } else {
        rows = j.numbers.map(function (x) {
          return row([{ l: 'Number', v: x.number || '—', mono: true }, { l: 'Fingerprint', v: x.id, mono: true }, { l: 'Attempts', v: String(x.attempts) }, { l: 'Linked / failed', v: x.linked + ' / ' + x.failed }, { l: 'Visitors', v: String(x.clients) }, { l: 'Last seen', v: ago(x.lastSeen) }, { l: 'Status', node: h('span', { class: 'tag ' + (x.blocked ? 'bad' : 'ok'), text: x.blocked ? 'blocked' : 'ok' }) }], blockBtn('number', x.id, x.blocked, 'number ' + x.number));
        });
        n.appendChild(panel('Numbers', String(j.numbers.length), table(['Number', 'Fingerprint', 'Attempts', 'Linked / failed', 'Visitors', 'Last seen', 'Status', ''], rows, 'No numbers in this period.')));
      }
      // blocks
      var br = j.blocks.map(function (b) {
        return row([{ l: 'Type', v: b.kind === 'number' ? 'Number' : 'Visitor' }, { l: 'Who', v: b.label || b.id, mono: true }, { l: 'Reason', v: b.reason || '—' }, { l: 'By', v: b.by }, { l: 'Until', v: b.until ? when(b.until) : 'Permanent' }],
          can('blocks.manage') ? h('button', { class: 'btn sm', type: 'button', onclick: function (e) { var el = e.currentTarget; act(el, function () { return api('POST', 'blocks/remove', { kind: b.kind, id: b.id }); }, 'Unblocked', function () { load(false); }); } }, 'Unblock') : null);
      });
      n.appendChild(panel('Active blocks', String(j.blocks.length), table(['Type', 'Who', 'Reason', 'By', 'Until', ''], br, 'Nothing is blocked.')));
      if (can('blocks.manage')) {
        var num = h('input', { id: 'bk-num', type: 'tel', inputmode: 'tel', placeholder: '801 234 5678', autocomplete: 'off' }), cc = h('input', { id: 'bk-cc', type: 'text', placeholder: 'NG', maxlength: 2, autocapitalize: 'characters' }), rs = h('input', { id: 'bk-rs', type: 'text', placeholder: 'Reason (optional)', maxlength: 120 });
        var hr = h('select', { id: 'bk-hr' }, [['0', 'Permanent'], ['1', '1 hour'], ['24', '24 hours'], ['168', '7 days']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
        n.appendChild(panel('Block a phone number', null, h('p', { class: 'muted', text: 'Type the number and its 2-letter country code. Only a one-way fingerprint is saved, never the number.' }),
          h('div', { class: 'frow c2' }, h('div', { class: 'fld' }, h('label', { for: 'bk-num', text: 'Number (without country code)' }), num), h('div', { class: 'fld' }, h('label', { for: 'bk-cc', text: 'Country code (e.g. NG, GB, US)' }), cc)),
          h('div', { class: 'frow c2' }, h('div', { class: 'fld' }, h('label', { for: 'bk-rs', text: 'Reason' }), rs), h('div', { class: 'fld' }, h('label', { for: 'bk-hr', text: 'For' }), hr)),
          h('button', { class: 'btn solid', type: 'button', onclick: function (e) { var b = e.currentTarget; act(b, function () { return api('POST', 'blocks/add', { kind: 'number', number: num.value, country: cc.value.toUpperCase(), reason: rs.value, hours: Number(hr.value) }); }, 'Number blocked', function () { num.value = ''; rs.value = ''; load(false); }); } }, 'Block number')));
      }
      return n;
    });
  }
  function askBlock(label, done) {
    dlg({ title: 'Block ' + label, text: 'They will not be able to start a pairing until the block ends.', ok: 'Block', danger: true, fields: [{ name: 'hours', label: 'For how many hours? (0 = permanent)', type: 'number', value: '24' }, { name: 'reason', label: 'Reason (optional, shown in the audit log)', value: '' }] }, function (v) {
      var n = Number(v.hours); if (v.hours === '' || !isFinite(n) || n < 0) { toast('Enter a number of hours.', true); return; }
      done(n, v.reason || '');
    });
  }

  // ---------- Security ----------
  function vSecurity() {
    return api('GET', 'security').then(function (j) {
      setAlerts(j.alerts, true);
      var n = h('div'); n.appendChild(head('Security alerts', 'Worked out from real activity: rate limits, guessing, floods and admin sign-in failures', null));
      if (!j.alerts.length) n.appendChild(h('div', { class: 'note' }, 'No suspicious activity found in the last 24 hours.'));
      j.alerts.forEach(function (a) {
        var el = h('div', { class: 'alert ' + a.severity }, h('h4', null, h('span', { class: 'tag ' + a.severity, text: a.severity }), a.title), h('p', { text: a.detail }), h('div', { class: 'meta', text: a.count + ' events · first ' + ago(a.firstSeen) + ' · last ' + ago(a.lastSeen) + (a.subject ? ' · ' + a.subject.kind + ' ' + a.subject.id : '') }));
        if (a.subject && can('blocks.manage')) el.appendChild(h('div', null, h('button', { class: 'btn sm danger', type: 'button', onclick: function (e) { var b = e.currentTarget; askBlock(a.subject.kind + ' ' + a.subject.id, function (hours, reason) { act(b, function () { return api('POST', 'blocks/add', { kind: a.subject.kind, id: a.subject.id, hours: hours, reason: reason || a.title }); }, 'Blocked', function () { load(false); }); }); } }, 'Block this ' + a.subject.kind)));
        n.appendChild(el);
      });
      return n;
    });
  }

  // ---------- Server ----------
  function vServer() {
    return api('GET', 'health').then(function (x) {
      var n = h('div'); n.appendChild(head('Server health', 'Live numbers from the running server (updated every few seconds)', null));
      n.appendChild(h('div', { class: 'grid' }, stat('Uptime', dur(x.uptimeSec), 'since ' + when(x.startedAt)), stat('Version', x.version, 'Node ' + x.node)));
      var m = x.memory, used = m.containerUsed || m.rss, disk = x.storage.disk;
      var mine = [gauge('Site CPU', Math.min(100, x.cpu.process) / 100, 'of one core'),
        gauge(m.containerLimit ? 'Site memory' : 'Site memory (no limit known)', m.containerLimit ? used / m.containerLimit : 0, m.containerLimit ? mb(used) + ' of ' + mb(m.containerLimit) : mb(used) + ' in use'),
        gauge('Heap (JavaScript)', m.heapUsed / m.heapLimit, mb(m.heapUsed) + ' of ' + mb(m.heapLimit))];
      var host = [gauge('Machine CPU', x.cpu.system / 100, 'all programs on it', true), gauge('Machine memory', (m.systemTotal - m.systemFree) / m.systemTotal, mb(m.systemTotal - m.systemFree) + ' of ' + mb(m.systemTotal), true)];
      if (disk) host.push(gauge('Machine disk', (disk.total - disk.free) / disk.total, mb(disk.total - disk.free) + ' of ' + mb(disk.total), true));
      var memBars = h('div', null, h('div', { class: 'gh', text: 'This site' }), h('div', { class: 'gg' }, mine), h('div', { class: 'gh', text: 'The whole machine (shared with other programs, for your information)' }), h('div', { class: 'gg' }, host));
      n.appendChild(panel('Usage', 'live', memBars));
      n.appendChild(h('div', { class: 'cols' },
        panel('Details', null, h('div', { class: 'kv' },
          h('div', null, h('span', { text: 'Platform' }), h('b', { text: x.platform + ' · ' + x.cores + ' cores' })),
          h('div', null, h('span', { text: 'Load average (1 / 5 / 15 min)' }), h('b', { text: x.cpu.load.join(' / ') })),
          h('div', null, h('span', { text: 'Event-loop delay' }), h('b', { text: x.eventLoopLagMs + ' ms' })),
          h('div', null, h('span', { text: 'Data folder size' }), h('b', { text: mb(x.storage.data) })),
          h('div', null, h('span', { text: 'Permanent storage (Supabase)' }), h('b', { text: !x.storage.cloud.enabled ? 'Not set up' : x.storage.cloud.ok === false ? 'Problem: ' + x.storage.cloud.lastError : x.storage.cloud.ok ? 'Connected' + (x.storage.cloud.queued ? ' · ' + x.storage.cloud.queued + ' waiting to send' : '') : 'Starting…' })),
          h('div', null, h('span', { text: 'Live session IDs' }), h('b', { text: String(x.pairing.liveSessionIds) })),
          h('div', null, h('span', { text: 'Running attempts' }), h('b', { text: String(x.pairing.activeJobs) }))))));
      n.appendChild(h('div', { class: 'cols' }, panel('CPU of the site', 'last ' + Math.round(x.series.length * 5 / 60) + ' min', spark(x.series.map(function (s) { return s.cpu; }), 'CPU history')), panel('Memory of the site', null, spark(x.series.map(function (s) { return s.rss; }), 'Memory history'))));
      if (!x.storage.cloud.enabled && (!x.storage.disk || !m.containerLimit)) n.appendChild(h('p', { class: 'note', text: 'Free hosting plans do not keep files between deploys: the activity log, blocks and settings saved on the server are lost when the site is redeployed unless a persistent disk is attached or Supabase storage is set up.' }));
      return n;
    });
  }

  // ---------- Activity ----------
  function vActivity() {
    var st = state.activity;
    return api('GET', 'activity?limit=150' + (st.type ? '&type=' + encodeURIComponent(st.type) : '')).then(function (j) {
      var n = h('div'); n.appendChild(head('Activity', 'Newest first · kept for 7 days · ' + j.total + ' events', null));
      var types = [['', 'Everything'], ['pair.start', 'Pairing started'], ['pair.linked', 'Linked'], ['pair.failed', 'Failed'], ['pair.limited', 'Rate limited'], ['pair.blocked', 'Blocked'], ['pair.invalid', 'Invalid number'], ['session', 'Session IDs']];
      n.appendChild(h('div', { class: 'fld' }, h('label', { for: 'ac-t', text: 'Show' }), h('select', { id: 'ac-t', onchange: function (e) { st.type = e.target.value; load(false); } }, types.map(function (t) { return h('option', { value: t[0], selected: t[0] === st.type, text: t[1] }); }))));
      var rows = j.events.map(function (e) {
        var detail = [e.method, e.country, e.number, e.ok === null ? '' : (e.ok ? 'ok' : 'wrong ID'), e.detail].filter(Boolean).join(' · ');
        return row([{ l: 'Time', v: when(e.t) }, { l: 'Event', node: h('span', { class: 'tag ' + (/failed|blocked|limited/.test(e.type) ? 'warn' : /linked/.test(e.type) ? 'ok' : ''), text: NAMES[e.type] || e.type }) }, { l: 'Details', v: detail || '—' }, { l: 'Visitor', v: e.client || '—', mono: true }], null);
      });
      n.appendChild(panel(null, null, table(['Time', 'Event', 'Details', 'Visitor', ''], rows, 'Nothing recorded yet.')));
      return n;
    });
  }

  // ---------- Audit ----------
  function vAudit() {
    return api('GET', 'audit?limit=200').then(function (j) {
      var n = h('div'); n.appendChild(head('Audit log', 'Every administrator action · ' + j.total + ' entries', h('span', { class: 'tag ' + (j.chainOk ? 'ok' : 'bad'), text: j.chainOk ? 'Chain intact' : 'Chain BROKEN' })));
      if (!j.chainOk) n.appendChild(h('div', { class: 'banner' }, 'The audit file was edited or damaged: some earlier entries cannot be trusted.'));
      else n.appendChild(h('p', { class: 'note', text: 'Each entry is chained to the one before it, so changing or deleting a line is detected.' }));
      var rows = j.entries.map(function (e) { return row([{ l: 'Time', v: when(e.t) }, { l: 'Admin', v: e.actor + (e.role ? ' (' + e.role + ')' : '') }, { l: 'Action', node: h('span', { class: 'tag ' + (/denied|failed/.test(e.action) ? 'bad' : ''), text: e.action }) }, { l: 'Target', v: e.target || '—', mono: true }, { l: 'Details', v: e.detail || '—' }, { l: 'Visitor', v: e.client || '—', mono: true }], null); });
      n.appendChild(panel(null, null, table(['Time', 'Admin', 'Action', 'Target', 'Details', 'Visitor', ''], rows, 'No entries yet.')));
      return n;
    });
  }

  // ---------- Announcements ----------
  function vAnnounce() {
    return api('GET', 'announcements').then(function (j) {
      var n = h('div'); n.appendChild(head('Announcements', 'A banner shown at the top of every public page. Only the newest active one is shown.', null));
      if (can('announce.manage')) {
        var tx = h('textarea', { id: 'an-t', maxlength: 240, placeholder: 'e.g. Pairing may be slow tonight while WhatsApp is updating.' }), lv = h('select', { id: 'an-l' }, [['info', 'Information'], ['warning', 'Warning'], ['critical', 'Critical']].map(function (o) { return h('option', { value: o[0], text: o[1] }); })), hr = h('select', { id: 'an-h' }, [['0', 'Until I hide it'], ['1', '1 hour'], ['6', '6 hours'], ['24', '24 hours'], ['168', '7 days']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
        n.appendChild(panel('New announcement', null, h('div', { class: 'fld' }, h('label', { for: 'an-t', text: 'Message (plain text, up to 240 characters)' }), tx), h('div', { class: 'frow c2' }, h('div', { class: 'fld' }, h('label', { for: 'an-l', text: 'Style' }), lv), h('div', { class: 'fld' }, h('label', { for: 'an-h', text: 'Show for' }), hr)),
          h('button', { class: 'btn solid', type: 'button', onclick: function (e) { var b = e.currentTarget; act(b, function () { return api('POST', 'announcements/add', { text: tx.value, level: lv.value, hours: Number(hr.value) }); }, 'Announcement is live', function () { tx.value = ''; load(false); }); } }, 'Publish')));
      }
      var rows = j.announcements.map(function (a) {
        var live = a.active && (!a.endsAt || a.endsAt > Date.now());
        return row([{ l: 'Status', node: h('span', { class: 'tag ' + (live ? 'ok' : ''), text: live ? 'showing' : (a.active ? 'expired' : 'hidden') }) }, { l: 'Style', v: a.level }, { l: 'Message', v: a.text }, { l: 'By', v: a.by }, { l: 'Until', v: a.endsAt ? when(a.endsAt) : 'Until hidden' }],
          can('announce.manage') ? [h('button', { class: 'btn sm', type: 'button', onclick: function (e) { var b = e.currentTarget; act(b, function () { return api('POST', 'announcements/toggle', { id: a.id }); }, a.active ? 'Hidden' : 'Showing', function () { load(false); }); } }, a.active ? 'Hide' : 'Show'), ' ', h('button', { class: 'btn sm danger', type: 'button', onclick: function (e) { var b = e.currentTarget; confirmThen('Delete this announcement?', function () { act(b, function () { return api('POST', 'announcements/delete', { id: a.id }); }, 'Deleted', function () { load(false); }); }); } }, 'Delete')] : null);
      });
      n.appendChild(panel('All announcements', String(j.announcements.length), table(['Status', 'Style', 'Message', 'By', 'Until', ''], rows, 'No announcements yet.')));
      return n;
    });
  }

  // ---------- Plugins (submissions from the Developer Centre) ----------
  var PSTAT = { revoked: ['Withdrawn', 'bad'], pending: ['Waiting', 'warn'], approved: ['Approved', 'ok'], published: ['Published', 'ok'], rejected: ['Rejected', 'bad'], changes: ['Changes asked', 'warn'], withdrawn: ['Withdrawn', ''] };
  function pstat(st) { var x = PSTAT[st] || [st, '']; return h('span', { class: 'tag ' + x[1], text: x[0] }); }
  function vPlugins() { return state.plug.open ? vPluginOne(state.plug.open) : vPluginList(); }
  function colDlg(c) {
    dlg({ title: c ? 'Edit collection' : 'New collection', text: 'A ready-made set of 2 to 8 published plugins. Bot owners install the whole set with one command.', fields: [
      { name: 'id', label: 'Short id (like starter-set)', value: c ? c.id : '' }, { name: 'name', label: 'Name', value: c ? c.name : '' },
      { name: 'description', label: 'One line about it', value: c ? c.description : '' }, { name: 'plugins', label: 'Plugin ids, separated by commas', value: c ? c.plugins.join(', ') : '' }], ok: 'Save' }, function (v) {
      api('POST', 'plugins/collections', { save: { id: v.id, name: v.name, description: v.description, plugins: v.plugins } }).then(function () { toast('Collection saved'); load(false); }, fail);
    });
  }
  function vPluginList() {
    return api('GET', 'plugins/submissions').then(function (j) {
      var n = h('div');
      n.appendChild(head('Plugins', 'Plugins that developers sent in. Nothing is published from here: approved plugins wait for your phone command.', null));
      n.appendChild(h('div', { class: 'avr' }, h('span', { class: 'tag ' + (j.paused ? 'bad' : 'ok'), text: j.paused ? 'Store paused' : 'Store open' }), ' ', h('button', { class: 'btn' + (j.paused ? '' : ' danger'), type: 'button', onclick: function (e) { var b = e.currentTarget, go = function () { act(b, function () { return api('POST', 'plugins/pause', { paused: !j.paused }); }, j.paused ? 'Store opened' : 'Store paused', function () { load(false); }); }; if (j.paused) go(); else confirmThen('Pause the plugin store? The Plugins page shows nothing and nobody can send, rate or report plugins. Bots and already installed plugins are not affected.', go, 'Pause'); } }, j.paused ? 'Open the store again' : 'Pause the store')));
      var iv = j.invites || { on: false, logins: [] };
      var ibox = h('div', { class: 'avr' }, h('span', { class: 'tag ' + (iv.on ? 'warn' : 'ok'), text: iv.on ? 'Invite-only beta: ON' : 'Open to every developer' }), ' ',
        h('button', { class: 'btn', type: 'button', onclick: function (e) { var b = e.currentTarget; act(b, function () { return api('POST', 'plugins/invites', { on: !iv.on }); }, iv.on ? 'Open to everyone' : 'Invite-only is on', function () { load(false); }); } }, iv.on ? 'Open to everyone' : 'Turn on invite-only'), ' ',
        h('button', { class: 'btn', type: 'button', onclick: function () { dlg({ title: 'Invite a developer', text: 'Their GitHub username. While invite-only is on, only listed people can send plugins.', fields: [{ name: 'login', label: 'GitHub username' }], ok: 'Add' }, function (v) { api('POST', 'plugins/invites', { add: v.login }).then(function () { load(false); }, function () { load(false); }); }); } }, 'Invite someone'));
      n.appendChild(ibox);
      var cols = j.collections || [];
      var cbox = h('div', { class: 'avr' }, h('span', { class: 'tag ok', text: 'Collections: ' + cols.length }), ' ',
        h('button', { class: 'btn', type: 'button', onclick: function () { colDlg(null); } }, 'New collection'));
      n.appendChild(cbox);
      cols.forEach(function (c) {
        n.appendChild(h('p', { class: 'muted' }, h('b', { text: c.name }), ' (' + c.id + '): ' + c.plugins.join(', ') + ' ',
          h('button', { class: 'btn sm', type: 'button', onclick: function () { colDlg(c); } }, 'Edit'), ' ',
          h('button', { class: 'btn sm danger', type: 'button', onclick: function (e) { var b = e.currentTarget; dlg({ title: 'Delete the collection ' + c.name + '?', text: 'It disappears from bots and the Plugins page after your next phone command (pull, push the registry).', ok: 'Delete', danger: true }, function () { act(b, function () { return api('POST', 'plugins/collections', { remove: c.id }); }, 'Collection deleted', function () { load(false); }); }); } }, 'Delete')));
      });
      if (cols.length) n.appendChild(h('p', { class: 'note', text: 'Changes to collections reach bots after you run the phone command (pull) and push the registry, like plugins.' }));
      if (iv.logins.length) n.appendChild(h('p', { class: 'muted' }, 'Invited: ', iv.logins.map(function (l) { return h('button', { class: 'btn sm', type: 'button', title: 'Remove ' + l, onclick: function (e) { act(e.currentTarget, function () { return api('POST', 'plugins/invites', { remove: l }); }, 'Removed', function () { load(false); }); } }, l + ' ✕'); })));
      if (!j.configured) n.appendChild(h('p', { class: 'note warn', text: 'GitHub sign-in is not set up yet (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and SITE_URL are missing on the server), so developers cannot send plugins.' }));
      if (!j.pullOn) n.appendChild(h('p', { class: 'note warn', text: 'The phone command is not set up yet (REGISTRY_PULL_TOKEN is missing or shorter than 24 characters), so approved plugins cannot be collected.' }));
      n.appendChild(h('div', { class: 'grid' }, stat('Waiting', String(j.counts.pending), 'for your review', j.counts.pending ? 'warn' : ''), stat('Approved', String(j.counts.approved), 'wait for the phone command', j.counts.approved ? 'good' : ''), stat('Published', String(j.counts.published), 'in the registry', ''), stat('Rejected', String(j.counts.rejected), '', '')));
      var rows = j.submissions.map(function (s) {
        return row([{ l: 'Status', node: pstat(s.status) }, { l: 'Plugin', v: s.name + ' (' + s.pluginId + ')' }, { l: 'Version', v: s.version }, { l: 'Developer', v: s.login + (s.verified ? ' ✓' : '') }, { l: 'Risk', node: h('span', { class: 'tag ' + s.risk, text: s.risk + (s.flags ? ' · ' + s.flags + ' flag' + (s.flags > 1 ? 's' : '') : '') }) }, { l: 'Sent', v: when(s.createdAt) }],
          [h('button', { class: 'btn sm', type: 'button', onclick: function () { state.plug.open = s.id; load(true); } }, 'Open')]);
      });
      n.appendChild(panel('Submissions', String(j.submissions.length), table(['Status', 'Plugin', 'Version', 'Developer', 'Risk', 'Sent', ''], rows, 'Nobody has sent a plugin yet.')));
      n.appendChild(h('div', { class: 'avr' }, h('button', { class: 'btn', type: 'button', onclick: function () { state.plug.open = '#devs'; load(true); } }, 'Developers'), ' ', h('button', { class: 'btn', type: 'button', onclick: function () { state.plug.open = '#reviews'; load(true); } }, 'Ratings and reviews'), ' ', h('button', { class: 'btn', type: 'button', onclick: function () { state.plug.open = '#reports'; load(true); } }, 'Reports'), ' ', h('a', { class: 'btn', href: '/admin/api/plugins/export', download: 'turbofex-plugin-store-backup.json' }, 'Download backup')));
      return n;
    });
  }
  function vPluginOne(id) {
    if (id === '#devs') return vPluginDevs();
    if (id === '#reviews') return vPluginReviews();
    if (id === '#reports') return vPluginReports();
    return api('GET', 'plugins/submission?id=' + encodeURIComponent(id)).then(function (s) {
      var n = h('div'), back = h('button', { class: 'btn sm', type: 'button', onclick: function () { state.plug.open = ''; load(true); } }, '← All submissions');
      n.appendChild(head(s.name, s.pluginId + ' · version ' + s.version, back));
      var m = s.manifest;
      n.appendChild(panel('Overview', null,
        h('p', null, h('b', { text: 'Status: ' }), pstat(s.status)),
        h('p', null, h('b', { text: 'Developer: ' }), s.login + (s.verified ? ' (verified)' : '') + ' · GitHub #' + (s.dev ? s.dev.githubId : '?')),
        h('p', { text: m.description }),
        h('p', { class: 'muted', text: 'Repository: ' + s.repo + ' · tag ' + s.tag + (s.folder ? ' · folder ' + s.folder : '') }),
        h('p', { class: 'muted mono', text: 'plugin file sha256 ' + s.entrySha }),
        s.note ? h('p', { text: 'Note: ' + s.note + (s.reviewedBy ? ' (' + s.reviewedBy + ')' : '') }) : null,
        s.otherVersions.length ? h('p', { class: 'muted', text: 'Other versions: ' + s.otherVersions.map(function (o) { return o.version + ' ' + o.status; }).join(', ') }) : null));
      n.appendChild(panel('What it asks for', s.risk + ' risk', m.permissions.length ? h('ul', { class: 'alist' }, m.permissions.map(function (x) { return h('li', { text: x }); })) : h('p', { class: 'muted', text: 'Nothing special.' }),
        m.domains.length ? h('p', { text: 'Websites: ' + m.domains.join(', ') }) : null,
        h('p', { class: 'muted', text: 'Commands: ' + (m.commands.join(', ') || 'none') + (m.events.length ? ' · Events: ' + m.events.join(', ') : '') })));
      n.appendChild(panel('Automatic checks', s.flagList.length ? String(s.flagList.length) + ' to look at' : 'none', s.flagList.length ? h('ul', { class: 'alist' }, s.flagList.map(function (x) { return h('li', { text: x }); })) : h('p', { class: 'muted', text: 'Nothing unusual found. This never means safe: read the code.' })));
      if (s.replies && s.replies.length) n.appendChild(panel.apply(null, ['Messages from the developer', String(s.replies.length)].concat(s.replies.map(function (r) { return h('p', { class: 'muted', text: when(r.at) + ': ' + r.text }); }))));
      if (s.changes) {
        var c = s.changes, cl = [];
        if (c.permsAdded.length) cl.push(h('p', { class: 'note warn', text: 'New permissions since ' + c.version + ': ' + c.permsAdded.join(', ') }));
        if (c.permsRemoved.length) cl.push(h('p', { class: 'muted', text: 'Permissions dropped: ' + c.permsRemoved.join(', ') }));
        if (c.domainsAdded.length) cl.push(h('p', { class: 'note warn', text: 'New websites since ' + c.version + ': ' + c.domainsAdded.join(', ') }));
        var dl = function (d) { return d.tooBig ? h('p', { class: 'muted', text: 'Too long to compare here. Read the full code below.' }) : d.lines.length ? h('pre', { class: 'apre tall', tabindex: '0' }, d.lines.map(function (l) { return h('span', { class: l.t === '+' ? 'dadd' : l.t === '-' ? 'ddel' : 'dctx', text: (l.t === '~' ? '  ' : l.t + ' ') + l.s + '\n' }); })) : h('p', { class: 'muted', text: 'No change.' }); };
        cl.push(h('p', { class: 'muted', text: 'Code: ' + (c.code.tooBig ? 'too long to compare' : '+' + c.code.added + ' / -' + c.code.removed + ' lines') + ' · compared with version ' + c.version + ' (' + c.status + ')' }));
        cl.push(dl(c.code)); cl.push(h('p', { class: 'muted', text: 'turbofex-plugin.json' })); cl.push(dl(c.manifest));
        n.appendChild(panel.apply(null, ['What changed since ' + c.version, c.permsAdded.length ? 'new permissions' : null].concat(cl)));
      }
      n.appendChild(panel('turbofex-plugin.json', null, h('pre', { class: 'apre', tabindex: '0', text: s.manifestRaw })));
      n.appendChild(panel('Plugin code', String(s.entrySource.split('\n').length) + ' lines', h('pre', { class: 'apre tall', tabindex: '0', text: s.entrySource })));
      if (typeof s.icon === 'string' && /^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(s.icon)) n.appendChild(panel('Logo (icon.png)', '', h('img', { src: s.icon, width: 64, height: 64, alt: 'logo' })));
      if (Array.isArray(s.shots) && s.shots.length) n.appendChild(panel('Screenshots', String(s.shots.length), h('div', { class: 'avr' }, s.shots.filter(function (x) { return /^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(x); }).map(function (x) { return h('img', { src: x, width: 160, alt: 'screenshot' }); }))));
      [['README.md', s.readme], ['CHANGELOG.md', s.changelog]].forEach(function (d) { if (d[1]) n.appendChild(panel(d[0], String(d[1].split('\n').length) + ' lines (shown on the Plugins page as plain text)', h('pre', { class: 'apre tall', tabindex: '0', text: d[1] }))); });
      var bar = h('div', { class: 'abar' });
      if (s.status === 'pending') {
        bar.appendChild(h('button', { class: 'btn solid', type: 'button', onclick: function (e) { var b = e.currentTarget; dlg({ title: 'Approve ' + s.name + ' ' + s.version + '?', text: 'It then waits for your phone command (node tools/registry.js pull). Nothing is published yet. You read the code above, and this approves exactly that code.', fields: [{ name: 'note', label: 'Private note (optional)' }], ok: 'Approve' }, function (v) { act(b, function () { return api('POST', 'plugins/review', { id: s.id, decision: 'approve', note: v.note }); }, 'Approved', function () { load(false); }); }); } }, 'Approve'));
      }
      if (s.status === 'pending') {
        bar.appendChild(h('button', { class: 'btn', type: 'button', onclick: function (e) { var b = e.currentTarget; dlg({ title: 'Ask for changes to ' + s.name + ' ' + s.version + '?', text: 'The developer sees this note, fixes the plugin and sends it again (the same version number is fine). Use this instead of Reject when it can be fixed.', fields: [{ name: 'note', label: 'What should change' }], ok: 'Ask for changes' }, function (v) { act(b, function () { return api('POST', 'plugins/review', { id: s.id, decision: 'changes', note: v.note }); }, 'Sent back to the developer', function () { load(false); }); }); } }, 'Ask for changes'));
      }
      if (s.status === 'pending' || s.status === 'approved') {
        bar.appendChild(h('button', { class: 'btn danger', type: 'button', onclick: function (e) { var b = e.currentTarget; dlg({ title: 'Reject ' + s.name + ' ' + s.version + '?', text: 'The developer sees this reason, so keep it short and kind.', fields: [{ name: 'note', label: 'Reason' }], ok: 'Reject', danger: true }, function (v) { act(b, function () { return api('POST', 'plugins/review', { id: s.id, decision: 'reject', note: v.note }); }, 'Rejected', function () { load(false); }); }); } }, 'Reject'));
      }
      if (s.status === 'published' && !s.revoke) {
        bar.appendChild(h('button', { class: 'btn', type: 'button', onclick: function (e) { var b = e.currentTarget; act(b, function () { return api('POST', 'plugins/feature', { id: s.pluginId, on: !s.featured }); }, s.featured ? 'Removed from featured' : 'Featured', function () { load(false); }); } }, s.featured ? 'Remove from featured' : 'Feature this plugin'));
        bar.appendChild(h('button', { class: 'btn danger', type: 'button', onclick: function (e) { var b = e.currentTarget; dlg({ title: 'Withdraw ' + s.name + ' ' + s.version + ' from the store?', text: 'The Plugins page hides it at once. Bots switch it off only after you run the phone command (node tools/registry.js pull) and push the registry.', fields: [{ name: 'reason', label: 'Reason (bots show it to their owners)' }], ok: 'Withdraw', danger: true }, function (v) { act(b, function () { return api('POST', 'plugins/revoke', { id: s.id, reason: v.reason }); }, 'Marked for withdrawal', function () { load(false); }); } ); } }, 'Withdraw from the store'));
      }
      if (s.revoke) bar.appendChild(h('p', { class: 'note warn', text: s.revoke.done ? 'Withdrawn and signed: bots switch it off. Reason: ' + s.revoke.reason : 'Withdrawal waiting for the phone command (pull, then push the registry, then published). Reason: ' + s.revoke.reason }));
      if (s.dev) {
        bar.appendChild(h('button', { class: 'btn', type: 'button', onclick: function (e) { var b = e.currentTarget; act(b, function () { return api('POST', 'plugins/dev', { githubId: s.dev.githubId, verified: !s.dev.verified }); }, s.dev.verified ? 'Verified mark removed' : 'Developer verified', function () { load(false); }); } }, s.dev.verified ? 'Remove verified mark' : 'Mark developer as verified'));
      }
      n.appendChild(bar);
      return n;
    });
  }
  function vPluginReviews() {
    return api('GET', 'plugins/reviews').then(function (j) {
      var n = h('div'), back = h('button', { class: 'btn sm', type: 'button', onclick: function () { state.plug.open = ''; load(true); } }, '← All submissions');
      n.appendChild(head('Ratings and reviews', 'Newest first. A hidden rating is not shown and does not count in the average.', back));
      var rows = j.reviews.map(function (r) {
        return row([{ l: 'Plugin', v: r.plugin }, { l: 'Stars', v: '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars) }, { l: 'By', v: r.login }, { l: 'Review', v: r.text || '(no text)' }, { l: 'State', node: h('span', { class: 'tag ' + (r.hidden ? 'bad' : 'ok'), text: r.hidden ? 'hidden' : 'shown' }) }, { l: 'Sent', v: when(r.at) }],
          [h('button', { class: 'btn sm', type: 'button', onclick: function (e) { var b = e.currentTarget; act(b, function () { return api('POST', 'plugins/review-hide', { plugin: r.plugin, githubId: r.githubId, hidden: !r.hidden }); }, r.hidden ? 'Shown again' : 'Hidden', function () { load(false); }); } }, r.hidden ? 'Show' : 'Hide')]);
      });
      n.appendChild(panel('Ratings', String(j.reviews.length), table(['Plugin', 'Stars', 'By', 'Review', 'State', 'Sent', ''], rows, 'Nobody has rated a plugin yet.')));
      return n;
    });
  }
  function vPluginReports() {
    return api('GET', 'plugins/reports').then(function (j) {
      var n = h('div'), back = h('button', { class: 'btn sm', type: 'button', onclick: function () { state.plug.open = ''; load(true); } }, '← All submissions');
      n.appendChild(head('Reports', 'People who signed in with GitHub and reported a plugin. Open ones first. To remove a plugin, open it under Submissions and use Withdraw.', back));
      var rows = j.reports.map(function (r) {
        var open = r.status === 'open';
        return row([{ l: 'Plugin', v: r.plugin }, { l: 'Reason', v: r.reasonText }, { l: 'Details', v: r.text || '(none)' }, { l: 'By', v: r.login }, { l: 'State', node: h('span', { class: 'tag ' + (open ? 'bad' : 'ok'), text: open ? 'open' : 'closed' }) }, { l: 'Sent', v: when(r.at) }],
          [h('button', { class: 'btn sm', type: 'button', onclick: function (e) { var b = e.currentTarget; act(b, function () { return api('POST', 'plugins/report-set', { plugin: r.plugin, githubId: r.githubId, status: open ? 'closed' : 'open' }); }, open ? 'Closed' : 'Reopened', function () { load(false); }); } }, open ? 'Close' : 'Reopen')]);
      });
      n.appendChild(panel('Reports', String(j.reports.filter(function (r) { return r.status === 'open'; }).length) + ' open', table(['Plugin', 'Reason', 'Details', 'By', 'State', 'Sent', ''], rows, 'Nobody has reported a plugin.')));
      return n;
    });
  }
  function vPluginDevs() {
    return api('GET', 'plugins/devs').then(function (j) {
      var n = h('div'), back = h('button', { class: 'btn sm', type: 'button', onclick: function () { state.plug.open = ''; load(true); } }, '← All submissions');
      n.appendChild(head('Developers', 'People who signed in with GitHub. Blocking stops them from signing in and sending plugins.', back));
      var rows = j.developers.map(function (d) {
        return row([{ l: 'Developer', v: d.login }, { l: 'GitHub #', v: String(d.githubId), mono: true }, { l: 'Status', node: h('span', { class: 'tag ' + (d.blocked ? 'bad' : d.verified ? 'ok' : ''), text: d.blocked ? 'blocked' : d.verified ? 'verified' : 'new' }) }, { l: 'Plugins', v: String(d.submissions) }, { l: 'Last sign-in', v: when(d.lastLogin) }],
          [h('button', { class: 'btn sm', type: 'button', onclick: function (e) { var b = e.currentTarget; act(b, function () { return api('POST', 'plugins/dev', { githubId: d.githubId, verified: !d.verified }); }, d.verified ? 'Verified mark removed' : 'Verified', function () { load(false); }); } }, d.verified ? 'Unverify' : 'Verify'), ' ',
            h('button', { class: 'btn sm danger', type: 'button', onclick: function (e) { var b = e.currentTarget; var go2 = function () { act(b, function () { return api('POST', 'plugins/dev', { githubId: d.githubId, blocked: !d.blocked }); }, d.blocked ? 'Unblocked' : 'Blocked', function () { load(false); }); }; if (d.blocked) go2(); else confirmThen('Block ' + d.login + '? They can no longer sign in or send plugins.', go2, 'Block'); } }, d.blocked ? 'Unblock' : 'Block')]);
      });
      n.appendChild(panel('Developers', String(j.developers.length), table(['Developer', 'GitHub #', 'Status', 'Plugins', 'Last sign-in', ''], rows, 'Nobody has signed in yet.')));
      return n;
    });
  }

  // ---------- Settings ----------
  function vSettings() {
    return api('GET', 'settings').then(function (s) {
      var n = h('div'); n.appendChild(head('Settings', s.canEdit ? 'Changes apply immediately' : 'Read only: only an owner can change settings', null));
      var edit = s.canEdit;
      var on = h('input', { id: 'st-on', type: 'checkbox', checked: s.maintenance.on, disabled: !edit }), msg = h('textarea', { id: 'st-msg', maxlength: 200, disabled: !edit, placeholder: 'TurboFex Pair is paused for maintenance. Please come back soon.' });
      msg.value = s.maintenance.message || '';
      on.addEventListener('change', function () { $('st-lbl').textContent = on.checked ? 'Turn ON when you press Save (pairing paused)' : 'Turn OFF when you press Save (site open)'; });
      n.appendChild(panel('Maintenance mode', null, h('p', { class: 'muted', text: 'While this is on, nobody can start a new pairing (the public page shows your message). Pairings already running finish normally, and the dashboard keeps working.' }),
        h('label', { class: 'sw', for: 'st-on' }, on, h('span', { id: 'st-lbl', text: s.maintenance.on ? 'Maintenance is ON (pairing paused)' : 'Maintenance is OFF (site open)' })),
        h('div', { class: 'fld' }, h('label', { for: 'st-msg', text: 'Message shown to visitors' }), msg),
        edit ? h('button', { class: 'btn solid', type: 'button', onclick: function (e) { var b = e.currentTarget; var go = function () { act(b, function () { return api('POST', 'settings', { maintenance: { on: on.checked, message: msg.value } }); }, on.checked ? 'Maintenance mode is ON' : 'Maintenance mode is off', function () { load(false); }); }; if (on.checked && !s.maintenance.on) confirmThen('Turn maintenance mode ON? Nobody will be able to start a pairing.', go); else go(); } }, 'Save maintenance') : null));
      var fields = [['pair', 'Pairing attempts per visitor', 'every 15 minutes'], ['number', 'Attempts per phone number', 'every 15 minutes'], ['maxJobs', 'Pairings running at the same time', 'the whole site']];
      var inputs = {};
      var rows = fields.map(function (f) { inputs[f[0]] = h('input', { id: 'lm-' + f[0], type: 'number', min: s.ranges[f[0]].min, max: s.ranges[f[0]].max, step: 1, value: s.limits[f[0]], disabled: !edit, inputmode: 'numeric' }); return h('div', { class: 'fld' }, h('label', { for: 'lm-' + f[0], text: f[1] + ' (' + f[2] + ')' }), inputs[f[0]], h('small', { text: 'Allowed: ' + s.ranges[f[0]].min + '–' + s.ranges[f[0]].max + ' · default ' + s.defaults[f[0]] })); });
      n.appendChild(panel('Pairing limits', null, h('div', { class: 'frow c3' }, rows), edit ? h('button', { class: 'btn solid', type: 'button', onclick: function (e) { var b = e.currentTarget; act(b, function () { var l = {}; Object.keys(inputs).forEach(function (k) { l[k] = inputs[k].value; }); return api('POST', 'settings', { limits: l }); }, 'Limits saved', function () { load(false); }); } }, 'Save limits') : null));
      n.appendChild(panel('Trusted devices', null, h('p', { class: 'muted', text: 'A device you trusted at sign-in skips the 6-digit code for 30 days (the password is still asked). Press this to cancel that on every device, for your account.' }), h('button', { class: 'btn', type: 'button', onclick: function (e) { var b = e.currentTarget; confirmThen('Forget all trusted devices? Every device will ask for the code again.', function () { act(b, function () { return api('POST', 'trust/forget'); }, 'Trusted devices forgotten'); }); } }, 'Forget trusted devices')));
      n.appendChild(panel('Your account', null, h('div', { class: 'kv' }, h('div', null, h('span', { text: 'Signed in as' }), h('b', { text: me.user })), h('div', null, h('span', { text: 'Role' }), h('b', { text: me.role })), h('div', null, h('span', { text: 'Allowed' }), h('b', { text: me.perms.join(', ') })), h('div', null, h('span', { text: 'Auto sign-out' }), h('b', { text: Math.round(me.idleMs / 60000) + ' min idle · 8 h at most' })))));
      return n;
    });
  }

  // ---------- start ----------
  function start() {
    return api('GET', 'me').then(function (m) {
      me = m; csrf = m.csrf; $('who-u').textContent = m.user; $('who-r').textContent = m.role;
      $('login').hidden = true; $('app').hidden = false;
      var t = (location.hash || '').slice(1); if (VIEWS[t] && !(t === 'audit' && !can('audit.view'))) tab = t;
      drawNav(); load(true); schedule(); pollAlerts();
    });
  }
  api('GET', 'me').then(function (m) { me = m; csrf = m.csrf; return start(); }, function () { /* showLogin() was already called by api() on 401 */ });
  // if the first call fails with 401, api() already showed the login; if the server is unreachable show it too
  setTimeout(function () { if (!me && $('login').hidden && $('app').hidden) showLogin(); }, 1500);
})();
