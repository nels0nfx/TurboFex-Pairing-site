// Contents list for the documentation and legal pages. Built from the page's own headings; nothing from outside is added as HTML.
(function () {
  var root = document.querySelector('.prose'), box = document.getElementById('toc');
  if (!root || !box) return;
  var hs = [].slice.call(root.querySelectorAll('h2'));
  if (hs.length < 3) { var lay = box.closest('.dclay'); if (lay) lay.classList.remove('has-toc'); box.parentNode.hidden = true; return; }
  var nav = document.createElement('nav'); nav.setAttribute('aria-label', 'On this page');
  var links = hs.map(function (h, i) {
    var sec = h.closest('section') || h; if (!sec.id) sec.id = 's' + (i + 1);
    var a = document.createElement('a'); a.href = '#' + sec.id; a.textContent = h.textContent.replace(/^\d+\.\s*/, ''); nav.appendChild(a); return { a: a, sec: sec };
  });
  box.appendChild(nav);
  function spy() {
    var cur = links[0], y = window.scrollY + 140;
    links.forEach(function (l) { if (l.sec.offsetTop <= y) cur = l; });
    links.forEach(function (l) { l.a.setAttribute('aria-current', l === cur ? 'true' : 'false'); });
    if (nav.scrollWidth > nav.clientWidth && cur.a.offsetLeft != null && window.innerWidth < 960) nav.scrollLeft = Math.max(0, cur.a.offsetLeft - 16);
  }
  var t = 0; window.addEventListener('scroll', function () { if (!t) t = setTimeout(function () { t = 0; spy(); }, 80); }, { passive: true }); spy();
})();
