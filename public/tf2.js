// Shared behaviour for the redesigned pages: menu, current-page mark, live status in the footer, site notice, year.
// Text only: nothing from the server is ever put into the page as HTML.
(function () {
  'use strict';
  var d = document;

  // menu
  var btn = d.getElementById('menu'), panel = d.getElementById('menupanel');
  function setMenu(on) {
    if (!btn || !panel) return;
    panel.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  if (btn && panel) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); setMenu(panel.hidden); });
    d.addEventListener('click', function (e) { if (!panel.hidden && !panel.contains(e.target)) setMenu(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { setMenu(false); btn.focus(); } });
  }

  // mark where you are
  var here = location.pathname.replace(/\/+$/, '') || '/';
  [].forEach.call(d.querySelectorAll('.menu a'), function (a) {
    try { var u = new URL(a.href, location.href); if (u.origin === location.origin && (u.pathname.replace(/\/+$/, '') || '/') === here) a.setAttribute('aria-current', 'page'); } catch (e) { /* skip */ }
  });

  var yr = d.getElementById('yr'); if (yr) yr.textContent = String(new Date().getFullYear());

  // live status: only what the server really says. /health must answer ok, and /api/status says whether the site is paused.
  var pill = d.getElementById('status'), label = pill && pill.querySelector('span');
  function setStatus(state, text) { if (!pill) return; pill.setAttribute('data-state', state); if (label) label.textContent = text; }
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
    if (!health || health.ok !== true) { setStatus('down', 'Status unavailable'); return; }
    var maint = st && st.maintenance && st.maintenance.on;
    setStatus(maint ? 'paused' : 'ok', maint ? 'Paused for maintenance' : 'Server online');
    if (maint) notice('maint', String(st.maintenance.message || ''), 'm', false);
    var a = st && st.announcement;
    if (a && a.text && !seen(a.id)) notice('info', String(a.text), a.id, true);
  }).catch(function () { setStatus('down', 'Status unavailable'); });
})();
