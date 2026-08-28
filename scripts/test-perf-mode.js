/* Performance mode.

   The behaviour was checked in a real renderer: with "performance" stored, the
   root carries the perf class, the ambient layer and dust canvas are not built,
   backdrop-filter computes to none, and the browser reports no element with a
   running animation. Switching back restores all four.

   That needs a browser. This is the part that can run anywhere: the first-run
   detection is lifted and exercised, and every gate the behaviour depends on is
   asserted to still exist. A gate quietly deleted is the way this breaks. */
const fs = require("fs");

const SRC = fs.readFileSync(require("path").join(__dirname, "..", "app", "app.js"), "utf8");
let bad = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
  if (!cond) bad++;
};

/* ---- the first-run guess ---- */
const i = SRC.indexOf("function detectPerfMode");
if (i < 0) throw new Error("detectPerfMode is gone");
let depth = 0, end = i;
for (let k = SRC.indexOf("{", i); k < SRC.length; k++) {
  if (SRC[k] === "{") depth++;
  else if (SRC[k] === "}") { depth--; if (depth === 0) { end = k + 1; break; } }
}
const lifted = SRC.slice(i, end);

console.log("first-run detection, lifted from app.js:\n");
const cases = [
  ["8 GB, 16 cores", { deviceMemory: 8, hardwareConcurrency: 16 }, false, "quality"],
  ["4 GB, 8 cores", { deviceMemory: 4, hardwareConcurrency: 8 }, false, "performance"],
  ["16 GB, 4 cores", { deviceMemory: 16, hardwareConcurrency: 4 }, false, "performance"],
  ["2 GB, 2 cores", { deviceMemory: 2, hardwareConcurrency: 2 }, false, "performance"],
  ["nothing reported", {}, false, "quality"],
  ["capable, reduced motion", { deviceMemory: 32, hardwareConcurrency: 24 }, true, "performance"]
];
for (const [name, nav, reduce, want] of cases) {
  const fn = new Function("navigator", "window", lifted + " return detectPerfMode();");
  const got = fn(nav, { matchMedia: () => ({ matches: reduce }) });
  check(name.padEnd(24) + " -> " + got, got === want, got === want ? "" : "expected " + want);
}

/* ---- the gates ---- */
console.log("\nevery gate performance mode depends on:\n");
const gates = [
  ["root sets the flag before children render", /PERF = perfMode === "performance";/],
  ["root carries the perf class", /\(PERF \? " perf" : ""\)/],
  ["flag initialised at module scope, not on first render", /let PERF = \(\(\) =>/],
  ["setting stored beside the theme", /localStorage\.setItem\("rcv-perfmode", m\)/],
  ["CSS stills every animation and transition", /\.rcv\.perf \*, \.rcv\.perf \*::before[\s\S]{0,120}animation: none !important/],
  ["CSS drops backdrop-filter", /\.rcv\.perf \.modal-back[^\n]*backdrop-filter: none !important/],
  ["ambient layer is not built", /if \(reduce \|\| PERF\) return null;/],
  ["crest video is not decoded", /!failed && !PERF\)/],
  ["lock screen dust is not built", /!PERF && \/\*#__PURE__\*\/React\.createElement\(DustField/],
  ["fewer pictures read at once", /IMG_INFLIGHT = PERF \? 2/],
  ["fewer originals held", /FULL_CACHE_MAX = PERF \? 6/],
  ["previews budgeted", /IMG_CACHE_BYTES = PERF/],
  ["no reading ahead", /if \(!ready \|\| PERF\) return;/],
  ["Dashboard previews are prioritised in every mode", /const dashboardImages = dashboardImagePriority\(spotlight, wallVisible\);[\s\S]{0,160}loadImagesFirst\(dashboardImages,/],
  ["only visible Spotlight may bypass a missing preview", /loadImagesFirst\(dashboardImages, spotlight && spotlight\.profileImg/],
  ["Performance skips only the full Spotlight original", /if \(!PERF && spotlight/],
  ["the setting is offered", /\[\["quality", "Quality"\], \["performance", "Performance"\]\]/]
];
for (const [name, re] of gates) check(name, re.test(SRC));

console.log(bad ? "\n" + bad + " FAILED" : "\nEvery gate is in place and the guess behaves.");
process.exit(bad ? 1 : 0);
