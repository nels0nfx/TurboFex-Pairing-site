// Shows the site announcement and the maintenance notice (both set in the admin dashboard). Text only, never HTML.
(function () {
  'use strict';
  function seen(id) { try { return sessionStorage.getItem('tfx-notice') === id; } catch (e) { return false; } }
  function remember(id) { try { sessionStorage.setItem('tfx-notice', id); } catch (e) { /* fine */ } }
  function show(kind, text, id, closable) {
    var box = document.createElement('div'); box.className = 'notice ' + kind; box.setAttribute('role', kind === 'maint' ? 'alert' : 'status');
    var p = document.createElement('p'); p.textContent = text; box.appendChild(p);
    if (closable) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Dismiss'); b.textContent = '×'; b.addEventListener('click', function () { remember(id); box.remove(); }); box.appendChild(b); }
    document.body.insertBefore(box, document.body.firstChild);
  }
  fetch('/api/status', { cache: 'no-store', credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j) return;
    if (j.maintenance && j.maintenance.on) show('maint', j.maintenance.message, 'm', false);
    if (j.announcement && j.announcement.text && !seen(j.announcement.id)) show('info ' + (j.announcement.level || ''), j.announcement.text, j.announcement.id, true);
  }).catch(function () { /* no notice is fine */ });
})();
