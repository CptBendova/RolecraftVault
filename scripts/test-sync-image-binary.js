/* Exercise the shipped Android sync storage closure with real IndexedDB and
   WebCrypto. Only the Capacitor Filesystem boundary is an in-memory fixture. */
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert");
const root = path.join(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-sync-image-binary-"));
app.setPath("userData", path.join(temp, "profile"));
const source = process.env.RCV_SYNC_TEST_BASELINE === "1"
  ? require("child_process").execFileSync("git", ["show", "HEAD:web/js/rolecraft-web-platform.js"], { cwd: root, encoding: "utf8" })
  : fs.readFileSync(path.join(root, "web/js/rolecraft-web-platform.js"), "utf8");
const html = path.join(temp, "blank.html");
fs.writeFileSync(html, "<!doctype html><meta charset=utf-8><title>Disposable sync storage test</title>");
const timer = setTimeout(() => { console.error("Sync image storage test timed out"); app.exit(2); }, 60000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false } });
  await win.loadFile(html);
  const run = value => win.webContents.executeJavaScript(value, true);
  await run(`
    window.__files = new Map(); window.__writes = []; window.__deletes = [];
    window.__writeGate = null; window.__writeFailure = false; window.__deleteFailure = false;
    window.Capacitor = { nativePromise: async function (plugin, method, opts) {
      if (plugin !== "Filesystem") throw Error("Unexpected native plugin " + plugin);
      const files = window.__files, old = files.get(opts.path);
      if (method === "requestPermissions" || method === "mkdir") return {};
      if (method === "writeFile" || method === "appendFile") {
        if (opts.encoding) throw Error("Binary path unexpectedly encoded as text");
        const text = atob(opts.data), incoming = Uint8Array.from(text, c => c.charCodeAt(0));
        const next = new Uint8Array((method === "appendFile" && old ? old.length : 0) + incoming.length);
        if (method === "appendFile" && old) next.set(old);
        next.set(incoming, next.length - incoming.length); files.set(opts.path, next);
        window.__writes.push({ path: opts.path, size: incoming.length, bridge: opts.data.length });
        if (window.__writeGate) { const gate = window.__writeGate; window.__writeGate = null; await gate(opts.path); }
        if (window.__writeFailure) { window.__writeFailure = false; throw Error("Simulated disk full"); }
        return {};
      }
      if (method === "deleteFile") {
        window.__deletes.push(opts.path);
        if (window.__deleteFailure) throw Error("Simulated cleanup failure");
        files.delete(opts.path); return {};
      }
      if (!old) throw Error("Missing test file " + opts.path);
      if (method === "stat") return { size: old.length };
      if (method === "readFile") {
        const bytes = old.subarray(opts.offset || 0, (opts.offset || 0) + (opts.length || old.length));
        let text = ""; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return { data: btoa(text) };
      }
      throw Error("Unexpected Filesystem call " + method);
    } }; void 0;
  `);
  const exposed = source.replace('  window.vaultPlatform = "web";', `
    window.__imageStoreTest = {
      read: idbGet, prepare: prepareReplacementValue, drop: dropPayloadFile,
      path: filePointerPath, hash: sha16plain,
      beforeCommit: function (fn) {
        var real = commitStorageReplacement;
        commitStorageReplacement = function () {
          var args = arguments; commitStorageReplacement = real;
          return Promise.resolve().then(fn).then(function () { return real.apply(null, args); });
        };
      }
    };
    window.vaultPlatform = "web";`);
  assert.notStrictEqual(exposed, source, "Expose helpers from the real shipped closure");
  await run(exposed);
  const results = await run(`(async function () {
    const s = window.storage, t = window.__imageStoreTest, files = window.__files, results = [];
    function check(ok, text) { if (!ok) throw Error(text); }
    async function rejects(work, text) { let failed = false; try { await work(); } catch (_) { failed = true; } check(failed, text); }
    function image(prefix, size) {
      let text = ""; for (let i = 0; i < size; i++) text += String.fromCharCode((i * 31 + 7) & 255);
      return prefix + btoa(text);
    }
    async function same(key, value) {
      check((await s.get(key)).value === value, "Exact value round trip: " + key);
      check(await t.read("h:" + key) === await t.hash(value), "Original data URL fingerprint: " + key);
    }
    const samples = [
      image("data:image/png;base64,", 32768), image("data:image/jpeg;base64,", 32769),
      image("data:image/webp;base64,", 32770), image("DATA:image/PNG;name=portrait;BASE64,", 32771),
      image("data:image/avif;base64,", 32772), image("data:image/gif;base64,", 32773),
      image("data:image/svg+xml;charset=utf-8;base64,", 32774)
    ];
    for (let i = 0; i < samples.length; i++) {
      const key = (i % 2 ? "th:" : "img:") + "binary-" + i;
      await s.syncImage(key, samples[i]);
      const pointer = await t.read("v:" + key);
      check(pointer.startsWith("bin2:"), "Incoming sync images must use compact encrypted binary, not base64 text");
      check(JSON.parse(pointer.slice(5)).prefix === samples[i].slice(0, samples[i].indexOf(",") + 1), "Exact prefix survives");
      const bytes = files.get(t.path(pointer));
      check(String.fromCharCode(...bytes.subarray(0, 5)) === "RCVS1", "Pictures stay AES-GCM encrypted at rest");
      await same(key, samples[i]);
    }
    results.push("PNG/JPEG/WebP/AVIF/GIF/SVG, all padding lengths and exact mixed-case prefixes round-trip with original fingerprints");

    const baselineValue = image("data:image/jpeg;base64,", 3 * 1024 * 1024);
    let start = window.__writes.length;
    const baseline = await t.prepare("img:legacy-size", baselineValue);
    const legacySize = files.get(t.path(baseline.stored)).length;
    const legacyBridge = window.__writes.slice(start).reduce((n, item) => n + item.bridge, 0);
    const legacyWrites = window.__writes.length - start;
    await t.drop(baseline.staged);
    start = window.__writes.length;
    await s.syncImage("img:big", baselineValue);
    const compact = await t.read("v:img:big"), compactSize = files.get(t.path(compact)).length;
    const compactBridge = window.__writes.slice(start).reduce((n, item) => n + item.bridge, 0);
    check(compactSize < legacySize * 0.76 && compactBridge < legacyBridge * 0.76, "Remove base64 expansion from encryption, storage and bridge writes");
    check(window.__writes.length - start < legacyWrites, "Fewer native write round trips for a large photo");
    await same("img:big", baselineValue);
    results.push("3 MiB original: " + legacySize + " -> " + compactSize + " encrypted bytes; " + legacyWrites + " -> " + (window.__writes.length - start) + " bridge writes (no image recompression)");

    const canonical = image("data:image/png;base64,", 32768);
    const cases = [
      "Unicode 😀 café 漢字 ".repeat(2000), canonical + "\\n", canonical.slice(0, -1),
      canonical.slice(0, -3) + "AB=", "data:image/png,hello%20world".repeat(1000),
      image("data:application/octet-stream;base64,", 32768), "data:image/png;base64,%%%".repeat(1000),
      image("data:image/png;base64,", 6)
    ];
    for (let i = 0; i < cases.length; i++) {
      const key = "img:legacy-" + i;
      await s.syncImage(key, cases[i]); await same(key, cases[i]);
      check(!(await t.read("v:" + key)).startsWith("bin2:"), "Non-canonical, unsupported and tiny values retain text storage");
    }
    await s.set("lore:all", cases[0]); await s.syncCommit({ "lore:all": cases[0] + "🧙" }, { "lore:all": cases[0] });
    check((await s.get("lore:all")).value === cases[0] + "🧙", "Non-image Unicode replacement is untouched");
    await rejects(() => s.syncImage("lore:all", canonical), "Image endpoint refuses record keys");
    results.push("Malformed/non-canonical base64, non-image data, tiny images and Unicode retain exact legacy representation");

    start = window.__writes.length;
    await s.syncImage("img:binary-0", samples[0]);
    check(window.__writes.length === start, "An identical incoming image does not rewrite an existing file");
    await rejects(() => s.syncImage("img:binary-0", samples[1]), "Collision refuses overwrite");
    await same("img:binary-0", samples[0]);
    const existingPaths = [...files.keys()];
    t.beforeCommit(async () => { await s.set("img:race", samples[1]); });
    await rejects(() => s.syncImage("img:race", samples[0]), "Concurrent insert wins atomic null-pointer CAS");
    await same("img:race", samples[1]);
    const racePointer = await t.read("v:img:race"), racePath = t.path(racePointer);
    check(files.has(racePath) && files.size === existingPaths.length + 1, "CAS failure cleans only its staged file, never the concurrent winner");
    check(existingPaths.every(p => files.has(p)), "Unrelated original files remain intact");
    results.push("Identical arrivals skip rewriting; collisions and concurrent inserts preserve the winner plus atomic pointer/hash");

    let before = files.size;
    window.__writeFailure = true;
    await rejects(() => s.syncImage("img:failed-write", samples[0]), "Disk failure propagates");
    check(await t.read("v:img:failed-write") === null && await t.read("h:img:failed-write") === null && files.size === before, "Failed native write leaves neither metadata nor a partial file");
    window.__writeGate = () => window.auth.lock();
    start = window.__writes.length;
    await rejects(() => s.syncImage("img:locked-mid-file", baselineValue), "Lock during a chunk cancels a staged write");
    check(window.__writes.length === start + 1, "Lock stops subsequent file chunks");
    check(await t.read("v:img:locked-mid-file") === null && await t.read("h:img:locked-mid-file") === null && files.size === before, "Lock abort cleans only the staged file");
    await same("img:big", baselineValue);
    window.__writeGate = () => window.auth.lock();
    start = window.__writes.length;
    await rejects(() => s.syncImage("img:locked-legacy-file", baselineValue + "\\n"), "Lock also cancels non-canonical text fallback");
    check(window.__writes.length === start + 1, "Lock stops fallback file chunks too");
    check(await t.read("v:img:locked-legacy-file") === null && await t.read("h:img:locked-legacy-file") === null && files.size === before, "Fallback lock cleans its staged file");
    await same("img:big", baselineValue);
    t.beforeCommit(async () => { await window.auth.lock(); await s.get("img:big"); });
    await rejects(() => s.syncImage("img:epoch-race", samples[0]), "Lock and resume before CAS cannot publish stale work");
    check(await t.read("v:img:epoch-race") === null && await t.read("h:img:epoch-race") === null && files.size === before, "Epoch cancellation preserves files and metadata");
    results.push("Disk errors, lock mid-write and lock/resume before commit fail closed and clean only staged data");

    // Failed cleanup may leave an orphan, but must never remove committed data.
    t.beforeCommit(async () => { await s.set("img:cleanup-race", samples[1]); window.__deleteFailure = true; });
    await rejects(() => s.syncImage("img:cleanup-race", samples[0]), "A cleanup error must not turn failed CAS into success");
    window.__deleteFailure = false;
    await same("img:cleanup-race", samples[1]);
    check(files.has(t.path(await t.read("v:img:cleanup-race"))), "Cleanup failure preserves the committed picture");
    results.push("Cleanup failure cannot delete a committed or concurrently saved picture");

    const protectedResult = await window.auth.setPassword("disposable-test-password");
    check(protectedResult.ok, "Set disposable test password");
    await same("img:big", baselineValue);
    before = files.size; window.__writeGate = () => window.auth.lock();
    await rejects(() => s.syncImage("img:protected-lock", samples[0]), "Protected vault lock aborts image staging");
    check(await t.read("v:img:protected-lock") === null && await t.read("h:img:protected-lock") === null && files.size === before, "Protected lock leaves no staged pointer/hash");
    await rejects(() => s.syncImage("img:already-locked", samples[0]), "Already locked vault refuses image staging");
    check((await window.auth.unlockPassword("disposable-test-password")).ok, "Unlock disposable test vault");
    await same("img:binary-0", samples[0]); await same("img:big", baselineValue);
    results.push("Password wrapping, lock refusal and unlock retain binary/legacy read compatibility");

    window.Capacitor = null;
    await s.syncImage("img:browser", samples[0]);
    check((await t.read("v:img:browser")).startsWith("pwd:"), "Browser still uses encrypted IndexedDB values");
    await same("img:browser", samples[0]);
    results.push("Browser edition stays on its existing password-encrypted IndexedDB path");
    return results;
  })()`);
  assert.strictEqual(results.length, 8);
  results.forEach(result => console.log("PASS: " + result));
  clearTimeout(timer); app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timer); app.exit(1); });
