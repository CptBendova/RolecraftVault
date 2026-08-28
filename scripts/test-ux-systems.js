const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app", "app.js"), "utf8");
const main = fs.readFileSync(path.join(root, "app", "main.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "app", "preload.js"), "utf8");
const web = fs.readFileSync(path.join(root, "web", "js", "rolecraft-web-platform.js"), "utf8");
const installer = fs.readFileSync(path.join(root, "installer", "main.js"), "utf8");
const manifest = fs.readFileSync(path.join(root, "mobile", "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
const activity = fs.readFileSync(path.join(root, "mobile", "android", "app", "src", "main", "java", "com", "cptbendova", "rolecraftvault", "MainActivity.java"), "utf8");
const device = fs.readFileSync(path.join(root, "mobile", "android", "app", "src", "main", "java", "com", "cptbendova", "rolecraftvault", "DeviceUnlockPlugin.java"), "utf8");

let failed = 0;
function check(name, value, detail) {
  const ok = !!value;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  " + detail : ""));
  if (!ok) failed++;
}
function functionSource(source, name) {
  const start = source.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing " + name);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}

console.log("\ntemplates and duplication");
let n = 0;
const copy = vm.runInNewContext("(" + functionSource(app, "textOnlyCopy") + ")", { JSON, uid: () => "fresh-" + (++n) });
const original = {
  id: "char-1", name: "Ada", profileImg: "portrait", banner: "banner",
  gallery: [{ imgId: "gallery" }], imgMeta: { portrait: { album: "A" } }, albums: ["A"],
  sections: [{ id: "section-old", title: "Voice", content: "Dry" }],
  variants: [{ id: "variant-old", name: "Winter", profileImg: "variant-pic" }]
};
const cloned = copy("character", original, true);
check("a duplicate gets a fresh record id", cloned.id !== original.id);
check("a duplicate gets fresh nested ids", cloned.sections[0].id !== original.sections[0].id && cloned.variants[0].id !== original.variants[0].id);
check("pictures never become shared ownership", !cloned.profileImg && !cloned.banner && !cloned.gallery.length && !cloned.variants[0].profileImg);
check("the source record is untouched", original.profileImg === "portrait" && original.variants[0].profileImg === "variant-pic");
check("built-in and saved templates have a visible picker", app.includes("BUILT_IN_TEMPLATES") && app.includes("Add to templates") && app.includes("Saved on this device"));

console.log("\nundo and writing protection");
check("every record type enters the durable bin before removal", app.includes("const entries = await sendManyToTrash(type, [r])"));
check("single and bulk deletes offer an eight-second undo", app.includes("}, 8000)") && /showUndo\([^\n]+moved to the bin/.test(app));
check("undo restores records and the encrypted bin together", app.includes("const restoreTrashEntries = async entries") && app.includes('sSet("trash:all"'));
check("draft writes expose waiting, saving, protected and error states", ["waiting", "saving", "protected", "error"].every(s => app.includes('state: "' + s + '"')));
check("draft status is announced accessibly", app.includes('className: "draft-status " + state') && app.includes('"aria-live": "polite"'));

console.log("\nAndroid navigation and secure unlock");
check("phone navigation is a fixed five-destination bottom bar", app.includes(".rcv.phone .sidebar { position: fixed") && app.includes("primary-nav") && app.includes("safe-area-inset-bottom"));
check("the interface unwinds its top layer before exiting", app.includes("window.__rcvAndroidBack = handleBack") && app.includes('document.querySelector(".modal-back, .lightbox, .scrollbody.sheet")'));
check("Android uses the modern back dispatcher", activity.includes("OnBackPressedCallback") && activity.includes("getOnBackPressedDispatcher"));
check("predictive back is enabled", manifest.includes('android:enableOnBackInvokedCallback="true"'));
check("biometrics require a strong authenticator and Android Keystore", device.includes("BIOMETRIC_STRONG") && device.includes("AndroidKeyStore") && device.includes("setUserAuthenticationRequired(true)"));
check("the raw vault key is sealed before native storage", web.includes('deviceUnlockCall("enroll", { secret: b64encode(raw) })') && !device.includes('putString("secret"') && device.includes("result.doFinal(secret.getBytes"));
check("Android and Windows expose the same device-unlock contract", ["setDeviceUnlock", "removeDeviceUnlock", "unlockDevice"].every(k => preload.includes(k) && web.includes(k)));

console.log("\nWindows Hello and signed update files");
check("Windows Hello fails closed through the OS verifier", main.includes("UserConsentVerifier") && main.includes('result !== "Verified"'));
const updateFileArg = vm.runInNewContext("(" + functionSource(main, "updateFileArg") + ")", { path });
check("only .rcvup arguments are selected", updateFileArg(["app.exe", "C:\\tmp\\good.rcvup"]) === "C:\\tmp\\good.rcvup" && updateFileArg(["app.exe", "bad.json"]) === null);
check("a second launch forwards the update to the running app", main.includes('app.on("second-instance", (_event, commandLine)') && main.includes("openUpdateFile(updateFile, win)"));
check("the installer registers open and cleans it up on uninstall", installer.includes('RolecraftVault.Update\\\\shell\\\\open\\\\command') && installer.includes("Remove-Item -LiteralPath 'HKLM:\\\\Software\\\\Classes\\\\.rcvup'"));
check("the renderer receives file results even during startup", preload.includes("lastUpdateFileResult") && preload.includes("updateFileListeners"));

if (failed) {
  console.error("\n" + failed + " UX systems check(s) failed.");
  process.exit(1);
}
console.log("\nNavigation, undo, draft safety, templates, device unlock and update handoff are wired end to end.");
