#!/usr/bin/env node
/* Generates web/js/rolecraft-app.web.js from app/app.js.
   The only difference is the mount: the desktop build renders into #root at load,
   the web build exposes window.RolecraftVaultMount(el) and auto-mounts if it finds
   #rolecraft-root or #root. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcPath = path.join(root, "app", "app.js");
const outPath = path.join(root, "web", "js", "rolecraft-app.web.js");

const DESKTOP_MOUNT =
  'ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(RolecraftVault));';

const WEB_MOUNT = `window.RolecraftVaultMount = function (el) {
  const node = typeof el === "string" ? document.querySelector(el) : el;
  if (!node) throw new Error("RolecraftVaultMount: element not found");
  const root = ReactDOM.createRoot(node);
  root.render(React.createElement(RolecraftVault));
  return root;
};
(function () {
  const el = document.getElementById("rolecraft-root") || document.getElementById("root");
  if (el && !el.__rcvMounted) { el.__rcvMounted = true; window.RolecraftVaultMount(el); }
})();`;

const app = fs.readFileSync(srcPath, "utf8");
if (app.indexOf(DESKTOP_MOUNT) < 0) {
  console.error("Could not find the desktop mount line in app/app.js.");
  console.error("If the mount code changed, update DESKTOP_MOUNT in this script.");
  process.exit(1);
}
const web = app.replace(DESKTOP_MOUNT, WEB_MOUNT);

try { new Function(web); } catch (e) {
  console.error("Generated web bundle does not parse: " + e.message);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, web);
console.log("Wrote " + path.relative(root, outPath) + " (" + Math.round(web.length / 1024) + " KB)");
const loopSrc = path.join(root, "app", "vendor", "crest-loop.mp4");
if (fs.existsSync(loopSrc)) {
  const loopDest = path.join(root, "web", "vendor", "crest-loop.mp4");
  fs.mkdirSync(path.dirname(loopDest), { recursive: true });
  fs.copyFileSync(loopSrc, loopDest);
  console.log("Copied crest-loop.mp4 into web/vendor/");
}
