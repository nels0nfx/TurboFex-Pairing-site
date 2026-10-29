(function () {
  var $ = function (id) { return document.getElementById(id); };
  var job = null, poll = null, t0 = 0;

  function show(step) {
    ['step-number', 'step-code', 'step-done'].forEach(function (s) { $(s).hidden = s !== step; });
  }
  function err(el, msg) { el.textContent = msg || ''; el.hidden = !msg; }
  function stop() { if (poll) clearInterval(poll); poll = null; }
  function reset() {
    stop(); job = null;
    $('code').textContent = '········'; $('how').hidden = true; $('timer').hidden = true; $('wait').hidden = false; $('wait').textContent = 'Getting your code…';
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
    if (number.length < 8) return err($('err1'), 'Enter your full number with the country code.');
    $('go').disabled = true;
    fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number: $('number').value }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { $('go').disabled = false; return err($('err1'), x.j.error || 'Something went wrong.'); }
        job = x.j.job; t0 = Date.now(); show('step-code');
        poll = setInterval(check, 2000); check();
      })
      .catch(function () { $('go').disabled = false; err($('err1'), 'Could not reach the site. Check your internet.'); });
  });

  function check() {
    if (!job) return;
    fetch('/api/job/' + job).then(function (r) { return r.json(); }).then(function (j) {
      if (!job) return;
      if (j.error && !j.state) { stop(); return err($('err2'), j.error); }
      if (j.state === 'code' || j.state === 'linking') {
        $('code').textContent = j.code || $('code').textContent;
        $('how').hidden = false;
        $('wait').hidden = j.state !== 'linking';
        if (j.state === 'linking') $('wait').textContent = 'Code accepted. Finishing the link, keep WhatsApp open…';
        $('timer').hidden = false;
        $('timer').textContent = 'The code works for about ' + Math.floor(j.secondsLeft / 60) + ' min ' + (j.secondsLeft % 60) + ' s.';
      } else if (j.state === 'linked') {
        stop();
        $('sid').textContent = j.sessionId;
        $('env').textContent = 'SESSION_ID=' + j.sessionId;
        show('step-done');
      } else if (j.state === 'failed') {
        stop();
        $('code').textContent = '········'; $('how').hidden = true; $('wait').hidden = true; $('timer').hidden = true;
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
