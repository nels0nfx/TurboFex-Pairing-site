# TurboFex: notes for any AI helping the owner

**Read this whole file first.** The owner sends it to every new AI so nobody has to ask the same questions again.
**Your duty:** when the owner states a NEW preference, command or fact, add it to this file (keep the same layout), bump the "Last updated" line, and **keep it inside the site project and include it in the zip** (and mention in your reply what you added).

Last updated: 2026-11-01 (pair site v2.9.1)
Where this file lives: inside the pairing site project (the repo root of `nels0nfx/TurboFex-Pairing-site`, next to `server.js`). It is NOT in `public/`, so visitors cannot open it. Keep it inside the site zip every time, so it always travels with the project.

## v3.17.0/3.17.1 - Logo, spinning cube, footer only on landing
- Logo = owner's chrome "TF" picture, now real transparent PNGs: public/logo-light.png and public/logo-dark.png (swapped by theme). Do NOT use mix-blend-mode on them (it showed a white box inside the header, which has a backdrop blur). The shine is a ::after masked with the logo picture. Markup is the .mark span in partials/head2.html and foot2.html.
- iPhone top bar: iOS reads it when the page opens, so tf2.js reloads once after the toggle on iOS (v3.17.2); tf2-theme.js also sets meta color-scheme to the chosen mode. Owner tests this on a real iPhone; if it is still wrong, ask what he sees.
- The top-bar colour: tf2-theme.js and tf2.js REPLACE the theme-color meta element (editing it is ignored by some phones).
- Footer (foot2) is only on new-home.html. Other new pages and pair.html load /tf2.js directly; pair.html keeps a hidden #yr because app.js needs it.
- Cube turns with @keyframes tfspin (off for reduced motion); light look is in tf2.css.

## v3.16.0 - Dark/light switch, colourful landing icons, Bot/Community/Status pages removed (new site)
- Theme: html[data-theme="light"|"dark"], set early by public/tf2-theme.js (in every new page head), saved in localStorage "tfx-theme", default dark. Button #ttheme is in partials/head2.html, wired in tf2.js. Light colours are the block at the end of tf2.css; all white overlays use rgb(var(--w) / x), so keep using that instead of rgba(255,255,255,x).
- Removed from the NEW site only: /new/bot, /new/community, /new/status (files and links). The old live site was not touched. The footer "Server online" light (sitestatus) stays.
- Landing icon colours: .sky .pink .cyan .fuc .t-ok .t-warn on .ico.

