/* Exercise the shipped Android storage path with real IndexedDB/WebCrypto.
   Only Capacitor's Filesystem boundary is emulated. */
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert");

const root = path.join(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-chat-storage-race-"));
app.setPath("userData", path.join(temp, "profile"));
const html = path.join(temp, "blank.html");
fs.writeFileSync(html, "<!doctype html><meta charset=utf-8><title>Disposable Chat storage test</title>");
const source = fs.readFileSync(path.join(root, "web/js/rolecraft-web-platform.js"), "utf8");
const timer = setTimeout(() => { console.error("Chat storage race test timed out"); app.exit(2); }, 60000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false } });
  await win.loadFile(html);
  const run = code => win.webContents.executeJavaScript(code, true);
  await run(`
    window.__files = new Map();
    window.__readRace = null;
    window.__racePath = null;
    window.Capacitor = { nativePromise: async function (plugin, method, opts) {
      if (plugin !== "Filesystem") throw Error("Unexpected native plugin " + plugin);
      const files = window.__files;
      if (method === "requestPermissions" || method === "mkdir") return {};
      if (method === "writeFile" || method === "appendFile") {
        const binary = atob(opts.data);
        const incoming = Uint8Array.from(binary, char => char.charCodeAt(0));
        const old = method === "appendFile" ? files.get(opts.path) : null;
        const next = new Uint8Array((old ? old.length : 0) + incoming.length);
        if (old) next.set(old);
        next.set(incoming, next.length - incoming.length);
        files.set(opts.path, next);
        return {};
      }
      if (method === "deleteFile") { files.delete(opts.path); return {}; }
      if (method === "readFile" && opts.path === window.__racePath && window.__readRace) {
        const race = window.__readRace;
        window.__readRace = null;
        await race();
      }
      const bytes = files.get(opts.path);
      if (!bytes) throw Error("Missing test file " + opts.path);
      if (method === "stat") return { size: bytes.length };
      if (method === "readFile") {
        const part = bytes.subarray(opts.offset || 0, (opts.offset || 0) + (opts.length || bytes.length));
        let binary = "";
        for (let i = 0; i < part.length; i += 0x8000) binary += String.fromCharCode.apply(null, part.subarray(i, i + 0x8000));
        return { data: btoa(binary) };
      }
      throw Error("Unexpected Filesystem call " + method);
    } }; void 0;
  `);
  const exposed = source.replace('  window.vaultPlatform = "web";', `
    window.__chatStorageTest = { read: idbGet, path: filePointerPath };
    window.vaultPlatform = "web";`);
  assert.notStrictEqual(exposed, source, "Expose helpers from the shipped storage closure");
  await run(exposed);
  const results = await run(`(async function () {
    const storage = window.storage, test = window.__chatStorageTest, files = window.__files;
    const key = "chats:all", oldText = "saved conversation ".repeat(1500), newText = "synced conversation ".repeat(1500);
    const results = [];
    function check(condition, message) { if (!condition) throw Error(message); }

    await storage.set(key, oldText);
    const oldPointer = await test.read("v:" + key), oldPath = test.path(oldPointer);
    check(oldPointer.startsWith("bin:") && files.has(oldPath), "Chat is held in an encrypted Android file");
    window.__racePath = oldPath;
    window.__readRace = async function () {
      await storage.syncCommit({ [key]: newText }, { [key]: oldText });
      check(!files.has(oldPath), "Sync retired the file selected by the in-flight read");
    };
    const opened = await storage.get(key);
    check(opened.value === newText, "Chat read should use the current saved pointer after sync retires the old file");
    check(window.__readRace === null, "The readFile race ran");
    results.push("in-flight Chat read follows the committed sync pointer after old-file cleanup");

    const startingText = "before a burst of sync commits ".repeat(1500);
    const revisions = Array.from({ length: 4 }, (_, index) => ("synced revision " + index + " ").repeat(1500));
    await storage.set(key, startingText);
    let moves = 0;
    function armRace(pointer, expected) {
      window.__racePath = test.path(pointer);
      window.__readRace = async function () {
        const next = revisions[moves++];
        await storage.syncCommit({ [key]: next }, { [key]: expected });
        check(!files.has(test.path(pointer)), "Sync retired the previous Chat file in the burst");
        if (moves < revisions.length) armRace(await test.read("v:" + key), next);
      };
    }
    armRace(await test.read("v:" + key), startingText);
    const afterBurst = await storage.get(key);
    check(moves === revisions.length, "Every overlapping sync commit ran");
    check(afterBurst.value === revisions[revisions.length - 1], "Chat read should settle on the latest saved pointer after a burst of commits");
    results.push("Chat read survives four consecutive pointer replacements and returns the latest saved text");

    let movingText = "continuous sync starting point ".repeat(1500), movingCommits = 0;
    await storage.set(key, movingText);
    function armMovingRace(pointer, expected) {
      window.__racePath = test.path(pointer);
      window.__readRace = async function () {
        movingText = ("continuous synced revision " + ++movingCommits + " ").repeat(1500);
        await storage.syncCommit({ [key]: movingText }, { [key]: expected });
        armMovingRace(await test.read("v:" + key), movingText);
      };
    }
    armMovingRace(await test.read("v:" + key), movingText);
    let movingError = null;
    try { await storage.get(key); } catch (error) { movingError = error; }
    window.__readRace = null;
    check(movingError && /Chat changed during sync/.test(movingError.message), "A continuously changing Chat pointer must stop with a retryable error");
    check(movingCommits <= 25, "A changing pointer must not cause unbounded native reads");
    const movingPointer = await test.read("v:" + key);
    check((await storage.get(key)).value === movingText && await test.read("v:" + key) === movingPointer,
      "A failed read must leave the latest saved Chat available for a later read");
    results.push("continuous pointer changes stop within the retry cap without replacing saved Chat");

    const damagedText = "current missing conversation ".repeat(1500);
    await storage.set(key, damagedText);
    const damagedPointer = await test.read("v:" + key), damagedHash = await test.read("h:" + key);
    files.delete(test.path(damagedPointer));
    let rejected = false;
    try { await storage.get(key); } catch (_) { rejected = true; }
    check(rejected, "A missing file still referenced by the current pointer must fail closed");
    check(await test.read("v:" + key) === damagedPointer && await test.read("h:" + key) === damagedHash,
      "A failed read must not rewrite or discard the saved pointer and fingerprint");
    results.push("unchanged-current missing Chat file fails closed without storage mutation");
    return results;
  })()`);
  assert.equal(results.length, 4);
  results.forEach(result => console.log("PASS " + result));
  clearTimeout(timer);
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timer); app.exit(1); });
