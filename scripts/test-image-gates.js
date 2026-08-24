/* Rule 2 says any list of a record's images comes from charImgIds/personaImgIds.
   The rule is usually discussed as a way of losing pictures from an export. It
   loses them from the interface too: the gallery aside, the Grid button and the
   "Download images" button were each gated on a list written out by hand, and
   between them they missed the banner and every variant portrait.

   A character whose only artwork hangs off a variant therefore showed no
   gallery and offered no way to download it — while the grid, which builds its
   items properly, was already listing those portraits.

   Nothing is retyped here: charImgIds and personaImgIds are lifted out of
   app.js, and every gate expression is lifted out with them. */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");

function lift(name) {
  const start = SRC.indexOf("function " + name + "(");
  if (start < 0) throw new Error("could not find " + name + " in app.js");
  let d = 0, end = start;
  for (let i = SRC.indexOf("{", start); i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (d === 0) { end = i + 1; break; } }
  }
  return SRC.slice(start, end);
}
const charImgIds = new Function(lift("charImgIds") + "; return charImgIds;")();
const personaImgIds = new Function(lift("personaImgIds") + "; return personaImgIds;")();

/* the gates, lifted from where they are written */
const asideLine = SRC.split("\n").find(l => /^\s*const hasAside = /.test(l) && /charImgIds|gallery/.test(l));
if (!asideLine) throw new Error("could not find the character hasAside gate");
const asideExpr = asideLine.trim().replace(/^const hasAside = /, "").replace(/;$/, "");
const gate = new Function("c", "charImgIds", "return " + asideExpr + ";");

const dlLine = SRC.split("\n").find(l => l.includes('" Grid")), ') && l.includes("createElement(\"button\""));
if (!dlLine) throw new Error("could not find the download-images gate");
const dlExpr = dlLine.split('" Grid")), ')[1].split(" && ")[0].trim();

console.log("hasAside gate          : " + asideExpr);
console.log("download-images gate   : " + dlExpr);
console.log("");

const CASES = [
  { name: "gallery only",            c: { gallery: [{ imgId: "g1" }] } },
  { name: "portrait only",           c: { profileImg: "p1" } },
  { name: "banner only",             c: { banner: "b1" } },
  { name: "variant portrait only",   c: { variants: [{ id: "v1", profileImg: "vp1" }] } },
  { name: "banner + variant only",   c: { banner: "b1", variants: [{ id: "v1", profileImg: "vp1" }] } },
  { name: "nothing at all",          c: {} },
  { name: "variant with no portrait", c: { variants: [{ id: "v1" }] } },
];

let bad = 0;
console.log("  case                       images  aside  verdict");
for (const t of CASES) {
  const ids = charImgIds(t.c);
  const shown = !!gate(t.c, charImgIds);
  // the gate must agree with whether the record actually owns any picture
  const ok = shown === (ids.length > 0);
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + t.name.padEnd(23) +
    String(ids.length).padEnd(8) + String(shown).padEnd(7) +
    (ok ? "ok" : shown ? "shown with no pictures" : "PICTURES UNREACHABLE"));
}

/* the download button must use the same gate, not a second hand-written one */
const usesSameGate = dlExpr === "hasAside";
console.log("");
console.log("  " + (usesSameGate ? "PASS" : "FAIL") +
  "  download-images uses the same gate as the gallery" +
  (usesSameGate ? "" : "  (found: " + dlExpr + ")"));
if (!usesSameGate) bad++;

/* personas: the gate there was already right, so this holds it that way */
const pCases = [
  { name: "avatar only", p: { avatar: "a1" }, want: true },
  { name: "gallery only", p: { gallery: [{ imgId: "g1" }] }, want: true },
  { name: "nothing", p: {}, want: false },
];
console.log("");
for (const t of pCases) {
  const ok = (personaImgIds(t.p).length > 0) === t.want;
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  persona, " + t.name);
}

/* no hand-built image list may survive where a helper exists */
console.log("");
/* The two helpers are the one place the list may be written out, so their own
   bodies are excluded by line range rather than by a pattern that would also
   excuse a copy of them somewhere else. */
const lineOf = s => SRC.slice(0, SRC.indexOf(s)).split("\n").length;
const helperFrom = lineOf("function charImgIds(");
const helperTo = lineOf("function personaImgIds(") + 4;
const handBuilt = SRC.split("\n")
  .map((l, i) => ({ l, n: i + 1 }))
  .filter(x => /\[\s*[A-Za-z_$][\w$]*\.(avatar|profileImg)\s*,/.test(x.l))
  .filter(x => x.n < helperFrom || x.n > helperTo);
if (handBuilt.length) {
  bad += handBuilt.length;
  handBuilt.forEach(x => console.log("  FAIL  line " + x.n + " builds an image list by hand: " + x.l.trim().slice(0, 70)));
} else {
  console.log("  PASS  no image list is built by hand outside the two helpers");
}

console.log("");
console.log(bad
  ? bad + " problem(s) — a record's pictures can be unreachable from the interface."
  : "Every gate agrees with the record's real picture list.");
process.exit(bad ? 1 : 0);
