# Rolecraft Vault

Private, offline roleplay library — characters, personas, lorebooks and prompts,
with encrypted local storage. Windows Electron app plus an embeddable web edition.

> **Working on this with Claude Code?** Read `CLAUDE.md` first. It records the
> rules that are easy to break by accident (especially: don't regenerate `app/app.js`).

---

## First-time setup

You need **Node.js 22+** and **git**.

```bash
cd rolecraft-vault
git init && git add -A && git commit -m "Rolecraft Vault 1.9.2"
npm install          # pulls Electron (~200 MB, one time)
npm start            # launches the app
```

Your existing vault data is *not* in this folder — it lives in
`%APPDATA%\rolecraft-vault\` and the dev build reads the same place, so you'll
see your real characters when it opens. **Back that folder up before experimenting.**

### Add your signing key

Copy `private_key.pem` from your update kit zip into `keys/`. Without it you can
still develop and run the app; you just can't sign updates. It is gitignored —
keep it out of the repo and keep an offline copy.

## Everyday commands

```bash
npm start                            # run the app
npm run check                        # syntax + "the interface makes no network calls"
npm run build:web                    # regenerate the web edition from app/app.js
npm run sign 1.9.3 "what changed"    # -> dist/Rolecraft-update-1.9.3.rcvup
npm run build:installer              # full Windows installer (needs NSIS + staged dist/)
```

Run `npm run check` before shipping anything. It fails the build if interface code
gains a network call.

## Shipping changes

- **Interface only** (`app/app.js`): `npm run check` → `npm start` and click it →
  `npm run sign <version> "notes"` → share the `.rcvup`. Users install it via
  Settings → App updates. Updates are cumulative, so only the newest file matters.
- **Shell** (`app/main.js`, `preload.js`, `index.html`): a patch cannot deliver these.
  Build a full installer and tell people to reinstall.

## Building the installer

1. Install NSIS: `winget install NSIS.NSIS`
2. Unzip the portable build to `dist/Rolecraft Vault/` (it supplies the Electron runtime)
3. `npm run build:installer` — it syncs `app/` into the packaged copy, then runs makensis

## Layout

```
app/        the Electron app — main.js, preload.js, index.html, app.js, vendor/
web/        embeddable web edition (see web/INTEGRATION.md)
build/      installer.nsi
scripts/    check-integrity, build-web, build-installer, sign-update
keys/       signing key (gitignored)
dist/       build output (gitignored)
```

## Good first tasks

- Commit to git now, before changing anything.
- Move the ad-hoc DOM test harnesses into `tests/` and add `npm test`.
- Split `app/app.js` into modules **incrementally**, launching the app after each
  step — see the warning in `CLAUDE.md`.
