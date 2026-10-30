// Runs before the page is painted, so there is no flash of the wrong theme.
// Dark is the default. A visitor's choice (the sun/moon button) is remembered on their own device.
(function () {
  var DEFAULT = 'dark'; // change to 'light' to make light the default
  var t = null;
  try { t = localStorage.getItem('tfx-theme'); } catch (e) { /* private mode: just use the default */ }
  if (t !== 'light' && t !== 'dark') t = DEFAULT;
  document.documentElement.setAttribute('data-theme', t);
  // the phone's status bar takes the colour of the header
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'dark' ? '#111111' : '#0B0B0B');
})();
