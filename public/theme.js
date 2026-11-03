// Runs before the page is painted, so there is no flash of the wrong theme.
// Dark is the default. A visitor's choice (the sun/moon button) is remembered on their own device.
(function () {
  var DEFAULT = 'dark'; // used only when the phone does not say which it prefers
  var t = null, mq = null;
  try { t = localStorage.getItem('tfx-theme'); } catch (e) { /* private mode: follow the phone */ }
  try { mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null; } catch (e) { /* no media queries */ }
  // a visitor's own choice (the sun/moon button) wins; otherwise the site follows the phone's light/dark setting
  function system() { return mq && mq.media !== 'not all' ? (mq.matches ? 'dark' : 'light') : DEFAULT; }
  var chosen = t === 'light' || t === 'dark';
  if (!chosen) t = system();
  document.documentElement.setAttribute('data-theme', t);
  // the hero picture stays hidden until it is decoded (app.js reveals it); this timer is only a safety net if that script never runs
  document.documentElement.classList.add('art-wait'); setTimeout(function () { document.documentElement.classList.remove('art-wait'); }, 3000);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'dark' ? '#0B0B0B' : '#FAF3E6');
  // the phone switches between light and dark (sunset, schedule, quick settings) while the page is open: follow it, unless the visitor chose
  if (mq && mq.addEventListener) mq.addEventListener('change', function () {
    var saved = null; try { saved = localStorage.getItem('tfx-theme'); } catch (e) { /* none */ }
    if (saved === 'light' || saved === 'dark') return;
    var root = document.documentElement, next = system();
    root.classList.add('switching'); root.setAttribute('data-theme', next);
    setTimeout(function () { root.classList.remove('switching'); }, 120);
    var tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', next === 'dark' ? '#0B0B0B' : '#FAF3E6');
    try { window.dispatchEvent(new Event('tfx-theme')); } catch (e) { /* older browser */ }
  });
  // Android phones get a lighter floating bar (same look, cheaper to draw while scrolling)
  try { if (/Android/i.test(navigator.userAgent)) document.documentElement.classList.add('android'); } catch (e) { /* normal page */ }
  // older / low-memory phones, or a visitor who asked for less data: a lighter page (fewer glowing effects, no blur)
  try {
    var n = navigator, c = n.connection || {};
    if ((n.deviceMemory && n.deviceMemory <= 2) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2) || c.saveData) document.documentElement.classList.add('lite');
  } catch (e) { /* normal page */ }
})();
