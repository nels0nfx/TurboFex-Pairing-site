/* Deploy page. Built from the site's own components (tabs, step panels, code blocks, hints). Pick a host; on every host that runs on index.js
   the session ID comes FIRST (auto-filled when the person just paired, otherwise a box that verifies it) and the page then makes exactly the
   file or commands that host needs. The session ID:
   - is held only in this script's memory (never in the address, storage, a request to a host, analytics or a log);
   - is checked with POST /api/deploy/check (valid + seconds left); making or downloading a file does not use it up, only the bot starting does;
   - is wiped on Clear, on expiry, once the bot has collected it, and when the page is closed. */
(function () {
  'use strict';
  var D = window.TFXDeploy, JOBKEY = 'tfx-job', KEY = 'tfx-deploy', app = document.getElementById('app');
  var ORDER = ['termux', 'vps', 'docker', 'panel', 'render', 'koyeb', 'webhost', 'desktop'];
  var S = { p: 'termux', installed: false };
  var sid = '', src = '', expAt = 0, total = 300, collected = '', expired = false, pairing = null, info = null, msg = '', msgBad = false, busy = false, fileMsg = '', fileBad = false;
  var tickT = 0, syncT = 0, reported = {};
  var EXPIRED_MSG = 'Your session ID expired and was wiped from this page. Pair again for a new one.';

  // ---------- tiny helpers ----------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else if (k === 'class') n.className = attrs[k]; else n.setAttribute(k, attrs[k]); });
    [].concat(kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function icon(id) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); var u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + id); s.appendChild(u); return s; }
  function toast(m) { var t = document.getElementById('dp-toast'); if (!t) return; t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2200); }
  function origin() { return location.origin || (location.protocol + '//' + location.host); }
  function mmss(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function secsLeft() { return Math.max(0, Math.round((expAt - Date.now()) / 1000)); }
  function mask(text) { return sid ? String(text).split(sid).join(D.MASK) : String(text); }
  function pairLeft() { return pairing ? Math.max(0, Math.round(pairing.secs - (Date.now() - pairing.at) / 1000)) : 0; }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ p: S.p, installed: S.installed })); } catch (e) { /* storage may be off */ } }   // the host only: never the session ID
  function restore() { try { var j = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (j && D.byId[j.p]) { S.p = j.p; S.installed = !!j.installed; } } catch (e) { /* none */ } }
  function report(id) { if (reported[id]) return; reported[id] = 1; try { fetch('/api/deploy/choose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform: id }) }).catch(function () {}); } catch (e) { /* ignore */ } }

  // ---------- copy / download ----------
  function copyText(text, btn, label) {
    function done(ok) { if (!btn) return; btn.classList.toggle('ok', ok); btn.lastChild.textContent = ok ? 'Copied' : 'Copy failed'; toast(ok ? 'Copied to clipboard' : 'Could not copy. Select the text and copy it by hand.'); setTimeout(function () { btn.classList.remove('ok'); btn.lastChild.textContent = label; }, 1600); }
    function legacy() { try { var ta = el('textarea', { 'aria-hidden': 'true' }); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); done(ok); } catch (e) { done(false); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, legacy); else legacy();
  }
  function copyBtn(getText, label) { var l = label || 'Copy', b = el('button', { type: 'button', class: 'cb' }, [icon('i-copy'), el('span', { text: l })]); b.addEventListener('click', function () { copyText(getText(), b, l); }); return b; }
  function download(file) {
    try { var blob = new Blob([file.data || file.text], { type: file.mime }), url = URL.createObjectURL(blob), a = el('a', { href: url, download: file.name }); document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1500); toast('Downloaded ' + file.name); }
    catch (e) { toast('Download failed. Use Copy instead.'); }
  }
  function code(c) {   // the Install page's code block, with the session ID hidden on screen (Copy still has it)
    var pre = el('pre', {}, c.lines.map(function (l) { return el('span', { class: 'ln', text: mask(l) + '\n' }); }));
    return el('div', { class: 'code' }, [el('div', { class: 'bar2' }, [el('span', { text: c.label }), copyBtn(function () { return c.lines.join('\n'); })]), pre, c.note ? el('p', { class: 'cap', text: c.note }) : null]);
  }
  function varRows(rows) {
    var pre = el('pre', { class: 'plain' }, rows.map(function (kv) { return el('span', { class: 'ln', text: kv[0] + '=' + mask(kv[1]) + '\n' }); }));
    return el('div', { class: 'code' }, [el('div', { class: 'bar2' }, [el('span', { text: 'Variables' }), copyBtn(function () { return rows.map(function (kv) { return kv[0] + '=' + kv[1]; }).join('\n'); }, 'Copy all')]), pre]);
  }
  function fileBox(f) {
    var b = el('button', { type: 'button', class: 'btn p' }, [icon('i-arrow'), document.createTextNode('Download ' + f.name)]); b.addEventListener('click', function () { download({ name: f.name, text: f.text, mime: 'text/plain;charset=utf-8' }); });
    return el('div', { class: 'btns' }, [b]);
  }

  // ---------- session ID (the server is the judge) ----------
  function setSid(id, from, secs) { sid = id; src = from; total = Math.max(secs, 1); expAt = Date.now() + secs * 1000; collected = ''; expired = false; msg = ''; fileMsg = ''; schedule(); }
  function clearSid(why) { sid = ''; src = ''; expAt = 0; clearTimeout(syncT); clearInterval(tickT); if (why === 'expired') expired = true; if (why === 'manual') { msg = ''; } }
  function schedule() { clearInterval(tickT); clearTimeout(syncT); if (!sid) return; tickT = setInterval(tick, 1000); syncT = setTimeout(resync, 20000); }
  function tick() {
    var left = secsLeft(), t = document.getElementById('dp-time');
    if (t) t.textContent = mmss(left);
    if (left <= 0) { clearSid('expired'); render(); }
  }
  function readJobId() { try { var j = JSON.parse(sessionStorage.getItem(JOBKEY) || 'null'); return j && typeof j.job === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(j.job) ? j.job : ''; } catch (e) { return ''; } }
  function lookJob() {   // the pairing page's own job record: linked + valid ID, or used, or nothing
    var id = readJobId(); if (!id) return Promise.resolve(null);
    return fetch('/api/job/' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function checkId(id) {
    return fetch('/api/deploy/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id }) }).then(function (r) { if (r.status === 429) return { limited: true }; return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function resync() {   // still alive, or did the bot already collect it?
    if (!sid) return;
    var p = src === 'pairing' ? lookJob().then(function (j) { if (!j) return; if (j.used) return gone('confirmed'); if (j.state === 'linked' && j.sessionId && j.idSecondsLeft > 0) expAt = Date.now() + j.idSecondsLeft * 1000; }) :
      checkId(sid).then(function (r) { if (r && r.valid === false && secsLeft() > 5) gone('likely'); else if (r && r.valid) expAt = Date.now() + r.secondsLeft * 1000; });
    p.then(function () { if (sid) syncT = setTimeout(resync, 20000); });
  }
  function gone(kind) { collected = kind; clearSid(); render(); }   // no use any more: wipe it
  function usePasted() {
    var inp = document.getElementById('dp-id'), norm = D.normalizeId(inp && inp.value);
    if (!norm) { msg = 'That does not look like a session ID. It is TFX- followed by 12 letters and numbers.'; msgBad = true; return render(); }
    busy = true; msg = 'Checking…'; msgBad = false; render();
    checkId(norm).then(function (r) {
      busy = false;
      if (!r) { setSid(norm, 'pasted', 300); msg = 'Could not check it just now. Treat the countdown as a guess and move fast.'; msgBad = true; }   // never claim a validity we could not confirm
      else if (r.limited) { msg = 'Too many checks. Wait a minute and try again.'; msgBad = true; }
      else if (!r.valid) { msg = 'This ID is not valid any more: it expired, was already used by a bot, or did not come from this site. Pair again to get a new one.'; msgBad = true; }
      else setSid(norm, 'pasted', r.secondsLeft);
      render();
    });
  }
  function usePairing() { if (!pairing) return; var left = pairLeft(); if (left <= 0) { pairing = null; return render(); } setSid(pairing.id, 'pairing', left); pairing = null; render(); }
  function collectedNote() {
    return el('div', { class: 'hint warn', text: collected === 'confirmed' ? 'Your bot collected its login (TurboFex confirmed the ID was used). The ID is wiped from this page. That does not yet prove WhatsApp connected: check the log for "is online as".' : 'The ID stopped being valid before its time ran out, which usually means your bot collected it. TurboFex cannot tell this from other causes. The ID is wiped from this page. Check your bot log for "is online as".' });
  }

  // ---------- the launcher / Docker files are made HERE, in the browser ----------
  function fetchTemplate() { return fetch(D.LAUNCHER_PATH, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('The launcher could not be loaded (' + r.status + ').'); return r.text(); }); }
  function makeFile(kind) {
    fileMsg = ''; if (!sid) return;
    fetchTemplate().then(function (t) {
      if (kind === 'docker-zip') { download({ name: 'turbofex-docker.zip', data: window.TFXZip.build(D.dockerFiles(t, sid)), mime: 'application/zip' }); report('docker'); }
      else { download({ name: 'index.js', text: D.buildLauncher(t, sid), mime: 'text/javascript;charset=utf-8' }); report('launcher'); }
      fileBad = false; fileMsg = 'Downloaded.'; render();
    }).catch(function (e) { fileBad = true; fileMsg = (e && e.message) || 'Could not build the file.'; render(); });
  }

  // ---------- views ----------
  function stepsList(steps) {
    var ol = el('ol', { class: 'panel steps mt' });
    steps.forEach(function (s, i) {
      var tx = el('div', { class: 'tx' }, [el('b', { text: s.title }), s.text ? el('p', { text: s.text }) : null]);
      if (s.action === 'launcher-id' || s.action === 'docker-zip') { var b = el('button', { type: 'button', class: 'btn p' }, [icon('i-arrow'), document.createTextNode(s.action === 'docker-zip' ? 'Download turbofex-docker.zip' : 'Download index.js')]); b.addEventListener('click', function () { makeFile(s.action); }); tx.appendChild(el('div', { class: 'btns' }, [b])); if (fileMsg) tx.appendChild(el('p', { class: fileBad ? 'err' : 'hint', text: fileMsg })); }
      if (s.action === 'launcher-noid') { var a = el('a', { class: 'btn p', href: D.LAUNCHER_PATH, download: '' }, [icon('i-arrow'), document.createTextNode('Download index.js')]); a.addEventListener('click', function () { report('launcher-first'); }); tx.appendChild(el('div', { class: 'btns' }, [a])); }
      if (s.action === 'bot-zip') tx.appendChild(el('div', { class: 'btns' }, [el('a', { class: 'btn p', href: D.ZIP_PATH, download: '' }, [icon('i-arrow'), document.createTextNode('Download the bot files')])]));
      if (s.action === 'github') tx.appendChild(el('div', { class: 'btns' }, [el('a', { class: 'btn p', href: D.GITHUB_NEW, target: '_blank', rel: 'noopener noreferrer' }, [icon('i-arrow'), document.createTextNode('Open GitHub')])]));
      (s.cmds || []).forEach(function (c) { tx.appendChild(code(c)); });
      if (s.file) tx.appendChild(fileBox(s.file));
      if (s.vars) tx.appendChild(varRows(s.vars));
      if (s.action === 'id' && !sid) tx.appendChild(idBox(true));
      ol.appendChild(el('li', {}, [el('span', { class: 'num', text: String(i + 1) }), tx]));
    });
    return ol;
  }
  function idBox(inline) {
    var inp = el('input', { type: 'text', id: 'dp-id', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', autocorrect: 'off', placeholder: 'TFX-XXXX-XXXX-XXXX', 'aria-label': 'Session ID' });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') usePasted(); });
    var go = el('button', { type: 'button', class: 'btn p' }, [busy ? 'Checking…' : 'Verify']); go.disabled = busy; go.addEventListener('click', usePasted);
    var kids = [el('label', { for: 'dp-id', text: 'Session ID' }), el('div', { class: 'fld' }, [inp]), el('div', { class: 'btns' }, [go])];
    if (pairing) { var u = el('button', { type: 'button', class: 'btn' }, ['Use my session ID (' + mmss(pairLeft()) + ' left)']); u.addEventListener('click', usePairing); kids.push(el('div', { class: 'btns' }, [u])); }
    if (msg) kids.push(el('p', { class: msgBad ? 'err' : 'hint', text: msg }));
    kids.push(el('p', { class: 'hint' }, ['No session ID? ', el('a', { href: '/pair', text: 'Pair WhatsApp' }), '. It works once and lasts 5 minutes. It stays on this page only.']));
    return el('div', { class: inline ? 'dp-inner' : 'panel mt dp-inner' }, kids);
  }
  function idLine(h) {
    var left = secsLeft(), clr = el('button', { type: 'button', class: 'lnk', text: 'Clear' }); clr.addEventListener('click', function () { clearSid('manual'); render(); });
    var kids = [el('p', { class: 'hint ok' }, ['Session ID verified · ', el('b', { id: 'dp-time', text: mmss(left) }), ' left · ', clr])];
    if (msg) kids.push(el('p', { class: msgBad ? 'err' : 'hint', text: msg }));
    if (h.kind !== 'github') kids.push(left <= 90 ? el('p', { class: 'hint warn' }, [el('b', { text: 'Under 90 seconds left. ' }), 'Pair again if you are not ready.']) : el('p', { class: 'hint', text: 'Run the steps now. Your ID is used when the bot starts.' }));
    return el('div', {}, kids);
  }
  function plusIcon() { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('aria-hidden', 'true'); p.setAttribute('d', 'M12 5v14M5 12h14'); s.appendChild(p); return s; }
  function faq(h) {
    var plus = plusIcon;
    var rows = [el('details', {}, [el('summary', {}, ['How to tell it worked', plus()]), el('div', { class: 'dp-ans' }, [el('ul', { class: 'dp-list' }, h.verify.map(function (t) { return el('li', { text: t }); })), el('p', { class: 'hint', text: 'TurboFex sees when the ID is collected. Only you can confirm WhatsApp connected.' })])])];
    h.trouble.forEach(function (t) { rows.push(el('details', {}, [el('summary', {}, [t.q, plus()]), el('p', { text: t.a })])); });
    return el('div', { class: 'panel mt' }, rows);
  }
  function slowHost(h) {
    var first = D.plan(h.id, { origin: origin() }, '', { first: true }); if (!first || !first.steps) return null;
    return el('div', { class: 'panel mt' }, [el('details', {}, [el('summary', {}, ['My host is slow to install', plusIcon()]), el('div', { class: 'dp-ans' }, [el('p', { class: 'hint', text: 'An ID lasts 5 minutes. If installing takes longer, install without an ID first, then come back, choose "Already installed" and add it.' }), stepsList(first.steps)])])]);
  }
  function view() {
    var h = D.byId[S.p], v = el('div', {});
    var tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Where to run it' });
    ORDER.forEach(function (id) { var b = el('button', { type: 'button', role: 'tab', 'data-p': id, 'aria-selected': id === S.p ? 'true' : 'false', text: D.byId[id].name }); b.addEventListener('click', function () { if (S.p !== id) { S.p = id; S.installed = false; fileMsg = ''; save(); report(id); render(); } }); tabs.appendChild(b); });
    v.appendChild(tabs);
    v.appendChild(el('p', { class: 'sub', text: h.blurb }));
    if (h.warn) v.appendChild(el('div', { class: 'warnbox mt' }, [icon('i-alert'), el('div', {}, [el('b', { text: 'Use a paid plan' }), el('p', { text: h.warn })])]));
    if (expired) v.appendChild(el('div', { class: 'hint warn', text: EXPIRED_MSG }));
    if (collected) { v.appendChild(collectedNote()); var again = el('button', { type: 'button', class: 'lnk', text: 'Deploy again with a new session ID' }); again.addEventListener('click', function () { collected = ''; expired = false; render(); }); v.appendChild(el('p', { class: 'hint' }, [again])); }
    if (h.kind === 'github') {
      v.appendChild(stepsList(D.plan(h.id, { origin: origin() }, sid || '', {}).steps)); if (sid) v.appendChild(idLine(h));
    } else if (!sid) {
      v.appendChild(idBox(false));
    } else {
      v.appendChild(idLine(h));
      v.appendChild(stepsList(D.plan(h.id, { origin: origin() }, sid, { installed: S.installed }).steps));
      if (h.kind === 'file') {   // only when it changes what they get
        var tog = el('button', { type: 'button', class: 'lnk', text: S.installed ? 'Not installed yet? Install with this ID.' : 'Already installed? Add the ID only.' }); tog.addEventListener('click', function () { S.installed = !S.installed; save(); render(); }); v.appendChild(el('p', { class: 'hint' }, [tog]));
      }
      if (h.kind === 'file' && !S.installed) { var sh = slowHost(h); if (sh) v.appendChild(sh); }
    }
    v.appendChild(faq(h));
    return v;
  }
  function render() {
    var keep = window.scrollY, focused = document.activeElement && document.activeElement.id === 'dp-id';
    while (app.firstChild) app.removeChild(app.firstChild);
    app.appendChild(el('h2', { text: 'Where will it run?' }));
    app.appendChild(view());
    if (window.scrollTo && keep) window.scrollTo(0, keep);
  }

  window.addEventListener('pagehide', function () { sid = ''; });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && sid) resync(); });
  restore(); render();
  lookJob().then(function (j) {
    if (!j) return;
    if (j.state === 'linked' && j.sessionId && j.idSecondsLeft > 0 && !j.used && !j.expired) pairing = { id: String(j.sessionId), secs: j.idSecondsLeft, at: Date.now() };
    // someone who just got their session ID: put it to use at once. No box to fill in.
    if (pairing && !sid && !collected) { usePairing(); return; }
    if (!sid) render();
  });
})();
