const { app, BrowserWindow, ipcMain, safeStorage, shell, session } = require("electron");
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
const FACTORY_BUILD = "1.098";
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
  return { ok: true, appJs, version: pkg.version, notes: typeof pkg.notes === "string" ? pkg.notes : "" };
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
let transferState = null; // { secret, code, expiresAt, timer }

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
  try { if (updatesDir) fs.unlinkSync(deltaFilePath()); } catch (e) {}
  if (transferServer) {
    try { transferServer.close(); } catch (e) {}
    transferServer = null;
  }
}

const transferFilePath = () => path.join(updatesDir, "transfer.bin");
const deltaFilePath = () => path.join(updatesDir, "delta.bin");

/* A short fingerprint per record lets the two devices work out exactly which
   records differ, so only those travel. */
function buildManifest() {
  const m = {};
  for (const k of allKeys()) {
    try {
      const v = readValue(k);
      if (v === null || v === undefined) continue;
      m[k] = crypto.createHash("sha256").update(String(v)).digest("hex").slice(0, 16);
    } catch (e) {}
  }
  return m;
}
const transferPlainPath = () => path.join(updatesDir, "transfer.plain");

/* Streams the vault to disk one record at a time as encrypted NDJSON.
   Never builds a whole-vault string, so big image libraries can't blow
   V8's max string length (the "Invalid string length" failure). */
