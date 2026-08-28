/* Exercise the real PC-to-Android fast path.

   This proves four things that materially affect a large copy:
     - modern receivers ask the PC to build only the representation they use;
     - every batch shares one PBKDF2-derived key but keeps a unique GCM IV;
     - Android reuses that key and crosses the native bridge in 12 MB slices;
     - completion clears the PC's packed temporary files and reports done.

   Functions are lifted from the shipped files rather than retyped here. */
const fs = require("fs");
const path = require("path");
const os = require("os");
const nodeCrypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const MAIN = fs.readFileSync(path.join(ROOT, "app", "main.js"), "utf8");
const MOBILE = fs.readFileSync(path.join(ROOT, "mobile", "src", "rc-transfer.js"), "utf8");

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

function numericConstant(src, name) {
  const match = new RegExp("const\\s+" + name + "\\s*=\\s*([^;]+);").exec(src);
  if (!match) throw new Error("could not find " + name);
  return Function("return (" + match[1] + ");")();
}

let failures = 0;
function check(label, condition, detail) {
  console.log((condition ? "  PASS  " : "  FAIL  ") + label + (detail ? "  " + detail : ""));
  if (!condition) failures++;
}

async function run() {
  const batchMax = numericConstant(MAIN, "BATCH_PLAIN_MAX");
  const sliceBytes = numericConstant(MOBILE, "SLICE_BYTES");
  check("PC batches are capped at 8 MB", batchMax === 8 * 1024 * 1024, String(batchMax));
  check("Android slices are 12 MB", sliceBytes === 12 * 1024 * 1024, String(sliceBytes));

  const modeFactory = new Function("URL",
    lift(MAIN, "deltaPackMode") + "\n" + lift(MAIN, "deltaPackTargets")
      + "\nreturn { deltaPackMode, deltaPackTargets };");
  const { deltaPackMode, deltaPackTargets } = modeFactory(URL);
  check("Android batch mode omits the duplicate combined file",
    JSON.stringify(deltaPackTargets(deltaPackMode("/delta-start?mode=batches")))
      === JSON.stringify({ combined: false, batches: true }));
  check("desktop combined mode omits unused batch files",
    JSON.stringify(deltaPackTargets(deltaPackMode("/delta-start?mode=combined")))
      === JSON.stringify({ combined: true, batches: false }));
  check("an old receiver still gets both representations",
    JSON.stringify(deltaPackTargets(deltaPackMode("/delta-start")))
      === JSON.stringify({ combined: true, batches: true }));
  check("the new Android path is isolated and binary framed",
    JSON.stringify(deltaPackTargets(deltaPackMode("/delta-start?mode=stream-batches")))
      === JSON.stringify({ combined: false, batches: true, framed: true }));

  const sizes = {
    "txt:a": 100,
    "img:big": 12 * 1024 * 1024,
    "txt:b": 80,
    "img:one": 4 * 1024 * 1024,
    "img:two": 4 * 1024 * 1024
  };
  const splitFactory = new Function("estimateKeyBytes", "BATCH_PLAIN_MAX",
    lift(MAIN, "splitKeysIntoBatches") + "\nreturn splitKeysIntoBatches;");
  const splitKeysIntoBatches = splitFactory(k => sizes[k] || 0, batchMax);
  const batches = splitKeysIntoBatches(["txt:a", "img:big", "txt:b"]);
  check("an oversized picture remains its own sliced batch",
    batches.length === 3 && batches[1].join() === "img:big", JSON.stringify(batches));
  const exact = splitKeysIntoBatches(["img:one", "img:two"]);
  check("records filling exactly 8 MB share one PC batch", exact.length === 1, JSON.stringify(exact));

  let pcDerivations = 0;
  const keyFrom = (secret, salt) => {
    pcDerivations++;
    return nodeCrypto.createHash("sha256").update(Buffer.from(secret)).update(Buffer.from(salt)).digest();
  };
  const writerFactory = new Function("fs", "crypto", "Buffer", "JSON", "keyFrom",
    lift(MAIN, "createRecordCrypto") + "\n" + lift(MAIN, "openRecordWriter")
      + "\nreturn { createRecordCrypto, openRecordWriter };");
  const { createRecordCrypto, openRecordWriter } = writerFactory(fs, nodeCrypto, Buffer, JSON, keyFrom);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-fast-transfer-"));
  const onePath = path.join(tmp, "delta-0.bin");
  const twoPath = path.join(tmp, "delta-1.bin");
  const secret = Buffer.from("secret");
  const shared = createRecordCrypto(secret);
  const one = openRecordWriter(onePath, secret, shared);
  one.writeRecord("txt:one", "first");
  one.finish();
  const two = openRecordWriter(twoPath, secret, shared);
  two.writeRecord("txt:two", "second");
  two.finish();
  const oneBytes = fs.readFileSync(onePath);
  const twoBytes = fs.readFileSync(twoPath);
  check("PC derives the record key once for every batch", pcDerivations === 1, "derivations=" + pcDerivations);
  check("batch salts match so Android can reuse the key",
    oneBytes.subarray(5, 21).equals(twoBytes.subarray(5, 21)));
  check("every batch keeps a unique AES-GCM IV",
    !oneBytes.subarray(21, 33).equals(twoBytes.subarray(21, 33)));

  let phoneDerivations = 0;
  const phoneKeyFrom = async () => {
    phoneDerivations++;
    return nodeCrypto.webcrypto.subtle.importKey("raw", shared.key, "AES-GCM", false, ["decrypt"]);
  };
  const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const ascii = s => new TextEncoder().encode(s);
  const decryptFactory = new Function("crypto", "Uint8Array", "TextDecoder", "JSON", "sameBytes", "ascii", "keyFrom",
    lift(MOBILE, "recordKey") + "\n" + lift(MOBILE, "decryptAndSave")
      + "\nreturn decryptAndSave;");
  const decryptAndSave = decryptFactory(nodeCrypto.webcrypto, Uint8Array, TextDecoder, JSON, sameBytes, ascii, phoneKeyFrom);
  const saved = [];
  const phoneKeyCache = {};
  await decryptAndSave(oneBytes, secret, async (k, v) => saved.push([k, v]), phoneKeyCache);
  await decryptAndSave(twoBytes, secret, async (k, v) => saved.push([k, v]), phoneKeyCache);
  check("Android derives a shared batch key only once", phoneDerivations === 1, "derivations=" + phoneDerivations);
  check("both encrypted batches still authenticate and save",
    JSON.stringify(saved) === JSON.stringify([["txt:one", "first"], ["txt:two", "second"]]), JSON.stringify(saved));

  let requestPaths = [];
  let payload = new Uint8Array(sliceBytes * 2 + 12345);
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 13 + 7) & 255;
  const ask = async (target, requestPath) => {
    requestPaths.push(requestPath);
    const url = new URL(requestPath, "http://phone");
    const off = Number(url.searchParams.get("off") || 0);
    const n = Number(url.searchParams.get("n") || payload.length);
    return payload.slice(off, Math.min(payload.length, off + n));
  };
  const downloadFactory = new Function("SLICE_BYTES", "Uint8Array", "Error", "askDownload", "setTimeout",
    lift(MOBILE, "retryDownload") + "\n" + lift(MOBILE, "downloadSliced") + "\nreturn downloadSliced;");
  const downloadSliced = downloadFactory(sliceBytes, Uint8Array, Error, ask, setTimeout);
  const downloaded = await downloadSliced({}, "/delta-file?i=0", payload.length, 1000);
  check("a little over 24 MB needs only three native requests", requestPaths.length === 3,
    "requests=" + requestPaths.length);
  check("sliced bytes rebuild exactly", Buffer.from(downloaded).equals(Buffer.from(payload)));
  /* An 8 MB binary picture is about 10.7 MB as a data URL in the record file. */
  payload = new Uint8Array(11 * 1024 * 1024);
  requestPaths = [];
  await downloadSliced({}, "/delta-file?i=1", payload.length, 1000);
  check("an ordinary 8 MB picture batch crosses the bridge once", requestPaths.length === 1,
    "requests=" + requestPaths.length);

  let cleared = 0, published = null;
  const completeFactory = new Function("clearLegacyDeltaFiles", "publishShareProgress",
    "let transferState = { deltaPath: 'combined', deltaBatches: [1, 2], timer: null };\n"
      + "function cleanTransferSessionId(){ return null; }\nfunction touchTransferLease(){}\n"
      + lift(MAIN, "completeDeltaTransfer")
      + "\nreturn { completeDeltaTransfer, state: () => transferState };");
  const completion = completeFactory(() => { cleared++; }, p => { published = p; });
  completion.completeDeltaTransfer();
  check("completion removes packed temporary files", cleared === 1);
  check("completion drops stale paths from transfer state",
    completion.state().deltaPath === undefined && completion.state().deltaBatches === undefined);
  check("completion tells the sender only after the receiver acknowledges",
    published && published.phase === "done");

  check("Android requests the streamed framed fast path",
    /ask\(target, "\/delta-start\?mode=stream-batches&id="/.test(MOBILE));
  check("desktop requests the combined-only fast path",
    /path: "\/delta-start\?mode=combined"/.test(MAIN));
  check("both receivers acknowledge a successfully saved copy",
    /notifyTransferComplete\(target\)/.test(MOBILE)
      && /notifyTransferComplete\(base, target\.secret\)/.test(MAIN));

  fs.rmSync(tmp, { recursive: true, force: true });
}

run().then(() => {
  console.log(failures === 0 ? "\nAll checks passed." : "\n" + failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
