/* Exercise the Windows restore transaction lifted from the shipped main.js.
   A failed stage must leave the old vault byte-for-byte intact; a commit must
   replace only the requested namespaces and keep unrelated preferences. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const src = fs.readFileSync(path.join(__dirname, "..", "app", "main.js"), "utf8");
function lift(name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing " + name);
  let open = src.indexOf("{", start), depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("unclosed " + name);
}

const names = ["restoreTargets", "beginVaultRestore", "setVaultRestoreValue", "abortVaultRestore", "commitVaultRestore"];
const code = names.map(lift).join("\n");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-restore-"));
const dataDir = path.join(root, "vault");
const restoreJournalFile = path.join(root, "restore.json");
fs.mkdirSync(dataDir);

let activeRestore = null, masterKey = null, hashCache = {};
const keyToFile = key => path.join(dataDir, encodeURIComponent(key) + ".dat");
const allKeys = () => fs.readdirSync(dataDir).filter(f => f.endsWith(".dat"))
  .map(f => decodeURIComponent(f.slice(0, -4)));
const writeFileAtomic = (file, payload) => {
  fs.writeFileSync(file + ".tmp", payload, "utf8");
  fs.renameSync(file + ".tmp", file);
};
const ctx = { fs, path, crypto, dataDir, restoreJournalFile, activeRestore, masterKey, hashCache,
  isLocked: () => false, allKeys, keyToFile, encodeValue: value => "raw:" + String(value), writeFileAtomic };
const api = new Function(...Object.keys(ctx), code + "\nreturn { beginVaultRestore, setVaultRestoreValue, abortVaultRestore, commitVaultRestore };")(...Object.values(ctx));

let bad = 0;
function check(label, ok, detail) {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
}
function put(key, value) { fs.writeFileSync(keyToFile(key), value, "utf8"); }
function get(key) { return fs.existsSync(keyToFile(key)) ? fs.readFileSync(keyToFile(key), "utf8") : null; }

put("chars:all", "old characters");
put("img:old", "old picture");
put("ui:theme", "charcoal");

const aborted = api.beginVaultRestore({ exact: ["chars:all"], prefixes: ["img:"] });
api.setVaultRestoreValue(aborted, "chars:all", "staged characters");
let refused = false;
try { api.setVaultRestoreValue(aborted, "ui:theme", "wrong"); } catch (e) { refused = true; }
api.abortVaultRestore(aborted);
check("a failed or cancelled stage leaves the live records untouched",
  get("chars:all") === "old characters" && get("img:old") === "old picture");
check("a restore cannot write outside its declared namespaces", refused && get("ui:theme") === "charcoal");

const token = api.beginVaultRestore({ exact: ["chars:all"], prefixes: ["img:"] });
api.setVaultRestoreValue(token, "chars:all", "new characters");
api.setVaultRestoreValue(token, "img:new", "new picture");
api.commitVaultRestore(token);
check("commit replaces every requested namespace together",
  get("chars:all") === "raw:new characters" && get("img:new") === "raw:new picture" && get("img:old") === null);
check("commit preserves unrelated settings", get("ui:theme") === "charcoal");
check("the restore journal is gone after a completed swap", !fs.existsSync(restoreJournalFile));

try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) {}
console.log("");
console.log(bad ? "  " + bad + " restore transaction check(s) failed."
                : "  Windows restore staging is all-or-nothing.");
process.exit(bad ? 1 : 0);
