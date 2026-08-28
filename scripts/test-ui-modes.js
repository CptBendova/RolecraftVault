/* Quality and Performance are product behavior, not decorative labels.

   This drives the Android-shaped web build in a real renderer. It checks the
   parts that static source assertions cannot prove:

   - live theme changes recolour the canvas dust without a reload;
   - opening a panel really stops the canvas animation loop, and closing it
     starts the loop again;
   - Quality keeps the intended motion in all three themes;
   - Performance does not build ambient layers or preload the crest film;
   - reduced-motion also stops pseudo-element motion; and
   - the Settings layout stays centred and inside a narrow phone width.

   Needs Electron: npx electron scripts/test-ui-modes.js */
const { app, BrowserWindow } = require("electron");
const path = require("path"), os = require("os"), fs = require("fs");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-ui-modes-"));
app.setPath("userData", tmp);
app.commandLine.appendSwitch("enable-features", "OverlayScrollbar");

/* Android supplies this before the web bundle starts. */
const preload = path.join(tmp, "cap-preload.js");
fs.writeFileSync(preload,
  'try { window.Capacitor = { isNativePlatform: () => true, Plugins: {} }; } catch (e) {}');

let bad = 0, done = false;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};
const colourClose = (actual, expected, tolerance = 8) => {
  if (!actual || !expected) return false;
  const a = actual.split(",").map(Number), b = expected.split(",").map(Number);
  return a.length === 3 && b.length === 3 &&
    Math.max(...a.map((v, i) => Math.abs(v - b[i]))) <= tolerance;
};
const finish = code => {
  if (done) return;
  done = true;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  app.exit(code);
};
const bail = setTimeout(() => { console.log("\n  timed out"); finish(2); }, 120000);
const wait = ms => new Promise(r => setTimeout(r, ms));

async function setStored(win, theme, mode) {
  await win.webContents.executeJavaScript(
    `localStorage.setItem("rcv-theme", ${JSON.stringify(theme)});` +
    `localStorage.setItem("rcv-perfmode", ${JSON.stringify(mode)});`);
  await win.webContents.reload();
  await wait(1800);
}

