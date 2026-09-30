/* The 1.342 audit fixes, driven against the real interface.

   - Escape closes Settings, the backup warning (only that one), New lorebook and
     the character editor, through the same capture-phase route as every modal.
   - Library stats can be opened without the sidebar (Settings and Search), which
     is all a phone has.
   - The character editor does not open with Delete focused.
   - On a 360px phone the lore entry viewer keeps its buttons inside the card and
     the character page starts below the close button.
   - Light theme: the empty portrait box is a light field with readable text.
   - Chat no longer uses window.confirm; the firewall help names Rolecraft.

   Needs Electron. */
const { app, BrowserWindow } = require("electron");
const path = require("path"), os = require("os"), fs = require("fs");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-audit342-"));
app.setPath("userData", tmp);
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.on("window-all-closed", () => {});

const pre = path.join(tmp, "pre.js");
fs.writeFileSync(pre, `
  if (process.argv.includes('--as-phone')) {
    window.Capacitor = { isNativePlatform: () => true, Plugins: {}, nativePromise: async () => ({}) };
    Object.defineProperty(screen, 'width', { value: 360 }); Object.defineProperty(screen, 'height', { value: 800 });
  }
`);

let bad = 0;
const check = (label, ok, detail) => { if (!ok) bad++; console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (ok || detail === undefined ? "" : "  " + JSON.stringify(detail))); };
const wait = ms => new Promise(r => setTimeout(r, ms));
setTimeout(() => { console.log("  timed out"); app.exit(2); }, 240000);

const SEED = `(async () => {
  const s = window.storage, now = Date.now();
  await s.set("chars:all", JSON.stringify([{ id: "c1", name: "Audit Subject", age: "30", gender: "F", pronouns: "she/her", tagline: "Line", tags: [], searchables: [],
    profileImg: "", banner: "", variants: [], gallery: [], albums: [], imgMeta: {}, history: [], story: "Some words.", personality: "More words.",
    sections: [], createdAt: now, updatedAt: now }]));
  await s.set("personas:all", "[]"); await s.set("prompts:all", "[]");
  await s.set("lore:all", JSON.stringify([{ id: "l1", world: "Atlas", title: "The capital of a very long-named realm", content: "The capital sits on three rivers. ".repeat(20),
    triggers: ["capital", "harbour city"], images: [], sections: [], createdAt: now, updatedAt: now }]));
})()`;

