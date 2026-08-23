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
  app.js            THE ENTIRE INTERFACE (~640 KB, compiled React) — see below
  icon.ico          the app's crest, 10 sizes; BrowserWindow and the shortcuts
  icon.png          the same at 256, for anything that will not take an .ico
  vendor/           React UMD builds + self-hosted fonts
web/                embeddable web edition (same interface, browser storage)
mobile/             Android app: the web edition in a WebView (see mobile/README.md)
installer/          HD Electron setup UI (index.html + static crest backdrop,
                    dust and light animated around it) — this is the window
                    people see. Silent NSIS only wraps it into one .exe
build/              installer.nsi (silent wrapper) + setup-icon.ico
scripts/            set-version, sign-update, build-web, build-installer,
                    check-integrity, scan-js, and the test-* checks below
keys/               signing keys — NEVER commit. private_key.pem signs .rcvup
                    updates; rolecraft-release.jks signs the APK and its password
                    is in android-keystore.txt. Losing the jks means no phone can
                    update without uninstalling, which erases that vault
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

Editing it by script is normal here. Two things bite repeatedly:

- **Anchors must match indentation exactly.** Nested blocks are indented 4 and 6
  spaces, not 2 and 4. Print the target with `JSON.stringify` before writing an
  anchor rather than retyping it from a trimmed listing.
- **Backslashes get eaten by the shell.** `\n`, `—` and regex escapes have
  been mangled three separate times inside `node -e` and heredocs, producing
  silently wrong code (`/\B(?=(\d{3})+(?!\d))/g` became `/B(?=(d{3})+(?!d))/g`
  and stopped grouping numbers). Write the patch to a file with the Write tool and
  run it with `node`, or build the backslash with `String.fromCharCode(92)`.
- `app/main.js` is **CRLF**, `app/app.js` is **LF**. A multi-line anchor written
  with `\n` will not match main.js. Convert, or match single lines.

## Hard rules

1. **The interface never touches the network.** No `fetch`, `XMLHttpRequest`,
   `WebSocket`, `sendBeacon`, or `http://` in `app/app.js` or the web bundle.
   `npm run check` enforces this. Networking lives *only* in `main.js`, and only
   for the opt-in Wi-Fi transfer.
2. **Images are sacred.** Version history, JSON updates and restores capture text
   only — never `profileImg`, `banner`, `gallery`, or variant portraits. A restore
   must never change a picture. **Use `charImgIds(c)` / `personaImgIds(p)` for any
   list of a record's images.** Seven places once built that list by hand and only
   one remembered that a *variant carries its own `profileImg`*, so variant
   portraits went missing from the backup, both exports, the pictures zip, the blur
   list and the stats count (fixed in 1.151). Never write that list out again.
3. **Signing key is the root of trust.** Any `.rcvup` signed with `keys/private_key.pem`
   is trusted and executed by every installed copy. Keep it offline, never commit it.
   If it leaks or is lost, every user needs a fresh installer with a new baked-in key.
4. **Renderer changes ship as `.rcvup` patches. Shell changes need a full installer.**
   Anything touching `main.js`, `preload.js`, or `index.html` cannot be delivered by
   a patch. Since 1.150 this is enforced rather than remembered: `npm run sign`
   diffs those three files against the last release tag (ignoring the version
   stamp), marks the package, and the app refuses a patch that needs the installer,
   naming it. `--shell` / `--no-shell` override the detection. Say which artifact is
   needed in the release notes regardless.
5. Updates are **cumulative full bundles**, not diffs. The newest `.rcvup` contains
   everything; only ever distribute the latest.
6. **Never reference a file from `app.js` by a bare relative path.** A patch is
   loaded from the updates folder and `resolveEntryFile` writes the page it runs
   in there too, so `"vendor/crest-256.png"` resolves beside the patch, where
   there is no `vendor/`. It rewrites `src=`/`href=` in the HTML and `url('vendor/`
   in the CSS, but it cannot rewrite a string the interface builds at runtime.
   Use `ASSET_BASE`, which reads back a script tag the shell has already
   rewritten and is correct with a patch, without one, and in the web and Android
   builds. This cost the crest on the lock screen and in the sidebar for every
   patched copy from 1.166 to 1.191, and looked like a one-off glitch because
   pictures (data URLs) and fonts (named in the CSS) kept working. Since 1.192
   `main.js` also writes a `<base>` into that page, so a bare path degrades to
   merely wrong rather than broken — do not rely on it.

