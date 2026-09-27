/* `npm run checksums` must hash exactly the files a release build produces.
   It still expected the old Rolecraft-Vault-Setup/Rolecraft-Vault names after
   the installer and APK were renamed, so it would stop with "Missing release
   artifact" on a real release. Run the shipped script in a scratch copy of
   the repo against the installer name that installer.nsi and
   build-installer.js actually write, plus the published APK and patch names. */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const nsi = fs.readFileSync(path.join(root, "build", "installer.nsi"), "utf8");
const builder = fs.readFileSync(path.join(root, "scripts", "build-installer.js"), "utf8");
const outFile = /OutFile "\.\.\\dist\\([^"]+)"/.exec(nsi);
assert(outFile, "installer.nsi names its output");
const installerPattern = outFile[1];
assert(builder.includes("`" + installerPattern.replace("${VERSION}", "${stampVersion}") + "`"),
  "build-installer.js and installer.nsi agree on the installer name");

const version = "9.999";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-checksums-"));
try {
  fs.mkdirSync(path.join(tmp, "scripts"));
  fs.mkdirSync(path.join(tmp, "app"));
  fs.mkdirSync(path.join(tmp, "dist"));
  fs.copyFileSync(path.join(root, "scripts", "write-checksums.js"), path.join(tmp, "scripts", "write-checksums.js"));
  fs.writeFileSync(path.join(tmp, "app", "package.json"), JSON.stringify({ version }));
  const produced = [
    installerPattern.replace("${VERSION}", version),   // what the installer build writes
    `Rolecraft-update-${version}.rcvup`,                  // what npm run sign writes
    `Rolecraft-${version}.apk`,                           // the published APK name
  ];
  for (const name of produced) fs.writeFileSync(path.join(tmp, "dist", name), "artifact " + name);
  execFileSync(process.execPath, [path.join(tmp, "scripts", "write-checksums.js")], { stdio: "pipe" });
  const sums = fs.readFileSync(path.join(tmp, "dist", "SHA256SUMS.txt"), "utf8").trim().split("\n");
  assert.strictEqual(sums.length, produced.length, "one line per release artifact");
  for (const name of produced) assert(sums.some(line => line.endsWith("  " + name)), "SHA256SUMS lists " + name);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
const sign = fs.readFileSync(path.join(root, "scripts", "sign-update.js"), "utf8");
assert(!/Rolecraft-Vault-Setup-/.test(sign), "sign-update names the current installer file");
console.log("PASS checksums cover the installer, update and APK names the release build produces");
