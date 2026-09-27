/* Settings > Version history had grown to 246 releases, with 84 headings still
   carrying old "(private Rolecraft)" style build labels. Older releases are
   now folded into one entry per decade by scripts/fold-changelog.js. Lift the
   real CHANGELOG from app/app.js and check the shape the window and the
   "What's new" dialog rely on, then run the real folding function across a
   decade boundary to prove it keeps every note. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { fold, pairs, locate, RANGE, SINGLE } = require("./fold-changelog");

const source = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");
const appVersion = /^const APP_VERSION = "([^"]+)";$/m.exec(source)[1];
const { i, j } = locate(source);
const CHANGELOG = eval(source.slice(i, j + 1));
const versionOf = e => Number((SINGLE.exec(e.heading) || [])[1]);

assert.strictEqual(CHANGELOG[0].heading, appVersion, "What's new shows CHANGELOG[0], so it must be exactly the current version");
assert.strictEqual(new Set(CHANGELOG.map(e => e.heading)).size, CHANGELOG.length, "headings are React keys and must be unique");
assert(CHANGELOG.length <= 40, CHANGELOG.length + " entries: run `npm run fold-changelog` to fold older decades");
for (const e of CHANGELOG) {
  assert(!/private|\bChat\b|local .*build/i.test(e.heading), "stale build label in heading: " + e.heading);
  assert(Array.isArray(e.notes) && e.notes.length && e.notes.every(n => typeof n === "string" && n.trim()), "notes present for " + e.heading);
}

const keepFrom = Math.floor(Number(appVersion.split(".")[1]) / 10) * 10;
const singles = CHANGELOG.filter(e => SINGLE.test(e.heading) && !RANGE.test(e.heading));
assert(singles.every(e => versionOf(e) >= keepFrom),
  "only the current decade stays individual; run `npm run fold-changelog` (found " + singles.filter(e => versionOf(e) < keepFrom).map(e => e.heading).join(", ") + ")");

let previousTop = Infinity;
for (const e of CHANGELOG) {
  const range = RANGE.exec(e.heading);
  const top = range ? Number(range[2]) : SINGLE.test(e.heading) ? versionOf(e) : -1;
  assert(top < previousTop, "newest first: " + e.heading);
  previousTop = top;
  if (!range) continue;
  const lo = Number(range[1]), hi = Number(range[2]);
  assert(Math.floor(lo / 10) === Math.floor(hi / 10), e.heading + " spans one decade");
  let last = Infinity;
  for (const n of e.notes) {
    const m = /^1\.(\d{3}): \S/.exec(n);
    assert(m, "every folded note names its version: " + n.slice(0, 60));
    const v = Number(m[1]);
    assert(v >= lo && v <= hi && v <= last, e.heading + " notes are in range, newest first");
    last = v;
  }
}
const tail = CHANGELOG[CHANGELOG.length - 1];
assert(tail.heading === "Before 1.092" && tail.reconstructed === true, "the reconstructed pre-1.092 entry keeps its label");

// Crossing into the next decade folds the finished one and keeps every note.
const next = "1." + String(keepFrom + 10).padStart(3, "0");
const future = [{ heading: next, notes: ["A future release."] }].concat(CHANGELOG);
const folded = fold(future, next);
assert.strictEqual(folded[0].heading, next);
assert(folded.filter(e => SINGLE.test(e.heading) && !RANGE.test(e.heading)).length === 1, "only the new decade stays individual");
assert(RANGE.test(folded[1].heading), "the finished decade becomes one entry: " + folded[1].heading);
assert.deepStrictEqual(pairs(folded).sort(), pairs(future).sort(), "no note is lost or changed");
assert.deepStrictEqual(fold(folded, next), folded, "folding is idempotent");

console.log("PASS version history: " + CHANGELOG.length + " entries, current decade individual, older decades folded without losing a note");
