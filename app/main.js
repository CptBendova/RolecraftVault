const { app, BrowserWindow, ipcMain, safeStorage, shell, session, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

let dataDir, boundsFile, securityFile, rewrapFile;
let masterKey = null; // Buffer(32) in memory only while unlocked

const ITER = 210000;
const kdf = (secret, salt) => crypto.pbkdf2Sync(secret, salt, ITER, 32, "sha256");

function loadSecurity() {
  try { return JSON.parse(fs.readFileSync(securityFile, "utf8")); } catch { return null; }
}
function saveSecurity(s) {
  if (s) fs.writeFileSync(securityFile, JSON.stringify(s));
  else if (fs.existsSync(securityFile)) fs.unlinkSync(securityFile);
}
/* ---------- signed update system ----------
   Updates swap the renderer bundle (app.js) only. Packages are .rcvup JSON files
   signed with Ed25519; the public key below is baked in, so only packages signed
   with the matching private key (kept by the vault owner) will ever install.
   The same signed file format works for a future cloud updater. */
const FACTORY_BUILD = "1.211";
const UPDATE_PUBKEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAOGlUi0PAX40xdBvu/0koKWlHr+bFCB2MdbA7OEbNQO4=
-----END PUBLIC KEY-----`;
let updatesDir = null; // set once app is ready
const updateManifestPath = () => path.join(updatesDir, "current", "manifest.json");
const updateAppJsPath = () => path.join(updatesDir, "current", "app.js");
function verifyUpdatePackage(pkg) {
  if (!pkg || typeof pkg !== "object") return { ok: false, error: "Not a valid update file" };
  if (typeof pkg.version !== "string" || !pkg.version.trim()) return { ok: false, error: "Missing version" };
  if (!pkg.files || typeof pkg.files["app.js"] !== "string") return { ok: false, error: "Package has no app.js" };
  if (!pkg.hashes || typeof pkg.hashes["app.js"] !== "string") return { ok: false, error: "Missing hashes" };
  if (typeof pkg.sig !== "string") return { ok: false, error: "Package is unsigned" };
  let appJs;
  try { appJs = Buffer.from(pkg.files["app.js"], "base64"); } catch { return { ok: false, error: "Corrupt payload" }; }
  const digest = crypto.createHash("sha256").update(appJs).digest("hex");
  if (digest !== pkg.hashes["app.js"]) return { ok: false, error: "Hash mismatch — file is corrupt or tampered" };
  const canon = JSON.stringify({ version: pkg.version, hashes: pkg.hashes });
  let sigOk = false;
  try {
    sigOk = crypto.verify(null, Buffer.from(canon, "utf8"),
      crypto.createPublicKey(UPDATE_PUBKEY), Buffer.from(pkg.sig, "base64"));
  } catch { sigOk = false; }
  if (!sigOk) return { ok: false, error: "Signature check failed — not an authentic update" };
  /* Outside the signature deliberately: the signed form is {version, hashes} and
     always has been, so adding to it would stop every installed copy from being
     able to verify any future patch. These two steer a helpful refusal rather
     than a security decision, and nothing installs without a valid signature. */
  return { ok: true, appJs, version: pkg.version, notes: typeof pkg.notes === "string" ? pkg.notes : "",
    needsShell: pkg.needsShell === true,
    shellBuild: typeof pkg.shellBuild === "string" ? pkg.shellBuild : "" };
}
function activeUpdate() {
  try {
    const man = JSON.parse(fs.readFileSync(updateManifestPath(), "utf8"));
    // A patch only replaces app.js, so it keeps shadowing the bundled one even after
    // the shell is reinstalled — running a new installer would silently leave you on
    // the old interface. The build that was current when the patch was applied is
    // recorded here; if it no longer matches, the shell has moved on and the patch is
    // stale. Patches written before this field existed predate every build that has
    // it, so a missing value is stale too. Versions are never ordered, only compared.
    if (man.factoryBuild !== FACTORY_BUILD) { revertUpdateToFactory(); return null; }
    const appJs = fs.readFileSync(updateAppJsPath());
    const digest = crypto.createHash("sha256").update(appJs).digest("hex");
    if (digest !== man.hashes["app.js"]) throw new Error("hash");
    const canon = JSON.stringify({ version: man.version, hashes: man.hashes });
    if (!crypto.verify(null, Buffer.from(canon, "utf8"),
      crypto.createPublicKey(UPDATE_PUBKEY), Buffer.from(man.sig, "base64"))) throw new Error("sig");
    return { version: man.version, notes: man.notes || "" };
  } catch { return null; }
}
function fileUrl(p) { return encodeURI("file:///" + p.replace(/\\/g, "/")); }
function resolveEntryFile() {
  // Chromium refuses redirects to file:// URLs, so instead of intercepting requests we
  // write an "effective" index next to the update that points every asset at the factory
  // folder and swaps only the app bundle for the verified update.
  const factory = path.join(__dirname, "index.html");
  const act = activeUpdate();
  if (!act) return factory;
  try {
    let html = fs.readFileSync(factory, "utf8");
    const base = fileUrl(__dirname) + "/";
    html = html.replace(/(src|href)=("|')(?!https?:|file:|data:|#)/g, (m, attr, q) => attr + "=" + q + base);
    html = html.split("url('vendor/").join("url('" + base + "vendor/");
    html = html.replace(base + "app.js", fileUrl(updateAppJsPath()));
    html = html
      .replace("default-src 'self'", "default-src 'self' file:")
      .replace("script-src 'self'", "script-src 'self' file:")
      .replace("font-src 'self'", "font-src 'self' file:")
      .replace("img-src 'self'", "img-src 'self' file: data: blob:");
    /* Everything above rewrites what is written in the page. Nothing can
       rewrite a path the interface builds while it runs, and the page now sits
       in the updates folder, so those resolve to the wrong place — which is how
       the crest disappeared. A base element answers all of them at once,
       including any asset added later. */
    html = html.replace(/<head>/i, '<head><base href="' + base + '">');
    const eff = path.join(updatesDir, "current", "index.effective.html");
    fs.writeFileSync(eff, html);
    return eff;
  } catch (e) { return factory; }
}
function revertUpdateToFactory() {
  try { fs.rmSync(path.join(updatesDir, "current"), { recursive: true, force: true }); } catch (e) {}
}
/* ================= LAN transfer (opt-in, local network only) =================
   No server runs unless the person presses "Send" — see startTransferServer.
   The payload is AES-256-GCM encrypted with a key derived from the one-time
   pairing code, so the code is required even by someone on the same network. */
const http = require("http");
const os = require("os");
// Crockford-style base32 without ambiguous chars (no I, L, O, U)
const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function toBase32(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHA[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHA[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(str) {
  const clean = String(str).toUpperCase().replace(/[^0-9A-Z]/g, "")
    .replace(/I/g, "1").replace(/L/g, "1").replace(/O/g, "0").replace(/U/g, "V");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHA.indexOf(ch);
    if (idx < 0) throw new Error("Bad character in code");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// payload: 4 bytes IPv4 + 2 bytes port + 6 bytes secret = 12 bytes -> 20 base32 chars
function makeCode(ip, port, secret) {
  const parts = String(ip).split(".").map(n => parseInt(n, 10));
  if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) throw new Error("Bad IPv4");
  const buf = Buffer.alloc(12);
  parts.forEach((n, i) => buf[i] = n);
  buf.writeUInt16BE(port, 4);
  secret.copy(buf, 6, 0, 6);
  const raw = toBase32(buf);
  return raw.match(/.{1,5}/g).join("-");
}

function parseCode(code) {
  const buf = fromBase32(code);
  if (buf.length < 12) throw new Error("That code looks incomplete");
  return {
    ip: [buf[0], buf[1], buf[2], buf[3]].join("."),
    port: buf.readUInt16BE(4),
    secret: buf.slice(6, 12),
  };
}

function keyFrom(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, 150000, 32, "sha256");
}

function encryptPayload(plaintextBuf, secret) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = keyFrom(secret, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from("RCVX1"), salt, iv, tag, body]);
}

function decryptPayload(blob, secret) {
  if (blob.slice(0, 5).toString() !== "RCVX1") throw new Error("Not a Rolecraft transfer");
  const salt = blob.slice(5, 21);
  const iv = blob.slice(21, 33);
  const tag = blob.slice(33, 49);
  const body = blob.slice(49);
  const key = keyFrom(secret, salt);
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
}

let transferServer = null;
/* A mirror asks the other device first, and that question has to survive the
   round trip: the HTTP response is held open while a window shows a dialog and
   somebody decides. Keyed by id so two requests cannot answer each other. */
const pendingMirrorAsks = new Map();
function askThisDevice(detail, timeoutMs) {
  const wins = BrowserWindow.getAllWindows();
  const win = wins && wins[0];
  if (!win || win.isDestroyed()) return Promise.resolve("unavailable");
  const id = crypto.randomBytes(8).toString("hex");
  return new Promise(resolve => {
    let done = false;
    const finish = answer => {
      if (done) return;
      done = true;
      pendingMirrorAsks.delete(id);
      clearTimeout(timer);
      resolve(answer);
    };
    // an unanswered question is a refusal, never an approval
    const timer = setTimeout(() => finish("refuse"), timeoutMs);
    pendingMirrorAsks.set(id, finish);
    try {
      win.webContents.send("transfer-mirror-request", Object.assign({ id }, detail));
    } catch (e) { finish("unavailable"); }
  });
}
let transferState = null; // { secret, code, expiresAt, timer, pack }

function lanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === "IPv4" && !ni.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ni.address)) return ni.address;
    }
  }
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === "IPv4" && !ni.internal) return ni.address;
    }
  }
  return null;
}

function stopTransferServer() {
  if (transferState && transferState.timer) clearTimeout(transferState.timer);
  transferState = null;
  try { if (updatesDir) fs.unlinkSync(transferFilePath()); } catch (e) {}
  clearDeltaFiles();
  if (transferServer) {
    try { transferServer.close(); } catch (e) {}
    transferServer = null;
  }
}

const transferFilePath = () => path.join(updatesDir, "transfer.bin");
const deltaFilePath = () => path.join(updatesDir, "delta.bin");
const deltaBatchPath = i => path.join(updatesDir, "delta-" + i + ".bin");
function clearDeltaFiles() {
  if (!updatesDir) return;
  try { fs.unlinkSync(deltaFilePath()); } catch (e) {}
  try {
    for (const name of fs.readdirSync(updatesDir)) {
      if (/^delta-\d+\.bin$/.test(name)) {
        try { fs.unlinkSync(path.join(updatesDir, name)); } catch (e2) {}
      }
    }
  } catch (e) {}
}
/* A phone cannot hold a whole vault in one Capacitor HTTP response: around
   130 MB the native layer stops. Batches stay modest, but one picture can be
   larger than the cap — that picture is still its own file, and the phone
   pulls it in 3 MB slices. 8 MB packs more records per round trip than 6 MB
   without going near that cliff. */
const BATCH_PLAIN_MAX = 8 * 1024 * 1024;

/* A short fingerprint per record lets the two devices work out exactly which
   records differ, so only those travel. Fingerprinting means reading and hashing
   the whole vault, which on a library of pictures is most of the wait in a sync
   — and it happens once to preview the sync and again to run it, on both
   devices. So the result is cached against a cheap signature of the folder:
   every filename with its size and modification time. Records are only ever
   written by writeFileAtomic, which replaces the file, so a changed record
   always moves its mtime and the cache stands down. */
let manifestCache = null; // { sig, manifest }
function vaultSignature() {
  const h = crypto.createHash("sha256");
  let names;
  try { names = fs.readdirSync(dataDir).sort(); } catch (e) { return null; }
  for (const f of names) {
    if (!f.endsWith(".dat")) continue;
    try {
      const st = fs.statSync(path.join(dataDir, f));
      h.update(f).update("|").update(String(st.size)).update("|").update(String(st.mtimeMs)).update("\n");
    } catch (e) { return null; } // a file that vanished mid-scan: do not trust a cache
  }
  return h.digest("hex");
}
/* Reading a record and hashing it. Pulled out so the blocking build and the
   yielding one below cannot drift apart in what they produce. */
/* Per-file hash cache. Sharing used to decrypt and hash every picture on every
   press of Share, which is most of the wait. Each record is one .dat file, and
   writeFileAtomic always changes mtime, so size+mtime is enough to reuse a hash.
   Kept beside the vault rather than inside it, so it is not itself a record. */
function hashCachePath() { return path.join(dataDir, "_xfer-hash-cache.json"); }
let hashCache = null;
function loadHashCache() {
  if (hashCache) return hashCache;
  try { hashCache = JSON.parse(fs.readFileSync(hashCachePath(), "utf8")) || {}; }
  catch { hashCache = {}; }
  return hashCache;
}
function saveHashCache() {
  if (!hashCache) return;
  try { writeFileAtomic(hashCachePath(), JSON.stringify(hashCache)); } catch (e) {}
}
function rememberHash(key, value) {
  try {
    const f = keyToFile(key);
    const st = fs.statSync(f);
    const h = crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
    loadHashCache()[path.basename(f)] = { size: st.size, mtimeMs: st.mtimeMs, hash: h };
    return h;
  } catch (e) { return null; }
}
function forgetHash(key) {
  try { delete loadHashCache()[path.basename(keyToFile(key))]; } catch (e) {}
}
function hashOfRecord(k) {
  const f = keyToFile(k);
  let st;
  try { st = fs.statSync(f); } catch (e) { return null; }
  const rec = loadHashCache()[path.basename(f)];
  if (rec && rec.size === st.size && rec.mtimeMs === st.mtimeMs && rec.hash) return rec.hash;
  try {
    const v = readValue(k);
    if (v === null || v === undefined) return null;
    return rememberHash(k, v);
  } catch (e) { return null; }
}
function buildManifest(report) {
  const sig = vaultSignature();
  if (sig && manifestCache && manifestCache.sig === sig) {
    if (report) report(1, 1);
    return manifestCache.manifest;
  }
  const keys = allKeys();
  const m = {};
  let i = 0;
  for (const k of keys) {
    const h = hashOfRecord(k);
    if (h !== null) m[k] = h;
    if (report) report(++i, keys.length);
  }
  if (sig && sig === vaultSignature()) manifestCache = { sig, manifest: m };
  saveHashCache();
  return m;
}
/* Same scan, before anyone is waiting. Yields on a clock rather than every
   handful of records, because a cached hash is cheap and yielding was most of
   the remaining wait once the pictures had already been hashed once. */
async function warmManifest(report) {
  const sig = vaultSignature();
  if (sig && manifestCache && manifestCache.sig === sig) return;
  const keys = allKeys();
  const m = {};
  let lastYield = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const h = hashOfRecord(keys[i]);
    if (h !== null) m[keys[i]] = h;
    if (report) report(i + 1, keys.length);
    if (Date.now() - lastYield > 40) {
      await new Promise(r => setImmediate(r));
      lastYield = Date.now();
    }
  }
  if (sig && sig === vaultSignature()) manifestCache = { sig, manifest: m };
  saveHashCache();
}
function sendToWindow(channel, payload) {
  try {
    const wins = BrowserWindow.getAllWindows();
    const win = wins && wins[0];
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  } catch (e) {}
}
function publishShareProgress(p) {
  if (transferState) transferState.pack = p;
  const now = Date.now();
  if (publishShareProgress._last && now - publishShareProgress._last < 80 && p.phase === publishShareProgress._phase && p.done !== p.total) return;
  publishShareProgress._last = now;
  publishShareProgress._phase = p.phase;
  sendToWindow("transfer-progress", p);
}
/* Both sides of a transfer look identical once you are staring at a code, which
   is how someone mirrors the wrong way round and deletes the vault they meant to
   keep. Each device says its own name so the receiving screen can spell out
   which vault is about to be changed. */
function deviceName() {
  try {
    const h = String(os.hostname() || "").split(".")[0].trim();
    if (h) return h.slice(0, 40);
  } catch (e) {}
  return "Unnamed device";
}
function countRecords(manifest) {
  // only the things a person would recognise as "their stuff"
  let n = 0;
  // sz: is the recorded byte size beside each picture, not a record of yours
  for (const k of Object.keys(manifest)) if (!/^(img:|th:|sz:|ui:)/.test(k)) n++;
  return n;
}
const transferPlainPath = () => path.join(updatesDir, "transfer.plain");

/* Streams the vault to disk one record at a time as encrypted NDJSON.
   Never builds a whole-vault string, so big image libraries can't blow
   V8's max string length (the "Invalid string length" failure). */
async function buildRecordFile(secret, keys, outPath, report) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFrom(secret, salt), iv);
  try { fs.unlinkSync(outPath); } catch (e) {}
  const fd = fs.openSync(outPath, "w");
  const put = buf => { if (buf && buf.length) fs.writeSync(fd, buf); };
  try {
    fs.writeSync(fd, Buffer.from("RCVX2"));
    fs.writeSync(fd, salt);
    fs.writeSync(fd, iv);
    put(cipher.update(Buffer.from(JSON.stringify({
      app: "rolecraft-vault", kind: "lan-delta", at: new Date().toISOString()
    }) + "\n", "utf8")));
    let count = 0;
    let lastYield = Date.now();
    for (let i = 0; i < keys.length; i++) {
      let v;
      try { v = readValue(keys[i]); } catch (e) { v = null; }
      if (v !== null && v !== undefined) {
        put(cipher.update(Buffer.from(JSON.stringify({ k: keys[i], v: String(v) }) + "\n", "utf8")));
        count++;
      }
      if (report) report(i + 1, keys.length);
      if (Date.now() - lastYield > 40) {
        await new Promise(r => setImmediate(r));
        lastYield = Date.now();
      }
    }
    put(cipher.final());
    fs.writeSync(fd, cipher.getAuthTag());
    fs.closeSync(fd);
    return { count, bytes: fs.statSync(outPath).size, path: outPath };
  } catch (e) {
    try { fs.closeSync(fd); } catch (e2) {}
    try { fs.unlinkSync(outPath); } catch (e2) {}
    throw e;
  }
}

function estimateKeyBytes(k) {
  const m = /^(?:img|th):(.+)$/.exec(k);
  if (m) {
    try {
      const n = Number(readValue("sz:" + m[1]));
      if (Number.isFinite(n) && n > 0) return n;
    } catch (e) {}
  }
  try {
    const v = readValue(k);
    if (v === null || v === undefined) return 0;
    return String(v).length;
  } catch (e) { return 0; }
}

function splitKeysIntoBatches(keys) {
  const batches = [];
  let cur = [], size = 0;
  for (const k of keys) {
    const n = estimateKeyBytes(k);
    if (cur.length && size + n > BATCH_PLAIN_MAX) {
      batches.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(k);
    size += n;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

function openRecordWriter(outPath, secret) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFrom(secret, salt), iv);
  try { fs.unlinkSync(outPath); } catch (e) {}
  const fd = fs.openSync(outPath, "w");
  fs.writeSync(fd, Buffer.from("RCVX2"));
  fs.writeSync(fd, salt);
  fs.writeSync(fd, iv);
  const putPlain = buf => {
    const out = cipher.update(buf);
    if (out && out.length) fs.writeSync(fd, out);
  };
  putPlain(Buffer.from(JSON.stringify({
    app: "rolecraft-vault", kind: "lan-delta", at: new Date().toISOString()
  }) + "\n", "utf8"));
  return {
    path: outPath,
    writeRecord(k, v) {
      putPlain(Buffer.from(JSON.stringify({ k: k, v: String(v) }) + "\n", "utf8"));
    },
    finish() {
      const last = cipher.final();
      if (last && last.length) fs.writeSync(fd, last);
      fs.writeSync(fd, cipher.getAuthTag());
      fs.closeSync(fd);
      return { path: outPath, bytes: fs.statSync(outPath).size };
    },
    abort() {
      try { fs.closeSync(fd); } catch (e) {}
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  };
}

function buildTransferFile(secret) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = keyFrom(secret, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const out = transferFilePath();
  try { fs.unlinkSync(out); } catch (e) {}
  const fd = fs.openSync(out, "w");
  const put = buf => { if (buf && buf.length) fs.writeSync(fd, buf); };
  try {
    fs.writeSync(fd, Buffer.from("RCVX2"));
    fs.writeSync(fd, salt);
    fs.writeSync(fd, iv);
    put(cipher.update(Buffer.from(JSON.stringify({
      app: "rolecraft-vault", kind: "lan-transfer", at: new Date().toISOString()
    }) + "\n", "utf8")));
    let count = 0;
    for (const k of allKeys()) {
      let v;
      try { v = readValue(k); } catch (e) { continue; }
      if (v === null || v === undefined) continue;
      put(cipher.update(Buffer.from(JSON.stringify({ k: k, v: String(v) }) + "\n", "utf8")));
      count++;
    }
    put(cipher.final());
    fs.writeSync(fd, cipher.getAuthTag());
    fs.closeSync(fd);
    return { count, bytes: fs.statSync(out).size, path: out };
  } catch (e) {
    try { fs.closeSync(fd); } catch (e2) {}
    try { fs.unlinkSync(out); } catch (e2) {}
    throw e;
  }
}

function applyAllValues(obj, replace) {
  if (replace) {
    for (const k of allKeys()) {
      try { fs.unlinkSync(keyToFile(k)); } catch (e) {}
    }
  }
  let n = 0;
  for (const k of Object.keys(obj || {})) {
    writeValue(k, obj[k]);
    n++;
  }
  return n;
}

function startTransferServer() {
  stopTransferServer();
  const ip = lanAddress();
  if (!ip) return { ok: false, error: "No local network connection found. Connect both devices to the same Wi-Fi." };
  const secret = crypto.randomBytes(6);
  const sendFile = (res, filePath, report, range) => {
    let size = 0;
    try { size = fs.statSync(filePath).size; } catch (e) {
      res.writeHead(500); res.end("gone");
      return;
    }
    let start = 0, end = size;
    if (range && Number.isFinite(range.off)) {
      start = Math.max(0, Math.min(size, range.off | 0));
      const n = range.n != null && Number.isFinite(range.n) ? Math.max(0, range.n | 0) : (size - start);
      end = Math.max(start, Math.min(size, start + n));
    }
    const len = end - start;
    const headers = {
      "Content-Type": "application/octet-stream",
      "Content-Length": len,
      "Accept-Ranges": "bytes",
      "X-File-Size": String(size)
    };
    if (start !== 0 || end !== size) headers["Content-Range"] = "bytes " + start + "-" + (end ? end - 1 : 0) + "/" + size;
    res.writeHead(200, headers);
    if (len === 0) { res.end(); return; }
    const stream = fs.createReadStream(filePath, { start: start, end: end - 1 });
    let sent = 0, last = 0;
    stream.on("data", chunk => {
      sent += chunk.length;
      const now = Date.now();
      if (report && (sent === len || now - last > 80)) {
        last = now;
        report(sent, len);
      }
    });
    stream.on("error", () => { try { res.destroy(); } catch (e) {} });
    stream.pipe(res);
  };
  const writeEncryptedJson = (res, obj) => {
    try {
      const blob = encryptPayload(Buffer.from(JSON.stringify(obj), "utf8"), secret);
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": blob.length });
      res.end(blob);
    } catch (e) {
      res.writeHead(500); res.end("err");
    }
  };
  transferServer = http.createServer((req, res) => {
    const route = (req.url || "").split("?")[0];
    // the sending device lists what it holds; only differing records get sent
    /* Who is on the other end. Deliberately a separate route rather than a field
       inside /manifest: a receiver on an older build reads that manifest as a
       bare key map, and any extra field in it would look like a record it lacks
       — which, mirroring, would empty its own vault. Older builds never call
       this route, and newer ones cope with the 404. */
    if (req.method === "GET" && route === "/whoami") {
      try {
        const blob = encryptPayload(Buffer.from(JSON.stringify({
          device: deviceName(), records: countRecords(buildManifest())
        }), "utf8"), secret);
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": blob.length });
        res.end(blob);
      } catch (e) {
        res.writeHead(500); res.end("err");
      }
      return;
    }
    if (req.method === "GET" && route === "/manifest") {
      try {
        const blob = encryptPayload(Buffer.from(JSON.stringify(buildManifest()), "utf8"), secret);
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": blob.length });
        res.end(blob);
      } catch (e) {
        res.writeHead(500); res.end("err");
      }
      return;
    }
    if (req.method === "GET" && route === "/progress") {
      writeEncryptedJson(res, transferState && transferState.pack || { phase: "idle", done: 0, total: 0 });
      return;
    }
    const readWantedKeys = (onKeys) => {
      const MAX_BODY = 4 << 20;
      const chunks = [];
      let size = 0;
      req.on("data", d => {
        size += d.length;
        if (size > MAX_BODY) { res.writeHead(413); res.end("too big"); req.destroy(); return; }
        chunks.push(d);
      });
      req.on("end", () => {
        if (size > MAX_BODY) return;
        try {
          const wanted = JSON.parse(decryptPayload(Buffer.concat(chunks), secret).toString("utf8"));
          if (!Array.isArray(wanted)) throw new Error("bad request");
          onKeys(wanted);
        } catch (e) {
          res.writeHead(400); res.end("bad");
        }
      });
      req.on("error", () => { try { res.destroy(); } catch (e) {} });
    };
    const packWanted = async (wanted) => {
      publishShareProgress({ phase: "packing", done: 0, total: wanted.length, pct: 0 });
      const batches = splitKeysIntoBatches(wanted);
      clearDeltaFiles();
      const combined = openRecordWriter(deltaFilePath(), secret);
      const sizes = [];
      let keysDone = 0, lastYield = Date.now();
      try {
        for (let b = 0; b < batches.length; b++) {
          const w = openRecordWriter(deltaBatchPath(b), secret);
          try {
            for (let i = 0; i < batches[b].length; i++) {
              const k = batches[b][i];
              let v;
              try { v = readValue(k); } catch (e) { v = null; }
              if (v !== null && v !== undefined) {
                const s = String(v);
                w.writeRecord(k, s);
                combined.writeRecord(k, s);
              }
              keysDone++;
              publishShareProgress({ phase: "packing", done: keysDone, total: wanted.length, pct: wanted.length > 0 ? keysDone / wanted.length : 0 });
              if (Date.now() - lastYield > 40) {
                await new Promise(r => setImmediate(r));
                lastYield = Date.now();
              }
            }
            sizes.push(w.finish().bytes);
          } catch (e) {
            w.abort();
            throw e;
          }
        }
        const built = combined.finish();
        if (transferState) {
          transferState.deltaPath = built.path;
          transferState.deltaBatches = sizes.map((bytes, i) => ({ path: deltaBatchPath(i), bytes: bytes }));
        }
        publishShareProgress({
          phase: "ready", done: wanted.length, total: wanted.length, pct: 1,
          bytes: 0, byteTotal: built.bytes, batches: sizes.length, sizes: sizes
        });
        return built;
      } catch (e) {
        combined.abort();
        throw e;
      }
    };
    if (req.method === "POST" && route === "/delta-start") {
      readWantedKeys(wanted => {
        writeEncryptedJson(res, { ok: true, total: wanted.length });
        packWanted(wanted).catch(e => {
          publishShareProgress({ phase: "error", done: 0, total: 0, error: String(e && e.message || e) });
        });
      });
      return;
    }
    if (req.method === "GET" && route === "/delta-file") {
      let filePath = null;
      let q = null;
      try { q = new URL(req.url, "http://127.0.0.1"); } catch (e) { q = null; }
      const iRaw = q && q.searchParams.get("i");
      if (iRaw != null && iRaw !== "") {
        const i = Number(iRaw);
        const batches = transferState && transferState.deltaBatches;
        if (!batches || !Number.isInteger(i) || i < 0 || i >= batches.length || !fs.existsSync(batches[i].path)) {
          res.writeHead(409); res.end("not ready");
          return;
        }
        filePath = batches[i].path;
      } else {
        const p = transferState && transferState.deltaPath;
        if (!p || !fs.existsSync(p)) { res.writeHead(409); res.end("not ready"); return; }
        filePath = p;
      }
      const offRaw = q && q.searchParams.get("off");
      const nRaw = q && q.searchParams.get("n");
      const range = offRaw != null && offRaw !== "" ? { off: Number(offRaw), n: nRaw != null && nRaw !== "" ? Number(nRaw) : null } : null;
      sendFile(res, filePath, (sent, total) => {
        publishShareProgress({ phase: "sending", done: sent, total, pct: total > 0 ? sent / total : 0, bytes: sent, byteTotal: total });
      }, range);
      return;
    }
    if (req.method === "POST" && route === "/delta") {
      /* Old clients: pack then send on this same request. Yields while packing
         so /progress can still be answered. */
      readWantedKeys(wanted => {
        packWanted(wanted).then(built => {
          sendFile(res, built.path, (sent, total) => {
            publishShareProgress({ phase: "sending", done: sent, total, pct: total > 0 ? sent / total : 0, bytes: sent, byteTotal: total });
          });
        }).catch(() => { try { res.writeHead(400); res.end("bad"); } catch (e) {} });
      });
      return;
    }
    /* A mirror is the only thing that can delete records, so it is agreed here
       as well as there. The body carries the asking device's name, its own
       pairing code so this device can turn the transfer around if the person
       says the direction is wrong, and the counts they are looking at. */
    if (req.method === "POST" && route === "/mirror-request") {
      const MAX_ASK = 64 << 10;
      const chunks = [];
      let size = 0;
      req.on("data", d => {
        size += d.length;
        if (size > MAX_ASK) { res.writeHead(413); res.end("too big"); req.destroy(); return; }
        chunks.push(d);
      });
      req.on("end", async () => {
        if (size > MAX_ASK) return;
        try {
          const ask = JSON.parse(decryptPayload(Buffer.concat(chunks), secret).toString("utf8"));
          const decision = await askThisDevice({
            device: String(ask.device || "The other device").slice(0, 60),
            theirCode: String(ask.code || "").slice(0, 40),
            added: Number(ask.added) || 0,
            updated: Number(ask.updated) || 0,
            removed: Number(ask.removed) || 0,
            thisDevice: deviceName()
          }, 3 * 60 * 1000);
          const blob = encryptPayload(Buffer.from(JSON.stringify({ decision }), "utf8"), secret);
          res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": blob.length });
          res.end(blob);
        } catch (e) {
          res.writeHead(400); res.end("bad");
        }
      });
      req.on("error", () => { try { res.destroy(); } catch (e) {} });
      return;
    }
    res.writeHead(404); res.end("no");
  });
  return new Promise(resolve => {
    let settled = false;
    const fail = msg => {
      if (settled) return;
      settled = true;
      stopTransferServer();
      resolve({ ok: false, error: msg });
    };
    transferServer.on("error", e => fail("Couldn't open a local port: " + e.message));
    transferServer.listen(0, "0.0.0.0", () => {
      if (settled) return;
      const addr = transferServer && transferServer.address();
      if (!addr) return fail("Couldn't open a local port");
      settled = true;
      const port = addr.port;
      const code = makeCode(ip, port, secret);
      /* The listing is built now rather than when the other device asks for it.
         Throttled to one message every tenth of a second, because a report fires
         per record and each one crosses to the window. */
      let last = 0;
      warmManifest((done, total) => {
        const now = Date.now();
        if (done < total && now - last < 100) return;
        last = now;
        sendToWindow("transfer-progress", { phase: "preparing", done, total, pct: total > 0 ? done / total : 0 });
      }).catch(() => {}).then(() => {
        sendToWindow("transfer-progress", { phase: "done" });
        transferState = { secret, code, expiresAt: Date.now() + 10 * 60 * 1000 };
        transferState.timer = setTimeout(stopTransferServer, 10 * 60 * 1000);
        resolve({ ok: true, code, ip, port, expiresInMinutes: 10, device: deviceName() });
      });
    });
  });
}

/* Downloads to disk, decrypts to a plaintext temp file, authenticates the whole
   payload, and only then writes anything into the vault. Bounded memory, and a
   corrupt or wrong-code transfer can never leave the vault half-written. */
function decryptTransferFile(encPath, plainPath, secret, report) {
  const size = fs.statSync(encPath).size;
  const HEAD = 5 + 16 + 12;
  if (size < HEAD + 16) throw new Error("transfer file too small");
  const fdIn = fs.openSync(encPath, "r");
  const head = Buffer.alloc(HEAD);
  fs.readSync(fdIn, head, 0, HEAD, 0);
  if (head.slice(0, 5).toString() !== "RCVX2") { fs.closeSync(fdIn); throw new Error("not a Rolecraft transfer"); }
  const salt = head.slice(5, 21);
  const iv = head.slice(21, 33);
  const tag = Buffer.alloc(16);
  fs.readSync(fdIn, tag, 0, 16, size - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", keyFrom(secret, salt), iv);
  d.setAuthTag(tag);
  try { fs.unlinkSync(plainPath); } catch (e) {}
  const fdOut = fs.openSync(plainPath, "w");
  try {
    let pos = HEAD;
    const stop = size - 16;
    const buf = Buffer.alloc(1 << 20);
    while (pos < stop) {
      const want = Math.min(buf.length, stop - pos);
      const got = fs.readSync(fdIn, buf, 0, want, pos);
      if (got <= 0) break;
      const out = d.update(buf.slice(0, got));
      if (out.length) fs.writeSync(fdOut, out);
      pos += got;
      if (report) report(pos - HEAD, stop - HEAD);
    }
    const fin = d.final(); // throws if the code is wrong or bytes were tampered with
    if (fin.length) fs.writeSync(fdOut, fin);
  } finally {
    fs.closeSync(fdIn);
    fs.closeSync(fdOut);
  }
}

/* Reads the decrypted NDJSON in chunks so a huge vault never becomes one
   JavaScript string. Two passes: verify the header, then write records. */
function eachTransferLine(plainPath, onLine) {
  const size = fs.statSync(plainPath).size;
  const fd = fs.openSync(plainPath, "r");
  const buf = Buffer.alloc(1 << 20);
  let pos = 0, rest = "", stop = false;
  const feed = chunk => {
    rest += chunk;
    let idx;
    while (!stop && (idx = rest.indexOf("\n")) >= 0) {
      const line = rest.slice(0, idx);
      rest = rest.slice(idx + 1);
      if (line.trim() && onLine(line) === false) stop = true;
    }
  };
  try {
    while (pos < size && !stop) {
      const got = fs.readSync(fd, buf, 0, Math.min(buf.length, size - pos), pos);
      if (got <= 0) break;
      pos += got;
      feed(buf.slice(0, got).toString("utf8"));
    }
    if (!stop && rest.trim()) onLine(rest);
  } finally {
    fs.closeSync(fd);
  }
}

function applyTransferPlainFile(plainPath, replace, report, expected) {
  let meta = null;
  eachTransferLine(plainPath, line => {
    meta = JSON.parse(line);
    return false; // header only
  });
  if (!meta || meta.app !== "rolecraft-vault") throw new Error("not a Rolecraft vault");
  if (replace) {
    for (const k of allKeys()) {
      try { fs.unlinkSync(keyToFile(k)); } catch (e) {}
    }
  }
  let n = 0, first = true;
  eachTransferLine(plainPath, line => {
    if (first) { first = false; return; } // skip header
    let r;
    try { r = JSON.parse(line); } catch (e) { return; }
    if (!r || typeof r.k !== "string") return;
    writeValue(r.k, r.v);
    n++;
    if (report) report(n, expected || n);
  });
  return { count: n, at: meta.at };
}

function httpBuffer(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, res => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error("status " + res.statusCode)); return; }
      const chunks = [];
      res.on("data", d => chunks.push(d));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function httpToFile(opts, body, destPath, report) {
  return new Promise((resolve, reject) => {
    try { fs.unlinkSync(destPath); } catch (e) {}
    const file = fs.createWriteStream(destPath);
    const req = http.request(opts, res => {
      if (res.statusCode !== 200) { res.resume(); file.close(); reject(new Error("status " + res.statusCode)); return; }
      // the sender sets Content-Length, so this is a real fraction rather than a guess
      const total = parseInt(res.headers["content-length"], 10) || 0;
      let got = 0;
      if (report) res.on("data", d => { got += d.length; report(got, total); });
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(destPath)));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/* Incremental sync: compare fingerprints, pull only what differs.
   With preview set, everything below is read-only: it reports what would change
   on THIS device and writes nothing. */
async function receiveTransfer(code, mirror, preview, onProgress) {
  /* Progress is reported in named phases rather than one number: the phases
     take wildly different lengths depending on the vault, and a single bar that
     stalls at 40% for a minute tells you less than a bar that says what it is
     doing. Throttled, because a byte-level callback fires thousands of times a
     second and every one of them crosses to the renderer. */
  let lastSent = 0;
  const phase = (name, done, total) => {
    if (!onProgress) return;
    const now = Date.now();
    const finished = total > 0 && done >= total;
    if (!finished && now - lastSent < 120) return;
    lastSent = now;
    onProgress({ phase: name, done, total, pct: total > 0 ? Math.min(1, done / total) : 0 });
  };
  let target;
  try { target = parseCode(code); } catch (e) { return { ok: false, error: "That code isn't valid" }; }
  /* Thirty seconds was the whole budget for a request that can involve the other
     device reading its entire vault. It only has to be generous: a device that is
     not there fails on connect, not on this. */
  const base = { host: target.ip, port: target.port, timeout: 180000 };
  let remote;
  try {
    phase("asking", 0, 0);
    const blob = await httpBuffer(Object.assign({ path: "/manifest", method: "GET" }, base));
    remote = JSON.parse(decryptPayload(blob, target.secret).toString("utf8"));
  } catch (e) {
    if (String(e.message).indexOf("timeout") >= 0)
      return { ok: false, error: "The other device didn't answer. Same Wi-Fi? Still on the Send screen?" };
    return { ok: false, error: "Couldn't read the other device \u2014 check the code was typed correctly" };
  }
  // a sender on an older build has no /whoami; the sync still works, it just
  // cannot be named on screen
  let them = null;
  try {
    const blob = await httpBuffer(Object.assign({ path: "/whoami", method: "GET" }, base));
    them = JSON.parse(decryptPayload(blob, target.secret).toString("utf8"));
  } catch (e) {}
  const local = buildManifest((i, n) => phase("comparing", i, n));
  const needed = [];
  let added = 0, updated = 0;
  for (const k of Object.keys(remote)) {
    if (local[k] === undefined) { needed.push(k); added++; }
    else if (local[k] !== remote[k]) { needed.push(k); updated++; }
  }
  const removable = mirror ? Object.keys(local).filter(k => remote[k] === undefined) : [];
  const unchanged = Object.keys(remote).length - needed.length;
  const who = {
    thisDevice: deviceName(),
    thisRecords: countRecords(local),
    otherDevice: them && them.device || null,
    otherRecords: them && typeof them.records === "number" ? them.records : null,
  };

  if (preview) {
    return Object.assign({
      ok: true, preview: true, mirror: !!mirror,
      added, updated, removed: removable.length, unchanged,
      upToDate: !needed.length && !removable.length,
    }, who);
  }

  if (!needed.length && !removable.length) {
    return Object.assign({ ok: true, added: 0, updated: 0, removed: 0, unchanged, bytes: 0, upToDate: true }, who);
  }

  /* Nothing has been written yet. A mirror stops here until the other device
     agrees, because this is the only path that deletes anything. A merge does
     not ask: it only ever adds and updates. */
  if (mirror && removable.length) {
    let mine = null;
    try {
      // our own code, so they can turn the transfer around without starting over
      mine = await startTransferServer();
    } catch (e) { mine = null; }
    if (!mine || !mine.ok) {
      return { ok: false, error: "Couldn't offer this device for the other one to check. Mirroring needs both devices reachable on the same network." };
    }
    let decision = "unavailable";
    try {
      const body = encryptPayload(Buffer.from(JSON.stringify({
        device: deviceName(), code: mine.code, added, updated, removed: removable.length
      }), "utf8"), target.secret);
      /* base last would put its own 30 second timeout back, and this request is
         deliberately held open while a person reads a dialog, so ours has to win. */
      const blob = await httpBuffer(Object.assign({}, base, {
        path: "/mirror-request", method: "POST",
        headers: { "Content-Type": "application/octet-stream", "Content-Length": body.length },
        timeout: 4 * 60 * 1000
      }), body);
      decision = JSON.parse(decryptPayload(blob, target.secret).toString("utf8")).decision;
    } catch (e) {
      // an older build has no such route, so the question cannot be put at all
      decision = "unavailable";
    }
    /* Reverse is the one answer that needs this device still listening, because
       the other one is about to connect back to it. Every other answer means we
       have finished offering and should stop. */
    if (decision !== "reverse") stopTransferServer();
    if (decision === "reverse") {
      return Object.assign({ ok: false, reversed: true, theirCode: code,
        error: "The other device asked to mirror the other way instead." }, who);
    }
    if (decision === "unavailable") {
      return Object.assign({ ok: false, needsBothUpdated: true,
        error: "This device could not ask " + (who.otherDevice || "the other device") + " to approve. Mirroring needs the newer version on both devices. Merging still works." }, who);
    }
    if (decision !== "allow") {
      return Object.assign({ ok: false, refused: true,
        error: (who.otherDevice || "The other device") + " refused the mirror. Nothing was changed." }, who);
    }
  }

  let bytes = 0;
  if (needed.length) {
    const encPath = path.join(updatesDir, "incoming.bin");
    const plainPath = transferPlainPath();
    const cleanup = () => {
      try { fs.unlinkSync(encPath); } catch (e) {}
      try { fs.unlinkSync(plainPath); } catch (e) {}
    };
    try {
      const body = encryptPayload(Buffer.from(JSON.stringify(needed), "utf8"), target.secret);
      const readShareProgress = async () => {
        try {
          const blob = await httpBuffer(Object.assign({}, base, { path: "/progress", method: "GET", timeout: 8000 }));
          return JSON.parse(decryptPayload(blob, target.secret).toString("utf8"));
        } catch (e) { return null; }
      };
      const applyShareProgress = st => {
        if (!st || !st.phase) return;
        if (st.phase === "packing") phase("packing", st.done || 0, st.total || 0);
        else if (st.phase === "sending") phase("receiving", st.bytes || st.done || 0, st.byteTotal || st.total || 0);
      };
      let started = false;
      try {
        const startBlob = await httpBuffer(Object.assign({
          path: "/delta-start", method: "POST",
          headers: { "Content-Type": "application/octet-stream", "Content-Length": body.length },
          timeout: 30000
        }, base), body);
        const msg = JSON.parse(decryptPayload(startBlob, target.secret).toString("utf8"));
        started = !!(msg && msg.ok);
        if (started) phase("packing", 0, msg.total || needed.length);
      } catch (e) { started = false; }
      if (started) {
        for (;;) {
          const st = await readShareProgress();
          applyShareProgress(st);
          if (st && st.phase === "ready") break;
          if (st && st.phase === "error") throw new Error(st.error || "pack failed");
          await new Promise(r => setTimeout(r, 400));
        }
        await httpToFile(Object.assign({ path: "/delta-file", method: "GET", timeout: 600000 }, base), null, encPath, (got, total) => phase("receiving", got, total));
      } else {
        phase("packing", 0, 0);
        await httpToFile(Object.assign({
          path: "/delta",
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "Content-Length": body.length },
          timeout: 600000
        }, base), body, encPath, (got, total) => phase("receiving", got, total));
      }
      bytes = fs.statSync(encPath).size;
      decryptTransferFile(encPath, plainPath, target.secret, (done, total) => phase("unpacking", done, total));
    } catch (e) {
      cleanup();
      return { ok: false, error: "Couldn't fetch the changes: " + e.message };
    }
    try {
      // never wipes; deletions handled below
      applyTransferPlainFile(plainPath, false, (n, total) => phase("saving", n, total), needed.length);
    } catch (e) {
      cleanup();
      return { ok: false, error: "Changes arrived but couldn't be saved: " + e.message };
    }
    cleanup();
  }
  let removed = 0;
  for (const k of removable) {
    try { fs.unlinkSync(keyToFile(k)); removed++; } catch (e) {}
    phase("removing", removed, removable.length);
  }
  phase("done", 1, 1);
  return Object.assign({ ok: true, added, updated, removed, unchanged, bytes }, who);
}

const passwordSet = () => !!loadSecurity();
const isLocked = () => passwordSet() && !masterKey;

/* AES-256-GCM wrap/unwrap */
function aesEncrypt(plain, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
function aesDecrypt(b64, key) {
  const buf = Buffer.from(b64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

/* ---- storage layer: [password AES] then [DPAPI safeStorage] ---- */
const keyToFile = (key) => path.join(dataDir, encodeURIComponent(key) + ".dat");

function encodeValue(value, key) {
  const v = key ? "pwd:" + aesEncrypt(String(value), key) : "raw:" + String(value);
  return safeStorage.isEncryptionAvailable()
    ? "enc:" + safeStorage.encryptString(v).toString("base64")
    : "pln:" + v;
}
/* Write to a sibling temp file and rename over the target. A crash or power cut
   mid-write then leaves the previous record intact instead of a truncated one —
   chars:all holds every character in a single file, so a half-write is fatal. */
function writeFileAtomic(file, payload) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, file);
}
function writeValue(key, value) {
  writeFileAtomic(keyToFile(key), encodeValue(value, masterKey));
  rememberHash(key, value);
}
function readValue(key) {
  const f = keyToFile(key);
  if (!fs.existsSync(f)) return null;
  let payload = fs.readFileSync(f, "utf8");
  let v;
  if (payload.startsWith("enc:")) v = safeStorage.decryptString(Buffer.from(payload.slice(4), "base64"));
  else if (payload.startsWith("pln:")) v = payload.slice(4);
  else v = payload;
  if (v.startsWith("pwd:")) {
    if (!masterKey) throw new Error("locked");
    return aesDecrypt(v.slice(4), masterKey);
  }
  if (v.startsWith("raw:")) return v.slice(4);
  return v;
}
function allKeys() {
  const out = [];
  for (const f of fs.readdirSync(dataDir)) {
    if (!f.endsWith(".dat")) continue;
    // a stray file with a broken percent-escape would otherwise throw URIError and
    // take out every caller: the manifest, a transfer, and re-encrypting the vault
    try { out.push(decodeURIComponent(f.slice(0, -4))); } catch (e) {}
  }
  return out;
}
/* Re-encrypt every record when the password layer changes.
   Prepare-then-commit: every record's new-key copy is written alongside the old
   one as .rewrap first, and nothing is swapped in until all of them exist. A bad
   record therefore aborts with the vault completely untouched, instead of leaving
   half of it encrypted under a key that security.json no longer describes. */
const rewrapPath = (key) => keyToFile(key) + ".rewrap";

function rewrapAll(oldKeyBuf, newKeyBuf, newSecurity) {
  const prepared = [];
  const saved = masterKey;
  masterKey = oldKeyBuf;
  try {
    for (const k of allKeys()) {
      const plain = readValue(k);
      if (plain === null) continue;
      fs.writeFileSync(rewrapPath(k), encodeValue(plain, newKeyBuf), "utf8");
      prepared.push(k);
    }
  } catch (e) {
    for (const k of prepared) { try { fs.unlinkSync(rewrapPath(k)); } catch (e2) {} }
    throw e;
  } finally {
    masterKey = saved;
  }
  // Past this line the journal makes the swap inevitable: every record already has
  // a finished new-key copy, so an interrupted run can always be completed forward.
  fs.writeFileSync(rewrapFile, JSON.stringify({ security: newSecurity || null }), "utf8");
  for (const k of prepared) fs.renameSync(rewrapPath(k), keyToFile(k));
  saveSecurity(newSecurity || null);
  try { fs.unlinkSync(rewrapFile); } catch (e) {}
}

/* Run at startup. With a journal, finish the swap; without one, the .rewrap files
   are leftovers from a run that aborted before committing, so discard them. */
function finishPendingRewrap() {
  let journal = null;
  try { journal = JSON.parse(fs.readFileSync(rewrapFile, "utf8")); } catch (e) { journal = null; }
  let pending = [];
  try { pending = fs.readdirSync(dataDir).filter(f => f.endsWith(".rewrap")); } catch (e) {}
  if (!journal) {
    for (const f of pending) { try { fs.unlinkSync(path.join(dataDir, f)); } catch (e) {} }
    return;
  }
  for (const f of pending) {
    try { fs.renameSync(path.join(dataDir, f), path.join(dataDir, f.slice(0, -".rewrap".length))); } catch (e) {}
  }
  saveSecurity(journal.security);
  try { fs.unlinkSync(rewrapFile); } catch (e) {}
}

/* ---- auth handlers ---- */
function verifyPassword(pw) {
  const s = loadSecurity();
  if (!s || typeof s.salt !== "string" || typeof s.verifier !== "string") return null;
  const check = Buffer.from(kdf(pw, Buffer.from(s.salt + ":chk")).toString("hex"));
  const known = Buffer.from(s.verifier);
  // timingSafeEqual throws on a length mismatch, so a corrupted security.json would
  // crash the handler instead of simply refusing the password
  if (check.length !== known.length || !crypto.timingSafeEqual(check, known)) return null;
  return kdf(pw, Buffer.from(s.salt + ":key"));
}

function setupAuthIpc() {
  ipcMain.handle("transfer-start", () => startTransferServer());
  ipcMain.handle("transfer-mirror-respond", (e, id, decision) => {
    const finish = pendingMirrorAsks.get(String(id));
    if (!finish) return { ok: false };
    finish(decision === "allow" || decision === "reverse" ? decision : "refuse");
    return { ok: true };
  });
  ipcMain.handle("transfer-stop", () => { stopTransferServer(); return { ok: true }; });
  ipcMain.handle("transfer-status", () => transferState
    ? { active: true, code: transferState.code, minutesLeft: Math.max(0, Math.round((transferState.expiresAt - Date.now()) / 60000)), device: deviceName() }
    : { active: false, device: deviceName() });
  // progress goes back to the window that asked, so a closed window cannot be sent to
  const progressTo = e => p => { try { if (!e.sender.isDestroyed()) e.sender.send("transfer-progress", p); } catch (err) {} };
  ipcMain.handle("transfer-receive", (e, code, replace) => receiveTransfer(code, replace, false, progressTo(e)));
  ipcMain.handle("transfer-preview", (e, code, replace) => receiveTransfer(code, replace, true, progressTo(e)));
  ipcMain.handle("updates-status", () => {
    const act = activeUpdate();
    return { build: FACTORY_BUILD, active: act ? act.version : null, notes: act ? act.notes : "" };
  });
  ipcMain.handle("updates-install", (e, text) => {
    let pkg;
    try { pkg = JSON.parse(text); } catch { return { ok: false, error: "Not a valid update file" }; }
    const v = verifyUpdatePackage(pkg);
    if (!v.ok) return v;
    /* A patch swaps app.js and nothing else. When the release also changed the
       shell, applying it would leave the new interface running on the old one —
       it would look installed and then misbehave in ways nothing explains. Say
       so instead, and leave the working copy alone. Packages predating these
       fields carry no claim either way and are installed as before. */
    if (v.needsShell && v.shellBuild && v.shellBuild !== FACTORY_BUILD) {
      return { ok: false, error: "Version " + v.version + " changes the app itself, not just the interface, so it cannot arrive as a patch. Run Rolecraft-Vault-Setup-" + v.version + ".exe instead — it keeps your vault and settings exactly as they are. This copy is build " + FACTORY_BUILD + "." };
    }
    try {
      const cur = path.join(updatesDir, "current");
      fs.mkdirSync(cur, { recursive: true });
      fs.writeFileSync(updateAppJsPath(), v.appJs);
      fs.writeFileSync(updateManifestPath(), JSON.stringify({
        version: pkg.version, notes: v.notes, hashes: pkg.hashes, sig: pkg.sig, installedAt: new Date().toISOString(),
        factoryBuild: FACTORY_BUILD, // so a later shell upgrade can tell this patch is stale
      }));
      return { ok: true, version: v.version, notes: v.notes };
    } catch (err) { return { ok: false, error: "Couldn't write the update: " + err.message }; }
  });
  ipcMain.handle("updates-revert", () => {
    try {
      fs.rmSync(path.join(updatesDir, "current"), { recursive: true, force: true });
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle("updates-relaunch", () => { app.relaunch(); app.exit(0); });
  ipcMain.handle("auth-status", () => {
    const s = loadSecurity();
    return { passwordSet: !!s, pinSet: !!(s && s.pinBlob), locked: isLocked() };
  });

  // rewrapAll writes security.json itself, as the last step of an all-or-nothing swap
  const rewrapFailed = (err) => ({
    ok: false,
    error: "Couldn't re-encrypt the vault: " + err.message + ". Nothing was changed.",
  });

  ipcMain.handle("auth-set-password", (e, pw) => {
    if (passwordSet()) return { ok: false, error: "Password already set" };
    if (!pw || pw.length < 8) return { ok: false, error: "Use at least 8 characters" };
    const salt = crypto.randomBytes(16).toString("hex");
    const key = kdf(pw, Buffer.from(salt + ":key"));
    const verifier = kdf(pw, Buffer.from(salt + ":chk")).toString("hex");
    try { rewrapAll(null, key, { salt, verifier }); } catch (err) { return rewrapFailed(err); }
    masterKey = key;
    return { ok: true };
  });

  ipcMain.handle("auth-change-password", (e, oldPw, newPw) => {
    const oldKey = verifyPassword(oldPw);
    if (!oldKey) return { ok: false, error: "Current password is incorrect" };
    if (!newPw || newPw.length < 8) return { ok: false, error: "Use at least 8 characters" };
    const salt = crypto.randomBytes(16).toString("hex");
    const key = kdf(newPw, Buffer.from(salt + ":key"));
    const verifier = kdf(newPw, Buffer.from(salt + ":chk")).toString("hex");
    // the new security record carries no pinBlob, so the PIN is invalidated
    try { rewrapAll(oldKey, key, { salt, verifier }); } catch (err) { return rewrapFailed(err); }
    masterKey = key;
    return { ok: true };
  });

  ipcMain.handle("auth-remove-password", (e, pw) => {
    const key = verifyPassword(pw);
    if (!key) return { ok: false, error: "Password is incorrect" };
    try { rewrapAll(key, null, null); } catch (err) { return rewrapFailed(err); }
    masterKey = null;
    return { ok: true };
  });

  ipcMain.handle("auth-unlock-password", (e, pw) => {
    const key = verifyPassword(pw);
    if (!key) return { ok: false, error: "That password doesn't match" };
    masterKey = key;
    return { ok: true };
  });

  ipcMain.handle("auth-set-pin", (e, pw, pin) => {
    const key = verifyPassword(pw);
    if (!key) return { ok: false, error: "Password is incorrect" };
    if (!pin || pin.length < 4) return { ok: false, error: "PIN needs at least 4 digits" };
    const s = loadSecurity();
    s.pinSalt = crypto.randomBytes(16).toString("hex");
    const pinKey = kdf(pin, Buffer.from(s.pinSalt + ":pin"));
    let blob = aesEncrypt(key.toString("base64"), pinKey);
    if (safeStorage.isEncryptionAvailable()) blob = "e:" + safeStorage.encryptString(blob).toString("base64");
    s.pinBlob = blob;
    saveSecurity(s);
    return { ok: true };
  });

  ipcMain.handle("auth-remove-pin", (e, pw) => {
    if (!verifyPassword(pw)) return { ok: false, error: "Password is incorrect" };
    const s = loadSecurity();
    delete s.pinBlob; delete s.pinSalt;
    saveSecurity(s);
    return { ok: true };
  });

  ipcMain.handle("auth-unlock-pin", (e, pin) => {
    const s = loadSecurity();
    if (!s || !s.pinBlob) return { ok: false, error: "No PIN is set" };
    try {
      let blob = s.pinBlob;
      if (blob.startsWith("e:")) blob = safeStorage.decryptString(Buffer.from(blob.slice(2), "base64"));
      const pinKey = kdf(pin, Buffer.from(s.pinSalt + ":pin"));
      masterKey = Buffer.from(aesDecrypt(blob, pinKey), "base64");
      return { ok: true };
    } catch {
      return { ok: false, error: "That PIN doesn't match" };
    }
  });

  ipcMain.handle("auth-lock", () => { masterKey = null; return { ok: true }; });
  ipcMain.handle("vault-encrypted", () => ({
    dpapi: safeStorage.isEncryptionAvailable(),
    password: passwordSet(),
  }));
  /* Full screen. Nothing here touches the vault, so none of it is gated on the
     lock: the view should be changeable from the lock screen too. */
  const theWindow = () => {
    const w = BrowserWindow.getAllWindows()[0];
    return w && !w.isDestroyed() ? w : null;
  };
  ipcMain.handle("window-state", () => {
    const w = theWindow();
    return w ? { fullScreen: w.isFullScreen(), maximized: w.isMaximized() } : { fullScreen: false, maximized: false };
  });
  ipcMain.handle("window-fullscreen", (e, on) => {
    const w = theWindow();
    if (!w) return { ok: false };
    w.setFullScreen(!!on);
    return { ok: true, fullScreen: w.isFullScreen() };
  });
}

/* ---- window ---- */
function loadBounds() { try { return JSON.parse(fs.readFileSync(boundsFile, "utf8")); } catch { return null; } }
function saveBounds(win) {
  /* getNormalBounds reports the windowed size even while full screen, so the
     window always has somewhere sensible to return to. */
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(boundsFile, JSON.stringify({ ...b, maximized: win.isMaximized(), fullScreen: win.isFullScreen() }));
  } catch {}
}
/* The interface cannot ask the window about itself, so it is told: on every
   change as well as on request, because full screen can also be entered from
   the keyboard or by Windows. */
function sendWindowState() {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) sendToWindow("window-state", { fullScreen: win.isFullScreen(), maximized: win.isMaximized() });
  } catch (e) {}
}

/* A saved position is only good while the screen it was on still exists. Undock
   a laptop, unplug the second monitor, or let Windows renumber the displays, and
   the window is restored to coordinates that are now off every screen: the
   process starts, a window exists, nothing appears, and it reads as "it just
   didn't open". Electron honours those coordinates exactly, so the check has to
   be made here. Anything that no longer overlaps a display is centred on the
   nearest one, at a size that fits it. */
function onScreenBounds(saved) {
  if (!saved || typeof saved.x !== "number" || typeof saved.y !== "number") return saved;
  try {
    const b = { x: saved.x, y: saved.y, width: saved.width || 1280, height: saved.height || 820 };
    const overlaps = a => b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y;
    const hit = screen.getAllDisplays().find(d => overlaps(d.workArea));
    const a = (hit || screen.getDisplayMatching(b)).workArea;
    /* Size first: a window saved on a 4K monitor and reopened on a laptop is
       larger than the screen, and its title bar ends up somewhere unreachable.
       Then position, clamped so the whole window sits inside the work area. A
       window that was already fine keeps exactly the place it had. */
    const width = Math.min(b.width, a.width);
    const height = Math.min(b.height, a.height);
    const x = Math.min(Math.max(b.x, a.x), a.x + a.width - width);
    const y = Math.min(Math.max(b.y, a.y), a.y + a.height - height);
    return { ...saved, x, y, width, height };
  } catch (e) { return { ...saved, x: undefined, y: undefined }; }
}
function createWindow() {
  const saved = onScreenBounds(loadBounds());
  const win = new BrowserWindow({
    width: saved ? saved.width : 1280, height: saved ? saved.height : 820,
    x: saved ? saved.x : undefined, y: saved ? saved.y : undefined,
    minWidth: 720, minHeight: 500, show: false,
    backgroundColor: "#0a0e1c", title: "Rolecraft Vault", autoHideMenuBar: true,
    // Without this the window, the taskbar and alt-tab all show Electron's
    // default icon, because the packaged exe is a renamed electron.exe.
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  if (saved && saved.maximized) win.maximize();
  win.once("ready-to-show", () => {
    win.show();
    /* after show: entering full screen on a window that has not painted yet
       leaves a black rectangle until the first frame arrives */
    if (saved && saved.fullScreen) win.setFullScreen(true);
    sendWindowState();
  });
  /* A renderer that runs out of memory or crashes leaves the window standing
     there with nothing in it and no way back: the vault looks like it shut
     itself down. Reload once and it comes back at the lock screen with the
     vault untouched, since everything on disk is written as it goes. Bounded,
     because a crash that repeats would otherwise reload forever. */
  let renderReloads = 0;
  win.webContents.on("render-process-gone", (_e, details) => {
    if (details && details.reason === "clean-exit") return;
    if (win.isDestroyed() || renderReloads >= 3) return;
    renderReloads++;
    try { win.webContents.reload(); } catch (e) {}
  });
  win.on("unresponsive", () => { try { win.webContents.forcefullyCrashRenderer(); } catch (e) {} });
  win.setMenuBarVisibility(false);
  win.on("enter-full-screen", sendWindowState);
  win.on("leave-full-screen", sendWindowState);
  win.on("maximize", sendWindowState);
  win.on("unmaximize", sendWindowState);
  /* F11 toggles, Escape leaves. Separate from the handler below because that
     one only looks at combinations held with Control. Escape is left alone
     unless the window is actually full screen, since the interface uses it to
     close dialogs everywhere. */
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.control || input.alt || input.meta) return;
    if (input.key === "F11" || input.key === "f11") {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === "Escape" && win.isFullScreen()) {
      win.setFullScreen(false);
      event.preventDefault();
    }
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !input.control) return;
    const wc = win.webContents;
    if (input.shift && (input.key === "F12" || input.key === "f12")) {
      revertUpdateToFactory();
      wc.loadURL("file:///" + path.join(__dirname, "index.html").replace(/\\/g, "/"));
      event.preventDefault();
      return;
    }
    if (input.key === "=" || input.key === "+") { wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 4)); event.preventDefault(); }
    else if (input.key === "-") { wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3)); event.preventDefault(); }
    else if (input.key === "0") { wc.setZoomLevel(0); event.preventDefault(); }
  });
  win.on("close", () => saveBounds(win));
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith("https://")) shell.openExternal(url); return { action: "deny" }; });
  /* The window must never navigate anywhere but the interface. preload.js is
     attached to whatever this window loads, so a page that got itself loaded
     here — a dropped file, a stray link, a redirect — would be handed
     window.storage and window.updater: the whole vault, readable, and the
     ability to install a renderer. Only the two entry files are ever allowed,
     and an https link is handed to the real browser instead. */
  win.webContents.on("will-navigate", (event, url) => {
    const allowed = [path.join(__dirname, "index.html")];
    if (updatesDir) allowed.push(path.join(updatesDir, "current", "index.effective.html"));
    let target = null;
    try { target = decodeURIComponent(new URL(url).pathname).replace(/^\//, ""); } catch (e) {}
    if (target && allowed.some(f => path.normalize(target).toLowerCase() === path.normalize(f).toLowerCase())) return;
    event.preventDefault();
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
  });
  win.loadFile(resolveEntryFile());
  // failsafe 1: if an active update produced a dead page, auto-revert to the factory build.
  // "Rendered something" isn't enough — a bundle stuck on its loading screen also paints
  // .rcv — so wait for a root that reports a state other than "loading". Bundles predating
  // that attribute report no state at all and are treated as alive. Polls rather than
  // checking once, because a large vault legitimately takes a while to open.
  win.webContents.on("did-finish-load", () => {
    if (!activeUpdate()) return;
    const probeJs = "(function(){var e=document.querySelector('.rcv');" +
      "return e?(e.getAttribute('data-rcv-state')||'ready'):null})()";
    const deadline = Date.now() + 20000;
    const probe = () => {
      if (win.isDestroyed()) return;
      win.webContents.executeJavaScript(probeJs, true).then(state => {
        if (win.isDestroyed() || (state && state !== "loading")) return;
        if (Date.now() < deadline) { setTimeout(probe, 1000); return; }
        revertUpdateToFactory();
        win.loadFile(path.join(__dirname, "index.html"));
      }).catch(() => {});
    };
    setTimeout(probe, 3000);
  });
}

/* Two copies would read and write the same vault files at once, and the loser
   of a race silently overwrites the winner. A second launch hands its request
   to the copy already running instead, which also covers double-clicking the
   shortcut when the window is somewhere you cannot see. */
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return;
    const b = onScreenBounds({ x: win.getBounds().x, y: win.getBounds().y, width: win.getBounds().width, height: win.getBounds().height });
    if (b && typeof b.x === "number") win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}
app.on("before-quit", () => stopTransferServer());
app.whenReady().then(() => {
  dataDir = path.join(app.getPath("userData"), "vault");
  boundsFile = path.join(app.getPath("userData"), "window.json");
  securityFile = path.join(app.getPath("userData"), "security.json");
  rewrapFile = path.join(app.getPath("userData"), "rewrap.json");
  updatesDir = path.join(app.getPath("userData"), "updates");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(updatesDir, { recursive: true });
  finishPendingRewrap();

  ipcMain.handle("vault-get", (e, key) => readValue(key));
  ipcMain.handle("vault-set", (e, key, value) => { if (isLocked()) throw new Error("locked"); writeValue(key, value); return true; });
  // deleting is as destructive as writing, so it is gated the same way — a locked
  // vault that could still have records removed is not locked
  ipcMain.handle("vault-delete", (e, key) => { if (isLocked()) throw new Error("locked"); const f = keyToFile(key); if (fs.existsSync(f)) fs.unlinkSync(f); forgetHash(key); return true; });
  ipcMain.handle("vault-list", (e, prefix) => allKeys().filter(k => !prefix || k.startsWith(prefix)));
  setupAuthIpc();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
