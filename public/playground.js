// Plugin Playground: runs a plugin in the browser. The sandbox (QuickJS in WebAssembly) lives in a Web Worker; the REAL broker of the bot
// (playground-broker.js) decides what the plugin may do; what it "does" is only shown on this page. No network, no saving.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var EXAMPLES = {
    hello: { name: 'Hello (a command that answers)', manifest: { manifestVersion: 1, id: 'pg-hello', version: '1.0.0', apiVersion: 1, name: 'Playground Hello', description: 'Greets the person who uses it.', author: { name: 'You' }, permissions: ['chat.send'], commands: [{ name: 'pghello', who: 'everyone', description: 'Say hello' }] },
      code: "tfx.command('pghello', async (ctx) => {\n  const who = ctx.rest || ctx.sender.name;\n  await ctx.reply('Hello ' + who + '! 👋');\n});\n" },
    count: { name: 'Counter (saves a note)', manifest: { manifestVersion: 1, id: 'pg-counter', version: '1.0.0', apiVersion: 1, name: 'Playground Counter', description: 'Counts how many times it was used.', author: { name: 'You' }, permissions: ['chat.send', 'storage', 'chat.react'], commands: [{ name: 'pgcount', who: 'everyone', description: 'Count up' }] },
      code: "tfx.command('pgcount', async (ctx) => {\n  const n = Number((await tfx.storage.get('n')) || 0) + 1;\n  await tfx.storage.set('n', String(n));\n  await ctx.react('✅');\n  await ctx.reply('Used ' + n + ' time(s).');\n});\n" },
    group: { name: 'Group info (reads the group)', manifest: { manifestVersion: 1, id: 'pg-group', version: '1.0.0', apiVersion: 1, name: 'Playground Group', description: 'Tells how big the group is.', author: { name: 'You' }, permissions: ['chat.send', 'group.read'], commands: [{ name: 'pggroup', who: 'everyone', description: 'Group size' }] },
      code: "tfx.command('pggroup', async (ctx) => {\n  const g = await tfx.group.info();\n  await ctx.reply(g.name + ' has ' + g.size + ' members and ' + g.admins + ' admins.');\n});\n" },
    broken: { name: 'Mistake (uses a permission it did not ask for)', manifest: { manifestVersion: 1, id: 'pg-broken', version: '1.0.0', apiVersion: 1, name: 'Playground Broken', description: 'Shows what happens when a plugin breaks a rule.', author: { name: 'You' }, permissions: ['chat.send'], commands: [{ name: 'pgbroken', who: 'everyone', description: 'Try it' }] },
      code: "tfx.command('pgbroken', async (ctx) => {\n  await ctx.react('👍');   // chat.react is not in the manifest: the bot refuses it and counts a strike\n  await ctx.reply('The reaction above was refused, but this still runs.');\n});\n" },
  };
  var storage = new Map();
  var ex = $('pg-ex'); Object.keys(EXAMPLES).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = EXAMPLES[k].name; ex.appendChild(o); });
  function load(k) { $('pg-man').value = JSON.stringify(EXAMPLES[k].manifest, null, 2); $('pg-code').value = EXAMPLES[k].code; fillWhat(); }
  ex.addEventListener('change', function () { load(ex.value); });

  // what can be run, read from the manifest as it is typed
  function manifestNow() { try { var m = JSON.parse($('pg-man').value); return m && typeof m === 'object' ? m : null; } catch (e) { return null; } }
  function fillWhat() {
    var m = manifestNow() || {}, w = $('pg-what'), keep = w.value; w.textContent = '';
    var add = function (v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; w.appendChild(o); };
    (Array.isArray(m.commands) ? m.commands : []).forEach(function (c) { if (c && typeof c.name === 'string') add('command:' + c.name, 'command: ' + c.name); });
    (Array.isArray(m.events) ? m.events : []).forEach(function (e) { if (typeof e === 'string') add('event:' + e, 'event: ' + e); });
    (Array.isArray(m.schedules) ? m.schedules : []).forEach(function (s) { if (s && typeof s.id === 'string') add('schedule:' + s.id, 'schedule: ' + s.id); });
    if (!w.options.length) add('', '(nothing to run yet)');
    for (var i = 0; i < w.options.length; i++) if (w.options[i].value === keep) w.selectedIndex = i;
  }
  $('pg-man').addEventListener('input', fillWhat);
  $('pg-reset').addEventListener('click', function () { storage.clear(); $('pg-status').textContent = 'Saved notes forgotten.'; });

  var lines = [];
  var say = function (kind, text) { lines.push(kind + String(text).replace(/\n/g, '\n' + ' '.repeat(kind.length))); };
  var show = function () { $('pg-out').textContent = lines.join('\n'); };

  async function run() {
    var btn = $('pg-run'); btn.disabled = true; lines = []; $('pg-out').textContent = ''; $('pg-status').textContent = 'Checking the files…';
    try {
      var chk = await fetch('/api/playground/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ manifest: $('pg-man').value, code: $('pg-code').value }) });
      var cj = await chk.json().catch(function () { return {}; });
      if (!chk.ok) { $('pg-status').textContent = cj.error || 'The check could not be done. Try again in a minute.'; return; }
      if (!cj.ok) { say('⚠️ ', 'The files have problems:'); (cj.errors || []).forEach(function (e) { say('   - ', e); }); $('pg-status').textContent = ''; show(); return; }
      var m = cj.manifest; var what = $('pg-what').value.split(':'); var kind = what[0], name = what.slice(1).join(':');
      if (!kind) { $('pg-status').textContent = 'There is nothing to run.'; return; }
      say('✅ ', 'Files are fine: ' + m.name + ' ' + m.version + ' (asks for: ' + (m.permissions.join(', ') || 'nothing special') + ')');
      $('pg-status').textContent = 'Running…';
      await runInSandbox(m, $('pg-code').value, kind, name);
    } catch (e) { say('⚠️ ', 'Could not run: ' + (e && e.message || e)); }
    finally { show(); btn.disabled = false; }
  }

  function runInSandbox(m, source, kind, name) {
    return new Promise(function (resolve) {
      var who = $('pg-as').value, words = $('pg-args').value.trim().split(/\s+/).filter(Boolean);
      var settings = {}; (m.settings || []).forEach(function (s) { settings[s.key] = s.default; });
      var ctx = { args: kind === 'command' ? words : [], rest: kind === 'command' ? words.join(' ') : '', prefix: '.', chat: kind === 'schedule' ? null : { id: 'chat-1', isGroup: true, name: 'Test group' }, settings: settings, mentions: [], sender: kind === 'schedule' ? null : { id: 'person-1', name: 'Sam', isAdmin: who !== 'member', isOwner: who === 'owner' } };
      if (kind === 'event') { ctx.event = name; ctx.text = words.join(' ') || 'hello'; ctx.members = name === 'message' ? [] : ['person-2']; }
      var pretendPng = function () { return TFXBuffer.from('iVBORw0KGgo=', 'base64'); };
      var env = {
        storage: storage, log: function (t) { say('log: ', t); },
        isPublicHost: async function (h) { return (m.network && m.network.domains || []).indexOf(h) >= 0; },
        fetch: async function (url) { say('network (pretend): ', url); return { status: 200, text: '{"pretend":"answer"}' }; },
        fetchBytes: async function (url) { say('network (pretend, 4 bytes): ', url); return { status: 200, bytes: TFXBuffer.from('test') }; },
        notifyOwner: async function (t) { say('message to the owner: ', t); },
        toSticker: async function () { say('', 'picture to sticker (pretend)'); return TFXBuffer.from('UklGRgAAAABXRUJQ' + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'base64'); },
        toAudio: async function () { say('', 'audio to MP3 (pretend)'); return TFXBuffer.from('ID3' + '\u0000'.repeat(40)); },
      };
      var broker = new TFXBroker.Broker({ manifest: m, grants: m.permissions.slice(), env: env });
      var st = broker.newCall(ctx, {
        send: async function (t) { say('bot says: ', t); },
        react: async function (e) { say('bot reacts: ', e); },
        sendMedia: async function (x) { say('bot sends: ', x.kind + (x.fileName ? ' ' + x.fileName : '')); },
        manage: async function (a, w) { say('group: ', 'would ' + a + (w ? ' ' + w : '')); },
        groupInfo: { name: 'Test group', size: 12, admins: 2 },
      });
      st.pending = [];
      var w = new Worker('/playground-sandbox.js'), finished = false, loaded = false;
      var end = function (okMsg, err) {
        if (finished) return; finished = true; clearTimeout(timer); w.terminate();
        Promise.allSettled(st.pending).then(function () {
          if (!err && broker.violations.length) err = 'the bot refused something the plugin tried (' + broker.violations.filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + '). Is every permission it uses in the manifest?';
          if (err) { say('❌ ', 'problem: ' + err); $('pg-status').textContent = 'Something went wrong.'; }
          else { if (!lines.some(function (l) { return /^(bot|group|log)/.test(l); })) say('', '(it ran and sent nothing)'); say('✅ ', 'It ran without a problem. This does not replace the owner review.'); $('pg-status').textContent = 'Done.'; }
          resolve();
        });
      };
      var timer = setTimeout(function () { end(false, 'it took too long (over 5 seconds): the bot would stop it'); }, 5000);
      w.onerror = function () { end(false, 'the sandbox could not start in this browser'); };
      w.onmessage = async function (ev) {
        var msg = ev.data;
        if (msg.t === 'ready') w.postMessage({ t: 'load', source: source });
        else if (msg.t === 'loaded') { loaded = true; w.postMessage({ t: 'call', call: 1, kind: kind, name: name, ctx: JSON.stringify(ctx) }); }
        else if (msg.t === 'loadfail' || msg.t === 'bootfail') end(false, msg.error || 'the plugin could not be loaded');
        else if (msg.t === 'eff') { st.pending.push(broker.handle(msg.name, msg.args, st).catch(function () { /* the broker notes it as a violation */ })); }
        else if (msg.t === 'req') {
          var res; try { res = { t: 'res', id: msg.id, ok: true, value: await broker.handle(msg.name, msg.args, st) }; } catch (e) { res = { t: 'res', id: msg.id, ok: false, error: e.code || 'failed' }; }
          if (!finished) w.postMessage(res);
        } else if (msg.t === 'done') {
          if (msg.ok) end(true); else { var e = String(msg.error || ''); end(false, /interrupted/i.test(e) ? 'it ran for too long (CPU limit)' : /out of memory/i.test(e) ? 'it used too much memory' : e || 'the plugin failed'); }
        }
      };
    });
  }
  var TFXBuffer = globalThis.Buffer;
  $('pg-run').addEventListener('click', run);
  load('hello');
})();
