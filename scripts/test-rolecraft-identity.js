#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const root = path.join(__dirname, "..");
const identity = require(path.join(root, "installer", "identity.js"));
const source = file => fs.readFileSync(path.join(root, file), "utf8");

assert.strictEqual(identity.PRODUCT_NAME, "Rolecraft");
assert.strictEqual(identity.defaultInstallDir("C:\\Programs"), path.join("C:\\Programs", identity.LEGACY_ID), "upgrades keep the installed Chat location");
assert.strictEqual(identity.parseRegisteredInstallDir("\r\n    InstallLocation    REG_SZ    C:\\Custom\\Rolecraft Vault Chat\r\n"), "C:\\Custom\\Rolecraft Vault Chat");
assert.strictEqual(identity.parseRegisteredInstallDir("InstallLocation REG_SZ relative\\path"), null, "untrusted relative registry paths are ignored");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rolecraft-identity-"));
try {
  const dest = path.join(temp, "app");
  const publicDir = path.join(temp, "public");
  const programData = path.join(temp, "program-data");
  const oldStart = path.join(programData, "Microsoft", "Windows", "Start Menu", "Programs", identity.LEGACY_ID);
  fs.mkdirSync(dest, { recursive: true });
  fs.mkdirSync(path.join(publicDir, "Desktop"), { recursive: true });
  fs.mkdirSync(oldStart, { recursive: true });
  const oldExe = path.join(dest, identity.LEGACY_EXE);
  const oldUninstaller = path.join(dest, "Uninstall-RolecraftVaultChat.ps1");
  const oldDesktop = path.join(publicDir, "Desktop", identity.LEGACY_ID + ".lnk");
  const oldStartShortcut = path.join(oldStart, identity.LEGACY_ID + ".lnk");
  const unrelated = path.join(dest, "keep-me.dat");
  for (const file of [oldExe, oldUninstaller, oldDesktop, oldStartShortcut, unrelated]) fs.writeFileSync(file, "fixture");

  assert(identity.cleanupLegacyBranding(dest, publicDir, programData).length > 0, "cleanup cannot run before the replacement executable exists");
  assert(fs.existsSync(oldExe));
  fs.writeFileSync(path.join(dest, identity.APP_EXE), "new-app");
  assert.deepStrictEqual(identity.cleanupLegacyBranding(dest, publicDir, programData), []);
  for (const file of [oldExe, oldUninstaller, oldDesktop, oldStartShortcut]) assert(!fs.existsSync(file), `obsolete artifact remains: ${file}`);
  assert(fs.existsSync(path.join(dest, identity.APP_EXE)) && fs.existsSync(unrelated), "cleanup retains the replacement and unrelated files");
  assert.deepStrictEqual(identity.cleanupLegacyBranding(dest, publicDir, programData), [], "cleanup is safe to repeat");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

const main = source("app/main.js");
assert(main.includes('app.setName("Rolecraft")'));
assert(main.includes('app.setPath("userData", path.join(app.getPath("appData"), "Rolecraft Vault Chat"))'), "existing Chat data path must stay intact");
const installer = source("installer/main.js");
assert(installer.includes("parseRegisteredInstallDir(output)"), "custom legacy install locations remain discoverable");
assert(installer.includes("cleanupLegacyBranding(dest,"), "only successful installs tidy old branding");
assert(installer.includes("Uninstall\\\\${LEGACY_ID}"), "legacy uninstall registration remains the upgrade identity");
assert.strictEqual(JSON.parse(source("app/package.json")).productName, "Rolecraft");
assert.strictEqual(JSON.parse(source("installer/package.json")).productName, "Rolecraft Setup");
const build = source("scripts/build-installer.js");
assert(build.includes('"identity.js"'), "the installer payload carries its identity helper");
assert(build.includes('`Rolecraft-Setup-${stampVersion}.exe`'));
const nsi = source("build/installer.nsi");
assert(nsi.includes('!define APP_NAME "Rolecraft"'));
assert(nsi.includes('ExecWait \'"$PLUGINSDIR\\Rolecraft Setup.exe"\''));
console.log("Rolecraft Windows identity, upgrade path and narrow legacy cleanup passed");
