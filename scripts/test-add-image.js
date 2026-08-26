/* Adding a picture from the gallery, which is how every picture gets in.

   Android hands the page a File through <input type=file>. Capacitor's
   BridgeWebChromeClient implements onShowFileChooser, so the picker itself is
   its business; none of the inputs here set `capture`, so it opens the gallery
   rather than the camera. What this drives is everything after the picker: a
   real File on the real input, through the real read, thumbnail and save, with
   a real canvas — which is the part CLAUDE.md says a harness cannot fake.

   The second case is the one that was wrong. A Samsung or a Pixel hands over
   HEIC, which Chromium cannot decode. The bytes read perfectly, so the picture
   was stored, counted and added, and then showed as a blank tile for ever while
   the message said it had been added. Needs Electron. */
const { app, BrowserWindow } = require("electron");
const path = require("path"), os = require("os"), fs = require("fs");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-img-"));
app.setPath("userData", tmp);
const preload = path.join(tmp, "cap.js");
fs.writeFileSync(preload, 'try { window.Capacitor = { isNativePlatform: () => true, Plugins: {} }; } catch (e) {}');

app.on("window-all-closed", () => {});   // or a half-finished run quits with 0 and reads as a pass
let done = false;
const finish = (code, msg) => { if (done) return; done = true; if (msg) console.log(msg); app.exit(code); };
setTimeout(() => finish(2, "  timed out"), 120000);

/* built in the page: a photo-shaped JPEG, and bytes that read but never decode */
const MAKE_FILE = {
  photo: `(async () => {
    const cv = document.createElement("canvas"); cv.width = 2400; cv.height = 1800;
    const g = cv.getContext("2d");
    g.fillStyle = "#3a5"; g.fillRect(0, 0, 2400, 1800);
    g.fillStyle = "#fff"; g.font = "200px sans-serif"; g.fillText("PHOTO", 300, 900);
    const b = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.9));
    return new File([b], "from-gallery.jpg", { type: "image/jpeg" });
  })()`,
  undecodable: `(async () => {
    const bytes = new Uint8Array(4096); bytes.fill(7);
    bytes.set([0,0,0,24,102,116,121,112,104,101,105,99], 0); // ftypheic
    return new File([new Blob([bytes], { type: "image/heic" })], "IMG_2201.heic", { type: "image/heic" });
  })()`,
};

app.whenReady().then(async () => {
  let bad = 0;
  const check = (label, ok, detail) => { if (!ok) bad++; console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : "")); };

  for (const asPhone of [true, false]) {
    const who = asPhone ? "phone " : "desktop";
    const win = new BrowserWindow({ show: false, width: asPhone ? 390 : 1280, height: asPhone ? 844 : 900,
      webPreferences: asPhone ? { preload, contextIsolation: false } : {} });
    let loaded = false;
    for (let a = 0; a < 3 && !loaded; a++) {
      try { await win.loadFile(path.join(ROOT, "web", "index.html")); loaded = true; }
      catch (e) { await new Promise(r => setTimeout(r, 800)); }
    }
    if (!loaded) { check(who + " the page would not load", false); win.destroy(); continue; }
    await new Promise(r => setTimeout(r, 2200));

    for (const kind of ["photo", "undecodable"]) {
      await win.webContents.executeJavaScript(`(async () => { const s = window.storage;
        await s.set("chars:all", JSON.stringify([{ id:"c1", name:"Picture Test", tags:[], searchables:[],
          profileImg:"", banner:"", variants:[], gallery:[], albums:[], imgMeta:{}, history:[],
          story:"Words.", personality:"More.", sections:[], createdAt:Date.now(), updatedAt:Date.now() }]));
        await s.set("personas:all","[]"); await s.set("lore:all","[]"); await s.set("prompts:all","[]"); })()`);
      await win.webContents.reload();
      await new Promise(r => setTimeout(r, 2600));

      const o = await win.webContents.executeJavaScript(`(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
        const nav = btn(/^Characters$/); if (nav) { nav.click(); await sleep(900); }
        const card = document.querySelector(".char-card"); if (!card) return { fail: "no character" };
        card.click(); await sleep(1200);
        const edit = btn(/^Edit character$/); if (!edit) return { fail: "no editor" };
        edit.click(); await sleep(1400);

        const file = await ${MAKE_FILE[kind]};
        const inputs = [...document.querySelectorAll('input[type=file]')].filter(i => (i.getAttribute("accept")||"").includes("image"));
        const target = inputs.find(i => i.multiple);
        if (!target) return { fail: "no gallery input" };
        const out = { capture: target.hasAttribute("capture"), multiple: !!target.multiple };

        const dt = new DataTransfer(); dt.items.add(file);
        Object.defineProperty(target, "files", { value: dt.files, configurable: true });
        target.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(2600);

        const save = btn(/^Save character$/); if (save) { save.click(); await sleep(1900); }
        const read = async k => { try { const v = await window.storage.get(k); return typeof v === "string" ? v : (v && v.value); } catch (e) { return null; } };
        const c = JSON.parse(await read("chars:all"))[0];
        out.gallery = (c.gallery || []).length;
        const id = (c.gallery || [])[0] && c.gallery[0].imgId;
        if (id) {
          const full = await read("img:" + id);
          out.storedOriginal = !!full && String(full).startsWith("data:image");
          out.decodes = await new Promise(res => { const im = new Image(); im.onload = () => res(!!im.naturalWidth); im.onerror = () => res(false); im.src = full; });
        }
        return out;
      })()`);

      if (o.fail) { check(who + " / " + kind + ": " + o.fail, false); continue; }
      if (kind === "photo") {
        check(who + " a picture from the gallery is added", o.gallery === 1, "gallery=" + o.gallery);
        check(who + " and its bytes are stored", !!o.storedOriginal);
        check(who + " and it can actually be shown", o.decodes === true);
        check(who + " several can be picked at once", o.multiple === true);
        check(who + " the picker opens the gallery, not the camera", o.capture === false);
      } else {
        check(who + " a picture that cannot be shown is refused", o.gallery === 0, "gallery=" + o.gallery);
        check(who + " and nothing broken is left in the vault", !o.storedOriginal);
      }
    }
    win.destroy();
    await new Promise(r => setTimeout(r, 900));
  }

  console.log("");
  finish(bad ? 1 : 0, bad
    ? "  Adding a picture from the gallery does not behave."
    : "  Pictures from the gallery are added, and ones that cannot be shown are turned away.");
});
