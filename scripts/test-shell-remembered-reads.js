/* Every Chat save compare-and-swaps chats:all through vault-sync-commit, which
   read back and fully decrypted the table it was about to replace on the
   Windows main process. The shell now remembers the exact encrypted bytes and
   plaintext of its own last read/write for whole-table keys. Lift the real
   storage functions from main.js with real AES-GCM and a fake DPAPI, and
   check: repeated reads and CAS checks skip decryption; any change to the file
   bytes (another writer, restore, rewrap), a different master key, lock or a
   deleted record falls back to a full decrypt; pictures are never remembered. */
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const main = fs.readFileSync(path.join(__dirname, "..", "app", "main.js"), "utf8");
function lift(name) {
  const at = main.search(new RegExp("\\n(?:async )?function " + name + "\\("));
  assert(at >= 0, "missing function " + name);
  let depth = 0, i = main.indexOf("{", at);
  for (; i < main.length; i++) { if (main[i] === "{") depth++; else if (main[i] === "}" && --depth === 0) break; }
  return main.slice(at + 1, i + 1);
}
function liftConst(name) {
  const at = main.indexOf("const " + name + " =");
  assert(at >= 0, "missing const " + name);
  return main.slice(at, main.indexOf(";\n", at) + 2);
}
const hasRemembered = main.includes("function readValueRemembered(");
const code = [
  "aesEncrypt", "aesDecrypt", "encodeValue", "writeFileAtomic", "readValue",
  ...(hasRemembered ? ["decodePayload", "forgetRememberedRead", "forgetRememberedReads", "rememberRead", "readValueRemembered"] : []),
  "writeValue",
].map(lift).join("\n") + "\n" + liftConst("keyToFile") +
  (hasRemembered ? liftConst("REMEMBERED_READ_KEYS") + liftConst("REMEMBERED_READ_LIMIT") + "const rememberedReads = new Map();\nlet rememberedReadBytes = 0;\n" : "");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-remembered-"));
let dpapiDecrypts = 0;
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: text => Buffer.concat([Buffer.from("D"), Buffer.from(text, "utf8")]),
  decryptString: buf => { dpapiDecrypts++; return buf.subarray(1).toString("utf8"); },
};
const api = new Function("fs", "path", "crypto", "safeStorage", "dataDir", "state",
  "let masterKey = null;\nconst isLocked = () => state.password && !masterKey;\nconst rememberHash = () => {};\n" + code +
  "\nconst read = typeof readValueRemembered === 'function' ? readValueRemembered : readValue;" +
  "\nreturn { read, readValue, writeValue, keyToFile, setKey: k => { masterKey = k; }, lock: () => { masterKey = null; if (typeof forgetRememberedReads === 'function') forgetRememberedReads(); } };"
)(fs, path, crypto, safeStorage, dir, { password: true });

try {
  const key = crypto.randomBytes(32);
  api.setKey(key);
  const table = JSON.stringify([{ id: "c1", messages: [{ id: "m", role: "user", content: "Hello ✨ " + "x".repeat(50000) }] }]);
  api.writeValue("chats:all", table);

  dpapiDecrypts = 0;
  for (let i = 0; i < 20; i++) assert.strictEqual(api.read("chats:all"), table, "remembered read returns the exact text");
  assert.strictEqual(dpapiDecrypts, 0, "20 reads of the table this process just wrote decrypted it " + dpapiDecrypts + " times");

  // Another writer replaces the file: the bytes differ, so the new value is decrypted.
  const other = table.replace("Hello", "Howdy");
  // Encode the replacement as a genuine record under another name, then copy it in.
  api.writeValue("__scratch__", other);
  fs.copyFileSync(api.keyToFile("__scratch__"), api.keyToFile("chats:all"));
  dpapiDecrypts = 0;
  assert.strictEqual(api.read("chats:all"), other, "a file replaced behind the cache is read from disk");
  assert.strictEqual(dpapiDecrypts, 1, "changed bytes force exactly one decrypt");
  dpapiDecrypts = 0;
  api.read("chats:all");
  assert.strictEqual(dpapiDecrypts, 0, "a full read is remembered for the next compare");

  // A different master key never reuses plaintext remembered under the old one.
  api.setKey(Buffer.from(key));
  dpapiDecrypts = 0;
  assert.strictEqual(api.read("chats:all"), other);
  assert.strictEqual(dpapiDecrypts, 1, "a new master key object forces a decrypt");

  // Locked: nothing remembered is returned.
  api.lock();
  assert.throws(() => api.read("chats:all"), /locked/, "a locked vault never answers from memory");
  api.setKey(key);

  // Deleted record reads as null, as before.
  fs.unlinkSync(api.keyToFile("chats:all"));
  assert.strictEqual(api.read("chats:all"), null);

  // Pictures and arbitrary keys are never remembered.
  api.writeValue("img:abc", "data:image/png;base64,AAAA");
  dpapiDecrypts = 0;
  api.read("img:abc"); api.read("img:abc");
  assert.strictEqual(dpapiDecrypts, 2, "picture reads always decrypt");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log("PASS: whole-table reads reuse exact remembered bytes; changes, key switches, lock, deletion and pictures fall back");
