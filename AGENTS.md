# Rolecraft Vault - Codex working agreement

## Public Rolecraft transition (owner instruction, 27 September 2026)

The owner explicitly authorized publishing the former private Chat edition to
the existing public `CptBendova/RolecraftVault` repository and replacing its
standard `master` source. This supersedes the 5 September local-only boundary
recorded in older project notes. Preserve the existing public history; do not
force-rewrite it. The former private Chat build is now the single user-facing
Rolecraft app. Its version stays monotonic for installed-copy compatibility.
Never publish local vault data, chat exports, attached user documents, API keys,
signing keys, keystores, passwords, caches, or unreviewed screenshots. Release
source and built installers/APKs only after checking the exact files and assets.
The Windows profile remains `%APPDATA%\Rolecraft Vault Chat` and the Android
application ID remains `com.cptbendova.rolecraftvault.chat`; the visible name
must not be used to rename or reset either data identity. The older standard
Android app has separate storage and requires an explicit backup or transfer
before removal.
The publication checklist below applies to current public Rolecraft releases.

This is the operational guide for Codex and other coding agents working in this
repository. Read it before changing code. `CLAUDE.md` remains the detailed
historical record and explains why many of these rules exist; consult the
relevant section there whenever a change touches storage, images, updates,
transfers, Android, the installer, or release engineering.

## Mission

Rolecraft is a private, offline-first roleplay library and chat app for
characters, personas, lorebooks, and prompts. It ships as:

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
`app/app.js`, `app/chat.js`, or the generated web bundle. Networking belongs in
the privileged shell. The current Rolecraft app uses `app/openrouter.js` and the
Android `OpenRouterPlugin` only for explicit Send actions to the fixed OpenRouter
HTTPS endpoint. Never put an OpenRouter key or network primitive in renderer
code. The older standard edition did not include the provider bridge.

Owner-requested private image generation (1.283) also permits explicit Generate
actions through app/image-generation.js and Android ImageGenerationPlugin to
fixed api.openai.com and api.x.ai HTTPS image endpoints only. Selected reference
bytes and the typed prompt may be uploaded after disclosure. Provider keys stay
OS-protected outside vault records, exports and sync. Never follow image URLs or
redirects; require bounded base64 PNG/JPEG/WebP responses. Lock/background cancels
local generation. The owner's 1.288 request permits an explicit Generate N and
save action: disclose the paid count, process a bounded sequential queue and
append each result through existing image storage and conditional character
persistence. Stop after a failed generation or save; retain earlier successes
and allow retrying an unsaved preview without another paid call. Never replace
originals or automatically retry provider requests.

Private provider allowance checks (1.288) permit an explicit Refresh through
app/provider-balances.js and Android ProviderBalancesPlugin to the fixed
OpenRouter /api/v1/key endpoint. Use only the protected normal inference key;
never collect management/admin keys. A key allowance is not an account balance.
Keep results ephemeral, clear/cancel on lock/background, and use fixed native
billing links for actual balances and providers without an ordinary-key API.

Owner-requested private credential sharing (1.287) is a separate native-only,
explicit transfer over the remembered LAN group. A selected provider may be
offered for five minutes to trusted group members; the receiver must explicitly
import into OS-protected storage, never overwrite a saved key, and never expose
the key to the renderer. Clear offers on lock/background/pause and never persist
them. This exception does not permit API keys in ordinary sync chunks, vault
records, snapshots, backups, pairing QRs, logs or release artifacts.

Private Chat also has an explicitly paired, persistent LAN-only chat link in
`chat-link-server.js` and Android `ChatLinkPlugin`. It is separate from the
passive vault-transfer protocol. Never copy API keys or pairing secrets in chat
snapshots, acknowledge a peer before local persistence, or discard a concurrent
revision. Preserve `_sync` ancestry and recoverable deletion records. Pause on
lock and leave Android background locking intact. Only paired local devices may
use the bridge; public source availability does not make the sync service public.
Local `chats:all` saves must compare-and-swap against the exact last durable
text. After a conflict, retain unsaved edits and merge on explicit Retry save;
never blindly overwrite the peer version. ScenePanel's own Retry scene save
must use that same merge-aware recovery, then verify the requested scene fields
still belong to the target chat before closing; do not call blocked `persist`
again or claim a separate conflict copy updated the original. Keep a failed full-sync UI reload
pending until it succeeds, and do not rewrite Chat for ancestry-only merges.
Automatic memory during Send is bounded to four paid batches; each completed
checkpoint is durable, and an unfinished catch-up pauses before any roleplay
request. A proof-validated shared lane may be reused read-only for reply
context only when every active turn is shared. Never timeout and abandon a
durable Chat write whose eventual commit could race the in-memory ancestry.

Run `npm run check` after renderer edits; its no-network sweep is mandatory.

