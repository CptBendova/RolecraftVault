# Rolecraft Vault - Codex working agreement

This is the operational guide for Codex and other coding agents working in this
repository. Read it before changing code. `CLAUDE.md` remains the detailed
historical record and explains why many of these rules exist; consult the
relevant section there whenever a change touches storage, images, updates,
transfers, Android, the installer, or release engineering.

## Mission

Rolecraft Vault is a private, offline-first roleplay library for characters,
personas, lorebooks, and prompts. It ships as:

- a Windows Electron application;
- an embeddable browser edition; and
- an Android WebView application.

Protect user data and existing behavior above code elegance. Prefer small,
reviewable fixes with regression coverage. Do not rewrite a working subsystem
merely to make it look cleaner.

## Start every task this way

1. Read this file and the relevant part of `CLAUDE.md`.
2. Run `git status --short` and preserve all user-owned changes.
3. Inspect the real implementation and its callers before editing.
4. Find the nearest `scripts/test-*.js` coverage. Add a regression check when a
   bug could return.
5. Decide which editions and release artifacts the change affects.

For a diagnosis or review request, stop after evidence and explanation unless
the user also asks for implementation. For an implementation request, finish
the change, verify it, and report any check that could not be run.

## Repository map

```text
app/                 Electron product
  app.js             interface source of truth; compiled React without JSX
  main.js            storage, encryption, updates, Wi-Fi transfer
  preload.js         renderer-to-main bridge
  index.html         desktop entry point and CSP
  vendor/            bundled React, fonts, and static assets
web/                 generated embeddable web edition
mobile/              Capacitor/Android wrapper around the web edition
installer/           custom Electron setup interface
build/               NSIS wrapper and setup icon
scripts/             build, signing, integrity, and regression checks
keys/                private release material; never expose or commit
dist/                generated release artifacts; gitignored
```

## Non-negotiable invariants

### Preserve `app/app.js`

`app/app.js` is the only surviving source for the full interface. Edit it in
place. Never regenerate it from a replacement JSX project or perform a wholesale
conversion. Small modernization steps are acceptable only with tests and a real
launch after each behavior change.

- `app/app.js` uses LF.
- `app/main.js` uses CRLF. Preserve all-CRLF when editing it.
- Match anchors with their exact whitespace and line endings.
- Avoid shell rewrites that can consume backslashes, Unicode, or regex escapes.
- `scripts/build-web.js` pins the desktop mount. Update its `DESKTOP_MOUNT` only
  when deliberately changing the mount expression.

### Keep the renderer offline

The interface must never initiate network traffic. Do not add `fetch`,
`XMLHttpRequest`, `WebSocket`, `sendBeacon`, remote scripts, or remote assets to
`app/app.js` or the generated web bundle. Networking belongs only in
`app/main.js`, and only for the user-initiated LAN transfer feature.

Run `npm run check` after renderer edits; its no-network sweep is mandatory.

### Treat images as user data

History, JSON updates, and text restores must not overwrite or discard pictures.
Never hand-build a record's image list. Use:

- `charImgIds(c)` for characters, including variant portraits;
- `personaImgIds(p)` for personas; or
- `imageIdsOf(record)` where the generic helper is appropriate.

Deleting or overwriting a character/persona moves it to the bin without deleting
its pictures. `purgeTrashEntry` is the only place that removes those images, and
it must spare every image still held by a live record or another bin entry.

### Never write while the vault is locked

Storage preferences and records load only after unlock. All write paths must fail
closed while locked, including IPC handlers and transfer receivers. Never weaken
`writeValue` or the entry-point guards.

Use a disposable profile for development:

```powershell
npx electron app --user-data-dir=./tmp-codex-vault
```

