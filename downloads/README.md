# Hosting ZIP (served at /download/TurboFex-hosting.zip)

`TurboFex-hosting.zip` and `hosting.json` here are what the Deploy Centre serves. Do not edit them by hand.

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
