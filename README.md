# TurboFex Pair (the pairing site)

A small website where anyone links their WhatsApp number with a **pairing code** (no QR, no second device) and gets a short **session ID** like `TFX-K7M2-9QXA-4BNP`. They put that ID in their bot's settings and the bot logs in by itself.

## How it works
1. Visitor types their number on the site and gets an 8-character pairing code.
2. They enter it in WhatsApp > Linked devices > Link a device > Link with phone number instead.
3. When the link finishes, the site saves the login **encrypted** and shows the session ID.
4. The visitor sets only `SESSION_ID` on their bot. On start the bot downloads the login from the site and the site **deletes it** (one use, expires after 24 hours).

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

## Safety notes
- A session ID is the key to someone's WhatsApp. It is high-entropy, works once, expires, and the stored login is encrypted with a key made from the ID itself, so a copy of the site's disk is not enough to use it.
- Pairing attempts are rate limited per visitor (`PAIR_LIMIT`) and limited in total (`MAX_JOBS`).
- Run this site only for people who know what it does: the site briefly holds their login. Do not log request URLs on your host (the ID is in `/api/session/<id>`).

## Tests
`npm test` inside `pairsite/` (the WhatsApp part is replaced by a stand-in; the real WhatsApp exchange can only be tested live).
