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
  app.js            THE ENTIRE INTERFACE (~805 KB, compiled React) — see below
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
- After any edit: `npm test` (parse, no-network sweep, const scan, and every
  check in `scripts/`), then `npm start` and click the affected screen.
  `npm run check` is the fast subset if you only want parse + no-network.

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
   **"No shell change" does not mean one artifact will do.** The detection
   answers a narrow question — is this patch safe to apply on the old shell —
   and `installer/` is outside it entirely, because a fix there does not
   invalidate the patch, it simply cannot be delivered by one. 1.206 is the
   case to remember: the detection correctly said no shell change, while the
   desktop-shortcut fix it shipped alongside existed only in `installer/main.js`
   and reached nobody except through a fresh `Setup.exe`. Read what actually
   changed, not just the verdict.
   **`app/vendor/` needs the installer too.** A `.rcvup` carries `app.js` alone,
   so a changed font, crest or React build reaches nobody — which is exactly how
   a broken crest once shipped. Since the August 2026 QA pass the detection also
   diffs `app/vendor/` against the last tag, by name rather than by line because
   those are binaries, and names the files. `test-shell-detect.js` covers both
   halves of the rule.
   **Cumulative patches carry a signed shell floor.** A renderer-only release may
   install across a version gap only when the installed shell is at least
   `UPDATE_COMPAT_BUILD`. Update that constant whenever `main.js`, `preload.js`,
   `index.html`, or `app/vendor/` genuinely changes. The signer authenticates it
   as `meta:minShellBuild`. It also keeps legacy `needsShell` routing enabled and
   points `shellBuild` at the same floor so old installed shells fail closed
   instead of ignoring metadata they do not understand. This was added after
   1.244 could be applied directly to shell 1.242 even though 1.243 contained a
   required shell change.
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
| `trash:all` | the bin: `[{tid, type, record, deletedAt}]`, purged after 30 days. `type` is `character`, `persona`, `lore` or `prompt`, but **only characters and personas are ever put in it** — `restoreFromTrash` understands all four, nothing sends the other two |
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

The displayed version is a flat number — **1.224** — not semver. It lived in five
places that had drifted to three different values, so it now has one owner:

```bash
npm run set-version 1.224    # rewrites all six display sites at once
```

That rewrites `APP_VERSION` in `app/app.js`, `FACTORY_BUILD` in `app/main.js`,
`app/package.json`, `installer/package.json`, `!define VERSION` in `build/installer.nsi`, and both
`versionName` and `versionCode` in `mobile/android/app/build.gradle`. Never edit
those by hand. `npm run sign` refuses to sign when the version does not match
`FACTORY_BUILD`.

The Android `versionCode` has to be a plain increasing integer, so it is derived
by flattening the display version: 1.224 becomes 1224. It was added late — the
Android project sat at `versionName "1.0"` / `versionCode 1` for every release up
to and including 1.158, which is exactly the drift this script exists to stop.

The **root `package.json` keeps its own semver** (`1.9.3`) and is intentionally
left alone: npm requires valid semver there, and `1.224` is not. Nothing
user-facing reads it — it only names the npm scripts.

Add a `CHANGELOG` entry in `app/app.js` for anything users would notice, written
for a user rather than a developer. Entries before 1.092 are reconstructed from the
code, not a real record — the UI says so, and that label should stay.

## Settings opens two windows of its own

`TrashModal` (Recently deleted) and `ChangelogModal` (Version history) are
separate windows, not folds inside Settings. Both were folds until 1.223, and
with fifty in the bin or a hundred and forty releases listed, opening either
pushed the rest of Settings out of reach.

- They are **state on the root**, not on `SettingsModal`, and render as its
  siblings. Nested inside it they would inherit its stacking context and its
  backdrop click. Settings stays open behind them.
- Escape is taken in the **capture phase** and stopped there, like every other
  modal here, so it closes the window without Settings acting on the same
  press. `test-modal-escape.js` exists because that went wrong once.
- The bin is grouped by kind (`TRASH_GROUPS`): Characters, Personas, Lorebook
  entries, Prompts. The last two can never fill, so they are shown disabled
  with a line saying why rather than sitting there empty. Groups start open
  when the whole bin is 15 or fewer and folded above that, and a search opens
  whichever groups it found something in — a match hidden inside a fold would
  make the search worse than useless.
- Both windows search. The changelog searches the note bodies as well as the
  headings, because what you remember is the thing that changed.

## The shell's own traps

Shell fixes cost everyone a 541 MB installer, so it is worth finding them in
batches. What the August 2026 sweep turned up, all fixed in 1.227:

- **`encodeValue` falls back to `"raw:"` when there is no master key.** Anything
  writing while locked therefore stored the record with no password layer at
  all, under DPAPI only, while `security.json` went on saying a password was
  set. `vault-set` and `vault-delete` were gated; **receiving a transfer was
  not**, and it writes every record that arrives. `writeValue` itself now
  refuses when `isLocked()`, which covers every caller including future ones.
  Gate the IPC entry points too, for a message the panel can show.
