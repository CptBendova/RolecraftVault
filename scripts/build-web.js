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

/* The desktop mount. It is wrapped in the error boundary, so this is two lines
   rather than one; kept as an exact string so a change to the mount still stops
   the build loudly instead of shipping a web bundle that mounts nothing. */
const DESKTOP_MOUNT =
  'ReactDOM.createRoot(document.getElementById("root")).render(\n' +
  '  React.createElement(Boundary, null, React.createElement(RolecraftVault)));';

const WEB_MOUNT = `window.RolecraftVaultMount = function (el) {
  const node = typeof el === "string" ? document.querySelector(el) : el;
  if (!node) throw new Error("RolecraftVaultMount: element not found");
  const root = ReactDOM.createRoot(node);
  root.render(React.createElement(Boundary, null, React.createElement(RolecraftVault)));
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
for (const name of ["vault-sync-core.js", "vault-sync-review.js", "vault-sync.js", "vault-sync-background.js", "vault-sync-ui.js", "private-sync.js"]) fs.copyFileSync(path.join(root,"app",name),path.join(root,"web","js",name));
console.log("Wrote " + path.relative(root, outPath) + " (" + Math.round(web.length / 1024) + " KB)");
for (const [from, to] of [
  [path.join(root, "app", "provider-balances-ui.js"), path.join(root, "web", "js", "provider-balances-ui.js")],
  [path.join(root, "app", "chat-sync-core.js"), path.join(root, "web", "js", "chat-sync-core.js")],
  [path.join(root, "app", "chat-group-coordinator.js"), path.join(root, "web", "js", "chat-group-coordinator.js")],
  [path.join(root, "app", "chat-knowledge-lanes.js"), path.join(root, "web", "js", "chat-knowledge-lanes.js")],
  [path.join(root, "app", "chat-story-ledger.js"), path.join(root, "web", "js", "chat-story-ledger.js")],
  [path.join(root, "app", "chat-draft-handoff.js"), path.join(root, "web", "js", "chat-draft-handoff.js")],
  [path.join(root, "app", "chat-draft-handoff-controller.js"), path.join(root, "web", "js", "chat-draft-handoff-controller.js")],
  [path.join(root, "app", "chat.js"), path.join(root, "web", "js", "rolecraft-chat.js")],
  [path.join(root, "app", "chat.css"), path.join(root, "web", "css", "chat.css")],
]) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log("Copied Rolecraft asset " + path.relative(root, to));
}
for (const name of ["crest-loop.mp4", "crest-256.png", "crest-1024.png", "qrcode.js", "jsQR.js", "jsQR-LICENSE.txt", "jsQR-NOTICE.txt"]) {
  const from = path.join(root, "app", "vendor", name);
  if (!fs.existsSync(from)) continue;
  const dest = path.join(root, "web", "vendor", name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(from, dest);
  console.log("Copied " + name + " into web/vendor/");
}
