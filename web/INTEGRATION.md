# Rolecraft Vault — Web Edition

A private, client-side library for roleplay characters, personas, lorebooks
and prompts. Everything runs in the visitor's browser: there is no backend,
no network calls, and no data ever leaves the device.

## What's in this folder

    index.html                       standalone, ready-to-host page
    fonts.css + fonts/               Inter & Space Grotesk (self-hosted)
    js/react(.dom).production.min.js React 18 UMD
    js/rolecraft-web-platform.js     storage + encryption layer (IndexedDB + WebCrypto)
    js/rolecraft-app.web.js          the vault UI (exposes window.RolecraftVaultMount)

## Option A — host it as a page (simplest)

Copy this folder to your site (e.g. /vault/) and link to /vault/ or put it
in an <iframe>. `index.html` works as-is; everything is relative paths.

    <iframe src="/vault/" style="width:100%;height:100vh;border:0"></iframe>

## Option B — embed into an existing page

Load the four scripts IN ORDER (platform before app) plus fonts.css, then
mount into any container. The UI is a full-height flex layout, so give the
container a real height.

    <link rel="stylesheet" href="/vault/fonts.css">
    <div id="my-vault" style="height:100vh"></div>
    <script src="/vault/js/react.production.min.js"></script>
    <script src="/vault/js/react-dom.production.min.js"></script>
    <script src="/vault/js/rolecraft-web-platform.js"></script>
    <script src="/vault/js/rolecraft-app.web.js"></script>
    <script>/* auto-mounts into #rolecraft-root or #root; or mount manually: */
      // window.RolecraftVaultMount("#my-vault");
    </script>

Note: the app auto-mounts only into an element with id "rolecraft-root" or
"root". For any other container, call RolecraftVaultMount yourself.

If your page already ships React 18, you can skip the two React files —
the bundle uses the globals `React` and `ReactDOM`.

## Where data lives

- Per browser, per origin, in IndexedDB (database "rolecraft-vault").
- Users on a different device/browser/profile see an empty vault.
- Clearing site data in the browser erases the vault. The app's backup
  export/import (Settings) is the migration path — encourage users to
  export backups.

## Security model (read this part)

- With a master password set, every record and image is encrypted at rest
  with AES-256-GCM; the key is derived from the password with PBKDF2
  (210k iterations, SHA-256) and never stored. Wrong passwords/PINs are
  rejected cryptographically. There is NO password recovery.
- WITHOUT a master password, data sits unencrypted in IndexedDB (the app
  shows a warning in Settings and encourages setting one).
- The optional quick-unlock PIN wraps the master key. Unlike the Windows
  build there is no OS key store on the web, so the PIN is only as strong
  as the digits chosen; the app tells users this.
- All exports (JSON, backups, image zips) are unencrypted files by design,
  and the app shows a warning before every export.
- WebCrypto requires a secure context: serve over HTTPS (or localhost).
- Nothing is transmitted anywhere. If you wrap this in a page with
  analytics or error reporting, be careful not to capture vault contents.

## Compatibility

Evergreen Chrome/Edge/Firefox/Safari. Responsive from phones up to 4K
(the same breakpoints as the desktop app). Light/dark theme built in.

Provided as-is by the vault's owner for integration on their behalf.
