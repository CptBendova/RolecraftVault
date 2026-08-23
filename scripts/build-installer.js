#!/usr/bin/env node
/* Builds the HD Windows installer.

   1. Syncs app/ into dist/Rolecraft Vault/ (the product)
   2. Stages an Electron "Setup" app whose window is installer/index.html
      and whose payload is that product folder
   3. Wraps the Setup app in a silent NSIS exe so there is one file to run

   Needs a packaged Electron app in dist/Rolecraft Vault/ — see README.
   Needs NSIS (makensis). */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const staged = path.join(root, "dist", "Rolecraft Vault");
const runtime = path.join(root, "dist", "Rolecraft-Setup-runtime");
const nsi = path.join(root, "build", "installer.nsi");
const electronDist = path.join(root, "node_modules", "electron", "dist");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

if (!fs.existsSync(staged)) {
  console.error("Missing: dist/Rolecraft Vault/");
  console.error("Unzip the portable build there, then copy your current app/ over");
  console.error("dist/Rolecraft Vault/resources/app/ before building. See README.md.");
  process.exit(1);
}

const target = path.join(staged, "resources", "app");
for (const f of ["main.js", "preload.js", "index.html", "app.js", "package.json", "icon.ico", "icon.png", path.join("vendor", "qrcode.js"), path.join("vendor", "crest-loop.mp4")]) {
  const from = path.join(root, "app", f);
  if (fs.existsSync(from)) {
    const dest = path.join(target, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(from, dest);
  }
}
console.log("Synced app/ into the packaged build.");

const stampVersion = require(path.join(root, "app", "package.json")).version;
const rcedit = path.join(path.dirname(require.resolve("rcedit")), "..", "bin", "rcedit-x64.exe");
const stamp = (exe, icon, name, orig) => {
  execFileSync(rcedit, [exe,
    "--set-icon", icon,
    "--set-version-string", "ProductName", name,
    "--set-version-string", "FileDescription", name,
    "--set-version-string", "CompanyName", "Rolecraft",
    "--set-version-string", "LegalCopyright", "Rolecraft",
    "--set-version-string", "InternalName", name,
    "--set-version-string", "OriginalFilename", orig,
    "--set-file-version", stampVersion + ".0.0",
    "--set-product-version", stampVersion + ".0.0",
  ], { stdio: "inherit" });
};

const appExe = path.join(staged, "Rolecraft Vault.exe");
try {
  stamp(appExe, path.join(root, "app", "icon.ico"), "Rolecraft Vault", "Rolecraft Vault.exe");
  console.log("Stamped the app exe.");
} catch (e) {
  console.warn("Could not stamp the app exe: " + e.message);
}

if (!fs.existsSync(electronDist)) {
  console.error("Missing node_modules/electron/dist — run npm install.");
  process.exit(1);
}

fs.rmSync(runtime, { recursive: true, force: true });
copyDir(electronDist, runtime);
const setupExe = path.join(runtime, "Rolecraft Vault Setup.exe");
fs.renameSync(path.join(runtime, "electron.exe"), setupExe);
fs.rmSync(path.join(runtime, "resources", "default_app.asar"), { force: true });

const setupApp = path.join(runtime, "resources", "app");
fs.mkdirSync(setupApp, { recursive: true });
for (const f of ["main.js", "preload.js", "index.html", "package.json", "backdrop.jpg"]) {
  const from = path.join(root, "installer", f);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(setupApp, f));
}
fs.copyFileSync(path.join(root, "app", "icon.ico"), path.join(setupApp, "icon.ico"));
fs.copyFileSync(path.join(root, "app", "icon.png"), path.join(setupApp, "icon.png"));
copyDir(path.join(root, "app", "vendor", "fonts"), path.join(setupApp, "fonts"));
copyDir(staged, path.join(runtime, "resources", "payload"));
console.log("Staged HD setup app with payload.");

try {
  stamp(setupExe, path.join(root, "build", "setup-icon.ico"), "Rolecraft Vault Setup", "Rolecraft-Vault-Setup.exe");
  console.log("Stamped the setup exe.");
} catch (e) {
  console.warn("Could not stamp the setup exe: " + e.message);
}

const makensis = [
  path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "NSIS", "makensis.exe"),
  path.join(process.env.ProgramFiles || "C:\\Program Files", "NSIS", "makensis.exe"),
].find(p => fs.existsSync(p)) || "makensis";

try {
  execFileSync(makensis, ["-V2", nsi], { stdio: "inherit", cwd: root });
} catch (e) {
  console.error("\nmakensis failed or is not installed (winget install NSIS.NSIS).");
  process.exit(1);
}
console.log("Installer written to " + path.join(root, "dist", `Rolecraft-Vault-Setup-${stampVersion}.exe`));
