# Rolecraft Vault

Rolecraft Vault is a private, offline-first library for the writing behind your
roleplay: characters, personas, lorebooks, prompts, and their pictures. It runs
on Windows and Android without an account, sign-up, subscription, or cloud
service.

## Download

### **[Get the latest release →](https://github.com/CptBendova/RolecraftVault/releases/latest)**

Every release provides three files:

- **Windows installer:** `Rolecraft-Vault-Setup-<version>.exe`
- **Android app:** `Rolecraft-Vault-<version>.apk`
- **Signed Windows interface update:** `Rolecraft-update-<version>.rcvup`

For a first Windows installation, use the full installer. For later updates,
follow the release notes: interface-only releases can be installed by
double-clicking the `.rcvup` file or through **Settings → App updates**. When a
release changes the Windows shell, the app refuses the smaller update and names
the full installer required instead of leaving an incomplete installation.

On Android 8 or newer, install the APK over the existing app. **Do not uninstall
first:** Android removes that device's private vault when the app is uninstalled.
The APK keeps the same signing identity so normal releases upgrade in place.

Each update file contains the complete current interface, so download only the
newest release. If that release depends on a Windows shell update you skipped,
Rolecraft Vault refuses the small update and directs you to the current full
installer. It does not check for or download updates on its own.

Rolecraft Vault is free to download and use under the [licence](LICENSE).

## What it does

Version 1.254 adds **Settings → Automatic device sync** for Windows and Android.
Start on the most up-to-date device, choose it as primary, then scan or paste its
pairing code on the others. Review the first merge before approving it. Pairing
is remembered securely; later edits sync both ways without another code.
Unique writing and conflict copies are retained, and received record deletions
stay recoverable in the bin. Picture files are never deleted by sync.

Keep devices on the same private network, open and unlocked. Windows can be
minimized; Android pauses in the background and resumes when reopened. Permit
the Windows app through the private-network firewall if prompted. Guest Wi-Fi
may block discovery. Sync is not a backup: export each library before the first
merge and keep periodic backups. Windows needs the full 1.254 installer; install
the APK over the existing Android app without uninstalling.

Version 1.252 improves consistent character/persona search, natural ordering of
numbered names, keyboard activation of cards and gallery tiles, and safe retry
when storage cannot be read. The in-app guide covers those behaviours and
clarifies how protected drafts differ from saved records. Upgrade in place;
application identities and vault folders have not changed.

- Keeps **characters** with any number of alternate versions.
- Separates **personas**, **lorebooks**, and reusable **prompt collections**.
  Lorebooks support remembered grid/list views, World or Personal grouping, and
  direct links to every character or persona using them.
- Stores portraits, banners, galleries, albums, tags, buckets, and per-picture
  blur choices. Characters can be marked Planned, WIP, or Done and filtered or
  sorted by that workflow status.
- Provides built-in and private templates, plus safe text-only duplication that
  never makes two records compete for ownership of the same picture.
- Protects in-progress writing with recoverable encrypted drafts and a visible
  protection status in every editor.
- Gives deletions an immediate Undo action and keeps all four record types in an
  encrypted 30-day bin.
- Counts tokens using CharSnap-compatible accounting.
- Includes search, favourites, command search, large text, high contrast, and
  Quality and Performance modes.
- Uses phone-sized navigation and Android system Back behavior in the APK.

Rolecraft Vault reads and writes **CharSnap** characters and lorebooks, and
imports **Chub**, standalone lorebook v3, embedded character-card lorebooks, and
**Tavern** v1/v2 character cards. Text, JSON,
pictures, and complete encrypted backups can be exported so the library is not
locked to one application.

## Privacy and security

Vault records and pictures are encrypted at rest with AES-256-GCM. A master
password is optional; when enabled, its key is derived with PBKDF2 rather than
storing the password. Supported Android devices can use a strong fingerprint or
face after one-time setup, and supported Windows devices can use Windows Hello.
The operating system protects the sealed vault key and Rolecraft Vault never
stores biometric data or the master password.

The renderer cannot initiate network traffic. Release builds fail their checks
if the interface gains `fetch`, `XMLHttpRequest`, `WebSocket`, remote scripts, or
remote assets. Nothing in a vault is uploaded to a cloud service, analysed, or
made available to the copyright holder.

Data connections stay on the local network in the privileged native shell.
One-time transfer serves a copy from Windows without modifying the sharing
device. Separately, explicitly paired automatic sync lets Windows and Android
exchange later changes in both directions. Pairing is OS-protected and chunks
are authenticated and encrypted; neither mode uses a third-party server.

Keep independent backups of anything important. Offline storage protects
privacy, but it also means nobody else can retrieve a forgotten password or
restore a lost device.

## Licence

**Free to use, but not open source.** The repository is published for inspection
and auditing; that does not grant permission to copy, modify, redistribute, or
rebrand the software. User-created characters, personas, lorebooks, prompts, and
images remain the user's property. Read the full [LICENSE](LICENSE) before using
the source for anything beyond inspection.

---

## Working on the code

Read [`AGENTS.md`](AGENTS.md) first, then the relevant section of
[`CLAUDE.md`](CLAUDE.md). Together they document the data-safety, offline,
transfer, signing, line-ending, Android, installer, and release rules that are
easy to break accidentally.

Development needs **Node.js 22+** and **git**:

```bash
npm install
npm test
npx electron app --user-data-dir=./tmp-rolecraft-vault
```

Always launch development builds with a disposable profile. The installed vault
lives under `%APPDATA%\Rolecraft Vault\`; launching a mismatched source build
against it can invalidate an installed interface patch.

Private update and Android signing material belongs in `keys/`. It is ignored by
Git and must never be printed, committed, or shared.

### Common commands

```bash
npm run check
npm test
npm run build:web
npm run set-version -- <next-version>
npm run sign -- <next-version> "what changed"
npm run build:installer
```

For Android:

```powershell
Set-Location mobile
npm run sync
Set-Location android
.\gradlew.bat assembleRelease
```

`npm run sign` compares shell files with the latest release tag. A `.rcvup`
contains the renderer bundle only, so changes to `app/main.js`, `app/preload.js`,
`app/index.html`, or `app/vendor/` require the full Windows installer. Changes to
the interface also require rebuilding the web edition and Android APK.

Published releases also include `SHA256SUMS.txt`. Compare its hashes after a
download when independently verifying an installer, APK, or update package.

### Repository layout

```text
app/        Electron app and the interface source of truth
web/        generated embeddable browser edition
mobile/     Capacitor Android wrapper and transfer bridge
installer/  custom Windows setup application
build/      NSIS wrapper and setup artwork
scripts/    builds, signing, integrity checks, and regression tests
keys/       private release material, always ignored
dist/       generated release artifacts, always ignored
```

A change is ready only after the focused regression, `npm test`, affected
cross-platform builds, and relevant real UI checks pass. A release is ready only
after the public GitHub Release contains the updater, installer, and APK and the
published hashes match the locally verified artifacts.
