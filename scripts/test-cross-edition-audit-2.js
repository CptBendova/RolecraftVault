/* Regression checks for the ten cross-edition defects fixed after 1.240.
   Behavioral checks lift the real shipped functions; ordering checks inspect
   the real surrounding path where a React/native lifecycle is not practical
   to execute under plain Node. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");
const { StringDecoder } = require("string_decoder");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const app = read("app/app.js");
const mainSource = read("app/main.js");
const platform = read("web/js/rolecraft-web-platform.js");
const transfer = read("mobile/src/rc-transfer.js");

function liftFunction(source, name) {
  const start = source.indexOf("function " + name + "(");
  if (start < 0) throw new Error("Could not find " + name);
  const open = source.indexOf("{", start);
  let depth = 0, quote = null, escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("Unclosed " + name);
}

let bad = 0;
function check(label, ok) {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label);
}

async function run() {
  const appendJsonText = new Function(
    liftFunction(app, "appendJsonText") + "; return appendJsonText;"
  )();
  const bridgeWrites = [];
  const C = { nativePromise: (_plugin, _method, args) => {
    bridgeWrites.push(Buffer.from(args.data, "utf8"));
    return Promise.resolve();
  } };
  const androidExpected = "a".repeat(256 * 1024 - 1) + "😀";
  await appendJsonText(C, "backup.json", "DATA", { first: true }, androidExpected);
  check("Android backup chunks preserve a surrogate pair at the boundary",
    Buffer.concat(bridgeWrites).toString("utf8") === androidExpected);

  check("backup export validates the pictures it actually read",
    /const finalCheck = backupInspection\(\{ \.\.\.base, images, thumbs \}\)/.test(app) &&
    /if \(!value\) throw new Error\("Backup validation failed/.test(app));

  const backupInspection = new Function("charImgIds", "personaImgIds", "imageIdsOf",
    liftFunction(app, "backupInspection") + "; return backupInspection;"
  )(
    record => record && record.profileImg ? [record.profileImg] : [],
    record => record && record.avatar ? [record.avatar] : [],
    (_type, record) => record && record.profileImg ? [record.profileImg] : []
  );
  const malformedBackup = backupInspection({
    app: "rolecraft-vault", chars: [null], personas: [], lore: [], prompts: [], images: {}
  });
  check("full restore rejects damaged elements inside otherwise valid arrays",
    !malformedBackup.ok && /damaged records/.test(malformedBackup.fatal.join(" ")));

  const makeUid = (() => { let n = 0; return () => "new-" + ++n; })();
  const normalizeLoreImport = new Function("uid", "toTermList", "asArray",
    liftFunction(app, "normalizeLoreImport") + "; return normalizeLoreImport;"
  )(makeUid, value => value || [], value => Array.isArray(value) ? value : [value]);
  const normalizePromptImport = new Function("uid", "toTermList", "asArray",
    liftFunction(app, "normalizePromptImport") + "; return normalizePromptImport;"
  )(makeUid, value => value || [], value => Array.isArray(value) ? value : [value]);
  const loreImport = normalizeLoreImport({
    app: "rolecraft-vault", lore: [], loreBooks: { Empty: { cover: "cover-l" } },
    images: { "cover-l": "data:image/png;base64,AA==" }
  }, "fallback", true);
  const promptImport = normalizePromptImport({
    app: "rolecraft-vault", prompts: [], promptBooks: { Empty: { cover: "cover-p" } },
    images: { "cover-p": "data:image/png;base64,AA==" }
  }, "fallback", true);
  check("lore and prompt exports round-trip empty books and cover pictures",
    loreImport.books.Empty && loreImport.images[loreImport.books.Empty.cover] &&
    promptImport.books.Empty && promptImport.images[promptImport.books.Empty.cover] &&
    /loreBooks: loreMeta/.test(app) && /promptBooks: promptMeta/.test(app));

  let committedPrepared = null;
  const dropped = [];
  const rewrapAll = new Function(
    "importAesKey", "dataKeys", "ensureWrapKey", "idbGet", "BIN_MARK", "BIN2_MARK", "FILE_MARK",
    "plainFromStored", "te", "vaultPath", "randomHex", "encryptBytes", "wrapKey", "writeBin",
    "sha16bytes", "aesEncrypt", "sha16plain", "nativeFs", "wrapRaw", "b64encode", "WRAP_ENC",
    "commitAuthReplacement", "dropPayloadFile", "securityCache",
    liftFunction(platform, "rewrapAll") + "; return rewrapAll;"
  )(
    raw => Promise.resolve("key:" + raw), () => Promise.resolve(["img:legacy"]), () => Promise.resolve(true),
    () => Promise.resolve("file:kv/legacy"), "bin:", "bin2:", "file:",
    () => Promise.resolve("legacy picture"), new TextEncoder(), key => "vault/" + key, () => "random",
    bytes => Promise.resolve(bytes), "wrap-key", () => Promise.resolve(true), () => Promise.resolve("1234567890abcdef"),
    () => Promise.resolve("wrapped"), () => Promise.resolve("1234567890abcdef"), () => true,
    new Uint8Array([1, 2, 3]), bytes => Buffer.from(bytes).toString("base64"), "enc:",
    prepared => { committedPrepared = prepared.map(item => ({ ...item })); return Promise.resolve(true); },
    stored => { dropped.push(stored); return Promise.resolve(true); }, undefined
  );
  await rewrapAll("old", "new", { salt: "new" });
  check("Android password changes migrate legacy file pointers before committing auth",
    committedPrepared && committedPrepared.length === 1 &&
    committedPrepared[0].stored.indexOf("bin:") === 0 && dropped.includes("file:kv/legacy"));

  const valueEvents = [];
  const putPlain = new Function(
    "nativeFs", "FS_LARGE", "te", "sha16bytes", "sha16plain", "idbGet", "wrapKey", "encryptBytes",
    "vaultPath", "randomHex", "writeBin", "idbCommitValue", "BIN_MARK", "dropPayloadFile", "aesEncrypt",
    liftFunction(platform, "putPlain") + "; return putPlain;"
  )(
    () => true, 1, new TextEncoder(), () => Promise.resolve("unused"), () => Promise.resolve("unused"),
    () => Promise.resolve("bin:old"), "wrap-key", bytes => Promise.resolve(bytes), key => "vault/" + key,
    () => "new", () => { valueEvents.push("write"); return Promise.resolve(true); },
    (key, stored, hash) => { valueEvents.push({ key, stored, hash }); return Promise.resolve(true); },
    "bin:", stored => { valueEvents.push("drop:" + stored); return Promise.resolve(true); },
    () => Promise.resolve("encrypted")
  );
  await putPlain("img:test", "large 😀 value", null, "1234567890abcdef");
  check("Android commits each value pointer and fingerprint together before cleanup",
    valueEvents[0] === "write" && valueEvents[1] && valueEvents[1].hash === "1234567890abcdef" &&
    valueEvents[2] === "drop:bin:old" &&
    /os\.put\(stored, "v:" \+ key\);[\s\S]{0,80}os\.put\(hash, "h:" \+ key\)/.test(liftFunction(platform, "idbCommitValue")));

  const lifecycle = app.slice(app.indexOf("const retryWhileHidden"), app.indexOf("window.__rcvOnBackground", app.indexOf("const retryWhileHidden")));
  const receiveSetup = transfer.slice(transfer.indexOf("const keepAlive"), transfer.indexOf("const persistOne"));
  check("Android rechecks background locking after active transfers and permission sheets",
    /retryWhileHidden\(1000\)/.test(lifecycle) &&
    receiveSetup.indexOf("receiveActive = true") < receiveSetup.indexOf('requestPermissions'));

  const eachTransferLine = new Function("fs", "Buffer", "StringDecoder",
    liftFunction(mainSource, "eachTransferLine") + "; return eachTransferLine;"
  )(fs, Buffer, StringDecoder);
  const desktopExpected = "a".repeat((1 << 20) - 1) + "😀";
  const transferTemp = fs.mkdtempSync(path.join(os.tmpdir(), "rolecraft-transfer-utf8-"));
  const temp = path.join(transferTemp, "payload.txt");
  fs.writeFileSync(temp, desktopExpected + "\n", "utf8");
  let desktopActual = "";
  try { eachTransferLine(temp, line => { desktopActual = line; }); }
  finally { try { fs.rmSync(transferTemp, { recursive: true, force: true }); } catch {} }
  check("Windows transfer parsing preserves UTF-8 across its 1 MiB boundary",
    desktopActual === desktopExpected);

  let fakeFile, fakeRequest;
  const fakeFs = {
    unlinkSync() {},
    createWriteStream() {
      fakeFile = new EventEmitter();
      fakeFile.destroy = () => { fakeFile.destroyed = true; };
      fakeFile.close = cb => cb();
      return fakeFile;
    }
  };
  const fakeHttp = {
    request() {
      fakeRequest = new EventEmitter();
      fakeRequest.destroy = () => { fakeRequest.destroyed = true; };
      fakeRequest.write = () => {};
      fakeRequest.end = () => setImmediate(() => fakeFile.emit("error", new Error("disk full")));
      return fakeRequest;
    }
  };
  const httpToFile = new Function("fs", "http",
    liftFunction(mainSource, "httpToFile") + "; return httpToFile;"
  )(fakeFs, fakeHttp);
  let writeFailure = null;
  try { await httpToFile({}, null, "incoming.bin"); } catch (e) { writeFailure = e; }
  check("Windows transfer file-write errors reject cleanly instead of becoming unhandled",
    writeFailure && /disk full/.test(writeFailure.message) && fakeFile.destroyed && fakeRequest.destroyed);

  const mirrorTail = mainSource.slice(mainSource.indexOf("const removalFailures"), mainSource.indexOf("const passwordSet"));
  check("Windows Mirror reports blocked deletions as a partial failure",
    /removalFailures\.push\(k\)/.test(mirrorTail) &&
    /removalFailures\.length[\s\S]{0,220}ok: false, partial: true/.test(mirrorTail));

  if (bad) {
    console.log("\n  " + bad + " cross-edition audit regression(s) failed.");
    process.exit(1);
  }
  console.log("\n  All ten cross-edition audit regressions are covered.");
}

run().catch(err => {
  console.error(err && err.stack || err);
  process.exit(1);
});
