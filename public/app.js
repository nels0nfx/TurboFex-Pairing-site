(function () {
  var $ = function (id) { return document.getElementById(id); };
  var job = null, poll = null, method = 'code';

  function show(step) {
    ['step-number', 'step-code', 'step-done'].forEach(function (s) { $(s).hidden = s !== step; });
  }
  function err(el, msg) { el.textContent = msg || ''; el.hidden = !msg; }
  function stop() { if (poll) clearInterval(poll); poll = null; }

  function setMethod(m) {
    method = m;
    $('m-code').classList.toggle('on', m === 'code');
    $('m-qr').classList.toggle('on', m === 'qr');
    $('m-code').setAttribute('aria-selected', m === 'code');
    $('m-qr').setAttribute('aria-selected', m === 'qr');
    $('numwrap').hidden = m === 'qr';
    $('go').textContent = m === 'qr' ? 'Show QR code' : 'Get pairing code';
    $('mhint').textContent = m === 'qr'
      ? 'You scan a QR with the phone you want to link. You need a second screen (laptop or another phone) to show it.'
      : 'Best on one phone: you type a code, no second device needed.';
    err($('err1'));
  }
  $('m-code').addEventListener('click', function () { setMethod('code'); });
  $('m-qr').addEventListener('click', function () { setMethod('qr'); });

  function reset() {
    stop(); job = null;
    $('code').textContent = '········';
    $('qrimg').hidden = true; $('qrimg').removeAttribute('src'); $('qrwait').hidden = false;
    $('wait').hidden = true; $('timer').hidden = true;
    err($('err1')); err($('err2'));
    $('go').disabled = false;
    show('step-number');
  }

  function copy(text, btn) {
    var done = function () { var old = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = old; }, 1600); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
    else fallback(text, done);
  }
  function fallback(text, done) {
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  $('go').addEventListener('click', function () {
    err($('err1'));
    var number = $('number').value.replace(/\D/g, '');
    if (method === 'code' && number.length < 8) return err($('err1'), 'Enter your full number with the country code.');
    $('go').disabled = true;
    fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: method, number: $('number').value }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { $('go').disabled = false; return err($('err1'), x.j.error || 'Something went wrong.'); }
        job = x.j.job;
        $('pane-code').hidden = method !== 'code';
        $('pane-qr').hidden = method !== 'qr';
        show('step-code');
        poll = setInterval(check, 2000); check();
      })
      .catch(function () { $('go').disabled = false; err($('err1'), 'Could not reach the site. Check your internet.'); });
  });

  function check() {
    if (!job) return;
    fetch('/api/job/' + job).then(function (r) { return r.json(); }).then(function (j) {
      if (!job) return;
      if (j.error && !j.state) { stop(); return err($('err2'), j.error); }
      if (j.state === 'code') {
        $('code').textContent = j.code || $('code').textContent;
      } else if (j.state === 'qr') {
        if (j.qr && $('qrimg').getAttribute('src') !== j.qr) $('qrimg').src = j.qr;
        $('qrimg').hidden = !j.qr; $('qrwait').hidden = !!j.qr;
      }
      if (j.state === 'code' || j.state === 'qr' || j.state === 'linking') {
        var linking = j.state === 'linking';
        $('wait').hidden = !linking;
        if (linking) $('wait').textContent = 'Accepted. Finishing the link, keep WhatsApp open…';
        if (linking) { $('qrimg').hidden = true; $('qrwait').hidden = true; }
        $('timer').hidden = false;
        $('timer').textContent = 'This attempt lasts about ' + Math.floor(j.secondsLeft / 60) + ' min ' + (j.secondsLeft % 60) + ' s.';
      } else if (j.state === 'linked') {
        stop();
        $('sid').textContent = j.sessionId;
        $('env').textContent = 'SESSION_ID=' + j.sessionId;
        show('step-done');
      } else if (j.state === 'failed') {
        stop();
        $('code').textContent = '········'; $('qrimg').hidden = true; $('qrwait').hidden = true; $('wait').hidden = true; $('timer').hidden = true;
        err($('err2'), j.error || 'Linking failed. Start over.');
      }
    }).catch(function () { /* keep trying */ });
  }

  $('cancel').addEventListener('click', reset);
  $('again').addEventListener('click', reset);
  $('copy').addEventListener('click', function () { copy($('sid').textContent, $('copy')); });
  $('copyenv').addEventListener('click', function () { copy($('env').textContent, $('copyenv')); });
  $('number').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('go').click(); });
})();
