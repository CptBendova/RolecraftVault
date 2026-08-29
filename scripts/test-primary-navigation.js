/* Primary navigation must dismiss the record layered over the destination.

   On Android the five primary destinations remain visible as a bottom bar while
   a character, persona, lorebook or prompt collection is open. Those buttons
   used to change only the library underneath the fixed sheet, so the selected
   tab changed but the old record stayed on screen and made the tap look broken.

   This drives the real Android-shaped web bundle and checks both a character
   sheet and a nested lore entry. Needs Electron. */
const { app, BrowserWindow } = require("electron");
const path = require("path"), os = require("os"), fs = require("fs");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-primary-nav-"));
app.setPath("userData", tmp);

const preload = path.join(tmp, "capacitor.js");
fs.writeFileSync(preload,
  'try { window.Capacitor = { isNativePlatform: () => true, Plugins: {} }; } catch (e) {}');

let done = false;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const finish = (code, message) => {
  if (done) return;
  done = true;
  if (message) console.log(message);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  app.exit(code);
};
setTimeout(() => finish(2, "  timed out"), 90000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 390,
    height: 844,
    useContentSize: true,
    webPreferences: { preload, contextIsolation: false }
  });
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(1800);
  await win.webContents.executeJavaScript(`(async () => {
    const s = window.storage, now = Date.now();
    await s.set("chars:all", JSON.stringify([{ id:"c1", name:"Navigation Subject",
      tags:[], searchables:[], profileImg:"", banner:"", variants:[], gallery:[],
      albums:[], imgMeta:{}, history:[], story:"Story", personality:"Personality",
      sections:[], createdAt:now, updatedAt:now }]));
    await s.set("personas:all", "[]");
    await s.set("lore:all", JSON.stringify([{ id:"l1", world:"Atlas", title:"The capital",
      content:"Lore text", triggers:[], images:[], createdAt:now, updatedAt:now }]));
    await s.set("prompts:all", "[]");
    await s.set("ui:onboarded", "1");
  })()`);
  await win.webContents.reload();
  await wait(2600);

  const result = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const visible = el => !!el && getComputedStyle(el).display !== "none" && el.getClientRects().length > 0;
    const nav = id => document.querySelector('[data-nav-id="' + id + '"]');
    const action = re => [...document.querySelectorAll("button, [role=button]")]
      .find(el => visible(el) && re.test((el.getAttribute("aria-label") || el.textContent || "").trim()));
    const sheet = () => document.querySelector(".scrollbody.sheet");
    const active = () => (document.querySelector(".primary-nav.active") || {}).dataset?.navId || null;

    nav("characters").click(); await sleep(450);
    const character = document.querySelector(".char-card") || action(/Navigation Subject/);
    if (character) character.click();
    await sleep(700);
    const characterOpened = !!document.querySelector('.scrollbody.sheet[aria-label^="Character "]');
    nav("personas").click(); await sleep(650);
    const characterDismissed = !sheet() && active() === "personas";

    nav("lorebooks").click(); await sleep(450);
    const book = action(/Atlas/); if (book) book.click();
    await sleep(600);
    const bookOpened = !!sheet();
    const entry = action(/The capital/); if (entry) entry.click();
    await sleep(600);
    const entryOpened = !!sheet();
    nav("dashboard").click(); await sleep(650);
    const loreDismissed = !sheet() && active() === "dashboard";

    return { phone: document.querySelector(".rcv").classList.contains("phone"),
      characterOpened, characterDismissed, bookOpened, entryOpened, loreDismissed };
  })()`);

  let bad = 0;
  const check = (label, ok) => {
    if (!ok) bad++;
    console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label);
  };
  check("the real Android layout is active", result.phone);
  check("a character opens above its library", result.characterOpened);
  check("choosing Personas dismisses the open character", result.characterDismissed);
  check("a lorebook and its entry open", result.bookOpened && result.entryOpened);
  check("choosing Dashboard dismisses the lore entry and book", result.loreDismissed);

  win.destroy();
  finish(bad ? 1 : 0, bad
    ? "  Primary navigation left old content layered over the selected tab."
    : "  Android primary navigation always reveals the destination selected.");
}).catch(error => {
  console.error(error);
  finish(2);
});
