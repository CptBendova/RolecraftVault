/* Settings > Version history reads like game patch notes: 33 short entries
   instead of 246 long ones. Lift the real CHANGELOG and the real
   releaseSections() renderer helper from app/app.js and check the shape the
   window and "What's new" rely on, then run the real folding function across
   a decade boundary. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { fold, locate, RANGE, SINGLE, KIND, kindOf } = require("./fold-changelog");

const source = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");
const appVersion = /^const APP_VERSION = "([^"]+)";$/m.exec(source)[1];
const { i, j } = locate(source);
const CHANGELOG = eval(source.slice(i, j + 1));
const versionOf = e => Number((SINGLE.exec(e.heading) || [])[1]);

// The shared helper both windows use to group notes by kind.
function lift(name) {
  const at = source.indexOf("function " + name + "(");
  assert(at >= 0, "missing " + name);
  let depth = 0, k = source.indexOf("{", at);
  for (; k < source.length; k++) { if (source[k] === "{") depth++; else if (source[k] === "}" && --depth === 0) break; }
  return source.slice(at, k + 1);
}
const kindsLine = /^const RELEASE_KINDS = .*;$/m.exec(source);
assert(kindsLine, "RELEASE_KINDS is defined");
const releaseSections = new Function(kindsLine[0] + "\n" + lift("releaseSections") + "\nreturn releaseSections;")();

assert.strictEqual(CHANGELOG[0].heading, appVersion, "What's new shows CHANGELOG[0], so it must be exactly the current version");
assert.strictEqual(new Set(CHANGELOG.map(e => e.heading)).size, CHANGELOG.length, "headings are React keys and must be unique");
assert(CHANGELOG.length <= 40, CHANGELOG.length + " entries: run `npm run fold-changelog` to fold older decades");
for (const e of CHANGELOG) {
  assert(!/private|\bChat\b|local .*build/i.test(e.heading), "stale build label in heading: " + e.heading);
  assert(typeof e.title === "string" && e.title.trim() && e.title.length <= 32, "short release name for " + e.heading);
  assert(Array.isArray(e.notes) && e.notes.length >= 1 && e.notes.length <= 10, e.heading + " has 1-10 notes (has " + (e.notes || []).length + ")");
  for (const n of e.notes) {
    assert(KIND.test(n), e.heading + ": every note starts with New:, Improved:, Fixed: or Note: (" + n.slice(0, 50) + ")");
    assert(n.length <= 140, e.heading + ": keep notes short (" + n.length + " chars): " + n.slice(0, 60));
  }
  const sections = releaseSections(e);
  assert.deepStrictEqual(sections.map(s => s.kind), [...new Set(sections.map(s => s.kind))], "one section per kind");
  assert.strictEqual(sections.reduce((n, s) => n + s.items.length, 0), e.notes.length, "every note is drawn");
  assert(sections.every(s => s.items.every(t => !KIND.test(t))), "the kind prefix is drawn as a heading, not repeated in the note");
}
const order = releaseSections({ notes: ["Fixed: c", "New: a", "Improved: b", "Plain"] });
assert.deepStrictEqual(order.map(s => s.kind), ["", "New", "Improved", "Fixed"], "sections run New, Improved, Fixed after unlabelled notes");

const keepFrom = Math.floor(Number(appVersion.split(".")[1]) / 10) * 10;
const singles = CHANGELOG.filter(e => SINGLE.test(e.heading));
assert(singles.every(e => versionOf(e) >= keepFrom),
  "only the current decade stays individual; run `npm run fold-changelog` (found " + singles.filter(e => versionOf(e) < keepFrom).map(e => e.heading).join(", ") + ")");
let previousTop = Infinity;
for (const e of CHANGELOG) {
  const range = RANGE.exec(e.heading);
  const top = range ? Number(range[2]) : SINGLE.test(e.heading) ? versionOf(e) : -1;
  assert(top < previousTop, "newest first: " + e.heading);
  previousTop = top;
  if (range) assert(Math.floor(Number(range[1]) / 10) === Math.floor(Number(range[2]) / 10), e.heading + " spans one decade");
}
const tail = CHANGELOG[CHANGELOG.length - 1];
assert(tail.heading === "Before 1.092" && tail.reconstructed === true, "the reconstructed pre-1.092 entry keeps its label");

// Crossing into the next decade folds the finished one into highlights.
const next = "1." + String(keepFrom + 10).padStart(3, "0");
const future = [{ heading: next, title: "Next", notes: ["New: A future release."] }].concat(CHANGELOG);
const folded = fold(future, next);
assert.strictEqual(folded[0].heading, next);
assert.strictEqual(folded.filter(e => SINGLE.test(e.heading)).length, 1, "only the new decade stays individual");
const summary = folded[1];
assert(RANGE.test(summary.heading) && summary.title === "Highlights", "the finished decade becomes one Highlights entry: " + summary.heading);
const carried = CHANGELOG.filter(e => SINGLE.test(e.heading)).flatMap(e => e.notes).filter(n => kindOf(n) !== "Note");
assert(carried.every(n => summary.notes.includes(n)), "every New, Improved and Fixed note is carried into the summary");
assert(summary.notes.every(n => kindOf(n) !== "Note"), "install notes are not carried into a decade summary");
assert.deepStrictEqual(summary.notes.map(kindOf), summary.notes.map(kindOf).slice().sort((a, b) => ["New", "Improved", "Fixed"].indexOf(a) - ["New", "Improved", "Fixed"].indexOf(b)), "summary notes run New, Improved, Fixed");
assert.deepStrictEqual(fold(folded, next), folded, "folding is idempotent");
assert.deepStrictEqual(fold(CHANGELOG, appVersion), CHANGELOG, "the shipped history is already folded");

console.log("PASS version history: " + CHANGELOG.length + " short releases, notes grouped as New, Improved and Fixed, older decades folded");
