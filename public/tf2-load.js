/* TurboFex loading kit (v3.26.0). One small script, loaded in the head of every page (styles: tf2-load.css).
   1) The page-load screen: the TF logo on every full page load (see the long note below), a thin line for link clicks.
   2) TFLoad: shared helpers the pages use, so every page loads, waits and fails the same way:
      TFLoad.fetch(url, opts, ms)    - a fetch that gives up after ms (default 20 s) with an error where error.timeout is true
      TFLoad.latest(key, url, ...)   - same, but a newer call with the same key cancels the older one
      TFLoad.busy(btn, 'Saving…')    - button shows a small indicator + the new label, cannot be pressed twice; returns done()
      TFLoad.run(btn, label, fn)     - busy() around a promise; always restores the button, success or failure
      TFLoad.mount(box, 'cards', 6)  - placeholders for one list while it loads;  TFLoad.skeleton(kind, n) builds them
      TFLoad.state(box, {kind, title, text, retry})  - an honest message (error / unavailable / empty) with a Try again button
      TFLoad.bar(parent)             - a progress bar: indeterminate until you call set(percent) with real progress */
(function () {
  'use strict';
  var W = window, d = document, root = d.documentElement;
  var reduce = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- 1) page-load screen ----------
     Runs as early as a script in the head can: the moment the browser has the first bytes of the page and this file.
     (Before the server answers at all nothing on the page can run - see the notes about slow hosting starts.)
     - Every full page load (first visit, refresh, direct address, a link to another page) gets it.
     - It waits 120 ms before it shows, so a page that is ready at once never flashes it, and once shown it stays at least 600 ms.
     - A click on a link to another page of the site shows a thin violet line at once; if the next page is slow, the full screen follows.
     - Reduce Motion: same screen, no movement. A hard limit makes sure nothing can stay on screen for ever. */
  var GRACE = 120, MIN_SHOWN = 600, HARD = 7000, SLOW_NAV = 700, NAV_LIMIT = 12000;
  function gone(n) { if (n && n.parentNode) n.parentNode.removeChild(n); }
  var SPLASH = '<div class="tb-halo"></div><div class="tb-logo"><img class="tb-d" src="/logo-brand-dark.png" alt="" width="132" height="91"><img class="tb-l" src="/logo-brand-light.png" alt="" width="132" height="91"><i class="tb-glint"></i></div><div class="tb-bar"><i></i></div>';
  function makeSplash(now) {                                   // the same markup the pages carry in their HTML (used for slow link clicks)
    var el = d.createElement('div'); el.id = 'tfboot'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Loading TurboFex');
    if (now) el.className = 'now';
    el.innerHTML = SPLASH; root.appendChild(el); return el;
  }
  var splash = null, navBar = null, navTimers = [];
  function closeSplash(el) {
    if (!el) return; el.classList.add('out');
    setTimeout(function () { gone(el); if (splash === el) splash = null; if (!splash) root.classList.remove('tf-boot'); }, 340);
  }
  function boot() {
    if (/[?&]nosplash/.test(location.search)) return;
    var el = splash = d.getElementById('tfboot') || makeSplash(false), t0 = Date.now(), shownAt = 0, over = false;   // the page's own HTML already carries it, so it is drawn before any stylesheet
    function show() { if (over || shownAt) return; shownAt = Date.now(); root.classList.add('tf-boot'); }
    var tg = setTimeout(show, GRACE);
    function leave() {
      if (over) return; over = true; clearTimeout(tg);
      if (!shownAt) { gone(el); if (splash === el) splash = null; return; }   // the page was ready before it was ever needed
      closeSplash(el);
    }
    function soon() { if (over) return; if (!shownAt) return leave(); setTimeout(leave, Math.max(0, MIN_SHOWN - (Date.now() - shownAt))); }
    function sheetsReady() {                                  // every stylesheet of the page has arrived: only then is the page drawn properly
      var l = d.querySelectorAll('link[rel~="stylesheet"]');
      for (var i = 0; i < l.length; i++) if (!l[i].sheet) return false;
      return true;
    }
    function afterDom() {
      var done = false; function go() { if (done) return; done = true; soon(); }
      function fin() {                                         // styles are in: wait for fonts, then for pictures, but only a little
        var f = d.fonts && d.fonts.ready; var cap = setTimeout(go, 1200);
        function pics() { if (d.readyState === 'complete') go(); else W.addEventListener('load', go, { once: true }); }
        if (f && f.then) f.then(pics, pics); else pics();
      }
      (function poll() { if (over || done) return; if (sheetsReady()) fin(); else setTimeout(poll, 50); })();
    }
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', afterDom); else afterDom();
    setTimeout(leave, HARD);                                  // hard limit, so a stuck request can never keep the screen up
    W.addEventListener('error', function () { setTimeout(leave, 0); }, { once: true });   // a script error must not trap the visitor behind it
    el.addEventListener('pointerdown', leave); d.addEventListener('keydown', function () { leave(); }, { once: true });
  }
  try { boot(); } catch (e) { gone(d.getElementById('tfboot')); root.classList.remove('tf-boot'); }

  /* a link to another page of the site: a light signal first, the full screen only if the next page is slow */
  function navCleanup() {
    navTimers.forEach(clearTimeout); navTimers = [];
    gone(navBar); navBar = null;
    if (splash && splash.getAttribute('data-nav')) { var s = splash; splash = null; gone(s); root.classList.remove('tf-boot'); }
  }
  function navStart() {
    navCleanup();
    navBar = d.createElement('div'); navBar.id = 'tfnav'; navBar.setAttribute('aria-hidden', 'true'); navBar.innerHTML = '<i></i>'; root.appendChild(navBar);
    navTimers.push(setTimeout(function () {
      if (splash) return;
      splash = makeSplash(true); splash.setAttribute('data-nav', '1'); root.classList.add('tf-boot');
    }, SLOW_NAV));
    navTimers.push(setTimeout(navCleanup, NAV_LIMIT));         // the page never changed (offline, blocked): hand the page back
  }
  d.addEventListener('click', function (ev) {
    try {
      if (ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      var u = new URL(a.href, location.href);
      if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) return;
      if (u.pathname === location.pathname && u.search === location.search) return;     // same page or a #link: nothing to load
      if (/^\/(api|admin\/api)\//.test(u.pathname) || /\.(zip|png|jpe?g|svg|pdf|txt|json)$/i.test(u.pathname)) return;
      navStart();
    } catch (e) { /* a failed check just means no transition */ }
  });
  W.addEventListener('pageshow', function (ev) { if (ev.persisted) { navCleanup(); gone(d.getElementById('tfboot')); splash = null; root.classList.remove('tf-boot'); } });   // back button restoring a saved page

  /* ---------- 2) shared helpers ---------- */
  var latestCalls = {};
  function tfetch(url, opts, ms) {
    opts = opts || {};
    if (!W.AbortController) return fetch(url, opts);
    var c = new AbortController(), timedOut = false;
    var t = setTimeout(function () { timedOut = true; c.abort(); }, ms || 20000);
    if (opts.signal) { if (opts.signal.aborted) c.abort(); else opts.signal.addEventListener('abort', function () { c.abort(); }); }
    var o = {}; for (var k in opts) o[k] = opts[k]; o.signal = c.signal;
    return fetch(url, o).then(function (r) { clearTimeout(t); return r; }, function (e) {
      clearTimeout(t);
      if (timedOut) { var er = new Error('This is taking too long.'); er.timeout = true; throw er; }
      throw e;
    });
  }
  function latest(key, url, opts, ms) {
    var old = latestCalls[key]; if (old && old.abort) old.abort();
    if (!W.AbortController) return tfetch(url, opts, ms);
    var c = new AbortController(); latestCalls[key] = c;
    var o = {}; for (var k in (opts || {})) o[k] = opts[k]; o.signal = c.signal;
    return tfetch(url, o, ms).then(function (r) { if (latestCalls[key] === c) delete latestCalls[key]; return r; }, function (e) { if (latestCalls[key] === c) delete latestCalls[key]; throw e; });
  }
  function isCancel(e) { return !!(e && e.name === 'AbortError' && !e.timeout); }

  function busy(btn, label) {
    if (!btn || btn.getAttribute('aria-busy') === 'true') return null;     // already working: ignore a second press
    var kids = [].slice.call(btn.childNodes), was = btn.disabled, w = btn.offsetWidth;
    var lbl = d.createElement('span'); lbl.className = 'ld-lbl'; lbl.textContent = label || 'Working…';
    if (w) btn.style.minWidth = w + 'px';                                   // the button keeps its width, so nothing jumps
    kids.forEach(function (n) { btn.removeChild(n); }); btn.appendChild(lbl);
    btn.classList.add('ld-busy'); btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
    var over = false;
    return function done() {
      if (over) return; over = true;
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      kids.forEach(function (n) { btn.appendChild(n); });
      btn.style.minWidth = ''; btn.classList.remove('ld-busy'); btn.removeAttribute('aria-busy'); btn.disabled = was;
    };
  }
  function run(btn, label, fn) {
    var done = busy(btn, label); if (!done) return Promise.resolve();
    return Promise.resolve().then(fn).then(function (r) { done(); return r; }, function (e) { done(); throw e; });
  }

  function el(tag, cls) { var n = d.createElement(tag); if (cls) n.className = cls; return n; }
  function skeleton(kind, n) {
    var f = d.createDocumentFragment(), i;
    n = n || 3;
    if (kind === 'cards') { var g = el('div', 'ld-wrap cols'); for (i = 0; i < n; i++) g.appendChild(el('i', 'skel ld-card')); f.appendChild(g); }
    else if (kind === 'lines') { var l = ['w1', 'w2', 'w1', 'w3']; for (i = 0; i < n; i++) f.appendChild(el('i', 'skel ld-line ' + l[i % 4])); }
    else { for (i = 0; i < n; i++) f.appendChild(el('i', 'skel ld-row')); }    // 'rows' and 'table'
    return f;
  }
  function clear(box) { while (box.firstChild) box.removeChild(box.firstChild); }
  function mount(box, kind, n) { if (!box) return; clear(box); box.appendChild(skeleton(kind, n)); box.setAttribute('aria-busy', 'true'); }
  function unmount(box) { if (!box) return; box.removeAttribute('aria-busy'); }

  var ICON = {
    error: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.4v.1"/>',
    unavailable: '<path d="M4 15a4 4 0 0 1 1.4-7.7A6 6 0 0 1 17 8.5 3.8 3.8 0 0 1 17.5 16H9"/><path d="M3 3l18 18"/>',
    empty: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'
  };
  function state(box, o) {
    if (!box) return; o = o || {}; var kind = o.kind || 'error';
    clear(box); box.removeAttribute('aria-busy');
    var s = el('div', 'ld-state ' + (kind === 'error' ? 'bad' : kind === 'unavailable' ? 'warn' : '')); s.setAttribute('role', kind === 'empty' ? 'status' : 'alert');
    var ic = el('span', 'ld-ti'); ic.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICON[kind] || ICON.error) + '</svg>'; s.appendChild(ic);
    var b = el('b'); b.textContent = o.title || 'Something went wrong'; s.appendChild(b);
    if (o.text) { var p = el('p'); p.textContent = o.text; s.appendChild(p); }
    if (o.retry) {
      var r = el('button', 'btn'); r.type = 'button'; r.textContent = o.label || 'Try again';
      r.addEventListener('click', function () { var done = busy(r, 'Trying again…'); Promise.resolve().then(o.retry).then(function () { if (done) done(); }, function () { if (done) done(); }); });
      s.appendChild(r);
    }
    box.appendChild(s);
  }
  // a plain message for why something failed: a timeout reads differently from a lost connection
  function why(e, what) {
    if (e && e.timeout) return 'This is taking longer than it should. Check your connection and try again.';
    if (W.navigator && navigator.onLine === false) return 'You look offline. Check your connection and try again.';
    return (e && e.message && !/^(Failed to fetch|Load failed|NetworkError|The operation was aborted)/i.test(e.message)) ? e.message : (what || 'It could not be loaded right now.') + ' Please try again in a moment.';
  }

  function bar(parent) {
    var b = el('div', 'ld-bar ld-ind'), i = el('i'); b.appendChild(i); b.setAttribute('role', 'progressbar'); b.setAttribute('aria-label', 'Progress');
    if (parent) parent.appendChild(b);
    return {
      el: b,
      set: function (p) { p = Math.max(0, Math.min(100, +p || 0)); b.classList.remove('ld-ind'); i.style.width = p + '%'; b.setAttribute('aria-valuenow', String(Math.round(p))); },   // only call this with real progress
      done: function () { b.classList.remove('ld-ind', 'bad'); b.classList.add('ok'); },
      fail: function () { b.classList.remove('ld-ind', 'ok'); b.classList.add('bad'); },
      remove: function () { if (b.parentNode) b.parentNode.removeChild(b); }
    };
  }

  W.TFLoad = { fetch: tfetch, latest: latest, isCancel: isCancel, busy: busy, run: run, skeleton: skeleton, mount: mount, unmount: unmount, state: state, why: why, bar: bar, reduced: reduce };
})();