## Data model (all values are strings in encrypted key/value storage)

| Key | Contents |
|---|---|
| `chars:all` | array of characters |
| `personas:all` | array of personas |
| `lore:all` | array of lore entries |
| `prompts:all` | array of prompts |
| `trash:all` | the bin: `[{tid, type, record, deletedAt}]`, purged after 30 days |
| `img:<id>` / `th:<id>` | original image / thumbnail (data URLs) |
| `sz:<id>` | byte size of that image, written once by `saveImage` so stats need not re-read it |
| `buckets:meta`, `pbuckets:meta` | bucket covers + empty buckets |
| `lore:meta`, `prompts:meta` | book covers + empty books |
| `blurset` | ids of blurred images |
| `ui:charsort`, `ui:textsize`, `ui:contrast`, `ui:cardsize`, `ui:dashorder`, `ui:advopen` | preferences |
| `thumbver`, `charfields`, `lorefields` | **one-time migration markers.** Each guards a migration that runs once and then writes its marker. Do not clear or reuse them. |

Character: `{id, name, age, gender, pronouns, tagline, tags[], searchables[],
bucket, lorebooks[], story, personality, scenario, firstMessage, exampleMessage,
creatorMemo, systemPrompt, alwaysActiveSystemPrompt, nsfw, nsfwPicture, variants[],
sections[], sectionOrder, profileImg, banner, gallery[{imgId, caption, album,
variantId}], albums[], imgMeta{}, history[], createdAt, updatedAt}`

- A **variant** carries its own `name`, its own copies of the text fields, and its
  own **`profileImg`**. That last one is the trap in rule 2.
- `variantId` on a gallery image: `""` = shared by all variants,
  `"__default__"` (`DEFAULT_VID`) = Default only, otherwise a variant id.
- `imgMeta[imgId]` carries album/variant for images that aren't gallery entries
  (portraits, banner).
- `history[]` = up to 20 text-only snapshots for restore.

**Preferences must load only after the vault is unlocked.** Reading storage while
locked fails silently and resets the preference — this was a real bug. Load them in
the same gated block as the records, not in their own effect.

## Security model

Every value: optional AES-256-GCM (PBKDF2, 210k) with the master password, then
wrapped again by Windows DPAPI via `safeStorage`. The PIN is convenience only.
Exports are deliberately plaintext. The web edition uses IndexedDB + WebCrypto with
the same contract, minus the DPAPI wrap.

Wi-Fi transfer is LAN-only, opt-in, and the payload is encrypted with a key derived
from the one-time pairing code. The sharing device is **passive**: it serves
`/whoami`, `/manifest` and `/delta` and is never modified by a transfer. Since 1.152
a **mirror** (the only operation that deletes) also asks the other device over
`/mirror-request`, which holds the HTTP response open while that device shows a
dialog; it can allow, refuse, or reverse the direction. Everything fails closed —
no answer, no window, or an older build all mean refuse. Since 1.153 the manifest is
built when sharing starts rather than when it is asked for, because building it
reads and decrypts every record and used to blow the receiver's timeout.

## CharSnap interop (learned the hard way)

CharSnap's **export** format and its **import** format are different. Import
requires top-level `name, gender, tagline, variants[]`, and per-variant
**snake_case** keys: `personality, description, first_message, age` (age is a
string), plus optional `scenario, example_message, system_prompt,
always_active_system_prompt, creator_comment, variant_name, variant_tagline`.
Emitting the 16-key export shape fails validation. Lorebook import uses the Chub
structure plus CharSnap's own fields, and every entry needs ≥1 trigger.

There are **two importers**: "Import JSON" (Basics tab) takes a whole character;
"Import Variant" (Details tab) takes a **bare variant object with the fields at the
root**. They are not interchangeable.

- Custom sections have no CharSnap equivalent, so they are folded into the
  description by `foldSections`, each headed `Title: text` on the same line, single
  spaced inside a section with a blank line between sections.
- Four section titles are claimed instead of folded: "System override", "NSFW system
  override", "Prefill instructions" and "Additional first messages". **Only the
  first section claiming a title gets it**; a duplicate falls back into the
  description. `sectionKinds()` and `splitCharSnapSections()` are built from the same
  rule so the token counter and the export cannot disagree.
- "Hide guts" has no flag in the file: it *is* `|~ … ~|` wrapped around the
  description and personality. Offered as a separate export rather than stored on
  the character.
