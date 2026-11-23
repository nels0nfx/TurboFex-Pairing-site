// TurboFex colour mode: the ONE place that decides light or dark, for every page (public pages, Pair and the admin).
// It runs in the head, before the page is drawn, so there is no flash of the wrong colours.
//   - No saved choice  = "system": follow the phone or computer, and follow it live when it changes.
//   - The sun/moon button picks light or dark and remembers it on this device. Picking the same mode the phone already uses
//     goes back to "system", so the site keeps following the phone.
//   - Switching is instant: no reload, no loading screen, the scroll position is untouched, and no colour fade (a fade made some
//     parts flash light while others were still dark).
// Pages call TFTheme.toggle(); they never write the colour mode themselves.
(function (W, d) {
  var root = d.documentElement, KEY = 'tfx-theme', DARK = '#050506', LIGHT = '#f6f6f9', mq = null, swT = 0;
  try { mq = W.matchMedia ? W.matchMedia('(prefers-color-scheme: dark)') : null; } catch (e) { /* no media queries */ }
  function saved() { try { var s = W.localStorage.getItem(KEY); return s === 'light' || s === 'dark' ? s : null; } catch (e) { return null; } }
  function system() { return mq && mq.media !== 'not all' ? (mq.matches ? 'dark' : 'light') : 'dark'; }   // no answer from the device: dark
  function current() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function mode() { return saved() || 'system'; }
  function chrome(t) {   // the browser's own bars and form controls follow the page (the tags are replaced, not edited, so phones repaint them)
    var cs = d.querySelector('meta[name="color-scheme"]'); if (cs) cs.setAttribute('content', t);   // edited in place: replacing it makes the browser repaint its canvas in the other mode for a frame
    var m = d.querySelector('meta[name="theme-color"]'); if (!m) return;
    var x = d.createElement('meta'); x.name = 'theme-color'; x.content = t === 'light' ? LIGHT : DARK; m.parentNode.replaceChild(x, m);   // replaced so phones repaint their top bar
  }
  function apply(t, fade) {
    if (t === current() && !fade) return;
    // no element may fade its own colours during the switch (a component with its own colour transition would stay light for a moment):
    // transitions are switched off, the new colours are applied and drawn, and only then do transitions come back
    root.classList.add('tf-sw'); root.setAttribute('data-theme', t); chrome(t); void root.offsetWidth;
    clearTimeout(swT); swT = setTimeout(function () { root.classList.remove('tf-sw'); }, 120);
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
