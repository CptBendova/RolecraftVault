/* The picture grid.

   Two things were wrong. Every tile carried four permanently visible controls,
   including the reorder arrows added in 1.158 for touch — where dragging does
   not work — which on a mouse is two buttons per picture for a gesture that
   already works. And the tiles were drawn from the full-size original, so a
   sixty picture gallery decoded sixty full images to show them a couple of
   hundred points wide.

   Checked in a real browser, both ways round: with a fine pointer the tick and
   the open button compute to opacity 0 until the tile is hovered and a selected
   tick stays at 1; with a coarse pointer all of them are 1. The arrows are gone
   from both, since touch can drag now too. This asserts the parts of that which
   can be read from the file. */
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
check("the viewer can zoom", /pinch\.current/.test(SRC) && /lastTap\.current/.test(SRC));
check("phone hides the side arrows", /\.rcv\.phone \.lb-side/.test(SRC));
check("grid tile size is an option", /rcv-gridsize/.test(SRC) && /GRID_TILE\[tileSize\]/.test(SRC));
check("grid tiles keep the picture's aspect ratio", /function fitTileAspect/.test(SRC) && /className: "imggrid"/.test(SRC));
check("grid pictures are not cropped to a square", /\.rcv \.imggrid \.tile img[\s\S]{0,80}object-fit: contain/.test(SRC));

console.log("\nwhat the grid shows:\n");
check("drag is still wired", /onDrop: e => \{[\s\S]{0,200}onMoveImage\(dragId, it\.imgId\)/.test(SRC));
/* The reorder arrows are gone entirely. They existed only because touch had no
   drag; now it has one, on every pointer, so there is nothing left for them to
   do and they were two permanent buttons on every picture. */
check("no reorder arrows anywhere", !/movebtn/.test(SRC));
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

console.log("\ndragging with a thumb:\n");
check("tiles can be found from a point", /"data-imgid": it\.imgId/.test(SRC));
/* One finger on a picture always means move it, so there is nothing to guess
   and nothing to wait for. Scrolling is two fingers, the background, or
   carrying a picture to the edge. Every earlier attempt guessed, and every
   guess needed time or direction to make — which is what felt like hesitation. */
check("a picture is picked up the instant the finger moves",
  /if \(Math\.abs\(e\.clientX - from\.x\) > 4 \|\| Math\.abs\(e\.clientY - from\.y\) > 4\)/.test(SRC)
  && /liftIt\(it\.imgId\)/.test(SRC)
  && !/holdTimer\.current = setTimeout/.test(SRC));
check("nothing waits on a timer any more", !/holdTimer\.current = setTimeout/.test(SRC));
check("the tile answers the moment it is touched",
  /setPressId\(it\.imgId\)/.test(SRC) && /thumb-press/.test(SRC));
check("a second finger stands the drag down", /A second finger while one is already down/.test(SRC));
check("one finger is refused a scroll, two are not", /if \(e\.touches && e\.touches\.length > 1\) return;/.test(SRC));
check("the refusal is armed from first touch, not from the lift",
  /el\.addEventListener\("touchmove", refuse, \{ passive: false \}\)/.test(SRC));
check("only touch takes this path", /if \(e\.pointerType !== "touch"/.test(SRC));
check("the page is held still while carrying",
  /document\.addEventListener\("touchmove", stop, \{ passive: false \}\)/.test(SRC));
check("and released again afterwards",
  /document\.removeEventListener\("touchmove", stop\)/.test(SRC));
check("a long grid scrolls as you near the edge", /edge = t\.clientY < 90 \? -12/.test(SRC));
check("the drop lands on whatever is under the finger", /const over = tileUnder\(e\.clientX, e\.clientY\) \|\| overId/.test(SRC));
check("a carry does not also open the picture", /onClick: \(\) => \{ if \(!thumbDrag\) setLb\(i\); \}/.test(SRC));
check("the carried tile is marked", /thumbDrag && dragId === it\.imgId \? " thumb-held"/.test(SRC));

/* Driven for real in a touch-emulated browser against a seeded six picture
   gallery, which is the only way to prove the gesture rather than its parts:

     one finger, first move  ->  lifts at once; g2 onto g3 turned
                                 g1,g2,g3,g4,g5,g6 into g1,g3,g2,g4,g5,g6
     touch, before moving    ->  the tile answers, and lets go on release
     a second finger         ->  the picture is put back, order untouched
     a tap                   ->  still opens the picture

   To repeat it: serve web/, open it with a mobile viewport, seed a character
   through window.storage, then dispatch PointerEvents with pointerType "touch"
   — pointerdown, pointermove, pointerup, with no waiting anywhere.

   Two things cost time before they were understood. A character's portrait
   appears in the grid but is not movable, so a test that grabs the first tile
   grabs the one picture that cannot move. And at 375 points the grid is a
   single column, so a drop target more than one tile away is off screen, where
   elementFromPoint returns nothing and the drop silently does nothing: scroll
   the two tiles into view first. */

console.log(bad ? "\n" + bad + " FAILED" : "\nThe grid draws previews, and its controls, cursor and dragging suit the pointer.");
process.exit(bad ? 1 : 0);
