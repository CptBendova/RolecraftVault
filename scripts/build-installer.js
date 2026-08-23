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
for (const f of ["main.js", "preload.js", "index.html", "app.js", "package.json", "icon.ico", "icon.png", path.join("vendor", "qrcode.js")]) {
  const from = path.join(root, "app", f);
  if (fs.existsSync(from)) {
    const dest = path.join(target, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(from, dest);
  }
}
console.log("Synced app/ into the packaged build.");

// the display version (app/package.json), not the npm semver in the root one
const stampVersion = require(path.join(root, "app", "package.json")).version;
// The packaged exe is a renamed electron.exe: without this it shows
// Electron's own icon and identifies itself as Electron everywhere Windows
// looks at file properties. dist/ is gitignored and rebuilt from scratch, so
// this has to run on every build rather than once by hand.
const exe = path.join(staged, "Rolecraft Vault.exe");
try {
  const rcedit = path.join(path.dirname(require.resolve("rcedit")), "..", "bin", "rcedit-x64.exe");
  execFileSync(rcedit, [exe,
    "--set-icon", path.join(root, "app", "icon.ico"),
    "--set-version-string", "ProductName", "Rolecraft Vault",
    "--set-version-string", "FileDescription", "Rolecraft Vault",
    "--set-version-string", "CompanyName", "Rolecraft",
    "--set-version-string", "LegalCopyright", "Rolecraft",
    "--set-version-string", "InternalName", "Rolecraft Vault",
    "--set-version-string", "OriginalFilename", "Rolecraft Vault.exe",
    "--set-file-version", stampVersion + ".0.0",
    "--set-product-version", stampVersion + ".0.0",
  ], { stdio: "inherit" });
  console.log("Stamped the exe with the app icon and version details.");
} catch (e) {
  console.warn("Could not stamp the exe icon (npm i -D rcedit): " + e.message);
  console.warn("The installer will still build, but the app will wear Electron's icon.");
}


// winget's NSIS does not put makensis on PATH, so prefer the usual install spots
// and fall back to a bare PATH lookup only if neither is there.
const makensis = [
  path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "NSIS", "makensis.exe"),
  path.join(process.env.ProgramFiles || "C:\\Program Files", "NSIS", "makensis.exe"),
].find(p => fs.existsSync(p)) || "makensis";

const version = stampVersion;
try {
  execFileSync(makensis, ["-V2", nsi], { stdio: "inherit", cwd: root });
} catch (e) {
  console.error("\nmakensis failed or is not installed (winget install NSIS.NSIS).");
  process.exit(1);
}
console.log("Installer written to " + path.join(root, "dist", `Rolecraft-Vault-Setup-${version}.exe`));
