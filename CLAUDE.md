# Rolecraft Vault — project notes

A private, offline roleplay library: characters, personas, lorebooks and prompts,
with encrypted local storage. Ships as a Windows Electron app, plus an embeddable
web edition. Built for CharSnap creators.

**Read this file before changing anything.** It records decisions that are easy to
break by accident.

---

## Layout

```
app/                the Electron app (this is the product)
  main.js           main process: storage encryption, updates, Wi-Fi transfer
  preload.js        the only bridge between main and the interface
  index.html        entry page + CSP
  app.js            THE ENTIRE INTERFACE (~350 KB, compiled React) — see below
  vendor/           React UMD builds + self-hosted fonts
web/                embeddable web edition (same interface, browser storage)
build/installer.nsi NSIS script for the Windows installer
scripts/            sign-update.js, build-web.js, check-integrity.js
keys/               signing key — NEVER commit (see keys/README.txt)
dist/               build output (gitignored)
```

## The single most important thing: app.js

`app/app.js` is **the source of truth for the interface.** It is compiled-looking
code (`React.createElement`, not JSX) because the original JSX source was lost.
Dozens of tested features and bug fixes live only in this file.

- **Do not regenerate it** from a rewritten source, and do not "convert it back to
  clean JSX" in one pass. That will silently drop behaviour.
- Edit it in place. If you want to modernise, do it in small steps and launch the
  app after each one.
- After any edit: `npm run check` (syntax + integrity), then `npm start` and click
  the affected screen.

## Hard rules

1. **The interface never touches the network.** No `fetch`, `XMLHttpRequest`,
   `WebSocket`, `sendBeacon`, or `http://` in `app/app.js` or the web bundle.
   `npm run check` enforces this. Networking lives *only* in `main.js`, and only
   for the opt-in Wi-Fi transfer.
2. **Images are sacred.** Version history, JSON updates and restores capture text
   only — never `profileImg`, `banner`, `gallery`, or variant portraits. A restore
   must never change a picture.
3. **Signing key is the root of trust.** Any `.rcvup` signed with `keys/private_key.pem`
   is trusted and executed by every installed copy. Keep it offline, never commit it.
   If it leaks or is lost, every user needs a fresh installer with a new baked-in key.
4. **Renderer changes ship as `.rcvup` patches. Shell changes need a full installer.**
   Anything touching `main.js`, `preload.js`, or `index.html` cannot be delivered by
   a patch — say so explicitly when handing over builds.
5. Updates are **cumulative full bundles**, not diffs. The newest `.rcvup` contains
   everything; only ever distribute the latest.

## Data model (all values are strings in encrypted key/value storage)

| Key | Contents |
|---|---|
| `chars:all` | array of characters |
| `personas:all` | array of personas |
| `lore:all` | array of lore entries |
| `prompts:all` | array of prompts |
| `img:<id>` / `th:<id>` | original image / thumbnail (data URLs) |
| `buckets:meta`, `pbuckets:meta` | bucket covers + empty buckets |
| `lore:meta`, `prompts:meta` | book covers + empty books |
| `blurset` | ids of blurred images |
| `ui:charsort`, `ui:textsize`, `ui:dashorder`, `ui:advopen` | preferences |

Character: `{id, name, age, gender, pronouns, tagline, tags[], bucket, lorebooks[],
story, personality, scenario, firstMessage, exampleMessage, creatorMemo,
systemPrompt, alwaysActiveSystemPrompt, variants[], sections[], sectionOrder,
profileImg, banner, gallery[{imgId, caption, album, variantId}], albums[],
imgMeta{}, history[]}`

- `variantId` on a gallery image: `""` = shared by all variants,
  `"__default__"` = Default only, otherwise a variant id.
- `imgMeta[imgId]` carries album/variant for images that aren't gallery entries
  (portraits, banner).
- `history[]` = up to 20 text-only snapshots for restore.

**Preferences must load only after the vault is unlocked.** Reading storage while
locked fails silently and resets the preference — this was a real bug. Gate those
effects on `authState.checked && !authState.locked`.

## Security model

Every value: optional AES-256-GCM (PBKDF2, 210k) with the master password, then
wrapped again by Windows DPAPI via `safeStorage`. The PIN is convenience only.
Exports are deliberately plaintext. Wi-Fi transfer is LAN-only, opt-in, and the
payload is encrypted with a key derived from the one-time pairing code.

## CharSnap interop (learned the hard way)

CharSnap's **export** format and its **import** format are different. Import
requires top-level `name, gender, tagline, variants[]`, and per-variant
**snake_case** keys: `personality, description, first_message, age` (age is a
string), plus optional `scenario, example_message, system_prompt,
always_active_system_prompt, creator_comment, variant_name, variant_tagline`.
Emitting the 16-key export shape fails validation. Lorebook import uses the Chub
structure plus CharSnap's own fields, and every entry needs ≥1 trigger.

## Versioning

The displayed version is a flat number — **1.092** — not semver. It lived in five
places that had drifted to three different values, so it now has one owner:

```bash
npm run set-version 1.092    # rewrites all four display sites at once
```

That rewrites `APP_VERSION` in `app/app.js`, `FACTORY_BUILD` in `app/main.js`,
`app/package.json`, and `!define VERSION` in `build/installer.nsi`. Never edit
those by hand.

The **root `package.json` keeps its own semver** (`1.9.3`) and is intentionally
left alone: npm requires valid semver there, and `1.092` is not. Nothing
user-facing reads it — it only names the npm scripts. This is safe because the
update system never compares versions: `main.js` treats `pkg.version` purely as a
display string, so a `.rcvup` installs regardless of what came before.

Add a `CHANGELOG` entry in `app/app.js` for anything users would notice. Entries
before 1.092 are reconstructed from the code, not a real record — the UI says so,
and that label should stay.

## Ship procedure

```bash
npm run set-version 1.092           # keep every version site in step first
npm run check                       # syntax + no-network sweep
npm start                           # launch and actually click the thing
npm run build:web                   # regenerate the web bundle from app/app.js
npm run sign 1.092 "what changed"   # -> dist/Rolecraft-update-1.092.rcvup
npm run build:installer             # only when app/main.js|preload.js|index.html changed
```

`build:installer` needs a staged Electron build at `dist/Rolecraft Vault/`, which
is gitignored and therefore missing on a fresh clone. To rebuild it: copy
`node_modules/electron/dist` there, rename `electron.exe` to
`Rolecraft Vault.exe`, delete `resources/default_app.asar`, and copy `app/` into
`resources/app/`. It also needs NSIS (`winget install NSIS.NSIS`); winget does not
put `makensis` on PATH, so `scripts/build-installer.js` looks in Program Files.

## Testing notes

There is no test suite yet; changes have been verified with headless DOM harnesses
and by hand. Good first improvement: move those harnesses into `tests/`. Things a
headless harness *cannot* check — image uploads (needs a real canvas for
thumbnails) and a real two-device Wi-Fi transfer — must be tried in the running app.
