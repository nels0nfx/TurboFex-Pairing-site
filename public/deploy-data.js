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

  var LOG_OK = 'The log shows 🔑 "Getting your login from the pairing site…" and then ✅ "Login restored from the session ID."';
  var ONLINE = 'A little later it shows a line saying the bot "is online as" your number. That line is the proof that WhatsApp connected.';
  var PING = 'In WhatsApp, send .ping to the bot number from your own chat. A reply means it is working.';
  var T = [ // the first words are the bot's own log messages
    { q: 'The pairing site does not know this session ID', a: 'The ID expired (5 minutes) or was already used by a bot. Pair again and use the NEW ID.' },
    { q: 'Could not reach the pairing site', a: 'The bot retries by itself. The pairing site can take about a minute to wake up. Check your host has internet access.' },
    { q: 'The login was downloaded but could not be saved', a: 'The session folder is not writable. Check folder permissions or the disk/volume path.' },
    { q: 'Disconnects in the last hour', a: 'A bad network, or a second copy of the bot using the same number. Make sure only one copy runs.' },
    { q: 'It asks for a new session ID after every restart', a: 'The disk is wiped on restart. Use a persistent disk or volume.' }
  ];
  var CLOUD_T = T.concat([{ q: 'The service restarts or sleeps', a: 'Free plans sleep and wipe their disk. Use a paid instance with a persistent disk or volume.' }]);

  var H = [
    { id: 'panel', name: 'Hosting panel', kind: 'file', blurb: 'Download one file, upload it to your panel and start.', verify: [LOG_OK, ONLINE, PING], trouble: T },
    { id: 'termux', name: 'Termux', kind: 'file', blurb: 'Two commands on your Android phone.', verify: [LOG_OK, ONLINE, PING], trouble: T },
    { id: 'vps', name: 'VPS', kind: 'file', blurb: 'Two commands on your server. pm2 keeps it running.', verify: [LOG_OK, ONLINE, PING, 'pm2 status shows turbofex as online.'], trouble: T },
    { id: 'desktop', name: 'Windows / Mac', kind: 'file', blurb: 'Download one file and run it with Node.js.', verify: [LOG_OK, ONLINE, PING], trouble: T },
    { id: 'docker', name: 'Docker', kind: 'docker', blurb: 'Three small files and one command.', verify: [LOG_OK, ONLINE, PING, 'docker compose ps shows the turbofex container as running.'], trouble: T },
    { id: 'render', name: 'Render', kind: 'github', blurb: 'Builds from your own GitHub repository. Needs a paid instance with a disk.', warn: 'Render\'s Free plan does not suit this bot: it spins down after 15 minutes without traffic and its disk is wiped on every restart or deploy, so the login is lost. Persistent disks need a paid instance. Check Render\'s current plans first.', verify: [LOG_OK, ONLINE, PING, 'The service URL shows {"status":"running"}. That only means the process is up; it does not prove WhatsApp connected.'], trouble: CLOUD_T },
    { id: 'koyeb', name: 'Koyeb', kind: 'github', blurb: 'Builds from your own GitHub repository. Needs a paid instance with a volume.', warn: 'Koyeb\'s free instance cannot use Volumes and scales to zero after 1 hour without traffic, so it does not suit this bot. Check Koyeb\'s current plans and which regions offer Volumes first.', verify: [LOG_OK, ONLINE, PING, 'The service URL shows {"status":"running"}. That only means the process is up; it does not prove WhatsApp connected.'], trouble: CLOUD_T.concat([{ q: 'The service is unhealthy', a: 'Check port 8000 is exposed as HTTP and the PORT variable is 8000.' }]) },
    { id: 'webhost', name: 'Other web host', kind: 'github', blurb: 'Railway, Heroku and similar: builds from a GitHub repository.', warn: 'Many web hosts wipe the disk on every restart and put free apps to sleep. If yours does, the bot loses its login every time.', verify: [LOG_OK, ONLINE, PING], trouble: CLOUD_T }
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
    var url = origin(ctx) + LAUNCHER_PATH, dir = '~/turbofex', fetchLine = 'mkdir -p ' + dir + ' && cd ' + dir + ' && curl -fL -o index.js ' + url;
    var out = [], first = !!o.first;
    if (h.kind === 'github') {
      var mount = id === 'render' ? '/var/data' : '/data', rows = [['SESSION_DIR', mount + '/session'], ['TURBOFEX_DATA', mount + '/data']].concat(id === 'koyeb' ? [['PORT', '8000']] : []);
      out.push({ title: 'Create a private GitHub repository', text: 'Your host builds from a GitHub repository, so you need one of your own. Keep it private.', action: 'github' });
      out.push({ title: 'Put the bot files in it', text: 'Download the bot files, unzip them and upload them with git (index.js must be at the top level). The ZIP has about 400 files, so the GitHub website may refuse to take them in one upload.', action: 'bot-zip', cmds: [cmd('Upload to GitHub', ['cd TurboFex', 'git init -b main && git add -A && git commit -m "TurboFex"', 'git remote add origin https://github.com/YOUR-NAME/turbofex.git', 'git push -u origin main'], 'Run it inside the unzipped folder that holds index.js. Replace YOUR-NAME.')] });
      if (id === 'render') { out.push({ title: 'Create the web service', text: 'In Render choose New, then Web Service, and pick your repository. Choose a paid instance type. Build command: npm install. Start command: npm start.' }); out.push({ title: 'Add a disk', text: 'Add a Disk to the service and set its mount path to ' + mount + '.' }); }
      else if (id === 'koyeb') { out.push({ title: 'Create the service', text: 'In Koyeb choose Create Service, then Web Service, then GitHub, and pick your repository. Use the Dockerfile builder and a paid instance type.' }); out.push({ title: 'Expose the port and add a volume', text: 'Under Exposed ports add port 8000, protocol HTTP, path /. Create a Volume and mount it at ' + mount + '.' }); }
      else { out.push({ title: 'Deploy it as a web service', text: 'Build command: npm install. Start command: npm start (a Procfile with web: npm start is included). Mount a persistent volume (for example at ' + mount + ').' }); }
      out.push({ title: 'Add these variables and deploy', text: 'Do not add the session ID yet. Wait until the service is running.', vars: rows });
      out.push({ title: 'Last: add your session ID', text: sid ? 'Add this ONE variable and save. The service restarts and the bot collects its login. After the first successful start the login is saved on the disk, so the ID is not needed again.' : 'When the service is running, add your session ID as one more variable.', action: 'id', vars: sid ? [['SESSION_ID', sid]] : null });
      return { kind: 'github', steps: out };
    }
    if (!sid && !first) return { kind: h.kind, needsId: true, steps: [] };
    var launcherStep = function (withId) { return { title: withId ? 'Download your index.js' : 'Download index.js (no session ID in it)', text: withId ? 'Your session ID is inside it. Keep it private and delete it from shared devices after use.' : 'It installs TurboFex and starts it. It will say it has no session ID yet. That is expected.', action: withId ? 'launcher-id' : 'launcher-noid' }; };
    if (h.kind === 'docker') {
      if (first) return null;
      out.push({ title: 'Download the Docker files', text: 'Three small files: Dockerfile, docker-compose.yml and index.js with your session ID inside. Keep them private.', action: 'docker-zip' });
      out.push({ title: 'Start it', text: 'Needs Docker with Docker Compose. The first start installs TurboFex inside the container, which takes a few minutes. The login and settings stay in the data, session and accounts folders next to the files: do not delete them.', cmds: [cmd('Shell', ['unzip turbofex-docker.zip -d turbofex', 'cd turbofex && docker compose up -d --build', 'docker compose logs -f'])] });
      return { kind: 'docker', steps: out };
    }
    if (id === 'panel') {
      if (!first && o.installed) { out.push({ title: 'Upload your session file', text: 'TurboFex is already installed on your panel. Upload this file to the main folder, replacing any session_id.txt.', file: { name: 'session_id.txt', text: 'SESSION_ID=' + sid + '\n' } }); out.push({ title: 'Restart the server', text: 'Or skip the file: set SESSION_ID on the panel\'s Variables page and restart.', vars: [['SESSION_ID', sid]] }); return { kind: 'file', steps: out }; }
      out.push(launcherStep(!first)); out.push({ title: 'Upload it to your panel', text: 'Put it in the main folder of your server.' }); out.push({ title: 'Set Node.js and the startup file', text: 'Choose Node.js 18 or newer (20 is best) and set the startup file to index.js.' }); out.push({ title: 'Start the server', text: 'It installs TurboFex first (a few minutes), links WhatsApp and starts.' });
      return { kind: 'file', steps: out };
    }
    if (id === 'desktop') {
      var win = (o.os || 'windows') !== 'mac', term = win ? 'PowerShell' : 'Terminal';
      if (!first && o.installed) { out.push({ title: 'Add your session ID and start', text: 'TurboFex is already installed. In the TurboFex folder run this. Stop the bot first if it is running (Ctrl+C).', cmds: [cmd(term, [win ? 'Set-Content -Path session_id.txt -Value ' + ps('SESSION_ID=' + sid) + '; node index.js' : sessionLine(sid) + ' && node index.js'])] }); return { kind: 'file', steps: out }; }
      out.push({ title: 'Install Node.js and Git', text: 'Node.js 18 or newer (LTS) from nodejs.org, and Git from git-scm.com. Skip this if you already have them.' }); out.push(launcherStep(!first)); out.push({ title: 'Run it', text: 'Put index.js in an empty folder, open a terminal ' + (win ? '(PowerShell) ' : '') + 'in it and run:', cmds: [cmd(term, ['node index.js'])] });
      return { kind: 'file', steps: out };
    }
    // termux / vps: one command each
    var label = id === 'vps' ? 'Server' : 'Termux';
    if (!first && o.installed) { out.push({ title: 'Add your session ID and restart', text: 'TurboFex is already installed. This writes your ID and restarts it.' + (id === 'termux' ? ' Stop the bot first if it is running (Ctrl+C).' : ''), cmds: [cmd(label, ['cd ' + dir + ' && ' + sessionLine(sid) + ' && ' + RESTART[id]])] }); return { kind: 'file', steps: out }; }
    out.push({ title: 'Get Node ready', text: 'Do this first. It needs no session ID.', cmds: [cmd(label, NODE[id])] });
    out.push({ title: first ? 'Install TurboFex' : 'Install TurboFex with your session ID', text: first ? 'Downloads the launcher, installs TurboFex and starts it. It will say it has no session ID yet. That is expected.' : 'Downloads the launcher, puts your session ID in it, installs TurboFex and starts it. It takes a few minutes, so run it right away.', cmds: [cmd(label, [fetchLine + (first ? '' : ' && ' + SED(sid)) + ' && ' + RUN[id]])] });
    if (id === 'vps') out.push({ title: 'Start on boot (once)', text: 'pm2 prints one more command that starts with sudo. Run that command too.', cmds: [cmd('Server', ['pm2 startup'])] });
    if (id === 'termux') out.push({ title: 'Keep it running', text: 'Android can stop Termux when the screen is off: switch off battery optimisation for Termux and run termux-wake-lock.' });
    return { kind: 'file', steps: out };
  }
  return { GUIDES: GUIDES, ZIP_PATH: ZIP_PATH, LAUNCHER_PATH: LAUNCHER_PATH, PLACEHOLDER: PLACEHOLDER, GITHUB_NEW: GITHUB_NEW, MASK: MASK, EXTRA_CHOICES: EXTRA_CHOICES, hosts: H, byId: byId, ids: H.map(function (h) { return h.id; }), normalizeId: normalizeId, buildLauncher: buildLauncher, dockerFiles: dockerFiles, DOCKERFILE: DOCKERFILE, COMPOSE: COMPOSE, plan: plan, sh: sh, ps: ps };
});