Explicitly paired automatic LAN sync uses `app/vault-sync-transport.js` and the
Android `VaultSyncPlugin`, separate from passive transfer. Native peers serve
immutable encrypted chunks, never directly write live vault records. Initial
merges require local approval; compare-and-swap protects active editing and
conflicts keep copies. Stop on lock/backgrounding and remember pairing in OS
secure storage. Story data uses a separate adapter and optional index; publish
only reviewed source and release artifacts, never users' encrypted sync records.
Chat saves may wake the local sync loop only after encrypted storage succeeds.
Native peers may send a signed, content-free UDP wake after a durable stories1
head update; the receiver must still fetch and validate the authenticated index.
Keep periodic polling for missed wakes, reject replays and locked/background
traffic, and never treat a wake as a delivery acknowledgement. Chat-only head
updates must preserve the existing library and picture references; if the base
head is unavailable or differs, fall back to the full retained publication.
In private manual-refresh mode, keep an unlocked paired device passively serving
its latest encrypted head and stage durable local Chat saves without polling or
merging peers. Renew the native serving lease while open, stop on lock/background,
and fetch remote changes only on explicit Refresh now. A sync reload must not be
acknowledged if its Chat read was skipped, failed, or raced with a local save.

Owner-requested private 1.296 screen-off sync is the narrow background exception.
An explicit visible confirmation starts an Android dataSync foreground service
and keeps this vault session unlocked in memory. Require native active-service
confirmation, visible Stop notification, bounded heartbeat/power/session leases,
and Android timeout handling. Explicit lock, Stop, app closure or expiry revokes
native access immediately; never auto-unlock or restart after process death.
Normal background locking remains when this session is not active. Provider
requests and credential offers/imports still cancel/refuse in the background.
Private 1.300 Story Director may call OpenRouter's fixed Jev Decisions endpoint
only for an explicit per-conversation opt-in after a completed reply and only
when that conversation has disabled Require zero data retention. Bound the
scene excerpt, use the protected inference key, keep scores local, cancel on
lock/background, and never mutate transcripts or auto-reroll paid replies.
Jev nudges belong below permanent roleplay directions and must not enter memory.
Private 1.308 AI group coordination is a separate per-conversation opt-in. Its
native OpenRouter chat-completion request uses the saved inference key and the
conversation's existing zero-retention choice after the final completed group
reply. Bound the branch scene and memory excerpt; never send private sceneEvents
or manual per-speaker knowledge. Validate output and current leaf/scene before
applying AI-only recap, presence, inferred knowledge or next speaker. Preserve
manual notes and branch checkpoints, offer CAS-safe undo, cancel on lock or
background, and never auto-send another paid roleplay reply.
Private 1.309 group-cost controls must not silently change the chosen roleplay
model or privacy policy. Extra coordinator checks are deduplicated and may use a
separately chosen model; changing scene facts remains CAS-guarded. Provider costs
are recorded only when actually reported, with missing values shown as unknown.
Prompt-cache routing keeps a stable opaque conversation ID but never relaxes ZDR.
Attached lore entries with no trigger remain inactive; only whole-word matches
in recent turns activate them. Existing group lore scope remains compatible,
while newly created groups use selected-speaker lore by default.
Private 1.310 may use a separately selected memory model without changing the
roleplay model or conversation privacy choice. Catalog-based reply and queue
costs are estimates, not charges; unavailable prices stay unknown. Conversation
search is offline across saved branches and must not alter transcripts or memory.
AI-scene corrections and selective application affect only AI-inferred fields
and retain current-scene CAS and manual-note protection. Prompt cache reports
use only provider-reported read/write usage; absent fields are unavailable,
not zero. Keep changing scene facts after the stable priority-1/2 prefix without
weakening that prompt hierarchy.
Private 1.318 character voice playback uses the existing OS-protected OpenRouter
key only on an explicit Play voice action. Gemini 3.8 Flash TTS rejects MP3:
request `response_format: "pcm"`, accept only bounded PCM or valid WAV, and
wrap raw 24 kHz mono signed 16-bit little-endian PCM in WAV for playback. Do not
retry a paid voice request automatically or save the audio in the vault.
Native photo staging may transiently receive derived vault keys through the local
bridge to read only the exact picture pointer under vault/. Erase key buffers,
authenticate before staging, preserve exact hashes, verify the current pointer
afterwards, and never persist plaintext photos or keys in sync caches.

Private 1.294 can select a new primary without replacing the original group
identity. Its authenticated primaryPreference register gates the single-library
policy; old peers must stop index exchanges after activation. Normal causal edits
remain two-way. Concurrent library alternatives go to recoverable Bin records,
whose pictures and records must commit before replacing a visible source card.
Legacy conflict cleanup is explicit review with a full-record/state CAS. Preserve
reviewed character syncAliases so existing chat identities remain resolvable.

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

Streaming text must preserve decoder state across chunks. On Android, never end
a Filesystem string write between the two halves of a UTF-16 surrogate pair. On
Windows, decode transfer files with `StringDecoder`, not independent
`Buffer.toString("utf8")` calls.

