// Shared page behaviour for the redesigned pages: header shadow, theme button, drop-down menu, current-page marks, footer year.
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var head = d.getElementById('head');
  function stuck() { if (head) head.classList.toggle('stuck', (window.scrollY || 0) > 8); }
  addEventListener('scroll', stuck, { passive: true }); stuck();

  var tb = d.getElementById('theme');
  if (tb) tb.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('tfx-theme', next); } catch (e) { /* not saved */ }
    var m = d.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', next === 'dark' ? '#070707' : '#FBF7EE');
    try { window.dispatchEvent(new Event('tfx-theme')); } catch (e) { /* older browser */ }
  });

  var btn = d.getElementById('menu'), panel = d.getElementById('menupanel');
  function setMenu(on) {
    if (!btn || !panel) return;
    if (on) { panel.hidden = false; panel.classList.remove('out'); btn.setAttribute('aria-expanded', 'true'); var f = panel.querySelector('a,button'); if (f) f.focus(); }
    else { btn.setAttribute('aria-expanded', 'false'); panel.classList.add('out'); setTimeout(function () { if (btn.getAttribute('aria-expanded') !== 'true') { panel.hidden = true; panel.classList.remove('out'); } }, 200); }
  }
  if (btn && panel) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); setMenu(btn.getAttribute('aria-expanded') !== 'true'); });
    d.addEventListener('click', function (e) { if (!panel.hidden && !panel.contains(e.target)) setMenu(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { setMenu(false); btn.focus(); } });
  }

  // mark where you are
  var path = location.pathname.replace(/\/+$/, '') || '/';
  [].forEach.call(d.querySelectorAll('.tfx-links a, .tabbar a:not(.mid), .menu a'), function (a) {
    try { var u = new URL(a.href, location.href); if (u.origin === location.origin && (u.pathname.replace(/\/+$/, '') || '/') === path) a.setAttribute('aria-current', 'page'); } catch (e) { /* skip */ }
  });
  var yr = d.getElementById('yr'); if (yr) yr.textContent = String(new Date().getFullYear());
})();
