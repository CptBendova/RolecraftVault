/* Prove batch splitting and HTTP slicing: a 12 MB "photo" is its own batch,
   and concatenating 1 MB slices rebuilds the file exactly. */
const http = require("http");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const BATCH_PLAIN_MAX = 4 * 1024 * 1024;
const SLICE = 1 << 20;

function splitKeysIntoBatches(keys, sizes) {
  const batches = [];
  let cur = [], size = 0;
  for (const k of keys) {
    const n = sizes[k] || 0;
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

let failed = 0;
const check = (label, cond, detail) => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!cond) failed++;
};

const batches = splitKeysIntoBatches(
  ["txt:a", "img:big", "txt:b", "img:small"],
  { "txt:a": 100, "img:big": 12 * 1024 * 1024, "txt:b": 80, "img:small": 2000 }
);
check("a 12 MB photo is its own batch", batches.length === 3
  && batches[0].join() === "txt:a"
  && batches[1].join() === "img:big"
  && batches[2].join() === "txt:b,img:small", JSON.stringify(batches));

const small = splitKeysIntoBatches(["a", "b", "c"], { a: 100, b: 100, c: 100 });
check("tiny records share one batch", small.length === 1 && small[0].length === 3);

const two = splitKeysIntoBatches(["p", "q"], { p: 3 * 1024 * 1024, q: 3 * 1024 * 1024 });
check("two 3 MB pictures do not share a 4 MB batch", two.length === 2);

const tmp = path.join(os.tmpdir(), "rcv-slice-test.bin");
const payload = Buffer.alloc(SLICE * 2 + 12345);
for (let i = 0; i < payload.length; i++) payload[i] = (i * 13 + 7) & 255;
fs.writeFileSync(tmp, payload);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  const off = Number(u.searchParams.get("off") || 0);
  const n = Number(u.searchParams.get("n") || payload.length);
  const start = Math.max(0, Math.min(payload.length, off));
  const end = Math.max(start, Math.min(payload.length, start + n));
  const slice = payload.subarray(start, end);
  res.writeHead(200, { "Content-Length": slice.length, "Content-Type": "application/octet-stream" });
  res.end(slice);
});

(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const out = Buffer.alloc(payload.length);
  let got = 0;
  while (got < payload.length) {
    const n = Math.min(SLICE, payload.length - got);
    const buf = await new Promise((resolve, reject) => {
      http.get({ hostname: "127.0.0.1", port, path: "/delta-file?i=0&off=" + got + "&n=" + n }, resp => {
        const cs = [];
        resp.on("data", c => cs.push(c));
        resp.on("end", () => resolve(Buffer.concat(cs)));
      }).on("error", reject);
    });
    buf.copy(out, got);
    got += buf.length;
  }
  check("sliced download equals the original file", out.equals(payload),
    "got " + got + " of " + payload.length);
  server.close();
  try { fs.unlinkSync(tmp); } catch (e) {}
  console.log(failed === 0 ? "\nAll checks passed." : "\n" + failed + " FAILED");
  process.exit(failed === 0 ? 0 : 1);
})();
