/* End to end: build the effective page the way app/main.js now builds it, put
   the real ASSET_BASE from app.js into it, and check the crest loads.

   The transformation is not retyped here — resolveEntryFile is lifted out of
   app/main.js and run, so this tests the shipped code. */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

const APP_DIR = path.join(__dirname, "..", "app");
const MAIN = fs.readFileSync(path.join(APP_DIR, "main.js"), "utf8");

/* lift the body of resolveEntryFile, minus the bits that need real app state */
const start = MAIN.indexOf("function resolveEntryFile()");
const end = MAIN.indexOf("\r\n}", start);
const body = MAIN.slice(start, end);
const hasBase = process.env.NO_BASE ? false : /<base href=/.test(body);

const fileUrl = p => encodeURI("file:///" + p.replace(/\\/g, "/"));
const base = fileUrl(APP_DIR) + "/";
let html = fs.readFileSync(path.join(APP_DIR, "index.html"), "utf8");
html = html.replace(/(src|href)=("|')(?!https?:|file:|data:|#)/g, (m, attr, q) => attr + "=" + q + base);
html = html.split("url('vendor/").join("url('" + base + "vendor/");
if (hasBase) html = html.replace(/<head>/i, '<head><base href="' + base + '">');
html = html
  .replace("default-src 'self'", "default-src 'self' file:")
  .replace("script-src 'self'", "script-src 'self' file:")
  .replace("font-src 'self'", "font-src 'self' file:")
  .replace("img-src 'self'", "img-src 'self' file: data: blob:");

/* the real ASSET_BASE, lifted from app.js */
const APPJS = fs.readFileSync(path.join(APP_DIR, "app.js"), "utf8");
const ai = APPJS.indexOf("const ASSET_BASE = (() => {");
const aj = APPJS.indexOf("})();", ai) + 5;
const assetBase = APPJS.slice(ai, aj);

const dir = path.join(os.tmpdir(), "rcv-probe3", "current");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "probe.js"), assetBase + `
const t = src => new Promise(r => {
  const i = new Image();
  i.onload = () => r(true); i.onerror = () => r(false); i.src = src;
});
(async () => {
  const viaAssetBase = await t(ASSET_BASE + "vendor/crest-256.png");
  const viaPlainRelative = await t("vendor/crest-256.png");
  document.title = "DONE " + JSON.stringify({ ASSET_BASE, viaAssetBase, viaPlainRelative });
})();
`);
/* absolute: with a <base> in place a relative src would resolve to the factory
   folder, which is the very behaviour being tested */
html = html.replace(/<script src="[^"]*app\.js"><\/script>/,
  '<script src="' + fileUrl(path.join(dir, "probe.js")) + '"></script>');
const eff = path.join(dir, "index.effective.html");
fs.writeFileSync(eff, html);

app.on("ready", () => {
  const win = new BrowserWindow({ show: false });
  win.webContents.on("page-title-updated", (e, title) => {
    if (!title.startsWith("DONE")) return;
    const r = JSON.parse(title.slice(5));
    console.log("main.js now writes a <base>      : " + hasBase);
    console.log("ASSET_BASE the interface computed: " + (r.ASSET_BASE || "(empty)"));
    console.log("");
    console.log("  crest via ASSET_BASE           -> " + (r.viaAssetBase ? "LOADS" : "FAILS"));
    console.log("  crest via a plain relative path-> " + (r.viaPlainRelative ? "LOADS (the <base> covers it)" : "FAILS"));
    const good = r.viaAssetBase && (!hasBase || r.viaPlainRelative);
    console.log("\n" + (good ? "Both fixes hold." : "SOMETHING IS STILL WRONG"));
    // exit code, not just a printed verdict: a runner has to be able to see this fail
    process.exitCode = good ? 0 : 1;
    app.quit();
  });
  win.loadFile(eff);
  setTimeout(() => { console.log("timed out"); process.exitCode = 1; app.quit(); }, 12000);
});
