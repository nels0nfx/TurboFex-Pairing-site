// Soft interface sounds, made on the spot with the browser's audio (no sound files to download).
// Quiet and short. Off with the "Sound" switch in the menu; the choice is remembered on this device.
(function () {
  var KEY = 'tfx-sound', ctx = null, master = null, on = true;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* use the default */ }
  var AC = window.AudioContext || window.webkitAudioContext;

  function ready() {
    if (!AC) return false;
    try {
      if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination); }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    } catch (e) { return false; }
  }
  // phones only allow sound after a touch, so wake the audio on the first one
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { if (on) ready(); }, { once: true, passive: true, capture: true });
  });

  // one soft note: pitch, start (seconds from now), length, volume, wave
  function note(freq, at, len, vol, type, slideTo) {
    var t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
    f.type = 'lowpass'; f.frequency.value = 4200;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);      // a gentle start, no click
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);      // a smooth fade
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t); o.stop(t + len + 0.03);
  }

  var SOUNDS = {
    tap:        function () { note(720, 0, 0.07, 0.07, 'sine', 560); },
    press:      function () { note(520, 0, 0.09, 0.08, 'sine', 780); note(1040, 0.03, 0.08, 0.03, 'sine'); },
    tab:        function () { note(640, 0, 0.08, 0.07, 'triangle', 800); },
    open:       function () { note(520, 0, 0.1, 0.06, 'sine', 740); },
    close:      function () { note(740, 0, 0.1, 0.05, 'sine', 520); },
    themeLight: function () { note(523, 0, 0.12, 0.07, 'sine'); note(784, 0.07, 0.18, 0.07, 'sine'); },
    themeDark:  function () { note(784, 0, 0.12, 0.07, 'sine'); note(523, 0.07, 0.18, 0.07, 'sine'); },
    copy:       function () { note(988, 0, 0.07, 0.06, 'sine'); note(1318, 0.06, 0.12, 0.06, 'sine'); },
    success:    function () { note(523, 0, 0.3, 0.07, 'sine'); note(659, 0.1, 0.3, 0.07, 'sine'); note(784, 0.2, 0.32, 0.07, 'sine'); note(1047, 0.32, 0.6, 0.08, 'sine'); },
    error:      function () { note(330, 0, 0.16, 0.08, 'triangle', 280); note(247, 0.14, 0.26, 0.08, 'triangle', 200); }
  };

  window.tfxSound = {
    play: function (name) {
      if (!on || !SOUNDS[name] || !ready()) return;
      try { SOUNDS[name](); } catch (e) { /* sound is optional */ }
    },
    isOn: function () { return on; },
    set: function (v) { on = !!v; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* not saved */ } if (on) ready(); return on; }
  };
})();
