// Small script for the About and Terms pages: theme button and year (the theme itself is set by theme.js before the page paints).
(function () {
  var root = document.documentElement, btn = document.getElementById('theme'), yr = document.getElementById('yr');
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
  sync();
})();
