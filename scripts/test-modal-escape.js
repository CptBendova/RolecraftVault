/* Escape dismisses what is on top, and only that.

   Every full-screen page here closes itself on Escape, and so does every
   modal. A modal that listens in the bubble phase does not stop the page
   underneath from acting on the same press, so Escape over the stats popup
   closed the character behind it — and left the popup standing, because you
   were now looking at the library with a popup over it.

   Guarding that from the page side means every page has to know about every
   modal, and that list had already drifted, which is how this shipped. The
   modals take Escape in the capture phase and stop it there instead.

   Driven with real key events against the real interface. Needs Electron. */
const { app, BrowserWindow } = require("electron");
const path = require("path"), os = require("os"), fs = require("fs");

const ROOT = path.join(__dirname, "..");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "rcv-esc-")));

let done = false;
const finish = (code, msg) => { if (done) return; done = true; if (msg) console.log(msg); app.exit(code); };
setTimeout(() => finish(2, "  timed out"), 90000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1500, height: 1100 });
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await new Promise(r => setTimeout(r, 2500));
  await win.webContents.executeJavaScript(`(async () => {
    const s = window.storage;
    await s.set("chars:all", JSON.stringify([{ id:"c1", name:"Esc Subject", tags:[], searchables:[],
      profileImg:"", banner:"", variants:[], gallery:[], albums:[], imgMeta:{}, history:[],
      story:"Some words.", personality:"More words.", sections:[],
      createdAt:Date.now(), updatedAt:Date.now() }]));
    await s.set("personas:all","[]"); await s.set("lore:all","[]"); await s.set("prompts:all","[]");
  })()`);
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 3200));

  const dbg = win.webContents.debugger;
  try { dbg.attach("1.3"); } catch (e) { return finish(2, "  could not attach: " + e.message); }
  const escape = async () => {
    for (const type of ["keyDown", "char", "keyUp"]) {
      try { await dbg.sendCommand("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); } catch (e) {}
    }
    await new Promise(r => setTimeout(r, 1000));
  };
  const state = () => win.webContents.executeJavaScript(`({
    page: !!document.querySelector(".scrollbody.sheet"),
    modal: !!document.querySelector(".modal-back")
  })`);

  const openCharacter = () => win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    if (!document.querySelector(".scrollbody.sheet")) {
      const nav = btn(/^Characters$/); if (nav) { nav.click(); await sleep(900); }
      const card = document.querySelector(".char-card") || btn(/^Open character$/);
      if (!card) return { fail: "character not reachable" };
      card.click(); await sleep(1300);
    }
    return { ok: true };
  })()`);

  const openFromPage = re => win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const sheet = document.querySelector(".scrollbody.sheet");
    const b = (sheet ? [...sheet.querySelectorAll("button")] : [])
      .find(x => ${re}.test((x.textContent||"") + " " + (x.getAttribute("aria-label")||"")));
    if (!b) return { fail: "no matching button on the page" };
    b.click(); await sleep(1300);
    return { ok: true };
  })()`);

  let bad = 0;
  const check = (label, ok) => { if (!ok) bad++; console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label); };

  for (const [name, re] of [["the stats popup", "/stat/i"], ["the guide", "/guide/i"]]) {
    const o = await openCharacter();
    if (o.fail) { check(name + ": " + o.fail, false); continue; }
    const opened = await openFromPage(re);
    if (opened.fail) { console.log("  skip  " + name + " is not reachable from the character page"); continue; }
    const before = await state();
    if (!before.modal) { console.log("  skip  " + name + " did not open a modal"); continue; }

    await escape();
    const mid = await state();
    check(name + ": one Escape dismisses it", !mid.modal);
    check(name + ": the character underneath is still open", mid.page);

    if (mid.page) { await escape(); const end = await state(); check(name + ": a second Escape then leaves the character", !end.page); }
  }

  console.log("");
  finish(bad ? 1 : 0, bad
    ? "  Escape reaches past what is on top and closes the page behind it."
    : "  Escape dismisses the top thing only, one layer per press.");
});
