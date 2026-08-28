/* Recently deleted and Version history, each in a window of its own.

   Both used to be folds inside Settings. Opening either pushed everything
   below it out of reach — a month of deleting is fifty or more entries behind
   a 220px letterbox, and the changelog is well over a hundred releases. The
   fold was the whole of the fix in 1.093, and it stopped being enough.

   What matters here is not that the windows exist but that Settings stays
   short whatever is in them, that each window can be searched, and that
   Escape takes the window off without taking Settings with it. That last one
   is the trap: a modal listening in the bubble phase lets the thing underneath
   act on the same press, which is the bug test-modal-escape.js exists for.

   Driven against the real interface with sixty things in the bin.

   Needs Electron: npx electron scripts/test-settings-popups.js */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "rcv-popups-")));
app.on("window-all-closed", () => {});
const bail = setTimeout(() => { console.log("\n  timed out"); app.exit(2); }, 120000);

let bad = 0;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};

/* Anything unexpected exits rather than rejecting: an unhandled rejection in
   an Electron main process does not fail fast, it sits there until the timeout
   and reads as a hang instead of a failure. */
app.whenReady().then(async () => {
 try {
  const win = new BrowserWindow({ show: false, width: 1280, height: 900 });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(2600);
  await win.webContents.executeJavaScript(`(async () => { const s = window.storage;
    await s.set("chars:all", "[]"); await s.set("personas:all", "[]");
    await s.set("lore:all", "[]"); await s.set("prompts:all", "[]");
    const t = [];
    for (let i = 0; i < 60; i++) t.push({ tid: "t" + i, type: i % 2 ? "persona" : "character",
      deletedAt: Date.now() - i * 43200000,
      record: { id: "r" + i, name: (i === 7 ? "Findable One" : "Deleted " + i),
                sections: [], gallery: [], variants: [] } });
    await s.set("trash:all", JSON.stringify(t)); })()`);
  await win.webContents.reload();
  await wait(3000);

  const dbg = win.webContents.debugger;
  try { dbg.attach("1.3"); } catch (e) {}
  const escape = async () => {
    for (const type of ["keyDown", "char", "keyUp"]) {
      try {
        await dbg.sendCommand("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape",
          windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      } catch (e) {}
    }
    await wait(900);
  };
  const js = src => win.webContents.executeJavaScript(src);

  /* Settings now carries the same dialog semantics and accessible name as the
     windows over it, so identify it by that name rather than by missing ARIA. */
  const SETTINGS_PANEL = `[...document.querySelectorAll(".modal")].find(m => m.getAttribute("aria-label") === "Settings")`;

  /* Both the old fold and the new row are a button saying "Recently deleted",
     so this presses the same thing either way, and then asks what it did to
     Settings. That is the whole complaint: opening it used to grow Settings
     and put everything under it out of reach. */
  const openSettings = `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    btn(/^Settings$/).click(); await sleep(1400);
    const before = Math.round(${SETTINGS_PANEL}.scrollHeight);
    const rows = [...${SETTINGS_PANEL}.querySelectorAll(".filerow .fr-label")].map(e => e.textContent.trim());
    const hint = (() => { const r = [...${SETTINGS_PANEL}.querySelectorAll(".filerow")]
      .find(x => /Recently deleted/.test(x.textContent));
      return r ? r.querySelector(".fr-hint").textContent.trim() : null; })();
    const opener = [...${SETTINGS_PANEL}.querySelectorAll("button")]
      .find(b => /Recently deleted/.test(b.textContent || ""));
    if (!opener) return { noOpener: true, rows, hint, before };
    opener.click(); await sleep(1100);
    const panel = ${SETTINGS_PANEL};
    return {
      rows, hint, before,
      after: Math.round(panel.scrollHeight),
      restoresInSettings: [...panel.querySelectorAll("button")]
        .filter(b => /^Restore$/.test(b.textContent.trim())).length
    };
  })()`;

  const s1 = await js(openSettings);
  console.log("\nSettings itself, once Recently deleted is pressed");
  check("there is something to press", !s1.noOpener);
  check("both are rows now, not folds", s1.rows.indexOf("Recently deleted") >= 0 &&
    s1.rows.indexOf("Version history") >= 0, JSON.stringify(s1.rows));
  check("the row says how many are waiting", /60 items waiting/.test(s1.hint || ""), s1.hint || "");
  check("sixty in the bin does not stretch Settings", s1.after === s1.before,
    s1.before + "px before, " + s1.after + "px after");
  check("and none of the bin is listed inside Settings", s1.restoresInSettings === 0,
    s1.restoresInSettings + " Restore button(s) inside Settings");

  const dlg = label => `[...document.querySelectorAll('[role="dialog"]')].find(d => d.getAttribute("aria-label") === ${JSON.stringify(label)})`;
  // already opened by the press above
  const openBin = `(async () => {
    const d = ${dlg("Recently deleted")};
    const heads = d ? [...d.querySelectorAll("button[aria-expanded]")] : [];
    return { backs: document.querySelectorAll(".modal-back").length, found: !!d,
      groups: heads.map(b => b.textContent.replace(/[\\u25b8\\s]+/g, " ").trim()),
      disabled: heads.filter(b => b.disabled).map(b => b.textContent.replace(/[\\u25b8\\s]+/g, " ").trim()),
      restores: d ? [...d.querySelectorAll("button")].filter(b => /^Restore$/.test(b.textContent.trim())).length : 0,
      hasSearch: d ? !!d.querySelector("input") : false,
      explains: d ? [...d.querySelectorAll("div")]
        .filter(x => /removed outright/.test(x.textContent||"") && x.children.length === 0).length : 0 };
  })()`;

  const b1 = await js(openBin);
  console.log("\nthe bin, in its own window");
  check("it opens as its own window", b1.found);
  check("over Settings rather than instead of it", b1.backs === 2, b1.backs + " layer(s)");
  check("and it can be searched", b1.hasSearch);

  console.log("\nkept apart by kind");
  check("all four kinds are listed", b1.groups.length === 4, JSON.stringify(b1.groups));
  // the label and the count are separate spans, so there is no space between them
  check("characters and personas are counted", /Characters\s*30 items/.test(b1.groups[0] || "") &&
    /Personas\s*30 items/.test(b1.groups[1] || ""), (b1.groups[0] || "") + " / " + (b1.groups[1] || ""));
  /* All four can arrive now. The empty groups stay visible and disabled, but
     must not claim that lore and prompts are still deleted outright. */
  check("empty groups do not describe obsolete deletion rules", b1.explains === 0, b1.explains + " obsolete notes");
  check("empty groups cannot be opened onto nothing", b1.disabled.length === 2, JSON.stringify(b1.disabled));
  check("sixty stays folded until you ask for it", b1.restores === 0,
    b1.restores + " listed before opening anything");

  const opened = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const d = ${dlg("Recently deleted")};
    const ch = [...d.querySelectorAll("button[aria-expanded]")].find(b => /Characters/.test(b.textContent));
    ch.click(); await sleep(800);
    return { restores: [...d.querySelectorAll("button")].filter(b => /^Restore$/.test(b.textContent.trim())).length };
  })()`);
  check("opening one kind lists just that kind", opened.restores === 30,
    opened.restores + " listed");

  const searched = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const d = ${dlg("Recently deleted")};
    const box = d.querySelector("input");
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(box, "Findable"); box.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(800);
    const rows = [...d.querySelectorAll("button")].filter(b => /^Restore$/.test(b.textContent.trim())).length;
    const shows = /Findable One/.test(d.textContent);
    const openHeads = [...d.querySelectorAll("button[aria-expanded]")]
      .filter(b => b.getAttribute("aria-expanded") === "true")
      .map(b => b.textContent.replace(/[\\u25b8\\s]+/g, " ").trim());
    // put it back for the Escape check below
    set.call(box, ""); box.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(600);
    return { rows, shows, openHeads };
  })()`);
  check("searching sixty down to the one you meant", searched.rows === 1 && searched.shows,
    searched.rows + " row(s)");
  /* A match inside a folded group would be invisible, which would make the
     search worse than useless. */
  check("and it opens the kind the match is in", (searched.openHeads || []).length === 1 &&
    /Personas/.test(searched.openHeads[0] || ""), JSON.stringify(searched.openHeads));

  /* Escape has to take the window off and leave Settings standing. A modal
     listening in the bubble phase would let Settings act on the same press. */
  await escape();
  const afterEsc = await js(`({ backs: document.querySelectorAll(".modal-back").length,
    bin: !!${dlg("Recently deleted")},
    settings: !!document.querySelector(".filerow") })`);
  console.log("\nEscape, which has been got wrong here before");
  check("closes the window", !afterEsc.bin);
  check("and leaves Settings open behind it", afterEsc.settings && afterEsc.backs === 1,
    afterEsc.backs + " layer(s) left");

  const hist = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    [...document.querySelectorAll(".filerow")].find(x => /Version history/.test(x.textContent)).click();
    await sleep(1100);
    const d = ${dlg("Version history")};
    if (!d) return { found: false };
    const headings = () => [...d.querySelectorAll("button[aria-expanded]")].length;
    const before = headings();
    const box = d.querySelector("input");
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    // a phrase from a release body, not a heading: the search reads the notes
    set.call(box, "flickering"); box.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(700);
    return { found: true, backs: document.querySelectorAll(".modal-back").length,
      releases: before, afterSearch: headings(),
      stillMentions: /flicker/i.test(d.textContent) };
  })()`);
  console.log("\nversion history, in its own window");
  check("it opens as its own window over Settings", hist.found && hist.backs === 2);
  check("every release is listed", hist.releases > 40, hist.releases + " releases");
  check("searching the notes, not just the numbers", hist.afterSearch > 0 &&
    hist.afterSearch < hist.releases && hist.stillMentions,
    hist.afterSearch + " of " + hist.releases + " match 'flickering'");

  await escape();
  const afterEsc2 = await js(`({ hist: !!${dlg("Version history")},
    settings: !!document.querySelector(".filerow") })`);
  check("Escape closes it and leaves Settings", !afterEsc2.hist && afterEsc2.settings);

  clearTimeout(bail);
  console.log("");
  console.log(bad ? "  " + bad + " thing(s) wrong with the two windows."
                  : "  The bin and the version history each stand on their own.");
  app.exit(bad ? 1 : 0);
 } catch (e) {
  console.log("\n  the interface did not do what this expects: " + (e && e.message ? e.message : e));
  app.exit(1);
 }
});
