// Mandatory Windows migration integration check: separate Electron processes,
// genuinely different OSCrypt profiles, and real safeStorage ciphertext.
const { app, BrowserWindow, safeStorage } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto"), assert = require("assert");
const { spawn } = require("child_process");
const { migrateStandardVault, prepareChatEncryption } = require("../app/chat-migration");
const arg = name => (process.argv.find(s => s.startsWith(name + "=")) || "").slice(name.length + 1);
const mode = arg("--fixture");
const root = arg("--fixture-root") || fs.mkdtempSync(path.join(os.tmpdir(), "rcv-real-oscrypt-"));
const source = path.join(root, "standard"), destination = path.join(root, "chat");
const profile = mode === "create" ? source : (mode === "verify" || mode === "reproduce") ? destination : path.join(root, "controller");
fs.mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
app.setPath("sessionData", profile);
process.argv.push("--user-data-dir=" + profile);
const timeout = setTimeout(() => { console.error("Windows encryption verification timed out"); app.exit(1); }, 90000);
const fail = error => { console.error(error.message); app.exit(1); };
const password = "fixture-master-password", pin = "825719", salt = "fixture-salt", pinSalt = "fixture-pin-salt";
const derive = (secret, suffix) => crypto.pbkdf2Sync(secret, Buffer.from(suffix), 210000, 32, "sha256");
const master = derive(password, salt + ":key");
const seal = (value, key) => {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
};
const chars = JSON.stringify([{ id: "fixture", name: "Windows encryption fixture", variants: [], gallery: [], sections: [] }]);
if (mode === "create") {
  app.whenReady().then(() => {
    assert(safeStorage.isEncryptionAvailable(), "Real Windows encryption is unavailable; run this check in an approved Windows session");
    fs.mkdirSync(path.join(source, "vault"));
    fs.writeFileSync(path.join(source, "security.json"), JSON.stringify({ salt, verifier: derive(password, salt + ":chk").toString("hex"), pinSalt, pinBlob: "e:" + safeStorage.encryptString(seal(master.toString("base64"), derive(pin, pinSalt + ":pin"))).toString("base64") }));
    fs.writeFileSync(path.join(source, "vault", "chars%3Aall.dat"), "enc:" + safeStorage.encryptString("pwd:" + seal(chars, master)).toString("base64"));
    console.log("PASS: fixture uses real Windows profile encryption for its records and PIN");
    clearTimeout(timeout); app.quit();
  }).catch(fail);
} else if (mode === "verify" || mode === "reproduce") {
  const loaded = new Promise(resolve => app.on("browser-window-created", (_event, win) => win.webContents.once("did-finish-load", () => resolve(win))));
  require("../app/main");
  loaded.then(async win => {
    assert(safeStorage.isEncryptionAvailable());
    assert((await win.webContents.executeJavaScript("window.auth.status()")).locked);
    if (mode === "reproduce") {
      assert.strictEqual((await win.webContents.executeJavaScript("window.auth.unlockPin('825719')")).ok, false);
      assert((await win.webContents.executeJavaScript("window.auth.unlockPassword('fixture-master-password')")).ok);
      await assert.rejects(win.webContents.executeJavaScript("window.storage.get('chars:all')"));
      console.log("PASS: missing encryption context reproduces the reported PIN rejection and password-accepted/storage-failed error");
      clearTimeout(timeout); app.quit(); return;
    }
    assert.strictEqual((await win.webContents.executeJavaScript("window.auth.unlockPin('000000')")).ok, false);
    assert((await win.webContents.executeJavaScript("window.auth.unlockPin('825719')")).ok, "migrated PIN must decrypt in its copied Windows context");
    assert.strictEqual((await win.webContents.executeJavaScript("window.storage.get('chars:all')")).value, chars);
    await win.webContents.executeJavaScript("window.auth.lock()");
    assert((await win.webContents.executeJavaScript("window.auth.unlockPassword('fixture-master-password')")).ok);
    assert.strictEqual((await win.webContents.executeJavaScript("window.storage.get('chars:all')")).value, chars);
    console.log("PASS: real shell unlocks both migrated PIN and master password, then reads Windows-encrypted records");
    clearTimeout(timeout); app.quit();
  }).catch(fail);
} else {
  const run = phase => new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(process.execPath, [__filename, "--fixture=" + phase, "--fixture-root=" + root, "--disable-gpu", "--no-sandbox"], { env, stdio: "inherit", windowsHide: true });
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error("Encryption fixture " + phase + " failed")));
  });
  (async () => {
    await run("create");
    fs.mkdirSync(destination);
    const original = fs.readFileSync(path.join(source, "Local State"));
    await migrateStandardVault({ source, destination });
    await run("reproduce");
    const previousChatContext = fs.readFileSync(path.join(destination, "Local State"));
    prepareChatEncryption(source, destination);
    await run("verify");
    await run("verify");
    assert.deepStrictEqual(fs.readFileSync(path.join(source, "Local State")), original, "the source encryption context must remain untouched");
    assert.deepStrictEqual(fs.readFileSync(path.join(destination, "Local State")), previousChatContext, "the previous Chat encryption context must remain untouched");
    console.log("PASS: original Windows profile remains untouched; native encryption migration and restart verified");
    clearTimeout(timeout); app.quit();
  })().catch(fail);
}
