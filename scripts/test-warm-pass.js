/* The background warm used to queue every picture in the vault while only
   FULL_MEM_MAX could be kept. This runs the effect body lifted out of app.js
   against a synthetic library and checks what it actually asks for. */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8").split("\n");

const start = SRC.findIndex(l => l.includes("After unlock, pull some originals"));
if (start < 0) throw new Error("could not find the warm effect");
const open = SRC.findIndex((l, i) => i > start && l.trim() === "useEffect(() => {");
let depth = 0, end = open;
for (let i = open; i < SRC.length; i++) {
  depth += (SRC[i].match(/[({]/g) || []).length - (SRC[i].match(/[)}]/g) || []).length;
  if (depth <= 0 && i > open) { end = i; break; }
}
/* strip the useEffect wrapper, keep the body */
const whole = SRC.slice(open, end + 1).join("\n");
const body = whole.replace(/^\s*useEffect\(\(\)\s*=>\s*\{/, "").replace(/\}\s*,\s*\[[^\]]*\]\s*\)\s*;?\s*$/, "");
console.log("lifted the warm effect body (" + body.split("\n").length + " lines)\n");

function run({ nChars, picsEach, nPersonas, cap }) {
  const queued = [];
  const chars = Array.from({ length: nChars }, (_, i) => ({
    id: "c" + i, profileImg: "portrait" + i,
    gallery: Array.from({ length: picsEach }, (_, j) => ({ imgId: "c" + i + "g" + j }))
  }));
  const personas = Array.from({ length: nPersonas }, (_, i) => ({ id: "p" + i, avatar: "avatar" + i, gallery: [] }));
  const charImgIds = c => [c.profileImg].concat((c.gallery || []).map(g => g.imgId)).filter(Boolean);
  const personaImgIds = p => [p.avatar].concat((p.gallery || []).map(g => g.imgId)).filter(Boolean);
  const fn = new Function(
    "ready", "PERF", "chars", "personas", "lore", "prompts", "bucketMeta", "loreMeta", "promptMeta",
    "queueFull", "FULL_MEM_MAX", "charImgIds", "personaImgIds",
    body);
  fn(true, false, chars, personas, [], [], {}, {}, {},
     (id) => queued.push(id), cap, charImgIds, personaImgIds);
  return queued;
}

let bad = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
  if (!cond) bad++;
};

/* a big library: 400 characters with 10 pictures each is 4,400 originals */
const big = run({ nChars: 400, picsEach: 10, nPersonas: 20, cap: 64 });
check("never asks for more than it can keep", big.length <= 64, "asked for " + big.length + " of 4,400");
check("no duplicates", new Set(big).size === big.length);
check("portraits come first", big.slice(0, 64).every(id => id.startsWith("portrait")),
  "first five: " + big.slice(0, 5).join(", "));

/* a small library must still be warmed completely */
const small = run({ nChars: 3, picsEach: 2, nPersonas: 1, cap: 64 });
check("a small library is warmed in full", small.length === 3 * 3 + 1, "queued " + small.length + " of 10");

/* the phone's lower cap is respected */
const phone = run({ nChars: 400, picsEach: 10, nPersonas: 0, cap: 24 });
check("phone cap respected", phone.length <= 24, "asked for " + phone.length);

/* what the old code did, for contrast */
console.log("\n  before this change the same library queued all 4,400 originals,");
console.log("  each one decrypted twice over, to end up keeping 64.");

console.log(bad ? "\n" + bad + " FAILED" : "\nThe warm pass now asks only for what it can keep.");
process.exit(bad ? 1 : 0);
