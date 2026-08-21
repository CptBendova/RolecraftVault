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
const shellBuild = fbMatch ? fbMatch[1] : version;
if (shellBuild !== version) {
  console.error("FACTORY_BUILD in app/main.js is " + shellBuild + " but you are signing " + version + ".");
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
  return { tag, needsShell: real.length > 0, lines: real.length, sample: real.slice(0, 8) };
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
  if (needsShell) {
    console.log("  " + detected.lines + " line(s) changed in main.js/preload.js/index.html beyond the version stamp:");
    detected.sample.forEach(l => console.log("    " + l.slice(0, 100)));
  }
} else {
  needsShell = false;
  console.log("Shell change: could not tell (no git, or no earlier tag) — assuming no.");
  console.log("  Pass --shell if this release changed main.js, preload.js or index.html.");
}

const appJs = fs.readFileSync(appJsPath);
const hashes = { "app.js": crypto.createHash("sha256").update(appJs).digest("hex") };
/* The signed form stays {version, hashes} exactly as it has always been. Adding
   fields to it would change what every installed copy computes, so no existing
   build could verify any future patch. shellBuild and needsShell therefore ride
   outside the signature: they steer a helpful refusal, not a security decision,
   and a package still cannot be installed at all without a valid signature. */
const canon = JSON.stringify({ version, hashes });
const sig = crypto.sign(null, Buffer.from(canon, "utf8"), crypto.createPrivateKey(fs.readFileSync(keyPath))).toString("base64");

const pkg = { version, notes, shellBuild, needsShell, files: { "app.js": appJs.toString("base64") }, hashes, sig };
const out = outArg || path.join(distDir, "Rolecraft-update-" + version + ".rcvup");
fs.writeFileSync(out, JSON.stringify(pkg));
console.log("Signed update written:", out);
console.log("  version:", version, "| app.js sha256:", hashes["app.js"].slice(0, 16) + "…");
if (needsShell) {
  console.log("  This patch will be REFUSED on any build other than " + shellBuild + ".");
  console.log("  Ship Rolecraft-Vault-Setup-" + version + ".exe and say so in the release notes.");
}
