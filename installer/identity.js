"use strict";

const fs = require("fs");
const path = require("path");

// Keep the installed Chat location and registration identity. Changing either
// would create a second installation or make an existing vault look empty.
const PRODUCT_NAME = "Rolecraft";
const LEGACY_ID = "Rolecraft Vault Chat";
const APP_EXE = "Rolecraft.exe";
const LEGACY_EXE = "Rolecraft Vault Chat.exe";

function defaultInstallDir(programFiles) {
  return path.join(programFiles || "C:\\Program Files", LEGACY_ID);
}

function parseRegisteredInstallDir(output) {
  const line = String(output || "").split(/\r?\n/).find(s => /^\s*InstallLocation\s+REG_SZ\s+/i.test(s));
  if (!line) return null;
  const location = line.replace(/^\s*InstallLocation\s+REG_SZ\s+/i, "").trim();
  return path.isAbsolute(location) ? location : null;
}

function cleanupLegacyBranding(dest, publicDir, programData) {
  if (!fs.existsSync(path.join(dest, APP_EXE))) return ["The new Rolecraft executable is missing; older shortcuts were kept."];
  const oldStartDir = path.join(programData, "Microsoft", "Windows", "Start Menu", "Programs", LEGACY_ID);
  const obsolete = [
    path.join(dest, LEGACY_EXE),
    path.join(dest, "Uninstall-RolecraftVaultChat.ps1"),
    path.join(publicDir, "Desktop", LEGACY_ID + ".lnk"),
    path.join(oldStartDir, LEGACY_ID + ".lnk")
  ];
  const warnings = [];
  for (const target of obsolete) {
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } catch (error) {
      warnings.push(path.basename(target) + " could not be removed: " + error.message);
    }
  }
  try {
    if (fs.existsSync(oldStartDir) && fs.readdirSync(oldStartDir).length === 0) fs.rmdirSync(oldStartDir);
  } catch (error) {
    warnings.push("Old Start Menu folder could not be removed: " + error.message);
  }
  return warnings;
}

module.exports = { PRODUCT_NAME, LEGACY_ID, APP_EXE, LEGACY_EXE, defaultInstallDir, parseRegisteredInstallDir, cleanupLegacyBranding };
