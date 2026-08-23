# Rolecraft Vault

A private library for the writing behind your roleplay — characters, personas,
lorebooks and prompts. It lives entirely on your own computer. No account, no
sign-up, and no internet connection needed.

## Download

### **[Get the latest release →](https://github.com/CptBendova/RolecraftVault/releases/latest)**

**Installing for the first time? You want `Rolecraft-Vault-Setup-<version>.exe`.**
Download it, run it, and that is the whole job. Windows only.

The other file on a release, `Rolecraft-update-<version>.rcvup`, is for updating a
copy you already have: open the app, go to **Settings → App updates**, and pick the
file. Most releases change the interface only, so that small file is all you need.
When a release changes more than the interface, the release notes say so, and the
app will refuse the patch and name the installer rather than half-applying it.

Updates are cumulative, so only the newest file ever matters. The app never checks
for updates on its own and never downloads anything by itself.

Free to download and use.

## What it holds

- **Characters**, with as many versions of each as you like: the same character at
  a different age, in another setting, or written a different way.
- **Personas** — who you are playing as, rather than who you are talking to.
- **Lorebooks**, whose entries appear only when one of their trigger words comes up.
- **Prompts**, kept in collections to copy out whenever you want them.
- Pictures, galleries and albums, with per-picture blurring.
- Buckets, tags and searchable terms for finding things again.
- A token counter on every field, showing what costs you on every reply and what
  does not, using CharSnap's own accounting.
- A guide inside the app covering all of it.

## It moves between tools

Reads and writes **CharSnap** characters and lorebooks, and imports **Chub**
lorebooks and **Tavern** v1/v2 character cards, so your writing is not stuck in one
place. Exports for CharSnap can optionally hide the guts, matching what their own
toggle does.

## Your writing stays on your computer

Everything is stored encrypted on disk with AES-256-GCM, optionally behind a master
password, and on Windows tied to your account as well.

The interface genuinely cannot reach the network. That is checked rather than
claimed: the build fails if a single `fetch`, `XMLHttpRequest`, `WebSocket` or
`http://` finds its way into it. Nothing you write is uploaded, synced or analysed,
because there is no code that could do it.

The one exception is a device transfer you start yourself, which copies your vault
to another computer over your own Wi-Fi. It is off unless you open that panel, both
machines have to be on the same network, and what is sent is encrypted with a key
made from a one-time code you read off the other screen.

## Licence

**Free to use, but not open source.** The source is published so it can be read and
audited, not reused. See [LICENSE](LICENSE). If you want to do something it does not
cover, ask.

---

## Working on the code

> Read [`CLAUDE.md`](CLAUDE.md) first. It records the decisions that are easy to
> break by accident, especially: do not regenerate `app/app.js`.

Needs **Node.js 22+** and **git**.

```bash
npm install          # pulls Electron, about 200 MB, once
npm start            # launches the app
```

Your real vault is not in this folder. It lives in `%APPDATA%\rolecraft-vault\`,
and the development build reads the same place, so you will see your own characters
when it opens. **Back that folder up before experimenting.**

To sign updates you also need `private_key.pem` from the update kit, copied into
`keys/`. Without it everything else still works. It is gitignored; keep it offline.

### Commands

```bash
npm run set-version 1.154            # rewrites every place the version appears
npm run check                        # syntax, and proves the interface makes no network calls
npm start                            # run it and actually click the thing you changed
npm run build:web                    # regenerate the web edition from app/app.js
npm run sign 1.154 "what changed"    # -> dist/Rolecraft-update-1.154.rcvup
npm run build:installer              # full Windows installer (needs NSIS and a staged dist/)
```

`npm run sign` works out for itself whether a release needs the installer, by
comparing `main.js`, `preload.js` and `index.html` against the last release tag and
ignoring the version stamp. It marks the package accordingly, so a patch that cannot
work on its own is refused by the app rather than silently misbehaving. Pass
`--shell` or `--no-shell` to override it.

### Shipping

- **Interface only** (`app/app.js`): check, run it, sign, share the `.rcvup`.
- **Shell** (`app/main.js`, `preload.js`, `index.html`): a patch cannot carry these.
  Build the installer, and say so in the release notes.

Either way, say in the notes which of the two files people actually need.

### Building the installer

The window people see is a custom Electron app in `installer/` (full-HD backdrop,
not the NSIS wizard). NSIS is only a silent wrapper so there is one file to run.

1. `winget install NSIS.NSIS`
2. Unzip the portable build into `dist/Rolecraft Vault/` — it supplies the Electron runtime
3. `npm run build:installer`, which syncs `app/` into that copy, stages the HD setup UI around it, and runs makensis

### Layout

```
app/        the Electron app — main.js, preload.js, index.html, app.js, vendor/
web/        embeddable web edition (see web/INTEGRATION.md)
build/      installer.nsi
scripts/    check-integrity, build-web, build-installer, sign-update
keys/       signing key (gitignored)
dist/       build output (gitignored)
```

### Worth doing

- Move the ad-hoc DOM test harnesses into `tests/` and add `npm test`.
- Split `app/app.js` into modules **incrementally**, launching the app after each
  step. See the warning in `CLAUDE.md`.