Do not launch development source against the real vault in `%APPDATA%\Rolecraft
Vault\`. A mismatched `FACTORY_BUILD` can invalidate an installed patch.

### Keep quick unlock subordinate to the master password

Android biometrics and Windows Hello protect a derived vault key, never the
master password. Password changes and removal must invalidate device unlock.
Every cancelled, unavailable, damaged, or non-verified OS result fails closed.
The normal password path must always remain available.
Android's biometric prompt must be constructed and opened on the main thread;
Capacitor plugin methods themselves run on a worker. When secure biometrics are
unavailable, expose an actionable reason rather than hiding the setting.

### Protect signing material

Anything signed with `keys/private_key.pem` is trusted by installed desktop
copies. The Android keystore is required for in-place Android upgrades.

- Never print, copy, upload, or commit private keys or passwords.
- Never replace the Android keystore casually; doing so forces users to uninstall
  and lose local app data before installing a differently signed APK.
- Verify an APK with `apksigner verify --print-certs`, not `keytool`.

### Keep transfers passive and fail closed

The sharing device serves data and is not modified. Mirror is the only destructive
transfer operation and requires explicit remote approval. Missing replies, older
peers, closed windows, invalid pairing data, and timeouts must refuse or stop
cleanly rather than guessing.

Android transfer behavior must follow Capacitor's actual bridge contract:

- call `Capacitor.nativePromise(...)`, not `window.Capacitor.Plugins`;
- binary request bodies require `dataType: "file"`;
- large payloads stay batched and sliced; and
- receiver polling must eventually stop when the sender disappears.

Modern receivers declare what the PC should pack: Android uses
`/delta-start?mode=batches`, desktop uses `?mode=combined`, and no mode must keep
building both for older clients. Batches in one pack may share the derived key
only while every file keeps a unique AES-GCM IV. Do not report completion or
remove the packed files until the authenticated `/delta-complete` arrives after
the receiver has saved its records.

Read the transfer sections in `CLAUDE.md` and Capacitor's Android source before
changing this protocol.

## Product-specific traps

- A character variant owns its own `profileImg`.
- Preferences read while locked fail silently and can reset themselves.
- Sections have two editors: shared `SectionsField` and the separate
  `CharacterEditor` markup. Change and test both.
- Pasted sections always receive a fresh `uid()`.
- Stored data can be damaged or from a future version. Rendering should tolerate
  missing records and unknown kinds; fixed groups need a catch-all.
- `GUIDE` is shared by all editions. Mark Windows-only features clearly, and do
  not use em dashes anywhere inside the guide text.
- Runtime asset paths in `app.js` use `ASSET_BASE`, never bare relative paths.
- Keep routine backup actions in Settings and urgent recovery on the Dashboard.
  Character and persona libraries both use `.grid-cards`, with the size control
  visible in each toolbar. The Android bar is exactly five equal cells; desktop
  branding and side tools must be forcibly hidden there despite inline styles.
- CharSnap export and import formats differ. Import variants use snake_case and a
  bare variant object; do not reuse the export shape.
- The Android release package may rename and recompress resources. Verify icons
  by decoded image dimensions and visual inspection, not archive path or source
  PNG hash.
- Exercise the locked Android screen with `deviceUnlockSet: true`. `LockScreen`
  cannot read platform constants local to `RolecraftVault`; a clean unprotected
  profile never renders that branch and will miss a release-blocking crash.

## Editing and test strategy

Use the smallest safe patch. Do not overwrite unrelated work, normalize an
entire file, or run destructive Git commands to make the tree clean.

Regression tests should lift and execute the real shipped function. Do not copy
the implementation into the test. A useful regression check must:

1. fail against the pre-fix code;
2. pass against the fixed code;
3. exit non-zero on failure; and
4. use paths derived from `__dirname`, never a machine-specific absolute path.

Useful commands:

```powershell
npm run check                    # fast parse, integrity, and offline checks
node scripts/test-<area>.js      # focused regression check
npm test                         # complete suite; required before release
npm run build:web                # regenerate browser and Android web payload
npx electron app --user-data-dir=./tmp-codex-vault
```

For visual behavior, test the real UI at desktop and 360px phone width. Measure
element bounds, overflow, grid tracks, and computed styles; screenshots are
supporting evidence, not the only assertion. Electron capture requires a visible,
focused window.

## Versioning

Rolecraft uses a flat display version such as `1.228`, not semver. The root npm
package version is intentionally independent.

Use the owner script; never edit individual version sites:

```powershell
npm run set-version -- <version>
```

This updates the desktop renderer, shell build, app package, installer package,
NSIS definition, and Android `versionName`/`versionCode` together. Add a
user-facing `CHANGELOG` entry in `app/app.js` for every noticeable change.

Before selecting a version:

1. inspect the latest **published GitHub Release**, not only Git tags;
2. compare `v<latest>..HEAD`; and
3. bump whenever shipping code has changed since the latest release.

A tag, commit, or changelog entry is not evidence that users received a release.

## Artifact routing

A `.rcvup` contains the renderer bundle, not every application file.

| Changed area | Windows patch | Full Windows installer | Web rebuild | Android rebuild |
|---|---:|---:|---:|---:|
| `app/app.js` only | yes | build anyway | yes | yes |
| `app/main.js`, `app/preload.js`, `app/index.html` | refused for old shell | required | as applicable | as applicable |
| `app/vendor/` | insufficient | required | yes | yes |
| `installer/` or NSIS | does not deliver fix | required | no | no |
| `mobile/` native code | no desktop effect | as otherwise needed | maybe | required |

`npm run sign` detects shell changes and writes `needsShell`/`shellBuild`; inspect
the result rather than assuming. Release notes must state which Windows artifact
users actually need.

## Complete release procedure

Do not stop after pushing source or a tag. A release is complete only when the
public GitHub Release exists and its artifacts have been verified.

```powershell
npm run set-version -- <version>
npm test
npm run build:web
npm run sign -- <version> "concise user-facing summary"
npm run build:installer
Set-Location mobile
npm run sync
Set-Location android
.\gradlew.bat assembleRelease
```

Then:

1. copy the signed release APK into `dist/` with the versioned public filename;
2. verify the APK signature and Windows executable version metadata;
3. calculate SHA-256 for all three artifacts;
4. confirm staged desktop/mobile payloads contain the committed change;
5. commit the version, changelog, generated web bundle, and source changes;
6. create tag `v<version>` and push the commit and tag;
7. create and **publish** a GitHub Release for that tag, marked Latest;
8. attach all three artifacts:
   - `Rolecraft-update-<version>.rcvup`
   - `Rolecraft-Vault-Setup-<version>.exe`
   - `Rolecraft-Vault-<version>.apk`
9. verify the public page lists those assets and its digests match the local
   builds; and
10. download the published `.rcvup`, decode `files["app.js"]`, and compare its
    SHA-256 with local `app/app.js`.

The repository owner has given standing authorization to publish completed
releases to GitHub. When credentials are available, publish and verify the
release automatically without asking for a separate confirmation. If access is
unavailable, report only the minimum sign-in or permission step needed. Do not
describe a pushed tag as a release.

## Definition of done

A code task is done only when:

- the root cause is fixed in the real implementation;
- relevant editions are updated;
- a regression test covers the failure where practical;
- focused checks and `npm test` pass;
- affected UI is smoke-tested with a disposable profile;
- generated bundles are refreshed when their source changed;
- line endings and offline/security invariants remain intact; and
- the final report states what changed, what was verified, and any remaining
  manual or hardware-only check.

A release task additionally requires a public Latest GitHub Release, all three
assets, matching checksums, and a downloaded update-package verification.

## When historical context matters

`CLAUDE.md` contains the failure history behind these rules, including the data
model, CharSnap mappings, transfer protocol, mobile storage evolution, installer
branding, test harness behavior, and new-machine setup. Keep that knowledge; add
new lessons there when the explanation is lengthy, and update this file when the
operational rule or completion checklist changes.
