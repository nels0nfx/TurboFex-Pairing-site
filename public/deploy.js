/* Deploy Centre page. The session ID is only ever held in this script's memory: it is not put in the address, the page text, storage or analytics.
   What each row of the tracker means:
   - "WhatsApp paired" and "Login collected" come from the server (the pairing job and the one-time ID being used). Only those are "Confirmed by TurboFex".
   - "WhatsApp connected" and "Host running" cannot be seen by TurboFex. They are checks the person does in their own bot log / WhatsApp, and are shown as "You confirmed". */
(function () {
  'use strict';
  var D = window.TFXDeploy, JOBKEY = 'tfx-job', app = document.getElementById('app');
  var sid = '', jobId = '', phase = 'loading', secs = 0, pollT = 0, tickT = 0, lastSync = 0, retrievedAt = '';
  var picked = '', steps = {}, attest = { wa: false, host: false }, sent = {}, errMsg = '';

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else if (k === 'class') n.className = attrs[k]; else n.setAttribute(k, attrs[k]); });
    [].concat(kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function icon(id) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); var u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + id); s.appendChild(u); return s; }
  function toast(msg) { var t = document.getElementById('dp-toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2200); }

  // ---------- copy ----------
  function copyText(text, btn, label) {
    function done(ok) {
      if (!btn) return;
      var old = label || 'Copy';
      btn.classList.toggle('ok', ok); btn.lastChild.textContent = ok ? 'Copied' : 'Copy failed';
      toast(ok ? 'Copied to clipboard' : 'Could not copy. Select the text and copy it by hand.');
      setTimeout(function () { btn.classList.remove('ok'); btn.lastChild.textContent = old; }, 1600);
    }
    function legacy() {
      try { var ta = el('textarea', { 'aria-hidden': 'true' }); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); done(ok); } catch (e) { done(false); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, legacy); else legacy();
  }
  function copyBtn(getText, needsId, label) {
    var b = el('button', { type: 'button', class: 'dp-cp' }, [icon('i-copy'), document.createTextNode(label || 'Copy')]);
    function sync() { var blocked = needsId && !sid; b.disabled = blocked; b.title = blocked ? 'Needs a fresh session ID: pair again' : ''; if (blocked) b.lastChild.textContent = 'ID needed'; else if (b.lastChild.textContent === 'ID needed') b.lastChild.textContent = label || 'Copy'; }
    b._sync = sync; sync();
    b.addEventListener('click', function () { if (needsId && !sid) return; copyText(getText(), b, label || 'Copy'); });
    return b;
  }

  // ---------- session state (server is the judge) ----------
  function readJob() { try { var j = JSON.parse(sessionStorage.getItem(JOBKEY) || 'null'); return j && typeof j.job === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(j.job) ? j.job : ''; } catch (e) { return ''; } }
  function sync() {
    jobId = readJob();
    if (!jobId) { setPhase('none'); return Promise.resolve(); }
    return fetch('/api/job/' + encodeURIComponent(jobId), { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return { gone: true };
      if (!r.ok) throw new Error('status ' + r.status);
      return r.json();
    }).then(function (j) {
      errMsg = ''; lastSync = Date.now();
      if (j.gone) { sid = ''; return setPhase('none'); }
      if (j.state !== 'linked') { sid = ''; return setPhase(j.state === 'failed' ? 'none' : 'pending'); }
      if (j.used) { sid = ''; if (phase !== 'retrieved') retrievedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); return setPhase('retrieved'); }
      if (j.expired || !j.sessionId || j.idSecondsLeft <= 0) { sid = ''; return setPhase('expired'); }
      sid = String(j.sessionId); secs = j.idSecondsLeft; setPhase('ready');
    }).catch(function () { errMsg = 'Could not reach TurboFex. Check your connection; this page will try again.'; render(); });
  }
  function setPhase(p) { var changed = p !== phase; phase = p; if (changed) render(); schedule(); }
  function schedule() {
    clearTimeout(pollT); clearInterval(tickT);
    if (phase === 'ready') { pollT = setTimeout(sync, 4000); tickT = setInterval(tick, 1000); }
    else if (phase === 'loading' || errMsg) pollT = setTimeout(sync, 6000);
  }
  function tick() {
    secs = Math.max(0, secs - 1);
    var t = document.getElementById('dp-secs'), r = document.getElementById('dp-ringfg'), ring = document.getElementById('dp-ring');
    if (t) t.textContent = Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2);
    if (r) r.setAttribute('stroke-dashoffset', String(176 * (1 - secs / 300)));
    if (ring) ring.classList.toggle('low', secs <= 60);
    if (secs === 0) { clearInterval(tickT); sync(); }
  }

  // ---------- views ----------
  function card(kids) { return el('div', { class: 'dp-card' }, kids); }
  function gate() {
    var pending = phase === 'pending';
    return card([
      el('h2', { text: pending ? 'Pairing is not finished yet' : 'Pair your WhatsApp first' }),
      el('p', { text: pending ? 'The Deploy Centre opens when WhatsApp confirms the link. Go back and finish pairing.' : 'The Deploy Centre opens after a successful pairing in this browser tab. A session ID is one-time and expires after 5 minutes, so there is nothing to deploy yet.' }),
      el('div', { class: 'dp-row' }, [el('a', { class: 'dp-btn p', href: '/pair', text: pending ? 'Continue pairing' : 'Pair WhatsApp' }), el('a', { class: 'dp-btn', href: '/install', text: 'Prepare my host first' })]),
      errMsg ? el('p', { text: errMsg }) : null
    ]);
  }
  function row(cls, mark, title, sub, badge, badgeCls, extra) {
    return el('li', {}, [el('span', { class: 'dp-dot ' + cls, text: mark }), el('div', { class: 'tx' }, [el('b', { text: title }), el('small', { text: sub }), badge ? el('span', { class: 'dp-badge ' + badgeCls, text: badge }) : null, extra])]);
  }
  function attestBtn(key, label) {
    var b = el('button', { type: 'button', class: 'dp-btn', style: 'min-height:38px;margin-top:8px;font-size:13px' }, [attest[key] ? 'Undo' : label]);
    b.addEventListener('click', function () { attest[key] = !attest[key]; render(); });
    return b;
  }
  function tracker() {
    var ready = phase === 'ready', got = phase === 'retrieved', exp = phase === 'expired';
    var head = el('div', { class: 'dp-head' }, [el('div', { class: 'tx' }, [el('h2', { text: ready ? 'Your session is ready' : got ? 'Your bot collected its login' : 'Your session ID has expired' }),
      el('p', { text: ready ? 'Deploy within the countdown. The ID works once.' : got ? 'The ID was used. It cannot be used again.' : 'It was not used. Pair again to get a new one.' })])]);
    if (ready) {
      var ring = el('div', { class: 'dp-ring' + (secs <= 60 ? ' low' : ''), id: 'dp-ring' }, [
        (function () { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('aria-hidden', 'true');
          [['bg', null], ['fg', 'dp-ringfg']].forEach(function (c) { var k = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); k.setAttribute('cx', 32); k.setAttribute('cy', 32); k.setAttribute('r', 28); k.setAttribute('class', c[0]); if (c[1]) { k.id = c[1]; k.setAttribute('stroke-dasharray', 176); k.setAttribute('stroke-dashoffset', String(176 * (1 - secs / 300))); } s.appendChild(k); }); return s; })(),
        el('span', { id: 'dp-secs', text: Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2) })]);
      head.appendChild(ring);
    }
    var list = el('ul', { class: 'dp-track' }, [
      row('ok', '✓', 'WhatsApp paired', 'WhatsApp confirmed the link and the login was saved.', 'Confirmed by TurboFex', 'ok'),
      ready ? row('wait', '2', 'Login collected by your bot', 'Waiting for your bot to start and ask for it.', 'Waiting', '') :
        got ? row('ok', '✓', 'Login collected by your bot', 'Your bot downloaded the login' + (retrievedAt ? ' (noticed at ' + retrievedAt + ')' : '') + '. This is not yet proof that WhatsApp connected.', 'Confirmed by TurboFex', 'ok') :
        row('bad', '!', 'Login collected by your bot', 'The ID expired before any bot used it.', 'Expired unused', 'bad'),
      row(attest.wa ? 'you' : '', attest.wa ? '✓' : '3', 'WhatsApp connected', 'TurboFex cannot see this. Look for “is online as” in your bot log, or send .ping to the bot.', attest.wa ? 'You confirmed' : 'Not visible to TurboFex', attest.wa ? 'you' : '', attestBtn('wa', 'I can see it online')),
      row(attest.host ? 'you' : '', attest.host ? '✓' : '4', 'Bot stays running on your host', 'Check it is still up after a restart or after a few minutes.', attest.host ? 'You confirmed' : 'Not visible to TurboFex', attest.host ? 'you' : '', attestBtn('host', 'It is still running'))
    ]);
    var kids = [head, list];
    if (!ready) kids.push(el('div', { class: 'dp-row' }, [el('a', { class: 'dp-btn p', href: '/pair', text: 'Pair again for a new ID' })]));
    if (ready) { var cb = copyBtn(function () { return sid; }, true, 'Copy session ID'); kids.push(el('div', { class: 'dp-row' }, [el('div', { class: 'dp-term', style: 'flex:1 1 100%;margin:0' }, [el('div', { class: 'bar' }, [el('span', { text: 'Session ID (hidden on screen)' }), cb]), el('pre', {}, [el('span', { text: D.MASK })])])])); }
    return card(kids);
  }
  function picker() {
    var grid = el('div', { class: 'dp-grid', role: 'group', 'aria-label': 'Where will your bot run?' });
    D.platforms.forEach(function (p) {
      var b = el('button', { type: 'button', class: 'dp-plat', 'aria-pressed': picked === p.id ? 'true' : 'false', 'data-p': p.id }, [el('span', { class: 'ic' }, [icon(p.icon)]), el('span', {}, [el('b', { text: p.name }), el('small', { text: p.tag })])]);
      b.addEventListener('click', function () { choose(p.id); });
      grid.appendChild(b);
    });
    return card([el('h2', { text: 'Where will your bot run?' }), el('p', { text: 'Pick a place. You get the requirements, commands and checks for it.' }), grid]);
  }
  function choose(id) {
    picked = id; if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    // count the choice only when the server can see a real linked pairing; the page never sends the session ID
    if (!sent[id] && jobId && (phase === 'ready' || phase === 'retrieved')) { sent[id] = 1; try { fetch('/api/deploy/choose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ job: jobId, platform: id }) }).catch(function () {}); } catch (e) { /* ignore */ } }
    render(); var g = document.getElementById('dp-guide'); if (g && g.scrollIntoView) g.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function term(c) {
    var text = function () { return D.fill(c.lines.join('\n'), sid); };
    var needs = c.lines.some(D.usesSession);
    var cb = copyBtn(text, needs, 'Copy');
    var pre = el('pre', {}, c.lines.map(function (l) { return el('span', { text: D.fill(l, '') + '\n' }); }));
    return el('div', { class: 'dp-term' }, [el('div', { class: 'bar' }, [el('i'), el('i'), el('i'), el('span', { text: c.label }), cb]), pre]);
  }
  function envBox(list) {
    var box = el('div', { class: 'dp-env' });
    list.forEach(function (e) {
      var val = e.session ? D.MASK : e.v, needs = !!e.session;
      var cb = copyBtn(function () { return e.session ? sid : e.v; }, needs, 'Copy');
      box.appendChild(el('div', {}, [el('span', { class: 'k', text: e.k }), el('span', { class: 'v' }, [val, e.optional ? el('em', { text: '  optional' }) : null]), cb]));
    });
    return box;
  }
  function guide() {
    var p = D.byId[picked]; if (!p) return null;
    var total = p.steps.length, done = p.steps.filter(function (s, i) { return steps[p.id + i]; }).length;
    var kids = [el('h2', { text: p.name + ' · ' + p.tag }), el('p', { text: p.blurb })];
    if (p.warn) kids.push(el('div', { class: 'dp-warn' }, [icon('i-alert'), el('span', { text: p.warn })]));
    kids.push(el('div', { class: 'dp-sec' }, [el('h3', { text: 'Requirements' }), el('ul', { class: 'dp-need' }, p.needs.map(function (n) { return el('li', { text: n }); }))]));
    kids.push(el('div', { class: 'dp-row' }, p.files.map(function (f) { return el('a', { class: 'dp-btn p', href: f.href, target: '_blank', rel: 'noopener noreferrer', title: f.note }, [icon('i-arrow'), document.createTextNode('Get the ' + f.label)]); })));
    kids.push(el('p', { class: 'dp-note', text: p.files[0].note }));
    var prog = el('div', { class: 'dp-prog', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done }, [el('i', { style: 'width:' + Math.round(done / total * 100) + '%' })]);
    kids.push(el('div', { class: 'dp-sec' }, [el('h3', { text: 'Checklist · ' + done + ' of ' + total }), prog]));
    p.steps.forEach(function (s, i) {
      var key = p.id + i, chk = el('button', { type: 'button', class: 'dp-chk', 'aria-pressed': steps[key] ? 'true' : 'false', 'aria-label': 'Mark step ' + (i + 1) + ' done' }, [icon('i-check')]);
      chk.addEventListener('click', function () { steps[key] = !steps[key]; render(true); });
      var body = [el('b', { text: (i + 1) + '. ' + s.t })];
      if (s.d) body.push(el('p', { text: s.d }));
      if (s.link) body.push(el('div', { class: 'dp-row' }, [el('a', { class: 'dp-btn', href: s.link.href, target: '_blank', rel: 'noopener noreferrer' }, [icon('i-arrow'), document.createTextNode('Open Releases')])]));
      (s.cmds || []).forEach(function (c) { body.push(term(c)); });
      if (s.env) body.push(envBox(s.env));
      if (s.n) body.push(el('p', { class: 'dp-note', text: s.n }));
      kids.push(el('div', { class: 'dp-step' + (steps[key] ? ' done' : '') }, [chk, el('div', { class: 'tx' }, body)]));
    });
    kids.push(el('div', { class: 'dp-sec' }, [el('h3', { text: 'Check that it really started' }), el('ul', { class: 'dp-need' }, p.verify.map(function (v) { return el('li', { text: v }); })),
      el('p', { class: 'dp-note', text: 'TurboFex can confirm that your bot collected its login. It cannot see whether WhatsApp connected, so tick the tracker rows yourself once you have seen it.' })]));
    kids.push(el('div', { class: 'dp-sec' }, [el('h3', { text: 'Troubleshooting' })].concat(p.trouble.map(function (t) { return el('details', { class: 'dp-acc' }, [el('summary', { text: t.q }), el('div', { text: t.a })]); }))));
    kids.push(el('p', { class: 'dp-note' }, ['More detail: ', el('a', { href: D.GUIDES, target: '_blank', rel: 'noopener noreferrer', text: 'the hosting guides in the TurboFex README' }), ' · ', el('a', { href: '/install', text: 'Install page' })]));
    var c = card(kids); c.id = 'dp-guide'; return c;
  }
  function render() {
    var keepY = window.scrollY;
    while (app.firstChild) app.removeChild(app.firstChild);
    if (phase === 'loading') { app.appendChild(card([el('span', { class: 'dp-spin' }), document.createTextNode(' Checking your pairing…')])); return; }
    if (phase === 'none' || phase === 'pending') { app.appendChild(gate()); return; }
    if (errMsg) app.appendChild(card([el('p', { text: errMsg })]));
    app.appendChild(tracker()); app.appendChild(picker());
    var g = guide(); if (g) app.appendChild(g);
    if (arguments[0]) window.scrollTo(0, keepY);
  }
  window.addEventListener('hashchange', function () { var id = location.hash.slice(1); if (D.byId[id] && id !== picked && phase !== 'loading' && phase !== 'none' && phase !== 'pending') { picked = id; render(); } });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && (phase === 'ready' || phase === 'loading')) sync(); });
  window.addEventListener('pagehide', function () { sid = ''; });
  if (D.byId[location.hash.slice(1)]) picked = location.hash.slice(1);
  render(); sync();
})();
