// Developer Centre, new look (preview). Signed out: sign-in page. Signed in: a small app with five screens (Home, Plugins, Send, Stats, Account).
// Same server calls as developers.js. Everything is added with textContent (never as HTML).
(function () {
  var stateBox = document.getElementById('dstate'), pub = document.getElementById('dpublic'), dash = document.getElementById('dash'), tabs = document.getElementById('dtabs');
  if (!stateBox) return;
  var notice = document.getElementById('dnotice'), form = document.getElementById('dsend'), go = document.getElementById('dgo'), msg = document.getElementById('dmsg'), prob = document.getElementById('dprob'), subs = document.getElementById('dsubs'), hookBox = document.getElementById('dhooks');
  var NOTES = { off: 'The Developer Centre is not open yet. Please check back soon.', wait: 'Too many tries. Please wait a few minutes and try again.', login: 'GitHub sign-in did not finish. Please try again.', blocked: 'This account cannot sign in.' };
  var STATUS = { pending: ['In review', 'wait'], approved: ['Approved', 'ok'], published: ['Live', 'ok'], rejected: ['Not accepted', 'bad'], changes: ['Changes', 'wait'], revoked: ['Withdrawn by us', 'bad'], withdrawn: ['Withdrawn', ''] };
  var VIEWS = ['home', 'plugins', 'send', 'stats', 'account'];
  var FILTERS = [['all', 'All'], ['live', 'Live'], ['review', 'In review'], ['issues', 'Issues']];
  var data = null, stats = {}, insights = {}, groups = [], filter = 'all';

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function ico(id) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#i-' + id); s.appendChild(u); return s; }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tfx' }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); });
  }
  function say(text, problems) {
    msg.classList.remove('ok'); msg.hidden = !text; msg.textContent = text || ''; prob.textContent = ''; prob.hidden = !(problems && problems.length);
    (problems || []).forEach(function (p) { prob.appendChild(el('li', null, p)); });
  }
  function ago(t) {
    var d = Math.floor((Date.now() - new Date(t).getTime()) / 86400000);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? d + ' days ago' : new Date(t).toLocaleDateString();
  }
  function vnum(v) { var p = String(v).split('.').map(Number); return (p[0] || 0) * 1e8 + (p[1] || 0) * 1e4 + (p[2] || 0); }

  var e = (new URLSearchParams(location.search).get('e') || '');
  if (NOTES[e]) { notice.textContent = NOTES[e]; notice.hidden = false; try { history.replaceState(null, '', '/new/developers'); } catch (x) { /* fine */ } }

  // ----- screens -----
  var tabBtns = {};
  VIEWS.forEach(function (v) { tabBtns[v] = document.getElementById('n-' + v); });
  function show(name, push) {
    if (VIEWS.indexOf(name) < 0) name = 'home';
    VIEWS.forEach(function (v) { var on = v === name; document.getElementById('v-' + v).hidden = !on; tabBtns[v].setAttribute('aria-selected', on ? 'true' : 'false'); tabBtns[v].classList.toggle('on', on); });
    if (push) { try { history.replaceState(null, '', '#' + name); } catch (x) { /* fine */ } window.scrollTo(0, 0); }
  }
  document.addEventListener('click', function (ev) { var t = ev.target.closest && ev.target.closest('[data-go]'); if (t && !dash.hidden) show(t.getAttribute('data-go'), true); });
  window.addEventListener('hashchange', function () { if (!dash.hidden) show(location.hash.slice(1)); });

  // ----- group the submissions: one card per plugin; a newer version of a live plugin is an update of it -----
  function makeGroups(list) {
    var LIVE_NOW = { pending: 1, changes: 1, approved: 1, published: 1 }, by = {}, order = [];
    list.forEach(function (s) { if (!by[s.pluginId]) { by[s.pluginId] = []; order.push(s.pluginId); } by[s.pluginId].push(s); });
    return order.map(function (pid) {
      var all = by[pid].slice().sort(function (a, b) { return vnum(b.version) - vnum(a.version) || b.createdAt - a.createdAt; });
      var s = all.filter(function (x) { return LIVE_NOW[x.status]; })[0] || all[0];
      var live = all.filter(function (x) { return x.status === 'published'; })[0];
      var older = all.filter(function (x) { return x !== s; });
      var olderPublished = older.some(function (x) { return x.status === 'published' || x.status === 'revoked'; });
      var st = STATUS[s.status] || [s.status, ''];
      var waiting = s.status === 'pending' || s.status === 'changes' || s.status === 'approved';
      if (s.status === 'published' && olderPublished) st = ['Updated', 'ok'];
      else if (live && live !== s && waiting) st = [s.status === 'changes' ? 'Update: changes' : 'Update in review', 'wait'];
      var kind = s.status === 'published' ? 'live' : waiting ? (s.status === 'changes' ? 'issues' : 'review') : 'issues';
      if (live && live !== s && waiting && s.status !== 'changes') kind = 'review';
      return { pid: pid, s: s, live: live, older: older, st: st, kind: kind, waiting: waiting, all: all };
    });
  }

  // ----- Home -----
  function tile(n, label) { var t = el('div'); t.appendChild(el('b', null, String(n))); t.appendChild(el('span', null, label)); return t; }
  function drawHome(j) {
    document.getElementById('wname').textContent = 'Hi, ' + j.user.login;
    var ws = document.getElementById('wstat'); ws.textContent = '';
    var v = el('span', 'vbadge' + (j.user.verified ? ' ok' : '')); v.appendChild(ico(j.user.verified ? 'check' : 'user')); v.appendChild(el('b', null, j.user.verified ? 'Verified developer' : 'Developer')); ws.appendChild(v);
    var t = document.getElementById('tiles'); t.textContent = '';
    var live = groups.filter(function (g) { return g.live; }).length, review = groups.filter(function (g) { return g.waiting; }).length, bots = 0, hasStats = false;
    Object.keys(stats).forEach(function (k) { hasStats = true; bots += stats[k].installs || 0; });
    if (!groups.length) {
      t.hidden = true;
    } else {
      t.hidden = false; t.appendChild(tile(live, 'Live')); t.appendChild(tile(review, 'In review'));
      if (hasStats) t.appendChild(tile(bots, bots === 1 ? 'Bot' : 'Bots')); else t.appendChild(tile(groups.length, groups.length === 1 ? 'Plugin' : 'Plugins'));
    }
    // things that need you: a reviewer asked for changes
    var nb = document.getElementById('needs'); nb.textContent = '';
    if (!groups.length) {
      var em = el('div', 'empty'); em.appendChild(ico('puzzle')); em.appendChild(el('b', null, 'No plugins yet')); em.appendChild(el('p', 'dmuted', 'Send your first one. It shows here with its status.')); nb.appendChild(em);
    }
    groups.filter(function (g) { return g.s.status === 'changes'; }).slice(0, 3).forEach(function (g) {
      var c = el('button', 'need'); c.type = 'button'; c.setAttribute('data-go', 'plugins');
      var x = el('span', 'tx'); x.appendChild(el('b', null, g.s.name)); x.appendChild(el('small', null, 'Changes requested')); c.appendChild(x); var o = el('span', 'open', 'Open'); o.appendChild(ico('arrow')); c.appendChild(o); nb.appendChild(c);
    });
    var ev = [];
    (j.submissions || []).forEach(function (s) {
      ev.push({ at: s.createdAt, t: 'Sent ' + s.name + ' v' + s.version });
      (s.replies || []).forEach(function (r) { ev.push({ at: r.at, t: 'You wrote about ' + s.name }); });
      if (s.status !== 'pending' && STATUS[s.status]) ev.push({ at: s.updatedAt || s.createdAt, t: s.name + ': ' + STATUS[s.status][0] });
    });
    ev.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    var fd = document.getElementById('ov-feed'); fd.textContent = '';
    if (!ev.length) fd.appendChild(el('li', 'dmuted', 'Nothing yet.'));
    ev.slice(0, 5).forEach(function (x) { var li = el('li'); li.appendChild(el('span', 'fdot')); li.appendChild(el('span', null, x.t)); li.appendChild(el('time', 'dmuted', ago(x.at))); fd.appendChild(li); });
  }

  // ----- Plugins -----
  function drawFilters() {
    var box = document.getElementById('dfilters'); box.textContent = '';
    FILTERS.forEach(function (f) {
      var n = groups.filter(function (g) { return f[0] === 'all' || g.kind === f[0]; }).length;
      var b = el('button', 'chip' + (filter === f[0] ? ' on' : ''), f[1]); b.type = 'button'; b.setAttribute('aria-pressed', filter === f[0] ? 'true' : 'false');
      if (n) b.appendChild(el('i', null, String(n)));
      b.addEventListener('click', function () { filter = f[0]; drawFilters(); drawSubs(); }); box.appendChild(b);
    });
  }
  function action(label, cls, fn) { var b = el('button', 'btn sm ' + cls, label); b.type = 'button'; b.addEventListener('click', function () { fn(b); }); return b; }
  function drawSubs() {
    subs.textContent = '';
    var list = groups.filter(function (g) { return filter === 'all' || g.kind === filter; });
    if (!list.length) {
      var em = el('div', 'empty'); em.appendChild(ico('puzzle'));
      em.appendChild(el('b', null, groups.length ? 'Nothing here' : 'No plugins yet'));
      if (!groups.length) { var sb = el('button', 'btn p sm', 'Send your first plugin'); sb.type = 'button'; sb.setAttribute('data-go', 'send'); em.appendChild(sb); }
      subs.appendChild(em); return;
    }
    list.forEach(function (g) {
      var s = g.s, live = g.live, card = el('article', 'dsub ' + (s.status === 'changes' ? 'warn' : ''));
      var top = el('div', 'dsub-t'); top.appendChild(el('span', 'ic', (s.name || '?').charAt(0).toUpperCase()));
      var tx = el('div', 'tx'); tx.appendChild(el('b', null, s.name)); tx.appendChild(el('small', null, 'v' + s.version + ' · sent ' + ago(s.createdAt))); top.appendChild(tx);
      top.appendChild(el('span', 'dtag ' + g.st[1], g.st[0])); card.appendChild(top);
      var ps = live && stats[s.pluginId], ins = live && insights[s.pluginId], bits = [];
      if (live && live !== s) bits.push('Live now: v' + live.version);
      if (ps) bits.push(ps.installs + (ps.installs === 1 ? ' bot' : ' bots'));
      if (ins && ins.rating) bits.push('★ ' + ins.rating.avg.toFixed(1) + ' (' + ins.rating.count + ')');
      if (bits.length) card.appendChild(el('p', 'dmuted', bits.join(' · ')));
      if (s.status === 'rejected' && s.note) card.appendChild(el('p', 'dreason', 'Reason: ' + s.note));
      if (s.status === 'changes' && s.note) card.appendChild(el('p', 'dreason', 'Please change: ' + s.note + ' Then make a new tag (or move the tag) and send it again.'));
      (s.replies || []).forEach(function (r) { card.appendChild(el('p', 'dmuted', 'You wrote (' + ago(r.at) + '): ' + r.text)); });
      var acts = el('div', 'dacts'), tout = el('p', 'dmuted dcode', '');
      var canReply = s.status === 'pending' || s.status === 'changes' || s.status === 'rejected';
      if (g.waiting) acts.appendChild(action('Test code', 'ghost', function (b) {
        b.disabled = true; post('/api/dev/testcode', { id: s.id }).then(function (x) {
          b.disabled = false;
          if (x.ok) tout.textContent = 'Code: ' + x.j.code + ' (works once, for one hour). On YOUR bot, as owner, send: .plugin test ' + x.j.code; else tout.textContent = (x.j && x.j.error) || 'Could not make a code.';
        }, function () { b.disabled = false; tout.textContent = 'The site could not be reached.'; });
      }));
      var box = el('div', 'dreply'); box.hidden = true;
      if (canReply) {
        var rt = el('textarea', 'dreplybox'); rt.maxLength = 500; rt.rows = 3; rt.placeholder = 'Write to the reviewer'; rt.setAttribute('aria-label', 'Message to the reviewer');
        var rb = el('button', 'btn sm ghost', 'Send'); rb.type = 'button';
        rb.addEventListener('click', function () { rb.disabled = true; post('/api/dev/reply', { id: s.id, text: rt.value }).then(function (x) { if (x.ok) load(); else { rb.disabled = false; rb.textContent = (x.j && x.j.error) || 'Could not send'; } }); });
        box.appendChild(rt); box.appendChild(rb);
        acts.appendChild(action('Message', 'ghost', function () { box.hidden = !box.hidden; if (!box.hidden) rt.focus(); }));
      }
      if (s.status === 'pending' || s.status === 'approved') acts.appendChild(action('Withdraw', 'danger', function (b) {
        b.disabled = true; post('/api/dev/withdraw', { id: s.id }).then(function (x) { if (x.ok) load(); else { b.disabled = false; b.textContent = (x.j && x.j.error) || 'Could not withdraw'; } });
      }));
      if (live) { var lk = el('a', 'btn sm quiet', 'In store'); lk.href = '/new/plugins#' + encodeURIComponent(s.pluginId); acts.appendChild(lk); }
      if (acts.childNodes.length) card.appendChild(acts);
      card.appendChild(tout); card.appendChild(box);
      if (g.older.length) {
        var det = el('details', 'dolder'); det.appendChild(el('summary', null, 'Earlier versions (' + g.older.length + ')'));
        g.older.forEach(function (o) { var ost = STATUS[o.status] || [o.status, '']; det.appendChild(el('p', 'dmuted', 'v' + o.version + ' · ' + ost[0] + ' · ' + ago(o.createdAt) + (o.status === 'rejected' && o.note ? ' · ' + o.note : ''))); });
        card.appendChild(det);
      }
      subs.appendChild(card);
    });
  }

  // ----- Stats -----
  function drawStats() {
    var box = document.getElementById('an-body'); box.textContent = ''; var shown = 0;
    groups.filter(function (g) { return g.live; }).forEach(function (g) {
      var pid = g.pid, ps = stats[pid], ins = insights[pid]; if (!ps && !ins) return; shown++;
      var p = el('section', 'panel pad'); p.appendChild(el('h2', null, g.s.name));
      var tl = el('div', 'tiles in');
      if (ps) { tl.appendChild(tile(ps.installs, ps.installs === 1 ? 'Bot' : 'Bots')); tl.appendChild(tile(ps.enabled, 'Switched on')); tl.appendChild(tile(ps.errors, 'Failures')); }
      if (ins && ins.rating) tl.appendChild(tile(ins.rating.avg.toFixed(1), ins.rating.count + (ins.rating.count === 1 ? ' rating' : ' ratings')));
      if (ins && ins.reports) tl.appendChild(tile(ins.reports, ins.reports === 1 ? 'Report' : 'Reports'));
      p.appendChild(tl);
      if (ps && Object.keys(ps.versions).length) {
        p.appendChild(el('h3', null, 'Versions in use'));
        var mx = Math.max.apply(null, Object.keys(ps.versions).map(function (k) { return ps.versions[k]; }));
        Object.keys(ps.versions).sort().forEach(function (v) { var r = el('div', 'bar'); r.appendChild(el('span', null, v)); var tr = el('span', 'btrack'), fi = el('i'); fi.style.width = Math.max(4, Math.round(ps.versions[v] / mx * 100)) + '%'; tr.appendChild(fi); r.appendChild(tr); r.appendChild(el('b', null, String(ps.versions[v]))); p.appendChild(r); });
      }
      if (ins && ins.reports) p.appendChild(el('p', 'dmuted', 'The reviewer looks at reports. You are not told who sent them.'));
      if (ins && ins.reviews && ins.reviews.length) { p.appendChild(el('h3', null, 'Reviews')); ins.reviews.forEach(function (r) { p.appendChild(el('p', 'dreason', '★'.repeat(r.stars) + ' ' + r.login + ': ' + r.text)); }); }
      box.appendChild(p);
    });
    if (!shown) { var em = el('div', 'empty'); em.appendChild(ico('chart')); em.appendChild(el('b', null, 'No numbers yet')); em.appendChild(el('p', 'dmuted', 'They appear once a plugin is live and bots use it.')); box.appendChild(em); }
  }

  // ----- Account: automatic sending (GitHub webhook) -----
  function drawHooks(list) {
    var box = document.getElementById('dhooklist'); if (!box) return; box.textContent = '';
    if (!list.length) { box.appendChild(el('p', 'dmuted', 'No repositories yet.')); return; }
    list.forEach(function (h) {
      var c = el('div', 'dhook'); var tx = el('div', 'tx'); tx.appendChild(el('b', null, h.repo.replace('https://github.com/', '') + (h.folder ? ' / ' + h.folder : '')));
      tx.appendChild(el('small', null, h.last ? 'Last: ' + h.last.tag + ' - ' + h.last.text + ' (' + ago(h.last.at) + ')' : 'Nothing received yet.')); c.appendChild(tx);
      var rb = el('button', 'btn sm ghost', 'Remove'); rb.type = 'button';
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
      post('/api/dev/hooks', { action: 'add', repo: document.getElementById('dhrepo').value, folder: document.getElementById('dhfolder').value }).then(function (x) { if (x.ok) { document.getElementById('dhrepo').value = ''; document.getElementById('dhfolder').value = ''; drawHooks(x.j.hooks || []); } else hsay((x.j && x.j.error) || 'Could not add that.'); });
    });
  }

  // ----- signed out / signed in -----
  function signedOut(j) {
    pub.hidden = false; dash.hidden = true; tabs.hidden = true; document.body.classList.remove('indash'); stateBox.textContent = '';
    if (!j || !j.configured) { stateBox.appendChild(el('h2', null, 'Not open yet')); stateBox.appendChild(el('p', 'dmuted', 'The Developer Centre is not open yet. Please check back soon.')); return; }
    stateBox.appendChild(el('h2', null, 'Sign in'));
    stateBox.appendChild(el('p', null, 'Use your GitHub account. We only read your public username. Nothing else is requested.'));
    var a = el('a', 'btn p', 'Sign in with GitHub'); a.href = '/auth/github'; a.insertBefore(ico('gh'), a.firstChild); stateBox.appendChild(a);
    stateBox.appendChild(el('p', 'fine', 'No email address, no access to your repositories.'));
  }
  function signedIn(j) {
    pub.hidden = true; dash.hidden = false; tabs.hidden = false; document.body.classList.add('indash'); data = j; stats = j.stats || {}; insights = j.insights || {};
    groups = makeGroups(j.submissions || []);
    if (hookBox) { hookBox.hidden = false; drawHooks(j.hooks || []); }
    drawHome(j); drawFilters(); drawSubs(); drawStats();
    var ac = document.getElementById('acct'); ac.textContent = ''; var v = el('span', 'vbadge' + (j.user.verified ? ' ok' : '')); v.appendChild(ico(j.user.verified ? 'check' : 'user')); v.appendChild(el('b', null, j.user.login + ' · ' + (j.user.verified ? 'Verified developer' : 'Developer'))); ac.appendChild(v);
    show(location.hash.slice(1));
  }
  function load() {
    return fetch('/api/dev/me', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.configured || !j.user) return signedOut(j);
      signedIn(j);
    }).catch(function () { pub.hidden = false; dash.hidden = true; tabs.hidden = true; stateBox.textContent = ''; stateBox.appendChild(el('p', 'dmuted', 'The Developer Centre cannot be loaded right now. Please try again in a moment.')); });
  }
  document.getElementById('dout').addEventListener('click', function () { post('/api/dev/logout').then(function () { try { history.replaceState(null, '', '/new/developers'); } catch (x) { /* fine */ } load(); }); });
  form.addEventListener('submit', function (ev) {
    ev.preventDefault(); say('');
    var body = { repo: document.getElementById('drepo').value, tag: document.getElementById('dtag').value, folder: document.getElementById('dfolder').value };
    if (!body.repo.trim() || !body.tag.trim()) return say('Fill in the repository address and the release tag.');
    var label = go.querySelector('span'); go.disabled = true; label.textContent = 'Checking…';
    post('/api/dev/submit', body).then(function (x) {
      go.disabled = false; label.textContent = 'Send for review';
      if (!x.ok) return say((x.j && x.j.error) || 'Something went wrong.', x.j && x.j.problems);
      form.reset(); load().then(function () { show('plugins', true); });
    }, function () { go.disabled = false; label.textContent = 'Send for review'; say('The site could not be reached. Please try again.'); });
  });
  load();
})();
