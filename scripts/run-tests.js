#!/usr/bin/env node
/* One command that runs every check in scripts/.

   These checks each exist because something shipped broken, but nothing ran
   them together, so nobody noticed when seven of them stopped working at once:
   they had the old machine's absolute path baked in and had been throwing
   ENOENT since the project moved drives. A runner that fails loudly is the
   point — every check below is trusted only because its exit code is read. */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const p = (...a) => path.join(root, ...a);

/* Every first-party JS file that ships. Vendor React builds are excluded: they
   are third party and minified, and the const scanner has nothing to say. */
const SHIPPED_JS = [
  "app/app.js",
  "app/main.js",
  "app/preload.js",
  "web/js/rolecraft-app.web.js",
  "web/js/rolecraft-web-platform.js",
  "installer/main.js",
  "installer/preload.js",
  "mobile/src/rc-transfer.js",
];

/* Resolve Electron's executable the way electron's own module does. Missing is
   not a pass: npm 11 blocks the postinstall that fetches the binary, so a fresh
   clone can silently have no Electron at all. */
function electronExe() {
  try {
    const exe = require(path.join(root, "node_modules", "electron"));
    return typeof exe === "string" && fs.existsSync(exe) ? exe : null;
  } catch { return null; }
}

const jobs = [];

jobs.push({
  name: "check-integrity",
  what: "every file parses, and the interface makes no network calls",
  cmd: process.execPath,
  args: [p("scripts", "check-integrity.js")],
});

jobs.push({
  name: "scan-js",
  what: "assignment to a const binding, across every shipped file",
  cmd: process.execPath,
  args: [p("scripts", "scan-js.js"), ...SHIPPED_JS.map(f => p(f))],
});

/* Every test-*.js, discovered rather than listed, so a new one is picked up
   without anyone having to remember to add it here. */
const exe = electronExe();
/* A check that drives a real BrowserWindow has to be launched by Electron, not
   by node — under node `require("electron")` hands back a path string and the
   check dies on `app.whenReady`. Decided by reading the file rather than by a
   list of names, so a new browser-driven check does not have to be registered. */
const needsElectron = f => /require\(["']electron["']\)/.test(fs.readFileSync(p("scripts", f), "utf8"));

for (const f of fs.readdirSync(p("scripts")).filter(f => /^test-.*\.js$/.test(f)).sort()) {
  if (f === "test-update-assets.js") continue; // run twice, below
  const el = needsElectron(f);
  jobs.push({
    name: f.replace(/\.js$/, ""),
    cmd: el ? exe : process.execPath,
    args: [p("scripts", f)],
    skip: el && !exe ? "Electron is not installed (npm approve-scripts electron)" : null,
  });
}

for (const mode of [null, "1"]) {
  jobs.push({
    name: "test-update-assets" + (mode ? " (NO_BASE=1)" : ""),
    what: mode ? "a shell older than 1.192, where a bare path must fail" : "the crest under an active patch",
    cmd: exe,
    args: [p("scripts", "test-update-assets.js")],
    env: mode ? { NO_BASE: mode } : {},
    skip: exe ? null : "Electron is not installed (npm approve-scripts electron)",
  });
}

const results = [];
for (const j of jobs) {
  if (j.skip) {
    console.log("\n── " + j.name + " ── SKIPPED: " + j.skip);
    results.push({ name: j.name, status: "skip" });
    continue;
  }
  console.log("\n── " + j.name + (j.what ? " ── " + j.what : ""));
  const r = spawnSync(j.cmd, j.args, {
    cwd: root,
    stdio: "inherit",
    env: Object.assign({}, process.env, j.env || {}),
  });
  const code = r.status === null ? 1 : r.status;
  results.push({ name: j.name, status: code === 0 ? "pass" : "fail", code });
}

const failed = results.filter(r => r.status === "fail");
const skipped = results.filter(r => r.status === "skip");

console.log("\n" + "=".repeat(60));
for (const r of results) {
  const mark = r.status === "pass" ? "✓ pass" : r.status === "skip" ? "- skip" : "✗ FAIL";
  console.log("  " + mark + "  " + r.name + (r.status === "fail" ? "  (exit " + r.code + ")" : ""));
}
console.log("=".repeat(60));
console.log(results.filter(r => r.status === "pass").length + " passed, " +
  failed.length + " failed, " + skipped.length + " skipped");

if (skipped.length) console.log("\nSkipped checks are not passes. Install what they need and run again.");
if (failed.length) process.exit(1);
