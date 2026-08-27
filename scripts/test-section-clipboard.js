/* Copying a section out of one record and pasting it into another.

   The awkward part is that the two halves never exist at the same time: you
   copy in one character, close it, open another, and paste. The editor holding
   the copy is unmounted in between, so anything kept in component state goes
   with it. Hence a module-level clipboard with subscribers, and hence this,
   which mounts the real SectionsField, unmounts it, mounts a fresh one over
   different sections, and pastes there.

   The other thing worth pinning down is the id. sectionOrder addresses a
   section as "sec:<id>", so a paste that reused the copied id would give two
   sections one place in the order — the same class of bug that made restores
   drop sections until 1.151.

   The component is lifted out of app.js and run for real, not reimplemented.

   Needs Electron: npx electron scripts/test-section-clipboard.js */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
// a throwaway profile: the second half writes records, and it is not going
// anywhere near a real vault
app.setPath("userData", fs.mkdtempSync(path.join(require("os").tmpdir(), "rcv-secclip-")));
app.on("window-all-closed", () => {});
const bail = setTimeout(() => { console.log("\n  timed out"); app.exit(2); }, 60000);

let bad = 0;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};

/* Lift from the clipboard block through the end of SectionsField. The body's
   opening brace is the one after the parameter list closes — matching from the
   first "{" catches the destructured props instead and stops there. */
/* Anything wrong here exits rather than throwing: an uncaught throw in an
   Electron main process does not fail fast, it sits there until the suite's
   timeout kills it, which reads as a hang rather than a failure. */
const give_up = why => { console.log("\n  " + why); process.exit(1); };

function lift() {
  const src = fs.readFileSync(path.join(ROOT, "app", "app.js"), "utf8");
  const start = src.indexOf("/* ---------- the section clipboard ---------- */");
  if (start < 0) give_up("the section clipboard block is gone from app.js");
  const fn = src.indexOf("function SectionsField(", start);
  if (fn < 0) give_up("SectionsField is gone from app.js");
  let i = src.indexOf("(", fn), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") { depth--; if (depth === 0) break; }
  }
  i = src.indexOf("{", i);
  depth = 0;
  let end = -1;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) give_up("could not find the end of SectionsField");
  return src.slice(start, end);
}