## v3.15.0 - Pair page LIVE + Plugins page new look (preview)
- /pair now serves public/pair.html (the redesigned page, was new-pair.html). The old page is public/index.html at /pair-classic (rollback: point PAGES['/pair'] back to 'index.html' in server.js). The live pair page header/footer link to /new/* pages for now.
- Plugins redesign is a PREVIEW at /new/plugins: public/new-plugins.html + tf2-plugins.js (forked from plugins.js, which is still used by the live /plugins) + tf2-store.css (loaded after tf2-plugins.css, which still styles the rating form). Do not switch live /plugins without the owner's approval.
- Owner wants: a page that clearly looks like what it is (a real pair page, a real plugin store), not the old layout re-coloured, and few words.

## v3.14.1 - Pairing page rebuilt (PREVIEW at /new/pair, live /pair untouched)
- Only public/new-pair.html and public/tf2-pair.css changed (redesign block at the end of the css). app.js/pair.js/server.js untouched; every id app.js needs is still on the page (test checks this).
- Owner rejected v3.14.0 as "just the old layout". v3.14.1 layout: title + status chips, one narrow panel (animated phone-to-TurboFex link drawing driven by data-step, two method tiles, form or step), 3 trust points, 3 help questions, small footer ("foot min"). Keep words few: owner wants less text.
- Rollback: restore the v3.13.0 ZIP. Do not switch live /pair without the owner's approval.

## 1. Who the owner is and how to talk to them
- Developer of **TurboFex**, a WhatsApp group-management bot (Node.js, Baileys 7.0.0-rc14) used by other people.
- Works **from a phone with Termux**. Hosts the bot on a **Spaceify panel**. Not a beginner but wants **plain, non-technical explanations**. No jargon, short sentences.
- Wants **exactly what was asked**. No unrequested changes, no random redesigns. Do not touch the bot when the task is about the site (and the other way round) unless asked.
- If something is unclear and expensive to redo, ask ONE short question; otherwise just do it.
- Be honest about what could not be tested (for example real iPhone Safari, real WhatsApp linking, WhatsApp buttons). Never claim "tested" for things only checked in a desktop browser.
- Deliver work as **ready-to-use ZIPs**, with **push instructions** every time (see section 4).
- Every zip must have a **higher version number in its file name** than the last one, and the reply must say: **delete the older zips from Downloads** so the wrong one is not pushed.
- Put changelog lines at the TOP of `changelog.txt`, under the heading `CHANGED IN THE NEXT VERSION`, as `- NEW (...)`, `- FIXED (...)`, `- CHANGED (...)` bullets. (Never append at the bottom.)
- Long unbroken text (codes, links, IDs) must wrap inside its card on every page; a global rule in `tfx.css` and `admin3.css` does this (site v3.0.3). Never let a page scroll sideways.
- The footer (links, community, legal) appears ONLY on the landing page (`home.html`). Do not add it back to other pages; Terms and Privacy stay in the top menu. (2026-11-16)
- Plugin review (2026-11-17): the owner is not a coder. The review page has a 5-step checklist that locks Approve (also enforced in admin.js), an automatic test run (public/smoketest.html + smoketest.js, runs in a hidden same-origin frame with the wasm CSP) and an overlap warning. A withdrawn plugin is removed by bots within about 10 minutes. Rules for developers are at /rules.
- Use the owner's own words for things ("session ID", "pairing code", "the island").

## 2. The projects
### TurboFex Pair website (the main thing right now)
- Live: https://turbofex-pair.onrender.com (Render FREE tier: sleeps when idle; the disk is wiped on every redeploy, which is fine because session IDs only live 5 minutes).
- GitHub repo: `nels0nfx/TurboFex-Pairing-site`. Local clone on the owner's phone: `~/TurboFex-Pairing-site`.
- What it does: people link WhatsApp by **pairing code or QR**, get a **session ID** (`TFX-XXXX-XXXX-XXXX`) shown on the page and also sent to their WhatsApp. The bot only needs `SESSION_ID`.
- Stack: plain Node `http` server (`server.js`), `engine.js` (Baileys), `store.js` (encrypted one-time store), `qr.js`, `pairfix.js`; vanilla HTML/CSS/JS in `public/` (`index.html`, `style.css`, `app.js`, `sound.js`, `theme.js`); `linkcard.js` builds the WhatsApp link card; tests in `test/site.test.js` (run `node --test test/site.test.js` inside `pairsite/`).
- Routes: `/health` -> `{ok, version, sessionMinutes}`, `/api/pair`, `/api/job/:id`, `/api/session/:id`.
- Version lives in `pairsite/package.json` and shows in the page's status bar.

### The bot (TurboFex)
- Folders: `commands/`, `core/`, `whatsapp/`, `tests/`. Version in the bot's `package.json` (0.7.x). Bot tests: `node --test tests/*.test.js` (run the bot and site suites SEPARATELY; together they flake).
- Brand links are in `core/brand.js` (change them there).
- `.qr` command: sends the QR picture, then a "Copy code" button (WhatsApp interactive button, may not show on every phone), a fallback message with ONLY the code, and a message with the community links.

## 3. Rules that must never be weakened (pair site security)
- Session ID: 12 random characters, **one-time use**, **5-minute expiry**, enforced by the server (expired IDs are refused even before clean-up, also after a restart).
- Stored encrypted (AES-256-GCM) with the expiry bound into the encryption (AAD). Rate limits on. `Cache-Control: no-store`.
- Strict CSP: `default-src 'self'`, **no inline scripts or styles**. Put JS/CSS in files.
- Only true claims on the page. **No invented numbers, user counts, versions, ratings or social/legal links.** The owner has NOT given Support/Privacy/Terms URLs yet, so none are shown.
- Only the page keeps the *attempt number* in the browser tab (so a refresh continues); the session ID itself is fetched again from the server while it is still valid.

## 4. Commands the owner uses (give these every time, adjusted to the new zip name)
**Push the pair site from Termux** (one block; Termux has no /tmp, so use the home folder):
```
cd ~/TurboFex-Pairing-site && rm -rf ~/tfx && mkdir -p ~/tfx && unzip -o ~/storage/downloads/turbofex-pairsite-vX.Y.Z.zip -d ~/tfx && cp -r ~/tfx/pairsite/. . && rm -rf ~/tfx && git add -A && git commit -m "vX.Y.Z short message" && git push
```
- Replace `X.Y.Z` with the new version. The zip's top folder is `pairsite/`.
- If "No such file": the zip is not in Downloads. If "Permission denied" on storage: run `termux-setup-storage` once.
- Past typos to avoid: the owner once typed `git pus`; always give the whole block to copy.
- Render redeploys by itself after the push; to confirm the deploy, open https://turbofex-pair.onrender.com/health in the browser: it shows the new `version`. (The owner asked to REMOVE the version text from the page, so it is no longer shown there.) Tell the owner to fully close and reopen the tab (Safari caches CSS).
- Optional safety tag after a good push: `git tag vX.Y.Z && git push --tags`.
- **Bot updates:** the owner gets a small zip with only the changed files (same folder paths) and unzips it into the bot folder, then restarts and pushes the way they usually do. (Their exact bot push commands have not been written down yet. Ask once, then record them here.)

## 5. Design preferences (pair site)
- Black and champagne-gold luxury look, matching the owner's reference image: hero picture = the owner's supplied illustration (3D phone with chat, friendly golden assistant robot with a shield, chat bubbles, gold light trails, soft city skyline), one version per theme: ivory/gold for light and a charcoal/gold version for dark (made from the same picture), as `public/hero-{light,dark}-{800,1200}.webp`. The TF logo tile in the hero was REMOVED on the owner's request. The two pictures cross-fade on theme change; only the active theme's picture loads first, gold "WhatsApp" heading, "Choose connection method" panel as the main focus, FAQ heading above the two cards "How to connect" and "Security tips" (side by side on phones, both fully visible), status bar (server online + session ID lifetime only, no version), footer with community links. Footer "Help" opens the Telegram community. The sentence "Your session data is protected and deleted after collection" was removed on the owner's request: do not add it back.
- **Dark AND light mode must both be complete** (ivory/warm white + dark text + soft gold in light). Nothing may stay dark in light mode. The choice is remembered (`tfx-theme`).
- **Floating "Dynamic Island" bar** at the top (real feature: status drawer, menu, theme button, living gold animation). Must respect iPhone safe areas and never be covered by page content (it sits above the fade `.scrim`).
- Sounds: soft round "tim" tones (no clicks, no noise, no loud beeps), only after the first touch, on/off switch in the menu, remembered (`tfx-sound`).
- The floating bar must stay smooth on Android: no live blur behind it, animations rest while scrolling (`html.scrolling`), lighter effects when `html.android` (set in theme.js). Don't add heavy filters/box-shadow animations to it.
- Phones: consistent side gutters, no sideways overflow, no big empty gaps (footer bottom space is small on purpose). Must run well on low-end Android (a `lite` mode switches off heavy glow when the phone has little memory or Data Saver).
- The page opens (and returns after refresh) at the connection section.
- Community links (use exactly these):
  - WhatsApp Channel: https://whatsapp.com/channel/0029VbDpuKM8qIzkoQscOE2w
  - Telegram: https://t.me/+7PwU2Vo9czE1NTRk

## 6. The WhatsApp messages sent after linking (this ORDER is required by the owner)
1. **ONE message with BOTH community links together**, crisp bold heading (Unicode bold letters). Its preview is the **real WhatsApp Channel link card**: the page's own title, description and picture, shown **full width** (not the small square). Never use a different or made-up picture (a custom banner was tried and rejected).
2. A short note ("TurboFex linked! Your session ID is in the next message...").
3. The **session ID LAST and ALONE** in its own message (newest message; one long-press copies only the ID).
- The owner does NOT want the links split into separate messages.
- The card is read from the channel page's public tags (`linkcard.js`, JPEG pictures only, cached 1 hour). If the page can't be read, the plain links are sent with no card. Only the ID message matters for success; failures of the others never affect it.
- Not testable in the AI sandbox (whatsapp.com is blocked there): ask the owner for a screenshot of the received messages.

### After the ID is shown: "used" detection (owner request)
- When the bot downloads the ID (`/api/session/:id`), the server marks that job as used and `/api/job/:id` returns `used: true`. The page keeps polling (every 4 s while the ID is valid) and then shows a green "Your bot is logged in" message (not "expired"), hides the ID, copy button and setup steps, and the island says "Bot connected". "Expired" is only shown when the ID really ran out unused.

### Known problem: pairing CODE ("Couldn't link device" on the phone)
- Since July 2026 WhatsApp changed how new devices link. QR needed the `companion_reg_refresh` fix (`pairfix.js`). Pairing codes are generated fine but the phone can say "Couldn't link device"; upstream (Baileys 7.0.0-rc14) has NO confirmed fix (open issues: Baileys #2679 stale WhatsApp Web version, #2765, #2608; evolution-api #2696).
- What the site does: `resolveVersion()` in `engine.js` asks FIVE sources at once (sw.js, check-update, home page, the library, and the public wppconnect-team/wa-version list on GitHub), takes the NEWEST number, and logs `version sources: ...` (each source's number or failure) plus `WhatsApp Web version ... - source` in the Render log. v2.9.1 failed because the library's lookup quietly returned an old number. The code page tells people to try the QR if WhatsApp says "Couldn't link device".
- Cannot be tested in the AI sandbox. When it fails, ask the owner for the Render log lines starting with `[pair]` (look for `WhatsApp Web version`, `code shown`, `the phone accepted the link`, `code refused`).
- Re-check upstream Baileys releases (newer than 7.0.0-rc14) before trying anything else.

## 7. How to test (what has been used)
- Site: `node --test test/site.test.js`, plus Playwright (Chromium, phone-sized and desktop, dark and light) for: hero centring, island on top of content, slider/FAQ fit, overflow, console errors, sounds (with a fake AudioContext), refresh-continues flow.
- **Cannot be tested in the AI sandbox:** real iPhone Safari (WebKit not available), real WhatsApp linking, WhatsApp interactive buttons, link previews, the live Render site. Say so, and ask the owner for screenshots or Render logs when something fails.

## 8. Version history (short)
v1.x crash fix, pairing site, redesign, dark mode, floating island, sounds -> v2.0.0 black/gold redesign -> v2.1.x design correction (hero centred, light mode everywhere) -> v2.2.x island visible on Safari, refresh continues, footer space -> v2.3.0 FAQ + side-by-side cards + soft sounds + low-end mode -> v2.4.0 separate session-ID message -> **v2.5.0 links together in one message with full-width picture card -> v2.5.1 this notes file moved inside the site project -> v2.6.0 order: links first, note, session ID last; the card is the real WhatsApp Channel preview -> v2.7.0 the page detects when the bot used the ID and says so -> v2.8.0 smoother floating bar on Android, Help opens Telegram, version and footer sentence removed -> v2.8.1 shorter connection card -> v2.9.0 new hero illustration (light + dark) -> v2.9.1 current WhatsApp Web version for linking + hint on the code page -> v2.9.2 five version sources, newest wins, each logged -> **v2.10.0** new look: no hero badges, frameless full-width hero that fades into the page (CSS mask), light = ivory/champagne (--bg #FAF3E6), dark = black/gold; dark hero picture recoloured to remove the brown tint -> **v2.10.1** sharp hero (real <img> with srcset 836w/1672w from the full-size 1672px original; the dark one was rebuilt from the full-size source in one pass) + theme switch without blink: NO View Transition API any more (its snapshot lost the hero on phones); both <img> stay mounted (light underneath, dark on top), the new one is decode()d first, then `html.theming` fades everything over `--theme-t`. -> **v2.11.0** Try again button (`#retry`, `retry()` in app.js, new `POST /api/cancel/:id`), `ended()` shows a message instead of an empty code/QR box, PAIR_LIMIT default 10, dark hero rebuilt as true black + gold, oval mask on the hero -> **v2.11.1** light-mode floating bar made clean (static ring, no bloom/flow/sparks/glass shine; dark bar untouched) -> **v2.11.2** hero = the owner's real light + dark 1672x941 pictures (no recolouring any more; the earlier derived dark picture is gone) -> **v2.11.3** floating bar = the owner's reference: ONE clean black pill with a thin gold outline in both themes (the light ivory bar was dropped; no bloom/flow/sparks) -> v2.11.4 light mode bar = ivory + gold edge again (dark = black pill); NO oval mask on hero (caused a circle while switching); refresh/open stays at top (the owner now does NOT want auto-scroll to the connection card); FAQ cards = one-per-screen scroll-snap slider on phones, equal size -> **v2.12.0** number validation + country picker + per-number limits (section 9), no-fade theme switch, refresh restores the unfinished attempt.

## 9. Open ideas the owner has not decided
- Keep Render awake with a free pinger on `/health`.
- A "where do I put the SESSION_ID on Spaceify" line on the page.
- Real Support / Privacy / Terms pages (needs the owner's URLs or text).
- Visit/success counters were declined (the free disk is wiped), so do not add them.

## 10. New preferences go below (newest last)
- (none yet)


## 9. Phone numbers (v2.12.0) - how it works and what it can NOT do
- `public/countries.js` is the ONE country table (dial code, min/max national length, first-digit rule) used by the page (live counter, picker) and by the server (`phone.js`). Lengths are mobile-focused ITU numbering-plan ranges; some countries are a wider "loose" range. `libphonenumber-js` is an optionalDependency: when installed on Render, `phone.check()` also requires `isValid()` (set STRICT_PHONE=0 to turn that off). NOT tested here (the sandbox has no npm access) - only with a fake library.
- The page guesses the country from the phone's time zone, then the language region (no IP lookup, nothing sent anywhere). The person can change it in the picker; typing +CODE... switches country by itself.
- `POST /api/pair` takes `{method, number, country}`; the server validates, turns the number into international digits, limits 5 tries per number per 15 min (NUMBER_LIMIT, hashed) plus the per-visitor PAIR_LIMIT (10), and only then starts WhatsApp. `POST /api/cancel/:id` stops an attempt (Try again / Start over).
- WhatsApp gives NO reliable "is this number registered?" answer before pairing. The code is shown only after `requestPairingCode` succeeds and WhatsApp sends no error. Optional `VERIFY_WHATSAPP=1` also tries Baileys `onWhatsApp()`: only an explicit "exists: false" stops the attempt; if it cannot answer (usual on a not-yet-linked connection) nothing is claimed. Untested against real WhatsApp.
- Errors shown to visitors are plain sentences; raw WhatsApp/Baileys details only go to the server log. Logs never hold a full number (country code + last digits only).
- Theme switching (v2.11.5/2.12.0): NO colour fade. A fade makes text and background cross (grey on grey) and nested inherited fades lag. `html.switching` turns transitions off for the flip. Light-mode gold text uses `--gold-text` (#8A6A2B), status colours `--ok`/`--bad`.
- Refresh: an unfinished attempt is restored and scrolled into view; otherwise the page opens at the top.

## 10. v2.13.0 - digit limit, no status bar, music
- `#number` input handler trims the value while `P.analyze(...).state === 'toolong'`, so extra digits are never accepted (typing or paste). The server still checks everything again.
- The status bar (`.statusbar`, `st-*` ids) and its `/health` poll are gone; the `/health` route stays for Render.
- Music: `public/tfx-ambient.m4a` (53 s stereo AAC loop, ~490 KB) was GENERATED by code for this project (numpy synthesis: Am9-Fmaj7-Cmaj7-G chords, pad, soft bell arpeggio, reverb), so it has no copyright owner to credit. Browsers block sound before a tap, so `app.js` tries at once and otherwise starts on the first pointer/key event, fading to volume 0.1 (quiet, so the tap sounds stay clear). Menu item `#m-music` (key `tfx-music` in localStorage, try/catch). Paused when the tab is hidden. Skipped automatically when the browser reports Data Saver.
- `server.js` serves `.m4a` with byte-range support (`sendAudio`): iPhone Safari refuses to play audio without 206 answers. Cached 1 day.
- Lesson: unit tests do not run app.js; a syntax slip there only shows in a browser test (run `v213.js`-style Playwright checks).
- Version history add: **v2.13.0** digit limit + status bar removed + background music.

## 11. v2.14.0 - About and Terms pages
- `public/about.html` and `public/terms.html` (clean addresses `/about` and `/terms` via the `PAGES` map in `server.js`), small shared script `public/page.js` (theme button + year; theme itself comes from `theme.js`). Styles are at the end of `style.css` (`.docpage`, `.dbar`, `.doc`, `.docsec`). No inline scripts/styles (CSP).
- Linked from the footer (About, Terms) and the menu (`#m-about`, `#m-terms`).
- The wording only states what the site really does; if the security model changes (expiry, storage, number handling) UPDATE both pages. Not lawyer-reviewed; no company name, address or country law was invented.
- Version history add: **v2.14.0** About + Terms pages.
- v2.14.1: the owner does NOT want About/Terms in cards or boxes: `.docsec` is plain text on the page background (no border, background, shadow, boxed buttons). Do not put them back in boxes.

## 12. v2.15.0 - Privacy Policy
- `public/privacy.html` at `/privacy` (same plain-text style as About/Terms, NO boxes). Linked from footer, menu (`#m-privacy`), About, Terms. Every statement must stay true: if what the site stores, logs or sends changes, update the Privacy Policy, Terms section 5 and About together. Not lawyer-reviewed.
- Version history add: **v2.15.0** Privacy Policy.

## 13. v2.15.1 - music on every page
- Music code moved out of `app.js` into `public/music.js`, loaded by index, about, terms and privacy. The position in the loop is kept in sessionStorage (`tfx-music-pos`) so the next page continues from the same spot. Menu item `#m-music` on home, round button `#d-music` on the text pages. Strict browsers (iPhone Safari) need one tap per new page before sound; the only full fix would be loading pages without a full reload (not done).
- Version history add: **v2.15.1** music on all pages.

## 14. v2.16.0 - custom pairing code
- `engine.js` `makeCustomCode()` = `TFX` + 5 random characters from `23456789ABCDEFGHJKMNPQRSTVWXYZ` (WhatsApp-style alphabet, no 0/1/I/L/O/U), passed as the 2nd argument of `requestPairingCode(number, code)`. If the call throws, or WhatsApp answers with an IQ error, ONE normal code is asked for instead (the refusal is forgotten first). The log says `code shown (TurboFex code)` or `(normal code)`. Switch off with env `CUSTOM_CODE=0` (server passes `customCode`). NOT verified against real WhatsApp / Baileys 7.0.0-rc14 (docs only confirm the option in a Baileys fork). Keep the code random: it must stay as hard to guess as a normal one.
- Version history add: **v2.16.0** custom pairing code.

## 15. v2.17.0 - FAQ list, theme follows the phone
- The owner REMOVED the two boxes How to connect / Security tips (and the slider + dots). Do not bring them back. The FAQ is `section.faqlist` with `<details class="qa">` items, plain with thin lines only (no cards/boxes). The how-to-link and security content lives inside the FAQ answers; footer link `#faq`.
- `theme.js`: saved choice (`tfx-theme`, only written by the sun/moon button) wins; otherwise `prefers-color-scheme` decides, and a live change of the phone setting is followed (event `tfx-theme` re-syncs the toggle). DEFAULT dark only if the browser cannot say.
- Version history add: **v2.17.0** FAQ list + system theme (includes v2.16.0 custom code).

## 16. v2.17.1 - hero blink on refresh, FAQ one-at-a-time
- Root cause of the refresh blink: the light `<img>` was always visible underneath the dark one, so in dark mode it showed first (smaller file) until the dark one arrived. Now `[data-theme=dark] .art-light {opacity:0}` and the hero is hidden (`html.art-wait`, set in theme.js, removed in app.js after `decode()`, safety timers 1.8s/3s) then fades once (`art-fade`). Do NOT make the other theme's picture visible again.
- FAQ: only one `details.qa` open at a time (toggle listener in app.js); numbered questions via CSS counter, round gold arrow (data-URI svg, gold differs per theme), still no boxes.
- Version history add: **v2.17.1**.
- v2.17.2: the owner disliked the FAQ numbers and round arrows -> removed. FAQ = question text + gold plus (CSS gradients, turns into a cross when open), thin lines, no numbers, no boxes. Version history add: **v2.17.2**.
- v2.18.0: FAQ = 3 tabs (`.ftab`, ids `ft-linking/safety/problems`, panels `.fpanel`) + `details.qa` rows with a gold chevron. Owner disliked numbers and the earlier list look; keep: no numbers, no boxes. Version history add: **v2.18.0**.
- v2.19.0: the owner had the background music REMOVED (music.js, tfx-ambient.m4a, menu item, doc-page button, audio range serving, mentions in About/Terms/Privacy). Do NOT add music back. The UI tap sounds (`sound.js`, menu Sound On/Off) stay. Sections 10 and 13 above describe the removed music for history only. Version history add: **v2.19.0**.
- v2.19.1: the owner wants NO FAQ question open by default (and none auto-opened when a tab changes). Version history add: **v2.19.1**.

## 17. v2.20.0 - Admin dashboard (owner request: secure, premium, real data only)
- Files: `admin.js` (backend: accounts, login, 2FA, sessions, roles, API, audit, alerts, health, settings), `events.js` (7-day activity log), `public/admin.html|admin.css|admin.js` (UI, no inline script/style, DOM via textContent only), `public/notice.js` (public announcement + maintenance banner from `GET /api/status`), `tools/admin-setup.js` (makes an account), `test/admin.test.js` (18 tests).
- Off by default: with no valid `ADMIN_ACCOUNTS` env var every `/admin*` URL answers 404. Never commit real values. Create one with `node tools/admin-setup.js` (Termux): asks username, role, password (>=12 chars), prints a QR for the authenticator app and the one-line `ADMIN_ACCOUNTS=[...]` to paste into Render -> Environment (append more accounts by pasting the old value when asked). The value holds scrypt password hashes + TOTP secrets: treat it as secret.
- Login: password (scrypt, dummy hash for unknown users) -> 5-min single-use ticket bound to the visitor -> TOTP (RFC 6238, +-1 step, each code works once) -> server session (cookie `tfx_admin`, HttpOnly, SameSite=Strict, Path=/admin, Secure on https). CSRF token header + Origin check on every POST. Idle 20 min, absolute 8 h. Lockout: 5 failures per username or 8 per visitor / 15 min.
- Roles: viewer; moderator (+ sessions.revoke, blocks.manage, announce.manage); owner (+ settings.manage, audit.view). Enforced in `admin.js` per route, denied attempts are audited. Hiding a button in the UI is only cosmetics.
- Data: activity log `dataDir/admin/*.jsonl` (7 days; masked IP/number, HMAC fingerprints, never IDs/codes/creds); `admin-state.json` (blocklist = fingerprints only, settings, announcements); `admin-audit.jsonl` hash-chained. IMPORTANT honesty: Render free has no persistent disk, so all of this is lost on every redeploy/restart. There are NO user accounts or user database in this project: "users" in the dashboard are visitors (fingerprints) and numbers.
- Live settings: maintenance mode (503 on /api/pair with the admin's message), limits per visitor / per number / max running pairings, applied immediately. Blocks refuse with 403; an admin cannot block their own visitor.
- CSS gotcha: `style.css` already has `.stat` and `.sub` (island status / hero text), so the dashboard uses `.kpi` and overrides `.vh .sub`. Test scripts must use a different TOTP step (-1, 0, +1) per login of the same account because of replay protection.
- Not tested: real iPhone Safari, real Render, real WhatsApp. 2FA was tested with codes generated by the same algorithm (verify once with a real authenticator app).
- Privacy/Terms text updated (activity log, blocklist, dashboard). Keep them true when changing the log.
- Version history add: **v2.20.0** admin dashboard + island on About/Terms/Privacy.
- v2.20.1: `.sw input` is a custom switch (global input styles had turned the checkbox into an empty pill). Security badge = unread alerts only: `localStorage tfx-adm-seen` {alertId: count}; opening Security marks all seen; an alert is unread again when its count grows. Version history add: **v2.20.1**.
- v2.20.2: the 'Your session ended' text shows only if `me` was set (a real sign-out); sign-out asks `confirm()` first. Note: admin sessions live in memory, so every Render redeploy/restart signs everyone out. Version history add: **v2.20.2**.

## 18. v2.21.0 - Supabase storage for the admin data
- Why: Render free has no disk, so redeploys wiped blocks/settings/announcements/logs. Owner chose Supabase (NOT Vercel: Vercel cannot hold the live WhatsApp pairing connection; static hosting there was judged low value).
- `cloud.js` talks to Supabase REST (PostgREST) with plain fetch (no npm package; npm is unreachable in the build sandbox). Env: `SUPABASE_URL` (https only) + `SUPABASE_SERVICE_KEY` (the SECRET/service_role key, never the publishable/anon one; never shown, logged or sent to the browser). Off when unset.
- Tables (`tools/supabase-setup.sql`, RLS on, anon/authenticated revoked): `tfx_kv` (key 'state' = blocks/settings/announcements), `tfx_events` (t, e jsonb; pruned to 7 days hourly), `tfx_audit` (line jsonb, kept forever so the hash chain stays valid).
- Flow: `server.js` main awaits `cloud.restore(data/admin)` which rewrites the local files BEFORE `createApp` reads them; afterwards every event/audit line/state save is queued and pushed (every 4 s, state debounced 0.5 s). Local files stay the working copy. If Supabase is down the site works normally and retries; queue capped at 5000.
- NEVER sent: session IDs, pairing codes, sessions, full numbers/IPs (tests check). Admin login sessions are still in memory (a restart signs admins out, by design).
- Dashboard: Server tab shows Permanent storage: Not set up / Connected / Problem.
- Tests: `test/cloud.test.js` (fake Supabase): restore after wipe, audit chain valid and continuing, offline catch-up, wrong key, https only. Not tested against the real Supabase.
- Privacy page now mentions the database copy; keep true.
- Version history add: **v2.21.0**.

## 19. v2.22.0 - fixes after real use + trusted devices
- BUG (found on the live site): "Chain BROKEN" after a Supabase restore. Postgres jsonb reorders object keys, so the audit hash (over JSON.stringify) no longer matched. Fix: `canon()` in admin.js rebuilds each audit entry in a fixed field order before hashing; the fake Supabase in `test/cloud.test.js` now reorders keys like jsonb. Existing rows in the owner's database verify again with no migration. Never hash raw key order of anything that passes through a database.
- Login is ONE form (username, password, optional code, 'trust this device'). 2FA stays mandatory, but a trusted device (signed cookie `tfx_trust`, 30 days, HttpOnly/Strict, tied to the account's 2FA key and a counter) skips only the code; the password is always asked. Settings -> Trusted devices -> 'Forget trusted devices' bumps the counter (state.trust[user]) and kills all such cookies. Audit notes 'trusted device'.
- Password saving on iPhone: after a successful sign-in the form is really submitted into a hidden iframe (`POST /admin/api/noop`, 204, body never read) so Safari sees a real form submit and offers to save. Fields use autocomplete username/current-password. The noop route must stay BEFORE the Origin check (the admin pages send Referrer-Policy no-referrer, so form posts carry Origin: null). NOT verified on a real iPhone.
- Visits: `site.visit` events from `noteVisit()` in server.js (html pages only, one per visitor per 10 min, skips bots/monitors by User-Agent). Shown as Visitors / page visits on Overview and a 'Page visits' column in Visitors. Privacy page updated.
- Heap meter now compares with V8's real limit (`heapLimit`), not heapTotal (which always looks nearly full and showed red).
- Version history add: **v2.22.0**.

## 20. v2.23.0 - dialogs, gauges, noop fix
- `/admin/api/noop` now answers 200 with a tiny HTML page. A 204 made iPhone Safari ask "Do you want to download noop?".
- The phone's own confirm()/prompt() boxes (white iOS sheet) are gone: `dlg()` / `confirmThen()` in public/admin.js draw an in-page pop-up in the site's style (Esc/outside click cancels, Enter submits). Never use window.confirm/prompt in the dashboard.
- Visitors: the row that is the admin's own visitor fingerprint shows 'this is you' and has no Block button (blocking yourself is refused by the server anyway).
- Server tab: usage bars replaced by round gauges (`gauge()`); 'This site' (CPU, memory vs limit, heap vs V8 limit) vs 'The whole machine' (shared, never shown red unless >=97%). CSS gotcha: style.css already has `.ring`; the gauge class is `.gring`.
- Version history add: **v2.23.0**.

## 21. v2.24.0 - admin dashboard UI/UX upgrade
- Phones: bottom tab bar (Overview, Pairing, Visitors, Security + badge, More). 'More' opens a bottom sheet (Server, Activity, Audit log if allowed, Announcements, Settings). Desktop (>=900px) keeps the side menu. The old top scroller is hidden on phones. Tabs also follow `#hash` (back button works): tests switch tabs with `location.hash = '#settings'`, not by clicking.
- Every view header has a 'Live' badge: shows 'Updated Ns ago', tap to refresh now. Loading shows skeleton shimmers; views fade in.
- Overview: 'Right now' attention card (chips that open the matching tab, or 'All quiet'), 4 big headline numbers, a compact strip (failed / invalid / rate limited / blocked tries), then the chart (shows a message instead of an empty chart).
- Phone lists: each row is a card with a bold title line and two-column facts.
- CLASS NAME RULE: style.css (public site) already uses .bar, .hero, .skel, .sheet, .sheet-bg, .vr, .ring, .stat, .sub. New dashboard classes are prefixed (.abar, .ahero, .askel, .asheet, .avr, .gring, .kpi). Check style.css before naming a class.
- Version history add: **v2.24.0**.

## 22. v2.25.0 - simpler dashboard (owner said v2.24.0 UX was bad: bottom bar/menu and lists; wanted 'simpler and cleaner')
- The bottom tab bar was REMOVED: it collided with iPhone Safari's own floating bottom toolbar. Phones now have one menu button (id `menu`, class `amenubtn`) in the top header that opens a list of all sections (`#m-<tab>` ids); a red count shows on it for unread security alerts (`#menu-n`). The 'Admin' chip is hidden under 440px. Desktop keeps the side menu.
- Phone lists: each row is one clean card: bold title, status tag top-right (grid, not absolute), one fact per line, zero/empty facts hidden (`.td.z`), long page descriptions hidden. Row cells labelled Status/State/Event/Action with a node become the corner tag (`.td.st`).
- Class clash again: style.css has `.menubtn` (public site burger): the dashboard uses `.amenubtn`. Always prefix dashboard classes with `a`.
- Version history add: **v2.25.0**.

## 23. v2.26.0 - PAIR_BROWSER (Android companion identity)
- Only makeWASocket call is in engine.js `connect()`; its `browser:` is now `pickBrowser(lib.Browsers)`. PAIR_BROWSER=android -> `Browsers.android('13')` (version NUMBER, not 'Chrome'); unset/other -> exactly `Browsers.ubuntu('Chrome')`. Guarded: if `Browsers.android` is not a function it logs and uses the default.
- Identity is fixed at link time; already linked sessions keep their old identity. Android-identity pairing CODE is unverified; never silently fall back, report the exact error.
- `complete()` logs `Linked as platform: <creds.platform>` (no keys). render.yaml has PAIR_BROWSER=android. Tests: pickBrowser unit test in test/engine.test.js (fake lib has ubuntu only in other tests).
- Version history add: **v2.26.0**.

## 24. v2.27.0 - Plugins page (marketplace, part B)
- `/plugins` (public/plugins.html, plugins.js, plugins.css) + `GET /api/plugins` (server.js, rate limited 60/min per visitor). Data: `registry.js` downloads `index.json` + `index.json.sig` from the public GitHub repo `nels0nfx/TurboFex-Registry`, verifies the Ed25519 signature with the registry public key (constant in registry.js, same key as the bot's core/plugins/registry-key.json), caches 10 min, serves the last good list up to 24 h when GitHub is down; a failed signature is never served (503).
- The page script uses textContent only (never innerHTML). Colours only from style.css variables (both themes). The "Plugins" menu item (`id="m-plugins"`) is in the menus of index, about, terms, privacy and plugins pages.
- Only true claims: counts shown are the real list length; the risk marks use the same plain wording as the bot's install screen.
- Next (part C): Developer Centre with GitHub login, submissions and an admin review screen (admin dashboard classes start with `a`). The registry is signed on the owner's phone with tools/registry.js in the bot repo; the site never holds the signing key.
- Version history add: **v2.27.0**.

## 25. v2.28.0 - Developer Centre (marketplace, part C)
- `devcentre.js` (createDevCentre): GitHub OAuth sign-in (`/auth/github`, `/auth/github/callback`; state cookie `tfx_oauth`, Path=/auth, 10 min; no scope; the access token is used once to read id + login and is never stored), developer cookie `tfx_dev` (`<githubId>.<exp>.<hmac>`, 7 days, HttpOnly, SameSite=Lax), `/api/dev/{me,submit,withdraw,logout}` (POSTs need header `x-requested-with: tfx` + same-origin), submissions fetched from raw.githubusercontent.com at the developer's tag (repo owner must equal their GitHub login) and STORED as a copy; `plugin-check.js` validates (must stay in step with the bot's core/plugins/manifest.js) and flags risky code. Plugin id belongs to the first developer with a live submission; same id+version cannot be sent twice; max 5 waiting, 10 per day.
- Storage: small files in `data/devcentre/` (dev_<id>.json, sub_<id>.json) mirrored to Supabase `tfx_kv` keys `dc:dev:<id>` / `dc:sub:<id>` (cloud.js `pushKv`, `restoreKv`, run at boot). No new tables.
- Admin dashboard: new "Plugins" section (owner only, permission `plugins.review`): list, detail (manifest, code, flags, risk), approve / reject (reason shown to the developer), verified mark, block. Routes `/admin/api/plugins/{submissions,submission,review,dev,devs}`; all audited.
- Phone command: `GET /api/registry/approved` and `POST /api/registry/published` with `Authorization: Bearer REGISTRY_PULL_TOKEN` (>= 24 chars; the routes do not exist without it). Used by `tools/registry.js pull` / `published` in the bot repo (v1.4.2). The site never holds the signing key.
- Render env: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SITE_URL (https://turbofex-pair.onrender.com, no slash), REGISTRY_PULL_TOKEN. GitHub OAuth app callback: `<SITE_URL>/auth/github/callback`.
- Public page `/developers` (developers.html/js/css, textContent only), menu item `id="m-dev"` on all pages, privacy.html has the developer-data paragraph.
- Not done: "Verified" mark in the marketplace list; GitHub 2FA is not verifiable through OAuth so it is not required.
- Version history add: **v2.28.0**.

## 26. v2.29.0 - Verified mark, developer and versions on the Plugins page
- `GET /api/plugins` now adds, per plugin, `history` (up to 10 versions, newest first, from the signed registry) and, when the plugin came through the Developer Centre and its submission is `published`, `dev: {developer, verified, source}` (devcentre.publicInfo; `verified` is false for a blocked developer; `source` = repo + /tree/<tag>). The signed registry is not changed: the verified mark lives only on this site.
- public/plugins.js shows "✓ Verified developer" beside the author, a Developer section with the source link, and a Versions list. textContent only; the source link is only used if it matches https://github.com/....
- Version history add: **v2.29.0**.

## 27. v2.30.0 - withdraw a published plugin (admin dashboard)
- Admin route `POST /admin/api/plugins/revoke {id, reason}` (owner, audited as `plugin.revoke`): only a `published` submission, once, reason >= 3 chars. The Plugins page hides it at once (`devcentre.hidden()`), `GET /api/registry/approved` also returns `revocations`, and `POST /api/registry/published` accepts `{ids, revoked}`; a confirmed withdrawal sets the status to `revoked` (the id and version stay taken: published versions never change).
- The signed withdrawal itself is made on the owner's phone: bot tools/registry.js `pull` runs `revoke` for each request, `published` reports it back (bot v1.4.6).
- Version history add: **v2.30.0**.

## 28. v2.31.0 - Plugin Guide page
- `/plugin-guide` (public/plugin-guide.html, styles in developers.css under `.guide`): the developer guide (the two files, commands and `c` fields, permission table, API calls with their real limits, events/schedules, limits, how to submit). Linked from /developers. It was written from core/plugins/{manifest,broker,host,worker}.js of bot v1.4.4: when the plugin API or its limits change in the bot, UPDATE THIS PAGE too. A test runs the guide's manifest and code through plugin-check.js and checks that every permission of registry.js PERMS is in the table.
- Version history add: **v2.31.0**.

## 29. v2.32.0 - ratings and reviews
- Anyone signed in with GitHub (same login and `tfx_dev` cookie as developers) can give a plugin 1-5 stars and an optional review (max 300 characters, control and direction characters removed, always shown with textContent). One vote per GitHub account per plugin (voting again replaces it); a developer cannot rate their own plugin; only plugins in the signed store can be rated; max 2000 votes per plugin.
- Storage: one record per plugin, file `data/devcentre/rat_<pluginId>.json`, Supabase key `dc:rat:<pluginId>` (restored at boot like the other developer records).
- Routes: `GET /api/plugin-reviews?id=` (public), `POST /api/dev/rate {plugin, stars, text}` or `{plugin, remove:true}` (header `x-requested-with: tfx`), `/api/dev/me` now includes the person's own `ratings`; `GET /api/plugins` adds `rating {avg,count}`. `/auth/github?next=plugins` returns to the Plugins page (any other value goes to /developers).
- Admin: Plugins > "Ratings and reviews": hide/show one rating (hidden = not shown and not counted). Routes `plugins/reviews`, `plugins/review-hide`; audited.
- privacy.html says ratings and reviews are public with the GitHub username.
- Version history add: **v2.32.0**.

## 30. v2.33.0 - plugin reports (first gap from the final audit)
- Anyone signed in with GitHub can press "Report this plugin" on a plugin card (reason from a fixed list + optional note up to 300 characters, cleaned like reviews). One report per person per plugin (sending again replaces it and opens it again); max 10 new reports per person per day; only plugins in the store.
- Storage: one record per plugin, file `data/devcentre/rep_<pluginId>.json`, Supabase key `dc:rep:<pluginId>`.
- Routes: `POST /api/dev/report {plugin, reason, text}` (header `x-requested-with: tfx`); admin `GET plugins/reports`, `POST plugins/report-set {plugin, githubId, status: open|closed}`; audited as `plugin.report.close/reopen`. Admin: Plugins > Reports (open ones first). Reports are never public. Reports do not remove a plugin by themselves: the owner uses Withdraw.
- privacy.html mentions reports. Version history add: **v2.33.0**.

## 31. v2.34.0 - plugin store pause switch (second gap from the final audit)
- Admin > Plugins: "Pause the store" / "Open the store again". State in `data/devcentre/switch.json` (Supabase key `dc:switch`, restored at boot). While paused: `/api/plugins` returns `{paused:true, plugins:[]}` (the Plugins page says it is paused), `/api/dev/submit|rate|report` answer 503. Still working: GitHub sign-in, sign-out, withdraw by a developer, the admin dashboard, the phone command routes `/api/registry/*`, and the signed registry itself, so bots and installed plugins are never affected. Audited as `plugin.store.pause/open`.
- Version history add: **v2.34.0**.

## 32. v2.35.0 - ask for changes + "what changed" view (third gap from the final audit)
- New review decision `changes` (admin `POST plugins/review {id, decision:'changes', note}`, note >= 3 characters, only from "pending"). Status `changes` ("Changes requested"): the developer sees the note on /developers. It is NOT in the LIVE list, so the developer can fix the plugin and send the SAME version again (move or re-tag). Audited as `plugin.changes`.
- `adminGet` now returns `changes` (null for a first version): compared with the newest earlier published/approved version of the same plugin by the same developer: permissions added/removed, websites added, and a line diff (2 lines of context, max 600 lines, `tooBig` over 1500 lines) of the code and of turbofex-plugin.json (`lineDiff`, `changesSince` in devcentre.js). Admin shows it as a panel "What changed since <version>" with green/red lines (`.dadd/.ddel` in admin.css).
- Not built from the audit item: a back-and-forth conversation (developer replies); this is one note from the owner per round.
- Version history add: **v2.35.0**.

## 33. v2.36.0 - backup download (fourth gap from the final audit)
- Admin > Plugins > "Download backup": `GET /admin/api/plugins/export` (owner only, perm `plugins.review`) returns one JSON file `turbofex-plugin-store-backup.json` (format `turbofex-devcentre-backup-1`): developers, submissions (with the stored code), ratings, reports, pause state. Audited as `plugin.export`. There are no tokens or passwords in these records. It is a manual backup because the free Supabase plan has none.
- NOT built (needs secrets or an outside service, decided with the owner first): automatic scheduled export to a private GitHub repository, and an outside keep-alive pinger (Render sleeps; Supabase pauses after a week idle). Suggested free option for the owner: a free uptime pinger (for example UptimeRobot) on the site address, which also keeps Supabase active because the site writes to it.
- Bot v1.4.7 (separate zip): saved notes of a removed plugin are kept 30 days, then erased (`purgeOldNotes` in core/plugins/index.js, `removed` map in data/plugins.json).
- Version history add: **v2.36.0**.

## 34. v2.37.0 - new permission chat.react (site side of bot v1.4.8)
- `registry.js` PERMS now has `chat.react` (low risk), so submissions that use it pass `plugin-check.js` (it reads PERMS) and the Plugins page shows its text. The plugin guide documents `ctx.react`, `tfx.storage.delete` and `tfx.storage.list`. Keep PERMS in step with the bot's `core/plugins/manifest.js` PERMISSIONS.
- Version history add: **v2.37.0**.

## 35. v2.38.0 - plugin settings in the manifest (site side of bot v1.5.0)
- `plugin-check.js` now validates `settings` in a submitted manifest with the same rules as the bot's `core/plugins/manifest.js` (up to 10; types text/number/toggle/choice; key, label, default, limits; optional perGroup). Keep the two in step. The plugin guide has a new section 5b. Settings need no permission and are not part of the permission/risk screens.
- Bot side (v1.5.0): owner commands `.plugin options <name>` and `.plugin option <name> <key> <value|reset>` (NOT `.plugin set`, which already sets the plugin limits); the plugin reads `ctx.settings`; values stored in `data/plugins.json` under the plugin's record (`settings.values`, `settings.groups[jid]`), kept across updates.
- Version history add: **v2.38.0**.

## 36. v2.39.0 - new permission group.admins, rename under group.manage (site side of bot v1.5.1)
- `registry.js` PERMS has `group.admins` (high risk) and the `group.manage` text now says it can rename the group; `plugin-check.js` reads PERMS, so submissions using them pass. Guide updated. Keep in step with the bot's `core/plugins/manifest.js`.
- Bot rules (v1.5.1): `tfx.group.promote/demote(member)` need `group.admins`; `tfx.group.rename(name)` needs `group.manage`. All three work ONLY inside a command used by a group admin or the owner (never listeners or timers), where the bot is an admin; promote/demote act on one person per call that was part of the command, 6 an hour, never the owner, the bot or a sudo user; demote never the group creator; promote skips someone who is already admin.
- Version history add: **v2.39.0**.

## 37. v2.40.0 - README and CHANGELOG per plugin version (site side of bot v1.5.2)
- A developer may put `README.md` and `CHANGELOG.md` next to `turbofex-plugin.json` (same tag/folder). At submit the site fetches them (`rawText`), refuses > 16 KB (counted in bytes) or non-plain-text (control chars, replacement char) with a plain message, stores `readme/readmeSha/changelog/changelogSha` on the submission, shows them to the reviewer in the admin submission page, and `/api/registry/approved` hands them (with SHA-256) to the phone command.
- `tools/registry.js` (bot v1.5.2): `pull` verifies them, `add` copies them, `build` puts `readmeSha` / `changelogSha` in the SIGNED index entry; a published version can never gain, lose or change a document (same immutability rule as the code).
- `registry.js`: `docShasOf(index)` and `registry.doc(id, version, which)` read the file from the registry repo and return it ONLY when its SHA-256 equals the signed index. `GET /api/plugin-doc?id=&v=&f=readme|changelog` (rate limited, 404 otherwise, `{paused:true}` while the store is paused). `/api/plugins` items now have `docs: {readme, changelog}` (booleans). The Plugins page shows two buttons "About this plugin" / "What changed" (plain text via textContent, `.pdoc`). Guide section 5c.
- NOT built from the audit item: icon and screenshots (need an image proxy with the same fingerprint rule because the site CSP allows only same-origin images).
- Version history add: **v2.40.0**.

## 38. v2.41.0 - anonymous bot statistics receiver (site side of bot v1.6.0)
- `botstats.js`: `POST /bot/register` -> `{botId, secret}`, `POST /bot/heartbeat` (Bearer `botId.secret`, min gap 20 h, <=50 plugins), `POST /bot/forget`. Files `data/devcentre/bot_<id>.json` mirrored to Supabase key `dc:bot:<id>`. Secret stored hashed. Purge after 90 days (7 if never reported). Totals count bots active within 8 days.
- `/api/plugins` items get `installs`; `/api/dev/me` returns `stats` for the developer's published plugins; /developers shows them (textContent only).
- Opt-in only; privacy.html explains it. Not built: bot-side ratings (`PUT /bot/reviews`).
- Version history add: **v2.41.0**.

## 39. v2.42.0 - built-in command names refused at submit
- `builtin-commands.json` = every command name and alias of the bot (generated from the bot's `commands/` folder, 773 names at bot v1.5.3). `plugin-check.js` refuses a plugin command with one of those names. Regenerate the file whenever the bot gets new commands (the bot itself still checks at install, so a stale list only means a later, not a missed, refusal).
- Version history add: **v2.42.0**.

## 40. v2.43.0 - featured plugins
- Owner-only admin route `POST /admin/api/plugins/feature {id, on}` (plugin id, max 6, audited `plugin.feature/unfeature`); stored in `data/devcentre/featured.json` (+ Supabase `dc:featured`, in the backup export). `/api/plugins` marks `featured:true`; the Plugins page sorts them first with a gold badge (`.pfeat`). Button "Feature this plugin" on a published plugin's admin page.
- Version history add: **v2.43.0**.

## 41. v2.44.0 - ratings from bot owners (site side of bot v1.5.6)
- `POST /bot/rate {plugin, stars 1-5}` (Bearer bot token): only for a plugin the bot's last report listed; one rating per bot per plugin (replace); max 50. `/api/plugins` items get `botRating {avg,count}` (separate from GitHub ratings; shown as "Rated by bot owners"). Forgetting a bot deletes its ratings. Cache of totals is 5 minutes, so the average can lag.
- Version history add: **v2.44.0**.

## 42. v2.45.0 - developer replies to the reviewer
- `POST /api/dev/reply {id, text}` (same-site header, signed-in owner of the submission; status pending/changes/rejected; 2-500 chars, control chars stripped, max 10 per version). Stored as `s.replies` in the submission file; exposed to the developer (`/api/dev/me`) and to the admin (`plugins/submission`, panel "Messages from the developer"). Reviewer answers still go through the review note. Not built: a real two-way thread.
- Version history add: **v2.45.0**.

## 43. v2.46.0 - backup for the phone command (site side of bot v1.5.7)
- `GET /api/registry/backup` (same bearer token as `/api/registry/approved`, same rate limit) returns the same JSON as the admin "Download backup". The phone tool `node tools/registry.js sitebackup <file>` saves it. `GET /health` already exists for a keep-alive pinger (UptimeRobot etc.).
- Version history add: **v2.46.0**.

## 44. v2.47.0 - developer page shows ratings, reviews and report count
- `/api/dev/me` gets `insights[pluginId] = {rating, reviews (latest 5 visible), reports (number only)}` for the developer's published plugins (only when something exists). /developers shows them with textContent. Reporters and report reasons are never sent to the developer.
- Version history add: **v2.47.0**.

## 45. v2.48.0 - invite-only beta for developers
- `data/devcentre/invites.json` `{on, logins[]}` (+ Supabase `dc:invites`, in the backup export). While `on`, `submit` refuses a GitHub login not on the list (403, clear message). Sign-in, rating, reporting stay open. Admin route `POST /admin/api/plugins/invites {on?, add?, remove?}` (owner only; audited `plugin.invites`); UI on the Plugins list page of the admin dashboard. Default: off (open to everyone).
- Version history add: **v2.48.0**.

## 46. v2.49.0 - plugin guide section 5d (the test tool of bot v1.5.8)
- Guide section 5d explains `node tools/plugin-test.js <folder>` (ships inside the bot release, no npm package). Text only; no code change. The bot tool uses the real `PluginHost` sandbox and the manifest validator, with a pretend chat and a pretend network.
- Version history add: **v2.49.0**.

## 47. v2.50.0 - private test codes (site side of bot v1.5.9)
- Developer: `POST /api/dev/testcode {id}` (own version, status pending/changes/approved, max 5 unused codes) -> `TFX-` + 8 chars, one hour, one use. Stored only as HMAC in `data/devcentre/testcodes.json` (+ Supabase `dc:testcodes`, NOT in the backup export). Bot: `GET /api/test-plugin?code=` (20 per 10 min per IP) returns `{id, version, developer, manifestRaw, entrySource, manifestSha, entrySha}` and deletes the code. The bot (`core/plugins/testcode.js`) checks the shas, writes the folder with a `.from-test` marker, then the normal confirm screen. It is NOT signed by the registry, so the owner's confirmation and the sandbox are the protection.
- Version history add: **v2.50.0**.

## 48. v2.51.0 - permission media.convert (site side of bot v1.5.10)
- `registry.js` PERMS gets `media.convert` (medium). `plugin-check.js` accepts it automatically (it reads PERMS). Guide: permission table, `tfx.media.toSticker/toAudio`, and `media.send` kind `audio`.
- Bot v1.5.10: broker `convert()` (input <=1 MB, magic-byte check, 2 per call, 6 per minute, 4 s limit), `sniffAudio`, `media.send` kind `audio`, env.toSticker/toAudio use whatsapp/media (sharp, ffmpeg; MP3 64k, 60 s).
- Version history add: **v2.51.0**.

## 49. v2.52.0 - plugin logos (site side of bot v1.5.11)
- Optional `icon.png` next to the manifest: square PNG 64-512 px, <=32 KB (checked from the PNG header). Fetched at submit (`rawBytes`), stored base64 (`icon`, `iconSha`), shown in admin as a data URL, handed over by `/api/registry/approved`; the phone tool (`tools/registry.js`, `iconOk`) re-checks, copies it to `plugins/<id>/<version>/icon.png` and puts `iconSha` in the SIGNED index (immutable like the README). `registry.icon(id,v)` serves it only if it matches the signed sha; route `GET /api/plugin-icon?id=&v=` (image/png, nosniff, CSP none). `/api/plugins` items get `docs.icon`; the Plugins page shows `<img class="picon">`. Screenshots are NOT built.
- Version history add: **v2.52.0**.

## 50. v2.53.0 - plugin screenshots (site side of bot v1.5.12)
- Optional `screenshot1.png`..`screenshot3.png` (in order, no gaps; fetching stops at the first missing one): PNG 200-2000 px each side, <=200 KB. Stored as `shots[]`/`shotShas[]` in the submission, shown in admin as data URLs, handed over by `/api/registry/approved`; the phone tool checks them again, copies them into `plugins/<id>/<version>/` and records `shotShas` in the SIGNED index (immutable). `registry.shot(id,v,n)` + `GET /api/plugin-shot?id=&v=&n=` serve only matching pictures; `/api/plugins` `docs.shots` = count; Plugins page shows a gallery (`.pshots`).
- Version history add: **v2.53.0**.

## 51. v2.54.0 - Plugin Playground (browser) - site side of bot v1.5.13
- Page `/playground` (`public/playground.html`, `playground.js`) runs a plugin IN THE VISITOR'S BROWSER: `playground-sandbox.js` (Web Worker: QuickJS WebAssembly + the bot's own `worker.js` logic) and `playground-broker.js` (the bot's REAL `broker.js` + tiny Buffer/timer stand-ins). Both are BUILT from the bot repo with `node tools/build-playground.js <folder>` (needs esbuild) and copied into `public/`. REBUILD AND RECOPY whenever the bot's `core/plugins/worker.js` or `broker.js` change (new API calls, limits), or the Playground drifts from the bot.
- Network, media conversion and the group are pretend; storage lives in the page until reload. Only the two files `playground.html` and `playground-sandbox.js` get a CSP with `'wasm-unsafe-eval'` + `worker-src 'self'`; everything else keeps the strict policy (tested). `POST /api/playground/check` (60/min/IP, nothing stored) runs `checkPlugin`.
- Verified in real Chromium (Playwright) during the build: run, storage between runs, group info, refused permission, CPU-limit loop, bad manifest, no console/CSP errors. That browser test is not part of the site's test suite (no browser on Render).
- Version history add: **v2.54.0**.

## 52. v2.55.0 - GitHub webhook (automatic sending of release tags)
- `POST /github/webhook?dev=<githubId>` (in `devcentre.js`, `webhook()`; routed from `server.js`). Verifies `X-Hub-Signature-256` (HMAC-SHA256 over the raw body) with a per-developer secret that is NOT stored: `HMAC(site secret, 'hook:'+githubId+':'+hookSalt)` first 40 hex. "Make a new secret" raises `hookSalt`. Unknown developer and wrong signature both give 401. Blocked developer 403. 404 when the Developer Centre is not configured.
- Events used: `ping`; `release` (action published, not draft/prerelease); `create` (ref_type tag); `push` to `refs/tags/*` (not deleted). Everything else is answered 200 with `ignored`. The repo in the payload must be on the developer's own list (`dev.hooks[]`, max 5, `{repo, folder, last}`; repo must belong to their GitHub login, same rule as manual send). The tag then goes through the normal `submit()` (same checks, invite-only, daily and pending limits, paused store -> 503).
- Repeats are ignored: same `X-GitHub-Delivery` (last 500 in memory), same dev+repo+tag in flight, or a live submission already holding that tag. The outcome of the latest event is saved in `hooks[i].last` and shown on the Developers page (plain text, up to 300 chars).
- Developer API: `POST /api/dev/hooks` `{action: add|remove|secret|rotate}` (same-site header required). `/api/dev/me` returns `hooks` only when there are some; the secret is never in it.
- Page: new card `dhooks` on `/developers` (instructions in plain words); guide section 5e. Body limit 2 MB. Rate limit 200 per 10 minutes per IP.
- Tests: 2 new in `test/devcentre.test.js` (site total 109). Version history add: **v2.55.0**.

## 53. v2.56.0 - collections and bundles (site side of bot v1.6.0)
- Owner builds collections in the admin dashboard (Plugins page: "New collection", edit, delete): id, name (<=40), description (<=200), 2 to 8 plugin ids, max 20. `devcentre.js` `setCollections` / `cleanCols`, file `data/devcentre/collections.json` (+ Supabase `dc:collections`, in the backup export). Route `POST /admin/api/plugins/collections` `{save:{...}}` or `{remove:id}` (owner only, audit-logged).
- `GET /api/registry/approved` also returns `collections` (always the full list, `[]` when none) so `tools/registry.js pull` can sign them into the index (bot v1.6.0). Nothing is public until it is signed: the Plugins page reads collections only from the signed index (`registry.js` `makeView`: only plugins published now are kept, a set with fewer than 2 left is hidden; `server.js` also removes plugins the owner hid). Plugins page shows a "Collections" block with the bot command `.plugin bundle <id>`.
- Tests: 2 new (site total 111). Version history add: **v2.56.0**.

## 54. v2.57.0 - website-wide interface redesign (front end only)
- Nothing in the back end, API routes, data files, sign-in or pairing changed. Only `public/` files: new shared **`ui.css`** (loaded LAST on every public page) and **`ui.js`** (loaded with `defer`), plus small edits to `plugins.js`/`plugins.html` (collections block) and `developers.html/js` (none structural).
- `ui.js` is the single source for: the complete menu (adds Plugin guide + Playground, marks the current page), the second row of tabs (Marketplace / Developer Centre / Docs / Playground, and About / Terms / Privacy), the one footer (replaces `footer.docfoot`; the home page keeps its own footer and only gets two links), the Developer dashboard (summary tiles + tabs Your plugins / Send a plugin / Automation / How it works; it only shows/hides the existing cards with the class `tab-off`, so `developers.js` still owns all forms and buttons), plugin avatars and loading placeholders on the Marketplace, and reveal-on-scroll (`.rv`/`.in`, skipped for reduced motion, forced on for print, and anything scrolled past is shown).
- It never writes raw HTML (no innerHTML; a test checks this), so the strict CSP is unchanged: only `/playground` may run WebAssembly.
- To change the menu, footer or tabs, edit `ui.js` only. Colours always come from `style.css` variables so dark and light stay in sync.
- Admin dashboard: redesigned in v2.58.0 (section 55).
- Check script kept in the working folder (not shipped): `pgtest/shoot.js` (screenshots every page, phone and desktop, dark and light) and `pgtest/flow.js` (clicks through menu, marketplace, developer tabs, webhook card, playground). Test added in `test/plugins.test.js` (site total 112).

## 55. v2.58.0 - admin dashboard redesign (front end only)
- New `public/admin-ui.css` (loaded after `admin.css`) and small edits to `admin.html` / `admin.js`. No back-end, route, permission or data change. All admin functions are untouched.
- Look: sign-in is a card on a gold glow; the top bar is the same floating pill as the public site; sidebar sections are pills with a gold active state; panels/tiles/buttons/fields/dialogs/toasts share the Developer Centre style; panels slide in with a short stagger; reduced motion switches animation off.
- New: a "TurboFex site" group of links (Pairing page, Marketplace, Developer Centre, Plugin guide, Playground) in the desktop side column (`.asite`, inside the new `.side` wrapper around `#nav`) and at the bottom of the phone menu (`openMenu` in `admin.js`), plus a slim footer (`.afoot`).
- Fixed: an empty sign-in error line no longer shows a stray "!".
- Working-folder check (not shipped): `pgtest/adminflow.js` signs in through the real form with a one-time code, opens every section, the phone menu, the collections dialog, theme switch and sign-out, on a phone and a desktop. Test added in `test/devcentre.test.js` (site total 113).


## 56. v2.59.0 - full admin page redesign (front end only)
admin.js: head() has icon tile (.vico); ctl() helper; vPluginList uses .ctls/.ctl cards, .clist collections, .subseg sub-view row. admin-ui.css 'PAGE-LEVEL REDESIGN' block styles every section (panels, kpi, tables .tr/.th, .empty, .note, .tag, forms, .seg, .sw). No inline styles (CSP). Tests: 113 pass; adminflow/flow pass.

## 57. v2.60.0 - REDESIGN PHASE 1 (design system + landing)
Owner asked (2026-11-14) for a full black/gold redesign of the whole site, PHASE BY PHASE: never start a phase before the owner confirms the previous one is complete. Plan: P1 design system + landing; P2 pairing (/pair); P3 marketplace + plugin detail; P4 Developer Centre + Developer Dashboard; P5 Admin dashboard (nav: Dashboard, Users, Plugins, Reviews, Transactions, System, Moderation, Analytics, Settings - only sections with real data/permissions); P6 docs, community, legal, support; P7 full test + report.
Rules: show real data only (no fake counts/ratings/earnings; hide what does not exist; there is no payments system, so no Transactions/Earnings until one exists); keep backend/API/auth/security; no inline styles (strict CSP).
P1 files: public/tfx.css (tokens, buttons, cards, header, menu sheet, bottom tab bar, footer, motion), public/home.html, home.css, home.js. `/` serves home.html; the old pairing page (index.html) is served at /pair (server.js PAGES). All '/#connect' links became '/pair'. Tests: 114 pass.

## 58. v2.61.0 - REDESIGN PHASE 2 (pairing page)
public/index.html (served at /pair) rebuilt on tfx.css + new pair.css + pair.js (step tracker via MutationObserver, header shadow, status pill placement). app.js is UNCHANGED and drives it by element id, so every id and state class (.tabs.qr/.ready/.locked, .collapse.off, .codeRow.wait, .ch, .dash, .cta.busy/.fail/.done, .ghost.main/.done, .sid.expired/.done, .idtimer.low/.gone/.used, .phone.bad/.good, .hint.ok/.bad, .status.done) is kept. The country picker classes were renamed .csheet* (the menu sheet uses .sheet in tfx.css). #island is now a live status pill (.live, data-state idle/working/ok/bad). #menu/#menupanel is a dropdown (.menu/.mi, .out). style.css and ui.css are no longer loaded by /pair or /. notice.js (announcement/maintenance) is loaded on / and /pair; .notice styles are in tfx.css.
Browser test: pgtest/pairflow.js (fake WhatsApp engine; code, QR, success, failure, picker, menu, FAQ; phone/desktop/light) 55 checks pass. Tests: 115 pass.

## 59. v2.62.0 - REDESIGN PHASE 3 (marketplace + plugin pages)
Shared shell: pairsite/partials/{sprite,head,foot,tabbar}.html are inserted by server.js (shellify) wherever an html page contains <!--tfx:sprite-->, <!--tfx:head-->, <!--tfx:foot-->, <!--tfx:tabbar-->. public/shell.js = header shadow, theme button, dropdown menu (#menu/#menupanel), aria-current marks, footer year. Dropdown menu css (.menu/.mi) and .btn.sm/.fine/.num/code now live in tfx.css. Partials are NOT served directly (404).
plugins.html/plugins.css/plugins.js rewritten: browse view (#pbrowse) + plugin page (#pdetail, route = location.hash = plugin id). Filters/sort use only real fields (featured, dev.verified, permissions, rating); there are NO categories in the data, so none are shown. Reviews/ratings/report code kept (ratings(p, box, onRate)). Browser test: pgtest/marketflow.js (43 checks). Tests: 116 pass.

## 60. v2.63.0 - REDESIGN PHASE 4 (Developer Centre + Developer Dashboard)
- `/developers` (developers.html/.css/.js) is on the shared shell (partials, tfx.css). Does NOT load ui.js or style.css any more.
- Signed out: `#dpublic` landing (hero, `#dstate` sign-in card, steps, rules, what we keep, resource cards). Signed in: `#dash` dashboard with `#dnav` (views: dashboard, plugins, send, tools, analytics, support, community, settings; panes `v-<name>`, URL hash picks the view).
- Same backend/endpoints (/api/dev/me, submit, withdraw, reply, testcode, hooks, logout) and same ids for the form and webhook card. Real data only: no downloads/earnings/rank (not supported). Rating and bots tiles show only when data exists.
- Added a global `[hidden]{display:none!important}` at the end of tfx.css (the menu panel showed open without it).
- Sprite got icons: grid, chart, life, send, out, puzzle, users, gear, alert, flag.
- Tests: plugins.test.js "v3 phase 4"; pgtest/flow.js developer checks rewritten; 117 tests pass.
- NEXT: Phase 5 admin dashboard (only after the user confirms Phase 4).

## 61. v2.64.0 - REDESIGN PHASE 5 (Admin Dashboard)
- admin.html rebuilt on tfx.css + new `admin3.css` (old admin.css and admin-ui.css deleted; style.css no longer loaded by admin). Shell: `#app.ashell` = left `aside.side` (brand, `#nav`, site links, `.who` with `#who-u/#who-r`) + `.main` (sticky `.ah` top bar with `#menu #theme #out`, `#view`, footer). Login = `.lg` with `.lg-art` brand panel + `.lg-box`.
- admin.js logic unchanged except TABS now carry a 4th item (group heading: Main, Marketplace, Safety, System), nav/menu draw `.ng`/`.amenu-h` headings, "Overview" renamed "Dashboard", "Plugins" renamed "Plugins and reviews". Tab ids/hash routes are the same.
- All JS-emitted classes (kpi, pnl, tbl/tr/td, tag, btn, fld, sw, seg, subseg, gauge, ctl, citem, dlg, toast...) are restyled in admin3.css; compat vars (--field, --track, --card-border, --gold-soft) are defined on `.adm`.
- No Transactions/Earnings/Analytics tabs: the site has no such data (no payment system).
- Tests: devcentre.test.js admin-redesign test now checks admin3.css; pgtest/adminflow.js and shootadmin.js pass; 117 tests pass.
- NEXT: Phase 6 docs, community, support, legal pages (only after the user confirms Phase 5).

## 62. v2.65.0 - REDESIGN PHASE 5 REDO (admin section layouts)
- User said the Phase 5 admin sections/sub-sections UI/UX were bad ("plain/boring"); chose "Rebuild layouts". Done in admin.js + admin3.css.
- New helpers in admin.js: `tabs()` (`.stabs/.stab`), `toolbar()` (search `.tq` + filter chips `.tchip`), `hit()`, `initial()`. `table()` adds a search box when a list has 7+ rows.
- Plugins is a hub (state.plug = {open, tab, q, f}): tabs queue | devs | reviews | reports | collections | store. Queue = `.pcard2` cards in `.pgrid`. vPluginReviews/Reports/Devs now return a node (pane), not a page. Submission page uses `reviewLayout()`: tabs (Review, What changed, Code, Docs and images) + sticky `.dcard` Decision card. Settings has tabs (state.set.tab: site | sec).
- Class-name traps found: `.lg` is the login page class (never reuse it for sizes); `.ptags/.pact` have `grid-column:2` inside cards.
- Tests: pgtest/admhub.js (26 checks) + adminflow.js; 117 unit tests pass.
- NEXT: Phase 6 (docs, community, support, legal pages) only after user confirms Phase 5.

## 63. v2.66.0 - REDESIGN PHASE 6 (docs, legal, community, support)
- New shared stylesheet `docs.css` + `doc.js` (builds the contents list `#toc` from the page's `h2`s; text only). Pages about, terms, privacy, plugin-guide, playground were converted to: tfx.css + docs.css, `<!--tfx:...-->` markers, `.dchero` header, `.dclay.has-toc` with `.toc` + `.prose` article. Their wording/ids are unchanged (the playground keeps its pg-* ids and scripts).
- NEW pages: `/community` (community.html) and `/support` (support.html + support.js: live /api/status, FAQ copied from the pairing page's 11 answers with a search box). Added to PAGES in server.js, the menu (`m-community`, `m-support`) and the footer.
- REMOVED obsolete: style.css, ui.css, ui.js, page.js, hero-*.webp. Nothing may load them; a test checks they return 404.
- Class trap: `.prose .upd`, `.cl`, `.link2` are old class names kept inside converted legal content and styled in docs.css.
- Tests: plugins.test.js shared-layer test covers all 7 pages; pgtest/docsflow.js (64 checks); 116 unit tests pass.
- NEXT: Phase 7 = full testing + implementation/testing report (only after the user confirms Phase 6).

## 64. Pairing code refused with 400 bad-request (v2.67.0)
Render log signature: `custom code refused 400 bad-request` then `code refused 400 bad-request`. WhatsApp refuses the request itself (not the redesign). Known cause (Baileys PR #2559): a non-standard device label, e.g. the Android identity from PAIR_BROWSER=android. Fix: PAIR_BROWSER=android now applies to QR links only; code links always use Ubuntu/Chrome; a 400 refusal retries on a fresh socket as macOS/Chrome then Windows/Chrome; log line `device identity X/Y/Z` shows what was used. Unverified against real WhatsApp (sandbox cannot reach it).

## 65. Plugin API 1.1 (site v2.68.1 + bot v1.6.1)
He asked: add all possible plugin abilities to bot and site. Bot added ctx.quote/mention/typing/poll/dm, ctx.quoted/hasMedia, tfx.group.members/describe/inviteLink, tfx.media.download, tfx.net.post, tfx.storage.chat.*, tfx.util.hash/fromBase64, events member.promote/demote; new permissions user.dm, group.members, media.read, group.invite. Site: registry.js PERMS + plugin-check.js EVENTS know them, plugin guide has section 4b quick reference, Playground rebuilt from the bot broker (tools/build-playground.js) with pretend versions (sha256 only). broker.js must stay free of require() (it runs in the browser).

## 66. Site signs the store (v3.0.1 + bot v1.6.4)
- `signer.js` builds and signs index.json from published/revoked submissions; `devcentre.js` serves it at `/registry/...` when `REGISTRY_SIGNING_KEY` is set (own key, public part in the bot's `registry-key.json` backupKeys). Approve = published at once, withdraw = revoked at once. No key = old phone flow (`pull`).
- The Plugins page reads the store in-process when the key is set. Developer cards are grouped per plugin (`public/developers.js`).

## Preinstalled plugins (site v3.0.9, bot v1.7.0) (2026-11-17)
- The owner picks published plugins in the admin "Preinstalled" tab: Off, Install only, or Install and activate. Stored in `devcentre/preinstall.json` and signed into `index.json` as `preinstall: [{id, mode}]` (always present, even empty).
- Bots read it every ~10 minutes. A plugin on the list is installed without confirm and cannot be removed by the bot owner. Off removes it from every bot. A store index without the `preinstall` field changes nothing on bots.
- The owner's rule: plugins are always on in the bot (no `.plugin on/off`), per-plugin `enable`/`disable` stays.

## New website migration (site v3.1.0, stage 0; v3.1.1 test fix) (2026-11-18)
- The owner wants the whole site redone (resend.com-like, mobile first) in React, TypeScript, Vite, Tailwind 3.4, Framer Motion, Lucide, React Router, TanStack Query. Done in stages; do not start the next stage until the owner has run `npm run verify` in `web/` and says go. The owner works only from Termux + GitHub: NO GitHub Actions, workflows or Codespaces may be required or added.
- Plan: stage 1 shell + landing + pairing page, 2 plugin store/detail/guide/docs/playground, 3 developer centre + sign-in, 4 admin, 5 support/community/about/legal + cutover. Old pages stay until the owner signs off.
- `web/` is a separate npm project (own package.json) so the backend install stays small. Built into `web/dist`, served by `nextui.js` under `/next/` only when `dist/index.html` exists. `NEXT_UI=off` disables it. Vite base comes from `WEB_BASE` (`/next/` now, `/` at the final switch).
- `render.yaml` still builds with `npm install` only. Changing the build command (add `npm --prefix web install && npm --prefix web run build`) must be announced to the owner first.
- Verification without a browser: typecheck, eslint, vitest (jsdom), build, `web/scripts/smoke.mjs`. Real browsers cannot run in Termux, so say plainly what was not checked on a real phone.
- Node on Termux has its own experimental localStorage that hides jsdom's; web/src/test/setup.ts replaces it with an in-memory copy. Do not use localStorage in tests without it.

## New website, stage 1 (site v3.2.0) (2026-11-18)
- Stage 0 was checked by the owner in Termux (`npm run verify` passed). Stage 1 = app shell, landing page, pairing page in `web/`. Stages 2-5 still wait for his go.
- Pairing page logic is in `web/src/lib/pairing.ts` (same routes as `public/app.js`: POST /api/pair, GET /api/job/:id, POST /api/cancel/:id; sessionStorage key `tfx-job`; polling 2 s, then 4 s once the WhatsApp copy result is known). Number rules come from `public/countries.js` (loaded as `window.TFX_PHONE`), so the page and server share one table; tests load that same file.
- Not carried over from the old pairing page: sound button, floating status pill. Ask the owner before adding them.
- Links to pages not yet migrated are plain `<a href="/plugins">` style links (see `web/src/lib/links.ts`).
- Colour rules (owner's wish, 2026-11-18): black is the foundation but not on every element (panel/raised graphite surfaces), text is silver, and each colour keeps ONE meaning on the whole site: gold = TurboFex/main action/current/featured, green = safe/working/verified/done, blue = learn and build/links/info, orange = careful, red = problem/removes. Tokens are in `web/src/index.css`; the Design page lists them. Do not use a colour for another meaning.
- v3.2.3 finished the Stage 1 gaps: featured plugins, real numbers, announcement/maintenance notice, example chat in the hero.
- v3.2.5: landing page restyled glass/3D after the owner said it looked plain and old (`web/src/components/fx`: Glass, Backdrop, Tilt, HeroScene, Bento, Marquee, Counter). Keep it this way on the other pages; colours keep their meanings.

## New website, Phase A (site v3.3.0) (2026-11-18)
- Owner sent a Resend mobile reference and a full reconstruction brief. He approved the plan but said: NO gold or gold accents. New identity = near-black, silver gradients, serif display headline, one violet accent (`--accent` in web/src/index.css and `--tf-accent` in web/src/ui.css). Dark only (theme toggle and light theme removed).
- Phase A = design system v2 (`web/src/ui.css`, fonts from @fontsource packages) + landing sections: hero with CSS 3D block, Works with (real things only, no company logos), Link in a minute, code panel (real plugin-guide examples), Test mode + event timeline (labelled Example/Preview, links to the real Playground), minimal nav with full-screen mobile menu.
- Rules he set: mobile-first (not a scaled-down desktop), only genuine integrations, honest demos, same quality on every page later, keep the rollback (`NEXT_UI=off`), STOP after Phase A for his review. Phase B (v3.4.0) = developer experience, previews, plugin building, infrastructure/security, community, closing headline, new footer with status pill. Then pairing restyle, store/docs/playground, Developer Centre, admin, support/legal, cutover.
- Phase A keeps only the real-data blocks (status, numbers, featured plugins) and the old footer below the new sections until Phase B. Old glass sections (quick links, bento, marquee, steps) were removed.

## Landing page direction change (site v3.4.0) (2026-11-18)
- Owner: TurboFex is a COMPLETE WhatsApp bot platform, not mainly pairing and plugins. The homepage must explain the bot first, then deployment, then pairing (one capability), plugins/marketplace/Developer Centre/docs/playground, management, and a PLANNED hosting panel ("Coming later: deploy and manage your bots from one panel."). Planned must always be visibly separate from available.
- Information architecture reference: the owner's white CYPHER-X screenshots (intro, repo, deploy options, install guide, pairing, status). Adapted to the dark TurboFex look. Do not copy their wording or numbers.
- Keep it clean, simple and premium: few effects, short text, no duplicated content. Do not classify TurboFex's own features (signed store, plugins) as outside integrations ("Built on" = WhatsApp, Node.js, GitHub only). No invented features, stats, customers or deploy options. No GitHub star or fork counts.
- Facts are in `web/src/lib/platform.ts`, checked against the bot project (bot v1.7.1: 322 member commands, 402 with owner-only, 13 categories; hosting: Termux, VPS with systemd or pm2, Docker, hosting panels, web-service hosts with Procfile and app.json, Windows or Mac). The owner has not tested panels or Docker himself: never write "tested on".
- Hero pill = "v<bot version> · Open source" linking https://github.com/nels0nfx/TurboFex (owner approved).
- Phase B was folded into this. Next: pairing page restyle, then store/docs/playground, Developer Centre, admin, support/legal, cutover. Nothing is switched to the live site without his approval.

- v3.5.0 (2026-11-18): the new Pair page uses the v2 look (tf-h2/tf-silver heading, rounded-2xl Card, tf-cards for the safety points). Pairing logic untouched. Owner said "not satisfied, just continue" after v3.4.0 with no details: I continued with the planned next step (pairing restyle); ask him what he is unhappy with if he does not say.

## New website, restructure (site v3.6.0) (2026-11-19)
- Owner approved the page-by-page restructure and the three mobile mockups (Home, Bot, Install). Rules he set: keep the existing HTML, CSS, vanilla JS and Node.js setup (NO React or other framework; `web/` is frozen but kept, `NEXT_UI=off` stays); each page has ONE purpose (Home = intro hub, Bot = features, Install = install and hosting, Pair = WhatsApp linking); same width, margins, type scale, card style, spacing, buttons and nav everywhere; footer on EVERY redesigned public page; not every component an identical card (same tokens, layout fits purpose); concise text, nothing repeated across pages; command counts verified against the real bot code; test at 360 and 390 px (no clipped content, sideways scroll or overlap); existing site stays live and rollback kept; never deploy or switch the live site without his approval; stop for review after each version.
- WhatsApp warning wording (use it everywhere): TurboFex uses an unofficial WhatsApp Web connection, not the official WhatsApp Business Platform; WhatsApp may restrict or ban numbers that use it; use a spare number and consider the account risk.
- Status rule: never write "All systems online" unless the server says so. The footer pill reads /health and /api/status (Server online / Paused for maintenance / Status unavailable). Status page later = live state only, no invented pairing statistics.
- Built so far: `public/tf2.css`, `tf2.js`, `partials/head2.html`, `foot2.html`, `public/new-home.html` served at `/new` (preview, `<meta robots noindex>`; `NEW_SITE=off` hides it). Page markers `<!--tfx:head2-->`, `<!--tfx:foot2-->`, and `<!--tfx:n:commands|categories|version-->` (numbers from `public/commands.json`). No inline style or script is allowed (site CSP), so the 3D block is plain classed elements.
- `tools/refresh-commands.js <bot folder>` rebuilds `public/commands.json` from the real bot source and validates before replacing. Run it in Termux after every bot release that adds or removes commands, then push the site.
- Fonts: system font stacks only (no font files). Instrument Serif is not installed, the headline uses a serif fallback.
- Plan: v3.7.0 Bot + Install pages (then point the menu and Home links to /bot and /install), v3.8.0 Pair restyle + Status, then Plugins, Docs, Playground, Developers, admin, support/legal, then cutover (point `/` at the new Home). Old pages still use tfx.css (gold, light and dark) until their turn.
- Test note: in the AI workspace the older site tests (plugins 2, devcentre 10) fail the same way on v3.5.0 because packages are missing there; run the full `npm test` in Termux. New tests: `test/newsite.test.js`.

- v3.6.1 (2026-11-19): fixed two stale tests (plugins.test.js no longer expects id="yr" on /plugins; site.test.js no longer expects the WhatsApp channel link on /pair). Both were out of date since the v3.0.5 footer removal. When `npm test` fails, the push command stops, so fix tests before handing over a push block.

- v3.6.2 (2026-11-19): real Termux test run showed 12 stale tests. Devcentre tests now send the review checklist (CHECKS in test/devcentre.test.js, same keys as NEED in admin.js); plugins.test.js checks the header only on text pages; admin health shows at least 1 CPU core (Termux reports 0). The AI workspace cannot run test/site.test.js (it hangs there), so the owner's Termux run is the real check: always ask him to paste failures.

- v3.7.0 (2026-11-19): Bot and Install previews at /new/bot and /new/install (new-bot.html, new-install.html). The category list is drawn by the server from public/commands.json via the marker <!--tfx:cats--> (renderCats in server.js; CAT_EXAMPLES are hand-picked example names, only shown if the name exists in the list, otherwise the first commands are used). Install commands were checked against the bot README (v1.7.1): Termux, VPS, Docker, panel, web host, Windows/Mac. Tabs and Copy are in tf2.js; without JavaScript every guide stays visible. Never write "tested on" for panels or Docker (the owner has not tested them). Internal links use /new/... until the cutover; at cutover change them (partials, Home, pages) to /bot and /install.
- Next: v3.8.0 Pair restyle (flow unchanged) + Status page (live state only), then Plugins, Docs, Playground, Developers, admin, support/legal, cutover. Owner approves each version before the next starts.

- v3.8.0 (2026-11-19): /new/pair (new-pair.html + tf2-pair.css) reuses the live pairing scripts unchanged. app.js needs old-header controls, so the page carries a hidden stub block (#theme, #menu, #menupanel, #m-code, #m-qr, #m-sound, #m-sound-t) and the island (#island). The new header uses #tmenu/#tmenupanel and the footer pill #sitestatus, because app.js also uses #menu, #menupanel and #status. sound.js, notice.js, theme.js and shell.js are NOT loaded there (notice and status are in tf2.js). A test checks every `$('id')` in app.js exists on the page. If app.js gets a new id, the page must get it too.
- /new/status (new-status.html, tf2-status.js, tf2-status.css): reads /health, /api/status and /api/plugins when opened and on "Check again" (and every 60 seconds while the tab is visible). Live state only, no stored history. The Plugin store row shows Unavailable when no registry is configured. Do not add uptime, counts or pairing activity (owner said never invent them).
- Next (needs owner approval first): the remaining pages (Plugins, Docs, Playground, Developers, admin, Support, About, Terms, Privacy, Rules, Community) in the new look, then the cutover. At cutover: `/` serves the new Home, /bot /install /pair /status become the real addresses (replace /new/... links), and old pages stay reachable only until removed. Keep NEXT_UI and NEW_SITE switches until the owner says they can go.

## v3.9.0 - text pages (preview)
- /new/about, terms, privacy, rules, community, support = new-*.html, styled by tf2.css + tf2-doc.css, reuse doc.js (contents row) and support.js unchanged. Wording is copied from the live pages; test/newsite.test.js compares it, so edit BOTH when legal text changes until cutover.
- Links inside these pages point to /new/... (to be swapped to real addresses at cutover). Hidden by NEW_SITE=off.
- Still to do: Plugins, Docs (plugin-guide), Playground, Developers, admin, then cutover (needs owner approval).

## v3.10.0 - Docs and Playground (preview)
- /new/docs (from plugin-guide.html) and /new/playground (from playground.html) = new-docs.html, new-playground.html, styled by tf2.css + tf2-doc.css. Same doc.js, playground-broker.js, playground.js. new-playground.html gets the same WebAssembly CSP as playground.html (server.js). Wording copied from the live pages; a test compares it, so edit BOTH until cutover.
- Still to do: Plugins store (script-built markup, own version v3.11.0), Developers, admin, then cutover (needs owner approval).

## v3.11.0 - colours and Plugins store (preview)
- Owner-approved colour system (tf2.css tokens): surfaces s1/s2/s3, line/line2, main button violet (--btn), four buttons (.btn.p main, .btn secondary, .btn.q quiet, .btn.d danger). Green/amber/red = status only. Identity colours vio/sky/cyan/pink/fuc ONLY for command categories (CAT_TONE in server.js, class tone-*) and the "start here" icons on Home. Most icons stay neutral. Do not make every icon a coloured square.
- Icons: the old sprite.html is injected once through head2 (nested marker handled in server.js). Use <svg><use href="#i-name"/></svg>.
- /new/plugins = new-plugins.html + tf2-plugins.css, same plugins.js (hash links #plugin-id). Detail order is done with CSS only (display: contents + order). Sign-in link from the store still returns to the old /plugins until cutover.
- Owner said: Admin must NOT share the public design system; visual changes only, no change to permissions/actions/backend. Planned order: v3.12.0 Developer Centre, v3.13.0 Admin, then cutover (needs approval). Owner wants simple words, not a copy of the old site.
- Push block for the owner's phone: repo folder is ~/TurboFex-Pairing-site and its top level IS the site; the ZIP holds changelog.txt + pairsite/, so unzip to a temp folder and copy pairsite/. into the repo (see delivery message).

## v3.12.0 - Developer Centre (preview)
- /new/developers = new-developers.html + tf2-dev.css, same developers.js (unchanged; it builds the nav, cards, tiles and forms, so tf2-dev.css styles every class it creates). Signed-out and signed-in views are both in the one page. Status tags: ok green, wait amber, bad red. btn-gold = main, btn-ghost = secondary, btn-soft = danger.
- GitHub sign-in (/auth/github) still returns to the old /developers until cutover.
- Still to do: Admin (own look, visual changes only, v3.13.0), then cutover (needs owner approval).

## v3.12.1 - Developer Centre redesigned as an account app (preview)
- Owner rejected the v3.12.0 version ("copied the old layout"). /new/developers now uses dash.js (new script) + tf2-dev.css: 5 screens (Home, Plugins, Send, Stats, Account), bottom tab bar, no "Your plugins" list on Home (owner asked). developers.js stays only for the old /developers page.
- Owner wants real redesigns with short words, not old structure restyled. Show a phone mockup first for any new layout.

## v3.13.0 - Admin new look (LIVE at /admin, no preview)
- Owner approved a mockup first (rejected 5 earlier mockups; he wants the SAME look as the new site, mobile first, bottom bar with a big + like the Developer Centre, real admin feel, short words, sample data clearly labelled). Prototype file lived outside the project; it is not shipped.
- Visual only. Backend admin.js, roles (viewer, moderator, owner), permissions, API and the 5-step plugin review rule are unchanged. Quick actions only navigate (go(tab, focusFn)); they never send anything themselves.
- New `public/admin4.css` loads AFTER admin3.css: the old gold tokens (--gold, --gold-grad, --line-gold, ...) now point at violet; light mode tokens too. Note: some tokens are hex, so use color-mix() (not rgb(var(--x) / .n)) with --ok/--bad/--warn/--info/--gold. Channel tokens (--cat, --c) are r g b numbers.
- tfx.css already has global `.sheet` and `.tabbar` classes: the Admin uses `.asheet` and `.atabbar` instead. Do not rename them back.
- admin.js: NAVS (8 items) replaces the old 10-item menu for display only; TABS/VIEWS/REFRESH are unchanged and every old #hash still works (#visitors, #security, #activity, #audit ...). Safety = security + activity + audit as `.subtabs` (audit only with audit.view). drawTabbar(), openQuick(), openMenu() (More) use sheet(). Names changed: Dashboard -> Home, Visitors -> People (page titles inside views unchanged except Home).
- Chart bars: JS uses class `abar` for chart rects; admin4.css styles `.chart .abar` (was black before).
- Tests: devcentre.test.js admin redesign test also checks admin4.css and the tab bar. Browser check with the real server and 3 roles done in the workspace (screens at 390 and 1280, dark and light). Not tested on a real phone or Render.
- Rollback: restore the previous ZIP (v3.12.1). Next: final consistency check, then cutover only with the owner's explicit approval.


## v3.18.0 - cutover (owner approved: everything new goes live, keep old files)
- LIVE now: `/` = new-home.html; /install, /pair, /about, /terms, /privacy, /rules, /support, /plugins, /developers, /playground, /plugin-guide and /docs (both = new-docs.html) serve the new-*.html files (pair.html for /pair). Routing table is at the "static page" part of server.js (NEWPAGES / OLDFILES).
- Old pages (home.html, index.html, about.html, terms.html, privacy.html, plugins.html, developers.html, plugin-guide.html, rules.html, playground.html, community.html, support.html) stay in `public/` but are NOT served (404). `OLD_SITE=on` = rollback: old pages at old addresses, new ones at /new/... NEW_SITE switch is gone.
- `/new`, `/new/<page>` forward (301) to the real address. All links inside the new pages now use real addresses.
- Direct file names like /new-home.html are 404 in live mode. Do not link to them.
- Tests: newsite/plugins/devcentre/site tests boot with OLD_SITE=on (they compare new pages with the old ones); the live-mode tests are at the end of newsite.test.js.
- Tab icon: favicon.png (64) and apple-touch-icon.png (180) are the chrome TF on a dark square. Originals are not kept in the repo.

## v3.18.1
- Verified developers show a blue round mark (`vmark()` in dash.js, `.vmark` in tf2-dev.css) beside the name instead of the words "Verified developer". Title/aria-label keep the words. Not verified = the old "Developer" chip.
- Cube: three independent animations on `.cube` in tf2.css (`tfspin` on transform = Y turn + Z sway, `tftumble` on the `rotate` property = X, `tffloat` on `translate`). All gated by prefers-reduced-motion: no-preference. If an iPhone shows a still cube, check Settings > Accessibility > Motion > Reduce Motion first.

## v3.19.0
- Home: "In your chat" section (`.chat3d` in new-home.html, styles at the end of tf2.css) between Explore and Open source. Pure CSS, decorative (aria-hidden). Loop = 11 s; staged with opacity/scale keyframes (tcpop, tcpop2, tcshow1-3, tcdots, tcrep, tcrun). Base styles show the final still state; animation only inside prefers-reduced-motion: no-preference. The chat is an example only (".play calm piano"); do not add numbers or claims to it.

## v3.20.0
- Home "Extend it": the panel has the extra class `tiles` (CSS block at the end of tf2.css) which turns its rows into a 2 x 2 card grid. Same links, same icons. Get started and Coming later are unchanged.

## v3.21.0
- Brand colour token: `--brand` (and `--brand2` for hover) at the top of tf2.css; `--btn` points to it. Used by: `.btn.p`, `.logo .fx` (the "Fex" in "Turbo<span class="fx">Fex</span>", inside `.wd`), and the F of the logo (`.mark .mf`, a CSS mask of logo-f.png over the brand colour with light shading layers logo-f-hi.png / logo-f-lo.png). The T is logo-t-light.png / logo-t-dark.png (chrome). logo-light.png and logo-dark.png (full logo) are still used for the glint mask and kept. Change the brand colour only in --brand.
- Home: no "Explore" heading. `.hub3d` (Connection Hub) above the Get started label, `.eng3d` (Modular Plugin Engine) above the Extend it label; both pure CSS 3D at the end of tf2.css, only transform/opacity animated, still frame when reduced motion. Labels use `.group.mid` (centred); the "Coming later" label was left as it was.
- The tab icon (favicon.png) is not recoloured.
- Cube: `tfspin` (transform, 31 s, irregular stops), `tftumble` (rotate property, 41 s), `tffloat`.

## v3.22.0 - shared 3D scene kit
- `public/tf2-scenes.css` is the kit (frame `.sc`, stage `.st`, object `.o`, inner turner `.t`, box `.bx` from tf2.css, glass panel `.pn`, `.wire`). Per-scene classes: s-inst, s-plug, s-docs, s-play, s-dev. Positions and speeds are set with CSS variables (--x --y --fd --fl --rd --ra --rl) in classes, because the site CSP blocks inline style. `public/tf2-scenes.js` only pauses scenes off screen (adds `.off`) and in hidden tabs.
- Scenes live in the page header of Install, Plugins, Plugin Guide, Playground and Developer Centre. NOT on: Pair (only the existing icons float), About/Terms/Privacy/Rules/Support (informational), admin (own style, left alone). The old Status/Bot pages no longer exist, so they have none.
- To add a scene: copy one of the five in a page, give it a new `s-xxx` class in tf2-scenes.css, keep all motion inside the `prefers-reduced-motion: no-preference` block.
- Interface motion (tf2.css end + tf2.js): menu fade open/close (the menu now closes after 140 ms; code uses aria-expanded, not `panel.hidden`), card icon hover, panel fade-in.

## v3.22.1 - class name clashes
- Lesson: never reuse short class names across stylesheets (the Pair page already has .chips, .spin, .wire, the doc pages .pn, .rk). Chat visual classes are now `ch*` (chchips, chchip, chspin, chdots, chrep, chtk, chn, chb). Scene kit renamed: gp (panel), rack, pkgo, wr3, nde, ic3, pl3, ck3. New classes should get a unique prefix.

## v3.23.0 - admin and dev dashboard
- Admin: `admin5.css` loads last and only re-maps the colour tokens (the old "gold" tokens now hold the brand violet, light and dark), so admin3/admin4 are untouched. `.gold` text = `--brand`. Logos: logo-brand-dark.png / logo-brand-light.png (T chrome + violet F baked in, toggled by data-theme). Admin footer removed from admin.html (`.afoot` is also hidden in CSS). Sign-in page rewritten (same ids: login, f-login, u, p, c, trust, b-login, lg-err, tfxframe) with the `s-adm` scene.
- The Home "Extend it" grid class is now `xtiles` (the Developer Centre uses `.tiles` for its numbers box). Remember: unique prefixes for new class names.
