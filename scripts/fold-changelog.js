#!/usr/bin/env node
/* Keep Settings > Version history short.

   Releases from the current decade of APP_VERSION (for 1.337, 1.330 onwards)
   stay as individual entries, so "What's new" still shows exactly the newest
   release. Every older release is folded into one entry per decade, headed
   "1.320–1.329", with each note prefixed by the version it shipped in, so the
   window's search still finds both the words and the version number. The
   reconstructed "Before 1.092" entry is left exactly as it is.

   Idempotent: run it after `npm run set-version` crosses into a new decade.
   It refuses to write unless every (version, note) pair survives unchanged.

   Usage: npm run fold-changelog            (edits app/app.js in place) */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "app", "app.js");
const RANGE = /^1\.(\d{3})–1\.(\d{3})$/;
const SINGLE = /^1\.(\d{3})\b/;
const label = n => "1." + String(n).padStart(3, "0");

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
/* (version, note) pairs, reading version prefixes out of folded entries. */
function pairs(entries) {
  return entries.flatMap(e => (e.notes || []).map(n => {
    const range = RANGE.exec(e.heading), single = SINGLE.exec(e.heading);
    if (range) {
      const m = /^1\.(\d{3}): ([\s\S]*)$/.exec(n);
      if (!m) throw new Error("A note in " + e.heading + " has no version prefix");
      return Number(m[1]) + "\u0000" + m[2];
    }
    return (single ? Number(single[1]) : e.heading) + "\u0000" + n;
  }));
}
function fold(entries, appVersion) {
  const keepFrom = Math.floor(Number(String(appVersion).split(".")[1]) / 10) * 10;
  if (!Number.isFinite(keepFrom)) throw new Error("APP_VERSION is not a flat 1.xxx version");
  const out = [], groups = new Map();
  const groupFor = decade => {
    if (!groups.has(decade)) { const g = { versions: [], notes: [] }; groups.set(decade, g); out.push({ g }); }
    return groups.get(decade);
  };
  for (const e of entries) {
    const range = RANGE.exec(e.heading), single = SINGLE.exec(e.heading);
    if (range) {
      const g = groupFor(Math.floor(Number(range[1]) / 10));
      for (const n of e.notes) { const v = Number(/^1\.(\d{3}):/.exec(n)[1]); g.versions.push(v); g.notes.push(n); }
    } else if (single) {
      const v = Number(single[1]);
      if (v >= keepFrom) out.push({ e: { heading: label(v), notes: e.notes.slice() } });
      else { const g = groupFor(Math.floor(v / 10)); g.versions.push(v); for (const n of e.notes) g.notes.push(label(v) + ": " + n); }
    } else out.push({ e });                               // "Before 1.092" and anything unrecognised
  }
  return out.map(x => {
    if (x.e) return x.e;
    const lo = Math.min(...x.g.versions), hi = Math.max(...x.g.versions);
    return { heading: lo === hi ? label(lo) : label(lo) + "–" + label(hi), notes: x.g.notes };
  });
}
function serialize(entries) {
  return "[" + entries.map(e => {
    const lines = ["  heading: " + JSON.stringify(e.heading) + ","];
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
  const a = pairs(before).sort(), b = pairs(after).sort();
  if (a.length !== b.length || a.some((x, k) => x !== b[k])) throw new Error("Folding would change a release note; nothing written");
  if (new Set(after.map(e => e.heading)).size !== after.length) throw new Error("Folding would create duplicate headings; nothing written");
  const literal = serialize(after);
  if (JSON.stringify(eval(literal)) !== JSON.stringify(after)) throw new Error("Serialization mismatch; nothing written");
  if (literal === source.slice(i, j + 1)) { console.log("Version history already folded (" + after.length + " entries)."); return; }
  fs.writeFileSync(file, source.slice(0, i) + literal + source.slice(j + 1), "utf8");
  console.log("Version history: " + before.length + " -> " + after.length + " entries, " + a.length + " notes kept.");
  console.log("Next: npm run build:web");
}

if (require.main === module) {
  try { run(); } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { fold, pairs, locate, RANGE, SINGLE };
