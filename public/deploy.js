/* Deploy Centre v2: a five step wizard (Where, Prepare, Session, Files, Start). Public: nothing needs a pairing to look around.
   Files and commands are generated HERE, in the browser, by deploy-data.js. The session ID:
   - is held only in this script's memory (never in the address, storage, a request to a host, analytics or a log);
   - is asked for only at the Session step, and generating or downloading never uses it up (only the bot starting does);
   - is cleared on demand, when it expires, when the bot has collected it, and when the page is closed.
   The only server calls that mention an ID are the pairing page's own job lookup and POST /api/deploy/check, which answers valid / seconds left. */
(function () {
  'use strict';
  var D = window.TFXDeploy, JOBKEY = 'tfx-job', KEY = 'tfx-deploy', app = document.getElementById('app');
  var STEPS = ['Where', 'Prepare', 'Session', 'Files', 'Start'];
  var S = { mode: 'quick', step: 1, p: '', opts: {}, tz: '', prefix: '', tzRaw: '', prefixRaw: '', prepared: false };
  var sid = '', src = '', expAt = 0, total = 300, collected = '', expired = false, gen = null, pairing = null, info = null, attested = false, msg = '', msgBad = false, busy = false;
  var tickT = 0, syncT = 0;
  var EXPIRED_MSG = 'Your session ID expired and was wiped from this page. Pair again for a new one. Your preparation is still done.';
  function pairLeft() { return pairing ? Math.max(0, Math.round(pairing.secs - (Date.now() - pairing.at) / 1000)) : 0; }

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
  function ctx() { return { origin: origin(), opts: Object.assign({}, S.opts, { tz: S.tz || '', prefix: S.prefix || '' }) }; }
  function mmss(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function secsLeft() { return Math.max(0, Math.round((expAt - Date.now()) / 1000)); }
  function mask(text) { return sid ? String(text).split(sid).join(D.MASK) : String(text); }
  // only the wizard choices are saved (never the session ID)
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ mode: S.mode, p: S.p, opts: S.opts, tz: S.tz, prefix: S.prefix, tzRaw: S.tzRaw, prefixRaw: S.prefixRaw, prepared: S.prepared, step: Math.min(S.step, 3) })); } catch (e) { /* storage may be off */ } }
  function restore() { try { var j = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (j && j.mode === 'hosts') S.mode = 'hosts';
      if (j && D.byId[j.p]) { S.p = j.p; S.opts = j.opts || {}; S.tz = D.validZone(j.tz) ? j.tz : ''; S.prefix = D.validPrefix(j.prefix) ? j.prefix : ''; S.tzRaw = j.tzRaw || S.tz; S.prefixRaw = j.prefixRaw || S.prefix; S.prepared = !!j.prepared; S.step = j.step >= 2 && j.step <= 3 ? j.step : 1; } } catch (e) { /* none */ } }

  // ---------- copy / download ----------
  function copyText(text, btn, label) {
    function done(ok) { if (!btn) return; btn.classList.toggle('ok', ok); btn.lastChild.textContent = ok ? 'Copied' : 'Copy failed'; toast(ok ? 'Copied to clipboard' : 'Could not copy. Select the text and copy it by hand.'); setTimeout(function () { btn.classList.remove('ok'); btn.lastChild.textContent = label; }, 1600); }
    function legacy() { try { var ta = el('textarea', { 'aria-hidden': 'true' }); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); done(ok); } catch (e) { done(false); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, legacy); else legacy();
  }
  function copyBtn(getText, label) { var l = label || 'Copy', b = el('button', { type: 'button', class: 'dp-cp' }, [icon('i-copy'), document.createTextNode(l)]); b.addEventListener('click', function () { copyText(getText(), b, l); }); return b; }
  function download(file, btn) {
    try { var blob = new Blob([file.text], { type: file.mime }), url = URL.createObjectURL(blob), a = el('a', { href: url, download: file.name }); document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1500); toast('Downloaded ' + file.name); }
    catch (e) { toast('Download failed. Use Copy instead.'); }
  }
  function term(c, real) {
    var pre = el('pre', {}, c.lines.map(function (l) { return el('span', { text: (real ? mask(l) : l) + '\n' }); }));
    return el('div', { class: 'dp-term' }, [el('div', { class: 'bar' }, [el('span', { text: c.label }), copyBtn(function () { return c.lines.join('\n'); })]), pre, c.note ? el('p', { class: 'dp-note', style: 'padding:0 14px 10px' , text: c.note }) : null]);
  }
  function vars(rows, real) {
    var box = el('div', { class: 'dp-vars' });
    rows.forEach(function (kv) { box.appendChild(el('div', {}, [el('span', { class: 'k', text: kv[0] }), el('span', { class: 'v', text: real ? mask(kv[1]) : kv[1] }), copyBtn(function () { return kv[1]; })])); });
    return box;
  }
  function fileRow(f, real) {
    var b = el('button', { type: 'button', class: 'dp-btn q' }, [icon('i-arrow'), document.createTextNode('Download')]);
    b.addEventListener('click', function () { download(f); });
    return el('div', { class: 'dp-file' }, [el('b', { text: f.name }), copyBtn(function () { return f.text; }, 'Copy file'), b]);
  }
  function zipRow() {
    var meta = info ? 'Version ' + info.version + ' · ' + (info.size / 1048576).toFixed(2) + ' MB' : 'Direct download from this site';
    var a = el('a', { class: 'dp-btn', href: D.ZIP_PATH, download: '' }, [icon('i-arrow'), document.createTextNode('Download hosting ZIP')]);
    var kids = [el('div', { class: 'dp-row' }, [a]), el('p', { class: 'dp-note', text: meta + '. This is the file your host needs; it downloads straight from TurboFex.' })];
    if (info) kids.push(el('details', { class: 'dp-acc' }, [el('summary', { text: 'Check the download (optional)' }), el('div', {}, ['SHA-256: ' + info.sha256 + '. Compare with: sha256sum TurboFex-hosting.zip'])]));
    return el('div', {}, kids);
  }

  // ---------- session handling ----------
  function setSid(id, from, secs) { sid = id; src = from; total = Math.max(secs, 1); expAt = Date.now() + secs * 1000; collected = ''; expired = false; msg = ''; schedule(); }
  function clearSid(why) { sid = ''; src = ''; expAt = 0; gen = null; attested = false; clearTimeout(syncT); clearInterval(tickT); if (why === 'expired') expired = true; if (why === 'manual') { msg = 'Cleared from this page.'; msgBad = false; } }
  function schedule() { clearInterval(tickT); clearTimeout(syncT); if (!sid) return; tickT = setInterval(tick, 1000); syncT = setTimeout(resync, 20000); }
  function tick() {
    var left = secsLeft(), t = document.getElementById('dp-time'), b = document.getElementById('dp-barfill'), w = document.getElementById('dp-timewrap');
    if (t) t.textContent = mmss(left); if (b) b.style.width = Math.round(left / total * 100) + '%'; if (w) w.className = 'dp-time' + (left <= 60 ? ' low' : '');
    if (left <= 0) { clearSid('expired'); render(); }
  }
  function readJobId() { try { var j = JSON.parse(sessionStorage.getItem(JOBKEY) || 'null'); return j && typeof j.job === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(j.job) ? j.job : ''; } catch (e) { return ''; } }
  function lookJob() {   // the pairing page's own job record: linked + valid ID, or used, or nothing
    var id = readJobId(); if (!id) return Promise.resolve(null);
    return fetch('/api/job/' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function resync() {   // is my ID still alive, or did the bot already collect it?
    if (!sid) return;
    var p = src === 'pairing' ? lookJob().then(function (j) { if (!j) return; if (j.used) return gone('confirmed'); if (j.state === 'linked' && j.sessionId && j.idSecondsLeft > 0) { expAt = Date.now() + j.idSecondsLeft * 1000; } }) :
      checkId(sid).then(function (r) { if (r && r.valid === false && secsLeft() > 5) gone('likely'); else if (r && r.valid) expAt = Date.now() + r.secondsLeft * 1000; });
    p.then(function () { if (sid) syncT = setTimeout(resync, 20000); });
  }
  function gone(kind) { collected = kind; clearSid(); render(); }   // the ID is no use any more: wipe it
  function checkId(id) {
    return fetch('/api/deploy/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id }) }).then(function (r) { if (r.status === 429) return { limited: true }; return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function usePasted() {
    var inp = document.getElementById('dp-id'), norm = D.normalizeId(inp && inp.value);
    if (!norm) { msg = 'That does not look like a session ID. It is TFX- followed by 12 letters and numbers.'; msgBad = true; return render(); }
    busy = true; msg = 'Checking…'; msgBad = false; render();
    checkId(norm).then(function (r) {
      busy = false;
      if (!r) { setSid(norm, 'pasted', 300); msg = 'Could not check it just now. Treat the countdown as a guess and move fast.'; msgBad = true; }   // never claim a validity we could not confirm
      else if (r.limited) { msg = 'Too many checks. Wait a minute and try again.'; msgBad = true; }
      else if (!r.valid) { msg = 'This ID is not valid any more: it expired, was already used by a bot, or did not come from this site. Pair again to get a new one.'; msgBad = true; }
      else { setSid(norm, 'pasted', r.secondsLeft); }
      render();
    });
  }
  function usePairing() { if (!pairing) return; var left = pairLeft(); if (left <= 0) { pairing = null; return render(); } setSid(pairing.id, 'pairing', left); pairing = null; render(); }

  // ---------- views ----------
  function head() {
    return el('ol', { class: 'dp-steps', 'aria-label': 'Progress' }, STEPS.map(function (n, i) { return el('li', { class: i + 1 === S.step ? 'on' : i + 1 < S.step ? 'past' : '', text: (i + 1) + ' ' + n, 'aria-current': i + 1 === S.step ? 'step' : 'false' }); }));
  }
  function nav(back, next, nextLabel, nextDisabled) {
    var row = el('div', { class: 'dp-row' }), b;
    if (next) { b = el('button', { type: 'button', class: 'dp-btn p' }, [nextLabel || 'Continue']); b.disabled = !!nextDisabled; b.addEventListener('click', next); row.appendChild(b); }
    var wrap = el('div', {}, [row]);
    if (back) { var l = el('button', { type: 'button', class: 'dp-link', text: 'Back' }); l.addEventListener('click', back); wrap.appendChild(l); }
    return wrap;
  }
  function go(n) { S.step = n; save(); render(true); }

  function stepWhere() {
    var list = el('ul', { class: 'dp-list' });
    D.platforms.forEach(function (p) {
      var b = el('button', { type: 'button', class: 'dp-plat', 'data-p': p.id }, [el('span', { class: 'ic' }, [icon(p.icon)]), el('span', { class: 'tx' }, [el('b', { text: p.name }), el('small', { text: p.tag })]), icon('i-arrow')]);
      b.lastChild.setAttribute('class', 'go');
      b.addEventListener('click', function () { choose(p.id); });
      list.appendChild(el('li', {}, [b]));
    });
    var back = el('button', { type: 'button', class: 'dp-link', text: 'Back to the one-file launcher' }); back.addEventListener('click', toQuick);
    var kids = [el('h2', { text: 'Where will TurboFex run?' }), el('p', { text: 'Pick one. You do not need a session ID to look around.' }), list, el('div', {}, [back])];
    if (pairing) kids.splice(2, 0, el('div', { class: 'dp-warn' }, ['Your pairing is ready (' + mmss(pairLeft()) + ' left). Its session ID lives 5 minutes, which is usually too short to install a bot. Prepare your host first, then pair again, or carry on and be quick.']));
    return el('div', { class: 'dp-view' }, kids);
  }
  function choose(id) {
    if (S.p !== id) { S.p = id; S.opts = D.defaults(D.byId[id]); S.prepared = false; }
    try { fetch('/api/deploy/choose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform: id }) }).catch(function () {}); } catch (e) { /* ignore */ }
    go(2);
  }

  function stepPrepare() {
    var p = D.byId[S.p], v = el('div', { class: 'dp-view' }), out = el('div', { id: 'dp-prep' });
    v.appendChild(el('h2', { text: 'Prepare ' + p.name })); v.appendChild(el('p', { text: p.blurb }));
    v.appendChild(el('div', { class: 'dp-warn' }, ['Prepare first, pair second. A session ID lives 5 minutes from pairing and is used only when your bot starts. Installing takes longer, so nothing on this step needs an ID.']));
    if (p.warn) v.appendChild(el('div', { class: 'dp-warn' }, [p.warn]));
    v.appendChild(el('div', { class: 'dp-sec' }, [el('h3', { text: 'You need' }), el('ul', { class: 'dp-need' }, p.needs.map(function (n) { return el('li', { text: n }); }))]));
    var opts = el('div', { class: 'dp-sec' });
    (p.options || []).forEach(function (o) {
      if (o.type === 'bool') { var cb = el('input', { type: 'checkbox' }); cb.checked = S.opts[o.id] !== false; cb.addEventListener('change', function () { S.opts[o.id] = cb.checked; save(); renderPrep(out); }); opts.appendChild(el('label', { class: 'dp-check' }, [cb, o.label])); }
      else { var sel = el('select'); o.choices.forEach(function (c) { var op = el('option', { value: c[0], text: c[1] }); if ((S.opts[o.id] || o.def) === c[0]) op.selected = true; sel.appendChild(op); }); sel.addEventListener('change', function () { S.opts[o.id] = sel.value; save(); renderPrep(out); }); opts.appendChild(el('label', { class: 'dp-field' }, [el('span', { text: o.label }), sel])); }
    });
    var tz = el('input', { type: 'text', placeholder: 'Africa/Lagos', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', value: S.tzRaw }), pf = el('input', { type: 'text', placeholder: '.', autocomplete: 'off', spellcheck: 'false', maxlength: '3', value: S.prefixRaw }), tzErr = el('p', { class: 'dp-err', hidden: 'hidden' }), pfErr = el('p', { class: 'dp-err', hidden: 'hidden' });
    function upd() {
      S.tzRaw = tz.value.trim(); S.prefixRaw = pf.value;
      var tzOk = !S.tzRaw || D.validZone(S.tzRaw), pfOk = !S.prefixRaw || D.validPrefix(S.prefixRaw);
      S.tz = tzOk ? S.tzRaw : ''; S.prefix = pfOk ? S.prefixRaw : '';
      tzErr.hidden = tzOk; tzErr.textContent = tzOk ? '' : 'Use a time zone name like Africa/Lagos or Europe/London.'; pfErr.hidden = pfOk; pfErr.textContent = pfOk ? '' : 'Use 1 to 3 characters with no spaces or slashes.';
      save(); renderPrep(out);
    }
    tz.addEventListener('input', upd); pf.addEventListener('input', upd);
    opts.appendChild(el('details', { class: 'dp-acc' }, [el('summary', { text: 'Optional settings (time zone, command prefix)' }), el('div', {}, [el('label', { class: 'dp-field' }, [el('span', { text: 'Time zone (the bot defaults to Africa/Johannesburg)' }), tz, tzErr]), el('label', { class: 'dp-field' }, [el('span', { text: 'Command prefix (default is .)' }), pf, pfErr])])]));
    v.appendChild(opts);
    renderPrep(out); v.appendChild(out);
    v.appendChild(nav(function () { go(1); }, function () { S.prepared = true; go(3); }, 'I have finished preparing'));
    return v;
  }
  function renderPrep(out) {
    while (out.firstChild) out.removeChild(out.firstChild);
    var r = D.prepare(S.p, ctx()), sec = el('div', { class: 'dp-sec' });
    sec.appendChild(el('h3', { text: 'Do this now · no session ID needed' })); sec.appendChild(el('p', { text: r.intro }));
    if (r.steps) { var ol = el('ol', { class: 'dp-ol' }); r.steps.forEach(function (s) { ol.appendChild(el('li', { text: s.t })); }); sec.appendChild(ol); }
    out.appendChild(sec);
    var needZip = (r.steps || []).some(function (s) { return s.zip; }) || (r.cmds || []).some(function (c) { return c.lines.some(function (l) { return l.indexOf(D.ZIP_PATH) >= 0; }); });
    var body = el('div', { class: 'dp-sec' });
    if (needZip) body.appendChild(zipRow());
    (r.cmds || []).forEach(function (c) { body.appendChild(term(c, false)); });
    (r.files || []).forEach(function (f) { body.appendChild(fileRow(f)); });
    if (r.filesNote) body.appendChild(el('p', { class: 'dp-note', text: r.filesNote }));
    if (r.vars && r.vars.length) body.appendChild(vars(r.vars, false));
    (r.after || []).forEach(function (c) { body.appendChild(term(c, false)); });
    if (r.warn) body.appendChild(el('div', { class: 'dp-warn', text: r.warn }));
    if (r.check) { body.appendChild(el('h3', { style: 'margin-top:18px', text: 'Check' })); body.appendChild(term(r.check, false)); }
    out.appendChild(body);
  }

  function stepSession() {
    var v = el('div', { class: 'dp-view' });
    v.appendChild(el('h2', { text: 'Your session ID' }));
    if (expired) v.appendChild(el('div', { class: 'dp-warn', text: EXPIRED_MSG }));
    if (collected) v.appendChild(collectedNote());
    if (sid) {
      v.appendChild(el('div', { class: 'dp-sec' }, [el('h3', { text: 'Time left' }), el('div', { class: 'dp-time' + (secsLeft() <= 60 ? ' low' : ''), id: 'dp-timewrap' }, [el('b', { id: 'dp-time', text: mmss(secsLeft()) }), el('span', { class: 'dp-ok', text: 'ready' })]), el('div', { class: 'dp-bar' }, [el('i', { id: 'dp-barfill', style: 'width:' + Math.round(secsLeft() / total * 100) + '%' })]),
        el('p', { class: 'dp-note', text: 'Generating or downloading files does not use the ID up. Only your bot starting does. Source: ' + (src === 'pairing' ? 'your pairing in this tab.' : 'the ID you pasted.') })]));
      if (msg) v.appendChild(el('p', { class: msgBad ? 'dp-err' : 'dp-note', text: msg }));
      var clr = el('button', { type: 'button', class: 'dp-link', text: 'Clear my session ID from this page' }); clr.addEventListener('click', function () { clearSid('manual'); render(); });
      v.appendChild(clr);
      v.appendChild(nav(function () { go(2); }, function () { go(4); }, 'Continue'));
      return v;
    }
    v.appendChild(el('p', { text: 'Pair WhatsApp to get one, or paste one you already have. It works once and expires 5 minutes after pairing.' }));
    if (pairing) { var u = el('button', { type: 'button', class: 'dp-btn p' }, ['Use my pairing from this tab (' + mmss(pairLeft()) + ' left)']); u.addEventListener('click', usePairing); v.appendChild(el('div', { class: 'dp-row' }, [u])); }
    else v.appendChild(el('div', { class: 'dp-row' }, [el('a', { class: 'dp-btn p', href: '/pair', text: 'Pair WhatsApp now' })]));
    var inp = el('input', { type: 'text', id: 'dp-id', class: 'mono', placeholder: 'TFX-XXXX-XXXX-XXXX', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', autocorrect: 'off', 'aria-label': 'Session ID' });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') usePasted(); });
    var chk = el('button', { type: 'button', class: 'dp-btn' }, [busy ? 'Checking…' : 'Check and use']); chk.disabled = busy; chk.addEventListener('click', usePasted);
    v.appendChild(el('div', { class: 'dp-sec' }, [el('label', { class: 'dp-field' }, [el('span', { text: 'Or paste a session ID' }), inp]), el('div', { class: 'dp-row' }, [chk]), msg ? el('p', { class: msgBad ? 'dp-err' : 'dp-note', text: msg }) : null,
      el('p', { class: 'dp-note', text: 'The ID stays in this page only. It is not saved, not put in the address and not sent to any host. Checking it only asks TurboFex whether it is still alive.' })]));
    v.appendChild(nav(function () { go(2); }));
    return v;
  }
  function collectedNote() {
    return el('div', { class: 'dp-warn', text: collected === 'confirmed' ? 'Your bot collected its login (TurboFex confirmed the ID was used). The ID is wiped from this page. This does not yet prove WhatsApp connected: check the log for "is online as".' : 'The ID stopped being valid before its time ran out, which usually means your bot collected it. TurboFex cannot tell this from other causes. The ID is wiped from this page. Check your bot log for "is online as".' });
  }

  function stepFiles() {
    var v = el('div', { class: 'dp-view' });
    if (!sid) { v.appendChild(el('h2', { text: 'Files' })); v.appendChild(collected ? collectedNote() : expired ? el('div', { class: 'dp-warn', text: EXPIRED_MSG }) : el('p', { text: 'There is no session ID on this page. Go back and add one.' })); v.appendChild(nav(function () { go(3); }, collected ? function () { go(5); } : null, 'Continue')); return v; }
    v.appendChild(el('h2', { text: 'Generate your launch files' }));
    v.appendChild(el('div', { class: 'dp-sec' }, [el('div', { class: 'dp-time' + (secsLeft() <= 60 ? ' low' : ''), id: 'dp-timewrap' }, [el('b', { id: 'dp-time', text: mmss(secsLeft()) }), el('span', { text: 'left' })]), el('div', { class: 'dp-bar' }, [el('i', { id: 'dp-barfill', style: 'width:' + Math.round(secsLeft() / total * 100) + '%' })])]));
    if (!gen) {
      var g = el('button', { type: 'button', class: 'dp-btn p' }, ['Generate for ' + D.byId[S.p].name]); g.addEventListener('click', function () { try { gen = D.launch(S.p, ctx(), sid); } catch (e) { msg = e.message; msgBad = true; } render(); });
      v.appendChild(el('p', { text: 'This only builds the files and commands in your browser. It does not use up your session ID.' }));
      v.appendChild(el('div', { class: 'dp-row' }, [g])); v.appendChild(nav(function () { go(3); })); return v;
    }
    var r = gen, sec = el('div', { class: 'dp-sec' });
    sec.appendChild(el('p', { text: r.intro }));
    (r.cmds || []).forEach(function (c) { sec.appendChild(term(c, true)); });
    (r.files || []).forEach(function (f) { sec.appendChild(fileRow(f, true)); });
    if (r.alt) sec.appendChild(el('p', { class: 'dp-note', text: r.alt }));
    if (r.vars && r.vars.length) sec.appendChild(vars(r.vars, true));
    sec.appendChild(el('div', { class: 'dp-warn', text: 'These contain your session ID: keep them private. The screen hides the ID but Copy and Download include it. Delete downloaded files from shared devices after use.' }));
    v.appendChild(sec);
    var clr = el('button', { type: 'button', class: 'dp-link', text: 'Clear my session ID from this page' }); clr.addEventListener('click', function () { clearSid('manual'); go(3); });
    v.appendChild(clr);
    v.appendChild(nav(function () { go(3); }, function () { go(5); }, 'I have run it'));
    return v;
  }

  function stepStart() {
    var p = D.byId[S.p], v = el('div', { class: 'dp-view' });
    v.appendChild(el('h2', { text: 'Start and check' }));
    var st = [];
    if (gen && gen.start) st = gen.start;
    st.forEach(function (t) { v.appendChild(el('p', { text: t })); });
    if (collected) v.appendChild(collectedNote()); else if (sid) v.appendChild(el('p', { class: 'dp-note', text: 'Waiting for your bot to collect the ID (' + mmss(secsLeft()) + ' left)…' })); else if (expired) v.appendChild(el('div', { class: 'dp-warn', text: 'The ID expired before a bot collected it. Pair again, then repeat the Session and Files steps.' }));
    v.appendChild(el('div', { class: 'dp-sec' }, [el('h3', { text: 'How to tell it worked' }), el('ul', { class: 'dp-need' }, p.verify.map(function (t) { return el('li', { text: t }); }))]));
    var ab = el('button', { type: 'button', class: 'dp-btn' }, [attested ? 'You confirmed it is online (undo)' : 'I can see it online']); ab.addEventListener('click', function () { attested = !attested; render(); });
    v.appendChild(el('div', { class: 'dp-row' }, [ab])); v.appendChild(el('p', { class: 'dp-note', text: 'TurboFex cannot see your bot. Only you can confirm that WhatsApp connected.' }));
    v.appendChild(el('div', { class: 'dp-sec' }, [el('h3', { text: 'If something is wrong' })].concat(p.trouble.map(function (t) { return el('details', { class: 'dp-acc' }, [el('summary', { text: t.q }), el('div', { text: t.a })]); }))));
    v.appendChild(el('p', { class: 'dp-note' }, ['More detail: ', el('a', { href: D.GUIDES, target: '_blank', rel: 'noopener noreferrer', text: 'hosting guides' }), ' · ', el('a', { href: '/install', text: 'Install page' })]));
    var again = el('button', { type: 'button', class: 'dp-link', text: 'Start over' }); again.addEventListener('click', function () { clearSid('manual'); S.p = ''; S.prepared = false; collected = ''; expired = false; msg = ''; go(1); });
    v.appendChild(el('div', {}, [again]));
    v.appendChild(nav(function () { go(sid ? 4 : 3); }));
    return v;
  }

  // ---------- the one-file launcher (the quick way) ----------
  var reported = {}, fileMsg = '', fileBad = false, downloaded = false;
  function report(id) { if (reported[id]) return; reported[id] = 1; try { fetch('/api/deploy/choose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform: id }) }).catch(function () {}); } catch (e) { /* ignore */ } }
  function getLauncher() {   // the ID is put into the file HERE, in this browser: the server only ever serves the file with its placeholder
    fileMsg = ''; if (!sid) return;
    fetch(D.LAUNCHER_PATH, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('The launcher could not be loaded (' + r.status + ').'); return r.text(); })
      .then(function (t) { download({ name: 'index.js', text: D.buildLauncher(t, sid), mime: 'text/javascript;charset=utf-8' }); downloaded = true; fileBad = false; fileMsg = 'Downloaded. Upload it to your host and start it now.'; report('launcher'); render(); })
      .catch(function (e) { fileBad = true; fileMsg = (e && e.message) || 'Could not build the file.'; render(); });
  }
  function viewQuick() {
    var v = el('div', { class: 'dp-view' });
    v.appendChild(el('h2', { text: 'Deploy TurboFex' }));
    v.appendChild(el('p', { text: 'One file starts your bot. It downloads TurboFex, installs it, links your WhatsApp with your session ID and starts.' }));
    if (expired) v.appendChild(el('div', { class: 'dp-warn', text: 'Your session ID expired and was wiped from this page. Pair again, or paste a new one.' }));
    if (collected) { v.appendChild(collectedNote()); var again = el('button', { type: 'button', class: 'dp-link', text: 'Deploy again with a new session ID' }); again.addEventListener('click', function () { collected = ''; downloaded = false; fileMsg = ''; render(); }); v.appendChild(again); }
    else if (!sid) {
      if (pairing) { var u = el('button', { type: 'button', class: 'dp-btn p' }, ['Use my session ID (' + mmss(pairLeft()) + ' left)']); u.addEventListener('click', usePairing); v.appendChild(el('div', { class: 'dp-row' }, [u])); }
      var inp = el('input', { type: 'text', id: 'dp-id', class: 'mono', placeholder: 'TFX-XXXX-XXXX-XXXX', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', autocorrect: 'off', 'aria-label': 'Session ID' });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') usePasted(); });
      var chk = el('button', { type: 'button', class: 'dp-btn p' }, [busy ? 'Verifying…' : 'Verify session ID']); chk.disabled = busy; chk.addEventListener('click', usePasted);
      v.appendChild(el('div', { class: 'dp-sec' }, [el('label', { class: 'dp-field' }, [el('span', { text: 'Your session ID' }), inp]), el('div', { class: 'dp-row' }, [chk]), msg ? el('p', { class: msgBad ? 'dp-err' : 'dp-note', text: msg }) : null,
        el('p', { class: 'dp-note' }, ['No session ID yet? ', el('a', { href: '/pair', text: 'Pair WhatsApp' }), ' first. It works once and expires 5 minutes after pairing. It stays in this page only: it is not saved, not put in the address and not sent anywhere. Verifying only asks TurboFex whether it is still alive.'])]));
    } else {
      var left = secsLeft();
      v.appendChild(el('div', { class: 'dp-sec' }, [el('h3', { text: 'Session ID verified' }), el('div', { class: 'dp-time' + (left <= 60 ? ' low' : ''), id: 'dp-timewrap' }, [el('b', { id: 'dp-time', text: mmss(left) }), el('span', { text: 'left' })]), el('div', { class: 'dp-bar' }, [el('i', { id: 'dp-barfill', style: 'width:' + Math.round(left / total * 100) + '%' })]),
        el('p', { class: 'dp-note', text: 'Source: ' + (src === 'pairing' ? 'your pairing in this tab.' : 'the ID you pasted.') + ' Downloading the file does not use it up. It is used when your bot starts.' })]));
      if (msg) v.appendChild(el('p', { class: msgBad ? 'dp-err' : 'dp-note', text: msg }));
      var dl = el('button', { type: 'button', class: 'dp-btn p' }, [icon('i-arrow'), document.createTextNode('Download index.js')]); dl.addEventListener('click', getLauncher);
      v.appendChild(el('div', { class: 'dp-row' }, [dl]));
      if (fileMsg) v.appendChild(el('p', { class: fileBad ? 'dp-err' : 'dp-note', text: fileMsg }));
      v.appendChild(el('div', { class: 'dp-warn', text: 'The file contains your session ID: keep it private and delete it from shared devices after use. Starting it installs the bot first, which takes a few minutes, and the ID is saved at the end. If the countdown is short, or your host is slow or new, use "Install first" below instead.' }));
      var run = el('div', { class: 'dp-sec' }, [el('h3', { text: 'Run it' })]);
      D.RUN.forEach(function (r) { run.appendChild(el('p', {}, [el('b', { text: r.name + ': ' }), r.text])); });
      D.PM2.forEach(function (c) { run.appendChild(term(c, false)); });
      v.appendChild(run);
      v.appendChild(el('details', { class: 'dp-acc' }, [el('summary', { text: 'Install first, add the ID later (for slow or new hosts)' }), el('div', {}, [
        'A session ID lives only 5 minutes. This file has no ID: it installs and starts the bot, which will say it has no session ID yet. That is expected. When it is installed, finish with the step-by-step guide for your host: a one-line command or one small file that adds the ID.',
        el('div', { class: 'dp-row' }, [el('a', { class: 'dp-btn', href: D.LAUNCHER_PATH, download: '', text: 'Download index.js without an ID' }), (function () { var b = el('button', { type: 'button', class: 'dp-btn', text: 'Show the finishing steps' }); b.addEventListener('click', function () { report('launcher-first'); toHosts(); }); return b; })()])])]));
      var clr = el('button', { type: 'button', class: 'dp-link', text: 'Clear my session ID from this page' }); clr.addEventListener('click', function () { clearSid('manual'); downloaded = false; fileMsg = ''; render(); }); v.appendChild(clr);
    }
    var hosts = el('button', { type: 'button', class: 'dp-link', text: 'Prefer step-by-step for a specific host? Choose a host' }); hosts.addEventListener('click', toHosts); v.appendChild(el('div', {}, [hosts]));
    return v;
  }
  function toHosts() { S.mode = 'hosts'; S.step = 1; save(); render(true); }
  function toQuick() { S.mode = 'quick'; save(); render(true); }

  function render(focus) {
    while (app.firstChild) app.removeChild(app.firstChild);
    if (S.mode !== 'quick') app.appendChild(head());
    var view = S.mode === 'quick' ? viewQuick() : S.step === 1 ? stepWhere() : !S.p ? stepWhere() : S.step === 2 ? stepPrepare() : S.step === 3 ? stepSession() : S.step === 4 ? stepFiles() : stepStart();
    app.appendChild(view);
    if (focus) { var h = view.querySelector ? view.querySelector('h2') : null; if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } if (window.scrollTo) window.scrollTo(0, 0); }
  }

  window.addEventListener('pagehide', function () { sid = ''; gen = null; });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && sid) resync(); });
  restore();
  if (location.hash === '#hosts') S.mode = 'hosts';
  if (S.mode === 'hosts' && location.hash === '#session' && S.p && S.prepared) S.step = 3;
  else if (location.hash === '#session') S.mode = S.mode === 'hosts' && S.p && S.prepared ? 'hosts' : 'quick';
  render();
  fetch('/api/hosting', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.sha256) { info = j; if (S.step === 2) render(); } }).catch(function () {});
  lookJob().then(function (j) {
    if (!j) return;
    if (j.state === 'linked' && j.sessionId && j.idSecondsLeft > 0 && !j.used && !j.expired) pairing = { id: String(j.sessionId), secs: j.idSecondsLeft, at: Date.now() };
    if (pairing && location.hash === '#session' && S.p && S.prepared && S.step === 3) { /* the person is ready: offer it on the Session step */ }
    // someone who just got their session ID and pressed Deploy: put it in the file for them, no typing
    if (S.mode === 'quick' && pairing && !sid && !collected) { usePairing(); return; }
    if (!sid) render();
  });
})();
