#!/usr/bin/env node
/* Write user-verifiable hashes for exactly the public release artifacts. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const version = process.argv[2] || require(path.join(root, "app", "package.json")).version;
const dist = path.join(root, "dist");
const names = [
  `Rolecraft-update-${version}.rcvup`,
  `Rolecraft-Vault-Setup-${version}.exe`,
  `Rolecraft-Vault-${version}.apk`,
];
const lines = names.map(name => {
  const file = path.join(dist, name);
  if (!fs.existsSync(file)) throw new Error("Missing release artifact: " + name);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  return digest + "  " + name;
});
const out = path.join(dist, "SHA256SUMS.txt");
fs.writeFileSync(out, lines.join("\n") + "\n", "utf8");
console.log("Checksums written to " + out);
lines.forEach(line => console.log("  " + line));
