/* 1.304 premium visual system, checked in the real web bundle.

   The pass is mostly paint, so the useful checks are the promises it makes:
   - primary actions follow the theme accent and stay readable in every theme;
   - the focus ring is the accent and clears 3:1 against the canvas;
   - a chosen Settings option is a marked surface, not a second solid button;
   - text over artwork keeps 4.5:1 in Light and Custom (it used dark brass);
   - Quality has short entrances, Performance and reduced motion have none;
   - a picture viewer covers the Android top and bottom bars (it was trapped
     under them by the library column's stacking context);
   - phone toolbars give search a whole row without sideways overflow; and
   - Android tablets, which are wider than the phone breakpoint, still get
     48-pixel navigation, close and action targets.

   Disposable profile, no provider, no real vault.
   Needs Electron: npx electron scripts/test-premium-visual.js */
const { app, BrowserWindow } = require("electron");
const path = require("path"), os = require("os"), fs = require("fs");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-premium-visual-"));
app.setPath("userData", tmp);
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.on("window-all-closed", () => {});

const preload = path.join(tmp, "device.js");
fs.writeFileSync(preload, [
  "try {",
  "  window.openRouter = { status: async () => ({ configured: true }), onEvent: () => () => {}, models: async () => ({ ok: true, models: [] }) };",
  "  const m = /[?&]device=(phone|tablet)/.exec(location.search);",
  "  if (m) {",
  "    window.Capacitor = { isNativePlatform: () => true, Plugins: {} };",
  "    const w = m[1] === 'tablet' ? 800 : 360, h = m[1] === 'tablet' ? 1280 : 800;",
  "    Object.defineProperty(window.screen, 'width', { value: w, configurable: true });",
  "    Object.defineProperty(window.screen, 'height', { value: h, configurable: true });",
  "  }",
  "} catch (e) {}"
].join("\n"));

let bad = 0, done = false;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (!ok && detail ? "  " + detail : ""));
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const finish = code => {
  if (done) return;
  done = true;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  app.exit(code);
};
const bail = setTimeout(() => { console.log("\n  timed out"); finish(2); }, 300000);

const pixel = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="120"><rect width="90" height="120" fill="#59647d"/><circle cx="45" cy="45" r="24" fill="#d9b25c"/></svg>'
).toString("base64");

const SEED = `(async () => {
  const s = window.storage, now = Date.now(), chars = [], personas = [];
  for (let i = 0; i < 8; i++) {
    const portrait = "portrait-" + i, gallery = [];
    await s.set("img:" + portrait, ${JSON.stringify(pixel)}); await s.set("th:" + portrait, ${JSON.stringify(pixel)});
    for (let g = 0; g < 2; g++) {
      const id = "gallery-" + i + "-" + g;
      await s.set("img:" + id, ${JSON.stringify(pixel)}); await s.set("th:" + id, ${JSON.stringify(pixel)});
      gallery.push({ imgId: id, caption: "Scene", album: "", variantId: "" });
    }
    chars.push({ id: "c" + i, name: "Character " + i, tagline: "A card subtitle", tags: ["fantasy"], searchables: [],
      profileImg: portrait, banner: "", variants: [], gallery, albums: [], imgMeta: {}, history: [],
      story: "Story text.", sections: [], createdAt: now - i, updatedAt: now - i });
  }
  for (let i = 0; i < 3; i++) {
    const avatar = "persona-" + i;
    await s.set("img:" + avatar, ${JSON.stringify(pixel)}); await s.set("th:" + avatar, ${JSON.stringify(pixel)});
    personas.push({ id: "p" + i, name: "Persona " + i, tagline: "Point of view", role: "Writer", description: "A persona.",
      avatar, gallery: [], sections: [], createdAt: now - i, updatedAt: now - i });
  }
  await s.set("chars:all", JSON.stringify(chars));
  await s.set("personas:all", JSON.stringify(personas));
  await s.set("lore:all", "[]"); await s.set("prompts:all", "[]");
  await s.set("ui:cardsize", "medium"); await s.set("ui:onboarded", "1");
})()`;

