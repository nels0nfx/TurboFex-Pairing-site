// The Plugins page: loads the signed plugin list from this site, shows cards, search and details. Everything is added with
// textContent (never as HTML), so nothing from the list can run as code.
(function () {
  var list = document.getElementById('plist'), count = document.getElementById('pcount'), search = document.getElementById('psearch'), empty = document.getElementById('pempty');
  if (!list) return;
  var all = [], RISK = { low: 'Low', medium: 'Medium', high: 'High' };

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function say(msg) { empty.textContent = msg; empty.hidden = !msg; }

  function chips(p) {
    var box = el('ul', 'pchips');
    if (!p.permissions.length) { box.appendChild(el('li', 'chip low', 'Asks for nothing special')); return box; }
    p.permissions.forEach(function (x) { var li = el('li', 'chip ' + x.risk); li.appendChild(el('b', null, RISK[x.risk] || 'Medium')); li.appendChild(document.createTextNode(' ' + x.text)); box.appendChild(li); });
    return box;
  }
  function copyBtn(text) {
    var b = el('button', 'pcopy', 'Copy command'); b.type = 'button';
    b.addEventListener('click', function () {
      function done() { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy command'; }, 1600); }
      try { navigator.clipboard.writeText(text).then(done, function () { b.textContent = 'Press and hold the command to copy'; }); } catch (e) { b.textContent = 'Press and hold the command to copy'; }
    });
    return b;
  }
  function card(p) {
    var a = el('article', 'pcard'); a.id = p.id;
    var head = el('button', 'phead'); head.type = 'button'; head.setAttribute('aria-expanded', 'false');
    var title = el('span', 'ptitle'); title.appendChild(el('span', 'pname', p.name)); title.appendChild(el('span', 'pver', 'v' + p.version));
    head.appendChild(title); head.appendChild(el('span', 'pdesc', p.description)); var by = el('span', 'pby', 'By ' + (p.author || 'unknown')); if (p.dev && p.dev.verified) by.appendChild(el('span', 'pver2', '✓ Verified developer')); head.appendChild(by);
    var more = el('div', 'pmore'); more.hidden = true;
    more.appendChild(el('h3', null, 'What it asks for')); more.appendChild(chips(p));
    if (p.domains.length) more.appendChild(el('p', 'pdom', 'Websites it connects to: ' + p.domains.join(', ')));
    more.appendChild(el('h3', null, 'Install'));
    var cmd = '.plugin install ' + p.id; var row = el('div', 'prow'); row.appendChild(el('code', null, cmd)); row.appendChild(copyBtn(cmd)); more.appendChild(row);
    if (p.publishedAt) more.appendChild(el('p', 'pdom', 'Published ' + p.publishedAt.slice(0, 10)));
    if (p.dev) {
      more.appendChild(el('h3', null, 'Developer'));
      more.appendChild(el('p', 'pdom', p.dev.developer + (p.dev.verified ? ' · verified by the TurboFex team: we checked who they are' : ' · not verified yet. Every plugin is still read before it is published.')));
      if (/^https:\/\/github\.com\/[A-Za-z0-9._\/-]+$/.test(p.dev.source)) { var src = el('a', 'plink', 'View the source code on GitHub'); src.href = p.dev.source; src.target = '_blank'; src.rel = 'noopener noreferrer'; more.appendChild(src); }
    }
    if (p.history && p.history.length > 1) {
      more.appendChild(el('h3', null, 'Versions'));
      var vl = el('ul', 'pvers'); p.history.forEach(function (h) { vl.appendChild(el('li', null, 'v' + h.version + (h.publishedAt ? ' · ' + h.publishedAt.slice(0, 10) : ''))); }); more.appendChild(vl);
    }
    head.addEventListener('click', function () { var open = head.getAttribute('aria-expanded') !== 'true'; head.setAttribute('aria-expanded', open ? 'true' : 'false'); more.hidden = !open; a.classList.toggle('open', open); });
    a.appendChild(head); a.appendChild(more); return a;
  }
  function render() {
    var q = search.value.trim().toLowerCase();
    var shown = all.filter(function (p) { return !q || (p.id + ' ' + p.name + ' ' + p.description + ' ' + p.author).toLowerCase().indexOf(q) >= 0; });
    list.textContent = '';
    shown.forEach(function (p) { list.appendChild(card(p)); });
    count.textContent = shown.length + (shown.length === 1 ? ' plugin' : ' plugins');
    say(shown.length ? '' : (all.length ? 'No plugin matches your search.' : 'No plugins have been published yet. Check back soon.'));
    var want = (location.hash || '').slice(1), c = want && document.getElementById(want);
    if (c && c.classList.contains('pcard') && !c.classList.contains('open')) c.querySelector('.phead').click();
  }
  search.addEventListener('input', render);
  fetch('/api/plugins', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (x) {
    if (!x.ok) throw new Error(x.j && x.j.error);
    all = x.j.plugins || []; search.disabled = false; render();
  }).catch(function (e) { count.textContent = ''; say((e && e.message) || 'The plugin list cannot be loaded right now. Please try again in a moment.'); });
})();
