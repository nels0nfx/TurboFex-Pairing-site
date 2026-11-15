// Support page: live pairing status and a search box that hides answers that do not match. Text only, no HTML from outside.
(function () {
  var d = document, box = d.getElementById('sb-pair'), q = d.getElementById('qs'), none = d.getElementById('qnone');
  if (box) {
    var b = box.querySelector('b');
    fetch('/api/status', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (s) {
      var off = s && s.maintenance && s.maintenance.on; b.textContent = off ? 'Paused for maintenance' : 'Online'; box.className = 'sbox ' + (off ? 'bad' : 'ok');
    }).catch(function () { b.textContent = 'Status unavailable'; box.className = 'sbox bad'; });
  }
  if (!q) return;
  var items = [].slice.call(d.querySelectorAll('#faq details')), groups = [].slice.call(d.querySelectorAll('.faqgroup'));
  q.addEventListener('input', function () {
    var v = q.value.trim().toLowerCase(), shown = 0;
    items.forEach(function (it) { var ok = !v || it.textContent.toLowerCase().indexOf(v) >= 0; it.hidden = !ok; if (ok) shown++; if (v && ok) it.open = true; else if (!v) it.open = false; });
    groups.forEach(function (g) { g.hidden = !g.querySelector('details:not([hidden])'); });
    none.hidden = shown > 0;
  });
})();
