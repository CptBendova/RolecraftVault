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
  const win = new BrowserWindow({ show: false, width: 1400, height: 1400 });
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await new Promise(r => setTimeout(r, 2500));

  await win.webContents.executeJavaScript(`(async () => {
    const s = window.storage;
    for (const k of ["p","b","g1","g2","g3"]) { await s.set("img:"+k, ${JSON.stringify(px)}); await s.set("th:"+k, ${JSON.stringify(px)}); }
    await s.set("chars:all", JSON.stringify([{ id:"c1", name:"Drag Subject", tags:[], searchables:[],
      profileImg:"p", banner:"b", variants:[],
      story:"A backstory paragraph.", personality:"A personality paragraph.",
      sections:[{id:"s1",title:"Alpha",content:"first"},{id:"s2",title:"Beta",content:"second"}],
      gallery:[{imgId:"g1",caption:"a",album:"",variantId:""},
               {imgId:"g2",caption:"b",album:"",variantId:""},
               {imgId:"g3",caption:"c",album:"",variantId:""}],
      albums:[], imgMeta:{}, history:[], sections:[], createdAt:Date.now(), updatedAt:Date.now() }]));
    await s.set("personas:all","[]"); await s.set("lore:all","[]"); await s.set("prompts:all","[]");
  })()`);
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 3000));
  /* Native mouse input is focus-sensitive on hosted Windows desktops. The
     first drag can otherwise work while a later one is silently discarded. */
  win.show();
  win.focus();
  await new Promise(r => setTimeout(r, 500));

  const open = async where => await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r=>setTimeout(r,ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    const nav = btn(/^Characters$/); if (nav) { nav.click(); await sleep(1000); }
    const card = document.querySelector(".char-card") || btn(/^Open character$/);
    if (!card) return { fail: "character not reachable" };
    card.click(); await sleep(1300);
    ${where === "grid" ? `const g = btn(/^Grid$/); if (!g) return { fail: "no Grid button" }; g.click(); await sleep(1300);` : ``}
    const sel = ${where === "grid" ? `".imggrid [data-imgid]"` : where === "aside" ? `".cpage-aside .tile"` : `".card"`};
    let tiles = [...document.querySelectorAll(sel)];
    if (${JSON.stringify("sections")} === ${JSON.stringify("PLACEHOLDER")}) {}
    if (sel === ".card") {
      // only the prose cards, and only ones fully on screen: a target below the
      // fold takes the pointer out of the window and the drag cancels
      tiles = tiles.filter(c => c.querySelector(".sec-head"))
                   .filter(c => { const r = c.getBoundingClientRect(); return r.top > 0 && r.bottom < window.innerHeight - 10; });
    }
    const need = sel === ".card" ? 2 : 3;
    if (tiles.length < need) return { fail: "not enough tiles in " + sel + " (" + tiles.length + ")" };
    const label = t => {
      const h = t.querySelector && t.querySelector(".sec-head");
      if (h) return (h.textContent || "").split(String.fromCharCode(10)).join(" ").trim().slice(0, 14);
      const im = t.querySelector("img");
      return t.getAttribute("data-imgid") || (im ? im.alt : "?");
    };
    // drag the first movable tile onto the last one
    const grips = [...document.querySelectorAll(".draghandle")];
    let movable = sel === ".card" ? tiles : tiles.filter(t => t.draggable);
    if (sel === ".cpage-aside .tile") {
      /* Small virtual displays can clip the bottom of the aside. Drive only
         tiles whose centres can actually receive native pointer input. */
      movable = movable.filter(t => {
        const r = t.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = x >= 0 && x < innerWidth && y >= 0 && y < innerHeight
          ? document.elementFromPoint(x, y) : null;
        return r.width > 0 && r.height > 0 && hit && (hit === t || t.contains(hit));
      });
    }
    if (movable.length < 2) return { fail: "not enough movable in " + sel };
    // sections are dragged by their grip; tiles by themselves
    const src = sel === ".card" ? grips[0] : movable[0];
    const dst = movable[movable.length - 1];
    const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
    return { order: tiles.map(label),
             from: { x: a.left + a.width/2, y: a.top + a.height/2 },
             to:   { x: b.left + b.width/2, y: b.top + b.height/2 },
             sel, movableCount: movable.length };
  })()`);

  const readOrder = async sel => await win.webContents.executeJavaScript(
    `[...document.querySelectorAll(${JSON.stringify(sel)})]${sel === ".card" ? '.filter(c => c.querySelector(".sec-head"))' : ""}.map(t => {
       const h = t.querySelector && t.querySelector(".sec-head");
       if (h) return (h.textContent || "").split(String.fromCharCode(10)).join(" ").trim().slice(0, 14);
       const im = t.querySelector("img");
       return t.getAttribute("data-imgid") || (im ? im.alt : "?"); })`);

  // a real drag: press, move in steps, release — Chromium starts a native drag
  const dbg = win.webContents.debugger;
  try { dbg.attach("1.3"); } catch (e) { return finish(2, "  could not attach the debugger: " + e.message); }
  let midDrag = null;
  const drag = async (from, to) => {
    const send = (m, p) => dbg.sendCommand(m, p);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: Math.round(from.x), y: Math.round(from.y), button: "left", clickCount: 1, buttons: 1 });
    for (let i = 1; i <= 12; i++) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1,
        x: Math.round(from.x + (to.x - from.x) * i / 12), y: Math.round(from.y + (to.y - from.y) * i / 12) });
      await new Promise(r => setTimeout(r, 60));
      {
        const snap = await win.webContents.executeJavaScript(
        `({ dragging: document.querySelectorAll(".dragging").length,
            over: document.querySelectorAll(".drag-over").length,
            imgIsDragSource: [...document.querySelectorAll(".imggrid img, .cpage-aside img")].some(im => im.draggable) })`);
        if (!midDrag) midDrag = { dragging: 0, over: 0, imgIsDragSource: snap.imgIsDragSource, trace: [] };
        midDrag.dragging = Math.max(midDrag.dragging, snap.dragging);
        midDrag.over = Math.max(midDrag.over, snap.over);
        midDrag.trace.push(snap.dragging + "/" + snap.over);
      }
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: Math.round(to.x), y: Math.round(to.y), button: "left", clickCount: 1, buttons: 0 });
    await new Promise(r => setTimeout(r, 1500));
  };

  let bad = 0;
  for (const where of ["grid", "aside", "sections"]) {
    const info = await open(where);
    if (info.fail) { console.log("  FAIL  " + where + ": " + info.fail); bad++; continue; }
    const before = info.order;
    midDrag = null;
    await drag(info.from, info.to);
    const after = await readOrder(info.sel);
    const moved = JSON.stringify(before) !== JSON.stringify(after);
    if (!moved) bad++;
    console.log("  " + (moved ? "PASS" : "FAIL") + "  " + where.padEnd(6) +
      "  reorders   " + JSON.stringify(before) + " -> " + JSON.stringify(after));
    const md = midDrag || {};
    const carried = md.dragging === 1, target = md.over === 1, ghostOk = md.imgIsDragSource === false;
    if (!carried) bad++; if (!target) bad++; if (!ghostOk) bad++;
    console.log("  " + (carried ? "PASS" : "FAIL") + "  " + where.padEnd(6) + "  the carried picture is faded while you hold it (.dragging=" + md.dragging + ")");
    console.log("  " + (target ? "PASS" : "FAIL") + "  " + where.padEnd(6) + "  the tile it would land on is outlined (.drag-over peak=" + md.over + ")  trace " + (md.trace||[]).join(" "));
    console.log("  " + (ghostOk ? "PASS" : "FAIL") + "  " + where.padEnd(6) + "  the tile drags, not the bare img, so the ghost is not stretched");
    // back to the library for the next pass
    await win.webContents.reload();
    await new Promise(r => setTimeout(r, 2600));
  }

  console.log("");
  finish(bad ? 1 : 0, bad
    ? "  A picture can be carried with the mouse but does not move."
    : "  A real mouse drag reorders in both the grid and the gallery beside the character.");
});
