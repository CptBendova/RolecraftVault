/* Regression coverage for the multi-gigabyte PC-to-Android transfer path.
   The tests lift the shipped crypto/frame/retry helpers and also assert the
   lifecycle/storage contracts that made slow copies time out or lose data. */
const fs = require("fs");
const path = require("path");
const os = require("os");
const nodeCrypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const MAIN = fs.readFileSync(path.join(ROOT, "app", "main.js"), "utf8");
const MOBILE = fs.readFileSync(path.join(ROOT, "mobile", "src", "rc-transfer.js"), "utf8");
const PLATFORM = fs.readFileSync(path.join(ROOT, "web", "js", "rolecraft-web-platform.js"), "utf8");
const SERVICE = fs.readFileSync(path.join(ROOT, "mobile", "android", "app", "src", "main", "java",
  "com", "cptbendova", "rolecraftvault", "TransferService.java"), "utf8");
const TRANSPORT = fs.readFileSync(path.join(ROOT, "mobile", "android", "app", "src", "main", "java",
  "com", "cptbendova", "rolecraftvault", "TransferTransportPlugin.java"), "utf8");

function lift(src, name) {
  let start = src.indexOf("async function " + name);
  if (start < 0) start = src.indexOf("function " + name);
  if (start < 0) throw new Error("could not find " + name);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("could not find end of " + name);
}

let failures = 0;
function check(label, condition, detail) {
  console.log((condition ? "  PASS  " : "  FAIL  ") + label + (detail ? "  " + detail : ""));
  if (!condition) failures++;
}

async function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-framed-transfer-"));
  const keyFrom = (secret, salt) => nodeCrypto.createHash("sha256").update(secret).update(salt).digest();
  const writers = new Function("fs", "crypto", "Buffer", "JSON", "keyFrom",
    lift(MAIN, "createRecordCrypto") + "\n" + lift(MAIN, "framedRecord") + "\n"
      + lift(MAIN, "openRecordWriter") + "\n" + lift(MAIN, "openFramedWriter")
      + "\nreturn { createRecordCrypto, openRecordWriter, openFramedWriter };")(
        fs, nodeCrypto, Buffer, JSON, keyFrom);
  const secret = Buffer.from("secret");
  const shared = writers.createRecordCrypto(secret);
  const raw = nodeCrypto.randomBytes(1024 * 1024);
  const dataUrl = "data:image/jpeg;base64," + raw.toString("base64");
  const framedPath = path.join(tmp, "framed.bin");
  const legacyPath = path.join(tmp, "legacy.bin");
  const framed = writers.openFramedWriter(framedPath, secret, shared);
  framed.writeRecord("img:portrait", dataUrl);
  framed.writeRecord("chars:all", "[{\"name\":\"Aster\"}]");
  framed.finish();
  const legacy = writers.openRecordWriter(legacyPath, secret, shared);
  legacy.writeRecord("img:portrait", dataUrl);
  legacy.writeRecord("chars:all", "[{\"name\":\"Aster\"}]");
  legacy.finish();
  const framedBytes = fs.readFileSync(framedPath);
  const legacyBytes = fs.readFileSync(legacyPath);
  check("binary image frames remove the data-URL wire inflation",
    framedBytes.length < legacyBytes.length * 0.8,
    "framed=" + framedBytes.length + " legacy=" + legacyBytes.length);

  let phoneDerivations = 0;
  const phoneKeyFrom = async () => {
    phoneDerivations++;
    return nodeCrypto.webcrypto.subtle.importKey("raw", shared.key, "AES-GCM", false, ["decrypt"]);
  };
  const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const ascii = s => new TextEncoder().encode(s);
  const decode = new Function("crypto", "Uint8Array", "DataView", "TextDecoder", "JSON", "Error",
    "sameBytes", "ascii", "keyFrom",
    lift(MOBILE, "recordKey") + "\n" + lift(MOBILE, "decryptAndSaveFramed")
      + "\nreturn decryptAndSaveFramed;")(
        nodeCrypto.webcrypto, Uint8Array, DataView, TextDecoder, JSON, Error, sameBytes, ascii, phoneKeyFrom);
  const savedText = [];
  const savedBinary = [];
  await decode(framedBytes, secret,
    async (k, v) => savedText.push([k, v]),
    async (k, bytes, prefix) => savedBinary.push([k, Buffer.from(bytes), prefix]), {});
  check("the Android decoder restores text records", savedText.length === 1 && savedText[0][1].includes("Aster"));
  check("the Android decoder restores exact picture bytes",
    savedBinary.length === 1 && savedBinary[0][0] === "img:portrait"
      && savedBinary[0][1].equals(raw) && savedBinary[0][2] === "data:image/jpeg;base64,");
  check("the framed transfer still derives one shared key", phoneDerivations === 1);

  let asks = 0;
  const payload = new Uint8Array([4, 8, 15, 16, 23, 42]);
  const retryingDownload = new Function("SLICE_BYTES", "Uint8Array", "Error", "askDownload", "setTimeout",
    lift(MOBILE, "retryDownload") + "\n" + lift(MOBILE, "downloadSliced") + "\nreturn downloadSliced;")(
      12 * 1024 * 1024, Uint8Array, Error,
      async () => { asks++; if (asks < 3) throw new Error("brief Wi-Fi loss"); return payload; },
      fn => { fn(); return 0; });
  const retried = await retryingDownload({}, "/delta-file", payload.length, 1000);
  check("a transient slice failure is retried in place", asks === 3 && Buffer.from(retried).equals(Buffer.from(payload)), "attempts=" + asks);

  let timerId = 0, cleared = 0;
  const lease = new Function("setTimeout", "clearTimeout", "Date", "stopTransferServer",
    "let transferState={timer:1,expiresAt:0}; const TRANSFER_IDLE_MS=600000;\n"
      + lift(MAIN, "touchTransferLease")
      + "\nreturn {touchTransferLease,state:()=>transferState};")(
        () => ++timerId, () => { cleared++; }, Date, () => {});
  lease.touchTransferLease();
  lease.touchTransferLease();
  check("active traffic renews the Windows sender lease",
    cleared === 2 && lease.state().timer === 2 && lease.state().expiresAt > Date.now());

  check("stream sessions use unique PC pack filenames",
    /sessionId \? "delta-" \+ sessionId \+ "-" \+ i/.test(MAIN));
  check("the PC waits for saved-batch acknowledgements before filling disk",
    /session\.batches\.filter\(item => item && item\.path\)\.length >= 3/.test(MAIN)
      && /route === "\/delta-ack"/.test(MAIN));
  check("a partial mirror cannot delete local-only records",
    /if \(saveFailed === 0\) \{[\s\S]{0,220}window\.storage\.delete/.test(MOBILE));
  check("Android commits a new unique file before removing the old one",
    /vaultPath\(key\) \+ "\." \+ randomHex\(8\)[\s\S]{0,260}idbSet\("v:" \+ key[\s\S]{0,180}dropPayloadFile\(stored\)/.test(PLATFORM));
  check("large downloads stream through a native temporary file",
    /BufferedInputStream/.test(TRANSPORT) && /FileOutputStream/.test(TRANSPORT)
      && !/ByteArrayOutputStream/.test(TRANSPORT));
  check("screen-off copies hold both CPU and high-performance Wi-Fi",
    /PARTIAL_WAKE_LOCK/.test(SERVICE) && /WIFI_MODE_FULL_HIGH_PERF/.test(SERVICE));

  fs.rmSync(tmp, { recursive: true, force: true });
}

run().then(() => {
  console.log(failures ? "\n" + failures + " FAILED" : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
