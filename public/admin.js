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
    $('app').hidden = true; $('login').hidden = false; $('f-pass').hidden = false; $('f-2fa').hidden = true;
    $('p').value = ''; $('c').value = ''; $('lg-err').textContent = msg || '';
    setTimeout(function () { $('u').focus(); }, 50);
  }
  $('f-pass').addEventListener('submit', function (e) {
    e.preventDefault(); var b = $('b-pass'); if (b.disabled) return; b.disabled = true; $('lg-err').textContent = '';
    api('POST', 'login', { user: $('u').value, password: $('p').value }).then(function (j) { ticket = j.ticket; $('p').value = ''; $('f-pass').hidden = true; $('f-2fa').hidden = false; $('c').focus(); }, function (er) { $('lg-err').textContent = er.message; }).then(function () { b.disabled = false; });
  });
  $('f-2fa').addEventListener('submit', function (e) {
    e.preventDefault(); var b = $('b-2fa'); if (b.disabled) return; b.disabled = true; $('lg-err').textContent = '';
    api('POST', '2fa', { ticket: ticket, code: $('c').value }).then(function () { return start(); }, function (er) { $('lg-err').textContent = er.message; if (/Sign in again/.test(er.message)) { $('f-pass').hidden = false; $('f-2fa').hidden = true; } }).then(function () { b.disabled = false; $('c').value = ''; });
  });
  $('b-back').addEventListener('click', function () { $('f-pass').hidden = false; $('f-2fa').hidden = true; $('lg-err').textContent = ''; ticket = ''; });
  $('out').addEventListener('click', function () { if (!window.confirm('Sign out of the admin dashboard?')) return; api('POST', 'logout').then(function () { showLogin('You are signed out.'); }, function () { showLogin(); }); });

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
    activity: 'M3 12h4l3-8 4 16 3-8h4', audit: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5', announce: 'M4 10v4h3l7 4V6L7 10zM17 9a4 4 0 0 1 0 6', settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1-1-2h-4l-1 2-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1 1 2h4l1-2 2-1 2 1 2-4-2-1z' };
  var TABS = [
    ['overview', 'Overview', null], ['pairing', 'Pairing', null], ['visitors', 'Visitors', null], ['security', 'Security', null], ['server', 'Server', null],
    ['activity', 'Activity', null], ['audit', 'Audit log', 'audit.view'], ['announce', 'Announcements', null], ['settings', 'Settings', null],
  ];
  var alertCount = 0;
  function drawNav() {
    var nav = clear($('nav'));
    TABS.forEach(function (t) {
      if (t[2] && !can(t[2])) return;
      var b = h('button', { type: 'button', role: 'tab', id: 'tab-' + t[0], 'aria-selected': t[0] === tab ? 'true' : 'false', onclick: function () { go(t[0]); } },
        svg('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': 'true' }, svg('path', { d: ICON[t[0]], fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })),
        t[1], t[0] === 'security' && alertCount ? h('span', { class: 'n', text: alertCount }) : null);
      nav.appendChild(b);
    });
  }
  function go(t) {
    tab = t; try { history.replaceState(null, '', '#' + t); } catch (e) { /* fine */ }
    drawNav(); load(true);
    var sel = $('tab-' + t); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  var VIEWS = { overview: vOverview, pairing: vPairing, visitors: vVisitors, security: vSecurity, server: vServer, activity: vActivity, audit: vAudit, announce: vAnnounce, settings: vSettings };
  var REFRESH = { overview: 15000, pairing: 5000, visitors: 20000, security: 15000, server: 5000, activity: 8000, audit: 0, announce: 0, settings: 0 };
  var state = { visitors: { days: 1, kind: 'clients' }, activity: { type: '' } };

  function load(first) {
    var v = $('view'), t = tab;
    if (first) { clear(v); v.appendChild(h('div', { class: 'spin-c' }, h('span', { class: 'spin' }))); }
    return VIEWS[t]().then(function (node) {
      if (t !== tab) return;
      var keep = window.scrollY; clear(v); v.appendChild(node); if (!first) window.scrollTo(0, keep);
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
  function head(title, sub, right) { return h('div', { class: 'vh' }, h('div', null, h('h2', { text: title }), sub ? h('div', { class: 'sub', text: sub }) : null), right || null); }
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
    cells.forEach(function (c) { r.appendChild(h('div', { class: 'td' + (c.mono ? ' mono' : ''), 'data-l': c.l, role: 'cell' }, c.node || c.v)); });
    r.appendChild(h('div', { class: 'td act' }, actions || null));
    return r;
  }
  function meter(label, value, text, max) { var p = Math.max(0, Math.min(100, max ? value / max * 100 : value)); return h('div', { class: 'meter' }, h('div', { class: 'mh' }, h('span', { text: label }), h('span', { text: text })), svg('svg', { viewBox: '0 0 100 10', preserveAspectRatio: 'none', role: 'img', 'aria-label': label + ' ' + text }, svg('rect', { class: 'track', x: 0, y: 0, width: 100, height: 10, rx: 5 }), svg('rect', { class: 'fill' + (p > 85 ? ' high' : ''), x: 0, y: 0, width: Math.max(1.5, p), height: 10, rx: 5 }))); }
  function bars(series, a, b) {
    var W = 320, H = 110, pad = 16, max = Math.max.apply(null, series.map(function (s) { return Math.max(s[a], s[b]); }).concat([1]));
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + (H + 16), class: 'chart', role: 'img', 'aria-label': 'Pairing attempts and linked accounts per hour, last 24 hours' });
    var bw = (W - pad) / series.length;
    g.appendChild(svg('line', { class: 'axis', x1: 0, y1: H, x2: W, y2: H }));
    series.forEach(function (s, i) {
      var x = pad / 2 + i * bw, ha = s[a] / max * (H - 8), hb = s[b] / max * (H - 8);
      if (s[a]) g.appendChild(svg('rect', { class: 'bar', x: x + 1, y: H - ha, width: Math.max(2, bw - 3), height: ha, rx: 2 }));
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
  function confirmThen(msg, fn) { if (window.confirm(msg)) fn(); }

  // ---------- Overview ----------
  function vOverview() {
    return Promise.all([api('GET', 'overview'), api('GET', 'settings'), api('GET', 'announcements')]).then(function (r) {
      var o = r[0], s = r[1], an = r[2].announcements.filter(function (a) { return a.active && (!a.endsAt || a.endsAt > Date.now()); });
      var t = o.totals; pollAlerts();
      var n = h('div');
      n.appendChild(head('Overview', 'Last 24 hours' + (o.since ? ' · activity recorded since ' + when(o.since) : ''), h('span', { class: 'tag ' + (o.now.maintenance ? 'bad' : 'ok'), text: o.now.maintenance ? 'Maintenance ON' : 'Site live' })));
      if (o.now.maintenance) n.appendChild(h('div', { class: 'banner' }, 'Pairing is paused for everyone (maintenance mode).'));
      n.appendChild(h('div', { class: 'grid' },
        stat('Pairing attempts', String(t.attempts), t.codes + ' codes · ' + t.qrs + ' QR'),
        stat('Linked', String(t.linked), 'accounts linked', 'good'),
        stat('Failed', String(t.failed), t.invalid + ' invalid numbers', t.failed ? 'warn' : ''),
        stat('Success rate', o.successRate === null ? '—' : pct(o.successRate), o.successRate === null ? 'no finished attempts yet' : 'linked ÷ finished'),
        stat('Live session IDs', String(o.now.liveSessionIds), 'waiting for the bot'),
        stat('Attempts running', String(o.now.activeAttempts), 'right now'),
        stat('Security alerts', String(o.alerts), 'last hour / day', o.alerts ? 'bad' : 'good'),
        stat('Blocks', String(o.now.blocks), t.blocked + ' blocked attempts')));
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
      n.appendChild(head('Visitors', 'People and numbers seen pairing. There are no user accounts: visitors are shown as short fingerprints, numbers are masked.', null));
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
          return row([{ l: 'Visitor', v: c.id, mono: true }, { l: 'Address', v: c.ip || '—', mono: true }, { l: 'Attempts', v: String(c.attempts) }, { l: 'Linked / failed', v: c.linked + ' / ' + c.failed }, { l: 'Limited', v: String(c.limited + c.blocked) }, { l: 'Numbers', v: String(c.numbers) }, { l: 'Last seen', v: ago(c.lastSeen) }, { l: 'Status', node: h('span', { class: 'tag ' + (c.blocked ? 'bad' : 'ok'), text: c.blocked ? 'blocked' : 'ok' }) }], blockBtn('client', c.id, c.blocked, 'visitor ' + c.id));
        });
        n.appendChild(panel('Visitors', String(j.clients.length), table(['Visitor', 'Address', 'Attempts', 'Linked / failed', 'Limited', 'Numbers', 'Last seen', 'Status', ''], rows, 'No visitors in this period.')));
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
    var hours = window.prompt('Block ' + label + '.\nFor how many hours? (0 = permanent)', '24'); if (hours === null) return;
    var n = Number(hours); if (!isFinite(n) || n < 0) { toast('Enter a number of hours.', true); return; }
    var reason = window.prompt('Reason (optional, shown in the audit log):', '') || '';
    done(n, reason);
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
      n.appendChild(h('div', { class: 'grid' }, stat('Uptime', dur(x.uptimeSec), 'since ' + when(x.startedAt)), stat('Version', x.version, 'Node ' + x.node), stat('CPU (this site)', pct(x.cpu.process), 'of one core'), stat('Memory used', mb(x.memory.rss), 'by the site')));
      var m = x.memory, cpuLimit = Math.max(100, x.cores * 100);
      var memBars = [meter('CPU of the site (of one core)', Math.min(100, x.cpu.process), pct(x.cpu.process), 100), meter('Machine CPU', x.cpu.system, pct(x.cpu.system), 100)];
      if (m.containerLimit) memBars.push(meter('Memory (this service)', m.containerUsed || m.rss, mb(m.containerUsed || m.rss) + ' of ' + mb(m.containerLimit), m.containerLimit));
      memBars.push(meter('Memory (whole machine)', m.systemTotal - m.systemFree, mb(m.systemTotal - m.systemFree) + ' of ' + mb(m.systemTotal), m.systemTotal));
      memBars.push(meter('Heap (JavaScript)', m.heapUsed, mb(m.heapUsed) + ' of ' + mb(m.heapTotal), m.heapTotal));
      if (x.storage.disk) memBars.push(meter('Storage (disk of the data folder)', x.storage.disk.total - x.storage.disk.free, mb(x.storage.disk.total - x.storage.disk.free) + ' of ' + mb(x.storage.disk.total), x.storage.disk.total));
      void cpuLimit;
      n.appendChild(h('div', { class: 'cols' }, panel('Usage', null, memBars),
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
