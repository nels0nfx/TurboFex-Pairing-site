(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MAX_SECONDS = 240;
  var job = null, poll = null, method = 'code', dmPolls = 0, lastCode = '';
  var submitting = false, checking = false, reqId = 0;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // lets :active (the press effect) work on iPhone Safari
  document.addEventListener('touchstart', function () {}, { passive: true });

  // theme switch (dark is the default; the choice is remembered on this device)
  var root = document.documentElement, themeBtn = $('theme');
  function syncTheme() {
    var dark = root.getAttribute('data-theme') !== 'light';
    themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
  themeBtn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    function apply() {
      root.setAttribute('data-theme', next);
      var tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', next === 'dark' ? '#0B0B0B' : '#F8F6F0');
      try { localStorage.setItem('tfx-theme', next); } catch (e) { /* not saved, still works */ }
      syncTheme();
    }
    if (reduced) { apply(); return; }
    if (document.startViewTransition) {                  // whole page cross-fades (gradients included)
      try { document.startViewTransition(apply); return; } catch (e) { /* fall through */ }
    }
    root.classList.add('theming');                       // fallback: colours fade
    apply();
    clearTimeout(themeBtn._t);
    themeBtn._t = setTimeout(function () { root.classList.remove('theming'); }, 350);
  });
  syncTheme();

  // floating navigation: a deeper shadow once the page has scrolled, and the menu closes when you scroll
  var bar = $('island'), ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      bar.classList.toggle('scrolled', window.scrollY > 4);
      if (menuIsOpen && Math.abs(window.scrollY - menuAt) > 30) menuOpen(false);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // the travelling light runs along the pill's outline: size its rectangles to the pill (also while it grows or shrinks)
  var flow = $('flow');
  function flowLayout() {
    var w = bar.offsetWidth, h = bar.offsetHeight;
    if (!flow || !w || !h) return;
    var r = parseFloat(getComputedStyle(bar).borderTopLeftRadius) || h / 2;
    r = Math.max(0, Math.min(r, h / 2, w / 2));
    var P = 9, rects = flow.children;
    for (var i = 0; i < rects.length; i++) {
      var echo = rects[i].getAttribute('class') === 'echo', d = echo ? -6 : 1;
      rects[i].setAttribute('x', P + d); rects[i].setAttribute('y', P + d);
      rects[i].setAttribute('width', Math.max(0, w - 2 * d)); rects[i].setAttribute('height', Math.max(0, h - 2 * d));
      rects[i].setAttribute('rx', Math.max(0, r - d)); rects[i].setAttribute('ry', Math.max(0, r - d));
    }
  }
  if (window.ResizeObserver) new ResizeObserver(flowLayout).observe(bar); else window.addEventListener('resize', flowLayout);
  flowLayout();

  // the navigation pill grows to show the pairing status (idle -> working -> ok / bad)
  var islText = $('isl-text'), islT = 0, islLock = false;
  function islandSet(state, text) {
    if (islLock && state !== 'idle') return;           // a finished result stays until the next attempt
    if (bar.getAttribute('data-state') === state && (!text || islText.textContent === text)) return;
    clearTimeout(islT);
    var drawer = bar.querySelector('.isl-drawer');
    if (state !== 'idle') drawer.setAttribute('aria-hidden', 'false');
    if (text) islText.textContent = text;
    bar.setAttribute('data-state', state);
    if (state === 'ok' || state === 'bad') {
      islLock = true;
      islT = setTimeout(function () { bar.setAttribute('data-state', 'idle'); drawer.setAttribute('aria-hidden', 'true'); }, 7000);
    }
    if (state === 'idle') drawer.setAttribute('aria-hidden', 'true');
  }
  function islandReset() { islLock = false; islandSet('idle'); }

  // menu (opens under the pill)
  var menuBtn = $('menu'), menuPanel = $('menupanel'), menuIsOpen = false, menuAt = 0, menuT = 0;
  function menuOpen(on) {
    if (on === menuIsOpen) return;
    menuIsOpen = on; clearTimeout(menuT);
    menuBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', on ? 'Close menu' : 'Open menu');
    if (on) { menuAt = window.scrollY; menuPanel.classList.remove('out'); menuPanel.hidden = false; syncMenu(); }
    else if (reduced) { menuPanel.hidden = true; }
    else { menuPanel.classList.add('out'); menuT = setTimeout(function () { menuPanel.hidden = true; menuPanel.classList.remove('out'); }, 200); }
  }
  function syncMenu() {
    var free = !$('step-number').hidden && !submitting;     // the shortcuts only work on the first screen
    $('m-code').disabled = !free; $('m-qr').disabled = !free;
  }
  menuBtn.addEventListener('click', function () { menuOpen(!menuIsOpen); });
  document.addEventListener('click', function (e) { if (menuIsOpen && !e.target.closest('#menupanel') && !e.target.closest('#menu')) menuOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menuIsOpen) { menuOpen(false); menuBtn.focus(); } });
  function menuPick(m) {
    menuOpen(false);
    setMethod(m);
    try { $('step-number').scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }); } catch (e) { /* older browsers */ }
  }
  $('m-code').addEventListener('click', function () { menuPick('code'); });
  $('m-qr').addEventListener('click', function () { menuPick('qr'); });
  onScroll();

  // swaps text with a short fade. Rapid calls keep only the latest text, so nothing flickers.
  function swapText(el, text) {
    if (el._t) clearTimeout(el._t);
    if (!el._t && el.textContent === text) return;
    if (reduced) { el.textContent = text; el.classList.remove('out'); el._t = 0; return; }
    el.classList.add('out');
    el._t = setTimeout(function () { el.textContent = text; el.classList.remove('out'); el._t = 0; }, 140);
  }
  // button feedback states: 'done' (copied), 'fail', 'shake'
  function flash(btn, cls, ms) {
    btn.classList.remove('done', 'fail', 'shake'); void btn.offsetWidth;
    btn.classList.add(cls);
    if (btn._f) clearTimeout(btn._f);
    btn._f = setTimeout(function () { btn.classList.remove(cls); btn._f = 0; }, ms || 1800);
  }

  // ---------- helpers ----------
  function show(step) {
    ['step-number', 'step-wait', 'step-done'].forEach(function (s) {
      var el = $(s);
      var on = s === step;
      el.hidden = !on;
      if (on) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (menuIsOpen) syncMenu();
  }
  function setText(el, msg) { el.textContent = msg || ''; el.hidden = !msg; }
  function stop() { if (poll) clearInterval(poll); poll = null; }

  // countdown for the finished session ID. The server sends how many seconds are left and also enforces it.
  var idTimer = null, idEnd = 0;
  function fmtLeft(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function idStop() { if (idTimer) clearInterval(idTimer); idTimer = null; idEnd = 0; }
  function idExpired() {
    idStop();
    $('idtimer').textContent = 'This session ID has expired. Link again to get a new one.';
    $('idtimer').classList.add('gone');
    $('sid').classList.add('expired'); $('sid').setAttribute('aria-disabled', 'true'); $('sid').tabIndex = -1;
    $('sid').textContent = 'Expired';
    $('env').textContent = 'SESSION_ID=(expired)';
    $('copy').disabled = true; $('copyenv').disabled = true;
  }
  function idTick() {
    var left = Math.max(0, Math.ceil((idEnd - Date.now()) / 1000));
    if (left <= 0) { idExpired(); return; }
    $('idtimer').textContent = 'Expires in ' + fmtLeft(left);
    $('idtimer').classList.toggle('low', left <= 60);
  }
  function idStart(seconds) {
    if (idTimer || seconds <= 0) return;
    idEnd = Date.now() + seconds * 1000;
    $('idtimer').classList.remove('gone', 'low');
    idTick(); idTimer = setInterval(idTick, 1000);
  }

  // copies text and shows a success (gold) or failure state on the button
  function copy(text, btn, labelEl) {
    labelEl = labelEl || btn;
    if (!labelEl._old) labelEl._old = labelEl.textContent;
    var restore = function () { labelEl.textContent = labelEl._old; labelEl._old = null; };
    var ok = function () {
      labelEl.textContent = 'Copied ✓'; flash(btn, 'done', 1800);
      clearTimeout(labelEl._r); labelEl._r = setTimeout(restore, 1800);
    };
    var bad = function () {
      labelEl.textContent = 'Press and hold to copy'; flash(btn, 'fail', 2400);
      clearTimeout(labelEl._r); labelEl._r = setTimeout(restore, 2400);
    };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
      try { if (document.execCommand('copy')) ok(); else bad(); } catch (e) { bad(); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  }

  // the "secure connection" badge only claims what is true
  (function () {
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (location.protocol !== 'https:' && !local) {
      $('secure-text').innerHTML = '<span class="long">Connection not secure</span><span class="short">Not secure</span>';
    }
  })();

  // ---------- tabs ----------
  var tabs = $('tabs'), HINT = {
    code: 'Enter your WhatsApp number to generate a one-time pairing code.',
    qr: 'Show a QR code and scan it with WhatsApp. You need a second screen to display it.'
  };
  function setMethod(m, focus) {
    if (submitting) return;                       // never change method while a request is running
    var code = m === 'code', same = m === method;
    method = m;
    $('t-code').classList.toggle('on', code); $('t-qr').classList.toggle('on', !code);
    $('t-code').setAttribute('aria-selected', code); $('t-qr').setAttribute('aria-selected', !code);
    $('t-code').tabIndex = code ? 0 : -1; $('t-qr').tabIndex = code ? -1 : 0;
    tabs.classList.toggle('qr', !code);          // the indicator slides (CSS transition)
    var field = $('numwrap');
    field.classList.toggle('off', !code);
    if (!code) field.setAttribute('inert', ''); else field.removeAttribute('inert');
    field.setAttribute('aria-hidden', code ? 'false' : 'true');
    swapText($('mhint-text'), HINT[m]);
    swapText($('go-text'), code ? 'Generate pairing code' : 'Show QR code');
    if (!same) { setText($('err1'), ''); setText($('numerr'), ''); $('number').removeAttribute('aria-invalid'); }
    if (focus) $(code ? 't-code' : 't-qr').focus();
  }
  $('t-code').addEventListener('click', function () { setMethod('code'); });
  $('t-qr').addEventListener('click', function () { setMethod('qr'); });
  tabs.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setMethod(e.key === 'ArrowLeft' || e.key === 'Home' ? 'code' : 'qr', true);
    }
  });
  // turn the slide animation on only after the first paint, so the page does not animate on load
  requestAnimationFrame(function () { requestAnimationFrame(function () { tabs.classList.add('ready'); }); });

  // ---------- phone number: international formatting ----------
  function digitsOf(v) { var d = String(v).replace(/\D/g, ''); if (d.indexOf('00') === 0) d = d.slice(2); return d.slice(0, 15); }
  function group(d) {
    var parts = [], i = 0, sizes = [3, 3, 3];
    sizes.forEach(function (n) { if (i < d.length) { parts.push(d.substr(i, n)); i += n; } });
    if (i < d.length) parts.push(d.slice(i));
    return parts.join(' ');
  }
  var num = $('number');
  num.addEventListener('input', function () {
    var before = num.value, caret = num.selectionStart == null ? before.length : num.selectionStart;
    var digitsBeforeCaret = digitsOf(before.slice(0, caret)).length;
    var d = digitsOf(before), out = group(d);
    num.value = out;
    // keep the caret next to the same digit
    var pos = 0, seen = 0;
    while (pos < out.length && seen < digitsBeforeCaret) { if (/\d/.test(out[pos])) seen++; pos++; }
    try { num.setSelectionRange(pos, pos); } catch (e) { /* not supported */ }
    if (d.length) { setText($('numerr'), ''); num.removeAttribute('aria-invalid'); }
  });
  function validNumber() {
    var d = digitsOf(num.value), msg = '';
    if (!d) msg = 'Enter your WhatsApp number.';
    else if (d.charAt(0) === '0') msg = 'Start with your country code, not 0. For Nigeria, 0801 234 5678 becomes 234 801 234 5678.';
    else if (d.length < 8) msg = 'That number looks too short. Include the country code.';
    if (msg) { setText($('numerr'), msg); num.setAttribute('aria-invalid', 'true'); num.focus(); return null; }
    return d;
  }

  // ---------- code cells ----------
  function renderCode(code) {
    var row = $('code'); row.innerHTML = '';
    var clean = String(code || '').replace(/[^A-Za-z0-9]/g, '');
    var shown = clean || '········';
    row.classList.toggle('wait', !clean);
    for (var i = 0; i < 8; i++) {
      if (i === 4) { var d = document.createElement('span'); d.className = 'dash'; d.textContent = '–'; d.setAttribute('aria-hidden', 'true'); row.appendChild(d); }
      var c = document.createElement('span'); c.className = 'ch'; c.style.setProperty('--i', i);
      c.textContent = clean ? shown.charAt(i) : '•';
      row.appendChild(c);
    }
    row.setAttribute('aria-label', clean ? 'Pairing code ' + clean.split('').join(' ') : 'Pairing code is being generated');
  }

  // ---------- start ----------
  function reset() {
    stop(); idStop(); islandReset(); job = null; lastCode = ''; dmPolls = 0; submitting = false; reqId++; checking = false;
    renderCode('');
    $('qrimg').hidden = true; $('qrimg').removeAttribute('src'); $('qrskel').hidden = false;
    $('copycode').disabled = true;
    $('prog').style.width = '100%'; $('timer').hidden = true;
    setText($('err1'), ''); setText($('err2'), '');
    busy(false);
    $('sid').classList.remove('expired'); $('sid').removeAttribute('aria-disabled'); $('sid').tabIndex = 0;
    $('copy').disabled = false; $('copyenv').disabled = false; $('idtimer').textContent = ''; $('idtimer').classList.remove('gone', 'low');
    show('step-number');
  }
  function busy(on) {
    var b = $('go'); b.classList.toggle('busy', on); b.setAttribute('aria-busy', on ? 'true' : 'false'); b.disabled = on;
    tabs.classList.toggle('locked', on); $('number').readOnly = on;
  }
  function idleLabel() { swapText($('go-text'), method === 'code' ? 'Generate pairing code' : 'Show QR code'); }
  function failSubmit(msg) {
    submitting = false; busy(false); idleLabel();
    islandSet('bad', 'Could not start. Try again.');
    setText($('err1'), msg); flash($('go'), 'shake', 500); $('go').classList.add('fail');
    try { $('err1').scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); } catch (e) { /* older browsers */ }
    setTimeout(function () { $('go').classList.remove('fail'); }, 2400);
  }

  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitting) return;                       // a request is already running: ignore repeated taps and Enter
    setText($('err1'), '');
    var number = '';
    if (method === 'code') { number = validNumber(); if (!number) { flash($('go'), 'shake', 500); return; } }
    submitting = true; var mine = ++reqId, sent = method;
    busy(true);
    islLock = false; islandSet('working', 'Connecting…');
    swapText($('go-text'), sent === 'code' ? 'Generating…' : 'Preparing…');
    fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: sent, number: number }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }, function () { return { ok: false, j: {} }; }); })
      .then(function (x) {
        if (mine !== reqId) return;
        if (!x.ok) return failSubmit(x.j.error || 'Something went wrong. Please try again.');
        submitting = false;
        job = x.j.job; dmPolls = 0;
        $('pane-code').hidden = method !== 'code'; $('pane-qr').hidden = method !== 'qr';
        $('status').textContent = method === 'code' ? 'Requesting your pairing code…' : 'Preparing your QR code…';
        renderCode(''); $('qrimg').hidden = true; $('qrskel').hidden = false;
        busy(false); idleLabel();
        show('step-wait');
        poll = setInterval(check, 2000); check();
      })
      .catch(function () { if (mine === reqId) failSubmit('Could not reach the site. Check your internet connection and try again.'); });
  });

  // ---------- progress ----------
  function check() {
    if (!job || checking) return;
    checking = true; var mine = job;
    fetch('/api/job/' + job).then(function (r) { return r.json(); }).then(function (j) {
      checking = false;
      if (!job || job !== mine) return;
      if (!j.state) { stop(); return setText($('err2'), j.error || 'This attempt is no longer available. Start over.'); }

      if ((j.state === 'code' || j.state === 'linking') && j.code && j.code !== lastCode) { lastCode = j.code; renderCode(j.code); $('copycode').disabled = false; }
      if (j.state === 'qr' && j.qr) {
        if ($('qrimg').getAttribute('src') !== j.qr) $('qrimg').src = j.qr;
        $('qrimg').hidden = false; $('qrskel').hidden = true;
      }

      if (j.state === 'starting') islandSet('working', method === 'code' ? 'Requesting your code…' : 'Preparing your QR…');
      if (j.state === 'code') islandSet('working', 'Enter the code in WhatsApp');
      if (j.state === 'qr') islandSet('working', 'Scan the QR code');
      if (j.state === 'linking') islandSet('working', 'Linking your account…');
      if (j.state === 'linked') islandSet('ok', 'Linked successfully');
      if (j.state === 'failed') islandSet('bad', 'Linking failed');
      if (j.state === 'starting') $('status').textContent = method === 'code' ? 'Requesting your pairing code…' : 'Preparing your QR code…';
      if (j.state === 'code') $('status').textContent = 'Waiting for you to enter the code in WhatsApp…';
      if (j.state === 'qr') $('status').textContent = 'Waiting for you to scan the QR code…';
      if (j.state === 'linking') { $('status').textContent = 'Accepted. Finishing the link — keep WhatsApp open…'; $('qrimg').hidden = true; $('qrskel').hidden = false; }

      if (j.state === 'starting' || j.state === 'code' || j.state === 'qr' || j.state === 'linking') {
        var left = Math.max(0, j.secondsLeft);
        $('prog').style.width = Math.min(100, (left / MAX_SECONDS) * 100) + '%';
        $('timer').hidden = false;
        $('timer').textContent = 'This attempt expires in ' + Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2);
      } else if (j.state === 'linked' && j.expired) {
        stop();
        if ($('step-done').hidden) show('step-done');
        idExpired();
      } else if (j.state === 'linked') {
        if (!idTimer) { $('sid').textContent = j.sessionId; $('env').textContent = 'SESSION_ID=' + j.sessionId; }
        if ($('step-done').hidden) show('step-done');
        idStart(j.idSecondsLeft);
        dmNote(j.dm);
        dmPolls++;
        if (j.dm !== null || dmPolls > 12) { stop(); if (j.dm === null) dmNote(false); }
      } else if (j.state === 'failed') {
        stop();
        renderCode(''); $('copycode').disabled = true; $('qrimg').hidden = true; $('qrskel').hidden = false;
        $('timer').hidden = true; $('prog').style.width = '0%';
        $('status').textContent = 'This attempt ended.';
        setText($('err2'), j.error || 'Linking failed. Please start over.');
      }
    }).catch(function () { checking = false; /* keep trying */ });
  }
  function dmNote(dm) {
    $('dm').textContent = dm === true ? 'A copy was also sent to your WhatsApp (in your own chat).'
      : dm === false ? 'We could not message you on WhatsApp, so copy the ID from here.'
      : 'Sending a copy to your WhatsApp…';
  }

  $('cancel').addEventListener('click', reset);
  $('again').addEventListener('click', reset);
  $('copycode').addEventListener('click', function () { if (lastCode) copy(lastCode.replace(/-/g, ''), $('copycode'), $('copycode').querySelector('span')); });
  $('copy').addEventListener('click', function () { copy($('sid').textContent, $('copy'), $('copy-text')); });
  $('copyenv').addEventListener('click', function () { copy($('env').textContent, $('copyenv'), $('copyenv').querySelector('span')); });
  $('sid').addEventListener('click', function () { if ($('sid').classList.contains('expired')) return; copy($('sid').textContent, $('copy'), $('copy-text')); flash($('sid'), 'done', 1200); });
  $('sid').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('sid').click(); } });
  renderCode('');

})();
