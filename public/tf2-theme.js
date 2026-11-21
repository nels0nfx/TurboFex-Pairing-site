// Sets the colour mode before the page is drawn, so there is no flash. Dark is the default; the choice is remembered on this device.
(function () {
  var t = 'dark';
  try { var s = localStorage.getItem('tfx-theme'); if (s === 'light' || s === 'dark') t = s; } catch (e) { /* storage blocked: stay dark */ }
  document.documentElement.setAttribute('data-theme', t);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'light' ? '#f6f6f9' : '#050506');
})();
