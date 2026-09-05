/* The security posture of both shells, asserted rather than assumed.

   Every line here is something that was checked by hand once and would be
   silent if it came undone: a renderer given node, a page allowed to navigate
   somewhere that would inherit the preload, a policy that grants whatever is
   asked for, an installer running elevated with the guards off.

   Static, on purpose. These are properties of the source, and a running check
   would only tell you about the machine it ran on. Plain node. */
const fs = require("fs");
const path = require("path");

const R = p => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const main = R("app/main.js"), preload = R("app/preload.js"), indexHtml = R("app/index.html");
const iMain = R("installer/main.js"), iIndex = R("installer/index.html");
const manifest = R("mobile/android/app/src/main/AndroidManifest.xml");
const appJs = R("app/app.js");

let bad = 0;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};
const group = t => console.log("\n" + t);

group("the Windows shell");
check("the renderer is isolated from node", /contextIsolation:\s*true/.test(main) && /nodeIntegration:\s*false/.test(main));
check("nothing re-enables node integration", !/nodeIntegration:\s*true/.test(main));
check("the window cannot open another one", /setWindowOpenHandler/.test(main));
check("and cannot navigate off the interface", /on\("will-navigate"/.test(main));
check("only the camera is granted, and only by name",
  /setPermissionRequestHandler/.test(main) && /setPermissionCheckHandler/.test(main) && /ALLOWED\s*=\s*new Set\(\["media"\]\)/.test(main),
  /ALLOWED\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(main) ? "allows " + /ALLOWED\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(main)[1] : "");
check("a storage key cannot climb out of the vault folder",
  /keyToFile\s*=\s*\(key\)\s*=>\s*path\.join\(dataDir,\s*encodeURIComponent\(key\)/.test(main));

group("the interface");
check("its policy forbids loading anything from elsewhere", /default-src 'self'/.test(indexHtml));
check("and forbids scripts that are not its own", /script-src 'self'/.test(indexHtml) && !/script-src[^;"]*unsafe-inline/.test(indexHtml));
check("no eval anywhere in it", !/\beval\(|new Function\(/.test(appJs));
check("and no way to inject markup", !/dangerouslySetInnerHTML|\.innerHTML\s*=/.test(appJs));
check("the bridge exposes named channels only, not a general one",
  !/invoke\s*\(\s*channel|ipcRenderer\.invoke\(\s*[a-z]/i.test(preload));

group("updates, which are the root of trust");
check("a package is refused unless it is signed", /Package is unsigned/.test(main));
/* The chain that matters: the signature covers the hashes, the hashes cover the
   payload. Break either link and a forged app.js installs itself. */
check("its payload is hashed and the hash is what is signed",
  /digest\s*!==\s*pkg\.hashes\["app\.js"\]/.test(main) &&
  /const canon = JSON\.stringify\(\{\s*version: pkg\.version,\s*hashes: pkg\.hashes\s*\}\)/.test(main));
check("and the signature is checked before anything is used", /crypto\.verify\(/.test(main));

group("the vault at rest");
check("keys are stretched with PBKDF2, 210k rounds", /const ITER = 210000/.test(main));
check("and everything is sealed with AES-256-GCM", /aes-256-gcm/.test(main));
check("the web and phone edition matches it", /var ITER = 210000/.test(R("web/js/rolecraft-web-platform.js")));

group("the transfer");
check("every reply is encrypted, even who is on the end", /encryptPayload\(Buffer\.from\(JSON\.stringify\(\{\s*\n?\s*device/.test(main) || /whoami[\s\S]{0,400}encryptPayload/.test(main));
check("a request body cannot be used to exhaust memory",
  /readEncryptedJson\s*=\s*\(maxBody,[\s\S]{0,350}size\s*>\s*maxBody/.test(main)
    && /readWantedKeys[\s\S]{0,100}4\s*<<\s*20/.test(main)
    && /\/delta-complete[\s\S]{0,120}64\s*<<\s*10/.test(main));
check("the pairing secret is random, not derived from anything guessable", /crypto\.randomBytes\(6\)/.test(main));

group("the installer, which runs elevated");
check("its renderer is sandboxed", /sandbox:\s*true/.test(iMain), /sandbox:\s*false/.test(iMain) ? "sandbox:false found" : "");
check("it is isolated from node too", /contextIsolation:\s*true/.test(iMain) && /nodeIntegration:\s*false/.test(iMain));
check("it cannot open a window", /setWindowOpenHandler/.test(iMain));
check("it cannot navigate anywhere", /on\("will-navigate"/.test(iMain));
check("its page may not fetch anything", /Content-Security-Policy/.test(iIndex) && /default-src 'none'/.test(iIndex));
check("and the program it launches is not named by the page", !/setup-launch[\s\S]{0,200}\(_e,\s*\w/.test(iMain));

group("the Android app");
const activity = R("mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/MainActivity.java");
check("the owner can take Android screenshots", !/addFlags\([^;]*FLAG_SECURE/.test(activity));
check("Android 13+ app-switcher previews remain private", /setRecentsScreenshotEnabled\(false\)/.test(activity));
check("its data cannot be pulled off with adb backup", /android:allowBackup="false"/.test(manifest));
check("only the launcher is reachable from other apps",
  (manifest.match(/android:exported="true"/g) || []).length === 1);
check("cleartext is allowed only with a policy file beside it",
  !/usesCleartextTraffic="true"/.test(manifest) || /networkSecurityConfig/.test(manifest));
check("it is not shipped debuggable", !/android:debuggable="true"/.test(manifest));
check("it asks for no permission it does not use",
  !/ACCESS_FINE_LOCATION|READ_CONTACTS|RECORD_AUDIO|READ_SMS/.test(manifest));

console.log("");
console.log(bad ? "  " + bad + " thing(s) about the way this is locked down have changed."
                : "  Both shells are still locked down the way they were meant to be.");
process.exit(bad ? 1 : 0);
