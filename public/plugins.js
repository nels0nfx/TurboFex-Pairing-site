// The Plugins page: loads the signed plugin list from this site, shows cards, search and details. Everything is added with
// textContent (never as HTML), so nothing from the list can run as code.
(function () {
  var list = document.getElementById('plist'), count = document.getElementById('pcount'), search = document.getElementById('psearch'), empty = document.getElementById('pempty');
  if (!list) return;
  var all = [], me = null, RISK = { low: 'Low', medium: 'Medium', high: 'High' };

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
  function stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tfx' }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  // the ratings and reviews of one plugin (read when the card is opened)
  function ratings(p, box) {
    function draw(data) {
      box.textContent = '';
      box.appendChild(el('h3', null, 'Ratings and reviews'));
      var r = data && data.rating;
      var pc = box.closest('.pcard'), tag = pc && pc.querySelector('.prate'), tt = pc && pc.querySelector('.ptitle');   // keep the number on the card header in step
      if (tt) { if (r) { if (!tag) { tag = el('span', 'prate'); tt.appendChild(tag); } tag.textContent = '★ ' + r.avg.toFixed(1) + ' (' + r.count + ')'; } else if (tag) tag.remove(); }
      box.appendChild(el('p', 'pdom', r ? '★ ' + r.avg.toFixed(1) + ' out of 5 · ' + r.count + (r.count === 1 ? ' rating' : ' ratings') : 'No ratings yet.'));
      if (me && me.configured) {
        if (!me.user) {
          var a = el('a', 'plink', 'Sign in with GitHub to rate this plugin'); a.href = '/auth/github?next=plugins'; box.appendChild(a);
        } else {
          var mine = (me.ratings && me.ratings[p.id]) || null, pick = mine ? mine.stars : 0;
          var f = el('div', 'pform'), row = el('div', 'pstars'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Your rating');
          var btns = [1, 2, 3, 4, 5].map(function (n) { var b = el('button', 'pstar', '★'); b.type = 'button'; b.setAttribute('aria-label', n + (n === 1 ? ' star' : ' stars')); b.addEventListener('click', function () { pick = n; paint(); }); row.appendChild(b); return b; });
          function paint() { btns.forEach(function (b, i) { b.classList.toggle('on', i < pick); b.setAttribute('aria-pressed', i < pick ? 'true' : 'false'); }); }
          paint();
          var ta = el('textarea', 'ptext'); ta.maxLength = 300; ta.rows = 3; ta.placeholder = 'A short review (optional, up to 300 characters). It shows your GitHub name.'; ta.value = mine ? mine.text || '' : ''; ta.setAttribute('aria-label', 'Your review');
          var save = el('button', 'dbtn', mine ? 'Update my rating' : 'Send my rating'); save.type = 'button'; var msg = el('p', 'pmsg'); msg.setAttribute('role', 'alert'); msg.hidden = true;
          function fail(t) { msg.textContent = t; msg.hidden = false; save.disabled = false; }
          save.addEventListener('click', function () {
            if (!pick) return fail('Choose 1 to 5 stars first.');
            save.disabled = true; msg.hidden = true;
            post('/api/dev/rate', { plugin: p.id, stars: pick, text: ta.value }).then(function (x) { if (!x.ok) return fail(x.j.error || 'Could not save.'); me.ratings = me.ratings || {}; me.ratings[p.id] = { stars: pick, text: ta.value.trim().slice(0, 300) }; refresh(); }, function () { fail('The site could not be reached.'); });
          });
          f.appendChild(row); f.appendChild(ta); f.appendChild(save);
          if (mine) { var rm = el('button', 'dbtn ghost', 'Remove my rating'); rm.type = 'button'; rm.addEventListener('click', function () { rm.disabled = true; post('/api/dev/rate', { plugin: p.id, remove: true }).then(function (x) { if (x.ok) { delete me.ratings[p.id]; refresh(); } else { rm.disabled = false; } }); }); f.appendChild(rm); }
          f.appendChild(msg); box.appendChild(f);
        }
      }
      if (me && me.user) {
        var rb = el('button', 'dbtn ghost', 'Report this plugin'); rb.type = 'button';
        rb.addEventListener('click', function () {
          rb.hidden = true;
          var f2 = el('div', 'pform'), sel = el('select', 'ptext'); sel.setAttribute('aria-label', 'Reason');
          [['', 'Choose a reason'], ['harmful', 'Harmful or dangerous'], ['spam', 'Spam or unwanted messages'], ['stealing', 'Takes data or does things it did not say'], ['copy', 'Copies someone else\'s work'], ['broken', 'Does not work'], ['other', 'Something else']].forEach(function (o) { var op = el('option', null, o[1]); op.value = o[0]; sel.appendChild(op); });
          var t2 = el('textarea', 'ptext'); t2.maxLength = 300; t2.rows = 3; t2.placeholder = 'What is wrong? (optional, up to 300 characters)'; t2.setAttribute('aria-label', 'Details');
          var go = el('button', 'dbtn', 'Send report'); go.type = 'button'; var m2 = el('p', 'pmsg'); m2.setAttribute('role', 'alert'); m2.hidden = true;
          go.addEventListener('click', function () {
            if (!sel.value) { m2.textContent = 'Choose a reason first.'; m2.hidden = false; return; }
            go.disabled = true; m2.hidden = true;
            post('/api/dev/report', { plugin: p.id, reason: sel.value, text: t2.value }).then(function (x) { if (x.ok) { f2.textContent = ''; f2.appendChild(el('p', 'pdom', 'Thank you. The report was sent to the TurboFex owner.')); } else { m2.textContent = x.j.error || 'Could not send.'; m2.hidden = false; go.disabled = false; } }, function () { m2.textContent = 'The site could not be reached.'; m2.hidden = false; go.disabled = false; });
          });
          f2.appendChild(sel); f2.appendChild(t2); f2.appendChild(go); f2.appendChild(m2); box.appendChild(f2);
        });
        box.appendChild(rb);
      }
      ((data && data.reviews) || []).forEach(function (v) {
        var it = el('div', 'prv'); var top = el('div', 'prv-t'); top.appendChild(el('span', 'prv-s', stars(v.stars))); top.appendChild(el('b', null, v.login)); top.appendChild(el('span', 'pdom', new Date(v.at).toLocaleDateString()));
        it.appendChild(top); it.appendChild(el('p', null, v.text)); box.appendChild(it);
      });
    }
    function refresh() { fetch('/api/plugin-reviews?id=' + encodeURIComponent(p.id), { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(draw, function () { draw(null); }); }
    refresh();
  }

  function card(p) {
    var a = el('article', 'pcard'); a.id = p.id;
    var head = el('button', 'phead'); head.type = 'button'; head.setAttribute('aria-expanded', 'false');
    var title = el('span', 'ptitle'); title.appendChild(el('span', 'pname', p.name)); title.appendChild(el('span', 'pver', 'v' + p.version)); if (p.rating) title.appendChild(el('span', 'prate', '★ ' + p.rating.avg.toFixed(1) + ' (' + p.rating.count + ')'));
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
    if (p.docs && (p.docs.readme || p.docs.changelog)) {   // the developer's own README / CHANGELOG, shown only as plain text
      var dbar = el('div', 'pdocbar'); var dout = el('pre', 'pdoc'); dout.hidden = true; dout.tabIndex = 0; var shownDoc = '';
      [['readme', 'About this plugin'], ['changelog', 'What changed']].forEach(function (d) {
        if (!p.docs[d[0]]) return;
        var b = el('button', 'dbtn ghost', d[1]); b.type = 'button';
        b.addEventListener('click', function () {
          if (shownDoc === d[0]) { dout.hidden = true; shownDoc = ''; return; }
          shownDoc = d[0]; dout.hidden = false; dout.textContent = 'Loading…';
          fetch('/api/plugin-doc?id=' + encodeURIComponent(p.id) + '&v=' + encodeURIComponent(p.version) + '&f=' + d[0], { headers: { accept: 'application/json' } })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (x) { if (shownDoc !== d[0]) return; dout.textContent = x.ok && typeof x.j.text === 'string' ? x.j.text : 'This could not be loaded right now.'; })
            .catch(function () { if (shownDoc === d[0]) dout.textContent = 'This could not be loaded right now.'; });
        });
        dbar.appendChild(b);
      });
      more.appendChild(dbar); more.appendChild(dout);
    }
    var rbox = el('div', 'prev'); more.appendChild(rbox); var loaded = false;
    head.addEventListener('click', function () { if (!loaded) { loaded = true; ratings(p, rbox); } var open = head.getAttribute('aria-expanded') !== 'true'; head.setAttribute('aria-expanded', open ? 'true' : 'false'); more.hidden = !open; a.classList.toggle('open', open); });
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
    if (x.j.paused) { count.textContent = ''; return say('The plugin store is paused for a little while. Please check back soon.'); }
    all = x.j.plugins || []; search.disabled = false;
    return fetch('/api/dev/me', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (m) { me = m; }, function () { me = null; }).then(render);
  }).catch(function (e) { count.textContent = ''; say((e && e.message) || 'The plugin list cannot be loaded right now. Please try again in a moment.'); });
})();
