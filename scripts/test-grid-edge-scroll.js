/* Dragging a picture near the top or bottom of the grid is supposed to scroll
   the grid, or a long gallery can only be rearranged within one screenful.
   That is the whole reason the effect exists.

   The grid view is its own scroller: position fixed, inset 0, overflowY auto.
   It renders inside CharacterPage, which is itself a fixed .scrollbody.sheet.
   So the real nesting is

     .rcv > .scrollbody              <- the library, behind everything
     .rcv > .scrollbody.sheet        <- the character page, fixed, z 50
              ...
                 .scrollbody         <- the grid, fixed, z 70   (a GRANDCHILD)

   and a selector of ".rcv > .scrollbody" cannot reach the grid at all. It
   matches the library instead, so the auto-scroll moved a page hidden behind
   two full-screen overlays while the grid itself sat still.

   This builds that nesting in a real browser and runs the selector lifted out
   of app.js against it, because the bug is entirely about what the DOM says.
   Needs Electron. */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");

/* lift the line that picks the element to scroll */
const line = SRC.split("\n").find(l => /const sc = /.test(l) && /scrollingElement/.test(l));
if (!line) throw new Error("could not find the edge-scroll element lookup in app.js");
const expr = line.trim().replace(/^const sc = /, "").replace(/;$/, "");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 800 });
  await win.loadURL("data:text/html,<!doctype html><title>t</title>");

  const r = await win.webContents.executeJavaScript(`(() => {
    document.body.innerHTML = "";
    const mk = (cls, style, parent) => {
      const d = document.createElement("div");
      d.className = cls;
      if (style) d.setAttribute("style", style);
      (parent || document.body).appendChild(d);
      return d;
    };
    const rcv     = mk("rcv", "display:flex");
    mk("sidebar", "", rcv);
    const library = mk("scrollbody", "overflow-y:auto;height:400px", rcv);
    const page    = mk("scrollbody sheet", "position:fixed;inset:0;overflow-y:auto;z-index:50", rcv);
    const inner   = mk("cpage-wrap", "", page);
    const grid    = mk("scrollbody", "position:fixed;inset:0;overflow-y:auto;z-index:70", inner);

    // tall content so each one can actually scroll
    for (const el of [library, page, grid]) mk("tall", "height:4000px", el);

    library.id = "library"; page.id = "page"; grid.id = "grid";

    const pick = scrollRef => { const sc = ${expr}; return sc ? (sc.id || sc.tagName) : "(nothing)"; };
    return {
      // the view holds a ref to its own scroller, which is what should win
      withRef:    pick({ current: grid }),
      // and what the selector alone would have found, which is the bug
      withoutRef: pick({ current: null }),
      gridIsGrandchild: grid.parentElement !== rcv,
      matchesInOrder: [...document.querySelectorAll(".rcv > .scrollbody")].map(e => e.id || e.tagName)
    };
  })()`);

  console.log("lifted from app.js: " + expr);
  console.log("");
  console.log("  the grid is a grandchild of .rcv      : " + r.gridIsGrandchild);
  console.log("  '.rcv > .scrollbody' matches, in order: " + r.matchesInOrder.join(", "));
  console.log("  with the view's own ref, scrolls      : " + r.withRef);
  console.log("  on the selector alone, would scroll   : " + r.withoutRef);
  console.log("");

  let bad = 0;
  const check = (label, ok) => { if (!ok) bad++; console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label); };
  check("the grid scrolls itself while a picture is carried", r.withRef === "grid");
  check("the selector alone cannot reach the grid, so the ref is not optional",
    r.withoutRef !== "grid" && r.gridIsGrandchild);

  console.log("");
  console.log(bad
    ? "  A long gallery can only be rearranged within one screenful."
    : "  Carrying a picture to the edge scrolls the grid it is in.");
  /* app.exit, not process.exitCode then app.quit: quit() discards the code. */
  app.exit(bad ? 1 : 0);
});
