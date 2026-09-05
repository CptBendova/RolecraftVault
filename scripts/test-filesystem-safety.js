/* Regression coverage for the filesystem races found by public CodeQL setup.
   The update reader and transfer parser are lifted from the shipped main
   process and executed against descriptor-aware fake filesystems. */
const fs = require("fs");
const path = require("path");
const { StringDecoder } = require("string_decoder");

const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "app", "main.js"), "utf8");
const transferTest = fs.readFileSync(path.join(root, "scripts", "test-cross-edition-audit-2.js"), "utf8");
const assetTest = fs.readFileSync(path.join(root, "scripts", "test-update-assets.js"), "utf8");

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
    else if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("Unclosed " + name);
}

let bad = 0;
function check(label, value, detail = "") {
  if (!value) bad++;
  console.log("  " + (value ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
}

const readExactSync = new Function("fs", "Buffer",
  liftFunction(main, "readExactSync") + "; return readExactSync;");
const openUpdateFile = new Function("fs", "readExactSync", "installUpdateText",
  liftFunction(main, "openUpdateFile") + "; return openUpdateFile;");

const updateEvents = [];
const updateBytes = Buffer.from("{}", "utf8");
const updateFs = {
  openSync(file, mode) { updateEvents.push("open:" + file + ":" + mode); return 41; },
  fstatSync(fd) { updateEvents.push("fstat:" + fd); return { isFile: () => true, size: updateBytes.length }; },
  readSync(fd, out, offset, length, position) {
    updateEvents.push("read:" + fd + ":" + position);
    return updateBytes.copy(out, offset, position, position + length);
  },
  closeSync(fd) { updateEvents.push("close:" + fd); },
  statSync() { throw new Error("path stat must not be used"); },
  readFileSync() { throw new Error("path read must not be used"); },
};
const updateRead = openUpdateFile(updateFs,
  readExactSync(updateFs, Buffer), text => ({ ok: text === "{}" }))("chosen.rcvup", null);
check("update packages are inspected and read through one descriptor",
  updateRead.ok && updateEvents.join(",") === "open:chosen.rcvup:r,fstat:41,read:41:0,close:41",
  updateEvents.join(","));

const eachTransferLine = new Function("fs", "Buffer", "StringDecoder",
  liftFunction(main, "eachTransferLine") + "; return eachTransferLine;");
const lineBytes = Buffer.from("first\nsecond\n", "utf8");
const lineEvents = [];
const lineFs = {
  openSync() { lineEvents.push("open"); return 52; },
  fstatSync(fd) { lineEvents.push("fstat:" + fd); return { size: lineBytes.length }; },
  readSync(fd, out, offset, length, position) {
    lineEvents.push("read:" + fd + ":" + position);
    return lineBytes.copy(out, offset, position, Math.min(position + length, lineBytes.length));
  },
  closeSync(fd) { lineEvents.push("close:" + fd); },
  statSync() { throw new Error("path stat must not be used"); },
};
const lines = [];
eachTransferLine(lineFs, Buffer, StringDecoder)("transfer.plain", line => lines.push(line));
check("transfer text size comes from the opened descriptor",
  lines.join(",") === "first,second" && lineEvents[0] === "open" && lineEvents[1] === "fstat:52" &&
  lineEvents[lineEvents.length - 1] === "close:52", lineEvents.join(","));

const decryptBody = liftFunction(main, "decryptTransferFile");
check("encrypted transfers no longer stat a replaceable path",
  /openSync\(encPath, "r"\)/.test(decryptBody) && /fstatSync\(fdIn\)/.test(decryptBody) &&
  !/statSync\(encPath\)/.test(decryptBody));
check("test artifacts use private random temporary directories",
  /mkdtempSync\(path\.join\(os\.tmpdir\(\), "rolecraft-transfer-utf8-"\)\)/.test(transferTest) &&
  /mkdtempSync\(path\.join\(os\.tmpdir\(\), "rcv-probe3-"\)\)/.test(assetTest));

console.log("\n" + (bad ? bad + " filesystem safeguard(s) failed." : "Filesystem paths stay bound to the files that were validated."));
process.exit(bad ? 1 : 0);
