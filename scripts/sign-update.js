#!/usr/bin/env node
/* Rolecraft Vault — update package signer.
   Usage: npm run sign <version> ["what changed"] [output.rcvup] [--shell|--no-shell]
   Signs app/app.js into dist/Rolecraft-update-<version>.rcvup
   Requires keys/private_key.pem. Keep that key OFFLINE and private — anyone
   holding it can produce updates your app will accept. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
/* --shell / --no-shell override the check below; they are pulled out first so
   they cannot be mistaken for the notes or the output path. */
const flags = process.argv.slice(2).filter(a => a === "--shell" || a === "--no-shell");
const [version, notes = "", outArg] = process.argv.slice(2).filter(a => !flags.includes(a));
if (!version) {
  console.error("Usage: npm run sign <version> [\"what changed\"] [--shell|--no-shell]");
  process.exit(1);
}
const appJsPath = path.join(root, "app", "app.js");
const distDir = path.join(root, "dist");
fs.mkdirSync(distDir, { recursive: true });
const keyPath = path.join(root, "keys", "private_key.pem");
if (!fs.existsSync(keyPath)) {
  console.error("keys/private_key.pem not found. Copy it from your update kit — see keys/README.txt.");
  process.exit(1);
}

/* The build this patch was signed against. A patch only ever swaps app.js, so if
   the release also changed the shell, installing the patch alone leaves the new
   interface sitting on the old shell — which is how a renderer ends up calling a
   preload function that is not there. Recording the build lets the app say so. */
const mainJs = fs.readFileSync(path.join(root, "app", "main.js"), "utf8");
const fbMatch = mainJs.match(/const FACTORY_BUILD = "([^"]+)"/);
const factoryBuild = fbMatch ? fbMatch[1] : version;
const compatMatch = mainJs.match(/const UPDATE_COMPAT_BUILD = "([^"]+)"/);
const minShellBuild = compatMatch ? compatMatch[1] : factoryBuild;
if (factoryBuild !== version) {
  console.error("FACTORY_BUILD in app/main.js is " + factoryBuild + " but you are signing " + version + ".");
  console.error("Run: npm run set-version " + version);
  process.exit(1);
}

/* Does this release need the installer? Compare the three files a patch cannot
   reach against the last release tag. main.js changes every single time — the
   version stamp is rewritten by set-version — so a diff that touches nothing but
   that line does not count. */
function shellChangedSinceLastRelease() {
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  let tag;
  try {
    tag = git(["tag", "--list", "v*", "--sort=-v:refname"])
      .split("\n").map(s => s.trim()).filter(Boolean)
      .find(t => t !== "v" + version);
  } catch { return null; }
  if (!tag) return null;
  let diff;
  try {
    diff = git(["diff", "--unified=0", tag, "--", "app/main.js", "app/preload.js", "app/index.html"]);
  } catch { return null; }
  const touched = diff.split("\n").filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  const real = touched.filter(l => !/^[+-]const FACTORY_BUILD = /.test(l));
  /* app/vendor/ needs the installer too. A .rcvup carries app.js alone, so a
     changed font, crest or React build reaches nobody — which is exactly how a
     broken crest once shipped. These are binaries, so compare names, not lines. */
  let vendor = [];
  try {
    vendor = git(["diff", "--name-only", tag, "--", "app/vendor/"])
      .split("\n").map(s => s.trim()).filter(Boolean);
  } catch { /* leave empty; the line diff above still stands */ }
  return {
    tag,
    needsShell: real.length > 0 || vendor.length > 0,
    lines: real.length,
    sample: real.slice(0, 8),
    vendor,
  };
}

const forced = flags.includes("--shell") ? true : flags.includes("--no-shell") ? false : null;
const detected = shellChangedSinceLastRelease();
let needsShell;
if (forced !== null) {
  needsShell = forced;
  console.log("Shell change: " + (forced ? "yes" : "no") + " (forced with " + (forced ? "--shell" : "--no-shell") + ")");
} else if (detected) {
  needsShell = detected.needsShell;
  console.log("Shell change: " + (needsShell ? "YES" : "no") + " (against " + detected.tag + ")");
  if (detected.lines) {
    console.log("  " + detected.lines + " line(s) changed in main.js/preload.js/index.html beyond the version stamp:");
    detected.sample.forEach(l => console.log("    " + l.slice(0, 100)));
  }
  if (detected.vendor.length) {
    console.log("  " + detected.vendor.length + " file(s) changed in app/vendor/ — a patch cannot carry these:");
    detected.vendor.slice(0, 8).forEach(f => console.log("    " + f));
  }
} else {
  needsShell = false;
  console.log("Shell change: could not tell (no git, or no earlier tag) — assuming no.");
  console.log("  Pass --shell if this release changed main.js, preload.js or index.html.");
}

if (needsShell && minShellBuild !== version) {
  console.error("UPDATE_COMPAT_BUILD in app/main.js is " + minShellBuild + " but this release changes the shell.");
  console.error("Set UPDATE_COMPAT_BUILD to " + version + " so future cumulative updates cannot skip it.");
  process.exit(1);
}

/* Older installed shells understand only needsShell + shellBuild and compare
   them exactly. Keep that legacy flag on every modern package, pointing it at
   the compatibility floor. Old shells below the floor fail closed; current
   shells use the signed minimum and accept any equal or newer factory build. */
const legacyNeedsShell = true;
const shellBuild = minShellBuild;

const appJs = fs.readFileSync(appJsPath);
/* Routing metadata lives inside hashes because that object has always been part
   of the signature. Older builds still verify it without needing to understand
   the reserved keys, while current builds no longer trust mutable top-level
   fields to decide whether a patch requires the installer. */
const hashes = {
  "app.js": crypto.createHash("sha256").update(appJs).digest("hex"),
  "meta:needsShell": legacyNeedsShell ? "1" : "0",
  "meta:shellBuild": shellBuild,
  "meta:minShellBuild": minShellBuild,
};
const canon = JSON.stringify({ version, hashes });
const sig = crypto.sign(null, Buffer.from(canon, "utf8"), crypto.createPrivateKey(fs.readFileSync(keyPath))).toString("base64");

/* Keep the top-level copies for old installed shells. New shells derive both
   values from the signed entries above. */
const pkg = { version, notes, shellBuild, needsShell: legacyNeedsShell, minShellBuild, files: { "app.js": appJs.toString("base64") }, hashes, sig };
const out = outArg || path.join(distDir, "Rolecraft-update-" + version + ".rcvup");
fs.writeFileSync(out, JSON.stringify(pkg));
console.log("Signed update written:", out);
console.log("  version:", version, "| app.js sha256:", hashes["app.js"].slice(0, 16) + "…");
console.log("  Windows shell compatibility: build " + minShellBuild + " or newer.");
if (needsShell) {
  console.log("  This release changes the shell, so existing builds need the full installer.");
  console.log("  Ship Rolecraft-Vault-Setup-" + version + ".exe and say so in the release notes.");
}
