/* Drawn scrollbars on a phone, and the panel that overflowed because of one.

   Styling ::-webkit-scrollbar at all opts an element out of Android's overlay
   scrollbars, the ones that fade away by themselves and take no room. A styled
   bar is drawn permanently and repainted on every frame of a fling, which is
   what gets reported as a flickering line. Three elements carried one below
   760px:

   - the menu, which becomes a horizontal strip and runs wider than the screen.
     Its bar sat under the icons and flickered while the library scrolled.
   - the library column, where the bar was not even doing anything: the page is
     what scrolls there, the column runs to its full height, and it still set
     aside 10px for a scrollbar with nothing to move.
   - a panel over the library. Losing those 10px is what pushed the theme row
     past the edge, so CharSnap sat off-screen with nothing to say it was there.
     The row wraps now, and the panel no longer scrolls sideways at all.

   The measurement that settles it is the room an element sets aside for its own
   scrollbar: offsetHeight/Width minus clientHeight/Width minus borders. An
   overlay bar takes none, a drawn one takes its width. It has to run with
   OverlayScrollbar switched on, or this Chromium always reserves space and the
   difference cannot be seen. Comparing screenshots during a scroll proves
   nothing — the content underneath is moving too.

   None of this touches a desktop, where these bars are deliberate and are
   asserted here to still be there.

   Needs Electron: npx electron scripts/test-phone-scrollbars.js */
const { app, BrowserWindow } = require("electron");
// makes this Chromium behave the way the Android WebView does
app.commandLine.appendSwitch("enable-features", "OverlayScrollbar");
const path = require("path");
const os = require("os");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "rcv-scrollbars-")));
app.on("window-all-closed", () => {});
const bail = setTimeout(() => { console.log("\n  timed out"); app.exit(2); }, 120000);

let bad = 0;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};

const SEED = `(async () => { const s = window.storage;
  const cs = [];
  for (let i = 0; i < 24; i++) cs.push({ id: "c" + i, name: "Character " + i, tags: [], searchables: [],
    profileImg: "", banner: "", variants: [], gallery: [], albums: [], imgMeta: {}, history: [],
    story: "x", personality: "y", sections: [], createdAt: 1, updatedAt: 1 });
  await s.set("chars:all", JSON.stringify(cs));
  await s.set("personas:all", "[]"); await s.set("lore:all", "[]"); await s.set("prompts:all", "[]"); })()`;

const LOOK = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
  /* Room set aside for the element's own scrollbar. Zero means nothing is
     drawn into the layout. */
  const room = el => {
    if (!el) return null;
    const c = getComputedStyle(el);
    const bt = parseFloat(c.borderTopWidth) || 0, bb = parseFloat(c.borderBottomWidth) || 0;
    const bl = parseFloat(c.borderLeftWidth) || 0, br = parseFloat(c.borderRightWidth) || 0;
    return {
      reservedY: Math.round(el.offsetHeight - el.clientHeight - bt - bb),
      reservedX: Math.round(el.offsetWidth - el.clientWidth - bl - br),
      overflowsX: Math.round(el.scrollWidth - el.clientWidth),
      overflowsY: Math.round(el.scrollHeight - el.clientHeight),
      scrollbarWidth: c.scrollbarWidth || "(unset)",
      flexRow: c.flexDirection === "row"
    };
  };
  const o = {};
  btn(/^Characters$/).click(); await sleep(1200);
  o.menu = room(document.querySelector(".sidebar"));
  o.column = room(document.querySelector(".rcv > .scrollbody"));
  const sb = document.querySelector(".sidebar");
  o.menuCanStillScroll = sb.scrollWidth > sb.clientWidth + 1;

  btn(/^Settings$/).click(); await sleep(1500);
  const m = document.querySelector(".modal");
  o.panel = room(m);
  /* The point of the wrap: every choice in those rows has to be inside the
     panel, not sitting off the edge of it. */
  const edge = m.getBoundingClientRect().right - (parseFloat(getComputedStyle(m).paddingRight) || 0);
  const named = re => [...m.querySelectorAll("button")].filter(b => re.test((b.textContent||"").trim()));
  const outside = named(/^(Light|Dark|CharSnap|Normal|Higher|Maximum)$/)
    .filter(b => b.getBoundingClientRect().right > edge + 1)
    .map(b => (b.textContent||"").trim());
  o.optionsOffTheEdge = outside;
  o.optionsFound = named(/^(Light|Dark|CharSnap|Normal|Higher|Maximum)$/).length;
  return o;
})()`;

async function at(w, h) {
  const win = new BrowserWindow({ show: false, width: w, height: h });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(2500);
  await win.webContents.executeJavaScript(SEED);
  await win.webContents.reload();
  await wait(2900);
  const r = await win.webContents.executeJavaScript(LOOK);
  win.destroy();
  return r;
}

app.whenReady().then(async () => {
  const p = await at(360, 740);
  console.log("\na phone: nothing should draw a bar");
  check("the menu is a horizontal strip here", p.menu.flexRow);
  check("no bar under the menu", p.menu.reservedY === 0,
    p.menu.reservedY === 0 ? "" : "reserves " + p.menu.reservedY + "px");
  check("swiping the menu still works", p.menuCanStillScroll);
  check("no bar down the library column", p.column.reservedX === 0,
    p.column.reservedX === 0 ? "" : "reserves " + p.column.reservedX + "px");
  check("and none down a panel", p.panel.reservedX === 0,
    p.panel.reservedX === 0 ? "" : "reserves " + p.panel.reservedX + "px");
  check("turned off for other engines too", p.menu.scrollbarWidth === "none" &&
    p.column.scrollbarWidth === "none" && p.panel.scrollbarWidth === "none");

  console.log("\nthe panel that the bar was pushing out of shape");
  check("all six choices are on screen", p.optionsFound === 6, "found " + p.optionsFound);
  check("none of them sits off the edge", p.optionsOffTheEdge.length === 0,
    p.optionsOffTheEdge.join(", "));
  check("the panel does not scroll sideways at all", p.panel.overflowsX === 0,
    "overflows by " + p.panel.overflowsX + "px");

  const d = await at(1280, 800);
  console.log("\na desktop, where these bars are meant to be there");
  check("the menu runs down the side", !d.menu.flexRow);
  check("the library column still scrolls", d.column.overflowsY > 0,
    "by " + d.column.overflowsY + "px");
  check("and keeps its bar", d.column.reservedX === 10, "reserves " + d.column.reservedX + "px");
  check("the panel keeps its bar", d.panel.reservedX === 10, "reserves " + d.panel.reservedX + "px");
  check("nothing was turned off there", d.column.scrollbarWidth !== "none");

  clearTimeout(bail);
  console.log("");
  console.log(bad ? "  " + bad + " thing(s) wrong with scrollbars on a phone."
                  : "  No drawn scrollbars on a phone; the desktop ones are untouched.");
  app.exit(bad ? 1 : 0);
});
