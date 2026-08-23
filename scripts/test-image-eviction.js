/* Both eviction loops now put pinned entries back on the queue and carry on,
   which is the shape that spins forever if the exit condition is wrong. These
   run the loops lifted verbatim out of app.js, with a step ceiling so a hang
   fails the test instead of hanging it. */
const fs = require("fs");
const SRC = fs.readFileSync("C:/Rolecraft/rolecraft-vault/app/app.js", "utf8").split("\n");

function liftLoop(firstLine) {
  const i = SRC.findIndex(l => l.trim().startsWith(firstLine));
  if (i < 0) throw new Error("could not find: " + firstLine);
  let depth = 0, j = i;
  for (; j < SRC.length; j++) {
    depth += (SRC[j].match(/{/g) || []).length - (SRC[j].match(/}/g) || []).length;
    if (depth === 0 && j > i) break;
  }
  return SRC.slice(i, j + 1).join("\n");
}

const previewLoop = liftLoop("while (imgTotal.current > IMG_CACHE_BYTES");
const showLoop = liftLoop("while (fullShowOrder.current.length > FULL_CACHE_MAX)");
console.log("lifted both loops from app.js\n");

/* a ref whose array methods count operations, so a runaway loop is caught */
function guard(limit) {
  let n = 0;
  return () => { if (++n > limit) throw new Error("loop did not terminate (" + limit + " steps)"); };
}

function runPreview({ order, pinned, bytes, budget }) {
  const tick = guard(100000);
  const imgOrder = { current: order.slice() };
  const imgBytes = { current: Object.assign({}, bytes) };
  const imgTotal = { current: order.reduce((a, id) => a + (bytes[id] || 0), 0) };
  const fullPinned = { current: new Set(pinned) };
  const evict = [];
  const IMG_CACHE_BYTES = budget;
  const shift = imgOrder.current.shift.bind(imgOrder.current);
  imgOrder.current.shift = () => { tick(); return shift(); };
  const fn = new Function("imgOrder", "imgBytes", "imgTotal", "fullPinned", "evict", "IMG_CACHE_BYTES", previewLoop);
  fn(imgOrder, imgBytes, imgTotal, fullPinned, evict, IMG_CACHE_BYTES);
  return { evicted: evict, remaining: imgOrder.current.slice(), total: imgTotal.current };
}

function runShow({ order, pinned, max, imgId }) {
  const tick = guard(100000);
  const fullShowOrder = { current: order.slice() };
  const fullShow = { current: new Set(order) };
  const fullPinned = { current: new Set(pinned) };
  const fullEvict = { current: [] };
  const FULL_CACHE_MAX = max;
  const shift = fullShowOrder.current.shift.bind(fullShowOrder.current);
  fullShowOrder.current.shift = () => { tick(); return shift(); };
  const fn = new Function("fullShowOrder", "fullShow", "fullPinned", "fullEvict", "FULL_CACHE_MAX", "imgId", showLoop);
  fn(fullShowOrder, fullShow, fullPinned, fullEvict, FULL_CACHE_MAX, imgId);
  return { evicted: fullEvict.current.slice(), remaining: fullShowOrder.current.slice() };
}

const MB = 1024 * 1024;
let bad = 0;
const check = (name, fn, verify) => {
  try {
    const r = fn();
    const msg = verify(r);
    if (msg) { console.log("  FAIL  " + name + "  " + msg); bad++; }
    else console.log("  PASS  " + name);
  } catch (e) {
    console.log("  FAIL  " + name + "  threw: " + e.message);
    bad++;
  }
};

/* ---- preview budget ---- */
const bytes = {}; for (let i = 0; i < 200; i++) bytes["p" + i] = 1 * MB;
const all = Object.keys(bytes);

check("under budget evicts nothing", () =>
  runPreview({ order: all.slice(0, 50), pinned: [], bytes, budget: 220 * MB }),
  r => r.evicted.length ? "evicted " + r.evicted.length : null);

check("over budget evicts oldest first", () =>
  runPreview({ order: all, pinned: [], bytes, budget: 100 * MB }),
  r => r.evicted[0] !== "p0" ? "first evicted was " + r.evicted[0] : (r.total > 100 * MB ? "still over budget" : null));

check("far more than 64 previews survive", () =>
  runPreview({ order: all, pinned: [], bytes, budget: 220 * MB }),
  r => r.remaining.length <= 64 ? "only " + r.remaining.length + " kept" : null);

check("pinned survive even when over budget", () =>
  runPreview({ order: all, pinned: ["p0", "p1", "p2"], bytes, budget: 10 * MB }),
  r => ["p0","p1","p2"].some(id => r.evicted.includes(id)) ? "a pinned preview was evicted" : null);

check("all pinned and over budget still terminates", () =>
  runPreview({ order: all.slice(0, 100), pinned: all.slice(0, 100), bytes, budget: 1 * MB }),
  r => r.evicted.length ? "evicted a pinned one" : null);

/* ---- visible full set ---- */
check("unpinned trimmed to the cap", () =>
  runShow({ order: ["a","b","c","d","e"], pinned: [], max: 3, imgId: "e" }),
  r => r.remaining.length !== 3 ? "kept " + r.remaining.length : null);

check("open record's pictures all stay visible", () =>
  runShow({ order: Array.from({length: 60}, (_, i) => "g" + i), pinned: Array.from({length: 60}, (_, i) => "g" + i), max: 8, imgId: "g59" }),
  r => r.evicted.length ? "evicted " + r.evicted.length + " of the open record" :
       (r.remaining.length !== 60 ? "kept only " + r.remaining.length : null));

check("mixed pinned and loose terminates and drops only loose", () =>
  runShow({ order: ["p1","x1","p2","x2","p3","x3"], pinned: ["p1","p2","p3"], max: 2, imgId: "x3" }),
  r => r.evicted.some(id => id.startsWith("p")) ? "evicted a pinned one" : null);

console.log(bad ? "\n" + bad + " FAILED" : "\nAll eviction cases behave, and every loop terminates.");
process.exit(bad ? 1 : 0);