- **A transfer writes your records to disk in the clear.** `transfer.plain` is
  the decrypted stream, applied a line at a time. The receive path removes it on
  every exit it controls, but a crash or a force quit is not one of them.
  `clearTransferLeftovers()` sweeps it, `incoming.bin` and `transfer.bin` at
  startup as well as at the end of a transfer. It must not touch `updates/current/`,
  which is the installed patch.
- **The main process had nothing catching a throw.** Anything outside an
  `ipcMain.handle` — a timer, a stream callback, a socket — ended the process and
  the window simply vanished. `process.on("uncaughtException")` and
  `unhandledRejection` now log instead.
- **The transfer server listened on `0.0.0.0`** when `lanAddress()` had already
  worked out the one address it wanted, so it also answered on VPN and virtual
  adapters. It binds to `ip`.
- **`x | 0` is 32-bit.** The range arithmetic in `sendFile` wrapped any offset
  past 2 GB to a negative number. Vaults here run to several gigabytes.

`main.js` is **CRLF**: build every multi-line anchor by joining with `
`, or
it will not match. Check the file is still all-CRLF after editing it.

To try the real shell without touching the real vault:
`npx electron app --user-data-dir=./tmp-vault --remote-debugging-port=9333`,
then drive `window.storage` over CDP. Kill stray `electron.exe` first or the
user-data folder stays locked and the next run cannot start.

## Nothing may take the whole interface down

`app.js` mounts inside a `Boundary` class component (`getDerivedStateFromError` /
`componentDidCatch`). Before 1.226 there was none, so **any** error thrown while
drawing unmounted the entire tree: the page went blank, and with nothing left on
it there was no way to reach Settings and undo whatever caused it. One bin entry
whose `record` had gone was enough. The fallback offers Try again and Reload and
says the vault is untouched.

Two things follow from this:

- **`scripts/build-web.js` pins the desktop mount as an exact string** and stops
  the build if it does not match, rather than shipping a web bundle that mounts
  nothing. Changing how the app mounts means updating `DESKTOP_MOUNT` there. It
  caught exactly this in 1.226 — and note the failure is only visible if you read
  the build output, because `npm run build:web` printing an error while a `grep
  Wrote` finds nothing looks the same as success.
- A boundary is a backstop, not a licence. Anything drawing from stored data
  should still tolerate a record that is missing or malformed — `t.record || {}`
  rather than `t.record.name`.

**A list grouped by a fixed set of kinds needs a catch-all.** `TRASH_GROUPS` ends
with `{ type: null, label: "Other" }` and `trashGroupOf()` routes anything
unrecognised into it. Without that, grouping the bin in 1.225 made entries of any
other kind invisible while Settings went on counting them, so they could be
neither restored nor removed.

## The bin owns the pictures of what is in it

Nothing that removes a record may drop its images. `deleteChar` never did;
the JSON import's overwrite path did, which is why an overwritten character
could not be restored until 1.224. Move the record with `sendToTrash` /
`sendManyToTrash` and leave the pictures alone — `purgeTrashEntry` is the
only thing that removes them, when the entry is emptied or ages out.

**And purging only removes what nothing else holds.** `heldImageIds()`
collects every id the live records and the *other* bin entries point at, and
`purgeTrashEntry` drops the remainder. This is not hypothetical: a restored
backup writes images under the ids in the file, so a binned record and a live
one can hold the same picture, and emptying the bin used to take the live
one's picture with it. The 30-day sweep computes that set **once**, before
anything goes, or entries purged in the same pass keep each other alive.
Build these lists with `imageIdsOf` / `charImgIds` / `personaImgIds`, per
rule 2 — never by hand.

Character and persona imports remap every image id (`normalizeCharacterImport`),
so an import cannot cause that collision itself. Lore and prompt entries are
the exception to all of this: they still delete outright and never reach the
bin, which is deliberate.

## Sections are edited in two places

There is no single sections editor. `SectionsField` is the shared one, used by
`RecordModal` for personas, lorebooks and prompts. **`CharacterEditor` keeps its
own copy of the same list** — its own title input, bin, textarea and token
label, wired to `set("sections", …)` instead of an `onChange` prop. Changing one
does nothing to the other, and "edit character" is the one people mean.

This cost a full cycle in 1.220: copy and paste buttons were added to
`SectionsField`, the driver reported two bins and no copy buttons, and the
feature was simply not on the screen it had been asked for. Anything touching
sections has to be done twice and checked on both screens. `sectionKinds` and
the token label are already shared; only the markup is duplicated.

The clipboard behind copy and paste (`SECTION_CLIP`, `putSectionOnClip`,
`useSectionClip`) is module level with its own subscribers, because copying in
one editor and pasting in the next unmounts the component holding it. It is
deliberately not persisted. A pasted section always takes a fresh `uid()`:
`sectionOrder` addresses a section as `sec:<id>`, so a reused id would put two
sections in one slot — the same shape of bug as rule 2.