const CODE = lift();
if (!/putSectionOnClip/.test(CODE) || !/function SectionsField/.test(CODE)) {
  give_up("the lift did not pick up what it was meant to");
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 900, height: 800,
    webPreferences: { contextIsolation: false, nodeIntegration: false } });
  await win.loadURL("data:text/html,<body><div id=root></div></body>");
  const wait = ms => new Promise(r => setTimeout(r, ms));

  for (const f of ["react.production.min.js", "react-dom.production.min.js"]) {
    await win.webContents.executeJavaScript(
      fs.readFileSync(path.join(ROOT, "app", "vendor", f), "utf8") + ";0");
  }

  const out = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const { useState, useEffect } = React;
    // what SectionsField leans on, stubbed just enough to render
    let uidN = 0;
    const uid = () => "fresh-" + (++uidN);
    const Ic = p => React.createElement("i", { "data-icon": p.d });
    const icons = { trash: "trash", copy: "copy", check: "check", plus: "plus" };
    const sectionKinds = list => list.map(() => "permanent");
    const MEMORY_KIND = { permanent: { why: "always in context" } };
    const estTokens = t => Math.ceil((t || "").length / 4);
    const tokenLabel = (t) => estTokens(t) + " tokens";
    let clipWrites = [];
    // stand in for the system clipboard: execCommand is inert on a data: URL
    const nav = { clipboard: { writeText: t => { clipWrites.push(t); return Promise.resolve(); } } };

    ${CODE.replace(/\bnavigator\.clipboard\b/g, "nav.clipboard")}

    const root = ReactDOM.createRoot(document.getElementById("root"));
    let current = [], lastChange = null;
    const mount = secs => {
      current = secs;
      lastChange = null;
      root.render(React.createElement(SectionsField, {
        sections: current,
        onChange: s => { lastChange = s; }
      }));
    };
    const byLabel = l => [...document.querySelectorAll("button")]
      .find(b => b.getAttribute("aria-label") === l);
    const pasteBtn = () => [...document.querySelectorAll("button")]
      .find(b => /Paste/.test(b.textContent || ""));
    const o = {};

    // --- character one: a section to copy ---
    mount([{ id: "src-1", title: "Appearance", content: "Tall, quiet, wears grey." }]);
    await sleep(300);
    o.noPasteBeforeCopy = !pasteBtn();
    const copy = byLabel("Copy section");
    o.hasCopyButton = !!copy;
    if (copy) copy.click();
    await sleep(200);
    o.clipHolds = SECTION_CLIP.value && SECTION_CLIP.value.title;
    o.wroteSystemClipboard = clipWrites.length === 1 && /Appearance/.test(clipWrites[0]) &&
      /Tall, quiet/.test(clipWrites[0]);
    o.pasteAppearsAfterCopy = !!pasteBtn();
    o.pasteNamesIt = pasteBtn() ? /Appearance/.test(pasteBtn().textContent) : false;
    // the tick shown back at you
    o.showsCopied = !!document.querySelector('[data-icon="check"]');

    // --- close that character, open another ---
    root.render(null);
    await sleep(250);
    mount([{ id: "other-1", title: "Voice", content: "Low." }]);
    await sleep(300);
    o.survivedUnmount = !!pasteBtn();

    const p = pasteBtn();
    if (p) p.click();
    await sleep(250);
    o.pasted = Array.isArray(lastChange) ? lastChange.length : 0;
    o.keptExisting = Array.isArray(lastChange) && lastChange[0] && lastChange[0].id === "other-1";
    const added = Array.isArray(lastChange) ? lastChange[lastChange.length - 1] : null;
    o.pastedTitle = added && added.title;
    o.pastedContent = added && added.content;
    o.freshId = !!(added && added.id && added.id !== "src-1" && added.id !== "other-1");
    o.pastedId = added && added.id;

    // pasting twice must not mint the same id twice
    mount(lastChange || []);
    await sleep(250);
    const p2 = pasteBtn();
    if (p2) p2.click();
    await sleep(250);
    const ids = Array.isArray(lastChange) ? lastChange.map(x => x.id) : [];
    o.allIdsUnique = ids.length === new Set(ids).size;
    o.idsAfterTwo = ids.join(",");
    return o;
  })()`);

  console.log("\ncopying a section");
  check("there is a copy button on each section", out.hasCopyButton);
  check("nothing offers to paste until something is copied", out.noPasteBeforeCopy);
  check("copying puts the section on the clipboard", out.clipHolds === "Appearance");
  check("and on the system clipboard, so it can leave the app", out.wroteSystemClipboard);
  check("the button shows a tick back at you", out.showsCopied);

  console.log("\npasting it into another record");
  check("a paste button appears once something is copied", out.pasteAppearsAfterCopy);
  check("and it names what will be pasted", out.pasteNamesIt);
  check("the copy survives closing one editor and opening the next", out.survivedUnmount);
  check("pasting adds one section and keeps what was there", out.pasted === 2 && out.keptExisting,
    out.pasted === 2 ? "" : "got " + out.pasted + " section(s)");
  check("the title comes across", out.pastedTitle === "Appearance");
  check("the content comes across", out.pastedContent === "Tall, quiet, wears grey.");

  console.log("\nthe part sectionOrder depends on");
  check("a pasted section gets a fresh id, not the copied one", out.freshId, "id: " + out.pastedId);
  check("pasting twice does not mint the same id twice", out.allIdsUnique, out.idsAfterTwo);

  /* The character editor keeps its own sections list instead of using
     SectionsField, so everything above proves nothing about the screen the
     feature was actually asked for. This half drives the real app: copy in one
     character, close it, open another, paste, save, and read the vault back. */
  const app2 = new BrowserWindow({ show: false, width: 1400, height: 1000 });
  await app2.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(2600);
  await app2.webContents.executeJavaScript(`(async () => { const s = window.storage;
    await s.set("chars:all", JSON.stringify([
      { id: "c1", name: "Vesper", tags: [], searchables: [], profileImg: "", banner: "", variants: [],
        gallery: [], albums: [], imgMeta: {}, history: [], story: "x", personality: "y",
        sections: [{ id: "s1", title: "Appearance", content: "Tall, quiet, wears grey." }],
        createdAt: 1, updatedAt: 1 },
      { id: "c2", name: "Wren", tags: [], searchables: [], profileImg: "", banner: "", variants: [],
        gallery: [], albums: [], imgMeta: {}, history: [], story: "x", personality: "y",
        sections: [], createdAt: 1, updatedAt: 1 }]));
    await s.set("personas:all", "[]"); await s.set("lore:all", "[]"); await s.set("prompts:all", "[]"); })()`);
  await app2.webContents.reload();
  await wait(2800);

  const e2e = await app2.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    const cardNamed = n => [...document.querySelectorAll(".char-card")].find(c => (c.textContent||"").indexOf(n) >= 0);
    const paste = () => [...document.querySelectorAll("button")].find(b => /Paste/.test(b.textContent||""));
    const o = {};
    btn(/^Characters$/).click(); await sleep(1000);
    cardNamed("Vesper").click(); await sleep(1100);
    btn(/^Edit character$/).click(); await sleep(1200);
    o.noPasteYet = !paste();
    const cp = document.querySelector('[aria-label="Copy section"]');
    o.hasCopyInCharEditor = !!cp;
    if (cp) cp.click();
    await sleep(400);
    o.pasteLabel = paste() ? paste().textContent.trim() : null;
    const cancel = btn(/^Cancel$/); if (cancel) { cancel.click(); await sleep(900); }
    const close = btn(/^\\u00d7$|^Close$/); if (close) { close.click(); await sleep(800); }

    btn(/^Characters$/).click(); await sleep(900);
    const w = cardNamed("Wren"); if (w) { w.click(); await sleep(1100); }
    btn(/^Edit character$/).click(); await sleep(1200);
    o.offeredInOtherChar = !!paste();
    if (paste()) paste().click();
    await sleep(700);
    o.titles = [...document.querySelectorAll('input[placeholder^="Section title"]')].map(i => i.value);
    o.bodies = [...document.querySelectorAll('textarea[placeholder="Section content"]')].map(t => t.value);
    const save = btn(/^Save/); if (save) { save.click(); await sleep(1600); }
    const raw = await window.storage.get("chars:all");
    const all = JSON.parse(typeof raw === "string" ? raw : raw.value);
    const v = all.find(c => c.name === "Vesper"), wr = all.find(c => c.name === "Wren");
    o.vesper = (v.sections || []).map(s => s.title);
    o.wren = (wr.sections || []).map(s => ({ title: s.title, content: s.content, id: s.id }));
    o.reusedId = (wr.sections || []).some(s => s.id === "s1");
    return o;
  })()`);

  console.log("\nthe character editor, which keeps its own list");
  check("it has a copy button too", e2e.hasCopyInCharEditor);
  check("nothing offers to paste before anything is copied", e2e.noPasteYet);
  check("copying offers a paste, named after the section", !!e2e.pasteLabel && /Appearance/.test(e2e.pasteLabel),
    e2e.pasteLabel || "");
  check("the copy is still offered inside a different character", e2e.offeredInOtherChar);
  check("pasting puts the section in the editor", e2e.titles.indexOf("Appearance") >= 0,
    JSON.stringify(e2e.titles));
  check("with its text", e2e.bodies.indexOf("Tall, quiet, wears grey.") >= 0);
  check("saving keeps it", e2e.wren.length === 1 && e2e.wren[0].title === "Appearance",
    JSON.stringify(e2e.wren.map(s => s.title)));
  check("the pasted section has its own id", !e2e.reusedId, "id: " + ((e2e.wren[0] || {}).id || "none"));
  check("the character it came from is untouched", e2e.vesper.length === 1, JSON.stringify(e2e.vesper));

  /* Once something is copied the header carries two buttons, which is more than
     a phone has room for beside the description. The first attempt ran "Add
     section" clean off the side of the card, and the measurement missed it
     because it asked the button group whether it overflowed — a flex box sized
     to its own content always says no. Ask the card. A long section title is
     used here because that is what makes the paste button wide. */
  const phone = new BrowserWindow({ show: false, width: 360, height: 740 });
  await phone.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(2600);
  await phone.webContents.executeJavaScript(`(async () => { const s = window.storage;
    await s.set("chars:all", JSON.stringify([{ id: "c1", name: "Vesper", tags: [], searchables: [],
      profileImg: "", banner: "", variants: [], gallery: [], albums: [], imgMeta: {}, history: [],
      story: "x", personality: "y",
      sections: [{ id: "s1", title: "Appearance and general bearing in public", content: "Tall." }],
      createdAt: 1, updatedAt: 1 }]));
    await s.set("personas:all", "[]"); await s.set("lore:all", "[]"); await s.set("prompts:all", "[]"); })()`);
  await phone.webContents.reload();
  await wait(2900);

  const ph = await phone.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    const o = {};
    btn(/^Characters$/).click(); await sleep(1000);
    document.querySelector(".char-card").click(); await sleep(1100);
    btn(/^Edit character$/).click(); await sleep(1400);
    const cp = document.querySelector('[aria-label="Copy section"]');
    if (cp) cp.click();
    await sleep(500);
    const p = [...document.querySelectorAll("button")].find(b => /Paste/.test(b.textContent||""));
    const add = [...document.querySelectorAll("button")].find(b => /Add section/.test(b.textContent||""));
    o.label = p ? p.textContent.trim() : null;
    // the card is what has a width to escape from, not the row inside it
    const card = p ? (p.closest("div[style*='border']") || p.parentElement.parentElement) : null;
    const right = card ? card.getBoundingClientRect().right : 0;
    o.pasteInside = p ? p.getBoundingClientRect().right <= right + 0.5 : false;
    o.addInside = add ? add.getBoundingClientRect().right <= right + 0.5 : false;
    o.cardOverflows = card ? card.scrollWidth > card.clientWidth + 1 : true;
    o.pageScrollsSideways = document.body.scrollWidth > window.innerWidth + 1;
    return o;
  })()`);

  console.log("\nthe same header on a 360px phone");
  check("a long title does not make an endless button", !!ph.label && ph.label.length <= 34, ph.label || "");
  check("the paste button stays inside the card", ph.pasteInside);
  check("and does not push Add section off it", ph.addInside);
  check("the card itself does not overflow", !ph.cardOverflows);
  check("the page does not scroll sideways", !ph.pageScrollsSideways);

  clearTimeout(bail);
  console.log("");
  console.log(bad ? "  " + bad + " thing(s) wrong with copying sections between records."
                  : "  Sections copy out of one record and paste into another.");
  app.exit(bad ? 1 : 0);
});