/* Shared page helpers, evaluated in the renderer. */
const HELPERS = `
  window.__t = {
    vis: el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
    button: re => [...document.querySelectorAll("button")].find(el => window.__t.vis(el) && re.test((el.getAttribute("aria-label") || el.textContent || "").trim())),
    rgb: c => { const srgb = /^color\\(srgb/.test(c); const m = String(c).replace("color(srgb", "").match(/[\\d.]+/g) || []; return m.slice(0, 3).map(n => srgb ? +n * 255 : +n); },
    lum: c => { const f = n => { n /= 255; return n <= .04045 ? n / 12.92 : Math.pow((n + .055) / 1.055, 2.4); }; const x = window.__t.rgb(c); return .2126 * f(x[0]) + .7152 * f(x[1]) + .0722 * f(x[2]); },
    ratio: (a, b) => { const x = window.__t.lum(a), y = window.__t.lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); },
    stops: el => { const s = getComputedStyle(el); const g = (s.backgroundImage.match(/rgba?\\([^)]*\\)|color\\(srgb[^)]*\\)/g) || []); const list = g.length ? g : [s.backgroundColor]; const ink = window.__t.rgb(window.__t.varColour("--ink")); return list.map(c => { const a = /rgba\\(/.test(c) ? +c.match(/[\\d.]+/g)[3] : 1; if (a >= 1) return c; const x = window.__t.rgb(c); return "rgb(" + x.map((n, i) => Math.round(n * a + ink[i] * (1 - a))).join(",") + ")"; }); },
    varColour: name => { const probe = document.createElement("span"); probe.style.color = "var(" + name + ")"; document.querySelector(".rcv").append(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; }
  };
  true`;

function open(query, w, h, reduced) {
  return new Promise(async (resolve, reject) => {
    const win = new BrowserWindow({ show: true, width: w, height: h, useContentSize: true,
      webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
    win.webContents.on("console-message", e => { if (e.level === "error") console.log("  renderer: " + e.message); });
    const run = s => win.webContents.executeJavaScript(s);
    const until = async (s, ms = 12000) => { for (let t = 0; t < ms; t += 60) { if (await run(s).catch(() => false)) return true; await wait(60); } throw Error("timed out: " + s); };
    try {
      await win.loadFile(path.join(ROOT, "web", "index.html"), { search: query });
      await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
      if (reduced) { win.webContents.debugger.attach("1.3"); await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }); }
      resolve({ win, run, until,
        reload: async () => { await new Promise(r => { win.webContents.once("did-finish-load", r); win.reload(); }); await until("!!document.querySelector('.rcv[data-rcv-state=ready]')"); await run(HELPERS); await wait(500); } });
    } catch (e) { reject(e); }
  });
}

async function setLook(p, theme, mode) {
  await p.run(`localStorage.setItem("rcv-theme", ${JSON.stringify(theme)}); localStorage.setItem("rcv-perfmode", ${JSON.stringify(mode)});
    localStorage.setItem("rcv-custom-theme", JSON.stringify({ background: "#f4efe6", surface: "#fffaf2", accent: "#b7791f", text: "#2a2118" })); true`);
  await p.reload();
}

