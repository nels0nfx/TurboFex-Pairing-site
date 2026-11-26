/* TurboFex Deploy Centre v2: what to prepare and launch on each host, and the files/commands that are generated for it.
   ONE source for the page (deploy.js), the server (platform names) and the tests. Pure functions: the same code runs in the browser and in Node.
   Everything is built from the hosting ZIP (v1.8.4): session_id.txt (SESSION_ID=...), config.env (TIMEZONE, BOT_PREFIX), the Docker
   Compose file (reads ./.env for SESSION_ID, TIMEZONE, BOT_PREFIX; mounts data, session, accounts), Procfile, ecosystem.config.js and
   hosting/turbofex.service. The tests run these outputs against the real files from that ZIP.

   PREPARE never contains a session ID: installing takes longer than the 5 minutes a session ID lives.
   LAUNCH is the only part that holds the ID, and it only writes the ID and starts the already prepared bot. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TFXDeploy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var GUIDES = 'https://github.com/nels0nfx/TurboFex#hosting-guides';
  var ZIP_PATH = '/download/TurboFex-hosting.zip';
  var LAUNCHER_PATH = '/download/index.js';   // the one-file launcher, with the placeholder still in it
  var PLACEHOLDER = "'__TFX_SESSION_ID__'";
  var EXTRA_CHOICES = ['launcher', 'launcher-first'];   // counted like hosts: quick launcher, and the no-ID launcher for slow hosts
  var MASK = 'TFX-••••-••••-••••';
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  // ---- session ID: same rules as the pairing site and the bot (12 letters/digits, no 0 O 1 I) ----
  function normalizeId(input) {
    var s = String(input == null ? '' : input).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.indexOf('TFX') === 0) s = s.slice(3);
    if (s.length !== 12) return null;
    for (var i = 0; i < 12; i++) if (ALPHABET.indexOf(s[i]) < 0) return null;
    return 'TFX-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
  }
  // ---- optional settings: same rules as the bot (config.js validPrefix; a real IANA time zone) ----
  function validPrefix(p) { return typeof p === 'string' && p.length >= 1 && p.length <= 3 && !/\s/.test(p) && p.indexOf('/') < 0 && p.indexOf('\\') < 0 && !/[\r\n'"`$]/.test(p); }
  function validZone(z) { if (typeof z !== 'string' || !/^[A-Za-z0-9_+\-/]{1,64}$/.test(z)) return false; try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch (e) { return false; } }
  // ---- quoting ----
  function sh(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }     // POSIX single quotes
  function ps(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }        // PowerShell single quotes

  function zipUrl(ctx) { return String((ctx && ctx.origin) || '').replace(/\/+$/, '') + ZIP_PATH; }
  function settings(o) { o = o || {}; var r = []; if (o.tz) r.push(['TIMEZONE', o.tz]); if (o.prefix) r.push(['BOT_PREFIX', o.prefix]); return r; }
  function settingsText(o) { return settings(o).map(function (kv) { return kv[0] + '=' + kv[1]; }).join('\n'); }
  // one printf that writes KEY=value lines (values are quoted, so they can never break out of the command)
  function printfLines(pairs, file, append) {
    var fmt = pairs.map(function (kv) { return kv[0] + '=%s'; }).join('\\n') + '\\n';
    return "printf '" + fmt + "' " + pairs.map(function (kv) { return sh(kv[1]); }).join(' ') + ' ' + (append ? '>>' : '>') + ' ' + file;
  }
  var sessionLine = function (id) { return printfLines([['SESSION_ID', id]], 'session_id.txt'); };
  var CHECK_READY = 'cd ~/TurboFex && node -v && test -f index.js && test -d node_modules && echo "READY: TurboFex is prepared"';

  var LOG_OK = 'The log shows 🔑 "Getting your login from the pairing site…" and then ✅ "Login restored from the session ID."';
  var ONLINE = 'A little later it shows a line saying the bot "is online as" your number. That line is the proof that WhatsApp connected.';
  var PING = 'In WhatsApp, send .ping to the bot number from your own chat. A reply means it is working.';
  var T = [ // the first words are the bot's own log messages (core/sessionid.js, whatsapp/connection.js)
    { q: 'The pairing site does not know this session ID', a: 'The ID expired (5 minutes) or was already used by a bot. Pair again and use the NEW ID. Your preparation stays valid.' },
    { q: 'Could not reach the pairing site', a: 'The bot retries by itself. The pairing site can take about a minute to wake up. Check your host has internet access.' },
    { q: 'The session ID is not valid', a: 'It must look like TFX-XXXX-XXXX-XXXX. Generate the file again and do not edit it.' },
    { q: 'The login was downloaded but could not be saved', a: 'The session folder is not writable. Check folder permissions or the disk/volume path.' },
    { q: 'Disconnects in the last hour', a: 'A bad network, or a second copy of the bot using the same number. Make sure only one copy runs.' },
    { q: 'It asks for a new session ID after every restart', a: 'The disk is wiped on restart. Use a persistent disk or volume.' }
  ];
  var CLOUD_TROUBLE = T.concat([{ q: 'The service restarts or sleeps', a: 'Free plans sleep and wipe their disk. Use a paid instance with a persistent disk or volume.' }]);

  function f(name, text, mime) { return { name: name, text: text, mime: mime || 'text/plain;charset=utf-8' }; }
  function cmd(label, lines, note) { return { label: label, lines: lines, note: note || '' }; }
  var DOCKER_WARN = 'The saved login and settings live in the data, session and accounts folders next to docker-compose.yml. Do not delete them.';

  var P = [
    { id: 'termux', name: 'Termux', tag: 'Android phone', icon: 'i-bolt', blurb: 'Run the bot on an Android phone.',
      needs: ['An Android phone', 'Termux from F-Droid (the Play Store version is outdated)', 'About 1 GB of free space and a stable connection'],
      warn: 'Android can stop Termux when the screen is off. Switch off battery optimisation for Termux in Android settings.',
      options: [{ id: 'tmux', label: 'Keep the bot running when I close Termux', type: 'bool', def: true }],
      prepare: function (c) {
        var tmux = c.opts.tmux !== false, L = [
          'pkg update -y && pkg upgrade -y',
          'pkg install -y nodejs-lts git ffmpeg unzip curl' + (tmux ? ' tmux' : ''),
          'cd ~ && curl -fL -o TurboFex-hosting.zip ' + zipUrl(c),
          'unzip -o TurboFex-hosting.zip -d ~/TurboFex',
          'cd ~/TurboFex && npm install'];
        if (settings(c.opts).length) L.push('cd ~/TurboFex && ' + printfLines(settings(c.opts), 'config.env'));
        L.push('termux-wake-lock');
        return { intro: 'Run this once. It installs everything and downloads TurboFex, but does not start it. It takes a few minutes.', cmds: [cmd('Termux', L)], check: cmd('Check it is ready', [CHECK_READY], 'It should end with READY.'), files: [] };
      },
      launch: function (c, id) {
        var tmux = c.opts.tmux !== false;
        return { intro: 'One short command: it saves your session ID and starts the bot.', cmds: [cmd('Termux', ['cd ~/TurboFex && ' + sessionLine(id) + ' && ' + (tmux ? "tmux new -A -s bot 'npm start'" : 'npm start')])], files: [],
          start: (tmux ? ['The bot runs inside tmux. Leave it running with Ctrl+B then D. Come back with: tmux attach -t bot'] : ['Keep Termux open. It stops if Termux is closed.']) };
      },
      verify: [LOG_OK, ONLINE, PING], trouble: T },

    { id: 'vps', name: 'VPS', tag: 'Linux server', icon: 'i-db', blurb: 'An always-on Ubuntu or Debian server.',
      needs: ['Ubuntu or Debian server with SSH access', 'At least 1 GB RAM', 'A normal user with sudo (root works too)'],
      options: [{ id: 'manager', label: 'Keep it running with', type: 'choice', def: 'pm2', choices: [['pm2', 'pm2 (simplest)'], ['systemd', 'systemd']] }],
      prepare: function (c) {
        var pm2 = c.opts.manager !== 'systemd', L = [
          'sudo apt update && sudo apt install -y git ffmpeg unzip curl',
          'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -',
          'sudo apt install -y nodejs',
          'cd ~ && curl -fL -o TurboFex-hosting.zip ' + zipUrl(c),
          'unzip -o TurboFex-hosting.zip -d ~/TurboFex',
          'cd ~/TurboFex && npm install'];
        if (settings(c.opts).length) L.push('cd ~/TurboFex && ' + printfLines(settings(c.opts), 'config.env'));
        if (pm2) L.push('sudo npm install -g pm2');
        else L.push('cd ~/TurboFex && sed -i "s|/home/YOUR_USER|$HOME|g; s|YOUR_USER|$USER|g" hosting/turbofex.service', 'sudo cp ~/TurboFex/hosting/turbofex.service /etc/systemd/system/turbofex.service', 'sudo systemctl daemon-reload && sudo systemctl enable turbofex');
        var script = '#!/bin/bash\n# TurboFex: prepare this server (no session ID in this file)\nset -e\n' + L.join('\n') + '\n' + CHECK_READY + '\n';
        return { intro: 'Run this once over SSH. It installs everything and downloads TurboFex, but does not start it.', cmds: [cmd('Server', L)], check: cmd('Check it is ready', [CHECK_READY], 'It should end with READY.'),
          files: [f('turbofex-prepare.sh', script, 'text/x-shellscript;charset=utf-8')], after: pm2 ? [cmd('Start on boot (once)', ['pm2 startup'], 'pm2 prints one more command that starts with sudo. Run that command too.')] : [] };
      },
      launch: function (c, id) {
        var pm2 = c.opts.manager !== 'systemd', start = pm2 ? 'pm2 start ecosystem.config.js && pm2 save' : 'sudo systemctl start turbofex';
        var line = 'cd ~/TurboFex && ' + sessionLine(id) + ' && ' + start;
        return { intro: 'One short command: it saves your session ID and starts the bot.', cmds: [cmd('Server', [line])], files: [f('turbofex-launch.sh', '#!/bin/bash\n# TurboFex: save the session ID and start (contains your session ID: delete after use)\nset -e\n' + line + '\n', 'text/x-shellscript;charset=utf-8')],
          start: [pm2 ? 'Watch it with: pm2 logs turbofex' : 'Watch it with: journalctl -u turbofex -f'] };
      },
      verify: [LOG_OK, ONLINE, PING, 'pm2 status shows turbofex as online, or systemctl status turbofex shows active (running).'], trouble: T },

    { id: 'docker', name: 'Docker', tag: 'Containers', icon: 'i-box', blurb: 'Docker Compose on any machine with Docker.',
      needs: ['Docker with Docker Compose', 'A folder where TurboFex can keep its data between runs'],
      options: [],
      prepare: function (c) {
        return { intro: 'Run this once. It downloads TurboFex and builds the image, but does not start it.', cmds: [cmd('Shell', ['curl -fL -o TurboFex-hosting.zip ' + zipUrl(c), 'unzip -o TurboFex-hosting.zip -d TurboFex', 'cd TurboFex && docker compose build'])],
          check: cmd('Check it is ready', ['cd TurboFex && docker compose images'], 'It should list the turbofex image.'), files: [], warn: DOCKER_WARN };
      },
      launch: function (c, id) {
        var pairs = [['SESSION_ID', id]].concat(settings(c.opts));
        return { intro: 'Put this .env file next to docker-compose.yml, then start. The command does both for you.', cmds: [cmd('Shell', ['cd TurboFex && ' + printfLines(pairs, '.env') + ' && docker compose up -d && docker compose logs -f'])],
          files: [f('.env', pairs.map(function (kv) { return kv[0] + '=' + kv[1]; }).join('\n') + '\n')], start: [DOCKER_WARN, 'If your phone renames the downloaded .env file, use the command above instead.'] };
      },
      verify: [LOG_OK, ONLINE, PING, 'docker compose ps shows the turbofex container as running.'], trouble: T },

    { id: 'panel', name: 'Hosting panel', tag: 'Pterodactyl and similar', icon: 'i-sliders', blurb: 'A bot hosting panel with a Node.js option.',
      needs: ['A server with a Node.js 20 or newer option', 'Enough disk for the bot and its modules', 'A plan that keeps its disk between restarts'],
      options: [],
      prepare: function (c) {
        var cfg = settings(c.opts).length;
        return { intro: 'Get the bot onto the panel without a session ID:', steps: [
          { t: 'Download the hosting ZIP below and upload it in the panel\'s file manager.', zip: true },
          { t: 'Unzip it so index.js is in the main folder (not inside another folder).' },
          { t: 'Set the startup command to: npm start' },
          { t: 'Start the server once so the panel installs the packages. The bot will start without a login and say it needs a session ID. That is expected. Then stop the server.' }],
          files: cfg ? [f('config.env', settingsText(c.opts) + '\n')] : [], filesNote: cfg ? 'Upload this config.env to the main folder too.' : '' };
      },
      launch: function (c, id) {
        return { intro: 'Upload this one file to the main folder (next to index.js), replacing any session_id.txt, then start the server.', cmds: [], files: [f('session_id.txt', 'SESSION_ID=' + id + '\n')],
          alt: 'Or skip the file: in the panel\'s Variables page set SESSION_ID to your ID, then start the server.', vars: [['SESSION_ID', id]], start: [] };
      },
      verify: [LOG_OK, ONLINE, PING], trouble: T },

    { id: 'render', name: 'Render', tag: 'Cloud web service', icon: 'i-globe', blurb: 'A Render web service with a persistent disk.',
      needs: ['A GitHub account and a PRIVATE repository for your copy of the bot', 'A paid Render instance with a persistent disk', 'Git on a computer or phone to upload the files'],
      warn: 'Render\'s Free plan does not suit this bot: it spins down after 15 minutes without traffic and its disk is wiped on every restart or deploy, so the login is lost. Persistent disks need a paid instance. Check Render\'s current plans first.',
      options: [],
      prepare: function (c) { return cloudPrepare(c, 'render'); },
      launch: function (c, id) { return cloudLaunch(id, 'Render', 'Environment'); },
      verify: [LOG_OK, ONLINE, PING, 'The service URL shows {"status":"running"}. That only means the process is up; it does not prove WhatsApp connected.'], trouble: CLOUD_TROUBLE },

    { id: 'koyeb', name: 'Koyeb', tag: 'Cloud web service', icon: 'i-globe', blurb: 'A Koyeb web service with a volume.',
      needs: ['A GitHub account and a PRIVATE repository for your copy of the bot', 'A paid Koyeb instance that supports Volumes', 'Git on a computer or phone to upload the files'],
      warn: 'Koyeb\'s free instance cannot use Volumes and scales to zero after 1 hour without traffic, so it does not suit this bot. Check Koyeb\'s current plans and which regions offer Volumes first.',
      options: [],
      prepare: function (c) { return cloudPrepare(c, 'koyeb'); },
      launch: function (c, id) { return cloudLaunch(id, 'Koyeb', 'Environment variables'); },
      verify: [LOG_OK, ONLINE, PING, 'The service URL shows {"status":"running"}. That only means the process is up; it does not prove WhatsApp connected.'], trouble: CLOUD_TROUBLE.concat([{ q: 'The service is unhealthy', a: 'Check port 8000 is exposed as HTTP and the PORT variable is 8000.' }]) },

    { id: 'webhost', name: 'Other web host', tag: 'Railway, Heroku and similar', icon: 'i-link', blurb: 'Any host that runs a web service from a repository.',
      needs: ['A private repository for your copy of the bot', 'A plan with a persistent volume that does not sleep', 'Node.js 20 or newer'],
      warn: 'Many web hosts wipe the disk on every restart and put free apps to sleep. If yours does, the bot loses its login every time.',
      options: [],
      prepare: function (c) { return cloudPrepare(c, 'webhost'); },
      launch: function (c, id) { return cloudLaunch(id, 'your host', 'variables'); },
      verify: [LOG_OK, ONLINE, PING], trouble: CLOUD_TROUBLE },

    { id: 'desktop', name: 'Windows / Mac', tag: 'Computer', icon: 'i-grid', blurb: 'Run it on a computer that stays on.',
      needs: ['Node.js 20 or newer (LTS) and Git', 'ffmpeg (only for sticker, audio and video commands)', 'A computer that stays on and online'],
      options: [{ id: 'os', label: 'My computer is', type: 'choice', def: 'windows', choices: [['windows', 'Windows'], ['mac', 'Mac']] }],
      prepare: function (c) {
        var win = c.opts.os !== 'mac', cfg = settings(c.opts);
        return { intro: 'Get the bot ready without a session ID:', steps: [
          { t: 'Install Node.js (LTS) from nodejs.org and Git from git-scm.com.' },
          { t: 'Download the hosting ZIP below and extract it (' + (win ? 'right-click, Extract All' : 'double-click it') + ').', zip: true },
          { t: 'Open a terminal ' + (win ? '(PowerShell) ' : '') + 'inside the TurboFex folder (index.js must be in it) and run the command below.' }],
          cmds: [cmd(win ? 'PowerShell' : 'Terminal', ['npm install'].concat(cfg.length ? [win ? 'Set-Content -Path config.env -Value ' + ps(settingsText(c.opts)) : printfLines(cfg, 'config.env')] : []))],
          check: cmd('Check it is ready', [win ? 'node -v; Test-Path index.js, node_modules' : 'node -v && test -f index.js && test -d node_modules && echo READY'], win ? 'Both Test-Path lines should say True.' : 'It should end with READY.'), files: [] };
      },
      launch: function (c, id) {
        var win = c.opts.os !== 'mac';
        return { intro: 'In the TurboFex folder run this one command: it saves your session ID and starts the bot.', cmds: [cmd(win ? 'PowerShell' : 'Terminal', [win ? 'Set-Content -Path session_id.txt -Value ' + ps('SESSION_ID=' + id) + '; npm start' : sessionLine(id) + ' && npm start'])],
          files: [f('session_id.txt', 'SESSION_ID=' + id + '\n')], alt: 'Or put the downloaded session_id.txt in the TurboFex folder and run: npm start', start: ['Keep the window open. The bot stops when it is closed.'] };
      },
      verify: [LOG_OK, ONLINE, PING], trouble: T }
  ];

  // cloud hosts: the service must exist and be running BEFORE the ID is added; the ID is the only variable added at launch
  function cloudPrepare(c, id) {
    var koyeb = id === 'koyeb', render = id === 'render', mount = render ? '/var/data' : '/data', cfg = settings(c.opts);
    var rows = [['SESSION_DIR', mount + '/session'], ['TURBOFEX_DATA', mount + '/data']].concat(koyeb ? [['PORT', '8000']] : []).concat(cfg);
    var steps = [
      { t: 'Download the hosting ZIP below and unzip it.', zip: true },
      { t: 'Put the files in a new PRIVATE GitHub repository (index.js at the top level) with the commands below. The ZIP has about 400 files, so the GitHub website may refuse to take them in one upload: use git.' }];
    if (render) steps.push({ t: 'In Render choose New, then Web Service, and pick your repository. Choose a paid instance type. Build command: npm install. Start command: npm start.' }, { t: 'Add a Disk to the service and set its mount path to ' + mount + '.' });
    else if (koyeb) steps.push({ t: 'In Koyeb choose Create Service, then Web Service, then GitHub, and pick your repository. Use the Dockerfile builder and a paid instance type.' }, { t: 'Under Exposed ports add port 8000, protocol HTTP, path /.' }, { t: 'Create a Volume and mount it at ' + mount + '.' });
    else steps.push({ t: 'Deploy the repository as a web service. Build command: npm install. Start command: npm start (a Procfile with web: npm start is included).' }, { t: 'Mount a persistent volume (for example at ' + mount + ').' });
    steps.push({ t: 'Add these variables (not the session ID yet), deploy, and wait until the service is running.' });
    return { intro: 'Set up the service first. Do not add the session ID yet.', steps: steps,
      cmds: [cmd('Upload to GitHub', ['cd TurboFex', 'git init -b main && git add -A && git commit -m "TurboFex"', 'git remote add origin https://github.com/YOUR-NAME/turbofex.git', 'git push -u origin main'], 'Run it inside the unzipped folder that holds index.js. Replace YOUR-NAME and use a private repository.')],
      vars: rows, files: [f('turbofex-variables.env', rows.map(function (kv) { return kv[0] + '=' + kv[1]; }).join('\n') + '\n')], filesNote: 'These variables hold no session ID.' };
  }
  function cloudLaunch(id, name, where) {
    return { intro: 'Add ONE variable in ' + name + ' (' + where + '), then save. The service restarts and the bot collects its login.', cmds: [], files: [], vars: [['SESSION_ID', id]],
      start: ['Saving a variable restarts the service. After the first successful start the login is saved on the disk, so the ID is not needed again.'] };
  }

  // ---- the one-file launcher: the ONLY change is the quoted placeholder, and it happens in the visitor's browser ----
  function buildLauncher(template, sessionId) {
    var id = normalizeId(sessionId); if (!id) throw new Error('That is not a valid session ID.');
    var parts = String(template).split(PLACEHOLDER);
    if (parts.length !== 2) throw new Error('The launcher file is not in the expected format. Please tell the site owner.');
    return parts[0] + "'" + id + "'" + parts[1];
  }
  var PM2 = [
    cmd('Keep it running with pm2', ['npm install -g pm2', 'pm2 start index.js --name turbofex && pm2 save', 'pm2 logs turbofex'], 'Run these in the folder that holds index.js. pm2 startup makes it start on boot. The first start installs the bot, which takes a few minutes: watch it with pm2 logs.'),
  ];
  var RUN = [
    { id: 'panel', name: 'Hosting panel', text: 'Upload index.js to the main folder, use Node.js 18 or newer (20 is best), set the startup file to index.js, and start the server.' },
    { id: 'vps', name: 'VPS or computer', text: 'Put index.js in an empty folder, then run it with pm2 (below) or with: node index.js' },
    { id: 'termux', name: 'Termux', text: 'Run: pkg install -y nodejs-lts git. Put index.js in an empty folder (for example mkdir ~/turbofex), cd into it and run: node index.js' }
  ];
  var byId = {}; P.forEach(function (p) { byId[p.id] = p; });
  function defaults(p) { var o = {}; (p.options || []).forEach(function (x) { o[x.id] = x.def; }); return o; }
  // the two generators the page and the tests call
  function prepare(platformId, ctx) { var p = byId[platformId]; if (!p) throw new Error('Unknown platform'); return p.prepare({ origin: ctx.origin, opts: Object.assign(defaults(p), ctx.opts || {}) }); }
  function launch(platformId, ctx, sessionId) {
    var p = byId[platformId]; if (!p) throw new Error('Unknown platform');
    var id = normalizeId(sessionId); if (!id) throw new Error('That is not a valid session ID.');
    return p.launch({ origin: ctx.origin, opts: Object.assign(defaults(p), ctx.opts || {}) }, id);
  }
  return { LAUNCHER_PATH: LAUNCHER_PATH, PLACEHOLDER: PLACEHOLDER, EXTRA_CHOICES: EXTRA_CHOICES, buildLauncher: buildLauncher, PM2: PM2, RUN: RUN, GUIDES: GUIDES, ZIP_PATH: ZIP_PATH, MASK: MASK, platforms: P, byId: byId, ids: P.map(function (p) { return p.id; }), normalizeId: normalizeId, validPrefix: validPrefix, validZone: validZone, sh: sh, ps: ps, zipUrl: zipUrl, prepare: prepare, launch: launch, defaults: defaults };
});