function buildRecordFile(secret, keys, outPath) {
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
    for (const k of keys) {
      let v;
      try { v = readValue(k); } catch (e) { continue; }
      if (v === null || v === undefined) continue;
      put(cipher.update(Buffer.from(JSON.stringify({ k: k, v: String(v) }) + "\n", "utf8")));
      count++;
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
  const sendFile = (res, filePath) => {
    let size = 0;
    try { size = fs.statSync(filePath).size; } catch (e) {
      res.writeHead(500); res.end("gone");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": size });
    const stream = fs.createReadStream(filePath);
    stream.on("error", () => { try { res.destroy(); } catch (e) {} });
    stream.pipe(res);
  };
  transferServer = http.createServer((req, res) => {
    const route = (req.url || "").split("?")[0];
    // the sending device lists what it holds; only differing records get sent
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
    if (req.method === "POST" && route === "/delta") {
      const chunks = [];
      req.on("data", d => chunks.push(d));
      req.on("end", () => {
        try {
          const wanted = JSON.parse(decryptPayload(Buffer.concat(chunks), secret).toString("utf8"));
          if (!Array.isArray(wanted)) throw new Error("bad request");
          const built = buildRecordFile(secret, wanted, deltaFilePath());
          sendFile(res, built.path);
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
      transferState = { secret, code, expiresAt: Date.now() + 10 * 60 * 1000 };
      transferState.timer = setTimeout(stopTransferServer, 10 * 60 * 1000);
      resolve({ ok: true, code, ip, port, expiresInMinutes: 10 });
    });
  });
}

/* Downloads to disk, decrypts to a plaintext temp file, authenticates the whole
   payload, and only then writes anything into the vault. Bounded memory, and a
   corrupt or wrong-code transfer can never leave the vault half-written. */
function decryptTransferFile(encPath, plainPath, secret) {
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

function applyTransferPlainFile(plainPath, replace) {
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

function httpToFile(opts, body, destPath) {
  return new Promise((resolve, reject) => {
    try { fs.unlinkSync(destPath); } catch (e) {}
    const file = fs.createWriteStream(destPath);
    const req = http.request(opts, res => {
      if (res.statusCode !== 200) { res.resume(); file.close(); reject(new Error("status " + res.statusCode)); return; }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(destPath)));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/* Incremental sync: compare fingerprints, pull only what differs. */
async function receiveTransfer(code, mirror) {
  let target;
  try { target = parseCode(code); } catch (e) { return { ok: false, error: "That code isn't valid" }; }
  const base = { host: target.ip, port: target.port, timeout: 30000 };
  let remote;
  try {
    const blob = await httpBuffer(Object.assign({ path: "/manifest", method: "GET" }, base));
    remote = JSON.parse(decryptPayload(blob, target.secret).toString("utf8"));
  } catch (e) {
    if (String(e.message).indexOf("timeout") >= 0)
      return { ok: false, error: "The other device didn't answer. Same Wi-Fi? Still on the Send screen?" };
    return { ok: false, error: "Couldn't read the other device \u2014 check the code was typed correctly" };
  }
  const local = buildManifest();
  const needed = [];
  let added = 0, updated = 0;
  for (const k of Object.keys(remote)) {
    if (local[k] === undefined) { needed.push(k); added++; }
    else if (local[k] !== remote[k]) { needed.push(k); updated++; }
  }
  const removable = mirror ? Object.keys(local).filter(k => remote[k] === undefined) : [];
  const unchanged = Object.keys(remote).length - needed.length;

  if (!needed.length && !removable.length) {
    return { ok: true, added: 0, updated: 0, removed: 0, unchanged, bytes: 0, upToDate: true };
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
      await httpToFile(Object.assign({
        path: "/delta",
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "Content-Length": body.length }
      }, base), body, encPath);
      bytes = fs.statSync(encPath).size;
      decryptTransferFile(encPath, plainPath, target.secret);
    } catch (e) {
      cleanup();
      return { ok: false, error: "Couldn't fetch the changes: " + e.message };
    }
    try {
      applyTransferPlainFile(plainPath, false); // never wipes; deletions handled below
    } catch (e) {
      cleanup();
      return { ok: false, error: "Changes arrived but couldn't be saved: " + e.message };
    }
    cleanup();
  }
  let removed = 0;
  for (const k of removable) {
    try { fs.unlinkSync(keyToFile(k)); removed++; } catch (e) {}
  }
  return { ok: true, added, updated, removed, unchanged, bytes };
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
  return fs.readdirSync(dataDir).filter(f => f.endsWith(".dat")).map(f => decodeURIComponent(f.slice(0, -4)));
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
  if (!s) return null;
  const check = kdf(pw, Buffer.from(s.salt + ":chk")).toString("hex");
  if (!crypto.timingSafeEqual(Buffer.from(check), Buffer.from(s.verifier))) return null;
  return kdf(pw, Buffer.from(s.salt + ":key"));
}

function setupAuthIpc() {
  ipcMain.handle("transfer-start", () => startTransferServer());
  ipcMain.handle("transfer-stop", () => { stopTransferServer(); return { ok: true }; });
  ipcMain.handle("transfer-status", () => transferState
    ? { active: true, code: transferState.code, minutesLeft: Math.max(0, Math.round((transferState.expiresAt - Date.now()) / 60000)) }
    : { active: false });
  ipcMain.handle("transfer-receive", (e, code, replace) => receiveTransfer(code, replace));
  ipcMain.handle("updates-status", () => {
    const act = activeUpdate();
    return { build: FACTORY_BUILD, active: act ? act.version : null, notes: act ? act.notes : "" };
  });
  ipcMain.handle("updates-install", (e, text) => {
    let pkg;
    try { pkg = JSON.parse(text); } catch { return { ok: false, error: "Not a valid update file" }; }
    const v = verifyUpdatePackage(pkg);
    if (!v.ok) return v;
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
}

/* ---- window ---- */
function loadBounds() { try { return JSON.parse(fs.readFileSync(boundsFile, "utf8")); } catch { return null; } }
function saveBounds(win) {
  try { const b = win.getNormalBounds(); fs.writeFileSync(boundsFile, JSON.stringify({ ...b, maximized: win.isMaximized() })); } catch {}
}

function createWindow() {
  const saved = loadBounds();
  const win = new BrowserWindow({
    width: saved ? saved.width : 1280, height: saved ? saved.height : 820,
    x: saved ? saved.x : undefined, y: saved ? saved.y : undefined,
    minWidth: 720, minHeight: 500, show: false,
    backgroundColor: "#0a0e1c", title: "Rolecraft Vault", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  if (saved && saved.maximized) win.maximize();
  win.once("ready-to-show", () => { win.show(); });
  win.setMenuBarVisibility(false);
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
  ipcMain.handle("vault-delete", (e, key) => { const f = keyToFile(key); if (fs.existsSync(f)) fs.unlinkSync(f); return true; });
  ipcMain.handle("vault-list", (e, prefix) => allKeys().filter(k => !prefix || k.startsWith(prefix)));
  setupAuthIpc();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
