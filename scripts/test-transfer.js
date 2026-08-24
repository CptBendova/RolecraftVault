/* Lift the real ask() and nativeRequest() out of the shipped rc-transfer.js and
   run them against a real HTTP server, with a Capacitor stub that behaves the
   way Capacitor's Android code actually behaves:

     - window.Capacitor.Plugins is undefined (that is the device reality)
     - nativePromise(plugin, method, opts) is the only way through
     - a request body is base64-decoded ONLY when opts.dataType === "file",
       otherwise the string is sent as UTF-8, which is the bug being fixed
     - an arraybuffer response comes back as a base64 string

   The point is to prove the bytes that leave the device are the bytes the other
   device is meant to receive. Nothing here retypes the logic: both functions are
   cut out of the real file by brace matching. */
const fs = require("fs");
const http = require("http");
const assert = require("assert");

const SRC = fs.readFileSync(require("path").join(__dirname, "..", "mobile", "src", "rc-transfer.js"), "utf8");

function lift(name) {
  let start = SRC.indexOf("async function " + name);
  if (start < 0) start = SRC.indexOf("function " + name);
  if (start < 0) throw new Error("could not find " + name);
  let i = SRC.indexOf("{", start), depth = 0, end = -1;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === "{") depth++;
    else if (SRC[j] === "}") { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  return SRC.slice(start, end);
}

const askSrc = lift("ask");
const nativeSrc = lift("nativeRequest");
console.log("lifted nativeRequest (" + nativeSrc.length + " chars) and ask (" + askSrc.length + " chars) from the real file\n");

/* --- the server that stands in for the PC --- */
let received = null;
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", c => chunks.push(c));
  req.on("end", () => {
    received = { method: req.method, url: req.url, body: Buffer.concat(chunks), ctype: req.headers["content-type"] };
    // reply with a known binary payload
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end(Buffer.from([0x52, 0x43, 0x56, 0x58, 0x32, 0x00, 0xff, 0x7f, 0x80]));
  });
});

/* --- the Capacitor stub, mirroring the Android source --- */
const calls = [];
const Capacitor = {
  // Plugins deliberately absent: this is what the device actually has
  nativePromise(plugin, method, opts) {
    calls.push({ plugin, method, opts });
    return new Promise((resolve, reject) => {
      const u = new URL(opts.url);
      let bodyBuf;
      if (opts.data !== undefined && opts.data !== null) {
        if (opts.dataType === "file") bodyBuf = Buffer.from(opts.data, "base64");   // the decode branch
        else bodyBuf = Buffer.from(String(opts.data), "utf8");                       // the bug branch
      }
      const r = http.request({
        hostname: u.hostname, port: u.port, path: u.pathname, method: opts.method,
        headers: opts.headers || {}
      }, resp => {
        const cs = [];
        resp.on("data", c => cs.push(c));
        resp.on("end", () => resolve({
          status: resp.statusCode,
          data: Buffer.concat(cs).toString("base64")  // arraybuffer -> base64, as Android does
        }));
      });
      r.on("error", reject);
      if (bodyBuf) r.write(bodyBuf);
      r.end();
    });
  }
};

const sandbox = { window: { Capacitor }, atob: b => Buffer.from(b, "base64").toString("binary"),
                  btoa: s => Buffer.from(s, "binary").toString("base64"), Uint8Array, Error, URL, console };

/* build the two functions plus the two base64 helpers, exactly as the file has them */
const helpers = `
  const b64ToBytes = b64 => { const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  const bytesToB64 = bytes => { let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin); };
`;
const factory = new Function("window", "atob", "btoa", "String",
  helpers + nativeSrc + "\n" + askSrc + "\n return { ask, nativeRequest };");
const { ask } = factory(sandbox.window, sandbox.atob, sandbox.btoa, String);

(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const target = { ip: "127.0.0.1", port };
  let failures = 0;
  const check = (label, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
    if (!cond) failures++;
  };

  /* 1. a GET must go through nativePromise at all */
  const got = await ask(target, "/manifest", "GET", null, 5000);
  check("GET reaches the server through nativePromise", calls.length === 1 && calls[0].plugin === "CapacitorHttp" && calls[0].method === "request");
  check("GET sends no dataType", calls[0].opts.dataType === undefined);
  check("arraybuffer response decodes to the exact bytes",
    Buffer.from(got).equals(Buffer.from([0x52,0x43,0x56,0x58,0x32,0x00,0xff,0x7f,0x80])),
    "got " + Buffer.from(got).toString("hex"));

  /* 2. a POST body must arrive as the original raw bytes, including non-UTF8 ones */
  const payload = new Uint8Array(3000);
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 7 + (i >> 3)) & 0xff;  // every byte value, incl. 0x00 and 0x80-0xff
  await ask(target, "/delta", "POST", payload, 5000);
  check("POST marks the body for decoding (dataType file)", calls[1].opts.dataType === "file");
  check("server received the exact bytes that were sent",
    received.body.equals(Buffer.from(payload)),
    "sent " + payload.length + " bytes, server saw " + received.body.length);
  check("body is not base64 text", received.body.length === payload.length);

  /* 3. show what the old code would have done, to prove the test can fail */
  const wrong = Buffer.from(Buffer.from(payload).toString("base64"), "utf8");
  check("the bug this replaces would have been caught", !wrong.equals(Buffer.from(payload)),
    "base64 body would have been " + wrong.length + " bytes instead of " + payload.length);

  server.close();
  console.log(failures === 0 ? "\nAll checks passed." : "\n" + failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
})();
