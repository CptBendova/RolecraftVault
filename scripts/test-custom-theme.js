/* A custom palette is a shipped setting, not a preview-only decoration. This
   drives the Android-sized web edition and proves that its four native colour
   controls update the live root, stay inside Settings, and survive a reload. */
const { app, BrowserWindow } = require("electron");
const path = require("path"), os = require("os"), fs = require("fs");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-custom-theme-"));
app.setPath("userData", tmp);
const preload = path.join(tmp, "cap-preload.js");
fs.writeFileSync(preload,
  'try { window.Capacitor = { isNativePlatform: () => true, Plugins: {} }; } catch (e) {}');

let bad = 0, done = false;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const finish = code => {
  if (done) return;
  done = true;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  app.exit(code);
};
const bail = setTimeout(() => { console.log("\n  timed out"); finish(2); }, 90000);

const probe = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const button = re => [...document.querySelectorAll("button")]
    .find(b => re.test((b.textContent || "").trim()));
  const rgb = value => {
    const m = String(value).match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    return m ? m.slice(1, 4).map(Number) : null;
  };
  const lum = c => {
    const f = n => { n /= 255; return n <= .04045 ? n / 12.92 : Math.pow((n + .055) / 1.055, 2.4); };
    return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  await sleep(700);
  button(/^Settings$/).click();
  await sleep(250);
  const modal = document.querySelector('.modal[aria-label="Settings"]');
  const inputs = [...modal.querySelectorAll('input[type="color"][data-theme-colour]')];
  const rect = modal.getBoundingClientRect();
  const inside = inputs.every(input => {
    const r = input.getBoundingClientRect();
    return r.left >= rect.left - 1 && r.right <= rect.right + 1;
  });
  const accent = inputs.find(input => input.dataset.themeColour === "accent");
  if (accent) {
    accent.value = "#ff70c7";
    accent.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(250);
  }
  const root = document.querySelector(".rcv");
  const cs = getComputedStyle(root);
  return {
    theme: root.dataset.theme,
    customClass: root.classList.contains("custom"),
    inputCount: inputs.length,
    inside,
    overflow: modal.scrollWidth - modal.clientWidth,
    ink: cs.getPropertyValue("--ink").trim(),
    panel: cs.getPropertyValue("--panel").trim(),
    accent: cs.getPropertyValue("--brass").trim(),
    saved: localStorage.getItem("rcv-custom-theme"),
    textContrast: ratio(rgb(cs.color), rgb(cs.backgroundColor || cs.getPropertyValue("--ink")))
  };
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 360, height: 780, useContentSize: true,
    webPreferences: { preload, contextIsolation: false } });
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await win.webContents.executeJavaScript(`
    localStorage.setItem("rcv-theme", "custom");
    localStorage.setItem("rcv-custom-theme", JSON.stringify({
      background: "#101827", surface: "#17213a", accent: "#66e0b8", text: "#f2f6ff"
    }));`);
  await win.webContents.reload();
  win.show();
  const first = await win.webContents.executeJavaScript(probe);
  console.log("\ncustom theme on an Android-sized renderer");
  check("Custom is the active theme", first.theme === "custom" && first.customClass, first.theme);
  check("all four native colour controls are present", first.inputCount === 4, String(first.inputCount));
  check("the colour controls stay inside Settings", first.inside);
  check("Settings does not scroll sideways", first.overflow <= 1, first.overflow + "px");
  check("the saved background is applied", first.ink.toLowerCase() === "#101827", first.ink);
  check("the saved surface is applied", first.panel.toLowerCase() === "#17213a", first.panel);
  check("changing the accent updates the live palette", first.accent.toLowerCase() === "#ff70c7", first.accent);
  const saved = JSON.parse(first.saved || "{}");
  check("changing a colour is remembered", saved.accent === "#ff70c7", first.saved);
  check("custom body text retains accessible contrast", first.textContrast >= 4.5, first.textContrast.toFixed(2) + ":1");

  await win.webContents.reload();
  await wait(900);
  const after = await win.webContents.executeJavaScript(`(() => {
    const root = document.querySelector(".rcv"), cs = getComputedStyle(root);
    return { theme: root.dataset.theme, accent: cs.getPropertyValue("--brass").trim() };
  })()`);
  check("the custom theme survives a reload", after.theme === "custom" && after.accent.toLowerCase() === "#ff70c7",
    after.theme + " " + after.accent);

  win.destroy();
  clearTimeout(bail);
  console.log(bad ? "\n" + bad + " custom-theme check(s) failed." : "\nThe custom theme applies and persists cleanly.");
  finish(bad ? 1 : 0);
}).catch(e => { console.error(e); finish(2); });
