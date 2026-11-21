// Shared helper for the 3D scenes: pauses a scene's animation while it is off screen (or the tab is hidden) to save battery and CPU. Nothing else.
(function () {
  var d = document;
  var els = d.querySelectorAll('.sc, .hub3d, .eng3d, .chat3d, .scene');
  if (els.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (e) { e.target.classList.toggle('off', !e.isIntersecting); });
    }, { rootMargin: '80px' });
    [].forEach.call(els, function (e) { io.observe(e); });
  }
  d.addEventListener('visibilitychange', function () { d.documentElement.classList.toggle('tab-off', d.hidden); });
})();
