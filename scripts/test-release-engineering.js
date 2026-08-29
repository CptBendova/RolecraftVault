/* Release safeguards found by the public-release audit. These are deliberately
   source checks: each one protects the machinery used before an artifact exists. */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

let bad = 0;
function check(label, value) {
  if (!value) bad++;
  console.log("  " + (value ? "PASS" : "FAIL") + "  " + label);
}

console.log("\npublic release engineering");
const pkg = JSON.parse(read("package.json"));
const mobileLock = read("mobile/package-lock.json");
const nsi = read("build/installer.nsi");
const builder = read("scripts/build-installer.js");
const runner = read("scripts/run-tests.js");
check("the Windows runtime is Electron 44 or newer", Number(pkg.devDependencies.electron.split(".")[0]) >= 44);
check("the Android lockfile no longer includes vulnerable xcode", !/node_modules\/xcode/.test(mobileLock));
check("the Android lockfile no longer includes vulnerable uuid 7", !/node_modules\/uuid/.test(mobileLock));
check("the public installer uses solid LZMA compression", /SetCompressor \/SOLID lzma/.test(nsi));
check("the final public installer passes through Authenticode signing", /signWindowsFile\(installerOut\)/.test(builder));
check("the packaged app is rebuilt from the installed Electron runtime", /fs\.rmSync\(staged/.test(builder) && /copyDir\(electronDist, staged\)/.test(builder));
check("Electron tests run from a disposable directory", /cwd: j\.electron \? runRoot : root/.test(runner));
check("release checks run on GitHub", fs.existsSync(path.join(root, ".github", "workflows", "release-checks.yml")));
check("private vulnerability guidance is public", fs.existsSync(path.join(root, "SECURITY.md")));
check("a checksum generator is owned by npm scripts", pkg.scripts.checksums === "node scripts/write-checksums.js");

console.log("\n" + (bad ? bad + " release safeguard(s) missing." : "Every audited release safeguard is present."));
process.exit(bad ? 1 : 0);
