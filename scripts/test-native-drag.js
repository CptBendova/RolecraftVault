/* Reordering a picture with a mouse, driven as a REAL drag.

   This exists because a synthetic-event test cannot see the bug it catches.
   Dispatching dragstart/dragover/drop by hand, with any pause between them,
   lets React flush its state as usual and everything passes. A real drag does
   not work that way: Chromium runs it in a nested modal loop, React's update
   never flushes inside it, and a handler that reads state set during dragstart
   sees null for the whole gesture. So dragover never called preventDefault,
   the drop was refused, and a picture could be carried but never moved.

   The fix is to keep the drag source in a ref. The check has to use real mouse
   input through the DevTools protocol, or it proves nothing.

   Needs Electron. */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
// an isolated profile: repeated runs sharing one userData dir contend on
// IndexedDB and every read comes back DOMException
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "rcv-drag-")));

const px = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="80"><rect width="60" height="80" fill="#777"/></svg>'
).toString("base64");

let done = false;
const finish = (code, msg) => { if (done) return; done = true; if (msg) console.log(msg); app.exit(code); };
setTimeout(() => finish(2, "  timed out"), 90000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1400, height: 1000 });
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await new Promise(r => setTimeout(r, 2500));

  await win.webContents.executeJavaScript(`(async () => {
    const s = window.storage;
    for (const k of ["p","b","g1","g2","g3"]) { await s.set("img:"+k, ${JSON.stringify(px)}); await s.set("th:"+k, ${JSON.stringify(px)}); }
    await s.set("chars:all", JSON.stringify([{ id:"c1", name:"Drag Subject", tags:[], searchables:[],
      profileImg:"p", banner:"b", variants:[],
      gallery:[{imgId:"g1",caption:"a",album:"",variantId:""},
               {imgId:"g2",caption:"b",album:"",variantId:""},
               {imgId:"g3",caption:"c",album:"",variantId:""}],
      albums:[], imgMeta:{}, history:[], sections:[], createdAt:Date.now(), updatedAt:Date.now() }]));
    await s.set("personas:all","[]"); await s.set("lore:all","[]"); await s.set("prompts:all","[]");
  })()`);
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 3000));

  const open = async where => await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r=>setTimeout(r,ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    const nav = btn(/^Characters$/); if (nav) { nav.click(); await sleep(1000); }
    const card = document.querySelector(".char-card") || btn(/^Open character$/);
    if (!card) return { fail: "character not reachable" };
    card.click(); await sleep(1300);
    ${where === "grid" ? `const g = btn(/^Grid$/); if (!g) return { fail: "no Grid button" }; g.click(); await sleep(1300);` : ``}
    const sel = ${where === "grid" ? `".imggrid [data-imgid]"` : `".cpage-aside .tile"`};
    const tiles = [...document.querySelectorAll(sel)];
    if (tiles.length < 3) return { fail: "not enough tiles in " + sel + " (" + tiles.length + ")" };
    const label = t => { const im = t.querySelector("img"); return t.getAttribute("data-imgid") || (im ? im.alt : "?"); };
    // drag the first movable tile onto the last one
    const movable = tiles.filter(t => t.draggable);
    const src = movable[0], dst = movable[movable.length - 1];
    const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
    return { order: tiles.map(label),
             from: { x: a.left + a.width/2, y: a.top + a.height/2 },
             to:   { x: b.left + b.width/2, y: b.top + b.height/2 },
             sel, movableCount: movable.length };
  })()`);

  const readOrder = async sel => await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(${JSON.stringify(sel)})].map(t => { const im = t.querySelector("img"); return t.getAttribute("data-imgid") || (im ? im.alt : "?"); })`);

  // a real drag: press, move in steps, release — Chromium starts a native drag
  const dbg = win.webContents.debugger;
  try { dbg.attach("1.3"); } catch (e) { return finish(2, "  could not attach the debugger: " + e.message); }
  const drag = async (from, to) => {
    const send = (m, p) => dbg.sendCommand(m, p);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: Math.round(from.x), y: Math.round(from.y), button: "left", clickCount: 1, buttons: 1 });
    for (let i = 1; i <= 12; i++) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1,
        x: Math.round(from.x + (to.x - from.x) * i / 12), y: Math.round(from.y + (to.y - from.y) * i / 12) });
      await new Promise(r => setTimeout(r, 60));
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: Math.round(to.x), y: Math.round(to.y), button: "left", clickCount: 1, buttons: 0 });
    await new Promise(r => setTimeout(r, 1500));
  };

  let bad = 0;
  for (const where of ["grid", "aside"]) {
    const info = await open(where);
    if (info.fail) { console.log("  FAIL  " + where + ": " + info.fail); bad++; continue; }
    const before = info.order;
    await drag(info.from, info.to);
    const after = await readOrder(info.sel);
    const moved = JSON.stringify(before) !== JSON.stringify(after);
    if (!moved) bad++;
    console.log("  " + (moved ? "PASS" : "FAIL") + "  " + where.padEnd(6) +
      "  " + JSON.stringify(before) + " -> " + JSON.stringify(after));
    // back to the library for the next pass
    await win.webContents.reload();
    await new Promise(r => setTimeout(r, 2600));
  }

  console.log("");
  finish(bad ? 1 : 0, bad
    ? "  A picture can be carried with the mouse but does not move."
    : "  A real mouse drag reorders in both the grid and the gallery beside the character.");
});