- At most 5 versions per character, 3 lorebooks per bot, 1500 characters per entry.

## Versioning

The displayed version is a flat number — **1.192** — not semver. It lived in five
places that had drifted to three different values, so it now has one owner:

```bash
npm run set-version 1.192    # rewrites all six display sites at once
```

That rewrites `APP_VERSION` in `app/app.js`, `FACTORY_BUILD` in `app/main.js`,
`app/package.json`, `installer/package.json`, `!define VERSION` in `build/installer.nsi`, and both
`versionName` and `versionCode` in `mobile/android/app/build.gradle`. Never edit
those by hand. `npm run sign` refuses to sign when the version does not match
`FACTORY_BUILD`.

The Android `versionCode` has to be a plain increasing integer, so it is derived
by flattening the display version: 1.192 becomes 1192. It was added late — the
Android project sat at `versionName "1.0"` / `versionCode 1` for every release up
to and including 1.158, which is exactly the drift this script exists to stop.

The **root `package.json` keeps its own semver** (`1.9.3`) and is intentionally
left alone: npm requires valid semver there, and `1.156` is not. Nothing
user-facing reads it — it only names the npm scripts.

Add a `CHANGELOG` entry in `app/app.js` for anything users would notice, written
for a user rather than a developer. Entries before 1.092 are reconstructed from the
code, not a real record — the UI says so, and that label should stay.

## The in-app guide

`GUIDE` in `app/app.js` is a 15-section contents page. It is plain JSON, so it can
be parsed, edited and re-serialised with `JSON.stringify(G, null, 2)` rather than
patched by hand.

- **No em dashes anywhere in it.** Asked for directly. Rewrite the sentence rather
  than swapping the punctuation.
- It is shown in both editions, so anything Windows-only (device transfer, updates)
  must say so.

## Ship procedure

```bash
npm run set-version 1.156           # keep every version site in step first
npm run check                       # syntax + no-network sweep
npm start                           # launch and actually click the thing
npm run build:web                   # regenerate the web bundle from app/app.js
npm run sign 1.156 "what changed"   # -> dist/Rolecraft-update-1.156.rcvup
npm run build:installer             # always, so both artifacts exist
```

Ship **both** artifacts every time, and say in the release notes which one is
actually needed. Verify the published `.rcvup` afterwards by downloading it,
base64-decoding `files["app.js"]` and comparing sha256 against the local build —
a release once went out without the changes it claimed.

`build:installer` needs a staged Electron build at `dist/Rolecraft Vault/`, which
is gitignored and therefore missing on a fresh clone. To rebuild it: copy
`node_modules/electron/dist` there, rename `electron.exe` to
`Rolecraft Vault.exe`, delete `resources/default_app.asar`, and copy `app/` into
`resources/app/`. It also needs NSIS (`winget install NSIS.NSIS`); winget does not
put `makensis` on PATH, so `scripts/build-installer.js` looks in Program Files.

## Layout notes

- A record that opens over the library (character, persona, editor) is a
  `.scrollbody.sheet`: `position: fixed`, and **must not be width-capped**, or the
  library shows around it on a large screen.
- The reading column is capped and the gallery takes the surplus, so a wider screen
  means bigger pictures rather than longer lines. Above 1700px the gallery drops its
  oversized lead tile and becomes an even grid.
- `.scrollbody` is reused by small scrollers inside panels, which is why the column
  rule is `.rcv > .scrollbody` and not `.rcv .scrollbody`.

## Phone copies dying while saving around 1 GB (1.168)

1.166 got the bytes onto the phone. Saving then stuffed every picture into IndexedDB. Android WebView IDB fills up around a gigabyte (QuotaExceededError, or a put that never returns), so a 4 GB vault stopped at about 30%. The UI also failed to clear its busy state if `storage.set` threw.

Since 1.168, Capacitor stores anything over 16 KB as a file under `Directory.DATA/kv/` in 384 KB chunks, with only a `file:` pointer in IDB. `window.storage` still returns the same strings. The browser edition is unchanged. Retrying a merge after install skips hashes that already match.

## Encrypted vault folder on Android (1.172)

Holding those files as UTF-8 data-URL strings and then `get()`-ing them back into the WebView is what made a multi-GB library slow and then close the app: the dashboard preloaded every picture, compare hashed by reading each original, and `imgCache` never let go.

