// Pairing page extras (display only): shows which step you are on. The pairing itself is handled by app.js and is untouched.
(function () {
  'use strict';
  var box = document.getElementById('connect'); if (!box) return;
  var ids = ['step-number', 'step-wait', 'step-done'];
  function sync() {
    for (var i = 0; i < ids.length; i++) { var s = document.getElementById(ids[i]); if (s && !s.hidden) { box.setAttribute('data-step', String(i + 1)); return; } }
  }
  var mo = ('MutationObserver' in window) ? new MutationObserver(sync) : null;
  ids.forEach(function (id) { var s = document.getElementById(id); if (s && mo) mo.observe(s, { attributes: true, attributeFilter: ['hidden'] }); });
  sync();
  // the live status pill sits under the header, so it needs the header's real height
  var head = document.getElementById('head'), live = document.getElementById('island');
  function place() { if (head && live) live.style.top = head.offsetHeight + 'px'; }
  place(); addEventListener('resize', place);
  function stuck() { if (head) head.classList.toggle('stuck', (window.scrollY || 0) > 8); }
  addEventListener('scroll', stuck, { passive: true }); stuck();
})();
