"use strict";
// Explicit, short-lived sharing only. Never part of a vault index or export.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const PROVIDERS = ["openrouter", "openai", "xai"];
function provider(value) {
  if (!PROVIDERS.includes(value)) throw Error("Choose a supported API provider.");
  return value;
}
function keyValue(value, name) {
  if (typeof value !== "string" || value.length < (name === "openrouter" ? 24 : 16) || value.length > 512 || !/^[!-~]+$/.test(value)) throw Error("The shared API key is invalid.");
  return value;
}
function createCredentialShare({ directory, safeStorage, unlocked, now = Date.now }) {
  let offer = null;
  const guard = () => { if (!unlocked() || !safeStorage.isEncryptionAvailable()) { stop(); throw Error("Unlock the app with secure credential storage available."); } };
  const file = name => path.join(directory, provider(name) === "openrouter" ? "openrouter-key.bin" : "image-generation-" + name + "-key.bin");
  function stop() { offer = null; }
  function metadata() { guard(); if (offer && now() >= offer.expires) stop(); return offer ? { id: offer.id, provider: offer.provider, expires: offer.expires } : null; }
  function status() { return { configured: PROVIDERS.filter(name => fs.existsSync(file(name))), offer: metadata() }; }
  function share(name) {
    guard(); name = provider(name);
    let key;
    try { key = keyValue(safeStorage.decryptString(fs.readFileSync(file(name))), name); }
    catch (_) { throw Error("Save a valid key for this provider on this device first."); }
    offer = { id: crypto.randomBytes(16).toString("hex"), provider: name, expires: now() + 5 * 60000, sealed: safeStorage.encryptString(key) };
    return metadata();
  }
  function pull(id) {
    const current = metadata();
    if (!current || current.id !== id) throw Error("Key sharing expired or stopped. Share it again on the source device.");
    return { ...current, key: keyValue(safeStorage.decryptString(offer.sealed), current.provider) };
  }
  function receive(data, expected) {
    guard(); const name = provider(expected.provider);
    if (!data || data.id !== expected.id || data.provider !== name || !Number.isSafeInteger(data.expires) || data.expires <= now() || data.expires > now() + 6 * 60000) throw Error("Key sharing expired or changed. Refresh the shared keys.");
    const key = keyValue(data.key, name), destination = file(name);
    if (fs.existsSync(destination)) throw Error("A key is already saved for this provider. Remove it in provider settings first if you want to replace it.");
    fs.mkdirSync(directory, { recursive: true });
    const temporary = destination + "." + crypto.randomBytes(12).toString("hex") + ".tmp";
    try {
      fs.writeFileSync(temporary, safeStorage.encryptString(key), { flag: "wx", mode: 0o600 });
      guard();
      // Linking refuses an existing destination, including a concurrent local save.
      fs.linkSync(temporary, destination);
    } catch (_) { throw Error("Could not save the shared key securely. Check whether this device already has a key."); }
    finally { try { fs.unlinkSync(temporary); } catch (_) {} }
    return { ok: true, provider: name };
  }
  return { status, share, stop, metadata, pull, receive };
}
module.exports = { createCredentialShare, provider, keyValue };
