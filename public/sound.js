// Interface sounds: a short, crisp, soft "mechanical key" tick made on the spot with the browser's audio.
// No sound files. Quiet, with a tiny soft attack and a very quick decay (no beeps, nothing hollow).
// Plays only after the visitor has touched the page, and can be switched off in the menu (remembered on this device).
(function () {
  var KEY = 'tfx-sound', ctx = null, master = null, on = true, buf = null, last = {};
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* use the default */ }
  var AC = window.AudioContext || window.webkitAudioContext;

  function ready() {
    if (!AC) return false;
    try {
      if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination); }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    } catch (e) { return false; }
  }
  // phones only allow sound after a touch, so wake the audio on the first one
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { if (on) ready(); }, { once: true, passive: true, capture: true });
  });

  // a few milliseconds of noise that fades out by itself: this is the "click" material
  function noise() {
    if (buf) return buf;
    var n = Math.floor(ctx.sampleRate * 0.05), d;
    buf = ctx.createBuffer(1, n, ctx.sampleRate); d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    return buf;
  }
  // one click: noise through a narrow band (pitch = how "sharp" it sounds), 1.5 ms soft attack, quick decay
  function click(at, freq, q, vol, len) {
    var t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + len + 0.01);
  }
  // a very short, quiet body under the click so it feels like a key and not just a hiss
  function body(at, f0, f1, vol) {
    var t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.012);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.02);
  }

  var SOUNDS = {
    tap:        function () { click(0, 3400, 1.5, 0.30, 0.016); body(0, 2300, 1500, 0.035); },
    press:      function () { click(0, 2900, 1.3, 0.38, 0.020); click(0.024, 1900, 1.1, 0.16, 0.014); body(0, 1900, 1200, 0.045); },
    tab:        function () { click(0, 3900, 1.7, 0.26, 0.014); },
    open:       function () { click(0, 3100, 1.4, 0.26, 0.016); },
    close:      function () { click(0, 2400, 1.4, 0.22, 0.016); },
    themeLight: function () { click(0, 3400, 1.6, 0.26, 0.014); click(0.06, 5200, 1.8, 0.24, 0.014); },
    themeDark:  function () { click(0, 5200, 1.8, 0.24, 0.014); click(0.06, 3400, 1.6, 0.26, 0.014); },
    copy:       function () { click(0, 4300, 1.8, 0.24, 0.012); click(0.065, 4300, 1.8, 0.2, 0.012); },
    success:    function () { click(0, 3300, 1.6, 0.26, 0.016); click(0.08, 4700, 1.8, 0.26, 0.018); click(0.085, 7500, 1.2, 0.05, 0.1); },
    error:      function () { click(0, 1100, 0.9, 0.42, 0.045); body(0, 220, 130, 0.04); }
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