On Android, commit each `v:` pointer and its `h:` transfer fingerprint in the
same IndexedDB transaction. The encrypted replacement file is written first;
the old file is removed only after that combined commit. Background locking may
wait for an active receive, but it must keep checking and lock as soon as the
receive or permission sheet finishes while the app remains hidden.

Modern receivers declare what the PC should pack: Android uses
`/delta-start?mode=stream-batches&id=<random>` with binary `RCVX3` frames,
desktop uses `?mode=combined`, and no mode must keep building both legacy
representations for older clients. Stream sessions own unique pack filenames,
publish batches as they finish, retain no more than three unacknowledged files,
and renew the sender's idle lease while active. Batches in one pack may share the
derived key only while every file keeps a unique AES-GCM IV. Android acknowledges
each processed batch with `/delta-ack`; do not report completion until the
authenticated `/delta-complete` arrives after every record has saved.

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
- A backup is verified only after every referenced live, cover, and bin picture
  has actually been read. Array-shaped record lists still need every element
  validated before an atomic restore is allowed to replace the vault.
- Refuse full-backup restore while native device sync is paired. After a
  standalone restore, clear old sync ancestry and the backup-export timestamp
  in the same atomic replacement; re-pairing and merge approval are explicit.
- Private Chat memory checkpoints store incremental additions, while replies
  resolve their complete ancestry. Correcting earlier memory must not leave a
  later copied summary stale or erase an ambiguous legacy descendant. A peer's
  unchanged conversation may be reused only after its full snapshot was
  validated; an interrupted manifest download cannot enter that cache.
- `GUIDE` is shared by all editions. Mark Windows-only features clearly, and do
  not use em dashes anywhere inside the guide text.
- Runtime asset paths in `app.js` use `ASSET_BASE`, never bare relative paths.
- Keep routine backup actions in Settings and urgent recovery on the Dashboard.
  Character and persona libraries both use `.grid-cards`, with the size control
  visible in each toolbar. The Android bar is exactly five equal cells; desktop
  branding and side tools must be forcibly hidden there despite inline styles.
- Mobile Spotlight artwork uses `object-fit: contain`; never force portraits
  through a shallow `cover` frame. Desktop Spotlight intentionally stays cover.
  Performance still queues the Spotlight preview, first in the visible Dashboard
  batch; it only skips the full original. Phones show two compact gallery tiles
  in one row. Android tablets are detected from the physical shortest edge, keep
  Spotlight beside its prose, and show more gallery pictures than a phone.
- Mobile Settings choice buttons keep whole words. Use explicit responsive grids
  for segmented choices; never apply `overflow-wrap: anywhere` to every modal
  button.
- CharSnap export and import formats differ. Import variants use snake_case and a
  bare variant object; do not reuse the export shape.
- The Android release package may rename and recompress resources. Verify icons
  by decoded image dimensions and visual inspection, not archive path or source
  PNG hash.
- Android 8 and 9 public exports need a runtime `WRITE_EXTERNAL_STORAGE`
  request in `FileExportPlugin`; a manifest declaration alone is not enough.
- Exercise the locked Android screen with `deviceUnlockSet: true`. `LockScreen`
  cannot read platform constants local to `RolecraftVault`; a clean unprotected
  profile never renders that branch and will miss a release-blocking crash.
- Visual changes (1.304) stay paint-only between Quality and Performance. Primary
  actions and focus rings follow the theme accent; text over artwork in Light and
  Custom uses `--art-accent`; touch sizing keys off `.phone` so Android tablets
  wider than 760px keep 48px targets; picture viewers must cover the Android
  bars. Run `scripts/test-premium-visual.js` after changing themes or CSS.

## Editing and test strategy

Owner preference (20 September 2026): keep verification proportionate and fast.
For private updates, run the relevant regression checks and mandatory offline
check, then verify affected build payloads and a brief packaged-app launch.
Do not routinely repeat the entire app/UI suite for every update. Use broader
coverage only when the affected areas justify it or the owner requests it.
Keep encryption, data-preservation, compatibility and lock checks for changes
that touch those boundaries; do not weaken assertions just to shorten a run.

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
8. attach all three application artifacts plus their checksum file:
   - `Rolecraft-update-<version>.rcvup`
   - `Rolecraft-Setup-<version>.exe`
   - `Rolecraft-<version>.apk`
   - `SHA256SUMS.txt`
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
- focused checks pass; broader suites run when justified by the changed areas
  (the public release checklist still applies to public publication);
- affected UI is smoke-tested with a disposable profile;
- generated bundles are refreshed when their source changed;
- line endings and offline/security invariants remain intact; and
- the final report states what changed, what was verified, and any remaining
  manual or hardware-only check.

A release task additionally requires a public Latest GitHub Release, all three
application assets, the checksum file, matching hashes, and a downloaded
update-package verification.

## When historical context matters

`CLAUDE.md` contains the failure history behind these rules, including the data
model, CharSnap mappings, transfer protocol, mobile storage evolution, installer
branding, test harness behavior, and new-machine setup. Keep that knowledge; add
new lessons there when the explanation is lengthy, and update this file when the
operational rule or completion checklist changes.