Since 1.172, large records on Capacitor are AES-256-GCM files under `Directory.DATA/vault/` (`RCVS1` + iv + ciphertext). The wrap key is a device key in IDB when no master password is set, or the master key when one is. IDB only keeps a `bin:` pointer and the 16-char fingerprint. `hash()` of old `file:` leftovers reads bytes, not a JavaScript string. The interface on a phone loads thumbnails only, at most three at a time, and keeps 64 thumbs / 4 full pictures. `kv/` files from 1.168–1.171 still read. The browser edition is unchanged.

1.173 asks the Filesystem plugin for storage before the first write and `mkdir`s `vault/`. On Android 8–12 the plugin still prompts; without `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32) in the app manifest that prompt auto-denies and a copy fails immediately. Android 13+ does not need the prompt for app-private files.

## Phone copies dying around 130 MB (1.166)

A Capacitor HTTP response is read entirely into a Java byte array, then base64, then a JS string. Around 130 MB that stops, which is why computer-to-computer copies (streamed to disk) worked and PC-to-phone did not.

Since 1.166 the PC packs `/delta-file?i=N` batches. A picture larger than 4 MB of plaintext is its own batch, then sent in 1 MB slices (`off`/`n`). The phone decrypts each piece, saves it, and asks for the next. Both devices need 1.166. `/delta-file` with no query is still the combined file, so an older PC receiver still works.

## Android: the two things that broke transfers (1.160)

Both were found by reading Capacitor's own Android source in
`mobile/node_modules/@capacitor/android/.../CapacitorHttpUrlConnection.java`,
after two releases had shipped fixes aimed at the wrong thing. Read that file
before theorising about the transfer again.

- **`window.Capacitor.Plugins` does not exist here.** It is built by Capacitor's
  JS runtime (`@capacitor/core`), and `index.html` loads `rc-transfer.js` as a
  plain script with no bundler, so nothing ever creates it. `native-bridge.js`
  only ever *reads* `cap.Plugins`. The call that works is
  **`Capacitor.nativePromise("CapacitorHttp", "request", opts)`**, which is the
  same channel `Plugins` would have used underneath. Reaching for
  `Plugins.CapacitorHttp` threw on every request, and the error said the bridge
  had not loaded when it was the lookup that was wrong — which sent the diagnosis
  off toward Android permissions for two rounds. `INTERNET` was never missing.
- **A binary request body needs `dataType: "file"`.** Android base64-decodes the
  body *only* in that branch; otherwise it writes the string as UTF-8, so the
  payload arrives ~4/3 the length and fails to decrypt with nothing logged. It
  looks exactly like a wrong pairing code. That decode is also guarded by
  `SDK_INT >= 26`, which is why `minSdkVersion` is 26 and not 24: on 24 and 25 the
  guard skips the write entirely and the body goes out empty.
- Responses are fine as they are: `responseType: "arraybuffer"` comes back as a
  base64 string, which `ask()` already handles.
- `tests/` still does not exist, but `scratchpad/test-transfer.js` shows the shape
  that caught this: lift `ask` and `nativeRequest` out of the real file by brace
  matching, stub `nativePromise` to decode the body *the way Android does*, and
  assert the bytes an actual HTTP server receives. Note `lift()` must look for
  `async function` first or it silently drops the keyword.

**Release APKs do not look like debug APKs inside.** AGP renames resources to
short paths (`res/o-.png`, no `mipmap-` directories) and re-compresses PNGs, so
verifying an icon by path or by sha256 against the source raster both fail. Match
by decoded dimensions and look at the image. `keytool -printcert -jarfile` also
reports "Not a signed jar file" for a correctly signed APK, because it only
understands v1 JAR signing; use `apksigner verify --print-certs`.

## Icons and installer branding (1.159)

One mark across all three editions: a brass crest with a keyhole on the app's
dark blue. Letter-based designs were tried first and rejected — an initial says
nothing the name beside it is not already saying.

Everything is generated from one SVG rather than drawn per platform, so there is
no second copy to keep in step. The rasters were produced by rendering that SVG
to a canvas in the browser and reading the PNG bytes back; the `.ico` files are
assembled in Node, since an ICO is just a directory followed by the PNGs.

- **Windows app.** `app/icon.ico`. The packaged exe is a renamed `electron.exe`,
  so it wore Electron's icon and called itself Electron in file properties until
  1.159. `scripts/build-installer.js` now stamps the icon and the version strings
  with `rcedit` on **every** build, because `dist/` is gitignored and gets
  rebuilt from scratch elsewhere. Doing it once by hand would not survive.
- **Windows installer.** Since 1.165 this is a separate Electron app in
  `installer/`: a frameless 16:9 window, a still of the brass crest, gold dust
  and a breathing light around it (not a camera move — those jump when they loop).
  `scripts/build-installer.js` stages that app with the product as `resources/payload`,
  then a **silent** NSIS script (`build/installer.nsi`) wraps it into one Setup.exe.
  People never see NSIS pages. `build/setup-icon.ico` is the crest with a download
  badge so setup is telling apart from the app in a Downloads folder. Imagine
  watermarks the bottom-right of generated art; crop it off before shipping.
  A top-left crop (`crop=1100:618:0:0`) throws the subject off-centre. Take a
  square centred on the shield instead so the mark is gone and the keyhole stays
  in the middle of the lock-screen tile.
- **Android.** The adaptive icon is the two vectors in `drawable/` and
  `drawable-v24/`; the `mipmap-*` PNGs are only for launchers older than API 26,
  where the shape has to be baked in. The crest spans x 26..82, y 20..88 of the
  108dp viewport, inside the ~72dp a launcher mask may leave, so no mask clips it.
- **Web.** A 48px PNG inlined as a data URI in `web/index.html`, rather than a
  file, because the bundle gets dropped into other people's pages.
- The finish page launches the app through `explorer.exe`, not directly. The
  installer runs elevated, and a direct `Exec` would hand that elevation to the
  app; the vault is per user, so it could quietly create a second empty one under
  the administrator's account.

To preview wizard changes without installing anything, compile a throwaway copy
of `installer.nsi` with `RequestExecutionLevel user` and an empty install
section, run it, and screenshot with PowerShell `CopyFromScreen`. Call
`SetProcessDPIAware()` first or the window rectangle comes back in the wrong
coordinate space and the capture is cropped.

## Testing notes

There is no `npm test`, but `scripts/` now holds runnable checks, each written
because something shipped broken. Run them with `node scripts/<name>.js`:

| Script | What it catches |
|---|---|
| `scan-js.js` | assignment to a `const` binding — a runtime TypeError `node --check` cannot see. One of these killed every phone copy in 1.173. Takes file paths; scope-aware, and skips strings, templates, comments and regex |
| `test-update-assets.js` | the crest failing to load under an active patch (rule 6). Needs Electron; `NO_BASE=1` simulates a shell older than 1.192 |
| `test-warm-pass.js` | the background warm asking for more originals than it can keep |
| `test-image-eviction.js` | both picture caches, including that neither eviction loop can spin forever |
| `test-device-limits.js` | phone vs tablet vs desktop limits, across reported and unreported memory |
| `test-phone-image-guard.js` | the rule keeping full originals off a phone, including when a picture has never been measured |
| `test-delta-slices.js`, `test-transfer.js` | the transfer wire format and what Android actually puts on the socket |

They all follow the same rule, which is the point:

**Lift the real code and run it.** Find it in the file by name or by its first and
last line, brace-match to its end, and `new Function` it with stubs. Never retype
the logic into the test — lift it, or the test proves nothing about what ships. A
test that cannot fail proves nothing either: run it against the code *before* the
fix and watch it fail before trusting it.

What has worked well besides:

- **Lift the real function out of `app.js` and run it.** Find it by name, brace-match
  to its end, and `new Function` it with stubs for what it closes over. This has
  caught real bugs, including ones in the fix being written. Do not retype the logic
  into the test — lift it, or the test proves nothing about the shipped code.
- **Drive the web build in the browser** for anything visual, and measure rather than
  eyeball: element rects, computed styles, grid track counts.
- The transfer panel is Electron-only. To render it in the web build, stub
  `window.transfer` before opening Settings.

Things a harness **cannot** check, which must be tried by hand:

- Image uploads (needs a real canvas for thumbnails).
- **A real two-device Wi-Fi transfer.** PC to phone has been run against real
  hardware repeatedly since 1.166 and is the source of most of the transfer
  notes above. PC to PC still has not, and mirroring needs 1.153+ on both.
- **Anything needing the window itself**: full screen, and the Settings control
  for it, were checked by driving the real window and measuring its rectangle.
  Match the Electron process by pid, not by window title — `*Rolecraft*` also
  matches a browser tab on the GitHub page and the installed copy, and keys sent
  to the wrong window produce a confident, meaningless pass.

Still worth doing: a single `npm test` that runs the scripts above, and moving
them into `tests/`.
