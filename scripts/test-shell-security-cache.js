/* isLocked() guards every vault read/write, sync fingerprint (once per picture)
   and provider call in the Windows shell. It used to read and parse
   security.json from disk on each call. Lift the real helpers from main.js and
   check that repeated guards stay off the disk, that every saveSecurity is
   seen immediately, that a failed write is not trusted, and that callers still
   receive objects they can mutate without touching the remembered state. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const main = fs.readFileSync(path.join(__dirname, "..", "app", "main.js"), "utf8");
function region(startCandidates, endMarker) {
  const starts = startCandidates.map(s => main.indexOf(s)).filter(i => i >= 0);
  assert(starts.length, "could not find " + startCandidates.join(" / "));
  const start = Math.min(...starts);
  const end = main.indexOf(endMarker, start);
  assert(end > start, "could not find the end marker " + endMarker);
  return main.slice(start, end);
}
function throughFunctionEnd(name) {
  const at = main.indexOf("function " + name + "(");
  assert(at >= 0, "missing " + name);
  let depth = 0, i = main.indexOf("{", at);
  for (; i < main.length; i++) { if (main[i] === "{") depth++; else if (main[i] === "}" && --depth === 0) break; }
  return i + 1;
}
const securityStart = Math.min(...["let securityCache", "function loadSecurity"].map(s => main.indexOf(s)).filter(i => i >= 0));
const securityCode = main.slice(securityStart, throughFunctionEnd("saveSecurity"));
const lockCode = region(["let passwordSetCache", "const passwordSet"], "\n/* AES-256-GCM");

const disk = new Map();
let reads = 0, failWrite = false;
const fakeFs = {
  readFileSync(file) { reads++; if (!disk.has(file)) { const e = new Error("ENOENT"); e.code = "ENOENT"; throw e; } return disk.get(file); },
  existsSync(file) { return disk.has(file); },
  unlinkSync(file) { disk.delete(file); },
};
function writeFileAtomic(file, text) { if (failWrite) throw new Error("disk full"); disk.set(file, text); }

const api = new Function("fs", "writeFileAtomic", "state",
  "let securityFile = state.file, masterKey = null;\n" + securityCode + "\n" + lockCode +
  "\nreturn { loadSecurity, saveSecurity, passwordSet, isLocked, setFile: f => { securityFile = f; }, unlock: () => { masterKey = Buffer.alloc(32); }, lock: () => { masterKey = null; } };"
)(fakeFs, writeFileAtomic, { file: "/profile/security.json" });

// No password: unlocked, and the absence is remembered too.
assert.strictEqual(api.isLocked(), false);
reads = 0;
for (let i = 0; i < 1000; i++) api.isLocked();
assert(reads <= 1, "1000 lock checks without a password read the disk " + reads + " times");

// Setting a password is visible at once and locks the vault.
api.saveSecurity({ salt: "s", verifier: "v" });
assert.strictEqual(api.passwordSet(), true, "a saved password is seen immediately");
assert.strictEqual(api.isLocked(), true, "no master key means locked");
reads = 0;
for (let i = 0; i < 5000; i++) api.isLocked();
assert(reads <= 1, "5000 lock checks (one per picture fingerprint) read the disk " + reads + " times");
api.unlock();
assert.strictEqual(api.isLocked(), false);
api.lock();

// Callers mutate what they load before saving; that must not leak into the cache.
const loaded = api.loadSecurity();
delete loaded.salt; loaded.pinBlob = "x";
assert.deepStrictEqual(api.loadSecurity(), { salt: "s", verifier: "v" }, "mutating a loaded copy leaves the saved state alone");

// A failed write must not be believed.
failWrite = true;
assert.throws(() => api.saveSecurity({ salt: "s2", verifier: "v2", pinBlob: "p" }), /disk full/);
failWrite = false;
assert.deepStrictEqual(api.loadSecurity(), { salt: "s", verifier: "v" }, "after a failed write the disk version is what counts");

// Removing the password is seen immediately.
api.saveSecurity(null);
assert.strictEqual(api.passwordSet(), false);
assert.strictEqual(api.isLocked(), false);

// A different profile path is never answered from the old path's cache.
disk.set("/other/security.json", JSON.stringify({ salt: "o", verifier: "o" }));
api.setFile("/other/security.json");
assert.strictEqual(api.passwordSet(), true, "switching profiles re-reads security.json");

// Damaged security.json still reads as no password, as before.
api.saveSecurity(undefined); // clears the remembered text
disk.set("/other/security.json", "{not json");
assert.strictEqual(api.loadSecurity(), null);
assert.strictEqual(api.passwordSet(), false);

console.log("PASS: lock checks stay off the disk; saves, failed writes, removals and profile switches are respected");