## The in-app guide

`GUIDE` in `app/app.js` is a 17-section contents page. It is plain JSON, so it can
be parsed, edited and re-serialised with `JSON.stringify(G, null, 2)` rather than
patched by hand.

- **No em dashes anywhere in it.** Asked for directly. Rewrite the sentence rather
  than swapping the punctuation.
- It is shown in both editions, so anything Windows-only (device transfer, updates)
  must say so.

## Ship procedure

```bash
npm run set-version 1.224           # keep every version site in step first
npm test                            # every check in scripts/, exits non-zero if any fail
npm start                           # launch and actually click the thing
npm run build:web                   # regenerate the web bundle from app/app.js
npm run sign 1.224 "what changed"   # -> dist/Rolecraft-update-1.224.rcvup
npm run build:installer             # always, even when a patch would do
cd mobile && npm run sync           # copies the web bundle just built into android/
cd android && ./gradlew assembleRelease   # -> app/build/outputs/apk/release/
```

A release carries **three application artifacts plus checksums**, and every
published one has: the
`.rcvup` patch, `Rolecraft-Vault-Setup-<v>.exe`, and
`RolecraftVault-<v>.apk`, accompanied by `SHA256SUMS.txt`. The Android build is
not optional and not separate —
`set-version` writes `versionName` and `versionCode` for exactly this reason, and
`npm run sync` copies whatever is in `web/`, so `build:web` has to have run
first or the APK ships the previous interface.

Say in the release notes which Windows artifact is actually needed. Verify the
published `.rcvup` afterwards by downloading it, base64-decoding
`files["app.js"]` and comparing sha256 against the local build — a release once
went out without the changes it claimed.

`build:installer` needs a staged Electron build at `dist/Rolecraft Vault/`, which
is gitignored. The installer script now rebuilds it from
`node_modules/electron/dist` every time so a dependency upgrade cannot leave a
stale runtime in the public installer. It also needs NSIS
(`winget install NSIS.NSIS`); winget does not put `makensis` on PATH, so
`scripts/build-installer.js` looks in Program Files. Configure a trusted Windows
certificate through the `ROLECRAFT_WINDOWS_CERTIFICATE` or
`ROLECRAFT_WINDOWS_CERTIFICATE_SHA1` environment variable; release environments
should also set `ROLECRAFT_REQUIRE_AUTHENTICODE=1` so signing fails closed.

## Where it ships

`github.com/CptBendova/RolecraftVault`, **public**, and GitHub Releases is the
only distribution channel. Nothing is automatic: the app never checks for
updates and never downloads anything. A user fetches the `.rcvup` from a release
themselves and hands it to **Settings, App updates**, which is what lets rule 1
hold — the interface has no network at all, and the shell only ever reads a file
the user picked.

**A tag is not a release.** `v1.202` is tagged and pushed but was never
published; 1.203 superseded it minutes later. So the tags and the releases do
not line up, and `git tag` is not evidence that a version reached anybody. Check
the Releases page before assuming a version shipped. The user-facing `CHANGELOG`
still carries a 1.202 entry that nobody ever received, near-duplicating 1.203's
— harmless, but do not treat CHANGELOG entries as proof of a release either.

**Commits can sit past the last tag at the same version number.** Nothing stops
work landing on `master` after a release without a version bump, and
`build:installer` will happily stamp the old number onto it. Before building,
run `git diff v<latest>..HEAD` and bump first if anything shipping has changed.

## Setting up a new machine (done 24 August 2026)

The repository carries its own history and its keys, but none of the toolchain.
On a fresh Windows box, in this order:

| Tool | How | Note |
|---|---|---|
| Node 22+ | `winget install OpenJS.NodeJS.LTS` | last verified on 24.19.0 |
| JDK 21 | `winget install Microsoft.OpenJDK.21` | sets `JAVA_HOME` machine-wide by itself. Java 25 does not work with this Gradle |
| NSIS | `winget install NSIS.NSIS` | lands in Program Files (x86), the first path `build-installer.js` checks |
| Android SDK | command line tools, below | Android Studio is not needed and never was |

Then `npm install`, `npm test`, and `cd mobile && npm install`.

Nothing about the code needed touching. Four environmental things cost the time:

- **winget does not update an already-open terminal.** `npm` reads as "not
  recognized" in the window you ran the installer from while working perfectly in
  a new one. Same for `JAVA_HOME` and `ANDROID_HOME`, and same for any tool
  spawned from a shell that started before the install.
- **npm 11 blocks postinstall scripts**, including the one that fetches the
  Electron binary. It warns rather than failing, so the install looks fine and
  `npm start` then dies on a missing exe. `npm approve-scripts electron`, or run
  `node node_modules/electron/install.js` directly.