app.whenReady().then(async () => {
  /* ---------- Windows-sized renderer: every theme in both modes ---------- */
  const desk = await open("", 1280, 860);
  await desk.run(SEED); await desk.reload();
  for (const theme of ["dark", "light", "charsnap", "custom"]) for (const mode of ["quality", "performance"]) {
    await setLook(desk, theme, mode);
    const tag = theme + "/" + mode;
    const r = await desk.run(`(async () => {
      const t = window.__t, sleep = ms => new Promise(r => setTimeout(r, ms));
      t.button(/^Characters$/).click(); await sleep(450);
      const primary = t.button(/New character/);
      const ps = getComputedStyle(primary);
      const primaryRatio = Math.min(...t.stops(primary).map(bg => t.ratio(ps.color, bg)));
      const warm = t.stops(primary).every(c => { const x = t.rgb(c); return x[0] >= x[2]; });
      const card = document.querySelector(".grid-cards > :first-child");
      const cardAnimation = card ? getComputedStyle(card).animationName : "missing";
      const allStill = [...document.querySelectorAll(".rcv *")].every(el => ["", "::before", "::after"].every(p => {
        const s = getComputedStyle(el, p || null);
        return s.animationName === "none" && s.transitionDuration.split(",").every(d => parseFloat(d) === 0);
      }));
      primary.focus();
      const ring = getComputedStyle(primary).outlineColor;
      const brass = t.varColour("--brass"), ink = t.varColour("--ink");
      t.button(/^Personas$/).click(); await sleep(450);
      const caption = document.querySelector(".char-card .meta div > span") || document.querySelector(".char-card .meta div:last-child");
      const artRatio = caption ? t.ratio(getComputedStyle(caption).color, "rgb(6, 9, 20)") : 0;
      t.button(/^Settings$/).click(); await sleep(400);
      const chosen = [...document.querySelectorAll("[data-settings-choice].btn-primary, .settings-graphics-choices .btn-primary")];
      const chosenFlat = chosen.length >= 2 && chosen.every(el => getComputedStyle(el).backgroundImage === "none");
      const chosenMarked = chosen.every(el => /inset/.test(getComputedStyle(el).boxShadow));
      const back = document.querySelector(".modal-back"); if (back) back.click(); await sleep(200);
      const title = document.querySelector("h1.serif");
      return { primaryRatio, warm, cardAnimation, allStill, ring, brass, ringRatio: t.ratio(ring, ink), artRatio, chosenFlat, chosenMarked,
        display: title ? getComputedStyle(title).fontFamily : "" };
    })()`);
    check(tag + ": primary action text is readable (" + r.primaryRatio.toFixed(2) + ":1)", r.primaryRatio >= 4.5, JSON.stringify(r));
    if (theme === "dark" || theme === "light") check(tag + ": primary action uses the brass accent, not the old blue", r.warm, JSON.stringify(r));
    check(tag + ": focus ring is the theme accent and clears 3:1", r.ring === r.brass && r.ringRatio >= 3, JSON.stringify(r));
    check(tag + ": accent text over artwork clears 4.5:1 (" + r.artRatio.toFixed(2) + ":1)", r.artRatio >= 4.5, JSON.stringify(r));
    check(tag + ": chosen Settings options are marked surfaces, not solid buttons", r.chosenFlat && r.chosenMarked, JSON.stringify(r));
    check(tag + ": titles use the display serif", /Palatino|Noto Serif|serif/.test(r.display), r.display);
    if (mode === "quality") check(tag + ": library cards have a short entrance", r.cardAnimation === "rcv-card-in", r.cardAnimation);
    else check(tag + ": Performance leaves every element and pseudo-element still", r.allStill, JSON.stringify(r));
  }
  desk.win.destroy();

  console.log("  -- reduced motion");
  /* ---------- Reduced motion wins over Quality ---------- */
  const calm = await open("", 1280, 860, true);
  await calm.run(SEED); await setLook(calm, "dark", "quality");
  const calmAnim = await calm.run(`(async () => { window.__t.button(/^Characters$/).click(); await new Promise(r => setTimeout(r, 450));
    return [...document.querySelectorAll(".rcv *")].every(el => getComputedStyle(el).animationName === "none"); })()`);
  check("reduced motion removes Quality entrances", calmAnim);
  calm.win.destroy();

  console.log("  -- phone");
  /* ---------- 360px Android phone ---------- */
  const phone = await open("?device=phone", 360, 800);
  await phone.run(SEED); await setLook(phone, "dark", "quality");
  const ph = await phone.run(`(async () => {
    const t = window.__t, sleep = ms => new Promise(r => setTimeout(r, ms));
    const small = scope => [...scope.querySelectorAll("button, select, input:not([type=checkbox]):not([type=radio])")].filter(t.vis)
      .map(el => { const r = el.getBoundingClientRect(); return { el, w: r.width, h: r.height }; })
      .filter(x => x.w < 44 || x.h < 44).map(x => (x.el.getAttribute("aria-label") || x.el.textContent || x.el.tagName).trim().slice(0, 24) + " " + Math.round(x.w) + "x" + Math.round(x.h));
    const out = { dashboardSmall: small(document.querySelector(".rcv")) };
    const tile = document.querySelector('[data-dashboard-gallery="true"] .wtile');
    tile && (tile.querySelector("button") || tile).click(); await sleep(600);
    const lb = document.querySelector(".lb-root");
    out.viewer = !!lb && [[180, 12], [180, 790], [30, 770]].every(([x, y]) => lb.contains(document.elementFromPoint(x, y)));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleep(300);
    t.button(/^Characters$/).click(); await sleep(450);
    const head = document.querySelector(".library-head"), tools = head && head.lastElementChild, search = tools && tools.querySelector("input");
    out.searchRow = !!(search && Math.abs(search.getBoundingClientRect().width - tools.getBoundingClientRect().width) <= 1);
    out.overflow = document.documentElement.scrollWidth - innerWidth;
    out.librarySmall = small(document.querySelector(".rcv"));
    return out;
  })()`);
  check("phone: a picture viewer covers the top and bottom bars", ph.viewer, JSON.stringify(ph));
  check("phone: library search owns a full toolbar row", ph.searchRow, JSON.stringify(ph));
  check("phone: no sideways overflow", ph.overflow <= 0, String(ph.overflow));
  check("phone: Dashboard and library controls are at least 44px", !ph.dashboardSmall.length && !ph.librarySmall.length,
    JSON.stringify([ph.dashboardSmall, ph.librarySmall]));
  phone.win.destroy();

  console.log("  -- tablet");
  /* ---------- Android tablet wider than the phone breakpoint ---------- */
  const tablet = await open("?device=tablet", 800, 1000);
  await tablet.run(SEED); await setLook(tablet, "dark", "quality");
  const tb = await tablet.run(`(async () => {
    const t = window.__t, sleep = ms => new Promise(r => setTimeout(r, ms));
    const size = el => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
    const nav = [...document.querySelectorAll(".sidebar .navitem")].filter(t.vis).map(size);
    t.button(/^Characters$/).click(); await sleep(450);
    const actions = [...document.querySelectorAll(".scrollbody .btn")].filter(t.vis).map(size);
    const card = document.querySelector(".char-card"); card && card.click(); await sleep(600);
    const close = document.querySelector(".closex");
    return { tablet: document.querySelector(".rcv").classList.contains("tablet"), nav, actions, close: close ? size(close) : null };
  })()`);
  check("tablet: detected as an Android tablet", tb.tablet, JSON.stringify(tb));
  check("tablet: side-rail destinations are 48px targets", tb.nav.length >= 5 && tb.nav.every(([w, h]) => w >= 48 && h >= 48), JSON.stringify(tb.nav));
  check("tablet: library actions are 48px tall", tb.actions.length > 0 && tb.actions.every(([, h]) => h >= 48), JSON.stringify(tb.actions));
  check("tablet: record close button is a 48px target", !!tb.close && tb.close[0] >= 48 && tb.close[1] >= 48, JSON.stringify(tb.close));
  tablet.win.destroy();

  clearTimeout(bail);
  console.log(bad ? "\n  " + bad + " check(s) failed" : "\n  All checks passed.");
  finish(bad ? 1 : 0);
}).catch(e => { console.error(e.stack || e); clearTimeout(bail); finish(1); });
