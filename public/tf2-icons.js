/* TurboFex icon motion (v3.24.0). Finds each icon by its drawing, gives it a name (data-ic), and starts its slow idle move only while it is on screen.
   The moves themselves are in tf2-icons.css. Same drawing = same name = same move, on every page, the Developer Centre and the admin.
   Nothing here changes how an icon looks. Reduce Motion: the styles do not apply, so icons stay still. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  // the drawings we know. Each line is "start of the drawing" => name. Circles are written as circle + radius.
  var SIG = {
    dl: ['M21 15v4a2 2 0 0 1-2 2H5'], link: ['M10 13a5 5 0 0 0 7.54', 'M10 14a4 4 0 0 0 5.7'],
    plug: ['M12 22v-5M9 8V2', 'M9 3v3M15 3v3'], puzzle: ['M9 4h3a2 2'],
    book: ['M4 19.5v-15A2.5'], book2: ['M12 6c-2-1.3'], flask: ['M10 2v7.3'], play: ['M8 5l11 7-11 7z'],
    code: ['m16 18 6-6-6-6'], code2: ['M8 8l-4 4 4 4M16'], term: ['m4 17 6-6-6-6'], box: ['M12 3l8 4.5v9'],
    shield: ['M12 22s8-4 8-10V5', 'M12 3l7 3v5c0 4.5-3 8.3-7 10', 'M12 3l7 2.8v5.5', 'M12 3l7 3v5c0 4.5-3 8-7 10'],
    lock: ['rect|M8 11V7a4 4 0 0 1 8 0v4'], clock: ['circle9|M12 7v5l3'], key: ['circle4|M11 12l9-9'], eye: ['M2 12s3.5-6.5'],
    search: ['circle6.5|M16 16l4.5 4.5', 'M11 4a7 7 0 1 0'], check: ['M5 12.5l4.5 4.5L19 7.5'], send: ['M21 3L10 14M21 3l-7 18'],
    tg: ['M11.944 0A12'], gh: ['M12 0.5C5.7', 'M15 22v-4a4.8'], wa: ['M17.472 14.382'], out: ['M10 4H5a1 1 0 0 0-1 1v14', 'M9 4H5v16h4M16'], lines: ['M4 7h16M4 12h16M4 17h16'],
    arrow: ['M5 12h14M13 6l6 6-6 6'], chev: ['m9 18 6-6-6-6', 'M9 6l6 6-6 6'], down: ['M6 9l6 6 6-6'], plus: ['M12 5v14M5 12h14'], close: ['M6 6l12 12M18 6L6 18'],
    warn: ['M10.3 3.9', 'M12 4l9 16H3'], copy: ['rect|M5 15H4', 'rect|M15.5 8.5V6.5', 'rect|M15 9V6.5'], refresh: ['M20 12a8 8 0 1 1-2.6-5.9'],
    sun: ['circle4|M12 2v2', 'circle4|M12 3v2'], moon: ['M21 12.8A9 9', 'M20 14.2A8'], burger: ['M4 8h16M4 16h16'],
    home: ['M4 11l8-7 8 7'], store: ['M4 9l1.5-5h13'], user: ['circle4|M4 21c0-4', 'circle4|M4 20c1-4', 'M16 11a4 4 0 1 0-8'],
    people: ['circle3.2|M3 19c.6', 'circle3.5|M2.5 20'], chart: ['M5 20V10M12 20V4M19 20v-7'], dash: ['M4 13h6V4H4z'],
    server: ['M4 5h16v6H4z'], pulse: ['M3 12h4l3-8'], doc: ['M7 3h7l4 4v14H7z'], mega: ['M4 10v4h3l7 4V6'],
    gear: ['circle3|M12 3v2.5', 'M12 15a3 3 0 1 0'], life: ['circle9|circle3.5'], globe: ['circle9|M3 12h18'], star: ['M12 3.5l2.6 5.4'],
    bolt: ['M13 3L5 13.5h6'], chat: ['M4 5h16v11H9l-5 4z'], image: ['rect|circle1.7'], db: ['ellipse'], sliders: ['M4 7h10M18 7h2'],
    flag: ['M5 21V4M5 4h11'], more: ['M5 12h.01M12 12'], info: ['circle9|M12 11v5.5'], qr: ['M4 4h6v6H4z']
  };
  // drawings that are one path with several pieces: cut them into pieces so each piece can move on its own (the picture stays the same)
  var SPLIT = ' dl link plug code code2 term chart dash burger lines flask box out sliders server doc mega flag globe more user people ';
  // these keep their stroke drawn/undrawn, so their path length is set to 1
  var DRAW = { shield: '.p2', check: '.p1', pulse: '.p1' };
  // icons that may idle (a slow, rare move) when they sit in a feature spot
  var IDLE = ' dl link plug puzzle warn book book2 flask play code code2 term box shield lock clock key eye search send ';
  var IDLE_BOX = '.ico,.mi,.trust li,.row.planned,.warnbox,.vico';
  var SKIP = '.sc,.chat3d,.hub3d,.eng3d,.cscene,.vmark,.logo,.mark,.go,.cube,symbol,defs,[data-ic-skip]';
  var MAX_LIVE = 10; // never more than this many icons idle at the same time (battery)

  function norm(s) { return s.replace(/\s+/g, ' ').replace(/-?\d*\.?\d+/g, function (n) { return String(+n); }).replace(/ ?([a-zA-Z]) ?/g, '$1'); }
  var LIST = [];
  Object.keys(SIG).forEach(function (k) { SIG[k].forEach(function (p) { LIST.push([norm(p), k]); }); });

  function sigOf(nodes) {
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var e = nodes[i], t = e.tagName ? e.tagName.toLowerCase() : '';
      if (!t || t === 'title' || t === 'desc') continue;
      if (t === 'path') out.push(norm(e.getAttribute('d') || ''));
      else if (t === 'circle') out.push('circle' + (+e.getAttribute('r')));
      else out.push(t);
    }
    return out.join('|');
  }
  function keyOf(sig) { for (var i = 0; i < LIST.length; i++) if (sig.indexOf(LIST[i][0]) === 0) return LIST[i][1]; return null; }

  function svgEl(tag) { return d.createElementNS('http://www.w3.org/2000/svg', tag); }
  function addCls(e, c) { e.setAttribute('class', ((e.getAttribute('class') || '') + ' ' + c).trim()); }

  function prepare(svg, key) {
    var kids = [].slice.call(svg.children).filter(function (e) { return /^(path|circle|rect|ellipse|line|polyline|polygon)$/i.test(e.tagName); });
    if (SPLIT.indexOf(' ' + key + ' ') >= 0) {
      kids.forEach(function (p) {
        if (p.tagName.toLowerCase() !== 'path') return;
        var parts = (p.getAttribute('d') || '').split(/(?=M)/).filter(Boolean);
        if (parts.length < 2) return;
        parts.forEach(function (dd) { var c = p.cloneNode(false); c.setAttribute('d', dd); svg.insertBefore(c, p); });
        svg.removeChild(p);
      });
      kids = [].slice.call(svg.children).filter(function (e) { return /^(path|circle|rect|ellipse|line)$/i.test(e.tagName); });
    }
    kids.forEach(function (e, i) { addCls(e, 'p' + (i + 1)); });
    if (DRAW[key]) { var t = svg.querySelector(DRAW[key]); if (t) t.setAttribute('pathLength', '1'); }
    // small extras that are invisible until the icon moves
    if (key === 'flask') [['10.4', '16.6', 'ibb1'], ['13.6', '15.2', 'ibb2'], ['12', '17.8', 'ibb3']].forEach(function (b) { var c = svgEl('circle'); c.setAttribute('cx', b[0]); c.setAttribute('cy', b[1]); c.setAttribute('r', '.9'); c.setAttribute('class', 'ib ' + b[2]); c.setAttribute('opacity', '0'); svg.appendChild(c); });
    if (key === 'qr') { var l = svgEl('path'); l.setAttribute('d', 'M5 12h14'); l.setAttribute('class', 'ib ibl'); l.setAttribute('opacity', '0'); svg.appendChild(l); }
    // the eye keeps its drawing (the second piece is the pupil)
  }

  var io = null, live = 0, seq = 0;
  function visible(svg, on) {
    var has = svg.classList.contains('ic-live');
    if (on && !has && live < MAX_LIVE) { svg.classList.add('ic-live'); live++; }
    else if (!on && has) { svg.classList.remove('ic-live'); live--; }
  }
  function watch(svg) {
    if (!('IntersectionObserver' in window)) return;
    if (!io) io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { visible(e.target, e.isIntersecting); });
      // spots that were full may be free now
      if (live < MAX_LIVE) pending.forEach(function (s) { if (s.__vis) visible(s, true); });
    }, { rootMargin: '40px' });
    io.observe(svg);
  }
  var pending = [];

  function one(svg) {
    if (svg._ic) return; svg._ic = 1;
    if (svg.closest && svg.closest(SKIP)) return;
    if (svg.querySelector('symbol')) return;
    var use = svg.querySelector(':scope > use'), src = null;
    if (use) {
      var id = (use.getAttribute('href') || use.getAttribute('xlink:href') || '').replace('#', '');
      var sym = id && d.getElementById(id);
      if (!sym || sym.tagName.toLowerCase() !== 'symbol') return;
      src = sym;
    }
    var sig = sigOf((src || svg).children), key = keyOf(sig);
    if (!key) return;
    if (src) { // draw the same picture directly, so its parts can move
      if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', src.getAttribute('viewBox') || '0 0 24 24');
      [].slice.call(src.children).forEach(function (c) { svg.insertBefore(c.cloneNode(true), use); });
      svg.removeChild(use);
    }
    prepare(svg, key);
    svg.setAttribute('data-ic', key);
    if (IDLE.indexOf(' ' + key + ' ') >= 0 && svg.closest(IDLE_BOX)) {
      addCls(svg, 'ic-s' + (1 + (seq++ % 6)));
      svg.__vis = false; pending.push(svg); watch(svg);
    }
  }
  // remember what the observer saw, so a full set can be refilled
  var origVisible = visible;
  visible = function (svg, on) { svg.__vis = on; origVisible(svg, on); };

  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName.toLowerCase() === 'svg') one(node);
    var l = node.querySelectorAll ? node.querySelectorAll('svg') : [];
    for (var i = 0; i < l.length; i++) one(l[i]);
  }

  var queue = [], t = 0;
  function flush() { t = 0; var q = queue; queue = []; q.forEach(scan); pending = pending.filter(function (s) { return d.contains(s); }); }
  function init() {
    scan(d.body);
    if ('MutationObserver' in window) new MutationObserver(function (ms) {
      ms.forEach(function (m) { for (var i = 0; i < m.addedNodes.length; i++) queue.push(m.addedNodes[i]); });
      if (!t) t = setTimeout(flush, 40);
    }).observe(d.body, { childList: true, subtree: true });
    d.addEventListener('visibilitychange', function () { root.classList.toggle('ic-hide', d.hidden); });
    d.addEventListener('touchstart', function () {}, { passive: true }); // lets :active work on iPhone, so a tap moves the icon
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