- **The Android SDK installs headless.** Unzip `commandlinetools-win-*_latest.zip`
  from `dl.google.com` into `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`, set
  `ANDROID_HOME` and `ANDROID_SDK_ROOT`, then `sdkmanager platform-tools
  "platforms;android-36" "build-tools;36.0.0"`. Licenses must be accepted first,
  and `sdkmanager --licenses` does not read a PowerShell pipe: redirect a file of
  `y` lines into it through `cmd /c` instead. AGP pulls `build-tools;35.0.0` in on
  its own during the first build, which is expected.
- **Extract that zip somewhere shallow.** It contains a guava jar named
  `listenablefuture-9999.0-empty-to-avoid-conflict-with-guava.jar`, which crosses
  MAX_PATH from a deep temp directory. `Expand-Archive` then leaves a half
  unpacked tree that still looks like a folder, and `sdkmanager.bat` is simply
  absent from it.

The move itself proved two things worth recording. `npm run build:web`
regenerated `web/js/rolecraft-app.web.js` byte for byte against the committed
copy, so a release built here matches one built there. And the relative
`storeFile` path in `mobile/android/keystore.properties` works: a release APK
built on the new machine reports the same certificate SHA-256 as the keystore.
Confirm that with `apksigner verify --print-certs`, never with `keytool`.

**Do not run the development build against the real vault.** If the source tree's
`FACTORY_BUILD` differs from the installed app's version, starting it treats any
`.rcvup` you have installed as stale and deletes it, silently returning the
installed app to whatever the last installer gave it. Use a throwaway vault:

```bash
npx electron app --user-data-dir=./tmp-vault
```

The library itself lives in `%APPDATA%\Rolecraft Vault\` and is not in the
project. Move it between machines with the device transfer in Settings, or an
exported backup.

## Layout notes

- A record that opens over the library (character, persona, editor) is a
  `.scrollbody.sheet`: `position: fixed`, and **must not be width-capped**, or the
  library shows around it on a large screen.
- The reading column is capped and the gallery takes the surplus, so a wider screen
  means bigger pictures rather than longer lines. Above 1700px the gallery drops its
  oversized lead tile and becomes an even grid.
- `.scrollbody` is reused by small scrollers inside panels, which is why the column
  rule is `.rcv > .scrollbody` and not `.rcv .scrollbody`.
- On a Capacitor phone, fixed `.scrollbody.sheet` records stop above the 62px
  bottom navigation plus `safe-area-inset-bottom`. Do not give them the library's
  `100vh - 56px` height: 56px is the top bar and leaves six pixels drawn into the
  bottom navigation.

## Phone copies dying while saving around 1 GB (1.168)

1.166 got the bytes onto the phone. Saving then stuffed every picture into IndexedDB. Android WebView IDB fills up around a gigabyte (QuotaExceededError, or a put that never returns), so a 4 GB vault stopped at about 30%. The UI also failed to clear its busy state if `storage.set` threw.

Since 1.168, Capacitor stores anything over 16 KB as a file under `Directory.DATA/kv/` in 384 KB chunks, with only a `file:` pointer in IDB. `window.storage` still returns the same strings. The browser edition is unchanged. Retrying a merge after install skips hashes that already match.

## Encrypted vault folder on Android (1.172)

Holding those files as UTF-8 data-URL strings and then `get()`-ing them back into the WebView is what made a multi-GB library slow and then close the app: the dashboard preloaded every picture, compare hashed by reading each original, and `imgCache` never let go.

Since 1.172, large records on Capacitor are AES-256-GCM files under `Directory.DATA/vault/` (`RCVS1` + iv + ciphertext). The wrap key is a device key in IDB when no master password is set, or the master key when one is. IDB only keeps a `bin:` pointer and the 16-char fingerprint. `hash()` of old `file:` leftovers reads bytes, not a JavaScript string. The interface on a phone loads thumbnails only, at most three at a time, and keeps 64 thumbs / 4 full pictures. `kv/` files from 1.168–1.171 still read. The browser edition is unchanged.

### Cross-edition integrity boundaries (1.241)

Streaming text is stateful even when the surrounding JSON and encryption are
correct. Android Filesystem calls encode each JavaScript string separately, so
the backup writer must not split a UTF-16 surrogate pair between calls. Windows
reads decrypted transfer NDJSON with `StringDecoder`; decoding independent 1 MiB
buffers corrupts a UTF-8 sequence that crosses the buffer boundary.

Android storage treats the encrypted file as staged data. Its `v:` pointer and
`h:` transfer fingerprint are one IndexedDB transaction, and only that commit
makes the new file live. Deletion commits removal of both metadata keys before
best-effort file cleanup. Password changes migrate the legacy `file:` payloads
from 1.168-1.171 into `bin:` files before committing the new security record and
wrapped file key; skipping those pointers either left plaintext behind or left
old-password ciphertext unreadable.

Full-backup verification is about the payload actually written, not only the
four top-level arrays. Covers and bin records contribute image references,
missing bytes abort export, and every array element is checked before restore.
Lorebook and prompt exports carry book metadata as well as entry pictures so
empty books and covers survive a round trip.

1.173 asks the Filesystem plugin for storage before the first write and `mkdir`s `vault/`. On Android 8–12 the plugin still prompts; without `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32) in the app manifest that prompt auto-denies and a copy fails immediately. Android 13+ does not need the prompt for app-private files.

