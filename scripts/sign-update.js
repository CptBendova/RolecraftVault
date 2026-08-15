#!/usr/bin/env node
/* Rolecraft Vault — update package signer.
   Usage: node sign-update.js <app.js> <version> [notes] [output.rcvup]
   Example: node sign-update.js app.js 1.1.0 "Fixes lorebook import" Rolecraft-update-1.1.0.rcvup
   Requires private_key.pem in the same folder as this script. Keep that key OFFLINE and private —
   anyone holding it can produce updates your app will accept. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* Usage: npm run sign <version> ["notes"]
   Signs app/app.js into dist/Rolecraft-update-<version>.rcvup */
const [, , version, notes = "", outArg] = process.argv;
if (!version) {
  console.error("Usage: npm run sign <version> [\"what changed\"]");
  process.exit(1);
}
const appJsPath = path.join(__dirname, "..", "app", "app.js");
const distDir = path.join(__dirname, "..", "dist");
fs.mkdirSync(distDir, { recursive: true });
const keyPath = path.join(__dirname, "..", "keys", "private_key.pem");
if (!fs.existsSync(keyPath)) {
  console.error("keys/private_key.pem not found. Copy it from your update kit — see keys/README.txt.");
  process.exit(1);
}

const appJs = fs.readFileSync(appJsPath);
const hashes = { "app.js": crypto.createHash("sha256").update(appJs).digest("hex") };
const canon = JSON.stringify({ version, hashes });
const sig = crypto.sign(null, Buffer.from(canon, "utf8"), crypto.createPrivateKey(fs.readFileSync(keyPath))).toString("base64");

const pkg = { version, notes, files: { "app.js": appJs.toString("base64") }, hashes, sig };
const out = outArg || path.join(distDir, "Rolecraft-update-" + version + ".rcvup");
fs.writeFileSync(out, JSON.stringify(pkg));
console.log("Signed update written:", out);
console.log("  version:", version, "| app.js sha256:", hashes["app.js"].slice(0, 16) + "…");
