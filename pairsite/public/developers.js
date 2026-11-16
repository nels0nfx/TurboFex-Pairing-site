// Developer Centre + Developer Dashboard. Everything is added with textContent (never as HTML).
(function () {
  var stateBox = document.getElementById('dstate'), pub = document.getElementById('dpublic'), dash = document.getElementById('dash');
  if (!stateBox) return;
  var notice = document.getElementById('dnotice'), form = document.getElementById('dsend'), go = document.getElementById('dgo'), msg = document.getElementById('dmsg'), prob = document.getElementById('dprob'), subs = document.getElementById('dsubs'), hookBox = document.getElementById('dhooks');
  var NOTES = { off: 'The Developer Centre is not open yet. Please check back soon.', wait: 'Too many tries. Please wait a few minutes and try again.', login: 'GitHub sign-in did not finish. Please try again.', blocked: 'This account cannot sign in.' };
  var STATUS = { pending: ['Waiting for review', 'wait'], approved: ['Approved: waiting to be published', 'ok'], published: ['Published', 'ok'], rejected: ['Not accepted', 'bad'], changes: ['Changes requested', 'wait'], revoked: ['Withdrawn from the store', 'bad'], withdrawn: ['Withdrawn', ''] };
  var VIEWS = [['dashboard', 'Dashboard', 'grid'], ['plugins', 'My plugins', 'puzzle'], ['send', 'Send a plugin', 'send'], ['tools', 'Developer tools', 'code'], ['analytics', 'Analytics', 'chart'], ['support', 'Support', 'life'], ['community', 'Community', 'users'], ['settings', 'Settings', 'gear']];
  var data = null, stats = {}, insights = {};

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function ico(id) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#i-' + id); s.appendChild(u); return s; }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tfx' }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); });
  }
  function say(text, problems) {
    msg.classList.remove('ok'); msg.hidden = !text; msg.textContent = text || ''; prob.textContent = ''; prob.hidden = !(problems && problems.length);
    (problems || []).forEach(function (p) { prob.appendChild(el('li', null, p)); });
  }
  function day(t) { return new Date(t).toLocaleDateString(); }

  var e = (new URLSearchParams(location.search).get('e') || '');
  if (NOTES[e]) { notice.textContent = NOTES[e]; notice.hidden = false; try { history.replaceState(null, '', '/developers'); } catch (x) { /* fine */ } }

  // ----- navigation between dashboard views -----
  var nav = document.getElementById('dnav'), navBtns = {};
  VIEWS.forEach(function (v) {
    var b = el('button', 'dn'); b.type = 'button'; b.id = 'n-' + v[0]; b.setAttribute('role', 'tab'); b.appendChild(ico(v[2])); b.appendChild(el('span', null, v[1]));
    b.addEventListener('click', function () { show(v[0], true); }); nav.appendChild(b); navBtns[v[0]] = b;
  });
  function show(name, push) {
    if (!navBtns[name]) name = 'dashboard';
    VIEWS.forEach(function (v) { var on = v[0] === name, p = document.getElementById('v-' + v[0]); p.hidden = !on; navBtns[v[0]].setAttribute('aria-selected', on ? 'true' : 'false'); navBtns[v[0]].classList.toggle('on', on); });
    if (push) { try { history.replaceState(null, '', '#' + name); } catch (x) { /* fine */ } window.scrollTo(0, 0); }
    var cur = navBtns[name]; if (cur && cur.scrollIntoView && nav.scrollWidth > nav.clientWidth) { try { nav.scrollLeft = Math.max(0, cur.offsetLeft - 16); } catch (x) { /* fine */ } }
  }
  dash.addEventListener('click', function (ev) { var t = ev.target.closest && ev.target.closest('[data-go]'); if (t) show(t.getAttribute('data-go'), true); });
  window.addEventListener('hashchange', function () { if (!dash.hidden) show(location.hash.slice(1)); });

  // ----- My plugins -----
  function drawSubs(list) {
    subs.textContent = '';
    if (!list.length) {
      var em = el('div', 'empty'); em.appendChild(ico('puzzle')); em.appendChild(el('b', null, 'You have not sent a plugin yet')); em.appendChild(el('p', 'dmuted', 'When you send one it shows up here with its review status.'));
      var sb = el('button', 'btn btn-gold sm', 'Send your first plugin'); sb.type = 'button'; sb.setAttribute('data-go', 'send'); em.appendChild(sb); subs.appendChild(em); return;
    }
    // One card per plugin. A newer version of a plugin that is already in the store is an UPDATE of it, not a second plugin:
    // the older versions are tucked into "Earlier versions" under the card.
    var LIVE_NOW = { pending: 1, changes: 1, approved: 1, published: 1 }, groups = {}, order = [];
    list.forEach(function (s) { if (!groups[s.pluginId]) { groups[s.pluginId] = []; order.push(s.pluginId); } groups[s.pluginId].push(s); });
    function vnum(v) { var p = String(v).split('.').map(Number); return (p[0] || 0) * 1e8 + (p[1] || 0) * 1e4 + (p[2] || 0); }
    order.forEach(function (pid) {
      var all = groups[pid].slice().sort(function (a, b) { return vnum(b.version) - vnum(a.version) || b.createdAt - a.createdAt; });
      var s = all.filter(function (x) { return LIVE_NOW[x.status]; })[0] || all[0];   // the newest version that still counts
      var older = all.filter(function (x) { return x !== s; });
      var live = all.filter(function (x) { return x.status === 'published'; })[0];       // what people can install right now
      var olderPublished = older.some(function (x) { return x.status === 'published' || x.status === 'revoked'; });
      var st = STATUS[s.status] || [s.status, ''], card = el('article', 'dsub');
      if (s.status === 'published' && olderPublished) st = ['Updated', 'ok'];
      else if (live && live !== s && (s.status === 'pending' || s.status === 'changes' || s.status === 'approved')) st = ['Update: ' + st[0].charAt(0).toLowerCase() + st[0].slice(1), 'wait'];
      var top = el('div', 'dsub-t'); top.appendChild(el('b', null, s.name)); top.appendChild(el('span', 'dver', 'v' + s.version)); top.appendChild(el('span', 'dtag ' + st[1], st[0]));
      card.appendChild(top);
      if (live && live !== s) card.appendChild(el('p', 'dmuted', 'Live in the store now: v' + live.version));
      card.appendChild(el('p', 'dmuted', s.pluginId + ' · ' + s.tag + ' · sent ' + day(s.createdAt)));
      if (live) { var lk = el('a', 'more', 'View in the marketplace'); lk.href = '/plugins#' + encodeURIComponent(s.pluginId); lk.appendChild(ico('arrow')); card.appendChild(lk); }
      var ps = live && stats[s.pluginId];
      if (ps) { var vs = Object.keys(ps.versions).sort().map(function (v) { return v + ' × ' + ps.versions[v]; }).join(', '); card.appendChild(el('p', 'dmuted', 'Used by ' + ps.installs + (ps.installs === 1 ? ' bot' : ' bots') + ' (' + ps.enabled + ' switched on) · versions: ' + vs + ' · failures in their last reports: ' + ps.errors + '. Only bots whose owner shares anonymous statistics are counted.')); }
      var ins = live && insights[s.pluginId];
      if (ins) {
        if (ins.rating) card.appendChild(el('p', 'dmuted', 'Rating: ★ ' + ins.rating.avg.toFixed(1) + ' out of 5 from ' + ins.rating.count + (ins.rating.count === 1 ? ' person' : ' people')));
        if (ins.reports) card.appendChild(el('p', 'dmuted', ins.reports + (ins.reports === 1 ? ' report was' : ' reports were') + ' sent about this plugin. The reviewer looks at them; you are not told who sent them.'));
        ins.reviews.forEach(function (r) { card.appendChild(el('p', 'dreason', '★'.repeat(r.stars) + ' ' + r.login + ': ' + r.text)); });
      }
      if (s.status === 'rejected' && s.note) card.appendChild(el('p', 'dreason', 'Reason: ' + s.note));
      if (s.status === 'changes' && s.note) card.appendChild(el('p', 'dreason', 'Please change: ' + s.note + ' (fix it, make a new tag or move the tag, and send it again)'));
      (s.replies || []).forEach(function (r) { card.appendChild(el('p', 'dmuted', 'You wrote (' + day(r.at) + '): ' + r.text)); });
      var acts = el('div', 'dacts');
      if (s.status === 'pending' || s.status === 'changes' || s.status === 'approved') {
        var tb = el('button', 'btn btn-ghost sm', 'Get a private test code'); tb.type = 'button'; var tout = el('p', 'dmuted dcode', '');
        tb.addEventListener('click', function () { tb.disabled = true; post('/api/dev/testcode', { id: s.id }).then(function (x) { tb.disabled = false; if (x.ok) tout.textContent = 'Code: ' + x.j.code + ' (works once, for one hour). On YOUR bot, as owner, send: .plugin test ' + x.j.code; else tout.textContent = (x.j && x.j.error) || 'Could not make a code'; }); });
        acts.appendChild(tb); card.appendChild(acts); card.appendChild(tout);
      }
      if (s.status === 'pending' || s.status === 'changes' || s.status === 'rejected') {
        var rt = el('textarea', 'dreplybox'); rt.maxLength = 500; rt.rows = 2; rt.placeholder = 'Write to the reviewer (up to 500 characters)'; rt.setAttribute('aria-label', 'Message to the reviewer');
        var rb = el('button', 'btn btn-ghost sm', 'Send message'); rb.type = 'button';
        rb.addEventListener('click', function () { rb.disabled = true; post('/api/dev/reply', { id: s.id, text: rt.value }).then(function (x) { if (x.ok) load(); else { rb.disabled = false; rb.textContent = (x.j && x.j.error) || 'Could not send'; } }); });
        card.appendChild(rt); card.appendChild(rb);
      }
      if (s.status === 'pending' || s.status === 'approved') {
        var b = el('button', 'btn btn-soft sm dwd', 'Withdraw'); b.type = 'button';
        b.addEventListener('click', function () { b.disabled = true; post('/api/dev/withdraw', { id: s.id }).then(function (x) { if (x.ok) load(); else { b.disabled = false; b.textContent = (x.j && x.j.error) || 'Could not withdraw'; } }); });
        acts.appendChild(b); if (!acts.parentNode) card.appendChild(acts);
      }
      if (older.length) {
        var det = el('details', 'dolder'); det.appendChild(el('summary', null, 'Earlier versions (' + older.length + ')'));
        older.forEach(function (o) { var ost = STATUS[o.status] || [o.status, '']; var row = el('p', 'dmuted'); row.textContent = 'v' + o.version + ' · ' + ost[0] + ' · sent ' + day(o.createdAt) + (o.status === 'rejected' && o.note ? ' · ' + o.note : ''); det.appendChild(row); });
        card.appendChild(det);
      }
      subs.appendChild(card);
    });
  }

  // ----- overview -----
  function tile(icon, n, label) { var t = el('div', 'tile'); t.appendChild(ico(icon)); var d = el('div'); d.appendChild(el('b', 'tn', String(n))); d.appendChild(el('span', null, label)); t.appendChild(d); return t; }
  function drawOverview(j) {
    var list = j.submissions || [], pubd = list.filter(function (s) { return s.status === 'published'; }), wait = list.filter(function (s) { return s.status === 'pending' || s.status === 'changes' || s.status === 'approved'; });
    document.getElementById('wname').textContent = 'Welcome back, ' + j.user.login;
    var ws = document.getElementById('wstat'); ws.textContent = '';
    var v = el('div', 'vbadge ' + (j.user.verified ? 'ok' : '')); v.appendChild(ico(j.user.verified ? 'check' : 'user')); v.appendChild(el('b', null, j.user.verified ? 'Verified developer' : 'Developer')); v.appendChild(el('span', null, j.user.verified ? 'Your GitHub account is confirmed.' : 'Get a plugin published to become verified.')); ws.appendChild(v);
    var t = document.getElementById('tiles'); t.textContent = '';
    t.appendChild(tile('send', list.length, list.length === 1 ? 'Plugin sent' : 'Plugins sent'));
    t.appendChild(tile('store', pubd.length, 'Published'));
    t.appendChild(tile('clock', wait.length, 'Waiting for review'));
    var ratings = 0, sum = 0, bots = 0, hasStats = false;
    Object.keys(insights).forEach(function (k) { var r = insights[k] && insights[k].rating; if (r) { ratings += r.count; sum += r.avg * r.count; } });
    Object.keys(stats).forEach(function (k) { hasStats = true; bots += stats[k].installs || 0; });
    if (ratings) t.appendChild(tile('star', (sum / ratings).toFixed(1), 'Average rating (' + ratings + ')'));
    if (hasStats) t.appendChild(tile('users', bots, bots === 1 ? 'Bot using your plugins' : 'Bots using your plugins'));
    var op = document.getElementById('ov-plugins'); op.textContent = '';
    if (!list.length) op.appendChild(el('p', 'dmuted', 'Nothing yet. Your plugins will appear here.'));
    list.slice(0, 4).forEach(function (s) { var st = STATUS[s.status] || [s.status, ''], r = el('div', 'orow'); var l = el('div'); l.appendChild(el('b', null, s.name)); l.appendChild(el('span', 'dmuted', 'v' + s.version + ' · ' + day(s.createdAt))); r.appendChild(l); r.appendChild(el('span', 'dtag ' + st[1], st[0])); op.appendChild(r); });
    var ev = []; list.forEach(function (s) { ev.push({ at: s.createdAt, t: 'Sent ' + s.name + ' v' + s.version }); (s.replies || []).forEach(function (r) { ev.push({ at: r.at, t: 'You wrote to the reviewer about ' + s.name }); }); if (s.status !== 'pending' && STATUS[s.status]) ev.push({ at: s.updatedAt || s.createdAt, t: s.name + ': ' + STATUS[s.status][0] }); });
    ev.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    var fd = document.getElementById('ov-feed'); fd.textContent = '';
    if (!ev.length) fd.appendChild(el('li', 'dmuted', 'No activity yet.'));
    ev.slice(0, 6).forEach(function (x) { var li = el('li'); li.appendChild(el('span', 'fdot')); li.appendChild(el('span', null, x.t)); li.appendChild(el('time', 'dmuted', day(x.at))); fd.appendChild(li); });
    var perf = document.getElementById('ov-perf'), pb = document.getElementById('ov-perf-box'); perf.textContent = ''; var any = false;
    pubd.forEach(function (s) { var ps = stats[s.pluginId], ins = insights[s.pluginId]; if (!ps && !(ins && ins.rating)) return; any = true; var r = el('div', 'orow'); r.appendChild(el('b', null, s.name)); var m = []; if (ps) m.push(ps.installs + (ps.installs === 1 ? ' bot' : ' bots')); if (ins && ins.rating) m.push('★ ' + ins.rating.avg.toFixed(1)); r.appendChild(el('span', 'dmuted', m.join(' · '))); perf.appendChild(r); });
    pb.hidden = !any;
  }

  // ----- analytics -----
  function drawAnalytics(j) {
    var box = document.getElementById('an-body'); box.textContent = '';
    var pubd = (j.submissions || []).filter(function (s) { return s.status === 'published'; }), shown = 0;
    pubd.forEach(function (s) {
      var ps = stats[s.pluginId], ins = insights[s.pluginId]; if (!ps && !ins) return; shown++;
      var p = el('section', 'panel'); p.appendChild(el('h2', null, s.name));
      var tl = el('div', 'tiles sm');
      if (ps) { tl.appendChild(tile('users', ps.installs, ps.installs === 1 ? 'Bot' : 'Bots')); tl.appendChild(tile('check', ps.enabled, 'Switched on')); tl.appendChild(tile('alert', ps.errors, 'Failures reported')); }
      if (ins && ins.rating) tl.appendChild(tile('star', ins.rating.avg.toFixed(1), ins.rating.count + (ins.rating.count === 1 ? ' rating' : ' ratings')));
      if (ins && ins.reports) tl.appendChild(tile('flag', ins.reports, ins.reports === 1 ? 'Report' : 'Reports'));
      p.appendChild(tl);
      if (ps && Object.keys(ps.versions).length) { p.appendChild(el('h3', null, 'Versions in use')); var mx = Math.max.apply(null, Object.keys(ps.versions).map(function (k) { return ps.versions[k]; })); Object.keys(ps.versions).sort().forEach(function (v) { var r = el('div', 'bar'); r.appendChild(el('span', null, v)); var tr = el('span', 'btrack'), fl = el('i'); fl.style.width = Math.max(4, Math.round(ps.versions[v] / mx * 100)) + '%'; tr.appendChild(fl); r.appendChild(tr); r.appendChild(el('b', 'tn', String(ps.versions[v]))); p.appendChild(r); }); }
      if (ins && ins.reviews && ins.reviews.length) { p.appendChild(el('h3', null, 'Reviews')); ins.reviews.forEach(function (r) { p.appendChild(el('p', 'dreason', '★'.repeat(r.stars) + ' ' + r.login + ': ' + r.text)); }); }
      box.appendChild(p);
    });
    if (!shown) { var em = el('div', 'empty'); em.appendChild(ico('chart')); em.appendChild(el('b', null, 'No numbers yet')); em.appendChild(el('p', 'dmuted', pubd.length ? 'Numbers appear once bots use your plugins or people rate them.' : 'Numbers appear here after your first plugin is published.')); box.appendChild(em); }
  }

  // ----- automatic sending (GitHub webhook) -----
  function drawHooks(list) {
    var box = document.getElementById('dhooklist'); if (!box) return; box.textContent = '';
    if (!list.length) { box.appendChild(el('p', 'dmuted', 'No repositories listed yet.')); return; }
    list.forEach(function (h) {
      var c = el('div', 'dsub'); c.appendChild(el('b', null, h.repo.replace('https://github.com/', '') + (h.folder ? ' / ' + h.folder : '')));
      c.appendChild(el('p', 'dmuted', h.last ? 'Last: ' + h.last.tag + ' - ' + h.last.text + ' (' + day(h.last.at) + ')' : 'Nothing received yet.'));
      var rb = el('button', 'btn btn-ghost sm', 'Remove'); rb.type = 'button';
      rb.addEventListener('click', function () { rb.disabled = true; post('/api/dev/hooks', { action: 'remove', repo: h.repo }).then(function (x) { if (x.ok) drawHooks(x.j.hooks || []); else rb.disabled = false; }); });
      c.appendChild(rb); box.appendChild(c);
    });
  }
  if (hookBox) {
    var hm = document.getElementById('dhmsg');
    var hsay = function (t) { hm.hidden = !t; hm.textContent = t || ''; };
    var showInfo = function (x) { if (!x.ok) { hsay((x.j && x.j.error) || 'Could not do that'); return; } hsay(''); document.getElementById('dhurl').textContent = x.j.url; document.getElementById('dhsecret').textContent = x.j.secret; document.getElementById('dhinfo').hidden = false; };
    document.getElementById('dhshow').addEventListener('click', function () { post('/api/dev/hooks', { action: 'secret' }).then(showInfo); });
    document.getElementById('dhnew').addEventListener('click', function () { if (!confirm('Make a new secret? The old one stops working, so you must paste the new one into GitHub.')) return; post('/api/dev/hooks', { action: 'rotate' }).then(showInfo); });
    document.getElementById('dhookadd').addEventListener('submit', function (ev) {
      ev.preventDefault(); hsay('');
      post('/api/dev/hooks', { action: 'add', repo: document.getElementById('dhrepo').value, folder: document.getElementById('dhfolder').value }).then(function (x) { if (x.ok) { document.getElementById('dhrepo').value = ''; document.getElementById('dhfolder').value = ''; drawHooks(x.j.hooks || []); } else hsay((x.j && x.j.error) || 'Could not add'); });
    });
  }

  function signedOut(j) {
    pub.hidden = false; dash.hidden = true; document.body.classList.remove('indash'); stateBox.textContent = '';
    if (!j || !j.configured) { stateBox.appendChild(el('h2', null, 'Not open yet')); stateBox.appendChild(el('p', 'dmuted', 'The Developer Centre is not open yet. Please check back soon.')); return; }
    stateBox.appendChild(el('h2', null, 'Sign in'));
    stateBox.appendChild(el('p', null, 'Use your GitHub account. We only read your public username. Nothing else is requested.'));
    var a = el('a', 'btn btn-gold', 'Sign in with GitHub'); a.href = '/auth/github'; a.insertBefore(ico('gh'), a.firstChild); stateBox.appendChild(a);
    stateBox.appendChild(el('p', 'fine', 'No email address, no access to your repositories.'));
  }
  function signedIn(j) {
    pub.hidden = true; dash.hidden = false; document.body.classList.add('indash'); data = j; stats = j.stats || {}; insights = j.insights || {};
    if (hookBox) { hookBox.hidden = false; drawHooks(j.hooks || []); }
    drawOverview(j); drawSubs(j.submissions || []); drawAnalytics(j);
    var ac = document.getElementById('acct'); ac.textContent = ''; var r1 = el('div', 'orow'); r1.appendChild(el('span', 'dmuted', 'GitHub username')); r1.appendChild(el('b', null, j.user.login)); ac.appendChild(r1);
    var r2 = el('div', 'orow'); r2.appendChild(el('span', 'dmuted', 'Status')); r2.appendChild(el('b', null, j.user.verified ? 'Verified developer' : 'Developer')); ac.appendChild(r2);
    show(location.hash.slice(1));
  }
  function load() {
    return fetch('/api/dev/me', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.configured || !j.user) return signedOut(j);
      signedIn(j);
    }).catch(function () { pub.hidden = false; dash.hidden = true; stateBox.textContent = ''; stateBox.appendChild(el('p', 'dmuted', 'The Developer Centre cannot be loaded right now. Please try again in a moment.')); });
  }
  document.getElementById('dout').addEventListener('click', function () { post('/api/dev/logout').then(function () { try { history.replaceState(null, '', '/developers'); } catch (x) { /* fine */ } load(); }); });
  form.addEventListener('submit', function (ev) {
    ev.preventDefault(); say('');
    var body = { repo: document.getElementById('drepo').value, tag: document.getElementById('dtag').value, folder: document.getElementById('dfolder').value };
    if (!body.repo.trim() || !body.tag.trim()) return say('Fill in the repository address and the release tag.');
    go.disabled = true; go.lastChild.textContent = 'Checking…';
    post('/api/dev/submit', body).then(function (x) {
      go.disabled = false; go.lastChild.textContent = 'Send for review';
      if (!x.ok) return say((x.j && x.j.error) || 'Something went wrong.', x.j && x.j.problems);
      form.reset(); say('Sent. It now waits for review (we aim to answer within 14 days).'); msg.classList.add('ok'); load().then(function () { show('plugins', true); });
    }, function () { go.disabled = false; go.lastChild.textContent = 'Send for review'; say('The site could not be reached. Please try again.'); });
  });
  load();
})();