## Phone copies dying around 130 MB (1.166)

A Capacitor HTTP response is read entirely into a Java byte array, then base64, then a JS string. Around 130 MB that stops, which is why computer-to-computer copies (streamed to disk) worked and PC-to-phone did not.

Since 1.166 the PC packs `/delta-file?i=N` batches. A picture larger than 4 MB of plaintext is its own batch, then sent in 1 MB slices (`off`/`n`). The phone decrypts each piece, saves it, and asks for the next. Both devices need 1.166. `/delta-file` with no query is still the combined file, so an older PC receiver still works.

## PC-to-Android transfer fast path (1.229)

The original batched protocol stayed compatible, but it did far more work than
the receiver used. `/delta-start` built a combined encrypted file *and* every
Android batch, PBKDF2 ran again for each batch on both devices, and an ordinary
8 MB batch crossed Capacitor's native bridge in three HTTP calls. On a vault with
hundreds of batches, encryption setup and round trips became a material part of
the copy.

Modern receivers now put their need in the query string:

- Android asks for `/delta-start?mode=batches` and the PC never builds the
  duplicate combined file.
- Desktop asks for `/delta-start?mode=combined` and the PC never builds unused
  Android batches.
- No `mode` means compatibility: both are still built, so old receivers work
  with a new sender. Old senders ignore the query and still work with new
  receivers.

Every batch in one pack shares a salt and PBKDF2-derived key but has its own
random 96-bit AES-GCM IV. Reusing a key with unique IVs is the intended GCM
model. New Android copies cache that key; older copies see a valid ordinary
`RCVX2` file and merely repeat the derivation as before. The Android slice is
12 MB now, which covers the base64 expansion of the normal 8 MB picture batch,
so the common case takes one native request. An oversized picture is still
sliced below Capacitor's response limit.

After records have actually saved, both new receivers send an authenticated
`/delta-complete`. Only then does the sender say Complete, and it deletes
`delta.bin` / `delta-N.bin` immediately. Failure to acknowledge is harmless and
kept out of the receive result because an older sender has no such route.
`test-delta-slices.js` lifts the real mode, writer, key cache, slice downloader,
and cleanup functions and exercises this compatibility matrix.

## Streamed binary Android transfers (1.239)

The 1.229 fast path still had a lifecycle ceiling: the Windows server stopped on
a fixed ten-minute timer, it prepared every batch before the phone received the
first one, and pictures remained base64 data URLs inside JSON. Capacitor then
base64-encoded each encrypted HTTP response again to cross the native bridge.
A large vault could therefore spend its whole lifetime packing, create several
full copies in memory, or have the sender disappear while the phone was saving.

Current Android requests `mode=stream-batches` with a random idempotent session
id. The Windows sender must keep these properties together:

- every session owns `delta-<session>-N.bin`, never the legacy global names;
- the first finished batch is published through `/progress?id=...` immediately;
- no more than three unacknowledged batches are retained on disk;
- `/delta-ack` deletes a batch only after Android authenticated and processed it;
- any authenticated activity renews the ten-minute idle lease; and
- `/delta-complete` cleans only that session, not another phone's active files.

`RCVX3` is still AES-256-GCM with the shared per-session key and a unique IV per
file. Its plaintext is a sequence of length-prefixed metadata plus bytes. Data
URLs are decoded on Windows and image bytes travel directly; text remains UTF-8.
Old receivers keep `RCVX2`, and old senders that ignore the new mode still fall
back to the old batch path.

Android's `TransferTransport` plugin streams each GET into a private cache file.
Only bounded 512 KB reads cross back to JavaScript, so CapacitorHttp never builds
a whole-response byte array and base64 string. Each slice retries four times.
The foreground service holds both a partial CPU wake lock and a high-performance
Wi-Fi lock. Do not replace this with a WebView-only keepalive.

Transferred pictures are stored under the `bin2:` pointer format. It contains a
private encrypted binary file plus the original data-URL prefix; `get` rebuilds
the data URL only when the interface needs it. The IDB pointer is the commit:
write a unique new file, change the pointer, then remove the previous file.
Never delete the old file before the replacement is complete. A known transfer
fingerprint is stored directly instead of hashing the picture again.

A partial mirror must perform no deletions. New records that saved are retained
for a retry, but `removable` is applied only when every requested record saved.
`test-large-transfer.js` covers framing, retry, leasing, acknowledgements,
atomic pointer order, mirror safety, native streaming and both wake locks.

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

## Graphics modes and theme motion (1.230)

Quality and Performance are resource contracts, not only CSS choices. Four
details are easy to miss because the screen can look correct while the browser
keeps doing unnecessary work:

- Do not preload the crest film into a detached video. `CrestMark` creates the
  real video only when a large live crest is visible in Quality; Performance
  must not download or initialise a decoder for it.
