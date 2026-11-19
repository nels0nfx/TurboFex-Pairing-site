// Automatic test run for the owner's review page. It runs inside a hidden frame of the admin page (same origin) and uses the same sandbox
// and the same broker as the Playground: every command, event and schedule of a plugin is run once or twice with a pretend chat.
// A run FAILS when the plugin crashes, takes too long, or tries something its permissions do not allow. It does not replace reading the review.
(function () {
  'use strict';
  var TFXBuffer = globalThis.Buffer;
  // small synchronous SHA-256 (the browser's own one is asynchronous, the broker needs an answer right away)
  function sha256Hex(text) {
    var K = [], H = [], p = 2, j, i;
    for (; K.length < 64; p++) { for (j = 2; j * j <= p; j++) if (p % j === 0) break; if (j * j > p) { if (H.length < 8) H.push((Math.pow(p, 0.5) % 1) * 4294967296 | 0); K.push((Math.pow(p, 1 / 3) % 1) * 4294967296 | 0); } }
    var b = new TextEncoder().encode(text), l = b.length, m = new Uint8Array(((l + 9 + 63) >> 6) << 6); m.set(b); m[l] = 128;
    var dv = new DataView(m.buffer); dv.setUint32(m.length - 8, Math.floor(l * 8 / 4294967296)); dv.setUint32(m.length - 4, (l * 8) >>> 0);
    var w = new Array(64), rr = function (x, c) { return (x >>> c) | (x << (32 - c)); };
    for (var o = 0; o < m.length; o += 64) {
      for (i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (i = 16; i < 64; i++) { var s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      var a = H.slice();
      for (i = 0; i < 64; i++) { var S1 = rr(a[4], 6) ^ rr(a[4], 11) ^ rr(a[4], 25), ch = (a[4] & a[5]) ^ (~a[4] & a[6]), t1 = (a[7] + S1 + ch + K[i] + w[i]) | 0, S0 = rr(a[0], 2) ^ rr(a[0], 13) ^ rr(a[0], 22), mj = (a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]), t2 = (S0 + mj) | 0; a = [(t1 + t2) | 0, a[0], a[1], a[2], (a[3] + t1) | 0, a[4], a[5], a[6]]; }
      H = H.map(function (h, k) { return (h + a[k]) | 0; });
    }
    return H.map(function (h) { return ('00000000' + (h >>> 0).toString(16)).slice(-8); }).join('');
  }


  function runOne(m, source, item) {
    return new Promise(function (resolve) {
      var said = [], kind = item.kind, ctx, settings = {};
      (m.settings || []).forEach(function (s) { settings[s.key] = s.default; });
      var words = item.words || [];
      ctx = { args: kind === 'command' ? words : [], rest: kind === 'command' ? words.join(' ') : '', prefix: '.', chat: kind === 'schedule' ? null : { id: 'chat-1', isGroup: true, name: 'Test group' }, settings: settings, mentions: [], sender: kind === 'schedule' ? null : { id: 'person-1', name: 'Sam', isAdmin: !!item.admin, isOwner: false } };
      if (kind === 'command') { ctx.quoted = { text: 'a quoted message', sender: 'person-2', media: null }; ctx.hasMedia = null; }
      if (kind === 'event') { ctx.event = item.name; ctx.text = item.text || 'hello'; ctx.members = item.name === 'message' ? [] : ['person-2']; ctx.mentionsOwner = !!item.tagOwner; if (item.tagOwner) ctx.mentions = ['person-2']; }
      var storage = new Map();
      var env = {
        storage: storage, log: function (t) { said.push('log: ' + t); },
        isPublicHost: async function (h) { return (m.network && m.network.domains || []).indexOf(h) >= 0; },
        fetch: async function (url) { said.push('network (pretend): ' + url); return { status: 200, text: '{"pretend":"answer"}' }; },
        fetchBytes: async function (url) { said.push('network (pretend): ' + url); return { status: 200, bytes: TFXBuffer.from('test') }; },
        post: async function (url) { said.push('network POST (pretend): ' + url); return { status: 200, text: '{"pretend":"answer"}' }; },
        hash: function (algo, text) { if (algo !== 'sha256') throw new Error('only sha256 here'); return sha256Hex(text); },
        notifyOwner: async function (t) { said.push('message to the owner: ' + t); },
        toSticker: async function () { return TFXBuffer.from('UklGRgAAAABXRUJQ' + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'base64'); },
        toAudio: async function () { return TFXBuffer.from('ID3' + '\u0000'.repeat(40)); },
      };
      var broker = new TFXBroker.Broker({ manifest: m, grants: m.permissions.slice(), env: env });
      var st = broker.newCall(ctx, {
        send: async function (t) { said.push('bot says: ' + t); }, react: async function (e) { said.push('bot reacts: ' + e); },
        sendMedia: async function (x) { said.push('bot sends: ' + x.kind); }, manage: async function (a) { said.push('group: would ' + a); return a === 'invite' ? 'https://chat.whatsapp.com/PRETEND' : undefined; },
        quote: async function (t) { said.push('bot replies: ' + t); }, mention: async function (t) { said.push('bot says (mentioning): ' + t); },
        presence: async function (k) { said.push('bot shows: ' + k); }, poll: async function (q) { said.push('bot sends a poll: ' + q); },
        members: async function () { return [{ id: 'person-1', admin: true }, { id: 'person-2', admin: false }]; },
        dm: kind === 'command' ? async function (t) { said.push('private message: ' + t); } : undefined,
        download: kind === 'command' ? async function () { return { kind: 'image', buffer: TFXBuffer.from('test'), mimetype: 'image/png' }; } : undefined,
        groupInfo: { name: 'Test group', size: 12, admins: 2 },
      });
      st.pending = [];
      var w = new Worker('/playground-sandbox.js'), finished = false;
      var end = function (err) {
        if (finished) return; finished = true; clearTimeout(timer); w.terminate();
        Promise.allSettled(st.pending).then(function () {
          if (!err && broker.violations.length) err = 'tried something its permissions do not allow (' + broker.violations.filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + ')';
          resolve({ label: item.label, ok: !err, error: err || null, quiet: !err && kind === 'command' && !said.some(function (l) { return /^bot/.test(l); }), said: said.slice(0, 6) });
        });
      };
      var timer = setTimeout(function () { end('took too long (over 5 seconds)'); }, 5000);
      w.onerror = function () { end('the test sandbox could not start in this browser'); };
      w.onmessage = async function (ev) {
        var msg = ev.data;
        if (msg.t === 'ready') w.postMessage({ t: 'load', source: source });
        else if (msg.t === 'loaded') w.postMessage({ t: 'call', call: 1, kind: kind, name: item.name, ctx: JSON.stringify(ctx) });
        else if (msg.t === 'loadfail' || msg.t === 'bootfail') end(msg.error || 'the plugin could not be loaded');
        else if (msg.t === 'eff') st.pending.push(broker.handle(msg.name, msg.args, st).catch(function () { /* noted as a violation */ }));
        else if (msg.t === 'req') {
          var res; try { res = { t: 'res', id: msg.id, ok: true, value: await broker.handle(msg.name, msg.args, st) }; } catch (e) { res = { t: 'res', id: msg.id, ok: false, error: e.code || 'failed' }; }
          if (!finished) w.postMessage(res);
        } else if (msg.t === 'done') {
          if (msg.ok) end(null); else { var e = String(msg.error || ''); end(/interrupted/i.test(e) ? 'ran for too long (CPU limit)' : /out of memory/i.test(e) ? 'used too much memory' : e || 'failed'); }
        }
      };
    });
  }
  function plan(m) {
    var items = [];
    (m.commands || []).forEach(function (c) {
      var cn = typeof c === 'string' ? c : c && c.name; if (!cn) return;
      items.push({ kind: 'command', name: cn, words: [], admin: true, label: 'command .' + cn + ' (no words, as an admin)' });
      items.push({ kind: 'command', name: cn, words: ['hello', 'world'], admin: false, label: 'command .' + cn + ' hello world (as a member)' });
    });
    (m.events || []).forEach(function (e) {
      if (e === 'message') { items.push({ kind: 'event', name: e, text: 'hello everyone', label: 'event: a normal group message' }); items.push({ kind: 'event', name: e, text: '@owner are you there?', tagOwner: true, label: 'event: a message that tags the owner' }); }
      else items.push({ kind: 'event', name: e, label: 'event: ' + e });
    });
    (m.schedules || []).forEach(function (sc) { var id = typeof sc === 'string' ? sc : sc && sc.id; if (id) items.push({ kind: 'schedule', name: id, label: 'schedule: ' + id }); });
    return items;
  }
  async function runAll(manifestRaw, source, progress) {
    var chk = await fetch('/api/playground/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ manifest: manifestRaw, code: source }) });
    var cj = await chk.json().catch(function () { return {}; });
    if (!chk.ok || !cj.ok) return { error: cj.error || (cj.errors || []).join('; ') || 'the check could not be done' };
    var items = plan(cj.manifest), out = [];
    if (!items.length) return { results: [], note: 'This plugin has nothing to run (no commands, events or schedules).' };
    for (var i = 0; i < items.length; i++) { progress(i, items.length); out.push(await runOne(cj.manifest, source, items[i])); }
    return { results: out };
  }
  window.addEventListener('message', function (ev) {
    if (ev.origin !== location.origin || ev.source !== parent) return;
    var d = ev.data; if (!d || d.t !== 'run' || typeof d.manifest !== 'string' || typeof d.source !== 'string') return;
    runAll(d.manifest, d.source, function (i, n) { parent.postMessage({ t: 'progress', i: i, n: n }, location.origin); })
      .then(function (r) { parent.postMessage({ t: 'result', r: r }, location.origin); })
      .catch(function (e) { parent.postMessage({ t: 'result', r: { error: String(e && e.message || e) } }, location.origin); });
  });
  parent.postMessage({ t: 'ready' }, location.origin);
})();
