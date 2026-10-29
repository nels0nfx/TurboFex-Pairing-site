(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MAX_SECONDS = 240;
  var job = null, poll = null, method = 'code', dmPolls = 0, lastCode = '';

  // ---------- helpers ----------
  function show(step) {
    ['step-number', 'step-wait', 'step-done'].forEach(function (s) {
      var el = $(s);
      var on = s === step;
      el.hidden = !on;
      if (on) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function setText(el, msg) { el.textContent = msg || ''; el.hidden = !msg; }
  function stop() { if (poll) clearInterval(poll); poll = null; }

  function copy(text, labelEl) {
    var old = labelEl.textContent;
    var ok = function () { labelEl.textContent = 'Copied ✓'; setTimeout(function () { labelEl.textContent = old; }, 1800); };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
      try { if (document.execCommand('copy')) ok(); else labelEl.textContent = 'Press and hold to copy'; } catch (e) { labelEl.textContent = 'Press and hold to copy'; }
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
  function setMethod(m, focus) {
    method = m;
    var code = m === 'code';
    $('t-code').classList.toggle('on', code); $('t-qr').classList.toggle('on', !code);
    $('t-code').setAttribute('aria-selected', code); $('t-qr').setAttribute('aria-selected', !code);
    $('t-code').tabIndex = code ? 0 : -1; $('t-qr').tabIndex = code ? -1 : 0;
    $('numwrap').hidden = !code;
    $('go-text').textContent = code ? 'Generate pairing code' : 'Show QR code';
    $('mhint-text').textContent = code
      ? 'Enter your WhatsApp number to generate a one-time pairing code.'
      : 'Show a QR code and scan it with WhatsApp. You need a second screen to display it.';
    setText($('err1'), ''); setText($('numerr'), ''); $('number').removeAttribute('aria-invalid');
    if (focus) $(code ? 't-code' : 't-qr').focus();
  }
  $('t-code').addEventListener('click', function () { setMethod('code'); });
  $('t-qr').addEventListener('click', function () { setMethod('qr'); });
  document.querySelector('.tabs').addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setMethod(e.key === 'ArrowLeft' || e.key === 'Home' ? 'code' : 'qr', true);
    }
  });

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
    stop(); job = null; lastCode = ''; dmPolls = 0;
    renderCode('');
    $('qrimg').hidden = true; $('qrimg').removeAttribute('src'); $('qrskel').hidden = false;
    $('copycode').disabled = true;
    $('prog').style.width = '100%'; $('timer').hidden = true;
    setText($('err1'), ''); setText($('err2'), '');
    busy(false);
    show('step-number');
  }
  function busy(on) {
    var b = $('go'); b.classList.toggle('busy', on); b.setAttribute('aria-busy', on ? 'true' : 'false'); b.disabled = on;
  }

  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    setText($('err1'), '');
    var number = '';
    if (method === 'code') { number = validNumber(); if (!number) return; }
    busy(true);
    $('go-text').textContent = method === 'code' ? 'Generating…' : 'Preparing…';
    fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: method, number: number }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { busy(false); $('go-text').textContent = method === 'code' ? 'Generate pairing code' : 'Show QR code'; return setText($('err1'), x.j.error || 'Something went wrong. Please try again.'); }
        job = x.j.job; dmPolls = 0;
        $('pane-code').hidden = method !== 'code'; $('pane-qr').hidden = method !== 'qr';
        $('status').textContent = method === 'code' ? 'Requesting your pairing code…' : 'Preparing your QR code…';
        renderCode(''); $('qrimg').hidden = true; $('qrskel').hidden = false;
        busy(false); $('go-text').textContent = method === 'code' ? 'Generate pairing code' : 'Show QR code';
        show('step-wait');
        poll = setInterval(check, 2000); check();
      })
      .catch(function () { busy(false); $('go-text').textContent = method === 'code' ? 'Generate pairing code' : 'Show QR code'; setText($('err1'), 'Could not reach the site. Check your internet connection and try again.'); });
  });

  // ---------- progress ----------
  function check() {
    if (!job) return;
    fetch('/api/job/' + job).then(function (r) { return r.json(); }).then(function (j) {
      if (!job) return;
      if (!j.state) { stop(); return setText($('err2'), j.error || 'This attempt is no longer available. Start over.'); }

      if (j.state === 'code' && j.code && j.code !== lastCode) { lastCode = j.code; renderCode(j.code); $('copycode').disabled = false; }
      if (j.state === 'qr' && j.qr) {
        if ($('qrimg').getAttribute('src') !== j.qr) $('qrimg').src = j.qr;
        $('qrimg').hidden = false; $('qrskel').hidden = true;
      }

      if (j.state === 'starting') $('status').textContent = method === 'code' ? 'Requesting your pairing code…' : 'Preparing your QR code…';
      if (j.state === 'code') $('status').textContent = 'Waiting for you to enter the code in WhatsApp…';
      if (j.state === 'qr') $('status').textContent = 'Waiting for you to scan the QR code…';
      if (j.state === 'linking') { $('status').textContent = 'Accepted. Finishing the link — keep WhatsApp open…'; $('qrimg').hidden = true; $('qrskel').hidden = false; }

      if (j.state === 'starting' || j.state === 'code' || j.state === 'qr' || j.state === 'linking') {
        var left = Math.max(0, j.secondsLeft);
        $('prog').style.width = Math.min(100, (left / MAX_SECONDS) * 100) + '%';
        $('timer').hidden = false;
        $('timer').textContent = 'This attempt expires in ' + Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2);
      } else if (j.state === 'linked') {
        $('sid').textContent = j.sessionId;
        $('env').textContent = 'SESSION_ID=' + j.sessionId;
        if ($('step-done').hidden) show('step-done');
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
    }).catch(function () { /* keep trying */ });
  }
  function dmNote(dm) {
    $('dm').textContent = dm === true ? 'A copy was also sent to your WhatsApp (in your own chat).'
      : dm === false ? 'We could not message you on WhatsApp, so copy the ID from here.'
      : 'Sending a copy to your WhatsApp…';
  }

  $('cancel').addEventListener('click', reset);
  $('again').addEventListener('click', reset);
  $('copycode').addEventListener('click', function () { if (lastCode) copy(lastCode.replace(/-/g, ''), $('copycode').querySelector('span')); });
  $('copy').addEventListener('click', function () { copy($('sid').textContent, $('copy-text')); });
  $('copyenv').addEventListener('click', function () { copy($('env').textContent, $('copyenv').querySelector('span')); });
  renderCode('');
})();
