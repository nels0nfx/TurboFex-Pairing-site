# TurboFex: notes for any AI helping the owner

**Read this whole file first.** The owner sends it to every new AI so nobody has to ask the same questions again.
**Your duty:** when the owner states a NEW preference, command or fact, add it to this file (keep the same layout), bump the "Last updated" line, and **keep it inside the site project and include it in the zip** (and mention in your reply what you added).

Last updated: 2026-11-01 (pair site v2.9.1)
Where this file lives: inside the pairing site project (the repo root of `nels0nfx/TurboFex-Pairing-site`, next to `server.js`). It is NOT in `public/`, so visitors cannot open it. Keep it inside the site zip every time, so it always travels with the project.

## 1. Who the owner is and how to talk to them
- Developer of **TurboFex**, a WhatsApp group-management bot (Node.js, Baileys 7.0.0-rc14) used by other people.
- Works **from a phone with Termux**. Hosts the bot on a **Spaceify panel**. Not a beginner but wants **plain, non-technical explanations**. No jargon, short sentences.
- Wants **exactly what was asked**. No unrequested changes, no random redesigns. Do not touch the bot when the task is about the site (and the other way round) unless asked.
- If something is unclear and expensive to redo, ask ONE short question; otherwise just do it.
- Be honest about what could not be tested (for example real iPhone Safari, real WhatsApp linking, WhatsApp buttons). Never claim "tested" for things only checked in a desktop browser.
- Deliver work as **ready-to-use ZIPs**, with **push instructions** every time (see section 4).
- Every zip must have a **higher version number in its file name** than the last one, and the reply must say: **delete the older zips from Downloads** so the wrong one is not pushed.
- Put changelog lines at the TOP of `changelog.txt`, under the heading `CHANGED IN THE NEXT VERSION`, as `- NEW (...)`, `- FIXED (...)`, `- CHANGED (...)` bullets. (Never append at the bottom.)
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
v1.x crash fix, pairing site, redesign, dark mode, floating island, sounds -> v2.0.0 black/gold redesign -> v2.1.x design correction (hero centred, light mode everywhere) -> v2.2.x island visible on Safari, refresh continues, footer space -> v2.3.0 FAQ + side-by-side cards + soft sounds + low-end mode -> v2.4.0 separate session-ID message -> **v2.5.0 links together in one message with full-width picture card -> v2.5.1 this notes file moved inside the site project -> v2.6.0 order: links first, note, session ID last; the card is the real WhatsApp Channel preview -> v2.7.0 the page detects when the bot used the ID and says so -> v2.8.0 smoother floating bar on Android, Help opens Telegram, version and footer sentence removed -> v2.8.1 shorter connection card -> v2.9.0 new hero illustration (light + dark) -> v2.9.1 current WhatsApp Web version for linking + hint on the code page -> v2.9.2 five version sources, newest wins, each logged -> **v2.10.0** new look: no hero badges, frameless full-width hero that fades into the page (CSS mask), light = ivory/champagne (--bg #FAF3E6), dark = black/gold; dark hero picture recoloured to remove the brown tint -> **v2.10.1** sharp hero (real <img> with srcset 836w/1672w from the full-size 1672px original; the dark one was rebuilt from the full-size source in one pass) + theme switch without blink: NO View Transition API any more (its snapshot lost the hero on phones); both <img> stay mounted (light underneath, dark on top), the new one is decode()d first, then `html.theming` fades everything over `--theme-t`.

## 9. Open ideas the owner has not decided
- Keep Render awake with a free pinger on `/health`.
- A "where do I put the SESSION_ID on Spaceify" line on the page.
- Real Support / Privacy / Terms pages (needs the owner's URLs or text).
- Visit/success counters were declined (the free disk is wiped), so do not add them.

## 10. New preferences go below (newest last)
- (none yet)