- Canvas dust takes its colour from the current theme. Pass the theme through as
  a dependency so switching Dark, Light and CharSnap rebuilds the motes with the
  new `--brass` value immediately, without a reload.
- Pausing dust means cancelling its pending animation frame. A loop that keeps
  requesting a frame and merely skips drawing still wakes the renderer sixty
  times a second under every panel. Resume it when the library is visible again.
- Reduced motion includes pseudo-elements. The crest breathes and gleams through
  `::before` and `::after`, so the media rule must still those as well as ordinary
  elements.

Short entrance motion for panels belongs to Quality and is theme-neutral.
Performance and reduced-motion remove it through the same global gates. Run the
real renderer check below whenever changing the theme root, ambient layer, crest,
panels, or Graphics setting.

### Responsive dashboard, libraries and image grid (1.238)

- A routine backup is a Settings concern. Keep export, restore, transfer and
  backup health together under **Backup & transfer**; reserve the Dashboard's
  health area for something the user can recover immediately, such as a draft.
- Dashboard gallery art is deliberately bounded by `dashboardPictureLimit`:
  every device gets at least eight pictures when that many exist, rounded up to
  a complete measured row and capped at twelve. Phones use two compact columns;
  tablets and desktop widths get totals that fit their measured columns.
  Initialise the measured column count from the device class so the first render
  does not briefly queue desktop quantities on a phone. The ResizeObserver must
  attach after `ready`, because the Dashboard ref does not exist during the
  loading render.
- On Android, **Start from anywhere** and **Recent work** are the only Dashboard
  sections that collapse. Their state is device-local and Reset layout clears
  it along with the custom section order.
- Character and persona card size is a Settings choice, not a library-toolbar
  control. Both libraries use `.grid-cards`; a local hard-coded persona grid
  silently ignored the shared preference. The root carries `cards-small`,
  `cards-medium` or `cards-large`; an Android phone must render exactly 3, 2 or
  1 card per row respectively.
- The phone sidebar is exactly five equal grid cells. Its desktop `.brand` and
  `.side-tools` children have inline display styles, so the phone override must
  win explicitly or the Rolecraft crest and name occupy cells under the Android
  bar and push navigation off centre.
- At 360px, Spotlight stacks image above prose and uses `object-fit: contain`.
  A fixed wide `cover` stage magnifies and crops portrait artwork, which shipped
  in 1.234. Dashboard counts use two columns and gallery labels remain visible
  without hover. Audit every primary screen, record, editor and Settings for
  page overflow as a set; they do not share all their layout rules.
- Performance skips the full Spotlight original, not the picture. Its preview is
  first in the Dashboard's stable priority batch, followed by the visible gallery
  tiles, so returning from a large library cannot strand Dashboard art behind
  off-screen card reads. Android tablets carry a `.tablet` root class derived
  from their physical shortest screen edge; keep their Spotlight side by side
  even when WebView scaling puts the CSS viewport under the phone breakpoint.
- A picture at or below 1000px can still exceed the phone's one-megabyte preview
  guard and legitimately has no `th:` value because `makeThumb` does not rescale
  it. Performance may fall back to the original for the one bounded Spotlight,
  but do not weaken the guard for ordinary library cards or galleries.
- Do not use `overflow-wrap: anywhere` on mobile modal buttons. It breaks even
  short words into vertical fragments when a segmented row gets narrow. Settings
  choice groups use explicit phone grids and `.settings-choice` keeps each label
  whole; longer ordinary actions may still wrap at spaces.
- Responsive Electron checks use `useContentSize: true`; otherwise a framed
  320px window has only 304px of renderer space and the test is not measuring the
  width it names. Keep the exact 320px phone and 600px tablet-threshold cases.
- The image grid's editing header is sticky on desktop but must scroll away on
  Android; stacked variant and album tools otherwise leave no viewport for the
  pictures. Phone Small/Medium/Large is exactly 3/2/1 columns and tablet is
  exactly 4/3/2. The whole tile already opens the image, so Android hides the
  duplicate corner open button and keeps Select and Blur in opposite corners.

### Android 15/16 system bars (1.247)

Target SDK 35 made edge-to-edge mandatory and target SDK 36 removed the opt-out.
`WindowCompat.setDecorFitsSystemWindows(window, true)` is therefore not a safe
way to protect the WebView on current Android. `MainActivity` applies system-bar
and display-cutout insets to the native content container on API 35+, then zeros
only those handled inset types before they reach the WebView. Do not return
`WindowInsetsCompat.CONSUMED`: keyboard inset changes still need to reach the
WebView or focused editor fields can disappear behind the IME. Older supported
Android versions keep the reliable fitted-window behavior.

## Testing notes

`npm test` runs everything below, plus `check-integrity` and `scan-js`, and exits
non-zero if any of them fail. It finds `scripts/test-*.js` by name, so a new
check is picked up without being registered anywhere. Run one on its own with
`node scripts/<name>.js`. Each was written because something shipped broken:

