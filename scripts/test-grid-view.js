/* The picture grid.

   Two things were wrong. Every tile carried four permanently visible controls,
   including the reorder arrows added in 1.158 for touch — where dragging does
   not work — which on a mouse is two buttons per picture for a gesture that
   already works. And the tiles were drawn from the full-size original, so a
   sixty picture gallery decoded sixty full images to show them a couple of
   hundred points wide.

   Checked in a real browser, both ways round: with a fine pointer the tick and
   the open button compute to opacity 0 until the tile is hovered and a selected
   tick stays at 1; with a coarse pointer all of them are 1 and the arrows are
   built. This asserts the parts of that which can be read from the file. */
const fs = require("fs");
const SRC = fs.readFileSync("C:/Rolecraft/rolecraft-vault/app/app.js", "utf8");

let bad = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
  if (!cond) bad++;
};

console.log("what the grid draws:\n");
check("a preview-first picker exists", /function tileOf\(fullCache, imgCache, id\)/.test(SRC));
check("it prefers the preview over the original",
  /function tileOf[\s\S]{0,160}imgCache && imgCache\[id\] \|\| fullCache && fullCache\[id\]/.test(SRC));
check("tiles use it", /src: tileOf\(fullCache, imgCache, it\.imgId\)/.test(SRC));
check("picOf is untouched for everything else",
  /function picOf[\s\S]{0,120}fullCache && fullCache\[id\] \|\| imgCache && imgCache\[id\]/.test(SRC));
check("the viewer still asks for the original",
  /requestFull\(items\[index\]\.imgId, true\)/.test(SRC));

console.log("\nwhat the grid shows:\n");
check("drag is still wired", /onDrop: e => \{[\s\S]{0,200}onMoveImage\(dragId, it\.imgId\)/.test(SRC));
check("arrows only where dragging cannot work", /onMoveImage && it\.movable && !CAN_DRAG/.test(SRC));
check("CAN_DRAG asks the pointer, not the platform",
  /CAN_DRAG[\s\S]{0,160}\(hover: hover\) and \(pointer: fine\)/.test(SRC));
check("the open button is no longer forced visible",
  !/className: "blurbtn on",\n    role: "button",\n    tabIndex: 0,\n    "aria-label": "Open "/.test(SRC));
check("the selection tick is styled by class", /className: "gridsel" \+ \(sel\[it\.imgId\] \? " on" : ""\)/.test(SRC));
check("controls hide until hovered", /\.rcv \.gridsel \{ opacity: 0;/.test(SRC));
check("a selected tick stays put", /\.rcv \.gridsel\.on \{ opacity: 1; \}|\.rcv \.gridsel\.on/.test(SRC));
check("touch keeps them visible", /@media \(hover: none\), \(pointer: coarse\)[\s\S]{0,120}opacity: 1;/.test(SRC));

console.log("\nwhat the cursor promises:\n");
/* Lifted and then run, rather than pattern-matched. A cursor that says "zoom"
   over something you are meant to pick up is how the reordering stayed hidden. */
const m = SRC.match(/cursor: onMoveImage && it\.movable && CAN_DRAG\s*\n\s*\? \(dragId === it\.imgId \? "grabbing" : "grab"\)\s*\n\s*: "zoom-in"/);
check("the tile cursor is worked out, not fixed", !!m);
if (m) {
  const expr = m[0].replace(/^cursor:\s*/, "");
  const cursor = (onMoveImage, movable, canDrag, dragging) =>
    new Function("onMoveImage", "it", "CAN_DRAG", "dragId", "return (" + expr + ");")
      (onMoveImage, { movable: movable, imgId: "x" }, canDrag, dragging ? "x" : null);
  const noop = () => {};
  check("a mouse over a picture it can move sees a hand", cursor(noop, true, true, false) === "grab");
  check("holding it closes the hand", cursor(noop, true, true, true) === "grabbing");
  check("touch keeps the magnifier, having no drag", cursor(noop, true, false, false) === "zoom-in");
  check("a picture that cannot move keeps the magnifier", cursor(noop, false, true, false) === "zoom-in");
  check("a grid that does not reorder keeps the magnifier", cursor(null, true, true, false) === "zoom-in");
}

console.log(bad ? "\n" + bad + " FAILED" : "\nThe grid draws previews, and its controls and cursor suit the pointer.");
process.exit(bad ? 1 : 0);
