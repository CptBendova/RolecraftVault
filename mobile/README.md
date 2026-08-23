# Rolecraft Vault for Android

The web edition in a WebView, plus the half of the device transfer a phone can
actually do. Same vault, same encryption, same interface.

## What works

- The whole library: characters, versions, personas, lorebooks, prompts,
  pictures, buckets, tokens, the guide. It is the same `app.js`.
- Storage is IndexedDB + WebCrypto with the master password, the same contract
  as the desktop build. There is no Windows account tie on Android, so the
  master password is doing all of the work: set one.
- **Receiving a vault over Wi-Fi from the PC**, including mirroring, using the
  protocol the desktop already speaks. Nothing on the PC needs changing.
- Backups: Export backup on the PC, move the file, Import backup here.

## What it deliberately does not do

- **Sharing from the phone.** A transfer needs one side to listen on a socket
  and a WebView cannot. The phone is the receiver; the PC is the source of
  truth. `window.transfer.canShare` is false and the interface says so rather
  than offering a button that cannot work.
- **In-app updates.** The `.rcvup` system signs a desktop bundle. On Android a
  new build is a new APK.

## Building it

You need **Android Studio** (which brings the JDK and the SDK). Nothing else:
Gradle comes with the project as `gradlew`.

```bash
cd mobile
npm install
npm run sync          # rebuilds www from ../web, then copies it into android/
npm run open          # opens android/ in Android Studio
```

Then Build > Build APK in Android Studio, or from the command line:

```bash
cd mobile/android
./gradlew assembleDebug          # app/build/outputs/apk/debug/
./gradlew assembleRelease        # needs a signing key configured
```

If `app/app.js` changed, regenerate the web bundle **in the repo root first**,
because `npm run sync` copies whatever is in `web/`:

```bash
npm run build:web     # in the repo root
cd mobile && npm run sync
```

## How a transfer works here

1. On the PC: Settings, then **Share this vault**. Wait for it to say ready, and
   read the code.
2. On the phone: Settings, type the code, press once to see what would change
   and again to apply it.

The phone asks the PC for a listing, works out which records it is missing or
has an older copy of, asks for only those, and writes them. Everything on the
wire is encrypted with a key derived from the one-time code, so the plain HTTP
connection carries ciphertext only.

Android refuses cleartext HTTP by default, and a LAN transfer is cleartext HTTP
to a private address, so `network_security_config.xml` permits it. The comment in
that file explains what is and is not exposed by doing so.

### The size limit worth knowing

A native HTTP response arrives in memory as base64 before it is decoded, so a
very large first sync is the one thing likely to strain a phone. Records that
already match are never sent, so this only bites on the first transfer into an
empty vault. If a large library fails, move a backup file across once and use
the transfer for keeping it current after that.

## Layout

```
src/rc-transfer.js    window.transfer for Android: pairing code, crypto, receive
scripts/build-www.js  copies ../web into www/ and adds the script tag above
www/                  generated, not committed
android/              the Capacitor project (committed: it carries the manifest
                      and the network config, which are edited by hand)
```