| Script | What it catches |
|---|---|
| `test-shell-detect.js` | a release routed to the wrong artifact — a patch that needed the installer, or the reverse. Covers `app/vendor/` (rule 4) |
| `test-update-compatibility.js` | a cumulative renderer package skipping over a required Windows shell release |
| `test-release-engineering.js` | current runtimes, dependency-chain removal, installer compression/signing hooks, clean test profiles, CI, security guidance and checksum ownership |
| `test-hardening.js` | the security posture of both shells and the Android manifest, asserted from the source rather than assumed |
| `test-modal-escape.js` | Escape dismissing what is on top and only that. Needs Electron |
| `test-native-drag.js` | reordering by drag, driven with real mouse events. Synthetic DragEvents pass against broken code. Needs Electron |
| `test-grid-drag-paths.js` | every drop target accepting on `dragenter` as well as `dragover` |
| `test-grid-edge-scroll.js` | the grid scrolling while a picture is carried to its edge |
| `test-grid-view.js` | the gallery's layout, measured rather than eyeballed. Needs Electron |
| `test-image-gates.js` | the rules deciding when a full-size original may be read |
| `test-add-image.js` | adding pictures from the phone's gallery, including the ones Android cannot decode |
| `test-file-save.js` | exports actually writing a file on Android, where a browser download does nothing |
| `test-qr-scanner.js` | the scanner's framing staying square on any screen |
| `test-touch-targets.js` | controls staying big enough to hit with a finger |
| `test-perf-mode.js` | what performance mode turns off |
| `test-ui-modes.js` | live theme recolouring, paused animation frames, panel fit at phone width, Performance doing no off-screen film work, and reduced-motion covering pseudo-elements. Read the canvas `fillStyle`, not random anti-aliased pixels. Needs Electron |
| `test-ui-layout-audit.js` | all primary screens, records and editors fitting phone/tablet/desktop/wide viewports; Dashboard hierarchy and picture count; working library card sizes; and five centred Android navigation cells. Needs Electron |
| `test-device-unlock-screen.js` | a real locked Android render with biometric enrollment, including the unlock action. It catches component-scoped platform flags that only fail for protected vaults. Needs Electron |
| `test-window-restore.js` | a window restoring onto a display that is still attached |
| `scan-js.js` | assignment to a `const` binding — a runtime TypeError `node --check` cannot see. One of these killed every phone copy in 1.173. Takes file paths; scope-aware, and skips strings, templates, comments and regex |
| `test-update-assets.js` | the crest failing to load under an active patch (rule 6). Needs Electron; `NO_BASE=1` simulates a shell older than 1.192 |
| `test-warm-pass.js` | the background warm asking for more originals than it can keep |
| `test-image-eviction.js` | both picture caches, including that neither eviction loop can spin forever |
| `test-device-limits.js` | phone vs tablet vs desktop limits, across reported and unreported memory |
| `test-phone-image-guard.js` | the rule keeping full originals off a phone, including when a picture has never been measured |
| `test-delta-slices.js`, `test-transfer.js` | the transfer wire format and what Android actually puts on the socket |
| `test-transfer-resilience.js` | transfer timeouts staying as requested, and both receivers giving up when a sender vanishes during packing |
| `test-transfer-panel.js` | what the panel *says* on both ends: that a received vault appears without a relaunch, and that the sender reports it finished. Needs Electron |
| `test-section-clipboard.js` | copying a section between records: the clipboard surviving an unmount, fresh ids on paste, and the header not overflowing a phone. Covers both section editors. Needs Electron |
| `test-phone-scrollbars.js` | drawn scrollbars on a phone (menu, library column, panels), the theme row wrapping instead of running off the panel, and that the deliberate desktop bars survive. Runs with OverlayScrollbar so this Chromium behaves like the WebView. Needs Electron |
| `test-settings-popups.js` | the bin and version history opening as their own windows, searchable, and Escape closing one without closing Settings. Needs Electron |
| `test-import-overwrite.js` | an overwritten record reaching the bin with its pictures, and emptying the bin sparing a picture a live record still holds. Needs Electron |
| `test-robustness.js` | a damaged or unrecognised bin entry blanking the app or hiding from every group, plus the countdown clamp, the search trim and a long name running off the editor. Needs Electron |
| `test-shell-guards.js` | the shell's own guards: no write while locked, no plaintext left behind by a transfer, byte offsets past 2 GB, and the LAN-only listen. Lifts main.js; plain node |
| `test-ux-systems.js` | bottom navigation/back dispatch, durable undo, visible draft protection, text-only templates, Android biometrics, Windows Hello, and `.rcvup` file handoff |

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
- **Ask the element that has a width whether something overflowed.** A flex row
  sized to its own content always answers no: `scrollWidth > clientWidth` on the
  button group was false while a button sat well off the side of the card
  around it. Measure against the card, or compare `getBoundingClientRect().right`
  with the container's. In 1.220 that false negative was caught only by looking
  at a screenshot, which is exactly what measuring is meant to replace. Check a
  narrow width too — 360px is the phone that breaks these rows, and a header
  that fits on a desktop can still run off the card there.
