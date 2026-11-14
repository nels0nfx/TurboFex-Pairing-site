// TurboFex shared interface layer: the same navigation, footer, tabs, loading states and motion on every public page.
// It only changes how pages look and are arranged. It never touches pairing, forms, sign-in or any request to the server.
(function () {
  'use strict';
  var d = document, path = location.pathname.replace(/\/+$/, '') || '/';
  var reduced = false; try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* normal motion */ }
  function h(tag, cls, text, attrs) {
    var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text;
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function svg(inner) { var s = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '20'); s.setAttribute('height', '20'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.7'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); inner.forEach(function (p) { var e = d.createElementNS('http://www.w3.org/2000/svg', 'path'); e.setAttribute('d', p); s.appendChild(e); }); return s; }

  var SECTION = { '/plugins': 'market', '/developers': 'dev', '/plugin-guide': 'docs', '/playground': 'play', '/about': 'about', '/terms': 'terms', '/privacy': 'privacy', '/': 'home', '/pair': 'pair' };
  var here = SECTION[path] || '';
  d.documentElement.classList.add('ui-on');

  // ---- 1. the menu: every page gets the same complete list, and the current page is marked ----
  var panel = d.getElementById('menupanel');
  if (panel) {
    var devLink = d.getElementById('m-dev');
    function addItem(id, href, label, icon, after) {
      if (d.getElementById(id) || !after) return;
      var a = h('a', 'mi', null, { id: id, href: href, role: 'menuitem' }); a.appendChild(svg(icon)); a.appendChild(d.createTextNode(label));
      after.parentNode.insertBefore(a, after.nextSibling);
    }
    if (devLink) {
      addItem('m-docs', '/plugin-guide', 'Plugin guide', ['M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M17 7h2v13h-2', 'M9 9h5M9 13h5'], devLink);
      addItem('m-play', '/playground', 'Playground', ['M8 5l11 7-11 7z'], d.getElementById('m-docs') || devLink);
    }
    var marks = { 'm-plugins': 'market', 'm-dev': 'dev', 'm-docs': 'docs', 'm-play': 'play', 'm-about': 'about', 'm-terms': 'terms', 'm-privacy': 'privacy', 'm-home': 'home' };
    Object.keys(marks).forEach(function (id) { var el = d.getElementById(id); if (el && marks[id] === here) el.setAttribute('aria-current', 'page'); });
  }

  // ---- 2. a second row of tabs that ties the related pages together ----
  var main = d.querySelector('main.doc');
  var GROUPS = {
    market: 'build', dev: 'build', docs: 'build', play: 'build', about: 'legal', terms: 'legal', privacy: 'legal'
  };
  var TABS = {
    build: [['market', '/plugins', 'Marketplace'], ['dev', '/developers', 'Developer Centre'], ['docs', '/plugin-guide', 'Docs'], ['play', '/playground', 'Playground']],
    legal: [['about', '/about', 'About'], ['terms', '/terms', 'Terms'], ['privacy', '/privacy', 'Privacy']]
  };
  if (main && GROUPS[here]) {
    var nav = h('nav', 'subnav', null, { 'aria-label': GROUPS[here] === 'build' ? 'Plugins and developers' : 'About TurboFex' });
    TABS[GROUPS[here]].forEach(function (t) { var a = h('a', 'subtab', t[2], { href: t[1] }); if (t[0] === here) a.setAttribute('aria-current', 'page'); nav.appendChild(a); });
    main.insertBefore(nav, main.firstChild);
    d.body.classList.add('has-subnav');
    var cur = nav.querySelector('[aria-current]'); if (cur && nav.scrollWidth > nav.clientWidth && cur.offsetLeft + cur.offsetWidth > nav.clientWidth) { try { nav.scrollLeft = cur.offsetLeft + cur.offsetWidth - nav.clientWidth + 12; } catch (e) { /* fine */ } }
  }

  // ---- 3. one footer ----
  var foot = d.querySelector('footer.docfoot');
  if (foot) {
    foot.textContent = ''; foot.classList.add('ufoot');
    var inner = h('div', 'uf-in');
    var brand = h('div', 'uf-brand');
    var lg = h('span', 'logo sm'); var im = h('img', null, null, { src: '/logo-gold.png', alt: '', width: '26', height: '18' }); lg.appendChild(im); brand.appendChild(lg);
    var bt = h('div'); bt.appendChild(h('b', null, 'TURBOFEX')); bt.appendChild(h('small', null, 'More power. More possibilities.')); brand.appendChild(bt); inner.appendChild(brand);
    var cols = [
      ['Pair', [['Connect WhatsApp', '/pair'], ['FAQ', '/pair#faq']]],
      ['Plugins', [['Marketplace', '/plugins'], ['Developer Centre', '/developers'], ['Plugin guide', '/plugin-guide'], ['Playground', '/playground']]],
      ['TurboFex', [['About', '/about'], ['Terms', '/terms'], ['Privacy', '/privacy'], ['Help', 'https://t.me/+7PwU2Vo9czE1NTRk']]]
    ];
    var grid = h('nav', 'uf-cols', null, { 'aria-label': 'Footer' });
    cols.forEach(function (c) {
      var col = h('div', 'uf-col'); col.appendChild(h('span', 'uf-h', c[0]));
      c[1].forEach(function (l) { var a = h('a', null, l[0], { href: l[1] }); if (/^https:/.test(l[1])) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); } col.appendChild(a); });
      grid.appendChild(col);
    });
    inner.appendChild(grid); foot.appendChild(inner);
    var com = h('div', 'uf-com'); com.appendChild(h('span', 'uf-h', 'Join our community'));
    var row = h('div', 'uf-btns');
    [['WhatsApp Channel', 'https://whatsapp.com/channel/0029VbDpuKM8qIzkoQscOE2w'], ['Telegram', 'https://t.me/+7PwU2Vo9czE1NTRk']].forEach(function (l) { row.appendChild(h('a', 'cbtn', l[0], { href: l[1], target: '_blank', rel: 'noopener noreferrer' })); });
    com.appendChild(row); foot.appendChild(com);
    var cp = h('p', 'copy'); cp.appendChild(d.createTextNode('© ')); var y = h('span', null, String(new Date().getFullYear()), { id: 'yr' }); cp.appendChild(y); cp.appendChild(d.createTextNode(' TurboFex. All rights reserved.')); foot.appendChild(cp);
  } else {
    // the home page keeps its own footer; it only gets the links to the new areas
    var fl = d.querySelector('footer .foot-links');
    if (fl && !fl.querySelector('[href="/plugins"]')) { var ref = fl.firstChild; [['Plugins', '/plugins'], ['Developers', '/developers']].forEach(function (l) { var a = h('a', null, l[0], { href: l[1] }); fl.insertBefore(a, ref ? ref.nextSibling : null); ref = a; }); }
  }

  // ---- 4. the Developer Centre becomes a dashboard: summary tiles and tabs (all the existing forms and buttons stay exactly as they are) ----
  var dstate = d.getElementById('dstate'), dform = d.getElementById('dform'), dlist = d.getElementById('dlist'), dhooks = d.getElementById('dhooks'), dsubs = d.getElementById('dsubs');
  if (dstate && dform && dlist && main) {
    var infos = [].slice.call(main.querySelectorAll(':scope > section.docsec'));
    var tabs = [['plugins', 'Your plugins', [dlist]], ['send', 'Send a plugin', [dform]], ['auto', 'Automation', dhooks ? [dhooks] : []], ['info', 'How it works', infos]];
    var bar = h('div', 'dtabs', null, { role: 'tablist', 'aria-label': 'Developer dashboard' });
    var tiles = h('div', 'dstats'); var tl = {};
    [['total', 'Plugins sent'], ['published', 'Published'], ['waiting', 'Waiting for review']].forEach(function (t) { var b = h('div', 'dstat'); var n = h('b', null, '0'); b.appendChild(n); b.appendChild(h('span', null, t[1])); tiles.appendChild(b); tl[t[0]] = n; });
    var btns = {};
    tabs.forEach(function (t) { var b = h('button', 'dtab', t[1], { type: 'button', role: 'tab', id: 'tab-' + t[0] }); btns[t[0]] = b; b.addEventListener('click', function () { pick(t[0], true); }); bar.appendChild(b); });
    dstate.parentNode.insertBefore(tiles, dstate.nextSibling); tiles.parentNode.insertBefore(bar, tiles.nextSibling);
    var current = '', chosen = false;
    function pick(name, byUser) {
      if (byUser) chosen = true; var changed = name !== current; current = name;
      tabs.forEach(function (t) { var on = t[0] === name; btns[t[0]].setAttribute('aria-selected', on ? 'true' : 'false'); btns[t[0]].tabIndex = on ? 0 : -1; t[2].forEach(function (el) { el.classList.toggle('tab-off', !on); if (on && changed && !reduced) { el.classList.remove('tab-in'); void el.offsetWidth; el.classList.add('tab-in'); } }); });
      if (byUser) { try { history.replaceState(null, '', '#' + name); } catch (e) { /* fine */ } }
    }
    function signedIn() { return !dform.hidden; }
    function sync() {
      var on = signedIn(); bar.hidden = !on; tiles.hidden = !on;
      d.body.classList.toggle('dev-out', !on);
      if (!on) { tabs.forEach(function (t) { t[2].forEach(function (el) { el.classList.remove('tab-off'); }); }); return; }
      var cards = dsubs ? dsubs.querySelectorAll('.dsub') : [], tags = dsubs ? dsubs.querySelectorAll('.dtag') : [], pub = 0, wait = 0;
      [].forEach.call(tags, function (g) { var t = g.textContent; if (/^Published/.test(t)) pub++; else if (/^Waiting|^Changes|^Approved/.test(t)) wait++; });
      tl.total.textContent = String(cards.length); tl.published.textContent = String(pub); tl.waiting.textContent = String(wait);
      btns.plugins.textContent = 'Your plugins' + (cards.length ? ' (' + cards.length + ')' : '');
      var want = (location.hash || '').slice(1);
      if (!current || (!chosen && !want)) pick(want && btns[want] ? want : (cards.length ? 'plugins' : 'send'), false); else pick(current, false);
    }
    var mo = new MutationObserver(function () { sync(); });
    mo.observe(dform, { attributes: true, attributeFilter: ['hidden'] }); if (dsubs) mo.observe(dsubs, { childList: true });
    d.addEventListener('keydown', function (e) { if (!e.target.classList || !e.target.classList.contains('dtab') || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return; var names = tabs.map(function (t) { return t[0]; }), i = names.indexOf(current); i = (i + (e.key === 'ArrowRight' ? 1 : names.length - 1)) % names.length; pick(names[i], true); btns[names[i]].focus(); });
    window.addEventListener('hashchange', function () { var w = (location.hash || '').slice(1); if (signedIn() && btns[w]) pick(w, true); });
    bar.hidden = true; tiles.hidden = true; sync();
  }

  // ---- 5. the Marketplace: loading placeholders, plugin avatars ----
  var plist = d.getElementById('plist');
  if (plist) {
    if (!plist.children.length) for (var i = 0; i < 3; i++) plist.appendChild(h('div', 'skel', null, { 'aria-hidden': 'true' }));
    var decorate = function () {
      if (plist.querySelector('.skel') && plist.querySelector('.pcard')) [].forEach.call(plist.querySelectorAll('.skel'), function (s) { s.remove(); });
      [].forEach.call(plist.querySelectorAll('.ptitle'), function (t) {
        if (t.querySelector('.picon') || t.querySelector('.pav')) return;
        var nm = t.querySelector('.pname'); if (!nm) return;
        t.insertBefore(h('span', 'pav', (nm.textContent.trim().charAt(0) || '?').toUpperCase(), { 'aria-hidden': 'true' }), t.firstChild);
      });
    };
    new MutationObserver(decorate).observe(plist, { childList: true, subtree: true }); decorate();
  }

  // ---- 6. gentle reveal as things scroll into view (off for people who asked for less motion) ----
  window.addEventListener('beforeprint', function () { [].forEach.call(d.querySelectorAll('.rv'), function (e) { e.classList.add('in'); }); });
  if (!reduced && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
    var seen = new WeakSet();
    var scan = function () {
      [].forEach.call(d.querySelectorAll('.doc .docsec, .doc .dcard, .doc .pcard, .doc .pcol, .doc .dstat, .ufoot .uf-col'), function (el) {
        if (seen.has(el)) return; seen.add(el);
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.95) { return; }   // already on screen: no flash
        el.classList.add('rv'); io.observe(el);
      });
    };
    scan(); new MutationObserver(scan).observe(d.body, { childList: true, subtree: true });
    // jumping far down (End key, anchors, restored scroll) can skip past an element without it ever being seen: anything above the bottom edge is shown
    var tk = false;
    window.addEventListener('scroll', function () {
      if (tk) return; tk = true;
      requestAnimationFrame(function () { tk = false; [].forEach.call(d.querySelectorAll('.rv:not(.in)'), function (e) { if (e.getBoundingClientRect().top < window.innerHeight) { e.classList.add('in'); io.unobserve(e); } }); });
    }, { passive: true });
  }
})();
