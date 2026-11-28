/* TurboFex Deploy Centre: what each host gets. ONE source for the page (deploy.js), the server (host names) and the tests. Pure functions.
   The launcher (index.js) can install and run the whole bot by itself, so most hosts need ONLY that file:
     file hosts   Hosting panel, Windows/Mac (download index.js), Termux, VPS (one command that fetches it)
     docker       three tiny files made in the browser: Dockerfile, docker-compose.yml and index.js (no bot ZIP)
     github hosts Render, Koyeb, other web hosts build from a GitHub repository, so they get the bot files (the only use of the ZIP)
   The session ID is asked for FIRST on every host that runs on index.js; GitHub hosts set the service up first and add the ID last (as one variable). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TFXDeploy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var GUIDES = 'https://github.com/nels0nfx/TurboFex#hosting-guides';
  var ZIP_PATH = '/download/TurboFex-hosting.zip';       // only the GitHub-repository hosts use it
  var LAUNCHER_PATH = '/download/index.js';              // the one-file launcher, placeholder still in it
  var PLACEHOLDER = "'__TFX_SESSION_ID__'";
  var GITHUB_NEW = 'https://github.com/new';
  var MASK = 'TFX-••••-••••-••••';
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var EXTRA_CHOICES = ['launcher', 'launcher-first'];

  // ---- session ID: same rules as the pairing site and the bot (12 letters/digits, no 0 O 1 I) ----
  function normalizeId(input) {
    var s = String(input == null ? '' : input).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.indexOf('TFX') === 0) s = s.slice(3);
    if (s.length !== 12) return null;
    for (var i = 0; i < 12; i++) if (ALPHABET.indexOf(s[i]) < 0) return null;
    return 'TFX-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
  }
  function sh(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }     // POSIX single quotes
  function ps(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }        // PowerShell single quotes
  var sessionLine = function (id) { return "printf 'SESSION_ID=%s\\n' " + sh(id) + ' > session_id.txt'; };
  var SED = function (id) { return 'sed -i "s/' + PLACEHOLDER + "/'" + id + '\'/" index.js'; };   // fills the launcher's one quoted placeholder
  function origin(ctx) { return String((ctx && ctx.origin) || '').replace(/\/+$/, ''); }
  function cmd(label, lines, note) { return { label: label, lines: lines, note: note || '' }; }

  // ---- the launcher: the ONLY change is the quoted placeholder, made in the visitor's browser ----
  function buildLauncher(template, sessionId) {
    var id = normalizeId(sessionId); if (!id) throw new Error('That is not a valid session ID.');
    var parts = String(template).split(PLACEHOLDER);
    if (parts.length !== 2) throw new Error('The launcher file is not in the expected format. Please tell the site owner.');
    return parts[0] + "'" + id + "'" + parts[1];
  }
  // ---- Docker: three tiny files. The launcher installs the bot inside the container; the login and data stay in the mounted folders ----
  var DOCKERFILE = '# TurboFex in Docker. Start it with:  docker compose up -d --build\nFROM node:22-slim\nWORKDIR /app\n# git: some WhatsApp library packages are fetched from GitHub. ffmpeg: stickers, audio and video commands.\nRUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg ca-certificates tzdata \\\n    && rm -rf /var/lib/apt/lists/*\nCOPY index.js ./\nENV NODE_ENV=production\nCMD ["node", "index.js"]\n';
  var COMPOSE = '# TurboFex. Start it with:  docker compose up -d --build\nservices:\n  turbofex:\n    build: .\n    container_name: turbofex\n    restart: unless-stopped\n    volumes:        # the login and the settings stay on your server when the container is rebuilt\n      - ./data:/app/data\n      - ./session:/app/session\n      - ./accounts:/app/accounts\n';
  function dockerFiles(template, sessionId) { return [{ name: 'Dockerfile', text: DOCKERFILE }, { name: 'docker-compose.yml', text: COMPOSE }, { name: 'index.js', text: buildLauncher(template, sessionId) }]; }

  var LOG_OK = 'The log says "Login restored from the session ID."';
  var ONLINE = 'Later it says "… is online as …". That means WhatsApp connected.';
  var PING = 'Send .ping to the bot from your own chat. A reply means it works.';
  var T = [ // the first words are the bot's own log messages
    { q: 'The pairing site does not know this session ID', a: 'It expired (5 minutes) or was already used. Pair again for a new one.' },
    { q: 'Could not reach the pairing site', a: 'The bot retries. The pairing site can take a minute to wake up. Check your host has internet.' },
    { q: 'The login could not be saved', a: 'The session folder is not writable. Check permissions or the disk path.' },
    { q: 'It asks for a session ID after every restart', a: 'The disk is wiped on restart. Use a persistent disk or volume.' }
  ];
  var CLOUD_T = T.concat([{ q: 'The service restarts or sleeps', a: 'Free plans sleep and wipe the disk. Use a paid plan with a disk.' }]);

  var H = [
    { id: 'termux', name: 'Termux', kind: 'file', blurb: 'Two commands on your phone.', verify: [LOG_OK, ONLINE, PING], trouble: T },
    { id: 'vps', name: 'VPS', kind: 'file', blurb: 'Two commands on your server.', verify: [LOG_OK, ONLINE, PING], trouble: T },
    { id: 'docker', name: 'Docker', kind: 'docker', blurb: 'Three small files and one command.', verify: [LOG_OK, ONLINE, PING], trouble: T },
    { id: 'panel', name: 'Hosting panel', kind: 'file', blurb: 'Download one file, upload it, start.', verify: [LOG_OK, ONLINE, PING], trouble: T },
    { id: 'render', name: 'Render', kind: 'github', blurb: 'Builds from your GitHub repository.', warn: 'The Free plan will not work: it sleeps and wipes its disk. Use a paid plan with a disk.', verify: [LOG_OK, ONLINE, PING], trouble: CLOUD_T },
    { id: 'koyeb', name: 'Koyeb', kind: 'github', blurb: 'Builds from your GitHub repository.', warn: 'The free instance cannot use Volumes and sleeps. Use a paid plan with a Volume.', verify: [LOG_OK, ONLINE, PING], trouble: CLOUD_T.concat([{ q: 'The service is unhealthy', a: 'Expose port 8000 as HTTP and set PORT to 8000.' }]) },
    { id: 'webhost', name: 'Other web host', kind: 'github', blurb: 'Railway, Heroku and similar. Builds from GitHub.', warn: 'A host that wipes its disk on restart loses the login. Use one with a persistent disk.', verify: [LOG_OK, ONLINE, PING], trouble: CLOUD_T },
    { id: 'desktop', name: 'Windows / Mac', kind: 'file', blurb: 'Download one file and run it.', verify: [LOG_OK, ONLINE, PING], trouble: T }
  ];
  var byId = {}; H.forEach(function (h) { byId[h.id] = h; });

  var NODE = {
    termux: ['pkg update -y && pkg install -y nodejs-lts git'],
    vps: ['sudo apt update && sudo apt install -y git curl', 'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -', 'sudo apt install -y nodejs', 'sudo npm install -g pm2']
  };
  var RUN = { termux: 'node index.js', vps: 'pm2 start index.js --name turbofex && pm2 save' };
  var RESTART = { termux: 'node index.js', vps: 'pm2 restart turbofex' };

  // plan(host, { origin }, sessionId, { installed, first }) -> { steps: [...] } or { needsId: true }
  //  step: { title, text, action?: 'launcher-id'|'launcher-noid'|'docker-zip'|'bot-zip'|'github'|'id', cmds?, vars?, file? }
  function plan(id, ctx, sessionId, o) {
    var h = byId[id]; if (!h) throw new Error('Unknown host');
    o = o || {}; var sid = null;
    if (sessionId) { sid = normalizeId(sessionId); if (!sid) throw new Error('That is not a valid session ID.'); }
    var url = origin(ctx) + LAUNCHER_PATH, dir = '~/turbofex', first = !!o.first, out = [];
    // the install command, split over short lines (a trailing "&& \" keeps it ONE command: it stops if any part fails)
    var installLine = function (parts) { return parts.map(function (p, i) { return p + (i < parts.length - 1 ? ' && \\' : ''); }).join('\n'); };
    if (h.kind === 'github') {
      var mount = id === 'render' ? '/var/data' : '/data', rows = [['SESSION_DIR', mount + '/session'], ['TURBOFEX_DATA', mount + '/data']].concat(id === 'koyeb' ? [['PORT', '8000']] : []);
      out.push({ title: 'Create a private GitHub repo', text: 'Your host builds from it.', action: 'github' });
      out.push({ title: 'Add the bot files', text: 'Unzip, then run this inside the folder with index.js.', action: 'bot-zip', cmds: [cmd('Upload to GitHub', ['cd TurboFex', 'git init -b main && git add -A && git commit -m "TurboFex"', 'git remote add origin https://github.com/YOUR-NAME/turbofex.git', 'git push -u origin main'])] });
      out.push({ title: 'Create the service', text: id === 'render' ? 'New, Web Service, your repo. Paid plan with a disk at ' + mount + '. Build: npm install. Start: npm start.' : id === 'koyeb' ? 'Create Service, Web Service, GitHub, your repo. Dockerfile builder, paid plan. Port 8000 (HTTP). Volume at ' + mount + '.' : 'Web service from your repo. Build: npm install. Start: npm start. Persistent volume at ' + mount + '.' });
      out.push({ title: 'Add variables', text: 'Not the session ID yet. Deploy and wait until it runs.', vars: rows });
      out.push({ title: 'Add your session ID', text: sid ? 'One more variable, then save. The service restarts.' : 'Last, once the service is running.', action: 'id', vars: sid ? [['SESSION_ID', sid]] : null });
      return { kind: 'github', steps: out };
    }
    if (!sid && !first) return { kind: h.kind, needsId: true, steps: [] };
    var launcherStep = function (withId) { return { title: withId ? 'Download index.js' : 'Download index.js (no session ID)', text: withId ? 'Your session ID is inside. Keep it private.' : 'It will say it has no session ID yet. That is expected.', action: withId ? 'launcher-id' : 'launcher-noid' }; };
    if (h.kind === 'docker') {
      if (first) return null;
      out.push({ title: 'Download the files', text: 'Dockerfile, compose file and index.js with your session ID.', action: 'docker-zip' });
      out.push({ title: 'Start it', text: 'Needs Docker Compose. Keep the data, session and accounts folders.', cmds: [cmd('Shell', ['unzip turbofex-docker.zip -d turbofex', 'cd turbofex && docker compose up -d --build', 'docker compose logs -f'])] });
      return { kind: 'docker', steps: out };
    }
    if (id === 'panel') {
      if (!first && o.installed) { out.push({ title: 'Upload session_id.txt', text: 'To the main folder. Replace the old one.', file: { name: 'session_id.txt', text: 'SESSION_ID=' + sid + '\n' } }); out.push({ title: 'Restart the server', text: 'Or set SESSION_ID in the panel Variables instead.', vars: [['SESSION_ID', sid]] }); return { kind: 'file', steps: out }; }
      out.push(launcherStep(!first)); out.push({ title: 'Upload and set up', text: 'Main folder. Node.js 18 or newer (20 is best). Startup file: index.js.' }); out.push({ title: 'Start the server', text: 'It installs TurboFex first, which takes a few minutes.' });
      return { kind: 'file', steps: out };
    }
    if (id === 'desktop') {
      var win = (o.os || 'windows') !== 'mac', term = win ? 'PowerShell' : 'Terminal';
      if (!first && o.installed) { out.push({ title: 'Add your session ID and start', text: 'In the TurboFex folder. Stop the bot first if it is running.', cmds: [cmd(term, [win ? 'Set-Content -Path session_id.txt -Value ' + ps('SESSION_ID=' + sid) + '; node index.js' : sessionLine(sid) + ' && node index.js'])] }); return { kind: 'file', steps: out }; }
      out.push({ title: 'Install Node.js and Git', text: 'Node.js 18+ (nodejs.org) and Git (git-scm.com). Skip if you have them.' }); out.push(launcherStep(!first)); out.push({ title: 'Run it', text: 'In an empty folder with index.js:', cmds: [cmd(term, ['node index.js'])] });
      return { kind: 'file', steps: out };
    }
    // termux / vps: one command each
    var label = id === 'vps' ? 'Server' : 'Termux', head = 'mkdir -p ' + dir + ' && cd ' + dir, get = 'curl -fL -o index.js ' + url;
    if (!first && o.installed) { out.push({ title: 'Add your session ID and restart', text: id === 'termux' ? 'Stop the bot first if it is running.' : '', cmds: [cmd(label, ['cd ' + dir + ' && ' + sessionLine(sid) + ' && ' + RESTART[id]])] }); return { kind: 'file', steps: out }; }
    out.push({ title: 'Get Node ready', text: 'Run this first.', cmds: [cmd(label, NODE[id])] });
    out.push({ title: first ? 'Install TurboFex' : 'Install TurboFex with your session ID', text: first ? 'It will say it has no session ID yet. That is expected.' : 'Takes a few minutes. Run it right away.', cmds: [cmd(label, [installLine([head, get].concat(first ? [] : [SED(sid)]).concat([RUN[id]]))])] });
    if (id === 'vps') out.push({ title: 'Start on boot (once)', text: 'pm2 prints a line starting with sudo. Run it.', cmds: [cmd('Server', ['pm2 startup'])] });
    if (id === 'termux') out.push({ title: 'Keep it running', text: 'Turn off battery optimisation for Termux.' });
    return { kind: 'file', steps: out };
  }
  return { GUIDES: GUIDES, ZIP_PATH: ZIP_PATH, LAUNCHER_PATH: LAUNCHER_PATH, PLACEHOLDER: PLACEHOLDER, GITHUB_NEW: GITHUB_NEW, MASK: MASK, EXTRA_CHOICES: EXTRA_CHOICES, hosts: H, byId: byId, ids: H.map(function (h) { return h.id; }), normalizeId: normalizeId, buildLauncher: buildLauncher, dockerFiles: dockerFiles, DOCKERFILE: DOCKERFILE, COMPOSE: COMPOSE, plan: plan, sh: sh, ps: ps };
});
