// Status page: shows only what the server itself answers right now. No history, no counts, nothing stored.
(function () {
  'use strict';
  var d = document, rows = {};
  [].forEach.call(d.querySelectorAll('.srow[data-k]'), function (r) { rows[r.getAttribute('data-k')] = r; });
  function set(k, state, text) { var r = rows[k]; if (!r) return; r.setAttribute('data-state', state); r.querySelector('[data-val]').textContent = text; }
  function get(url) { return fetch(url, { cache: 'no-store', credentials: 'omit' }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); }); }
  var busy = false;
  function check() {
    if (busy) return; busy = true;
    var btn = d.getElementById('refresh'); if (btn) btn.disabled = true;
    ['site', 'pair', 'store'].forEach(function (k) { set(k, 'checking', 'Checking'); });
    var note = d.getElementById('statusnote'); if (note) note.hidden = true;
    var health = get('/health'), status = get('/api/status'), store = get('/api/plugins');
    Promise.all([
      health.then(function (h) {
        var ok = h.status === 200 && h.body && h.body.ok === true;
        set('site', ok ? 'ok' : 'down', ok ? 'Online' : 'Unavailable');
        d.getElementById('v-site').textContent = ok && h.body.version ? 'v' + h.body.version : '-';
        d.getElementById('v-ttl').textContent = ok && h.body.sessionMinutes ? h.body.sessionMinutes + ' minutes' : '-';
        return ok;
      }, function () { set('site', 'down', 'Unavailable'); return false; }),
      status.then(function (s) {
        var st = s.body || {}, on = st.maintenance && st.maintenance.on;
        set('pair', s.status !== 200 ? 'down' : on ? 'paused' : 'ok', s.status !== 200 ? 'Unavailable' : on ? 'Paused' : 'Available');
        if (note && s.status === 200) {
          var text = on ? String(st.maintenance.message || 'Paused for maintenance.') : (st.announcement && st.announcement.text ? String(st.announcement.text) : '');
          if (text) { note.textContent = text; note.className = 'notice-card' + (on ? ' maint' : ''); note.hidden = false; }
        }
      }, function () { set('pair', 'down', 'Unavailable'); }),
      store.then(function (p) {
        if (p.status === 200 && p.body && p.body.paused) set('store', 'paused', 'Paused');
        else if (p.status === 200) set('store', 'ok', 'Available');
        else if (p.status === 429) set('store', 'checking', 'Try again soon');
        else set('store', 'down', 'Unavailable');
      }, function () { set('store', 'down', 'Unavailable'); })
    ]).then(function () {
      var t = new Date(), p2 = function (n) { return (n < 10 ? '0' : '') + n; };
      d.getElementById('checked').textContent = 'Checked at ' + p2(t.getHours()) + ':' + p2(t.getMinutes()) + ':' + p2(t.getSeconds());
    }).then(function () { busy = false; if (btn) btn.disabled = false; });
  }
  var b = d.getElementById('refresh'); if (b) b.addEventListener('click', check);
  check();
  setInterval(function () { if (!d.hidden) check(); }, 60000);
})();
