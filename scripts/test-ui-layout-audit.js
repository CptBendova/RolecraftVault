/* Screen-by-screen responsive layout audit.

   The dashboard and the four libraries share one shell, but their headers,
   tools and content are all independent. A change that looks fine on the
   Dashboard can still push a library control off a 360px phone, and a gallery
   that feels balanced there can turn into two dominant rows on a desktop.

   This drives the real web bundle at phone, tablet and desktop boundaries and checks:

   - every primary destination and Settings stays inside the viewport;
   - record sheets stay inside their own scroller;
   - backup remains in Settings instead of impersonating an urgent Dashboard
     warning;
   - the Dashboard gallery shows two compact pictures in one phone row, gives a
     tablet more pictures, and stays capped on wider screens;
   - Performance mode still loads Spotlight first, and tablet Spotlight keeps
     its picture beside the writing; and
   - character-card sizing is visible where character and persona cards live,
     and really changes the grid.

   Needs Electron: npx electron scripts/test-ui-layout-audit.js */
const { app, BrowserWindow } = require("electron");
const path = require("path"), os = require("os"), fs = require("fs");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-layout-audit-"));
app.setPath("userData", tmp);
app.commandLine.appendSwitch("enable-features", "OverlayScrollbar");
app.on("window-all-closed", () => {});

const capPreload = path.join(tmp, "capacitor.js");
fs.writeFileSync(capPreload, [
  'try { window.Capacitor = { isNativePlatform: () => true, Plugins: {} }; } catch (e) {}',
  'try {',
  '  const width = Number((process.argv.find(v => v.startsWith("--rcv-screen-width=")) || "").split("=")[1]);',
  '  const height = Number((process.argv.find(v => v.startsWith("--rcv-screen-height=")) || "").split("=")[1]);',
  '  if (width > 0) Object.defineProperty(window.screen, "width", { value: width, configurable: true });',
  '  if (height > 0) Object.defineProperty(window.screen, "height", { value: height, configurable: true });',
  '} catch (e) {}'
].join("\n"));

const pixel = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="120"><rect width="90" height="120" fill="#59647d"/><circle cx="45" cy="45" r="24" fill="#d9b25c"/></svg>'
).toString("base64");

let bad = 0, done = false;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const finish = code => {
  if (done) return;
  done = true;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  app.exit(code);
};
const bail = setTimeout(() => { console.log("\n  timed out"); finish(2); }, 150000);

const SEED = `(async () => {
  const s = window.storage, now = Date.now(), chars = [], personas = [];
  for (let i = 0; i < 12; i++) {
    const portrait = "portrait-" + i, gallery = [];
    await s.set("img:" + portrait, ${JSON.stringify(pixel)});
    await s.set("th:" + portrait, ${JSON.stringify(pixel)});
    for (let g = 0; g < 2; g++) {
      const id = "gallery-" + i + "-" + g;
      await s.set("img:" + id, ${JSON.stringify(pixel)});
      await s.set("th:" + id, ${JSON.stringify(pixel)});
      gallery.push({ imgId: id, caption: "Gallery " + (g + 1), album: "", variantId: "" });
    }
    chars.push({ id: "c" + i, name: "Character " + i,
      tagline: "A deliberately useful card subtitle", tags: ["fantasy", "test"], searchables: [],
      profileImg: portrait, banner: "", variants: [], gallery, albums: [], imgMeta: {}, history: [],
      story: "Story text for the responsive reading view.", personality: "Steady and thoughtful.",
      sections: [{ id: "s" + i, title: "Notes", content: "A custom section." }],
      createdAt: now - i * 1000, updatedAt: now - i * 1000 });
  }
  for (let i = 0; i < 6; i++) {
    const avatar = "persona-" + i;
    await s.set("img:" + avatar, ${JSON.stringify(pixel)});
    await s.set("th:" + avatar, ${JSON.stringify(pixel)});
    personas.push({ id: "p" + i, name: "Persona " + i, tagline: "Point of view", role: "Writer",
      description: "A persona description.", avatar, gallery: [], sections: [],
      createdAt: now - i * 1200, updatedAt: now - i * 1200 });
  }
  await s.set("chars:all", JSON.stringify(chars));
  await s.set("personas:all", JSON.stringify(personas));
  await s.set("lore:all", JSON.stringify([
    { id:"l1", world:"Atlas", title:"The capital", content:"Lore text", images:[], createdAt:now, updatedAt:now },
    { id:"l2", world:"Atlas", title:"The frontier", content:"More lore", images:[], createdAt:now-1, updatedAt:now-1 }
  ]));
  await s.set("prompts:all", JSON.stringify([
    { id:"q1", collection:"Scenes", title:"A first meeting", content:"Prompt text", images:[], createdAt:now, updatedAt:now },
    { id:"q2", collection:"Scenes", title:"A difficult choice", content:"More prompt text", images:[], createdAt:now-1, updatedAt:now-1 }
  ]));
  await s.set("ui:cardsize", "medium");
  await s.set("ui:onboarded", "1");
  await s.set("ui:lastseenversion", ${JSON.stringify("1.236")});
  await s.delete("ui:lastbackup");
})()`;