- Electron's `capturePage()` on a `show: false` window returns a stale or empty
  frame. `win.show()`, focus it, wait, then capture.
- **A closed fold looks exactly like no fold.** Two assertions in
  `test-settings-popups.js` passed against the very code they were written to
  condemn, because the thing they measure only misbehaves once it is opened.
  Press the control first, then measure. Run every new check against the old
  code and read which ones *pass*: any that do are not testing what you think.
- **Styling `::-webkit-scrollbar` opts that element out of Android's overlay
  scrollbars.** The overlay ones fade away by themselves and take no layout
  space; a styled one is drawn permanently and repainted on every frame of a
  fling, which reads as a flickering bar. That was the flashing line under the
  phone menu in 1.221. On a touch layout, hide the bar (`scrollbar-width: none`
  plus `::-webkit-scrollbar { display: none }`) rather than styling it — a
  finger cannot grab 6px anyway. `.sidebar`, `.scrollbody` and `.modal` are all hidden below 760px for
  this reason; the desktop bars are deliberate and stay.
- To see any of that from a desktop Chromium, launch with
  `app.commandLine.appendSwitch("enable-features", "OverlayScrollbar")`.
  Without it, desktop Chromium always reserves scrollbar space and the
  difference is invisible. The measurement that settles it is the room the
  element sets aside: `offsetHeight - clientHeight - borders`, which is 0 for an
  overlay bar and the styled width for a drawn one. Comparing screenshot pixels
  during a scroll proves nothing — the content underneath is moving too.
- The transfer panel is Electron-only. To render it in the web build, stub
  `window.transfer` before opening Settings. Three things about that stub cost
  an afternoon in 1.219, all of them making the harness look like the bug:
  **every reply needs `ok: true`.** `preview` and `start` are both read as
  `if (r && r.ok)`, so a stub returning a perfectly sensible
  `{added, updated, removed}` sends the panel down its error path, no plan
  appears, and the Confirm button — which is the *same* button with a different
  label — never renders. It looks exactly like a broken panel.
  **Type through the browser, not through `.value`.** Setting the input's value
  leaves React's state empty and the button stays disabled. Focus the field and
  use CDP `Input.insertText`.
  **Settings is a modal over the library**, so close it before counting
  `.char-card`s, or the library reads as empty and a passing fix looks failed.

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

**A check is only trusted because its exit code is read.** Both `scan-js.js` and
`test-update-assets.js` once printed their verdict and exited 0 regardless, so
either could have failed for a whole release without anyone seeing it. Anything
new here must exit non-zero when it fails, and be watched doing so.

The same applies to how a check finds the code it lifts. Seven of these had the
old machine's absolute path (`C:/Rolecraft/rolecraft-vault/...`) baked in, and
had been throwing ENOENT since the project moved drives — a full release cycle
during which the whole suite proved nothing. They are `__dirname`-relative now.
Never write an absolute path into a check.

Still worth doing: moving them into `tests/`.

### Device unlock, Android Back, and update-file ownership (1.232)

- Android biometric unlock stores only an AES-GCM ciphertext in private native
  preferences. Its key is authentication-bound in Android Keystore and the
  enrolled secret is the already-derived 32-byte vault key, never the master
  password. A password change/removal deletes the enrollment.
- Capacitor invokes plugin methods on its task handler. Construct and authenticate
  `BiometricPrompt` through `getBridge().executeOnMainThread`; its API is
  main-thread-only. Treat `BIOMETRIC_STATUS_UNKNOWN` as worth trying, and return
  the exact unavailable reason to Settings instead of silently hiding the feature.
- `LockScreen` is a separate component from `RolecraftVault`. It must derive its
  Android label from its own prop or platform check, never the `ON_PHONE` const
  local to `RolecraftVault`; that crashes only after native status reports an
  enrolled biometric, before either unlock path can be used.
- Windows Hello gates a DPAPI-protected copy of that same derived vault key.
  Every non-`Verified` OS result fails closed. Do not replace the fixed WinRT
  script with renderer-controlled PowerShell input.
- `window.__rcvAndroidBack()` is the single bridge between the AndroidX back
  dispatcher and React. It returns true only when it unwound a modal, editor,
  record, book, or library destination; false at Dashboard lets Android exit.
- The Android bottom bar remains reachable while fixed record sheets are open.
  A primary destination must clear the complete reading stack (record, entry and
  book) before changing the library underneath it. Do not clear editors through
  this path; their own close flow protects unsaved writing.
- `.rcvup` belongs to `RolecraftVault.Update`, registered by the elevated custom
  installer. Both first launch and `second-instance` must pass the file through
  `installUpdateText`, so double-click cannot bypass signature or shell checks.
- Templates and duplicates are text-only on purpose. Sharing image ids between
  two live records would let deleting a picture from one damage the other.