const qualityProbe = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const button = re => [...document.querySelectorAll("button")]
    .find(b => re.test((b.getAttribute("aria-label") || b.textContent || "").trim()));
  const drawnDust = () => {
    const canvas = document.querySelector(".dust-field");
    if (!canvas || !canvas.width || !canvas.height) return null;
    /* Reading rasterised translucent edge pixels made this random: premultiplied
       alpha rounding can shift a channel by more than the tolerance depending on
       the last set of random mote radii. fillStyle is the exact colour used by
       the real draw loop and still proves that a live theme switch rebuilt it. */
    const fill = String(canvas.getContext("2d").fillStyle || "");
    const rgb = fill.match(/^rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/i);
    return rgb ? rgb.slice(1, 4).join(",") : null;
  };
  const snap = () => {
    const root = document.querySelector(".rcv");
    const glow = document.querySelector(".amb-glow");
    const crest = document.querySelector(".crest-mark");
    return {
      theme: root.classList.contains("light") ? "light" : root.classList.contains("charsnap") ? "charsnap" : "dark",
      dust: drawnDust(),
      brass: getComputedStyle(root).getPropertyValue("--brass").trim(),
      ambientAnimation: glow ? getComputedStyle(glow).animationName : "missing",
      crestBefore: crest ? getComputedStyle(crest, "::before").animationName : "missing",
      crestAfter: crest ? getComputedStyle(crest, "::after").animationName : "missing",
      sideways: document.documentElement.scrollWidth > innerWidth + 1
    };
  };

  await sleep(500);
  const themes = [snap()];
  for (let i = 0; i < 2; i++) {
    button(/^Theme ·/).click();
    await sleep(550);
    themes.push(snap());
  }

  const nativeRaf = window.requestAnimationFrame.bind(window);
  let rafHits = 0;
  window.requestAnimationFrame = cb => nativeRaf(t => { rafHits++; cb(t); });
  await sleep(100);
  rafHits = 0;
  button(/^Settings$/).click();
  await sleep(350);
  const pausedHits = rafHits;
  const modal = document.querySelector(".modal");
  const modalRect = modal.getBoundingClientRect();
  const optionNames = /^(Light|Dark|CharSnap|Quality|Performance|Small|Medium|Large|Normal|Higher|Maximum)$/;
  const options = [...modal.querySelectorAll("button")].filter(b => optionNames.test((b.textContent || "").trim()));
  const optionsInside = options.every(b => {
    const r = b.getBoundingClientRect();
    return r.left >= modalRect.left - 1 && r.right <= modalRect.right + 1;
  });
  const modalCentred = Math.abs((modalRect.left + modalRect.right) / 2 - innerWidth / 2) <= 2;
  button(/^Close$/).click();
  rafHits = 0;
  await sleep(350);
  const resumedHits = rafHits;
  return { themes, pausedHits, resumedHits, optionsInside, modalCentred,
    modalOverflow: modal.scrollWidth - modal.clientWidth, phone: document.querySelector(".rcv").classList.contains("phone") };
})()`;

const modeProbe = `(async () => {
  const root = document.querySelector(".rcv");
  const settings = [...document.querySelectorAll("button")].find(b => (b.textContent || "").trim() === "Settings");
  settings.click();
  await new Promise(r => setTimeout(r, 100));
  const back = document.querySelector(".modal-back");
  const animated = [...document.querySelectorAll(".rcv *")]
    .filter(el => getComputedStyle(el).animationName !== "none").length;
  return {
    perf: root.classList.contains("perf"),
    ambient: !!document.querySelector(".rcv-ambient"),
    dust: !!document.querySelector(".dust-field"),
    video: !!document.querySelector("video"),
    preloadedVideo: !!(window.__rcvBrand && window.__rcvBrand.v),
    backdrop: getComputedStyle(back).backdropFilter,
    animated
  };
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 360, height: 780,
    webPreferences: { preload, contextIsolation: false, backgroundThrottling: false } });
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(1500);
  await setStored(win, "dark", "quality");
  win.show();
  await wait(350);

  console.log("\nquality on an Android-sized renderer");
  const q = await win.webContents.executeJavaScript(qualityProbe);
  const expected = { dark: "217,178,92", light: "129,96,26", charsnap: "240,194,57" };
  check("the real Android branch is running", q.phone);
  check("all three themes were reached", q.themes.map(x => x.theme).join(",") === "dark,light,charsnap",
    q.themes.map(x => x.theme).join(", "));
  for (const t of q.themes) {
    check(t.theme + " dust uses that theme's brass", colourClose(t.dust, expected[t.theme]),
      "dust=" + t.dust + " expected=" + expected[t.theme]);
    check(t.theme + " keeps the ambient drift", t.ambientAnimation === "amb-drift", t.ambientAnimation);
    check(t.theme + " keeps the crest breathe", t.crestBefore === "crest-breathe", t.crestBefore);
    check(t.theme + " keeps the crest gleam", t.crestAfter === "crest-shine", t.crestAfter);
    check(t.theme + " does not scroll sideways", !t.sideways);
  }
  check("opening Settings stops idle animation frames", q.pausedHits <= 2, "frames=" + q.pausedHits);
  check("closing Settings resumes the ambient animation", q.resumedHits >= 4, "frames=" + q.resumedHits);
  check("Settings is centred on a phone", q.modalCentred);
  check("every appearance option stays inside Settings", q.optionsInside);
  check("Settings does not overflow sideways", q.modalOverflow <= 1, "overflow=" + q.modalOverflow + "px");

  console.log("\nperformance mode");
  await setStored(win, "dark", "performance");
  const p = await win.webContents.executeJavaScript(modeProbe);
  check("the root carries Performance", p.perf);
  check("the ambient layer is not built", !p.ambient);
  check("the dust canvas is not built", !p.dust);
  check("the crest video is not in the page", !p.video);
  check("the crest video is not preloaded off-screen", !p.preloadedVideo);
  check("dialog blur is removed", p.backdrop === "none", p.backdrop);
  check("nothing decorative is still animating", p.animated === 0, "animated=" + p.animated);

  console.log("\nreduced motion while Quality is selected");
  await win.webContents.debugger.attach("1.3");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
    media: "screen", features: [{ name: "prefers-reduced-motion", value: "reduce" }]
  });
  await setStored(win, "dark", "quality");
  const reduced = await win.webContents.executeJavaScript(`(() => {
    const crest = document.querySelector(".crest-mark");
    return {
      perf: document.querySelector(".rcv").classList.contains("perf"),
      ambient: !!document.querySelector(".rcv-ambient"),
      before: getComputedStyle(crest, "::before").animationName,
      after: getComputedStyle(crest, "::after").animationName
    };
  })()`);
  check("saved Quality remains selected", !reduced.perf);
  check("the ambient layer respects reduced motion", !reduced.ambient);
  check("reduced motion stops crest breathing", reduced.before === "none", reduced.before);
  check("reduced motion stops the crest gleam", reduced.after === "none", reduced.after);

  win.destroy();
  clearTimeout(bail);
  console.log(bad ? "\n" + bad + " UI mode check(s) failed." : "\nQuality, Performance and reduced motion all behave.");
  finish(bad ? 1 : 0);
}).catch(e => { console.error(e); finish(2); });
