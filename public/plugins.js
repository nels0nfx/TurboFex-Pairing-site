// The Plugins page (marketplace): loads the signed plugin list from this site and shows a browse view and a full page for each plugin
// (/plugins#plugin-id). Everything is added with textContent (never as HTML), so nothing from the list can run as code.
(function () {
  var list = document.getElementById('plist'), count = document.getElementById('pcount'), search = document.getElementById('psearch'), empty = document.getElementById('pempty');
  if (!list) return;
  var d = document, all = [], cols = [], me = null, filter = 'all', sortBy = 'feat', RISK = { low: 'Low', medium: 'Medium', high: 'High' };
  var browse = d.getElementById('pbrowse'), detail = d.getElementById('pdetail'), baseTitle = d.title, lastY = 0, loaded = false;

  function el(tag, cls, text) { var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function ico(id, cls) { var s = d.createElementNS('http://www.w3.org/2000/svg', 'svg'), u = d.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + id); s.appendChild(u); if (cls) s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true'); return s; }
  function say(msg) { empty.textContent = msg; empty.hidden = !msg; }
  function iconOf(p, size) {
    var box = el('span', 'picon'); box.setAttribute('aria-hidden', 'true');
    if (p.docs && p.docs.icon) { var im = el('img'); im.alt = ''; im.width = size; im.height = size; im.loading = 'lazy'; im.src = '/api/plugin-icon?id=' + encodeURIComponent(p.id) + '&v=' + encodeURIComponent(p.version); box.appendChild(im); } else box.textContent = (p.name || '?').charAt(0).toUpperCase();
    return box;
  }
  function topRisk(p) { var r = 'low'; p.permissions.forEach(function (x) { if (x.risk === 'high') r = 'high'; else if (x.risk === 'medium' && r !== 'high') r = 'medium'; }); return r; }
  function copyBtn(text, label, cls) {
    var b = el('button', cls || 'pcopy'); b.type = 'button'; b.appendChild(ico('i-copy')); var t = el('span', null, label || 'Copy'); b.appendChild(t);
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      function done() { t.textContent = 'Copied'; setTimeout(function () { t.textContent = label || 'Copy'; }, 1600); }
      try { navigator.clipboard.writeText(text).then(done, function () { t.textContent = 'Press and hold to copy'; }); } catch (err) { t.textContent = 'Press and hold to copy'; }
    });
    return b;
  }
  function stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tfx' }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  // the ratings and reviews of one plugin (read when its page is opened)
  function stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tfx' }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  // the ratings and reviews of one plugin (read when the card is opened)
  function ratings(p, box, onRate) {
    function draw(data) {
      box.textContent = '';
      
      var r = data && data.rating;
      if (onRate) onRate(r);   // keep the number in the page header in step
      if (p.botRating) box.appendChild(el('p', 'pdom', 'Rated by bot owners: ★ ' + p.botRating.avg.toFixed(1) + ' out of 5 (' + p.botRating.count + (p.botRating.count === 1 ? ' bot' : ' bots') + ')'));
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
          var save = el('button', 'btn btn-gold sm', mine ? 'Update my rating' : 'Send my rating'); save.type = 'button'; var msg = el('p', 'pmsg'); msg.setAttribute('role', 'alert'); msg.hidden = true;
          function fail(t) { msg.textContent = t; msg.hidden = false; save.disabled = false; }
          save.addEventListener('click', function () {
            if (!pick) return fail('Choose 1 to 5 stars first.');
            save.disabled = true; msg.hidden = true;
            post('/api/dev/rate', { plugin: p.id, stars: pick, text: ta.value }).then(function (x) { if (!x.ok) return fail(x.j.error || 'Could not save.'); me.ratings = me.ratings || {}; me.ratings[p.id] = { stars: pick, text: ta.value.trim().slice(0, 300) }; refresh(); }, function () { fail('The site could not be reached.'); });
          });
          f.appendChild(row); f.appendChild(ta); f.appendChild(save);
          if (mine) { var rm = el('button', 'btn btn-ghost sm', 'Remove my rating'); rm.type = 'button'; rm.addEventListener('click', function () { rm.disabled = true; post('/api/dev/rate', { plugin: p.id, remove: true }).then(function (x) { if (x.ok) { delete me.ratings[p.id]; refresh(); } else { rm.disabled = false; } }); }); f.appendChild(rm); }
          f.appendChild(msg); box.appendChild(f);
        }
      }
      if (me && me.user) {
        var rb = el('button', 'btn btn-ghost sm', 'Report this plugin'); rb.type = 'button';
        rb.addEventListener('click', function () {
          rb.hidden = true;
          var f2 = el('div', 'pform'), sel = el('select', 'ptext'); sel.setAttribute('aria-label', 'Reason');
          [['', 'Choose a reason'], ['harmful', 'Harmful or dangerous'], ['spam', 'Spam or unwanted messages'], ['stealing', 'Takes data or does things it did not say'], ['copy', 'Copies someone else\'s work'], ['broken', 'Does not work'], ['other', 'Something else']].forEach(function (o) { var op = el('option', null, o[1]); op.value = o[0]; sel.appendChild(op); });
          var t2 = el('textarea', 'ptext'); t2.maxLength = 300; t2.rows = 3; t2.placeholder = 'What is wrong? (optional, up to 300 characters)'; t2.setAttribute('aria-label', 'Details');
          var go = el('button', 'btn btn-gold sm', 'Send report'); go.type = 'button'; var m2 = el('p', 'pmsg'); m2.setAttribute('role', 'alert'); m2.hidden = true;
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


  // ---------- browse view ----------
  function card(p) {
    var a = el('article', 'pcard' + (p.featured ? ' feat' : '')); a.id = 'c-' + p.id;
    var link = el('a', 'pmain'); link.href = '#' + p.id; link.setAttribute('aria-label', p.name + ', version ' + p.version);
    var top = el('span', 'ptop'); top.appendChild(iconOf(p, 52));
    var tt = el('span', 'ptt'); tt.appendChild(el('b', 'pname', p.name));
    var by = el('span', 'pby', 'by ' + (p.author || 'unknown')); if (p.dev && p.dev.verified) { var v = el('span', 'pver2'); v.appendChild(ico('i-check')); v.appendChild(d.createTextNode('Verified')); by.appendChild(v); } tt.appendChild(by);
    top.appendChild(tt); if (p.featured) top.appendChild(el('span', 'pfeat', 'Featured'));
    link.appendChild(top); link.appendChild(el('span', 'pdesc', p.description));
    var risk = topRisk(p), ch = el('span', 'pchip ' + risk);
    ch.textContent = p.permissions.length ? (p.permissions.length === 1 ? '1 permission' : p.permissions.length + ' permissions') + ' · ' + RISK[risk] + ' risk' : 'No special permissions';
    var cl = el('span', 'pcmds'); (p.commands || []).slice(0, 4).forEach(function (n) { cl.appendChild(el('code', 'pcmd', '.' + n)); }); if ((p.commands || []).length > 4) cl.appendChild(el('span', 'pcmore', '+' + ((p.commands || []).length - 4)));
    if (!(p.commands || []).length && (p.events || []).length) cl.appendChild(el('span', 'pcmore', 'Works by itself: listens to ' + p.events.length + (p.events.length === 1 ? ' event' : ' events')));
    link.appendChild(ch); if (cl.childNodes.length) link.appendChild(cl); a.appendChild(link);
    var foot = el('div', 'pfoot'); foot.appendChild(el('span', 'pver', 'v' + p.version));
    if (p.rating) { var r = el('span', 'prate'); r.appendChild(ico('i-star')); r.appendChild(d.createTextNode(p.rating.avg.toFixed(1) + ' (' + p.rating.count + ')')); foot.appendChild(r); }
    foot.appendChild(copyBtn('.plugin install ' + p.id, 'Copy install command')); a.appendChild(foot);
    return a;
  }
  var FILTERS = [
    { id: 'all', label: 'All', test: function () { return true; } },
    { id: 'featured', label: 'Featured', test: function (p) { return !!p.featured; } },
    { id: 'verified', label: 'Verified developers', test: function (p) { return !!(p.dev && p.dev.verified); } },
    { id: 'safe', label: 'No special permissions', test: function (p) { return !p.permissions.length; } },
    { id: 'rated', label: 'Rated', test: function (p) { return !!(p.rating || p.botRating); } }
  ];
  function drawFilters() {
    var box = d.getElementById('pfilters'); box.textContent = '';
    FILTERS.forEach(function (f) {
      var n = all.filter(f.test).length; if (f.id !== 'all' && !n) return;
      var b = el('button', 'fchip' + (filter === f.id ? ' on' : ''), f.label); b.type = 'button'; b.setAttribute('aria-pressed', filter === f.id ? 'true' : 'false');
      b.appendChild(el('i', null, String(n)));
      b.addEventListener('click', function () { filter = f.id; drawFilters(); render(); }); box.appendChild(b);
    });
    if (filter !== 'all' && !all.some(FILTERS.filter(function (f) { return f.id === filter; })[0].test)) filter = 'all';
  }
  function drawCols() {
    var box = d.getElementById('pcols'); if (!box) return; box.textContent = '';
    if (!cols.length) { box.hidden = true; return; }
    box.hidden = false; var h = el('div', 'shead'); h.appendChild(el('h2', null, 'Collections')); box.appendChild(h);
    var row = el('div', 'pcolrow');
    cols.forEach(function (c) {
      var x = el('div', 'pcol'); x.appendChild(el('b', null, c.name)); if (c.description) x.appendChild(el('p', 'pdesc', c.description));
      var ul = el('p', 'pcolnames');
      c.plugins.forEach(function (id, i) { var p = all.filter(function (q) { return q.id === id; })[0]; var a = el('a', null, p ? p.name : id); a.href = '#' + id; if (i) ul.appendChild(d.createTextNode(', ')); ul.appendChild(a); });
      x.appendChild(ul);
      var cmd = '.plugin bundle ' + c.id; var r = el('div', 'prow'); r.appendChild(el('code', null, cmd)); r.appendChild(copyBtn(cmd, 'Copy')); x.appendChild(r);
      x.appendChild(el('p', 'fine', 'Installs the whole set. You still approve each plugin.')); row.appendChild(x);
    });
    box.appendChild(row);
  }
  function sorted(arr) {
    var a = arr.slice();
    if (sortBy === 'name') a.sort(function (x, y) { return x.name.localeCompare(y.name); });
    else if (sortBy === 'new') a.sort(function (x, y) { return String(y.publishedAt || '').localeCompare(String(x.publishedAt || '')); });
    else if (sortBy === 'rate') a.sort(function (x, y) { var rx = x.rating ? x.rating.avg : -1, ry = y.rating ? y.rating.avg : -1; return ry - rx || (y.rating ? y.rating.count : 0) - (x.rating ? x.rating.count : 0); });
    else a.sort(function (x, y) { return (y.featured ? 1 : 0) - (x.featured ? 1 : 0); });
    return a;
  }
  function renderBrowse() {
    var q = search.value.trim().toLowerCase(), f = FILTERS.filter(function (x) { return x.id === filter; })[0] || FILTERS[0];
    var shown = sorted(all.filter(function (p) { return f.test(p) && (!q || (p.id + ' ' + p.name + ' ' + p.description + ' ' + p.author).toLowerCase().indexOf(q) >= 0); }));
    var featBox = d.getElementById('pfeat'), featList = d.getElementById('pfeatlist'), allHead = d.getElementById('pallhead');
    list.textContent = ''; featList.textContent = '';
    var split = filter === 'all' && !q && sortBy === 'feat' && shown.some(function (p) { return p.featured; }) && shown.some(function (p) { return !p.featured; });
    featBox.hidden = !split; allHead.hidden = !split;
    if (split) { shown.filter(function (p) { return p.featured; }).forEach(function (p) { featList.appendChild(card(p)); }); shown.filter(function (p) { return !p.featured; }).forEach(function (p) { list.appendChild(card(p)); }); }
    else shown.forEach(function (p) { list.appendChild(card(p)); });
    count.textContent = shown.length + (shown.length === 1 ? ' plugin' : ' plugins');
    say(shown.length ? '' : (all.length ? 'No plugin matches your search.' : 'No plugins have been published yet. Check back soon.'));
  }

  // ---------- one plugin ----------
  function section(title, cls) { var s = el('section', 'dsec' + (cls ? ' ' + cls : '')); s.appendChild(el('h2', null, title)); return s; }
  function sideCard(title) { var s = el('section', 'scard'); s.appendChild(el('h3', null, title)); return s; }
  function fact(k, v) { var r = el('div', 'fact'); r.appendChild(el('span', null, k)); r.appendChild(el('b', null, v)); return r; }

  function drawDetail(p) {
    detail.textContent = '';
    var back = el('a', 'backlnk'); back.href = '#'; back.appendChild(ico('i-arrow')); back.appendChild(d.createTextNode('All plugins')); detail.appendChild(back);

    var hd = el('header', 'pdhead card glow');
    var row = el('div', 'pdrow'); row.appendChild(iconOf(p, 88));
    var tx = el('div', 'pdtx'); var h1 = el('h1', null, p.name); tx.appendChild(h1);
    var meta = el('div', 'pdmeta'); meta.appendChild(el('span', 'pver', 'v' + p.version));
    if (p.featured) meta.appendChild(el('span', 'pfeat', 'Featured'));
    if (p.dev && p.dev.verified) { var v = el('span', 'pver2'); v.appendChild(ico('i-check')); v.appendChild(d.createTextNode('Verified developer')); meta.appendChild(v); }
    var rt = el('span', 'prate'); rt.hidden = true; meta.appendChild(rt);
    tx.appendChild(meta); tx.appendChild(el('p', 'pdby', 'By ' + (p.author || 'unknown'))); row.appendChild(tx); hd.appendChild(row);
    hd.appendChild(el('p', 'pdlead', p.description));
    var inst = el('div', 'pinstall'); inst.appendChild(el('span', 'ilabel', 'Install on your bot')); var cmd = '.plugin install ' + p.id; var r2 = el('div', 'prow big'); r2.appendChild(el('code', null, cmd)); r2.appendChild(copyBtn(cmd, 'Copy', 'btn btn-gold sm')); inst.appendChild(r2);
    inst.appendChild(el('p', 'fine', 'Send it as the bot owner. Switch plugins on first with .plugin on.')); hd.appendChild(inst);
    detail.appendChild(hd);
    function setRate(r) { rt.hidden = !r; rt.textContent = ''; if (r) { rt.appendChild(ico('i-star')); rt.appendChild(d.createTextNode(r.avg.toFixed(1) + ' (' + r.count + ')')); } }
    setRate(p.rating || null);

    var grid = el('div', 'pdgrid'), main = el('div', 'pdmain'), side = el('aside', 'pdside');

    if (p.docs && p.docs.shots) {
      var s = section('Screenshots'); var gal = el('div', 'pshots');
      for (var si = 1; si <= p.docs.shots; si++) { var sa = el('a', 'pshot'); sa.target = '_blank'; sa.rel = 'noopener'; var u = '/api/plugin-shot?id=' + encodeURIComponent(p.id) + '&v=' + encodeURIComponent(p.version) + '&n=' + si; sa.href = u; var sim = el('img'); sim.alt = 'Screenshot ' + si + ' of ' + p.name; sim.loading = 'lazy'; sim.src = u; sa.appendChild(sim); gal.appendChild(sa); }
      s.appendChild(gal); main.appendChild(s);
    }
    function docBlock(kind, title, open) {
      var s = section(title), out = el('pre', 'pdoc'); out.tabIndex = 0; out.textContent = 'Loading…'; s.appendChild(out);
      fetch('/api/plugin-doc?id=' + encodeURIComponent(p.id) + '&v=' + encodeURIComponent(p.version) + '&f=' + kind, { headers: { accept: 'application/json' } })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) { out.textContent = x.ok && typeof x.j.text === 'string' ? x.j.text : 'This could not be loaded right now.'; })
        .catch(function () { out.textContent = 'This could not be loaded right now.'; });
      return s;
    }
    if (p.docs && p.docs.readme) main.appendChild(docBlock('readme', 'About this plugin'));
    if (p.docs && p.docs.changelog) main.appendChild(docBlock('changelog', 'What changed'));
    var rs = section('Ratings and reviews', 'rev'); var rbox = el('div', 'prev'); rs.appendChild(rbox); main.appendChild(rs);
    ratings(p, rbox, setRate);

    var perms = sideCard('What it asks for'); var ul = el('ul', 'plist2');
    if (!p.permissions.length) ul.appendChild(el('li', 'pchip low', 'Asks for nothing special'));
    p.permissions.forEach(function (x) { var li = el('li', 'pchip ' + x.risk); li.appendChild(el('b', null, RISK[x.risk] || 'Medium')); li.appendChild(d.createTextNode(' ' + x.text)); ul.appendChild(li); });
    perms.appendChild(ul); if (p.domains.length) perms.appendChild(el('p', 'fine', 'Websites it connects to: ' + p.domains.join(', '))); side.appendChild(perms);

    var dv = sideCard('Developer');
    if (p.dev) {
      dv.appendChild(el('b', 'dvname', p.dev.developer));
      dv.appendChild(el('p', 'fine', p.dev.verified ? 'Verified by the TurboFex team: we checked who they are.' : 'Not verified yet. Every plugin is still read before it is published.'));
      if (/^https:\/\/github\.com\/[A-Za-z0-9._\/-]+$/.test(p.dev.source)) { var src = el('a', 'btn btn-ghost sm'); src.href = p.dev.source; src.target = '_blank'; src.rel = 'noopener noreferrer'; src.appendChild(ico('i-gh')); src.appendChild(el('span', null, 'Source code on GitHub')); dv.appendChild(src); }
    } else dv.appendChild(el('p', 'fine', 'By ' + (p.author || 'unknown')));
    side.appendChild(dv);

    var dt = sideCard('Details'); dt.appendChild(fact('Version', p.version)); if (p.publishedAt) dt.appendChild(fact('Published', p.publishedAt.slice(0, 10)));
    if (p.botRating) dt.appendChild(fact('Bot owners say', '★ ' + p.botRating.avg.toFixed(1) + ' (' + p.botRating.count + (p.botRating.count === 1 ? ' bot' : ' bots') + ')'));
    dt.appendChild(el('p', 'fine', 'Already installed? Send .plugin updates to see if there is a newer version, then .plugin update ' + p.id + '.')); side.appendChild(dt);
    if (p.history && p.history.length > 1) {
      var vs = sideCard('Versions'); var vl = el('ol', 'timeline'); p.history.forEach(function (h) { var li = el('li'); li.appendChild(el('b', null, 'v' + h.version)); if (h.publishedAt) li.appendChild(el('span', null, h.publishedAt.slice(0, 10))); vl.appendChild(li); }); vs.appendChild(vl); side.appendChild(vs);
    }
    grid.appendChild(main); grid.appendChild(side); detail.appendChild(grid);
    d.title = p.name + ' — TurboFex Plugins';
  }

  // ---------- which view ----------
  function route() {
    if (!loaded) return;
    var want = decodeURIComponent((location.hash || '').slice(1)), p = want && all.filter(function (x) { return x.id === want; })[0];
    if (p) {
      if (detail.hidden) lastY = window.scrollY || 0;
      browse.hidden = true; detail.hidden = false; drawDetail(p); window.scrollTo(0, 0);
    } else {
      var was = !detail.hidden; detail.hidden = true; browse.hidden = false; d.title = baseTitle; detail.textContent = '';
      if (want) say('That plugin is not in the store (it may have been removed).');
      if (was) window.scrollTo(0, lastY);
    }
  }
  function render() { renderBrowse(); }
  search.addEventListener('input', render);
  d.getElementById('psort').addEventListener('change', function (e) { sortBy = e.target.value; render(); });
  addEventListener('hashchange', route);

  fetch('/api/plugins', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (x) {
    if (!x.ok) throw new Error(x.j && x.j.error);
    list.textContent = '';
    if (x.j.paused) { count.textContent = ''; return say('The plugin store is paused for a little while. Please check back soon.'); }
    all = x.j.plugins || []; cols = x.j.collections || []; search.disabled = false;
    return fetch('/api/dev/me', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (m) { me = m; }, function () { me = null; }).then(function () { loaded = true; drawFilters(); drawCols(); render(); route(); });
  }).catch(function (e) { list.textContent = ''; count.textContent = ''; say((e && e.message) || 'The plugin list cannot be loaded right now. Please try again in a moment.'); });
})();