const AUDIT = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => !!el && getComputedStyle(el).display !== "none" && el.getClientRects().length > 0;
  const button = re => [...document.querySelectorAll("button")]
    .find(el => visible(el) && re.test((el.getAttribute("aria-label") || el.textContent || "").trim()));
  const action = re => [...document.querySelectorAll("button, [role=button]")]
    .find(el => visible(el) && re.test((el.getAttribute("aria-label") || el.textContent || "").trim()));
  const fit = label => {
    const root = document.querySelector(".rcv"), main = document.querySelector(".rcv > .scrollbody");
    const mainRect = main && main.getBoundingClientRect();
    const offenders = mainRect ? [...main.querySelectorAll("*")].filter(visible).filter(el => {
      const r = el.getBoundingClientRect();
      return r.right > mainRect.right + 1 || r.left < mainRect.left - 1;
    }).slice(0, 5).map(el => {
      const r = el.getBoundingClientRect();
      return (el.className || el.tagName) + "@" + Math.round(r.left) + ".." + Math.round(r.right);
    }) : [];
    return { label,
      documentOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      rootOverflow: root ? Math.max(0, root.scrollWidth - root.clientWidth) : 999,
      mainOverflow: main ? Math.max(0, main.scrollWidth - main.clientWidth) : 999,
      offenders };
  };
  const columns = el => {
    if (!el) return 0;
    const tracks = (getComputedStyle(el).gridTemplateColumns || "").split(" ").filter(Boolean);
    return tracks.length;
  };
  const layer = el => ({ present: visible(el),
    overflow: el ? Math.max(0, el.scrollWidth - el.clientWidth) : 999,
    outside: el ? (() => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; })() : true });
  const choose = async (select, value) => {
    if (!select) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(250);
  };
  const out = { screens: [] };
  await sleep(1700);

  out.screens.push(fit("Dashboard"));
  const root = document.querySelector(".rcv");
  const gallery = document.querySelector('[data-dashboard-gallery="true"]');
  const galleryTiles = gallery ? [...gallery.querySelectorAll(".wtile")] : [];
  const galleryRows = new Set(galleryTiles.map(el => Math.round(el.getBoundingClientRect().top))).size;
  const spotlightImage = document.querySelector(".dashboard-spotlight .spotlight-image img");
  const spotlight = document.querySelector(".dashboard-spotlight");
  const spotlightPicture = document.querySelector(".dashboard-spotlight .spotlight-image");
  const spotlightCopy = document.querySelector(".dashboard-spotlight .spotlight-copy");
  const pictureRect = spotlightPicture && spotlightPicture.getBoundingClientRect();
  const copyRect = spotlightCopy && spotlightCopy.getBoundingClientRect();
  out.dashboard = {
    backupAtTop: [...document.querySelectorAll(".health-action")]
      .some(el => /Back up your latest work/.test(el.textContent || "")),
    galleryPictures: gallery ? gallery.querySelectorAll(".wtile").length : 0,
    galleryColumns: columns(gallery),
    galleryRows,
    largestGalleryTile: galleryTiles.length ? Math.max(...galleryTiles.map(el => el.getBoundingClientRect().width)) : 0,
    galleryTotal: 24,
    spotlightObjectFit: spotlightImage ? getComputedStyle(spotlightImage).objectFit : "missing",
    spotlightLoaded: !!(spotlightImage && spotlightImage.complete && spotlightImage.naturalWidth > 0),
    spotlightDirection: spotlight ? getComputedStyle(spotlight).flexDirection : "missing",
    spotlightPictureBesideCopy: !!(pictureRect && copyRect && pictureRect.right <= copyRect.left + 1),
    tabletClass: !!(root && root.classList.contains("tablet"))
  };
  const navItems = [...document.querySelectorAll(".sidebar .primary-nav")];
  const sidebarBrand = document.querySelector(".sidebar .brand");
  const sidebarTools = document.querySelector(".sidebar .side-tools");
  out.mobileSidebarExtrasHidden = !visible(sidebarBrand) && !visible(sidebarTools);
  out.bottomNav = navItems.map(item => {
    const r = item.getBoundingClientRect(), icon = item.querySelector("svg"), label = item.querySelector(".navlabel");
    const ir = icon && icon.getBoundingClientRect(), lr = label && label.getBoundingClientRect();
    const centre = r.left + r.width / 2;
    return { id: item.getAttribute("data-nav-id") || item.getAttribute("aria-label"), left: r.left, right: r.right, width: r.width,
      iconOffset: ir ? ir.left + ir.width / 2 - centre : 999,
      labelOffset: lr ? lr.left + lr.width / 2 - centre : 999 };
  });

  button(/^Settings$/).click(); await sleep(400);
  const modal = document.querySelector(".modal");
  const choiceTextLines = el => {
    const tops = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      if (!walk.currentNode.nodeValue.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(walk.currentNode);
      [...range.getClientRects()].forEach(r => tops.push(Math.round(r.top)));
    }
    return new Set(tops).size;
  };
  out.settings = { present: visible(modal), overflow: modal ? Math.max(0, modal.scrollWidth - modal.clientWidth) : 999,
    choices: [...document.querySelectorAll('[data-settings-choice]')].map(el => ({
      id: el.getAttribute('data-settings-choice'), lines: choiceTextLines(el),
      overflow: Math.max(0, el.scrollWidth - el.clientWidth), wrap: getComputedStyle(el).overflowWrap
    })) };
  button(/^Close$/).click(); await sleep(250);

  button(/^Characters$/).click(); await sleep(500);
  out.screens.push(fit("Characters"));
  const cselect = document.querySelector('select[aria-label="Character card size"]');
  const cgrid = document.querySelector(".grid-cards");
  out.characterSize = { present: visible(cselect), medium: columns(cgrid) };
  await choose(cselect, "small"); out.characterSize.small = columns(cgrid);
  await choose(cselect, "large"); out.characterSize.large = columns(cgrid);
  button(/^New character$/).click(); await sleep(350);
  out.characterEditor = layer(document.querySelector(".scrollbody.sheet"));
  button(/^Cancel$/).click(); await sleep(250);
  const firstCharacter = document.querySelector(".char-card");
  if (firstCharacter) firstCharacter.click();
  await sleep(450);
  const charSheet = document.querySelector('.scrollbody.sheet[aria-label^="Character "]');
  out.characterSheet = { present: visible(charSheet), overflow: charSheet ? Math.max(0, charSheet.scrollWidth - charSheet.clientWidth) : 999 };
  const closeCharacter = button(/^Close character$/); if (closeCharacter) closeCharacter.click();
  await sleep(250);

  button(/^Personas$/).click(); await sleep(500);
  out.screens.push(fit("Personas"));
  const pselect = document.querySelector('select[aria-label="Persona card size"]');
  const pgrid = document.querySelector(".grid-cards");
  out.personaSize = { present: visible(pselect), medium: columns(pgrid) };
  await choose(pselect, "small"); out.personaSize.small = columns(pgrid);
  await choose(pselect, "large"); out.personaSize.large = columns(pgrid);
  button(/^New persona$/).click(); await sleep(350);
  out.personaEditor = layer(document.querySelector('.modal[aria-label="New persona"]'));
  button(/^Cancel$/).click(); await sleep(250);
  const firstPersona = document.querySelector(".char-card");
  if (firstPersona) firstPersona.click();
  await sleep(450);
  const personaSheet = document.querySelector('.scrollbody.sheet[aria-label^="Persona "]');
  out.personaSheet = { present: visible(personaSheet), overflow: personaSheet ? Math.max(0, personaSheet.scrollWidth - personaSheet.clientWidth) : 999 };
  const closePersona = button(/^Close persona$/); if (closePersona) closePersona.click();
  await sleep(250);

  button(/^Lorebooks$/).click(); await sleep(450); out.screens.push(fit("Lorebooks"));
  const lorebook = action(/Atlas/);
  if (lorebook) lorebook.click();
  await sleep(350); out.lorebook = layer(document.querySelector(".scrollbody.sheet"));
  out.screens.push(fit("Lorebook page"));
  const loreEntry = action(/The capital/);
  if (loreEntry) loreEntry.click();
  await sleep(350); out.loreEntry = layer(document.querySelector(".scrollbody.sheet"));
  out.screens.push(fit("Lore entry"));

  button(/^Prompt Vault$/).click(); await sleep(450); out.screens.push(fit("Prompt Vault"));
  const promptBook = action(/Scenes/);
  if (promptBook) promptBook.click();
  await sleep(350); out.promptBook = layer(document.querySelector(".scrollbody.sheet"));
  out.screens.push(fit("Prompt collection"));
  const promptEntry = action(/A first meeting/);
  if (promptEntry) promptEntry.click();
  await sleep(350); out.promptEntry = layer(document.querySelector(".scrollbody.sheet"));
  out.screens.push(fit("Prompt entry"));
  return out;
})()`;

async function at(width, height, android, performance) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true,
    webPreferences: android ? { preload: capPreload, contextIsolation: false,
      additionalArguments: [`--rcv-screen-width=${width}`, `--rcv-screen-height=${height}`] } : {} });
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(1500);
  await win.webContents.executeJavaScript(`localStorage.setItem("rcv-perfmode", ${JSON.stringify(performance ? "performance" : "quality")})`);
  await win.webContents.executeJavaScript(SEED);
  await win.webContents.reload();
  await wait(2200);
  const result = await win.webContents.executeJavaScript(AUDIT);
  win.destroy();
  return result;
}

app.whenReady().then(async () => {
  for (const size of [
    { name: "320px Android Performance", w: 320, h: 568, android: true, performance: true },
    { name: "360px Android Performance", w: 360, h: 740, android: true, performance: true },
    { name: "600px Android tablet threshold", w: 600, h: 960, android: true, performance: false },
    { name: "820px Android tablet", w: 820, h: 1050, android: true, performance: false },
    { name: "1280px desktop", w: 1280, h: 800, android: false },
    { name: "1920px wide desktop", w: 1920, h: 1080, android: false }
  ]) {
    console.log("\n" + size.name);
    const r = await at(size.w, size.h, size.android, size.performance);
    for (const screen of r.screens) {
      check(screen.label + " has no sideways page overflow",
        screen.documentOverflow <= 1 && screen.rootOverflow <= 1 && screen.mainOverflow <= 1,
        `document=${screen.documentOverflow}px root=${screen.rootOverflow}px main=${screen.mainOverflow}px` +
          (screen.offenders.length ? " · " + screen.offenders.join(", ") : ""));
    }
    check("Settings opens and fits", r.settings.present && r.settings.overflow <= 1,
      "overflow=" + r.settings.overflow + "px");
    if (size.android && !r.dashboard.tabletClass) {
      check("Settings choices keep whole horizontal labels", r.settings.choices.length === 13 &&
        r.settings.choices.every(item => item.lines === 1 && item.overflow <= 1 && item.wrap !== "anywhere"),
        r.settings.choices.map(item => item.id + "=" + item.lines + " line(s)/" + item.overflow + "px/" + item.wrap).join(", "));
      const widths = r.bottomNav.map(item => item.width);
      check("the Android bar has five equal destinations", r.bottomNav.length === 5 &&
        Math.max(...widths) - Math.min(...widths) <= 1 && r.bottomNav[0].left >= -1 &&
          r.bottomNav[r.bottomNav.length - 1].right <= size.w + 1,
        r.bottomNav.map(item => item.id + "=" + Math.round(item.width) + "px").join(", "));
      check("desktop branding is absent from the Android bar", r.mobileSidebarExtrasHidden);
      check("every Android bar icon and label is centred", r.bottomNav.length === 5 &&
        r.bottomNav.every(item => Math.abs(item.iconOffset) <= 1 && Math.abs(item.labelOffset) <= 1),
        r.bottomNav.map(item => item.id + " icon=" + item.iconOffset.toFixed(1) + " label=" + item.labelOffset.toFixed(1)).join(", "));
      check("mobile Spotlight preserves the whole picture", r.dashboard.spotlightObjectFit === "contain",
        "object-fit=" + r.dashboard.spotlightObjectFit);
      check("Performance mode loads the Spotlight picture", r.dashboard.spotlightLoaded,
        "loaded=" + r.dashboard.spotlightLoaded);
      check("the phone gallery is one compact two-picture row",
        r.dashboard.galleryPictures === 2 && r.dashboard.galleryColumns === 2 && r.dashboard.galleryRows === 1 && r.dashboard.largestGalleryTile < 180,
        `pictures=${r.dashboard.galleryPictures} columns=${r.dashboard.galleryColumns} rows=${r.dashboard.galleryRows} tile=${Math.round(r.dashboard.largestGalleryTile)}px`);
    } else if (size.android) {
      check("Android tablet is classified by its physical screen", r.dashboard.tabletClass);
      check("tablet Spotlight keeps the picture beside its writing",
        r.dashboard.spotlightDirection === "row" && r.dashboard.spotlightPictureBesideCopy,
        `direction=${r.dashboard.spotlightDirection} beside=${r.dashboard.spotlightPictureBesideCopy}`);
      check("tablet shows more gallery pictures than a phone",
        r.dashboard.galleryPictures > 2 && r.dashboard.galleryColumns > 2,
        `pictures=${r.dashboard.galleryPictures} columns=${r.dashboard.galleryColumns}`);
    } else {
      check("wide Spotlight remains edge-to-edge", r.dashboard.spotlightObjectFit === "cover",
        "object-fit=" + r.dashboard.spotlightObjectFit);
    }
    check("backup is kept out of the Dashboard warning area", !r.dashboard.backupAtTop);
    const expectedPictures = Math.min(r.dashboard.galleryTotal,
      r.dashboard.galleryColumns <= 1 ? 2 : Math.min(r.dashboard.galleryColumns, 6));
    check("the Dashboard gallery uses a deliberate responsive picture count",
      r.dashboard.galleryPictures === expectedPictures,
      `pictures=${r.dashboard.galleryPictures} columns=${r.dashboard.galleryColumns} expected=${expectedPictures}`);
    check("character card size is available in the Characters library", r.characterSize.present);
    if (r.characterSize.present) check("character card size changes the real grid",
      r.characterSize.small > r.characterSize.large,
      `small=${r.characterSize.small} medium=${r.characterSize.medium} large=${r.characterSize.large}`);
    check("persona card size is available in the Personas library", r.personaSize.present);
    if (r.personaSize.present) check("persona card size changes the real grid",
      r.personaSize.small > r.personaSize.large,
      `small=${r.personaSize.small} medium=${r.personaSize.medium} large=${r.personaSize.large}`);
    check("a character sheet opens and fits", r.characterSheet.present && r.characterSheet.overflow <= 1,
      "overflow=" + r.characterSheet.overflow + "px");
    check("a persona sheet opens and fits", r.personaSheet.present && r.personaSheet.overflow <= 1,
      "overflow=" + r.personaSheet.overflow + "px");
    check("the character editor opens and fits", r.characterEditor.present && r.characterEditor.overflow <= 1 && !r.characterEditor.outside,
      "overflow=" + r.characterEditor.overflow + "px");
    check("the persona editor opens and fits", r.personaEditor.present && r.personaEditor.overflow <= 1 && !r.personaEditor.outside,
      "overflow=" + r.personaEditor.overflow + "px");
    check("a lorebook and its entry fit", r.lorebook.present && r.lorebook.overflow <= 1 && r.loreEntry.present && r.loreEntry.overflow <= 1);
    check("a prompt collection and its entry fit", r.promptBook.present && r.promptBook.overflow <= 1 && r.promptEntry.present && r.promptEntry.overflow <= 1);
  }

  clearTimeout(bail);
  console.log(bad ? `\n${bad} responsive UI audit check(s) failed.`
                  : "\nEvery primary screen fits and the Dashboard/library hierarchy is coherent.");
  finish(bad ? 1 : 0);
}).catch(error => { console.error(error); finish(2); });
