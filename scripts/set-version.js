#!/usr/bin/env node
/* Rolecraft Vault — set the displayed version in every place that carries one.
   Usage: npm run set-version 1.092

   The version used to live in five files that had drifted to three different
   values (1.9.2 / 1.0.0 / v1.0). This rewrites them from one argument.

   Note on package.json: npm requires a valid semver there, and the display
   version deliberately isn't one, so the root package.json keeps its own semver
   and is left alone. Nothing user-facing reads it — it only names the npm
   scripts. The update system never compares versions (main.js treats
   pkg.version as a display string), so the two cannot conflict. */
const fs = require("fs");
const path = require("path");

const version = process.argv[2];
if (!version) {
  console.error('Usage: npm run set-version <version>    e.g. npm run set-version 1.092');
  process.exit(1);
}

const root = path.join(__dirname, "..");
const edits = [
  {
    file: "app/app.js",
    find: /^const APP_VERSION = "[^"]*";$/m,
    to: `const APP_VERSION = "${version}";`,
  },
  {
    file: "app/main.js",
    find: /^const FACTORY_BUILD = "[^"]*";$/m,
    to: `const FACTORY_BUILD = "${version}";`,
  },
  {
    file: "app/package.json",
    find: /"version":\s*"[^"]*"/,
    to: `"version": "${version}"`,
  },
  {
    file: "build/installer.nsi",
    find: /^!define VERSION "[^"]*"$/m,
    to: `!define VERSION "${version}"`,
  },
];

let failed = false;
for (const e of edits) {
  const p = path.join(root, e.file);
  const before = fs.readFileSync(p, "utf8");
  if (!e.find.test(before)) {
    console.error(`  MISS  ${e.file} — pattern not found, left unchanged`);
    failed = true;
    continue;
  }
  const after = before.replace(e.find, e.to);
  if (after === before) console.log(`  ok    ${e.file} (already ${version})`);
  else { fs.writeFileSync(p, after); console.log(`  set   ${e.file}`); }
}

if (failed) {
  console.error("\nSome files were not updated. Fix the patterns above before shipping.");
  process.exit(1);
}
console.log(`\nDisplayed version is now ${version}.`);
console.log("Next: npm run check && npm run build:web");
console.log(`      npm run sign ${version} "what changed" && npm run build:installer`);
