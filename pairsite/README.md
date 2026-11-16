# TurboFex Pair (the pairing site)

A small website where anyone links their WhatsApp number with a **pairing code** (no QR, no second device) and gets a short **session ID** like `TFX-K7M2-9QXA-4BNP`. They put that ID in their bot's settings and the bot logs in by itself.

## How it works
1. The visitor picks **Pairing code** (types their number, gets an 8-character code, enters it in WhatsApp > Linked devices > Link a device > Link with phone number instead) or **QR code** (scans a QR shown on the page; needs a second screen).
2. (Both ways end the same.)
3. When the link finishes, the site saves the login **encrypted** and shows the session ID.
4. The visitor sets only `SESSION_ID` on their bot. On start the bot downloads the login from the site and the site **deletes it** (one use, expires 5 minutes after it is made, so start the bot soon after linking).

## Run the site
Needs Node 20+ and a host that stays online (a panel, a VPS, Railway, Render...). It must be reachable over HTTPS because the bot sends the ID to it.

```
cd pairsite
npm install
node server.js        # PORT=3000 by default
```
Settings are in `.env.example` (all optional). Keep `data/secret.key` safe, or set `SITE_SECRET` yourself: without it saved sessions cannot be read. Set `TRUST_PROXY=1` when the site is behind a proxy.

## Use it from the bot
Before you share the bot, write your site's address once in `config.js` (`pairSiteUrl: 'https://your-site.onrender.com'`). Then users only set one thing on the bot (panel variable):
```
SESSION_ID=TFX-XXXX-XXXX-XXXX
```

## Plugins page
`/plugins` shows the approved TurboFex plugins. The list is read from the signed TurboFex-Registry on GitHub (see `registry.js`); a list with a wrong signature is never shown.

## Safety notes
- A session ID is the key to someone's WhatsApp. It is high-entropy, works once, expires, and the stored login is encrypted with a key made from the ID itself, so a copy of the site's disk is not enough to use it.
- Pairing attempts are rate limited per visitor (`PAIR_LIMIT`) and limited in total (`MAX_JOBS`).
- Run this site only for people who know what it does: the site briefly holds their login. Do not log request URLs on your host (the ID is in `/api/session/<id>`).

## Tests
`npm test` inside `pairsite/` (the WhatsApp part is replaced by a stand-in; the real WhatsApp exchange can only be tested live).

## Updating the site from Termux
```
termux-setup-storage                       # once, to reach your Downloads folder
cd ~/turbofex-pair                         # your cloned repo
unzip -o ~/storage/downloads/turbofex-pairsite.zip -d .
git add -A
git commit -m "Smoother interactions and sticky header"
git push
```
Render redeploys by itself after the push.


## Developer Centre (optional)
Developers sign in with GitHub at `/developers` and send plugins; you review them in the admin dashboard (Plugins). It turns on when GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and SITE_URL are set on Render. Approved plugins are collected by the phone command (`node tools/registry.js pull`) when REGISTRY_PULL_TOKEN is set. See TURBOFEX_AI_NOTES.md section 25.

## Admin dashboard (optional)
Open `/admin` on your site. It does not exist until you set `ADMIN_ACCOUNTS` (see `TURBOFEX_AI_NOTES.md`, section 17). Create an account with `node tools/admin-setup.js`, scan the QR in an authenticator app, paste the printed `ADMIN_ACCOUNTS=...` line into Render -> Environment, then redeploy.

## Permanent admin data (Supabase, optional)
Run `tools/supabase-setup.sql` once in Supabase's SQL Editor, then set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` on Render. Blocks, settings, announcements, the activity log and the audit log then survive restarts.
