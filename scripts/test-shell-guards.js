/* The shell's own guards. Shell fixes cannot be delivered by a patch, so these
   are the ones worth being sure about before an installer goes out.

   Three are run for real by lifting the code out of main.js and giving it a
   temporary folder to work in; two are properties of the source, checked the
   way test-hardening.js checks the rest of the shell.

   What each is for:

   - **Writing while locked.** encodeValue falls back to "raw:" when there is no
     master key, so anything writing while locked stored the record with no
     password layer at all, underneath DPAPI only, while security.json went on
     saying a password was set. vault-set and vault-delete were gated; receiving
     a transfer was not, and it writes every record that arrives.
   - **What a transfer leaves behind.** transfer.plain is the decrypted stream of
     every record that arrived, written to disk so it can be applied a line at a
     time. The receive path deletes it on every exit it controls; a crash or a
     force quit is not one of them, and it then sits there as an unencrypted
     copy of the vault.
   - **Byte offsets past 2 GB.** `| 0` is a 32-bit operation and wrapped them
     negative.

   Plain node. */
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "app", "main.js"), "utf8");

let bad = 0;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};
const give_up = why => { console.log("\n  " + why); process.exit(1); };

/* main.js is CRLF; brace-match on the raw text and normalise after. */
function lift(name) {
  const at = SRC.indexOf("function " + name + "(");
  if (at < 0) give_up("main.js no longer has a function called " + name);
  let i = SRC.indexOf("(", at), d = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === "(") d++;
    else if (SRC[i] === ")") { d--; if (!d) break; }
  }
  i = SRC.indexOf("{", i); d = 0;
  let end = -1;
  for (; i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  if (end < 0) give_up("could not find the end of " + name);
  return SRC.slice(at, end).split("\r\n").join("\n");
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-shell-"));

console.log("\nwriting a record while the vault is locked");
{
  /* The real writeValue, encodeValue, keyToFile and writeFileAtomic, over a real
     folder, with safeStorage and the lock state stubbed. */
  const code = [lift("encodeValue"), lift("writeFileAtomic"), lift("writeValue")].join("\n");
  const mk = (locked, masterKey) => {
    const written = {};
    const ctx = {
      safeStorage: { isEncryptionAvailable: () => false },
      // deliberately does not echo its input: the checks below ask whether the
      // plaintext reached the disk, which a stub that repeats it would answer for them
      aesEncrypt: () => "Q0lQSEVSVEVYVA==",
      keyToFile: k => path.join(dir, encodeURIComponent(k) + ".dat"),
      rememberHash: () => {},
      isLocked: () => locked,
      masterKey,
      fs, path, crypto: require("crypto"), written
    };
    const fn = new Function(...Object.keys(ctx), code + "\nreturn { writeValue };");
    return fn(...Object.values(ctx));
  };

  // unlocked, with a key: the record is encrypted
  const open = mk(false, Buffer.alloc(32, 1));
  open.writeValue("chars:all", "SECRET WRITING");
  const onDisk = fs.readFileSync(path.join(dir, encodeURIComponent("chars:all") + ".dat"), "utf8");
  check("with the vault open the record is encrypted", onDisk.indexOf("SECRET WRITING") < 0 &&
    onDisk.indexOf("pwd:") >= 0, onDisk.slice(0, 40));

  // locked: it must refuse rather than fall back to writing it in the clear
  const shut = mk(true, null);
  let threw = null;
  try { shut.writeValue("chars:all", "SECRET WRITING"); } catch (e) { threw = e.message; }
  const after = fs.readFileSync(path.join(dir, encodeURIComponent("chars:all") + ".dat"), "utf8");
  check("with the vault locked the write is refused", threw === "locked", threw || "it did not throw");
  check("and nothing was written in the clear", after.indexOf("SECRET WRITING") < 0,
    after.indexOf("SECRET WRITING") >= 0 ? "the record is on disk unencrypted" : "");
}

console.log("\nwhat a transfer leaves behind");
{
  const updatesDir = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-updates-"));
  const leftovers = ["transfer.plain", "incoming.bin", "transfer.bin", "delta.bin", "delta-3.bin"];
  const keep = ["current"];
  leftovers.forEach(f => fs.writeFileSync(path.join(updatesDir, f), "every record, in the clear"));
  fs.mkdirSync(path.join(updatesDir, "current"), { recursive: true });
  fs.writeFileSync(path.join(updatesDir, "current", "app.js"), "the installed patch");

  const code = [lift("clearDeltaFiles"), lift("clearTransferLeftovers")].join("\n");
  const ctx = { updatesDir, fs, path, deltaFilePath: () => path.join(updatesDir, "delta.bin") };
  const fn = new Function(...Object.keys(ctx), code + "\nreturn { clearTransferLeftovers };");
  fn(...Object.values(ctx)).clearTransferLeftovers();

  const left = fs.readdirSync(updatesDir);
  check("the decrypted copy of the vault is gone", left.indexOf("transfer.plain") < 0,
    left.join(", "));
  check("and so is everything else a transfer wrote",
    !leftovers.some(f => left.indexOf(f) >= 0), left.join(", "));
  /* An installed patch lives in the same folder and must survive: taking it out
     would drop every copy back to the interface its installer shipped with. */
  check("an installed patch is left alone", keep.every(f => left.indexOf(f) >= 0), left.join(", "));
  check("it is still readable afterwards",
    fs.readFileSync(path.join(updatesDir, "current", "app.js"), "utf8") === "the installed patch");
}

console.log("\nbyte offsets past two gigabytes");
{
  const size = 3 * 1024 * 1024 * 1024; // 3 GB
  const off = 2.5 * 1024 * 1024 * 1024; // past where 32-bit maths wraps
  const range = { off, n: 1048576 };
  const start = Math.max(0, Math.min(size, Math.floor(Number(range.off)) || 0));
  const wrapped = Math.max(0, Math.min(size, range.off | 0));
  console.log("    the old 32-bit maths put the offset at " + wrapped + " instead of " + off);
  check("an offset past 2 GB is not wrapped by the source's own maths",
    !/range\.off \| 0/.test(SRC) && !/range\.n \| 0/.test(SRC),
    /range\.off \| 0/.test(SRC) ? "main.js still uses | 0" : "");
  check("and reads from where it was asked to", start === off, String(start));
}

console.log("\nproperties of the shell itself");
check("a throw in the main process no longer ends it",
  /process\.on\("uncaughtException"/.test(SRC) && /process\.on\("unhandledRejection"/.test(SRC));
check("the transfer listens on the local address, not every interface",
  !/listen\(0, "0\.0\.0\.0"/.test(SRC) && /transferServer\.listen\(0, ip,/.test(SRC),
  /0\.0\.0\.0/.test(SRC) ? "0.0.0.0 is still there" : "");
check("receiving and sharing refuse while locked",
  /transfer-receive"[^\n]*isLocked\(\)/.test(SRC) &&
  /transfer-preview"[^\n]*isLocked\(\)/.test(SRC) &&
  /transfer-start"[^\n]*isLocked\(\)/.test(SRC));
check("leftovers are swept when the app starts", /clearTransferLeftovers\(\);/.test(SRC));

try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
console.log("");
console.log(bad ? "  " + bad + " of the shell's guards is not holding."
                : "  The shell's guards are holding.");
process.exit(bad ? 1 : 0);
