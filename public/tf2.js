// Shared behaviour for the redesigned pages: menu, current-page mark, live status in the footer, site notice, year.
// Text only: nothing from the server is ever put into the page as HTML.
(function () {
  'use strict';
  var d = document;

  // menu
  var btn = d.getElementById('tmenu'), panel = d.getElementById('tmenupanel');
  function setMenu(on) {
    if (!btn || !panel) return;
    panel.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  if (btn && panel) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); setMenu(panel.hidden); });
    d.addEventListener('click', function (e) { if (!panel.hidden && !panel.contains(e.target)) setMenu(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { setMenu(false); btn.focus(); } });
  }

  // dark / light switch (the saved choice is applied earlier by tf2-theme.js)
  var tg = d.getElementById('ttheme');
  function paintToggle() {
    var light = d.documentElement.getAttribute('data-theme') === 'light';
    if (tg) { tg.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode'); tg.setAttribute('aria-pressed', light ? 'true' : 'false'); }
    var m = d.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', light ? '#f6f6f9' : '#050506');
  }
  if (tg) {
    paintToggle();
    tg.addEventListener('click', function () {
      var next = d.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      d.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('tfx-theme', next); } catch (e) { /* cannot save: it still works for this visit */ }
      paintToggle();
    });
  }

  // mark where you are
  var here = location.pathname.replace(/\/+$/, '') || '/';
  [].forEach.call(d.querySelectorAll('.menu a'), function (a) {
    try { var u = new URL(a.href, location.href); if (u.origin === location.origin && (u.pathname.replace(/\/+$/, '') || '/') === here) a.setAttribute('aria-current', 'page'); } catch (e) { /* skip */ }
  });

  var yr = d.getElementById('yr'); if (yr) yr.textContent = String(new Date().getFullYear());


  // "Where to run it" tabs and Copy buttons (without this script every guide simply stays visible, one under the other)
  var tabs = d.querySelectorAll('[data-t]'), panes = d.querySelectorAll('[data-p]');
  function pick(i) {
    [].forEach.call(tabs, function (b) { b.setAttribute('aria-selected', b.getAttribute('data-t') === i ? 'true' : 'false'); });
    [].forEach.call(panes, function (p) { p.hidden = p.getAttribute('data-p') !== i; });
  }
  if (tabs.length) {
    [].forEach.call(tabs, function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-t')); }); });
    var first = location.hash.length > 1 && d.querySelector('[data-t][data-key="' + location.hash.slice(1).replace(/[^a-z0-9-]/gi, '') + '"]');
    pick(first ? first.getAttribute('data-t') : '0');
  }
  [].forEach.call(d.querySelectorAll('[data-copy]'), function (b) {
    b.addEventListener('click', function () {
      var pre = b.closest('.code').querySelector('pre'), text = pre ? pre.textContent.replace(/\n+$/, '') : '', label = b.querySelector('span');
      function done(ok) { if (label) { label.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(function () { label.textContent = 'Copy'; }, 1800); } }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
  });

  // live status: only what the server really says. /health must answer ok, and /api/status says whether the site is paused.
  var pill = d.getElementById('sitestatus'), label = pill && pill.querySelector('span');
  function setStatus(state, text) { if (!pill) return; pill.setAttribute('data-state', state); if (label) label.textContent = text; }

  // Pair page: a small card with the real state of the pairing service
  var pl = d.getElementById('pairlive');
  function pairLive(state, text) { if (!pl) return; pl.setAttribute('data-state', state); pl.querySelector('span').textContent = text; }
  function notice(kind, text, id, closable) {
    var box = d.createElement('div'); box.className = 'notice ' + kind; box.setAttribute('role', kind === 'maint' ? 'alert' : 'status');
    var p = d.createElement('p'); p.textContent = text; box.appendChild(p);
    if (closable) {
      var b = d.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Dismiss'); b.textContent = '×';
      b.addEventListener('click', function () { try { sessionStorage.setItem('tfx-notice', id); } catch (e) { /* fine */ } box.remove(); });
      box.appendChild(b);
    }
    d.body.insertBefore(box, d.body.firstChild);
  }
  function seen(id) { try { return sessionStorage.getItem('tfx-notice') === id; } catch (e) { return false; } }
  function get(url) { return fetch(url, { cache: 'no-store', credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); }); }
  Promise.all([get('/health'), get('/api/status')]).then(function (res) {
    var health = res[0], st = res[1];
    if (!health || health.ok !== true) { setStatus('down', 'Status unavailable'); pairLive('down', 'The pairing service cannot be reached right now.'); return; }
    var maint = st && st.maintenance && st.maintenance.on;
    setStatus(maint ? 'paused' : 'ok', maint ? 'Paused for maintenance' : 'Server online');
    var mins = health.sessionMinutes ? ' Session IDs last ' + health.sessionMinutes + ' minutes.' : '';
    pairLive(maint ? 'paused' : 'ok', maint ? 'Pairing is paused for maintenance.' : 'Pairing is available.' + mins);
    if (maint) notice('maint', String(st.maintenance.message || ''), 'm', false);
    var a = st && st.announcement;
    if (a && a.text && !seen(a.id)) notice('info', String(a.text), a.id, true);
  }).catch(function () { setStatus('down', 'Status unavailable'); pairLive('down', 'The pairing service cannot be reached right now.'); });
})();
