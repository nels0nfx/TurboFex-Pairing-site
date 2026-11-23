// TurboFex colour mode: the ONE place that decides light or dark, for every page (public pages, Pair and the admin).
// It runs in the head, before the page is drawn, so there is no flash of the wrong colours.
//   - No saved choice  = "system": follow the phone or computer, and follow it live when it changes.
//   - The sun/moon button picks light or dark and remembers it on this device. Picking the same mode the phone already uses
//     goes back to "system", so the site keeps following the phone.
//   - Switching is instant: no reload, no loading screen, the scroll position is untouched. A very short colour fade (0.18 s) runs
//     only when motion is allowed, and it never blocks a tap.
// Pages call TFTheme.toggle(); they never write the colour mode themselves.
(function (W, d) {
  var root = d.documentElement, KEY = 'tfx-theme', DARK = '#050506', LIGHT = '#f6f6f9', mq = null, fadeT = 0;
  try { mq = W.matchMedia ? W.matchMedia('(prefers-color-scheme: dark)') : null; } catch (e) { /* no media queries */ }
  function saved() { try { var s = W.localStorage.getItem(KEY); return s === 'light' || s === 'dark' ? s : null; } catch (e) { return null; } }
  function system() { return mq && mq.media !== 'not all' ? (mq.matches ? 'dark' : 'light') : 'dark'; }   // no answer from the device: dark
  function current() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function mode() { return saved() || 'system'; }
  function chrome(t) {   // the browser's own bars and form controls follow the page (the tags are replaced, not edited, so phones repaint them)
    ['theme-color', 'color-scheme'].forEach(function (n) {
      var m = d.querySelector('meta[name="' + n + '"]'); if (!m) return;
      var x = d.createElement('meta'); x.name = n; x.content = n === 'color-scheme' ? t : (t === 'light' ? LIGHT : DARK); m.parentNode.replaceChild(x, m);
    });
  }
  function apply(t, fade) {
    if (t === current() && !fade) return;
    var calm = !W.matchMedia || !W.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (fade && calm) { root.classList.add('tf-tt'); clearTimeout(fadeT); fadeT = setTimeout(function () { root.classList.remove('tf-tt'); }, 260); }
    root.setAttribute('data-theme', t); chrome(t);
    try { W.dispatchEvent(new Event('tfx-theme')); } catch (e) { /* older browser */ }
  }
  var t0 = saved() || system();
  root.setAttribute('data-theme', t0); chrome(t0);
  W.TFTheme = {
    mode: mode, current: current,
    set: function (t) {   // 'light' | 'dark' | 'system'
      try { if (t === 'system') W.localStorage.removeItem(KEY); else W.localStorage.setItem(KEY, t); } catch (e) { /* cannot save: it still works for this visit */ }
      apply(t === 'system' ? system() : t, true);
    },
    toggle: function () { var next = current() === 'light' ? 'dark' : 'light'; this.set(next === system() ? 'system' : next); return next; },
  };
  // the phone switches between light and dark (sunset, schedule, quick settings) while the page is open: follow it, unless the visitor chose
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (!saved()) apply(system(), true); });
  // another open tab of the site changed the choice: follow it
  W.addEventListener('storage', function (e) { if (e.key === KEY) apply(saved() || system(), true); });
})(window, document);
