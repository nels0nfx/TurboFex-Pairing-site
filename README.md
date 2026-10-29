# TurboFex Pair (the pairing site)

A small website where anyone links their WhatsApp number with a **pairing code** (no QR, no second device) and gets a short **session ID** like `TFX-K7M2-9QXA-4BNP`.

That session ID is what your Turbo-X / TurboFex bot uses to pull the linked credentials.

## What the visitor does

1. Opens the site
2. Types their WhatsApp number (with country code)
3. Gets an 8-digit pairing code
4. Opens WhatsApp → Linked devices → Link with phone number → enters the code
5. The site shows a short session ID
6. They (or you) paste that session ID into the bot

## Run locally

```bash
cp .env.example .env
npm install
npm start
```

Open http://localhost:3000

## Deploy (Render free tier)

The `render.yaml` is ready. Connect the repo on Render and it will deploy.

Important: set `SITE_SECRET` in the Render environment (or let it auto-generate once and keep the value). Without a stable secret, saved sessions stop working after a restart.

## API the bot talks to

- `GET /health` – simple health check
- `POST /pair` – start a pairing job `{ "number": "2348012345678" }` → returns `{ "jobId", "code" }` or an error
- `GET /status/:jobId` – poll until linked or failed
- `GET /session/:id` – exchange a session ID for the encrypted credentials (one-time by default)

## Notes

- Pairing codes are rate-limited per visitor.
- Sessions expire (default 24 h).
- By default a session ID can only be fetched once.
- The site never stores the full WhatsApp account; only the temporary credentials the bot needs.

## Files

| File | Role |
|------|------|
| `server.js` | HTTP server, routes, rate limits |
| `engine.js` | Baileys pairing + session handling |
| `store.js` | Encrypted short-lived session store |
| `pairfix.js` | Workaround for the July 2026 companion_reg_refresh change |
| `qr.js` | SVG QR generator (fallback) |
| `public/` | Frontend |
