"use strict";

// Copy sealed records, never plaintext, into a new private directory. The
// original and any existing Chat library are never changed. A single pointer
// publishes the verified snapshot only after every file has arrived.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const POINTER = "standard-import.json";

function prepareChatEncryption(source, destination) {
  // Chromium's safeStorage key belongs to its Local State, not merely the
  // Windows account. Keep a dedicated copied context for imported ciphertext.
  // This must run before Electron's ready event initializes OSCrypt.
  const runtime = path.join(destination, "standard-encryption");
  const target = path.join(runtime, "Local State");
  if (fs.existsSync(target)) {
    const saved = JSON.parse(fs.readFileSync(target, "utf8"));
    if (!saved.os_crypt || !saved.os_crypt.encrypted_key) throw new Error("The copied Windows encryption context is missing.");
    return runtime;
  }
  if (!importedProfile(destination) && !isStarterProfile(destination)) return destination;
  const original = path.join(source, "Local State");
  if (!fs.existsSync(original)) return destination;
  const state = JSON.parse(fs.readFileSync(original, "utf8"));
  if (!state.os_crypt || !state.os_crypt.encrypted_key) return destination;
  fs.mkdirSync(runtime, { recursive: true });
  const pending = path.join(runtime, "encrypted-context-" + crypto.randomUUID() + ".tmp");
  fs.writeFileSync(pending, JSON.stringify({ os_crypt: state.os_crypt }), { flag: "wx" });
  fs.linkSync(pending, target);
  fs.unlinkSync(pending);
  return runtime;
}

function importedProfile(profile) {
  const file = path.join(profile, POINTER);
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!value || !/^standard-copy-[a-f0-9-]{36}$/.test(value.directory)) throw new Error("The imported library pointer is damaged.");
  const selected = path.join(profile, value.directory);
  if (!fs.statSync(path.join(selected, "vault")).isDirectory()) throw new Error("The imported library is missing.");
  return selected;
}

function isStarterProfile(profile) {
  if (fs.existsSync(path.join(profile, "security.json"))) return false;
  const vault = path.join(profile, "vault");
  if (!fs.existsSync(vault)) return true;
  // These three bookkeeping files are written even before a first character.
  const allowed = new Set(["thumbver.dat", "ui%3Alastseenversion.dat", "ui%3Aonboarded.dat"]);
  return fs.readdirSync(vault, { withFileTypes: true }).every(e => e.isFile() && allowed.has(e.name));
}

function manifest(profile) {
  for (const name of ["rewrap.json", "restore.json"]) {
    if (fs.existsSync(path.join(profile, name))) throw new Error("Open and close the standard app to finish its pending library operation, then reopen Chat.");
  }
  const vault = path.join(profile, "vault");
  if (!fs.existsSync(vault)) return [];
  const files = fs.readdirSync(vault).filter(name => name.endsWith(".dat")).map(name => path.join("vault", name));
  if (fs.existsSync(path.join(profile, "security.json"))) files.push("security.json");
  return files.sort().map(name => {
    const stat = fs.lstatSync(path.join(profile, name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("The standard library contains an unsupported file.");
    return { name, size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs };
  });
}

async function digest(file) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

async function migrateStandardVault({ source, destination, onProgress = () => {} }) {
  source = path.resolve(source); destination = path.resolve(destination);
  if (source.toLowerCase() === destination.toLowerCase()) throw new Error("The two edition folders must differ.");
  const imported = importedProfile(destination);
  if (imported) return { profile: imported, migrated: false };
  if (!isStarterProfile(destination)) return { profile: destination, migrated: false };
  const before = manifest(source);
  if (!before.some(e => e.name.endsWith(".dat"))) return { profile: destination, migrated: false };
  fs.mkdirSync(destination, { recursive: true });
  const name = "standard-copy-" + crypto.randomUUID();
  const stage = path.join(destination, name);
  fs.mkdirSync(path.join(stage, "vault"), { recursive: true });
  const total = before.reduce((sum, e) => sum + e.size, 0);
  let bytes = 0;
  try {
    for (const file of before) {
      const from = path.join(source, file.name), to = path.join(stage, file.name);
      await fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL);
      if (await digest(from) !== await digest(to)) throw new Error("The standard library changed during copying. Close the standard app and reopen Chat to retry.");
      bytes += file.size;
      onProgress({ bytes, total });
    }
    if (JSON.stringify(manifest(source)) !== JSON.stringify(before)) throw new Error("The standard library changed during copying. Close the standard app and reopen Chat to retry.");
    if (!isStarterProfile(destination)) throw new Error("Chat received new data while copying. Your existing library has been preserved.");
    const pending = path.join(stage, "pointer.json");
    fs.writeFileSync(pending, JSON.stringify({ directory: name, files: before.length, bytes: total }), { flag: "wx" });
    // Hard-link creation is atomic and refuses to replace an existing pointer.
    fs.linkSync(pending, path.join(destination, POINTER));
    return { profile: stage, migrated: true, files: before.length, bytes: total };
  } catch (error) {
    // Retain the isolated incomplete copy for diagnostics/recovery. It is never
    // selected without a complete pointer, and neither live vault is touched.
    throw error;
  }
}

module.exports = { migrateStandardVault, importedProfile, isStarterProfile, prepareChatEncryption };
