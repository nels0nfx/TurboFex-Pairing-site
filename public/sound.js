// Interface sounds: soft, round "tim" tones made on the spot with the browser's audio. No sound files.
// Quiet, gentle attack, short fade (nothing harsh, no noise, no loud beeps).
// Plays only after the visitor has touched the page, and can be switched off in the menu (remembered on this device).
(function () {
  var KEY = 'tfx-sound', ctx = null, master = null, on = true, last = {};
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* use the default */ }
  var AC = window.AudioContext || window.webkitAudioContext;

  function ready() {
    if (!AC) return false;
    try {
      if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination); }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    } catch (e) { return false; }
  }
  // phones only allow sound after a touch, so wake the audio on the first one
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { if (on) ready(); }, { once: true, passive: true, capture: true });
  });

  // one soft "tim": a pure tone with a tiny soft attack, a quiet bell-like overtone, rounded off by a low-pass filter,
  // and a short natural fade. No noise, no clicks, nothing sharp.
  function tim(at, freq, vol, len) {
    var t = ctx.currentTime + at, f = ctx.createBiquadFilter(), g = ctx.createGain(), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 0.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
    o2.type = 'sine'; o2.frequency.setValueAtTime(freq * 2.76, t); g2.gain.value = 0.16;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(f); f.connect(master);
    o.start(t); o2.start(t); o.stop(t + len + 0.02); o2.stop(t + len * 0.5);
  }

  var SOUNDS = {
    tap:        function () { tim(0, 1047, 0.10, 0.10); },
    press:      function () { tim(0, 784, 0.13, 0.13); tim(0.03, 1175, 0.07, 0.10); },
    tab:        function () { tim(0, 988, 0.09, 0.09); },
    open:       function () { tim(0, 784, 0.08, 0.09); tim(0.055, 1047, 0.08, 0.11); },
    close:      function () { tim(0, 1047, 0.07, 0.08); tim(0.055, 784, 0.07, 0.10); },
    themeLight: function () { tim(0, 880, 0.08, 0.10); tim(0.08, 1319, 0.08, 0.16); },
    themeDark:  function () { tim(0, 1319, 0.07, 0.10); tim(0.08, 880, 0.08, 0.16); },
    copy:       function () { tim(0, 1319, 0.08, 0.09); tim(0.07, 1760, 0.06, 0.12); },
    success:    function () { tim(0, 1047, 0.09, 0.16); tim(0.09, 1319, 0.09, 0.16); tim(0.18, 1568, 0.10, 0.30); },
    error:      function () { tim(0, 330, 0.14, 0.18); tim(0.11, 262, 0.12, 0.24); }
  };

  window.tfxSound = {
    play: function (name) {
      if (!on || !SOUNDS[name]) return;
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;   // never before the visitor has touched the page
      var now = Date.now();
      if (last[name] && now - last[name] < 90) return;                                   // no machine-gun repeats
      if (!ready()) return;
      last[name] = now;
      try { SOUNDS[name](); } catch (e) { /* sound is optional */ }
    },
    isOn: function () { return on; },
    set: function (v) { on = !!v; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* not saved */ } if (on) ready(); return on; }
  };
})();
