/* What the phone build gives you to touch.

   Two things here are not taste. A grip is a promise of dragging, and HTML5
   drag does not exist in the Android WebView — that is why the picture grid
   bars `draggable` on Capacitor and carries pictures with pointer events
   instead. So on the phone build the grips beside the dashboard panels and the
   prose sections did nothing at all, and the arrows beside them, the only
   working control, were 28x24. The picture grid's size and filter chips were
   21px tall and there is no pinch to fall back on.

   The interface is asked what it is by window.Capacitor, so that is stubbed in
   a preload, which is what the Android build looks like from its side.
   Measured, not eyeballed. Needs Electron. */
const { app, BrowserWindow } = require("electron");
const path = require("path"), os = require("os"), fs = require("fs");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-touch-"));
app.setPath("userData", tmp);

// window.Capacitor has to exist before the bundle runs
const preload = path.join(tmp, "cap-preload.js");
fs.writeFileSync(preload, 'try { window.Capacitor = { isNativePlatform: () => true, Plugins: {} }; } catch (e) {}');

const px = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="80"><rect width="60" height="80" fill="#777"/></svg>').toString("base64");

let done = false;
const finish = (code, msg) => { if (done) return; done = true; if (msg) console.log(msg); app.exit(code); };
setTimeout(() => finish(2, "  timed out"), 90000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 390, height: 844,
    webPreferences: { preload, contextIsolation: false } });
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await new Promise(r => setTimeout(r, 2200));
  await win.webContents.executeJavaScript(`(async () => {
    const s = window.storage;
    for (const k of ["p","g1","g2"]) { await s.set("img:"+k, ${JSON.stringify(px)}); await s.set("th:"+k, ${JSON.stringify(px)}); }
    await s.set("chars:all", JSON.stringify([{ id:"c1", name:"Touch Subject", tags:[], searchables:[],
      profileImg:"p", banner:"", variants:[],
      gallery:[{imgId:"g1",caption:"one",album:"",variantId:""},{imgId:"g2",caption:"two",album:"",variantId:""}],
      albums:[], imgMeta:{}, history:[], story:"Words.", personality:"More words.",
      sections:[{id:"s1",title:"Alpha",content:"custom"}], createdAt:Date.now(), updatedAt:Date.now() }]));
    await s.set("personas:all","[]"); await s.set("lore:all","[]"); await s.set("prompts:all","[]");
  })()`);
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 2800));

  const r = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(x => setTimeout(x, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    const box = el => { const q = el.getBoundingClientRect(); return { w: Math.round(q.width), h: Math.round(q.height) }; };
    const out = { isCapacitor: !!window.Capacitor };

    btn(/^Dashboard$/).click(); await sleep(800);
    out.dashGripsVisible = [...document.querySelectorAll(".draghandle")].filter(g => getComputedStyle(g).display !== "none").length;
    out.dashMove = [...document.querySelectorAll(".btn-move")].map(box);

    btn(/^Characters$/).click(); await sleep(800);
    document.querySelector(".char-card").click(); await sleep(1200);
    out.pageGripsVisible = [...document.querySelectorAll(".draghandle")].filter(g => getComputedStyle(g).display !== "none").length;
    out.pageMove = [...document.querySelectorAll(".btn-move")].map(box);

    const g = btn(/^Grid$/); if (g) { g.click(); await sleep(1100); }
    out.hiddenChips = [...document.querySelectorAll("button.chip")].filter(b=>!b.getClientRects().length).map(b=>b.textContent);
    out.chips = [...document.querySelectorAll("button.chip")].filter(b=>b.getClientRects().length).map(box);
    out.sideways = document.documentElement.scrollWidth > window.innerWidth + 1;
    return out;
  })()`);

  let bad = 0;
  const check = (label, ok, detail) => { if (!ok) bad++; console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : "")); };
  const smallest = list => list.reduce((m, b) => Math.min(m, b.w, b.h), Infinity);

  console.log("  running as the phone build: " + r.isCapacitor);
  if (r.hiddenChips.length) console.log("  hidden controls excluded from touch measurements: " + r.hiddenChips.join(", "));
  console.log("");
  check("no grip is offered where dragging cannot work (dashboard)", r.dashGripsVisible === 0, "visible=" + r.dashGripsVisible);
  check("no grip is offered where dragging cannot work (sections)", r.pageGripsVisible === 0, "visible=" + r.pageGripsVisible);

  const moves = (r.dashMove || []).concat(r.pageMove || []);
  // by class, since that is what carries the touch sizing; before it existed
  // the arrows were there but nothing set them apart to size them
  check("the reorder arrows are marked for touch sizing", moves.length > 0, moves.length + " found");
  if (moves.length) check("and they meet the 48px Android target", smallest(moves) >= 48, "smallest side " + smallest(moves) + "px");

  check("the grid's chip controls exist", (r.chips || []).length > 0, (r.chips || []).length + " found");
  if ((r.chips || []).length) check("and they meet the 48px Android target", smallest(r.chips) >= 48, "smallest side " + smallest(r.chips) + "px");

  check("the page still does not scroll sideways", !r.sideways);

  console.log("");
  finish(bad ? 1 : 0, bad
    ? "  The phone build offers controls that cannot be worked with a thumb."
    : "  Everything the phone build asks you to touch can be touched.");
});
