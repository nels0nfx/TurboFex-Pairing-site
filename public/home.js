// TurboFex landing page. Shows only real data from this site; anything that is not available is left out.
(function () {
  'use strict';
  var d = document, root = d.documentElement, reduced = false;
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* normal */ }
  root.classList.add('js');
  function el(tag, cls, text) { var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function icon(id) { var s = d.createElementNS('http://www.w3.org/2000/svg', 'svg'), u = d.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + id); s.appendChild(u); return s; }
  function get(u) { return fetch(u, { headers: { accept: 'application/json' } }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }

  // header shadow, theme button, menu sheet
  var head = d.getElementById('head');
  function onScroll() { head.classList.toggle('stuck', (window.scrollY || 0) > 8); }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  var tb = d.getElementById('theme');
  tb.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('tfx-theme', next); } catch (e) { /* not saved */ }
    var m = d.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', next === 'dark' ? '#070707' : '#FBF7EE');
  });
  var sheet = d.getElementById('sheet'), openB = d.getElementById('menu-open'), closeB = d.getElementById('menu-close');
  function setSheet(on) {
    sheet.classList.toggle('open', on); sheet.setAttribute('aria-hidden', on ? 'false' : 'true'); openB.setAttribute('aria-expanded', on ? 'true' : 'false');
    d.body.style.overflow = on ? 'hidden' : ''; if (on) closeB.focus(); else openB.focus();
  }
  openB.addEventListener('click', function () { setSheet(true); });
  closeB.addEventListener('click', function () { setSheet(false); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet.classList.contains('open')) setSheet(false); });
  sheet.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[data-close]'); if (a) setSheet(false); });

  // reveal on scroll
  var rv = [].slice.call(d.querySelectorAll('.rv'));
  rv.forEach(function (n, i) { n.style.setProperty('--d', Math.min(i % 6, 5) * 0.05 + 's'); });
  if (reduced || !('IntersectionObserver' in window)) rv.forEach(function (n) { n.classList.add('in'); });
  else {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    rv.forEach(function (n) { io.observe(n); });
    setTimeout(function () { rv.forEach(function (n) { n.classList.add('in'); }); }, 4000); // safety net
  }

  function sweep() { var vh = innerHeight * 0.92; rv.forEach(function (n) { if (!n.classList.contains('in') && n.getBoundingClientRect().top < vh) n.classList.add('in'); }); }
  if (!reduced) { addEventListener('scroll', sweep, { passive: true }); addEventListener('resize', sweep); }
  addEventListener('beforeprint', function () { rv.forEach(function (n) { n.classList.add('in'); }); });

  // live status
  var dot = d.getElementById('statusdot'), st = d.getElementById('statustext');
  var online = null, statusDone = false, plugDone = false;
  get('/api/status').then(function (s) {
    online = !(s && s.maintenance && s.maintenance.on);
    dot.className = 'dot ' + (online ? 'ok' : 'bad');
    st.textContent = online ? 'Pairing online' : 'Paused for maintenance';
    statusDone = true; drawStats();
  }).catch(function () { online = false; dot.className = 'dot bad'; st.textContent = 'Status unavailable'; statusDone = true; drawStats(); });

  // numbers
  var plugins = null;
  function count(node, to) {
    if (reduced) { node.textContent = String(to); return; }
    var t0 = performance.now(), dur = 900;
    (function tick(t) { var k = Math.min(1, (t - t0) / dur); node.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(tick); })(t0);
  }
  function drawStats(list) {
    if (list) { plugins = list; plugDone = true; }
    if (!statusDone || !plugDone) return;
    var bar = d.getElementById('statbar'); bar.textContent = '';
    var tiles = [{ ic: 'i-link', v: online ? 'Online' : 'Paused', l: 'WhatsApp pairing', text: true }];
    if (plugins && plugins.length) {
      tiles.push({ ic: 'i-store', v: plugins.length, l: plugins.length === 1 ? 'Published plugin' : 'Published plugins' });
      var devs = {}; plugins.forEach(function (p) { if (p.dev && p.dev.developer) devs[p.dev.developer] = 1; });
      var dn = Object.keys(devs).length; if (dn) tiles.push({ ic: 'i-code', v: dn, l: dn === 1 ? 'Developer' : 'Developers' });
      var inst = 0; plugins.forEach(function (p) { if (p.installs) inst += p.installs; });
      if (inst > 0) tiles.push({ ic: 'i-bolt', v: inst, l: 'Reported installs' });
      else { var rs = 0, rc = 0; plugins.forEach(function (p) { if (p.rating && p.rating.count) { rs += p.rating.avg * p.rating.count; rc += p.rating.count; } }); if (rc) tiles.push({ ic: 'i-people', v: (rs / rc).toFixed(1) + ' ★', l: 'Average rating (' + rc + ')', text: true }); }
    }
    tiles.forEach(function (t) {
      var s = el('div', 'stat'); s.appendChild(icon(t.ic)); var b = el('b'); s.appendChild(b); s.appendChild(el('span', null, t.l)); bar.appendChild(s);
      if (t.text) b.textContent = t.v; else count(b, t.v);
    });
    bar.className = 'statbar n' + tiles.length;
  }

  // featured plugins
  var pl = d.getElementById('plist'), note = d.getElementById('plugnote');
  function card(p) {
    var a = el('a', 'pcard'); a.href = '/plugins';
    var pi = el('span', 'pi'); pi.setAttribute('aria-hidden', 'true');
    if (p.docs && p.docs.icon) { var im = el('img'); im.alt = ''; im.width = 56; im.height = 56; im.loading = 'lazy'; im.src = '/api/plugin-icon?id=' + encodeURIComponent(p.id) + '&v=' + encodeURIComponent(p.version); pi.appendChild(im); } else pi.textContent = (p.name || '?').charAt(0).toUpperCase();
    var t = el('span', 'pt'); t.appendChild(el('b', null, p.name)); t.appendChild(el('span', 'pd', p.description || ''));
    var m = el('span', 'pm'); m.appendChild(el('span', 'ver', 'v' + p.version));
    if (p.dev && p.dev.developer) m.appendChild(el('span', null, 'by ' + p.dev.developer + (p.dev.verified ? ' ✓' : '')));
    if (p.rating && p.rating.count) m.appendChild(el('span', null, '★ ' + p.rating.avg.toFixed(1) + ' (' + p.rating.count + ')'));
    t.appendChild(m); a.appendChild(pi); a.appendChild(t); return a;
  }
  get('/api/plugins').then(function (r) {
    var list = (r && r.plugins) || [];
    pl.textContent = '';
    if (r && r.paused) { pl.appendChild(el('div', 'pempty', 'The store is paused for a moment. Please check back soon.')); drawStats([]); return; }
    drawStats(list);
    if (!list.length) { pl.appendChild(el('div', 'pempty', 'No plugins are published yet. Approved plugins appear here.')); return; }
    var feat = list.filter(function (p) { return p.featured; }), rest = list.filter(function (p) { return !p.featured; });
    var show = feat.concat(rest).slice(0, 3);
    show.forEach(function (p) { pl.appendChild(card(p)); });
    note.textContent = feat.length ? '' : 'Showing the latest published plugins.';
  }).catch(function () { pl.textContent = ''; pl.appendChild(el('div', 'pempty', 'The plugin list cannot be loaded right now.')); drawStats([]); });
})();
