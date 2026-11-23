// Small page settings that run before the page is painted (lighter page on weak phones, Android bar).
(function () {
  // (the light/dark choice itself is made by tf2-theme.js, which every page loads first)
  // the hero picture stays hidden until it is decoded (app.js reveals it); this timer is only a safety net if that script never runs
  document.documentElement.classList.add('art-wait'); setTimeout(function () { document.documentElement.classList.remove('art-wait'); }, 3000);
  // Android phones get a lighter floating bar (same look, cheaper to draw while scrolling)
  try { if (/Android/i.test(navigator.userAgent)) document.documentElement.classList.add('android'); } catch (e) { /* normal page */ }
  // older / low-memory phones, or a visitor who asked for less data: a lighter page (fewer glowing effects, no blur)
  try {
    var n = navigator, c = n.connection || {};
    if ((n.deviceMemory && n.deviceMemory <= 2) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2) || c.saveData) document.documentElement.classList.add('lite');
  } catch (e) { /* normal page */ }
})();
