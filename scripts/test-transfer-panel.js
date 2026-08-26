/* What the transfer panel tells you, on both ends of a copy.

   Two complaints, both of them the panel lying about what had happened.

   A receive writes the records straight into storage. The open window knew
   nothing about that, so the character you had just copied across was simply
   absent and the message ended "Relaunch to see them" — which reads as a
   failure, because from the library's point of view it was one.

   And a send finished by clearing the bar, which left a code, no word of
   success, and a button reading "Stop sending". Nothing on screen said the
   other device had got everything.

   window.transfer is Electron-only, so it is stubbed the way CLAUDE.md
   describes: receive writes a record exactly as the real one does, and the
   progress channel is driven by hand. Both halves are driven through the real
   panel and read back off the screen — the earlier version of this checked the
   handlers directly and passed against code that was still broken.

   Needs Electron: npx electron scripts/test-transfer-panel.js */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "rcv-xfer-test-")));
// destroying the last window quits with 0 on its own, which once let half a
// test never run and still report success
app.on("window-all-closed", () => {});
const bail = setTimeout(() => { console.log("\n  timed out driving the panel"); app.exit(2); }, 120000);

let bad = 0;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};
const group = t => console.log("\n" + t);

/* The panel refuses to act on a reply without ok:true (see the preview and
   start handlers), so a stub that leaves it out silently tests nothing. */
const STUB = `(() => {
  let progressCb = null;
  window.__emit = p => progressCb && progressCb(p);
  window.transfer = {
    canShare: true,
    status: async () => ({ ok: true, active: false, device: "This PC" }),
    onProgress: cb => { progressCb = cb; return () => {}; },
    onMirrorRequest: () => () => {},
    preview: async () => ({ ok: true, thisDevice: "This PC", added: 1, updated: 0, removed: 0, unchanged: 1 }),
    receive: async () => {
      const raw = await window.storage.get("chars:all");
      const cur = JSON.parse(typeof raw === "string" ? raw : raw.value);
      cur.push({ id: "c2", name: "Sent From Windows", tags: [], searchables: [], profileImg: "", banner: "",
        variants: [], gallery: [], albums: [], imgMeta: {}, history: [], story: "x", personality: "y",
        sections: [], createdAt: 1, updatedAt: 1 });
      await window.storage.set("chars:all", JSON.stringify(cur));
      return { ok: true, added: 1, updated: 0, removed: 0, unchanged: 1, bytes: 2048, thisDevice: "This PC" };
    },
    start: async () => ({ ok: true, code: "RC-TEST-CODE", minutesLeft: 10, device: "This PC" }),
    stop: async () => ({ ok: true }), respondMirror: () => {}
  };
  return true;
})()`;

const SEED = `(async () => { const s = window.storage;
  await s.set("chars:all", JSON.stringify([{ id: "c1", name: "Already Here", tags: [], searchables: [],
    profileImg: "", banner: "", variants: [], gallery: [], albums: [], imgMeta: {}, history: [],
    story: "x", personality: "y", sections: [], createdAt: 1, updatedAt: 1 }]));
  await s.set("personas:all", "[]"); await s.set("lore:all", "[]"); await s.set("prompts:all", "[]"); })()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 950 });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(2600);
  await win.webContents.executeJavaScript(SEED);
  await win.webContents.reload();
  await wait(2800);
  await win.webContents.executeJavaScript(STUB);

  /* Typing has to go through the browser: setting .value directly leaves React's
     own state empty and the button stays disabled. */
  await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    btn(/^Settings$/).click(); await sleep(1300);
    const box = [...document.querySelectorAll("input")].find(i => /code/i.test(i.placeholder||""));
    if (box) box.focus();
    return !!box;
  })()`);
  const dbg = win.webContents.debugger;
  try { dbg.attach("1.3"); } catch (e) {}
  await dbg.sendCommand("Input.insertText", { text: "RC-TEST-CODE" });
  await wait(600);

  const recv = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    const o = {};
    const chk = btn(/Check what would change/); o.gotPanel = !!chk;
    if (chk) { chk.click(); await sleep(1500); }
    const confirm = btn(/^Confirm/); o.gotPlan = !!confirm;
    if (confirm) { confirm.click(); await sleep(2600); }
    o.saysRelaunch = /Relaunch to see/i.test(document.body.innerText);
    o.saysCopied = /1 new/.test(document.body.innerText);
    // the panel is a modal over the library, so it has to be closed to look behind it
    const close = [...document.querySelectorAll(".modal-back button")].find(b => /^Close$/.test((b.textContent||"").trim()));
    if (close) { close.click(); await sleep(900); }
    const nav = btn(/^Characters$/); if (nav) { nav.click(); await sleep(1200); }
    o.cards = [...document.querySelectorAll(".char-card")].length;
    o.newOneVisible = /Sent From Windows/.test(document.body.innerText);
    return o;
  })()`);

  group("a vault copied onto this device");
  check("the panel offers a plan and then a confirm", recv.gotPanel && recv.gotPlan);
  check("it reports what came across", recv.saysCopied);
  check("the copied character is on screen without relaunching", recv.newOneVisible,
    recv.newOneVisible ? "" : "only " + recv.cards + " card(s) showing");
  check("and it no longer asks for a relaunch", !recv.saysRelaunch);

  await win.webContents.reload();
  await wait(2800);
  await win.webContents.executeJavaScript(STUB);

  const send = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    const labels = () => [...document.querySelectorAll(".modal-back button")].map(b => (b.textContent||"").trim());
    const done = String.fromCharCode(67,111,109,112,108,101,116,101) + " \\u2014 the other device";
    const said = () => document.body.innerText.indexOf(done) >= 0;
    const o = {};
    btn(/^Settings$/).click(); await sleep(1300);
    const share = btn(/^Share this vault$/); o.gotShare = !!share;
    if (share) { share.click(); await sleep(1200); }
    o.codeShown = /RC-TEST-CODE/.test(document.body.innerText);
    o.idle = { stop: labels().indexOf("Stop sending") >= 0, complete: said() };
    window.__emit({ phase: "sending", sent: 5e6, total: 1e7, pct: 50 });
    await sleep(700);
    o.during = { stop: labels().indexOf("Stop sending") >= 0, complete: said() };
    window.__emit({ phase: "done" });
    await sleep(900);
    o.after = { done: labels().indexOf("Done \\u2014 stop sending") >= 0, complete: said(),
                percent: /100%/.test(document.body.innerText) };
    window.__emit({ phase: "sending", sent: 1e6, total: 1e7, pct: 10 });
    await sleep(700);
    o.second = { complete: said() };
    return o;
  })()`);

  group("a vault being sent from this device");
  check("sharing starts and shows the code", send.gotShare && send.codeShown);
  check("before anyone pulls it only offers to stop", send.idle.stop && !send.idle.complete);
  check("while a device is pulling it still only offers to stop", send.during.stop && !send.during.complete);
  check("when the other device has it all, it says so", send.after.complete);
  check("and the button reads Done rather than Stop sending", send.after.done);
  check("no bare 100% is left standing in for a result", !send.after.percent);
  check("a second device pulling clears the notice again", !send.second.complete);

  clearTimeout(bail);
  console.log("");
  console.log(bad ? "  " + bad + " thing(s) the transfer panel says are wrong."
                  : "  Both ends of a transfer say what actually happened.");
  app.exit(bad ? 1 : 0);
});
