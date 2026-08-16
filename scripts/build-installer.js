#!/usr/bin/env node
/* Builds the Windows installer.
   Requires NSIS (makensis) on PATH:  winget install NSIS.NSIS
   Also needs a packaged Electron app in dist/Rolecraft Vault/ — see README. */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const staged = path.join(root, "dist", "Rolecraft Vault");
const nsi = path.join(root, "build", "installer.nsi");

if (!fs.existsSync(staged)) {
  console.error("Missing: dist/Rolecraft Vault/");
  console.error("Unzip the portable build there, then copy your current app/ over");
  console.error("dist/Rolecraft Vault/resources/app/ before building. See README.md.");
  process.exit(1);
}

// keep the packaged copy in step with the working app/ folder
const target = path.join(staged, "resources", "app");
for (const f of ["main.js", "preload.js", "index.html", "app.js", "package.json"]) {
  const from = path.join(root, "app", f);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(target, f));
}
console.log("Synced app/ into the packaged build.");

// winget's NSIS does not put makensis on PATH, so prefer the usual install spots
// and fall back to a bare PATH lookup only if neither is there.
const makensis = [
  path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "NSIS", "makensis.exe"),
  path.join(process.env.ProgramFiles || "C:\\Program Files", "NSIS", "makensis.exe"),
].find(p => fs.existsSync(p)) || "makensis";

// the display version (app/package.json), not the npm semver in the root package.json
const version = require(path.join(root, "app", "package.json")).version;
try {
  execFileSync(makensis, ["-V2", nsi], { stdio: "inherit", cwd: root });
} catch (e) {
  console.error("\nmakensis failed or is not installed (winget install NSIS.NSIS).");
  process.exit(1);
}
console.log("Installer written to " + path.join(root, "dist", `Rolecraft-Vault-Setup-${version}.exe`));