async function open(phone, theme) {
  const win = new BrowserWindow({ show: true, width: phone ? 360 : 1300, height: phone ? 800 : 900, useContentSize: true,
    webPreferences: { preload: pre, additionalArguments: phone ? ["--as-phone"] : [], contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  win.setContentSize(phone ? 360 : 1300, phone ? 800 : 900);
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(2200);
  await win.webContents.executeJavaScript(SEED);
  if (theme) await win.webContents.executeJavaScript("localStorage.setItem('rcv-theme'," + JSON.stringify(theme) + "); true");
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await win.webContents.executeJavaScript("new Promise(r => { const t = setInterval(() => { if (document.querySelector('.rcv[data-rcv-state=ready]')) { clearInterval(t); r(true); } }, 100); })");
  await wait(900);
  // a fresh profile shows "What's new" for this version; put it away first
  await win.webContents.executeJavaScript("(async () => { const d = [...document.querySelectorAll('.modal-back')].find(e => /What.s new/.test(e.textContent || '')); if (d) { const c = [...d.querySelectorAll('button')].find(b => /^Close/.test((b.textContent || '').trim())); if (c) c.click(); await new Promise(r => setTimeout(r, 500)); } })()");
  win.show(); win.focus(); win.webContents.focus();
  return win;
}
const run = (win, code) => win.webContents.executeJavaScript(code);
const HELP = `(() => {
  if (window.__t) return true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden"; };
  const btn = (re, scope) => [...(scope || document).querySelectorAll("button,[role=button],summary")].filter(vis).find(b => re.test((b.getAttribute("aria-label") || b.textContent || "").trim().replace(/\\s+/g, " ")));
  const click = async (re, scope) => { const b = btn(re, scope); if (!b) throw new Error("missing " + re + " among: " + [...document.querySelectorAll("button")].filter(vis).map(x => (x.getAttribute("aria-label") || x.textContent || "").trim().slice(0, 24)).join(" | ")); b.click(); await sleep(500); return true; };
  const clickText = async re => { let el = null; for (let t = 0; t < 20 && !el; t++) { const c = [...document.querySelectorAll("body *")].filter(e => vis(e) && re.test((e.textContent || "").trim())); el = c.filter(e => ![...e.children].some(k => c.includes(k))).pop() || null; if (!el) await sleep(200); } if (!el) throw new Error("missing text " + re); el.scrollIntoView({ block: "center" }); el.click(); await sleep(600); return true; };
  window.__t = { sleep, vis, btn, click, clickText };
  return true;
})()`;
const escape = async win => {
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await wait(800);
};
const reload = async win => {
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await run(win, "new Promise(r => { const t = setInterval(() => { if (document.querySelector('.rcv[data-rcv-state=ready]')) { clearInterval(t); r(true); } }, 100); })");
  await run(win, HELP); await wait(700);
  win.focus(); win.webContents.focus();
};

app.whenReady().then(async () => {
  // ---- static promises ----
  const chatSrc = fs.readFileSync(path.join(ROOT, "app", "chat.js"), "utf8");
  check("Chat never calls window.confirm", !/window\.confirm\(/.test(chatSrc.replace(/\/\*[\s\S]*?\*\//g, "")));
  check("Chat's creativity label has a default", !/"Creativity · " \+ active\.temperature\)/.test(chatSrc));
  for (const f of ["vault-sync.js", "vault-sync-ui.js"]) {
    check(f + " tells people to allow Rolecraft, not Rolecraft Vault, through the firewall", !/allow Rolecraft Vault through/.test(fs.readFileSync(path.join(ROOT, "app", f), "utf8")));
  }

  // ---- desktop ----
  const win = await open(false, "light");
  await run(win, HELP);

  await run(win, `window.__t.click(/^Settings$/)`);
  check("Settings has a Library stats row", await run(win, `!!window.__t.btn(/Library stats/, document.querySelector(".settings-modal"))`));
  await escape(win);
  check("Escape closes Settings", await run(win, `!document.querySelector(".settings-modal")`));

  await run(win, `window.__t.click(/^Settings$/)`);
  await run(win, `window.__t.click(/Export backup/)`);
  const two = await run(win, `document.querySelectorAll(".modal-back").length`);
  await escape(win);
  const one = await run(win, `document.querySelectorAll(".modal-back").length`);
  check("Escape closes only the backup warning, leaving Settings", two === 2 && one === 1, { two, one });
  await escape(win);
  check("a second Escape closes Settings", await run(win, `document.querySelectorAll(".modal-back").length`) === 0);

  await reload(win);
  await run(win, `window.__t.click(/^Lorebooks$/)`);
  await run(win, `window.__t.click(/New lorebook/)`);
  check("New lorebook dialog opens", await run(win, `!!document.querySelector('[aria-label="New lorebook"]')`));
  await escape(win);
  check("Escape closes New lorebook", await run(win, `!document.querySelector('[aria-label="New lorebook"]')`));

  await reload(win);
  await run(win, `window.__t.click(/^Characters$/)`);
  await run(win, `(document.querySelector(".char-card")).click(); window.__t.sleep(900)`);
  await wait(1000);
  await run(win, `window.__t.click(/Edit character/, document.querySelector(".scrollbody.sheet"))`);
  await wait(500);
  const focus = await run(win, `(() => { const a = document.activeElement; return a ? (a.tagName + ":" + (a.textContent || "").trim().slice(0, 30)) : "none"; })()`);
  check("the character editor does not open with Delete focused", !/Delete/i.test(focus), focus);
  const box = await run(win, `(() => { const b = document.querySelector('[aria-label^="Upload portrait"]'); if (!b) return null; const cs = getComputedStyle(b); const m = cs.backgroundColor.match(/[\\d.]+/g).map(Number); const lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; return { bg: cs.backgroundColor, lum: lum }; })()`);
  check("Light theme: the empty portrait box is a light field", box && box.lum > 0.75, box);
  await escape(win);
  check("Escape leaves the untouched character editor", await run(win, `!document.querySelector('[aria-label="Edit character"]')`));

  await reload(win);
  await run(win, `window.__t.click(/^Settings$/)`);
  await run(win, `window.__t.click(/Library stats/, document.querySelector(".settings-modal"))`);
  await wait(900);
  check("Library stats opens from Settings", await run(win, `!!document.querySelector('[role=dialog]') && /stats|vault/i.test(document.body.innerText)`));
  win.destroy();

  // ---- phone ----
  const ph = await open(true, "dark");
  await run(ph, HELP);
  await run(ph, `window.__t.click(/^Lorebooks$/)`);
  await run(ph, `window.__t.clickText(/^Atlas/)`);
  await run(ph, `window.__t.clickText(/The capital of a very/)`);
  const lore = await run(ph, `(() => { const card = document.querySelector('[role=dialog][aria-label*="capital"]'); if (!card) return null; const r = card.getBoundingClientRect(); const out = [...card.querySelectorAll("button")].filter(b => { const x = b.getBoundingClientRect(); return x.width > 0 && (x.right > r.right + 1 || x.left < r.left - 1); }).map(b => b.textContent); const ed = [...card.querySelectorAll("button")].find(b => /^Edit$/.test(b.textContent.trim())); return { scrollW: card.scrollWidth, clientW: card.clientWidth, outside: out, edit: !!ed }; })()`);
  check("phone lore entry: the card does not scroll sideways", lore && lore.scrollW <= lore.clientW + 1, lore);
  check("phone lore entry: every button sits inside the card", lore && lore.outside.length === 0 && lore.edit, lore);
  await reload(ph);
  await run(ph, `window.__t.click(/^Characters$/)`);
  await run(ph, `(document.querySelector(".char-card")).click(); window.__t.sleep(900)`);
  await wait(1200);
  const hero = await run(ph, `(() => { const h = document.querySelector(".hero .hero-inner"); const x = document.querySelector(".closex"); return h && x ? { pad: parseFloat(getComputedStyle(h).paddingTop), closeBottom: x.getBoundingClientRect().bottom, portraitTop: (h.querySelector(".tile") || h).getBoundingClientRect().top } : null; })()`);
  check("phone character page starts below the close button", hero && hero.portraitTop >= hero.closeBottom, hero);
  ph.destroy();

  if (bad) { console.log("\n" + bad + " check(s) failed"); app.exit(1); return; }
  console.log("\nPASS: 1.342 audit fixes");
  app.exit(0);
}).catch(e => { console.error(e.stack); app.exit(1); });
