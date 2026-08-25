/* Evaluate the device limits exactly as app.js declares them, for real device
   profiles, so the numbers are checked rather than reasoned about. The const
   lines are lifted from the file by name. */
const fs = require("fs");
const SRC = fs.readFileSync(require("path").join(__dirname, "..", "app", "app.js"), "utf8").split("\n");

function liftConst(name) {
  const i = SRC.findIndex(l => l.trim().startsWith("const " + name + " ="));
  if (i < 0) throw new Error("missing const " + name);
  let j = i, text = "";
  /* keep taking lines until the statement's brackets balance and it ends */
  let depth = 0;
  for (; j < SRC.length; j++) {
    text += SRC[j] + "\n";
    depth += (SRC[j].match(/[([{]/g) || []).length - (SRC[j].match(/[)\]}]/g) || []).length;
    if (depth <= 0 && /;\s*$/.test(SRC[j])) break;
  }
  return text;
}

const names = ["ON_PHONE", "SHORT_EDGE", "ON_TABLET", "DEVICE_GB", "IMG_CACHE_BYTES", "IMG_INFLIGHT", "FULL_CACHE_MAX", "FULL_MEM_MAX"];
const body = names.map(liftConst).join("");
console.log("lifted " + names.length + " limits from app.js\n");

const devices = [
  { name: "budget phone (3 GB)",   cap: true,  w: 360,  h: 800,  gb: 3 },
  { name: "modern phone (6 GB)",   cap: true,  w: 412,  h: 915,  gb: 6 },
  { name: "flagship phone (8 GB)", cap: true,  w: 448,  h: 998,  gb: 8 },
  { name: "small tablet (4 GB)",   cap: true,  w: 800,  h: 1280, gb: 4 },
  { name: "large tablet (8 GB)",   cap: true,  w: 1200, h: 1920, gb: 8 },
  { name: "tablet, GB unreported", cap: true,  w: 800,  h: 1280, gb: undefined },
  { name: "phone, GB unreported",  cap: true,  w: 360,  h: 800,  gb: undefined },
  { name: "Windows desktop",       cap: false, w: 1920, h: 1080, gb: 16 }
];

const MB = 1024 * 1024;
let bad = 0;
console.log("  device                    tablet?  previews   inflight  ready  inMemory");
for (const d of devices) {
  const win = { Capacitor: d.cap ? {} : undefined, screen: { width: d.w, height: d.h } };
  if (!d.cap) delete win.Capacitor;
  const nav = {}; if (d.gb !== undefined) nav.deviceMemory = d.gb;
  const fn = new Function("window", "navigator", "PERF", body + "return {ON_TABLET, IMG_CACHE_BYTES, IMG_INFLIGHT, FULL_CACHE_MAX, FULL_MEM_MAX};");
  const r = fn(win, nav, false);
  const previews = r.IMG_CACHE_BYTES ? (r.IMG_CACHE_BYTES / MB) + " MB" : "unlimited";
  console.log("  " + d.name.padEnd(24) + " " + String(r.ON_TABLET).padEnd(8) + " " +
    previews.padEnd(10) + " " + String(r.IMG_INFLIGHT).padEnd(9) + " " +
    String(r.FULL_CACHE_MAX).padEnd(6) + " " + r.FULL_MEM_MAX);

  /* invariants that must hold whatever the numbers are */
  if (d.cap && d.w >= 600 && !r.ON_TABLET) { console.log("     FAIL: not detected as a tablet"); bad++; }
  if (d.cap && d.w < 600 && r.ON_TABLET) { console.log("     FAIL: phone detected as a tablet"); bad++; }
  /* Desktop used to be 0 here, and 0 skips the eviction loop entirely, so every
     preview ever drawn stayed in memory until the vault was locked. A large
     library browsed for a while grew until the renderer was killed, which looks
     from the outside like the app shutting itself down and coming back. It
     needs a ceiling — well above anything ordinary use reaches, so nothing is
     evicted in practice, but not absent. */
  if (!d.cap && r.IMG_CACHE_BYTES <= 0) { console.log("     FAIL: desktop has no ceiling, so previews grow without bound"); bad++; }
  if (!d.cap && r.IMG_CACHE_BYTES < 512 * MB) { console.log("     FAIL: desktop ceiling is tight enough to evict in ordinary use"); bad++; }
  if (d.cap && r.IMG_CACHE_BYTES <= 0) { console.log("     FAIL: android needs a budget"); bad++; }
  if (r.ON_TABLET && r.FULL_CACHE_MAX <= 8) { console.log("     FAIL: tablet ready set not raised"); bad++; }
}
console.log(bad ? "\n" + bad + " FAILED" : "\nEvery device profile gets sensible limits.");
process.exit(bad ? 1 : 0);
