/* The scanner has to give you a square to aim at, at every shape of screen.

   It is a full-screen overlay in a centred flex column, which is exactly the
   arrangement that quietly stops being square: the column shrinks the frame to
   fit and `aspect-ratio` loses. In landscape on a phone it collapsed to 178x73
   while this was being written. The button also has to stay reachable, which it
   did not once the frame stopped shrinking.

   The transfer panel is Electron-only, so window.transfer is stubbed the way
   CLAUDE.md describes, and the camera is a canvas stream: BarcodeDetector is
   present but never finds a code, so the overlay stays up to be measured.
   Needs Electron. */
const { app, BrowserWindow } = require("electron");
const path = require("path"), os = require("os"), fs = require("fs");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-qr-"));
app.setPath("userData", tmp);
const preload = path.join(tmp, "cap.js");
fs.writeFileSync(preload, 'try { window.Capacitor = { isNativePlatform: () => true, Plugins: {} }; } catch (e) {}');

const SIZES = [
  { name: "phone portrait",  w: 390, h: 844 },
  { name: "short phone",     w: 360, h: 640 },
  { name: "phone landscape", w: 740, h: 360 },
  { name: "desktop",         w: 1280, h: 820 },
];

let done = false;
const finish = (code, msg) => { if (done) return; done = true; if (msg) console.log(msg); app.exit(code); };
setTimeout(() => finish(2, "  timed out"), 120000);

const STUBS = `(() => {
  window.transfer = { canShare: false, status: async () => ({ active: false, device: "This phone" }),
    onProgress: () => () => {}, onMirrorRequest: () => () => {}, preview: async () => ({}),
    receive: async () => ({}), start: async () => ({}), stop: async () => ({}), respondMirror: () => {} };
  const c = document.createElement("canvas"); c.width = 480; c.height = 480;
  const x = c.getContext("2d"); x.fillStyle = "#cfcac0"; x.fillRect(0, 0, 480, 480);
  const stream = c.captureStream(5);
  navigator.mediaDevices = navigator.mediaDevices || {};
  navigator.mediaDevices.getUserMedia = async () => stream;
  window.BarcodeDetector = function () { return { detect: async () => [] }; };
  return true;
})()`;

app.whenReady().then(async () => {
  let bad = 0;
  /* One window, resized between sizes. Opening and destroying a window per size
     failed the next load outright often enough to be useless. */
  const win = new BrowserWindow({ show: false, width: SIZES[0].w, height: SIZES[0].h,
    webPreferences: { preload, contextIsolation: false } });
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await new Promise(r => setTimeout(r, 2000));

  for (const size of SIZES) {
    win.setSize(size.w, size.h);
    await new Promise(r => setTimeout(r, 500));
    await win.webContents.reload();
    await new Promise(r => setTimeout(r, 2200));
    await win.webContents.executeJavaScript(`(async () => { const s = window.storage;
      await s.set("chars:all","[]"); await s.set("personas:all","[]");
      await s.set("lore:all","[]"); await s.set("prompts:all","[]"); })()`);
    await win.webContents.executeJavaScript(STUBS);
    await new Promise(r => setTimeout(r, 300));

    const r = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(x => setTimeout(x, ms));
      const btn = re => [...document.querySelectorAll("button")].find(b =>
        re.test((b.textContent||"").trim()) || re.test((b.getAttribute("aria-label")||"").trim()));
      const st = btn(/^Settings$/); if (!st) return { fail: "no Settings" };
      st.click(); await sleep(1100);
      const scan = btn(/scan/i); if (!scan) return { fail: "no scan control" };
      scan.click(); await sleep(1300);
      const frame = document.querySelector(".qr-frame");
      if (!frame) return { fail: "no scanner overlay" };
      const f = frame.getBoundingClientRect();
      const v = frame.querySelector("video");
      const stage = document.querySelector(".qr-stage");
      const cancel = [...document.querySelectorAll(".modal-back button")].find(b => /Cancel/.test(b.textContent||""));
      const cr = cancel && cancel.getBoundingClientRect();
      return {
        w: Math.round(f.width), h: Math.round(f.height),
        square: Math.abs(f.width - f.height) <= 2,
        fitsScreen: f.width <= window.innerWidth && f.height <= window.innerHeight,
        corners: document.querySelectorAll(".qr-corners span").length,
        videoFills: !!v && Math.abs(v.getBoundingClientRect().width - f.width) <= 2
                        && Math.abs(v.getBoundingClientRect().height - f.height) <= 2,
        cancelReachable: !!cr && cr.top >= 0 && cr.bottom <= window.innerHeight + 1,
        stageScrolls: stage ? stage.scrollHeight > stage.clientHeight + 1 : null
      };
    })()`);

    const check = (label, ok, detail) => { if (!ok) bad++; console.log("  " + (ok ? "PASS" : "FAIL") + "  " + size.name.padEnd(17) + label + (detail ? "  " + detail : "")); };
    if (r.fail) { check(r.fail, false); continue; }
    check("the frame is square", r.square, r.w + "x" + r.h);
    check("it fits on the screen", r.fitsScreen);
    check("the picture fills it", r.videoFills);
    check("all four corners are marked", r.corners === 4, "found " + r.corners);
    check("Cancel is on screen", r.cancelReachable);
    check("nothing has to be scrolled to", r.stageScrolls === false);
  }

  console.log("");
  finish(bad ? 1 : 0, bad
    ? "  The scanner does not give you a square to aim at on every screen."
    : "  The scanner frames a square you can aim at, at every size.");
});
