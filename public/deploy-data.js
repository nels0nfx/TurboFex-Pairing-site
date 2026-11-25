/* TurboFex Deploy Centre: what to run on each host. ONE source for the page (deploy.js), the server (platform names) and the tests.
   Everything here comes from the hosting ZIP (README "Hosting guides", Dockerfile, docker-compose.yml, Procfile, ecosystem.config.js,
   hosting/turbofex.service, core/sessionid.js, core/hostport.js) and from each provider's own documentation (checked November 2026).
   {{ID}} is replaced by the real session ID only at the moment a person taps Copy; it is never written into the page text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TFXDeploy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var RELEASES = 'https://github.com/nels0nfx/TurboFex/releases/latest';
  var GUIDES = 'https://github.com/nels0nfx/TurboFex#hosting-guides';
  var ID = '{{ID}}';
  var FILE_UNIX = "printf 'SESSION_ID=%s\\n' '" + ID + "' > session_id.txt";
  var FILE_WIN = "Set-Content -Path session_id.txt -Value 'SESSION_ID=" + ID + "'";
  var ZIP = { label: 'Hosting ZIP (TurboFex-hosting-….zip)', href: RELEASES, note: 'Use the file from Releases, not the green Code button.' };
  var WHEN = 'Do this step last: a session ID works once and expires 5 minutes after it was made.';
  var LOG_OK = 'In the log you should see 🔑 "Getting your login from the pairing site…", then ✅ "Login restored from the session ID.", then a line saying the bot "is online as" your number.';
  var PING = 'In WhatsApp, send .ping to the bot number from your own chat. A reply proves the bot is connected.';
  var DISK_WARN = 'If the disk is wiped on a restart, the bot loses its login and needs a new session ID each time. Use a plan with a persistent disk or volume.';

  var T = [ // troubleshooting: the first words are the bot\'s real log messages (core/sessionid.js, whatsapp/connection.js)
    { q: 'The pairing site does not know this session ID', a: 'The ID expired (5 minutes) or was already used. Link again on the pairing page and use the NEW ID.' },
    { q: 'Could not reach the pairing site', a: 'The bot retries by itself. The pairing site can take about a minute to wake up. Check your host has internet access.' },
    { q: 'The session ID is not valid', a: 'It must look like TFX-XXXX-XXXX-XXXX. Copy it again; do not add spaces or quotes around it.' },
    { q: 'The login was downloaded but could not be saved', a: 'The session folder is not writable. Check the folder permissions or the disk/volume path.' },
    { q: 'Disconnects in the last hour', a: 'A bad network, or a second copy of the bot using the same number. Make sure only one copy runs.' },
    { q: 'The bot asks for a new session ID after every restart', a: 'The disk is wiped on restart. Use a persistent disk or volume (see the hosting requirements above).' }
  ];

  var P = [
    { id: 'termux', name: 'Termux', tag: 'Android phone', icon: 'i-bolt', blurb: 'Run the bot on an Android phone.',
      needs: ['Android phone', 'Termux from F-Droid (the Play Store version is old)', 'Node.js 20 or newer (installed by the commands)', 'About 1 GB of free space'],
      files: [ZIP],
      warn: 'Android can stop Termux when the screen is off. Step 6 explains how to keep it running.',
      steps: [
        { t: 'Prepare Termux', d: 'Update, then install Node.js, git, ffmpeg, unzip and nano.', cmds: [{ label: 'Termux', lines: ['pkg update && pkg upgrade', 'pkg install nodejs-lts git ffmpeg unzip nano', 'termux-setup-storage'] }], n: 'Tap Allow when Android asks for storage access.' },
        { t: 'Download the hosting ZIP', d: 'Save it in your phone\'s Downloads folder.', link: ZIP },
        { t: 'Unpack and install', d: 'This takes a few minutes.', cmds: [{ label: 'Termux', lines: ['unzip ~/storage/downloads/TurboFex-hosting-*.zip -d ~/TurboFex', 'cd ~/TurboFex', 'npm install'] }] },
        { t: 'Save your session ID', d: WHEN, cmds: [{ label: 'Termux', lines: [FILE_UNIX], session: true }], n: 'You can also run nano session_id.txt and paste it after SESSION_ID=.' },
        { t: 'Start the bot', cmds: [{ label: 'Termux', lines: ['npm start'] }] },
        { t: 'Keep it running', d: 'Run termux-wake-lock, switch off battery optimisation for Termux in Android settings, and start the bot inside tmux so it survives closing the app.', cmds: [{ label: 'Termux (optional)', lines: ['termux-wake-lock', 'pkg install tmux', 'tmux new -s bot', 'npm start'] }], n: 'Leave tmux with Ctrl+B then D. Or use pm2: npm install -g pm2, then pm2 start ecosystem.config.js.' }
      ],
      verify: [LOG_OK, PING], trouble: T },

    { id: 'vps', name: 'VPS', tag: 'Linux server', icon: 'i-db', blurb: 'A Linux server that stays on (Ubuntu or Debian).',
      needs: ['Ubuntu or Debian server with SSH access', 'Node.js 20 or newer (the commands install 22)', 'git, ffmpeg, unzip, curl', 'At least 1 GB RAM'],
      files: [ZIP],
      steps: [
        { t: 'Install the tools', cmds: [{ label: 'Server', lines: ['sudo apt update && sudo apt install -y git ffmpeg unzip curl', 'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -', 'sudo apt install -y nodejs', 'node -v'] }], n: 'node -v should print v20 or higher.' },
        { t: 'Upload the hosting ZIP to the server', d: 'Download it from Releases and upload it (for example with scp) into your home folder.', link: ZIP },
        { t: 'Unpack and install', cmds: [{ label: 'Server', lines: ['unzip TurboFex-hosting-*.zip -d ~/TurboFex && cd ~/TurboFex && npm install'] }] },
        { t: 'Save your session ID and test', d: WHEN, cmds: [{ label: 'Server', lines: [FILE_UNIX, 'npm start'], session: true }], n: 'When it shows the bot online, stop it with Ctrl+C. The login is now saved, so the ID is not needed again.' },
        { t: 'Keep it running (choose one)', d: 'pm2 is the quicker option.', cmds: [
          { label: 'pm2', lines: ['sudo npm install -g pm2', 'pm2 start ecosystem.config.js', 'pm2 save', 'pm2 startup'] },
          { label: 'systemd', lines: ['sed -i "s/YOUR_USER/$USER/g" hosting/turbofex.service', 'sudo cp hosting/turbofex.service /etc/systemd/system/turbofex.service', 'sudo systemctl daemon-reload && sudo systemctl enable --now turbofex'] }], n: 'With pm2, run the command that pm2 startup prints. The systemd lines assume the bot is in ~/TurboFex. Logs: pm2 logs turbofex, or journalctl -u turbofex -f.' }
      ],
      verify: [LOG_OK, PING, 'pm2 status shows turbofex as online, or systemctl status turbofex shows active (running).'], trouble: T },

    { id: 'docker', name: 'Docker', tag: 'Containers', icon: 'i-box', blurb: 'Docker Compose on any machine with Docker.',
      needs: ['Docker and Docker Compose', 'The unpacked hosting ZIP (it contains the Dockerfile and docker-compose.yml)', 'A folder that is kept between runs (the compose file mounts data, session and accounts)'],
      files: [ZIP],
      steps: [
        { t: 'Unpack the hosting ZIP', d: 'Open a terminal in the unpacked folder.', cmds: [{ label: 'Shell', lines: ['unzip TurboFex-hosting-*.zip -d TurboFex', 'cd TurboFex'] }] },
        { t: 'Create your settings file', d: WHEN, cmds: [{ label: 'Shell', lines: ['echo "SESSION_ID=' + ID + '" > .env'], session: true }], n: 'Optional extra lines in .env: TIMEZONE=Africa/Lagos and BOT_PREFIX=.' },
        { t: 'Build and start', cmds: [{ label: 'Shell', lines: ['docker compose up -d --build', 'docker compose logs -f'] }] },
        { t: 'Updates', d: 'The login and settings live in the data, session and accounts folders next to docker-compose.yml, so they survive a rebuild. Inside Docker the bot\'s self-update only lasts until the container is rebuilt: send .autoupdate off, and update by unpacking a newer ZIP and running docker compose up -d --build again.' }
      ],
      verify: [LOG_OK, PING, 'docker compose ps shows the turbofex container as running.'], trouble: T },

    { id: 'panel', name: 'Hosting panel', tag: 'Pterodactyl and similar', icon: 'i-sliders', blurb: 'A game or bot hosting panel with a Node.js option.',
      needs: ['A server with a Node.js 20 or newer egg', 'Enough disk for the bot and its modules', 'A plan that keeps its disk between restarts'],
      files: [ZIP],
      steps: [
        { t: 'Create the server', d: 'Choose a Node.js 20 or newer egg.' },
        { t: 'Upload and unzip', d: 'Upload the hosting ZIP in the file manager and unzip it so index.js is in the main folder (not inside another folder).', link: ZIP },
        { t: 'Set the startup', d: 'Startup command: npm start (or node index.js). Let the panel run npm install.' },
        { t: 'Give the bot its session ID', d: WHEN + ' Either set the variable below on the panel\'s Variables page, or open session_id.txt in the file manager, paste the ID after SESSION_ID= and save.', env: [{ k: 'SESSION_ID', v: ID, session: true }] },
        { t: 'Start the server', d: 'Watch the console for the log lines in the next section.' }
      ],
      verify: [LOG_OK, PING], trouble: T },

    { id: 'render', name: 'Render', tag: 'Cloud web service', icon: 'i-globe', blurb: 'A Render web service with a persistent disk.',
      needs: ['A GitHub account and a PRIVATE repository holding the unpacked ZIP', 'A paid Render instance with a persistent disk', 'Node.js 20 or newer (Render\'s default is fine)'],
      files: [ZIP],
      warn: 'Render\'s Free plan does not suit this bot: it spins down after 15 minutes without inbound traffic, and its disk is wiped on every restart or deploy, so the login is lost. Persistent disks need a paid instance. Check Render\'s current plans before you start.',
      steps: [
        { t: 'Put the bot in a private repository', d: 'Unpack the hosting ZIP and upload its files to a new PRIVATE GitHub repository so index.js is at the top level. Never use the green Code button on the TurboFex page. The ZIP can contain files whose names include "private": keep the repository private.', link: ZIP },
        { t: 'Create the web service', d: 'In Render choose New, then Web Service, and pick your repository. Choose a paid instance type (not Free).', env: [{ k: 'Build command', v: 'npm install', plain: true }, { k: 'Start command', v: 'npm start', plain: true }] },
        { t: 'Add a persistent disk', d: 'Add a Disk to the service and set its mount path to /var/data. One disk is enough: the next step points the bot\'s folders into it.' },
        { t: 'Set the variables', d: 'Add these in the Environment tab. Add SESSION_ID last: after the service is live and shows the bot waiting. ' + WHEN, env: [
          { k: 'SESSION_DIR', v: '/var/data/session', plain: true }, { k: 'TURBOFEX_DATA', v: '/var/data/data', plain: true },
          { k: 'TIMEZONE', v: 'Africa/Lagos', plain: true, optional: true }, { k: 'SESSION_ID', v: ID, session: true }], n: 'Saving a variable restarts the service. After the first successful start the saved login on the disk is used, so the ID is not needed again.' },
        { t: 'Check the logs', d: 'Open Logs in Render and look for the lines in the next section.' }
      ],
      verify: [LOG_OK, PING, 'The service URL shows {"status":"running"}. That only means the process is up; it does not prove WhatsApp is connected.'], trouble: T.concat([{ q: 'The service restarts or goes to sleep', a: 'You are probably on the Free plan. Use a paid instance with a disk.' }]) },

    { id: 'koyeb', name: 'Koyeb', tag: 'Cloud web service', icon: 'i-globe', blurb: 'A Koyeb web service with a volume.',
      needs: ['A GitHub account and a PRIVATE repository holding the unpacked ZIP', 'A paid Koyeb instance that supports Volumes', 'The Dockerfile that is already inside the ZIP (Node 22)'],
      files: [ZIP],
      warn: 'Koyeb\'s free instance cannot use Volumes and scales to zero after 1 hour without traffic, so it does not suit this bot. Check Koyeb\'s current plans and which regions offer Volumes before you start.',
      steps: [
        { t: 'Put the bot in a private repository', d: 'Unpack the hosting ZIP and upload its files to a new PRIVATE GitHub repository so index.js and the Dockerfile are at the top level.', link: ZIP },
        { t: 'Create the web service', d: 'In Koyeb choose Create Service, then Web Service, then GitHub, and pick your repository. Choose the Dockerfile builder and a paid instance type.' },
        { t: 'Expose the status port', d: 'Under Exposed ports add port 8000, protocol HTTP, path /. The bot answers a tiny status page on the port the host gives it, so the service counts as healthy.', env: [{ k: 'PORT', v: '8000', plain: true }] },
        { t: 'Attach a Volume', d: 'Create a Volume and mount it at /data.' },
        { t: 'Set the variables', d: 'Add SESSION_ID last. ' + WHEN, env: [{ k: 'SESSION_DIR', v: '/data/session', plain: true }, { k: 'TURBOFEX_DATA', v: '/data/data', plain: true }, { k: 'TIMEZONE', v: 'Africa/Lagos', plain: true, optional: true }, { k: 'SESSION_ID', v: ID, session: true }], n: 'Changing variables redeploys the service.' },
        { t: 'Check the logs', d: 'Open the service logs and look for the lines in the next section.' }
      ],
      verify: [LOG_OK, PING, 'The service URL shows {"status":"running"}. That only means the process is up; it does not prove WhatsApp is connected.'], trouble: T.concat([{ q: 'The service is unhealthy', a: 'Check that port 8000 is exposed as HTTP and that the PORT variable is 8000.' }]) },

    { id: 'webhost', name: 'Other web host', tag: 'Railway, Heroku and similar', icon: 'i-link', blurb: 'Any host that runs a web service from a repository.',
      needs: ['A repository holding the unpacked ZIP (private)', 'A plan with a persistent disk or volume that does not sleep', 'Node.js 20 or newer'],
      files: [ZIP],
      warn: 'Many web hosts wipe the disk on every restart or deploy and put free apps to sleep. If yours does, the bot loses its login each time. ' + DISK_WARN,
      steps: [
        { t: 'Deploy the repository', d: 'A Procfile (web: npm start) is included for hosts that use one.', env: [{ k: 'Build command', v: 'npm install', plain: true }, { k: 'Start command', v: 'npm start', plain: true }] },
        { t: 'Mount a volume', d: 'Mount a persistent volume (for example at /data) and point the bot at it with the first two variables below.' },
        { t: 'Set the variables', d: 'The host provides PORT; the bot then opens its tiny status page on it. Add SESSION_ID last. ' + WHEN, env: [{ k: 'SESSION_DIR', v: '/data/session', plain: true }, { k: 'TURBOFEX_DATA', v: '/data/data', plain: true }, { k: 'SESSION_ID', v: ID, session: true }] },
        { t: 'Check the logs', d: 'Look for the lines in the next section.' }
      ],
      verify: [LOG_OK, PING], trouble: T },

    { id: 'desktop', name: 'Windows / Mac', tag: 'Computer', icon: 'i-grid', blurb: 'Run it on a computer that stays on.',
      needs: ['Node.js 20 or newer (LTS) and Git', 'ffmpeg (only for sticker, audio and video commands)', 'A computer that stays on and online'],
      files: [ZIP],
      steps: [
        { t: 'Install Node.js and Git', d: 'Download the LTS installer from nodejs.org and Git from git-scm.com.' },
        { t: 'Unpack the hosting ZIP', d: 'Windows: right-click, Extract All. Mac: double-click. Then open a terminal inside the TurboFex folder (index.js must be in it).', link: ZIP },
        { t: 'Install', cmds: [{ label: 'Terminal', lines: ['npm install'] }] },
        { t: 'Save your session ID', d: WHEN, cmds: [{ label: 'Mac (Terminal)', lines: [FILE_UNIX], session: true }, { label: 'Windows (PowerShell)', lines: [FILE_WIN], session: true }], n: 'Or open session_id.txt in a text editor and paste the ID after SESSION_ID=.' },
        { t: 'Start the bot', cmds: [{ label: 'Terminal', lines: ['npm start'] }] }
      ],
      verify: [LOG_OK, PING], trouble: T }
  ];

  var byId = {}; P.forEach(function (p) { byId[p.id] = p; });
  var MASK = 'TFX-••••-••••-••••';
  var ID_RE = /^TFX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
  // fills {{ID}}; with no ID the text keeps a masked marker and must not be copied
  function fill(text, sessionId) { return String(text).split(ID).join(sessionId || MASK); }
  function usesSession(text) { return String(text).indexOf(ID) !== -1; }
  return { RELEASES: RELEASES, GUIDES: GUIDES, ID: ID, MASK: MASK, ID_RE: ID_RE, platforms: P, byId: byId, ids: P.map(function (p) { return p.id; }), fill: fill, usesSession: usesSession };
});
