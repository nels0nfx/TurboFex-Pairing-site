// Background music, shared by every page of the site (home, About, Terms, Privacy).
// An original soft ambient loop. Browsers allow sound only after a tap, so it starts at once where allowed, otherwise on the first tap.
// Moving between pages keeps the same place in the loop (saved for the current tab only), so it carries on instead of starting over.
(function () {
  var KEY = 'tfx-music', POS = 'tfx-music-pos', vol = 0.1, au = null, want = true, started = false, fade = 0, saver = 0;
  try { if (localStorage.getItem(KEY) === 'off') want = false; } catch (e) { /* default: on */ }
  function $(id) { return document.getElementById(id); }
  function label() {
    var m = $('m-music'), t = $('m-music-t'), d = $('d-music');
    if (m) m.setAttribute('aria-checked', want ? 'true' : 'false');
    if (t) t.textContent = 'Music: ' + (want ? 'On' : 'Off');
    if (d) { d.setAttribute('aria-pressed', want ? 'true' : 'false'); d.setAttribute('aria-label', want ? 'Music on. Turn off' : 'Music off. Turn on'); d.title = want ? 'Music: On' : 'Music: Off'; }
  }
  function savePos() {
    if (!au || !isFinite(au.currentTime)) return;
    try { sessionStorage.setItem(POS, JSON.stringify({ t: au.currentTime, at: Date.now() })); } catch (e) { /* fine */ }
  }
  function resumeAt() {
    try {
      var s = JSON.parse(sessionStorage.getItem(POS) || 'null');
      if (s && typeof s.t === 'number' && Date.now() - s.at < 60000) return s.t + (Date.now() - s.at) / 1000;
    } catch (e) { /* start from the beginning */ }
    return 0;
  }
  function ramp(to, done) {
    clearInterval(fade); if (!au) return;
    fade = setInterval(function () {
      var d = to - au.volume;
      if (Math.abs(d) < 0.02) { au.volume = to; clearInterval(fade); if (done) done(); return; }
      au.volume = Math.max(0, Math.min(1, au.volume + (d > 0 ? 0.02 : -0.03)));
    }, 60);
  }
  function make() {
    au = new Audio('/tfx-ambient.m4a'); au.loop = true; au.preload = 'auto'; au.volume = 0;
    var at = resumeAt();
    if (at > 0) au.addEventListener('loadedmetadata', function () { try { au.currentTime = at % (au.duration || 1e9); } catch (e) { /* from the start */ } }, { once: true });
  }
  function play() {
    if (!want || document.hidden) return;
    if (!au) make();
    var p = au.play();
    function ok() { started = true; ramp(vol); clearInterval(saver); saver = setInterval(savePos, 1000); }
    if (p && p.then) p.then(ok).catch(function () { started = false; }); else ok();
  }
  function stop() { clearInterval(saver); if (au && !au.paused) ramp(0, function () { au.pause(); }); }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function (t) {
    document.addEventListener(t, function () { if (!started && want) setTimeout(play, 0); }, true);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { savePos(); clearInterval(saver); if (au && !au.paused) { clearInterval(fade); au.pause(); } }
    else if (want && started) play();
  });
  window.addEventListener('pagehide', savePos);
  function toggle() {
    want = !want; try { localStorage.setItem(KEY, want ? 'on' : 'off'); } catch (e) { /* not saved */ }
    label(); if (want) play(); else stop();
  }
  ['m-music', 'd-music'].forEach(function (id) { var b = $(id); if (b) b.addEventListener('click', toggle); });
  label();
  if (!(navigator.connection && navigator.connection.saveData)) play();
})();
