# Hosting ZIP (served at /download/TurboFex-hosting.zip)

`TurboFex-hosting.zip` and `hosting.json` here are served at /download/TurboFex-hosting.zip. Since v3.36.0 the Deploy page uses the ZIP ONLY for Render, Koyeb and other web hosts (they build from a GitHub repository, so they need the bot files). Every other host runs on the one-file launcher (index.js) and never touches the ZIP. Do not edit these files by hand.

## Replace it with each new bot release
```
cd ~/TurboFex-Pairing-site
node tools/prepare-hosting-zip.js ~/storage/downloads/TurboFex-hosting-vX_Y_Z.zip
git add downloads && git commit -m "hosting ZIP vX.Y.Z" && git push
```
The tool (no packages needed, plain Node 18+) takes the release ZIP and
- removes private and development-only files (`*.private.*`, `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `.cursorrules`, `KEY_ROTATION.md`, `PROJECT_GUIDE.md`, `tests/`),
- refuses to continue if a file the bot needs is missing, a relative `require` points at a removed file, or something looks like a secret,
- writes the ZIP and `hosting.json` (version, size, SHA-256, what was removed).

The site only serves the ZIP when its size matches `hosting.json`, so a half-copied file gives a 404, never a broken download.
If you add a new development-only file to the bot that must not be public, add its pattern to `REMOVE` in `tools/prepare-hosting-zip.js`.

## The one-file launcher (index.js)
`launcher.js` / `launcher.json` are the launcher people download from the Deploy page (`/download/index.js`). It must contain the text `'__TFX_SESSION_ID__'` exactly once (the line `const SESSION_ID = '__TFX_SESSION_ID__';`). The page replaces only that text, in the visitor's browser, so a session ID never reaches this server.
- Running the tool on a release ZIP that contains `deploy-index.js` updates it automatically (and keeps it out of the public hosting ZIP).
- To update just the launcher: `node tools/prepare-hosting-zip.js --launcher path/to/deploy-index.js`
- The tool refuses a launcher with no placeholder, two placeholders, a syntax error, or a session ID/secret already in it.
- Note: the launcher downloads the bot from the address written in its own `ZIP_URL` (GitHub releases unless TFX_BOT_ZIP is set), not from this site's ZIP.
