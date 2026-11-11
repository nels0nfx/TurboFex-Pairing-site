// The Developer Centre page: GitHub sign-in, sending a plugin, and the developer's own submissions.
// Everything is added with textContent (never as HTML), so nothing from the server can run as code.
(function () {
  var stateBox = document.getElementById('dstate'), formBox = document.getElementById('dform'), listBox = document.getElementById('dlist'), subs = document.getElementById('dsubs'), notice = document.getElementById('dnotice');
  if (!stateBox) return;
  var form = document.getElementById('dsend'), go = document.getElementById('dgo'), msg = document.getElementById('dmsg'), prob = document.getElementById('dprob');
  var NOTES = { off: 'The Developer Centre is not open yet. Please check back soon.', wait: 'Too many tries. Please wait a few minutes and try again.', login: 'GitHub sign-in did not finish. Please try again.', blocked: 'This account cannot sign in.' };
  var STATUS = { pending: ['Waiting for review', 'wait'], approved: ['Approved: waiting to be published', 'ok'], published: ['Published', 'ok'], rejected: ['Not accepted', 'bad'], revoked: ['Withdrawn from the store', 'bad'], withdrawn: ['Withdrawn', ''] };

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tfx' }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); });
  }
  function say(text, problems) {
    msg.classList.remove('ok'); msg.hidden = !text; msg.textContent = text || ''; prob.textContent = ''; prob.hidden = !(problems && problems.length);
    (problems || []).forEach(function (p) { prob.appendChild(el('li', null, p)); });
  }

  var e = (new URLSearchParams(location.search).get('e') || '');
  if (NOTES[e]) { notice.textContent = NOTES[e]; notice.hidden = false; try { history.replaceState(null, '', '/developers'); } catch (x) { /* fine */ } }

  function drawSubs(list) {
    subs.textContent = '';
    if (!list.length) { subs.appendChild(el('p', 'dmuted', 'You have not sent a plugin yet.')); return; }
    list.forEach(function (s) {
      var st = STATUS[s.status] || [s.status, ''], card = el('div', 'dsub');
      var top = el('div', 'dsub-t'); top.appendChild(el('b', null, s.name)); top.appendChild(el('span', 'dver', 'v' + s.version)); top.appendChild(el('span', 'dtag ' + st[1], st[0]));
      card.appendChild(top);
      card.appendChild(el('p', 'dmuted', s.pluginId + ' · ' + s.tag + ' · sent ' + new Date(s.createdAt).toLocaleDateString()));
      if (s.status === 'rejected' && s.note) card.appendChild(el('p', 'dreason', 'Reason: ' + s.note));
      if (s.status === 'pending' || s.status === 'approved') {
        var b = el('button', 'dbtn ghost', 'Withdraw'); b.type = 'button';
        b.addEventListener('click', function () { b.disabled = true; post('/api/dev/withdraw', { id: s.id }).then(function (x) { if (x.ok) load(); else { b.disabled = false; b.textContent = (x.j && x.j.error) || 'Could not withdraw'; } }); });
        card.appendChild(b);
      }
      subs.appendChild(card);
    });
  }
  function load() {
    return fetch('/api/dev/me', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (j) {
      stateBox.textContent = '';
      if (!j.configured) { stateBox.appendChild(el('p', 'dmuted', 'The Developer Centre is not open yet. Please check back soon.')); formBox.hidden = true; listBox.hidden = true; return; }
      if (!j.user) {
        stateBox.appendChild(el('h2', null, 'Sign in'));
        stateBox.appendChild(el('p', null, 'Use your GitHub account. We only read your public username. Nothing else is requested.'));
        var a = el('a', 'dbtn', 'Sign in with GitHub'); a.href = '/auth/github'; stateBox.appendChild(a);
        formBox.hidden = true; listBox.hidden = true; return;
      }
      var row = el('div', 'drow'); row.appendChild(el('p', null, 'Signed in as ' + j.user.login + (j.user.verified ? ' (verified developer)' : '')));
      var out = el('button', 'dbtn ghost', 'Sign out'); out.type = 'button';
      out.addEventListener('click', function () { post('/api/dev/logout').then(function () { load(); }); }); row.appendChild(out); stateBox.appendChild(row);
      formBox.hidden = false; listBox.hidden = false; drawSubs(j.submissions || []);
    }).catch(function () { stateBox.textContent = ''; stateBox.appendChild(el('p', 'dmuted', 'The Developer Centre cannot be loaded right now. Please try again in a moment.')); });
  }
  form.addEventListener('submit', function (ev) {
    ev.preventDefault(); say('');
    var body = { repo: document.getElementById('drepo').value, tag: document.getElementById('dtag').value, folder: document.getElementById('dfolder').value };
    if (!body.repo.trim() || !body.tag.trim()) return say('Fill in the repository address and the release tag.');
    go.disabled = true; go.textContent = 'Checking…';
    post('/api/dev/submit', body).then(function (x) {
      go.disabled = false; go.textContent = 'Send for review';
      if (!x.ok) return say((x.j && x.j.error) || 'Something went wrong.', x.j && x.j.problems);
      form.reset(); say('Sent. It now waits for review (we aim to answer within 14 days).'); msg.classList.add('ok'); load();
    }, function () { go.disabled = false; go.textContent = 'Send for review'; say('The site could not be reached. Please try again.'); });
  });
  load();
})();
