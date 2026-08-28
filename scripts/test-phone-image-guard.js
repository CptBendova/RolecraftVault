/* Lift the decision block straight out of app.js and run it, rather than
   retyping the logic into the test. The text below comes from the file, so if
   the file changes the test is exercising the change. */
const fs = require("fs");

const SRC = fs.readFileSync(require("path").join(__dirname, "..", "app", "app.js"), "utf8").split("\n");
/* find the block by its first and last lines rather than by number */
const start = SRC.findIndex(l => l.trim() === "const allowPriorityOriginal = priorityOriginals.current.has(imgId);");
if (start < 0) throw new Error("could not find the guard");
let end = start;
while (end < SRC.length && SRC[end].trim() !== "imgLoading.current.delete(imgId);") end++;
const block = SRC.slice(start, end).join("\n");
console.log("lifted " + (end - start) + " lines from app.js\n");

const dataUrlSizeSrc = (() => {
  const i = SRC.findIndex(l => l.startsWith("function dataUrlSize"));
  let depth = 0, j = i;
  for (; j < SRC.length; j++) {
    depth += (SRC[j].match(/{/g) || []).length - (SRC[j].match(/}/g) || []).length;
    if (depth === 0 && j > i) break;
  }
  return SRC.slice(i, j + 1).join("\n");
})();

async function run({ onPhone, priorityOriginal, szValue, szThrows, actualBytes }) {
  const reads = [];
  const writes = [];
  let cached = null;
  const dataUrl = "data:image/png;base64," + "A".repeat(Math.ceil(actualBytes * 4 / 3));
  const sGet = async k => {
    reads.push(k);
    if (k.startsWith("sz:")) { if (szThrows) throw new Error("boom"); return szValue; }
    if (k.startsWith("img:")) return dataUrl;
    return null;
  };
  const sSet = async (k, v) => { writes.push(k + "=" + v); };
  const queueImg = (id, v) => { cached = v.length; };
  const body = dataUrlSizeSrc + "\nreturn (async () => {\n" + block + "\n return 'fellthrough'; })();";
  const priorityOriginals = { current: new Set(priorityOriginal ? ["abc"] : []) };
  const fn = new Function("ON_PHONE", "PHONE_CARD_MAX", "imgId", "sGet", "sSet", "queueImg", "priorityOriginals", body);
  await fn(onPhone, 1000000, "abc", sGet, sSet, queueImg, priorityOriginals);
  return {
    readFull: reads.some(r => r.startsWith("img:")),
    cachedBytes: cached,
    wroteSize: writes.filter(w => w.startsWith("sz:"))
  };
}

const MB = 1000000;
const cases = [
  { name: "phone, size known small",    onPhone: true,  szValue: "500000",  actualBytes: 500000,  expect: { readFull: true,  cached: true,  learns: false } },
  { name: "phone, size known large",    onPhone: true,  szValue: "5000000", actualBytes: 5000000, expect: { readFull: false, cached: false, learns: false } },
  { name: "phone, priority large",      onPhone: true,  priorityOriginal: true, szValue: "5000000", actualBytes: 5000000, expect: { readFull: true, cached: true, learns: false } },
  { name: "phone, size missing, small", onPhone: true,  szValue: null,      actualBytes: 400000,  expect: { readFull: true,  cached: true,  learns: true  } },
  { name: "phone, size missing, LARGE", onPhone: true,  szValue: null,      actualBytes: 9000000, expect: { readFull: true,  cached: false, learns: true  } },
  { name: "phone, size read throws",    onPhone: true,  szThrows: true,     actualBytes: 9000000, expect: { readFull: false, cached: false, learns: false } },
  { name: "desktop, size missing",      onPhone: false, szValue: null,      actualBytes: 9000000, expect: { readFull: true,  cached: true,  learns: false } }
];

(async () => {
  let bad = 0;
  for (const c of cases) {
    const r = await run(c);
    const got = { readFull: r.readFull, cached: r.cachedBytes !== null, learns: r.wroteSize.length > 0 };
    const ok = got.readFull === c.expect.readFull && got.cached === c.expect.cached && got.learns === c.expect.learns;
    if (!ok) bad++;
    console.log((ok ? "  PASS  " : "  FAIL  ") + c.name.padEnd(28) +
      " read=" + got.readFull + " cached=" + got.cached + " recordsSize=" + got.learns +
      (ok ? "" : "   expected " + JSON.stringify(c.expect)));
  }
  console.log(bad ? "\n" + bad + " FAILED" : "\nAll cases behave as intended.");
  process.exit(bad ? 1 : 0);
})();
