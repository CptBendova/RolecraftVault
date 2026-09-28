#!/usr/bin/env node
/* Keep Settings > Version history short, like game patch notes.

   Every note starts with its kind: "New: ", "Improved: ", "Fixed: " or "Note: ".
   Releases from the current decade of APP_VERSION (for 1.337, 1.330 onwards)
   stay as individual entries, so "What's new" still shows exactly the newest
   release. Once a decade is finished, its releases fold into one entry headed
   "1.330–1.339": their New, Improved and Fixed notes are merged in that order
   and exact duplicates dropped. Install instructions ("Note: ") belong to one
   release, so they are not carried into a decade summary. A new folded entry
   is titled "Highlights"; trim it to the best ten notes and rename it if you
   like. The reconstructed "Before 1.092" entry is left exactly as it is.

   Idempotent. Run it after `npm run set-version` crosses into a new decade,
   then `npm run build:web`. test-changelog-folding.js enforces the result.

   Usage: npm run fold-changelog            (edits app/app.js in place) */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "app", "app.js");
const RANGE = /^1\.(\d{3})–1\.(\d{3})$/;
const SINGLE = /^1\.(\d{3})$/;
const KIND = /^(New|Improved|Fixed|Note): \S/;
const KINDS = ["New", "Improved", "Fixed", "Note"];
const label = n => "1." + String(n).padStart(3, "0");
const kindOf = note => (KIND.exec(note) || [])[1] || "";

function locate(source) {
  const start = source.indexOf("const CHANGELOG = [");
  if (start < 0 || source.indexOf("const CHANGELOG = [", start + 1) >= 0) throw new Error("CHANGELOG not found exactly once in app/app.js");
  let i = source.indexOf("[", start), depth = 0, j = i, quote = null, esc = false;
  for (; j < source.length; j++) {
    const c = source[j];
    if (quote) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "[") depth++; else if (c === "]" && --depth === 0) break;
  }
  if (source[j + 1] !== ";") throw new Error("CHANGELOG literal is not terminated as expected");
  return { i, j };
}
function fold(entries, appVersion) {
  const keepFrom = Math.floor(Number(String(appVersion).split(".")[1]) / 10) * 10;
  if (!Number.isFinite(keepFrom)) throw new Error("APP_VERSION is not a flat 1.xxx version");
  const out = [], groups = new Map();
  const groupFor = (decade, seed) => {
    if (!groups.has(decade)) {
      const g = { versions: [], title: seed && seed.title || "Highlights", notes: [] };
      groups.set(decade, g); out.push({ g });
    }
    return groups.get(decade);
  };
  for (const e of entries) {
    const range = RANGE.exec(e.heading), single = SINGLE.exec(e.heading);
    if (range) {
      const g = groupFor(Math.floor(Number(range[1]) / 10), e);
      g.versions.push(Number(range[1]), Number(range[2]));
      g.notes.push(...e.notes);
    } else if (single && Number(single[1]) < keepFrom) {
      const g = groupFor(Math.floor(Number(single[1]) / 10));
      g.versions.push(Number(single[1]));
      g.notes.push(...e.notes.filter(n => kindOf(n) !== "Note"));
    } else out.push({ e: Object.assign({}, e, { notes: e.notes.slice() }) });
  }
  return out.map(x => {
    if (x.e) return x.e;
    const lo = Math.min(...x.g.versions), hi = Math.max(...x.g.versions);
    const notes = [...new Set(x.g.notes)].sort((a, b) => KINDS.indexOf(kindOf(a)) - KINDS.indexOf(kindOf(b)));
    return { heading: lo === hi ? label(lo) : label(lo) + "–" + label(hi), title: x.g.title, notes };
  });
}
function serialize(entries) {
  return "[" + entries.map(e => {
    const lines = ["  heading: " + JSON.stringify(e.heading) + ","];
    if (e.title) lines.push("  title: " + JSON.stringify(e.title) + ",");
    if (e.reconstructed) lines.push("  reconstructed: true,");
    lines.push("  notes: [" + e.notes.map(n => JSON.stringify(n)).join(", ") + "]");
    return "{\n" + lines.join("\n") + "\n}";
  }).join(", ") + "]";
}

function run() {
  const source = fs.readFileSync(file, "utf8");
  const version = /^const APP_VERSION = "([^"]+)";$/m.exec(source);
  if (!version) throw new Error("APP_VERSION not found");
  const { i, j } = locate(source);
  const before = eval(source.slice(i, j + 1));
  const after = fold(before, version[1]);
  if (new Set(after.map(e => e.heading)).size !== after.length) throw new Error("Folding would create duplicate headings; nothing written");
  const literal = serialize(after);
  if (JSON.stringify(eval(literal)) !== JSON.stringify(after)) throw new Error("Serialization mismatch; nothing written");
  if (literal === source.slice(i, j + 1)) { console.log("Version history already folded (" + after.length + " entries)."); return; }
  fs.writeFileSync(file, source.slice(0, i) + literal + source.slice(j + 1), "utf8");
  console.log("Version history: " + before.length + " -> " + after.length + " entries.");
  const long = after.filter(e => e.notes.length > 10).map(e => e.heading);
  if (long.length) console.log("Trim these to their best ten notes: " + long.join(", "));
  console.log("Next: npm run build:web");
}

if (require.main === module) {
  try { run(); } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { fold, locate, serialize, RANGE, SINGLE, KIND, KINDS, kindOf };
