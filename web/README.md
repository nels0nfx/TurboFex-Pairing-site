# TurboFex new website (work in progress)

This folder is the new TurboFex website: React, TypeScript, Vite, Tailwind CSS, Framer Motion, Lucide icons, React Router and TanStack Query.

It runs next to the current website. Nothing on the current pages changes until the final switch. Until then the new site only lives at `/next/` (for example `https://your-site/next/`), and it is only available when a build exists.

Everything below works in Termux. No GitHub Actions, Codespaces or other service is needed.

## One-time setup (Termux)

```
cd ~/TurboFex-Pairing-site/web
npm install
```

The main site does not need this. A normal `npm install` in the main folder does not install the new site's packages.

## Check that everything works

```
cd ~/TurboFex-Pairing-site/web
npm run verify
```

This runs, one after another: type check, code check (lint), tests, build, and a smoke check that starts the real server and fetches the pages. It stops at the first problem. If the last line says `All smoke checks passed`, the whole chain passed.

You can also run the steps one by one:

| Command | What it does |
| --- | --- |
| `npm run typecheck` | checks the TypeScript |
| `npm run lint` | checks the code style |
| `npm test` | runs the tests |
| `npm run build` | makes the `dist` folder |
| `npm run smoke` | starts the server with `dist` and checks the pages |
| `npm run dev` | live preview while you edit (needs the main server running on port 3000) |

If your phone runs out of memory, run the steps one by one instead of `verify`.

## See it on the running site

1. Build: `cd ~/TurboFex-Pairing-site/web && npm run build`
2. Start the main site: `cd ~/TurboFex-Pairing-site && node server.js`
3. Open `http://127.0.0.1:3000/next/` in the phone browser.

## Upload to GitHub (no workflow needed)

```
cd ~/TurboFex-Pairing-site
git add -A
git commit -m "new website stage"
git push
```

`dist` and `node_modules` are not uploaded (they are in `.gitignore`).

## Putting it live on Render

Render only serves the new site when `web/dist` exists on the server. Right now Render's build command is only `npm install`, so the live site does not have a build and `/next/` stays off. That is on purpose. A later stage will change the build command, and it will be announced first.

## What is in the new site so far

- Stage 0: foundation and design kit (`/next/design`)
- Stage 1: landing page (`/next/`) and the pairing page (`/next/pair`)

The pairing page talks to the same server routes as the current pairing page, so the code, QR, session ID, Try again and refresh behaviour are the same. Pages that are not moved yet (marketplace, developers, docs, playground, community, about, terms, privacy) are normal links to the current pages.

Not carried over on purpose in this stage: the sound button and the floating status pill of the current pairing page.

## Switch it off quickly

If anything ever goes wrong with the new site, set the environment variable `NEXT_UI=off` and restart. `/next/` is gone and the current site is exactly as before. Deleting `web/dist` does the same.

## Where things are

- `src/pages` one file per page
- `src/components` the building blocks (buttons, tabs, code boxes, and so on)
- `src/lib` the API client, theme and helpers
- `src/test` the tests
- `scripts/smoke.mjs` the smoke check
