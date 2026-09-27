// Launch the shipped Windows shell against a disposable migrated vault. Never
// use the developer's real profile or real password for this check.
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto"), assert = require("assert");
const { migrateStandardVault } = require("../app/chat-migration");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-migration-unlock-"));
const source = path.join(root, "standard"), destination = path.join(root, "chat");
fs.mkdirSync(path.join(source, "vault"), { recursive: true });
fs.mkdirSync(destination);
process.argv.push("--user-data-dir=" + destination);
app.setPath("userData", destination);
const password = "disposable-test-password", salt = "fixture-salt";
const derive = suffix => crypto.pbkdf2Sync(password, Buffer.from(salt + suffix), 210000, 32, "sha256");
fs.writeFileSync(path.join(source, "security.json"), JSON.stringify({ salt, verifier: derive(":chk").toString("hex") }));
const chars = JSON.stringify([{ id: "test-character", name: "Migration test character", gallery: [], variants: [], sections: [] }]);
const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", derive(":key"), iv);
const ct = Buffer.concat([cipher.update(chars), cipher.final()]);
fs.writeFileSync(path.join(source, "vault", "chars%3Aall.dat"), "pln:pwd:" + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64"));
const timeout = setTimeout(() => { console.error("Migration unlock smoke test timed out"); app.exit(1); }, 60000);
(async () => {
  await migrateStandardVault({ source, destination });
  const loaded = new Promise(resolve => app.on("browser-window-created", (_event, win) => win.webContents.once("did-finish-load", () => resolve(win))));
  require("../app/main");
  const win = await loaded;
  const initial = await win.webContents.executeJavaScript("window.auth.status()");
  assert(initial.passwordSet && initial.locked, "migrated profile must open locked under its original password");
  assert.strictEqual((await win.webContents.executeJavaScript("window.auth.unlockPassword('incorrect')")).ok, false);
  const unlocked = await win.webContents.executeJavaScript("window.auth.unlockPassword('disposable-test-password')");
  assert(unlocked.ok, "the original password must unlock the copied vault");
  const record = await win.webContents.executeJavaScript("window.storage.get('chars:all')");
  assert.strictEqual(record.value, chars);
  const refused = await win.webContents.executeJavaScript("window.updater.install('{}')");
  assert.strictEqual(refused.ok, false);
  console.log("PASS: real Windows shell keeps the migrated password gate, rejects a wrong password, reads the copied character, and refuses standard patches");
  clearTimeout(timeout);
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
