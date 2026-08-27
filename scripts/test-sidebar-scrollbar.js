/* The scrollbar under the menu on a phone.

   Below 760px the menu turns into a horizontal strip and runs a couple of icons
   wider than the screen, so it scrolls. It also carried the styled 6px
   scrollbar meant for a short desktop window — and styling ::-webkit-scrollbar
   at all opts an element out of Android's overlay scrollbars, the ones that
   fade away by themselves. So the bar was drawn permanently and repainted on
   every frame of a fling, which is the flicker under the menu that gets
   reported as a flashing scrollbar while the library scrolls.

   The measurement that settles it is how much room the element sets aside for a
   scrollbar: offsetHeight - clientHeight - borders. An overlay scrollbar takes
   nothing, a drawn one takes 6px. That is checked with OverlayScrollbar turned
   on, because desktop Chromium otherwise always reserves space and could never
   show the difference.

   The desktop bar is deliberate and must survive: on a short window the menu
   scrolls vertically and a default scrollbar there is wider than the icons.

   Needs Electron: npx electron scripts/test-sidebar-scrollbar.js */
const { app, BrowserWindow } = require("electron");
// makes this Chromium behave the way the Android WebView does
app.commandLine.appendSwitch("enable-features", "OverlayScrollbar");
const path = require("path");
const os = require("os");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "rcv-sidebar-")));
app.on("window-all-closed", () => {});
const bail = setTimeout(() => { console.log("\n  timed out"); app.exit(2); }, 90000);

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

/* Room the element sets aside for its own scrollbar, on whichever axis it
   scrolls. Zero means nothing is drawn in the layout. */
const MEASURE = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const b = [...document.querySelectorAll("button")].find(x => /^Characters$/.test((x.textContent||"").trim()));
  if (b) b.click();
  await sleep(1100);
  const sb = document.querySelector(".sidebar");
  const cs = getComputedStyle(sb);
  const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
  const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
  return {
    horizontal: cs.flexDirection === "row",
    reservedY: Math.round(sb.offsetHeight - sb.clientHeight - bt - bb),
    reservedX: Math.round(sb.offsetWidth - sb.clientWidth - bl - br),
    overflowsX: Math.round(sb.scrollWidth - sb.clientWidth),
    overflowsY: Math.round(sb.scrollHeight - sb.clientHeight),
    scrollbarWidth: cs.scrollbarWidth || "(unset)",
    canStillScroll: sb.scrollWidth > sb.clientWidth + 1 || sb.scrollHeight > sb.clientHeight + 1
  };
})()`;

async function measure(w, h) {
  const win = new BrowserWindow({ show: false, width: w, height: h });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(2500);
  await win.webContents.executeJavaScript(SEED);
  await win.webContents.reload();
  await wait(2900);
  const r = await win.webContents.executeJavaScript(MEASURE);
  win.destroy();
  return r;
}

app.whenReady().then(async () => {
  const phone = await measure(360, 740);
  console.log("\na phone, where the menu is a horizontal strip");
  check("the menu really is a strip here", phone.horizontal);
  check("and it is wider than the screen, so it does scroll", phone.overflowsX > 0,
    "overflows by " + phone.overflowsX + "px");
  check("nothing is drawn under it", phone.reservedY === 0,
    phone.reservedY === 0 ? "" : "reserves " + phone.reservedY + "px for a scrollbar");
  check("it is turned off for other engines too", phone.scrollbarWidth === "none", phone.scrollbarWidth);
  check("swiping the menu still works", phone.canStillScroll);

  /* A short desktop window: the menu scrolls down its own length, and the 6px
     bar there is on purpose, because the default one is wider than the icons. */
  const desk = await measure(1280, 460);
  console.log("\na short desktop window, where the menu scrolls down its length");
  check("the menu is a column here", !desk.horizontal);
  check("it overflows, so there is something to scroll", desk.overflowsY > 0,
    "overflows by " + desk.overflowsY + "px");
  check("the narrow bar there is left alone", desk.reservedX === 6,
    "reserves " + desk.reservedX + "px");

  clearTimeout(bail);
  console.log("");
  console.log(bad ? "  " + bad + " thing(s) wrong with the menu's scrollbar."
                  : "  No bar under the menu on a phone; the desktop one is untouched.");
  app.exit(bad ? 1 : 0);
});
