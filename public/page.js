// Script for the About, Terms and Privacy pages: the floating island (theme button, menu, shadow on scroll) and the year.
// The theme itself is set by theme.js before the page paints.
(function () {
  var root = document.documentElement, $ = function (id) { return document.getElementById(id); };
  var reduced = false; try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* normal motion */ }
  var btn = $('theme'), yr = $('yr'), bar = $('island'), menuBtn = $('menu'), menuPanel = $('menupanel');
  if (yr) yr.textContent = new Date().getFullYear();

  function sync() {
    var dark = root.getAttribute('data-theme') !== 'light';
    if (btn) { btn.setAttribute('aria-pressed', dark ? 'true' : 'false'); btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode'); }
    var tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', dark ? '#0B0B0B' : '#FAF3E6');
  }
  if (btn) btn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.classList.add('switching'); root.setAttribute('data-theme', next);
    setTimeout(function () { root.classList.remove('switching'); }, 120);
    try { localStorage.setItem('tfx-theme', next); } catch (e) { /* not saved, still works */ }
    sync();
  });
  window.addEventListener('tfx-theme', sync);
  sync();

  // floating island: deeper shadow once the page has scrolled; the menu closes when you scroll
  var open = false, at = 0, menuT = 0, ticking = false, scrollT = 0;
  function menuOpen(on) {
    if (!menuBtn || !menuPanel || on === open) return;
    open = on; clearTimeout(menuT);
    menuBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', on ? 'Close menu' : 'Open menu');
    if (on) { at = window.scrollY; menuPanel.classList.remove('out'); menuPanel.hidden = false; }
    else if (reduced) menuPanel.hidden = true;
    else { menuPanel.classList.add('out'); menuT = setTimeout(function () { menuPanel.hidden = true; menuPanel.classList.remove('out'); }, 200); }
  }
  if (menuBtn) menuBtn.addEventListener('click', function () { menuOpen(!open); });
  document.addEventListener('click', function (e) { if (open && !e.target.closest('#menupanel') && !e.target.closest('#menu')) menuOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) { menuOpen(false); menuBtn.focus(); } });
  window.addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      root.classList.add('scrolling'); clearTimeout(scrollT); scrollT = setTimeout(function () { root.classList.remove('scrolling'); }, 160);
      if (bar) bar.classList.toggle('scrolled', window.scrollY > 4);
      if (open && Math.abs(window.scrollY - at) > 30) menuOpen(false);
      ticking = false;
    });
  }, { passive: true });
})();
