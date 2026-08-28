/* Regression: an Android vault with biometric unlock enrolled must be able to
   draw its locked screen. 1.232 rendered an ON_PHONE variable that existed
   only inside RolecraftVault from the separate LockScreen component. The
   expression stayed dormant until a real password-protected Android vault
   reported an enrollment, when the whole app fell into the error boundary.

   Needs Electron: npx electron scripts/test-device-unlock-screen.js */
const { app, BrowserWindow } = require("electron");
const path = require("path"), os = require("os"), fs = require("fs");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-device-lock-"));
app.setPath("userData", tmp);
app.on("window-all-closed", () => {});

const preload = path.join(tmp, "android.js");
fs.writeFileSync(preload, `
  window.Capacitor = {
    isNativePlatform: () => true,
    nativePromise: (plugin, method) => {
      if (plugin === "DeviceUnlock" && method === "status")
        return Promise.resolve({ available: true, enrolled: true, reason: "" });
      if (plugin === "DeviceUnlock" && method === "unlock")
        return Promise.reject(new Error("cancelled in test"));
      return Promise.resolve({});
    }
  };
`);

let failures = 0, finished = false;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const finish = code => {
  if (finished) return;
  finished = true;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  app.exit(code);
};
const bail = setTimeout(() => { console.log("\n  timed out"); finish(2); }, 45000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 360, height: 740,
    webPreferences: { preload, contextIsolation: false } });
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(900);

  /* Write the platform's real security record directly. We deliberately do
     not unlock it: the next page load must take the locked render path. */
  await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const open = indexedDB.open("rolecraft-vault", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("kv", "readwrite");
      tx.objectStore("kv").put(JSON.stringify({salt:"test",verifier:"test"}), "__security__");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    };
  })`);
  await win.webContents.reload();
  await wait(1500);

  const result = await win.webContents.executeJavaScript(`(() => {
    const text = document.body.innerText || "";
    const button = [...document.querySelectorAll("button")]
      .find(el => /Unlock with fingerprint or face/.test(el.textContent || ""));
    return {
      locked: !!document.querySelector('.rcv[data-rcv-state="locked"]'),
      boundary: /That screen could not be drawn/.test(text),
      referenceError: /ON_PHONE is not defined/.test(text),
      button: !!button
    };
  })()`);
  check("the password-protected Android vault reaches its lock screen", result.locked);
  check("biometric enrollment does not trip the rendering boundary", !result.boundary,
    result.referenceError ? "ON_PHONE is not defined" : "");
  check("the Android biometric unlock action is visible", result.button);

  clearTimeout(bail);
  win.destroy();
  console.log(failures ? `\n${failures} device lock-screen check(s) failed.`
                       : "\nAn enrolled Android vault draws its secure lock screen.");
  finish(failures ? 1 : 0);
}).catch(error => { console.error(error); finish(2); });
