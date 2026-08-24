/* Every pointer that is allowed to reorder pictures must have exactly one way
   to actually do it. There are two paths and they are meant to be exclusive:

     HTML5 drag   the `draggable` attribute on the tile. Mouse only in practice,
                  and dead in the Capacitor WebView, which is why ON_CAP bars it.
     pointer drag usesPointerDrag(): finger, stylus, and mouse-on-Capacitor.

   Nothing checked that the two together cover everything. 1.204 added CAN_DRAG
   to the `draggable` attribute — it had only ever chosen the cursor since 1.201
   — and that opened a hole: on a PC that does not match
   "(hover: hover) and (pointer: fine)" (a touchscreen laptop, a 2-in-1, tablet
   mode) the attribute goes false, while usesPointerDrag still refuses a mouse
   off Capacitor. A mouse there has no path at all, which is what "dragging is
   broken on pc" meant.

   Both the attribute and usesPointerDrag are lifted out of app.js, not retyped. */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");

/* lift usesPointerDrag by name, brace-matched */
const fnStart = SRC.indexOf("function usesPointerDrag(");
if (fnStart < 0) throw new Error("could not find usesPointerDrag in app.js");
let d = 0, fnEnd = fnStart;
for (let i = SRC.indexOf("{", fnStart); i < SRC.length; i++) {
  if (SRC[i] === "{") d++;
  else if (SRC[i] === "}") { d--; if (d === 0) { fnEnd = i + 1; break; } }
}
const usesPointerDragSrc = SRC.slice(fnStart, fnEnd);

/* lift the draggable attribute expression from the tile */
const dragLine = SRC.split("\n").find(l => /^\s*draggable: !!\(onMoveImage/.test(l));
if (!dragLine) throw new Error("could not find the tile's draggable attribute in app.js");
const draggableExpr = dragLine.trim().replace(/^draggable:\s*/, "").replace(/,\s*$/, "");

console.log("lifted usesPointerDrag (" + usesPointerDragSrc.length + " chars)");
console.log("lifted draggable attribute: " + draggableExpr);
console.log("");

/* run both under a given environment */
function paths(env, pointerType) {
  const html5 = new Function("onMoveImage", "it", "CAN_DRAG", "ON_CAP",
    "return " + draggableExpr + ";")(true, { movable: true }, env.CAN_DRAG, env.ON_CAP);
  const pointer = new Function("ON_CAP",
    usesPointerDragSrc + "; return usesPointerDrag;")(env.ON_CAP)({ pointerType });
  return { html5: !!html5, pointer: !!pointer };
}

/* CAN_DRAG is "(hover: hover) and (pointer: fine)". A touchscreen PC and a
   tablet browser both report false; a plain desktop reports true. */
const CASES = [
  { name: "desktop PC, mouse",            env: { CAN_DRAG: true,  ON_CAP: false }, pointerType: "mouse" },
  { name: "touchscreen PC, mouse",        env: { CAN_DRAG: false, ON_CAP: false }, pointerType: "mouse" },
  { name: "touchscreen PC, finger",       env: { CAN_DRAG: false, ON_CAP: false }, pointerType: "touch" },
  { name: "tablet browser, stylus",       env: { CAN_DRAG: false, ON_CAP: false }, pointerType: "pen" },
  { name: "Android app, finger",          env: { CAN_DRAG: false, ON_CAP: true  }, pointerType: "touch" },
  { name: "Android app, S Pen",           env: { CAN_DRAG: false, ON_CAP: true  }, pointerType: "pen" },
  { name: "Android app, reported mouse",  env: { CAN_DRAG: false, ON_CAP: true  }, pointerType: "mouse" },
];

/* Which path each pointer is supposed to use. `draggable` is a static attribute
   and cannot know the pointer type, so it may well be true on a touch device —
   that is harmless, because touch does not start an HTML5 drag and the pointer
   path captures the pointer anyway. What matters is that the path a given
   pointer actually relies on is armed. */
function wants(c) {
  if (c.env.ON_CAP) return "pointer";                       // WebView: HTML5 drag is dead
  return c.pointerType === "mouse" ? "html5" : "pointer";   // the pointer path refuses a mouse here
}

let bad = 0;
console.log("  case                            html5   pointer   needs      verdict");
for (const c of CASES) {
  const r = paths(c.env, c.pointerType);
  const need = wants(c);
  const ok = need === "html5" ? r.html5 : r.pointer;
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + c.name.padEnd(26) +
    String(r.html5).padEnd(8) + String(r.pointer).padEnd(10) + need.padEnd(11) +
    (ok ? "ok" : "NO WAY TO DRAG"));
}

/* Capacitor must never rely on HTML5 drag: it does not work in that WebView. */
const cap = paths({ CAN_DRAG: false, ON_CAP: true }, "mouse");
if (cap.html5) { console.log("\n  FAIL  HTML5 drag is armed on Capacitor, where it does not work"); bad++; }

console.log("");
console.log(bad
  ? bad + " case(s) wrong — a pointer that may reorder has no way to do it."
  : "Every pointer that may reorder has a working path.");
process.exit(bad ? 1 : 0);
