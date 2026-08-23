#!/usr/bin/env node
/* Builds mobile/www from the web edition.

   The Android app is the web edition in a WebView, so nothing here rewrites the
   interface: web/ is copied as it stands and one extra script is added that
   supplies window.transfer. Run `npm run build:web` in the repo root first if
   app/app.js has changed, since that is what regenerates the web bundle.

   Deliberately a copy rather than a Capacitor webDir pointing at ../web: the
   page needs an extra script tag that the desktop and browser editions must not
   have, and editing web/index.html for the sake of Android would put mobile-only
   markup into the thing people embed in their own sites. */
const fs = require("fs");
const path = require("path");

const here = path.join(__dirname, "..");
const src = path.join(here, "..", "web");
const out = path.join(here, "www");

if (!fs.existsSync(path.join(src, "js", "rolecraft-app.web.js"))) {
  console.error("web/ has no built bundle. Run `npm run build:web` in the repo root first.");
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.rmSync(path.join(out, "INTEGRATION.md"), { force: true });

/* the transfer half that only exists on Android */
fs.mkdirSync(path.join(out, "js"), { recursive: true });
fs.copyFileSync(path.join(here, "src", "rc-transfer.js"), path.join(out, "js", "rc-transfer.js"));

/* Loaded after the platform layer, because it uses window.storage, and before
   the app, because the app decides at render time whether there is a transfer
   panel to show at all. */
const indexPath = path.join(out, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
const appTag = /<script[^>]+rolecraft-app\.web\.js[^>]*><\/script>/;
if (!appTag.test(html)) {
  console.error("Could not find the app script tag in web/index.html. Has it been restructured?");
  process.exit(1);
}
html = html.replace(appTag, m =>
  '<script src="js/rc-transfer.js"></script>\n    ' + m);
fs.writeFileSync(indexPath, html);

const kb = f => Math.round(fs.statSync(f).size / 1024);
console.log("www built from web/");
console.log("  app bundle   " + kb(path.join(out, "js", "rolecraft-app.web.js")) + " KB");
console.log("  transfer     " + kb(path.join(out, "js", "rc-transfer.js")) + " KB");
console.log("  index.html   loads rc-transfer.js before the app");
