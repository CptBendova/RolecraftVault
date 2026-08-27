/* Overwriting a character with a JSON import is a deletion, and it was the one
   that could not be undone.

   Everything else that removes a record puts it in the bin for thirty days,
   pictures and all. Import was replacing the record where it stood and calling
   dropImage on its pictures on the spot: the old version was gone the instant
   you pressed Overwrite, with nothing anywhere to put it back from. Choosing
   "overwrite" over "import as a copy" is exactly the moment you might want it
   back.

   Two things are checked, because the second is what makes the first worth
   anything: the old record reaches the bin, and its pictures are still there
   afterwards, so restoring brings it back whole rather than blank.

   Driven through the real import, dupe prompt and all. The file input's own
   click is neutered first, or it opens the operating system's file dialog and
   the run sits there.

   Needs Electron: npx electron scripts/test-import-overwrite.js */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "rcv-import-")));
app.on("window-all-closed", () => {});
const bail = setTimeout(() => { console.log("\n  timed out"); app.exit(2); }, 120000);

let bad = 0;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};

// a 1px png, enough to be a real stored image
const PIX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

app.whenReady().then(async () => {
 try {
  const win = new BrowserWindow({ show: false, width: 1400, height: 1000 });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(2600);
  await win.webContents.executeJavaScript(`(async () => { const s = window.storage;
    await s.set("img:old-portrait", ${JSON.stringify(PIX)});
    await s.set("th:old-portrait", ${JSON.stringify(PIX)});
    await s.set("img:old-gallery", ${JSON.stringify(PIX)});
    await s.set("th:old-gallery", ${JSON.stringify(PIX)});
    await s.set("chars:all", JSON.stringify([{ id: "c1", name: "Marisol",
      tags: [], searchables: [], profileImg: "old-portrait", banner: "",
      variants: [], gallery: [{ imgId: "old-gallery", caption: "", album: "", variantId: "" }],
      albums: [], imgMeta: {}, history: [],
      story: "The version that was here first.", personality: "Original.",
      sections: [], createdAt: 1, updatedAt: 1 }]));
    await s.set("personas:all", "[]"); await s.set("lore:all", "[]");
    await s.set("prompts:all", "[]"); await s.set("trash:all", "[]"); })()`);
  await win.webContents.reload();
  await wait(3000);

  const js = src => win.webContents.executeJavaScript(src);

  const INCOMING = {
    name: "Marisol",
    story: "The version that replaced it.",
    personality: "Replacement.",
    tags: [], gallery: [], variants: []
  };

  const ran = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    const o = {};
    // Import / Export lives on the library screen, not in the side menu
    const toChars = btn(/^Characters$/);
    if (toChars) { toChars.click(); await sleep(1100); }
    const nav = [...document.querySelectorAll("button")]
      .find(b => /Import\\s*\\/\\s*Export/.test((b.textContent||"").trim()));
    o.foundPanel = !!nav;
    if (nav) { nav.click(); await sleep(1300); }
    const imp = [...document.querySelectorAll("button")].find(b => /Import JSON/.test(b.textContent||""));
    o.foundImport = !!imp;
    if (!imp) return o;
    /* The picker opens the operating system's dialog, which nothing here can
       answer. Take its click away and feed the input directly instead. */
    const input = document.querySelector('input[accept*="json"]');
    o.foundInput = !!input;
    if (!input) return o;
    input.click = () => {};
    imp.click();
    await sleep(400);
    const file = new File([JSON.stringify(${JSON.stringify(INCOMING)})], "marisol.json", { type: "application/json" });
    const dt = new DataTransfer(); dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(1600);
    // the duplicate prompt: Overwrite asks twice before it does it
    const over = () => [...document.querySelectorAll("button")]
      .find(b => /^(Overwrite existing|Yes, overwrite)/.test((b.textContent||"").trim()));
    o.askedAboutDuplicate = !!over();
    if (over()) { over().click(); await sleep(500); }
    if (over()) { over().click(); await sleep(2000); }
    return o;
  })()`);

  console.log("\ngetting there");
  check("the import panel is reachable", ran.foundPanel);
  check("with an Import JSON button", ran.foundImport);
  check("and a file input to feed", ran.foundInput);
  check("importing a same-named character asks what to do", ran.askedAboutDuplicate);

  const after = await js(`(async () => {
    /* A missing key throws rather than coming back empty, and "the picture is
       gone" is the very thing being measured — so it has to be an answer here,
       not an exception that stops the run. */
    const g = async k => {
      try { const r = await window.storage.get(k); return typeof r === "string" ? r : (r && r.value); }
      catch (e) { return null; }
    };
    const chars = JSON.parse(await g("chars:all"));
    const trash = JSON.parse(await g("trash:all"));
    return {
      liveCount: chars.length,
      liveStory: (chars[0] || {}).story,
      liveName: (chars[0] || {}).name,
      trashCount: trash.length,
      binned: (trash[0] || {}).record ? {
        name: trash[0].record.name, story: trash[0].record.story,
        profileImg: trash[0].record.profileImg,
        gallery: (trash[0].record.gallery || []).map(x => x.imgId)
      } : null,
      binnedType: (trash[0] || {}).type,
      // the pictures the binned record points at must still be in storage
      portraitKept: !!(await g("img:old-portrait")),
      galleryKept: !!(await g("img:old-gallery")),
      thumbKept: !!(await g("th:old-portrait"))
    };
  })()`);

  console.log("\nwhat the overwrite did");
  check("the imported version is the live one", after.liveCount === 1 &&
    after.liveStory === "The version that replaced it.", after.liveStory || "");
  check("the one it replaced is in the bin", after.trashCount === 1 &&
    after.binned && after.binned.story === "The version that was here first.",
    after.trashCount + " in the bin");
  check("filed as a character", after.binnedType === "character", after.binnedType || "");
  check("under its own name", after.binned && after.binned.name === "Marisol");

  console.log("\nand it can actually be put back");
  check("its portrait was not thrown away", after.portraitKept);
  check("nor its gallery picture", after.galleryKept);
  check("nor the thumbnail", after.thumbKept);
  check("the binned record still points at them", after.binned &&
    after.binned.profileImg === "old-portrait" &&
    after.binned.gallery.join() === "old-gallery",
    after.binned ? after.binned.profileImg + " / " + after.binned.gallery.join() : "");

  const restored = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    btn(/^Settings$/).click(); await sleep(1400);
    const row = [...document.querySelectorAll(".filerow")].find(x => /Recently deleted/.test(x.textContent));
    if (!row) return { noRow: true };
    row.click(); await sleep(1100);
    const d = [...document.querySelectorAll('[role="dialog"]')]
      .find(x => x.getAttribute("aria-label") === "Recently deleted");
    if (!d) return { noDialog: true };
    const r = [...d.querySelectorAll("button")].find(b => /^Restore$/.test(b.textContent.trim()));
    if (!r) return { noRestore: true };
    r.click(); await sleep(1800);
    const raw = await window.storage.get("chars:all");
    const chars = JSON.parse(typeof raw === "string" ? raw : raw.value);
    return {
      count: chars.length,
      stories: chars.map(c => c.story),
      portraits: chars.map(c => c.profileImg)
    };
  })()`);

  console.log("\nrestoring it from the bin");
  check("it comes back beside the imported one", restored.count === 2,
    JSON.stringify(restored.stories || restored));
  check("with the writing it had", (restored.stories || []).indexOf("The version that was here first.") >= 0);
  check("and its portrait", (restored.portraits || []).indexOf("old-portrait") >= 0,
    JSON.stringify(restored.portraits || []));

  /* Now that the bin holds the pictures rather than the import throwing them
     away, emptying the bin is what removes them — and it must only remove the
     ones nothing else is holding. A character import remaps every image id, so
     it cannot produce a collision itself, but a restored backup writes the ids
     the file carries and can land on one a binned record is still pointing at.
     Emptying the bin then would take the live record's picture with it. */
  const shared = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const s = window.storage;
    await s.set("img:shared-pic", ${JSON.stringify(PIX)});
    await s.set("img:only-binned", ${JSON.stringify(PIX)});
    await s.set("chars:all", JSON.stringify([{ id: "live", name: "Still Here",
      tags: [], searchables: [], profileImg: "shared-pic", banner: "", variants: [],
      gallery: [], albums: [], imgMeta: {}, history: [], story: "x", personality: "y",
      sections: [], createdAt: 1, updatedAt: 1 }]));
    await s.set("trash:all", JSON.stringify([{ tid: "t-shared", type: "character",
      deletedAt: Date.now(), record: { id: "gone", name: "In The Bin",
        tags: [], searchables: [], profileImg: "shared-pic", banner: "", variants: [],
        gallery: [{ imgId: "only-binned", caption: "", album: "", variantId: "" }],
        albums: [], imgMeta: {}, history: [], story: "x", personality: "y",
        sections: [], createdAt: 1, updatedAt: 1 } }]));
    location.reload();
    return true;
  })()`);
  await wait(3200);

  const purged = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    const g = async k => {
      try { const r = await window.storage.get(k); return typeof r === "string" ? r : (r && r.value); }
      catch (e) { return null; }
    };
    btn(/^Settings$/).click(); await sleep(1400);
    const row = [...document.querySelectorAll(".filerow")].find(x => /Recently deleted/.test(x.textContent));
    if (!row) return { noRow: true };
    row.click(); await sleep(1100);
    const d = [...document.querySelectorAll('[role="dialog"]')]
      .find(x => x.getAttribute("aria-label") === "Recently deleted");
    if (!d) return { noDialog: true };
    const del = [...d.querySelectorAll("button")].find(b => /^Delete now$/.test(b.textContent.trim()));
    if (!del) return { noDelete: true };
    del.click(); await sleep(1800);
    return { sharedKept: !!(await g("img:shared-pic")), exclusiveGone: !(await g("img:only-binned")) };
  })()`);

  console.log("\nemptying the bin, when a picture is shared with a live record");
  check("the live record keeps its picture", purged.sharedKept === true,
    JSON.stringify(purged));
  check("and the one only the binned record had is removed", purged.exclusiveGone === true);

  clearTimeout(bail);
  console.log("");
  console.log(bad ? "  " + bad + " thing(s) wrong with overwriting on import."
                  : "  An overwritten character goes to the bin, whole.");
  app.exit(bad ? 1 : 0);
 } catch (e) {
  console.log("\n  the interface did not do what this expects: " + (e && e.message ? e.message : e));
  app.exit(1);
 }
});
