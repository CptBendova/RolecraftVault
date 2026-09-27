"use strict";

// Private edition only. Normal inference keys never become management keys.
const fs = require("fs");
const path = require("path");
const https = require("https");
const DASHBOARDS = Object.freeze({
  openrouter: "https://openrouter.ai/settings/credits",
  openai: "https://platform.openai.com/settings/organization/billing/overview",
  xai: "https://console.x.ai/team/default/billing",
});
const MAX_RESPONSE = 65536, TIMEOUT_MS = 20000;
function providerOf(value) { if (typeof value !== "string" || !Object.hasOwn(DASHBOARDS, value)) throw new Error("Choose a supported API provider."); return value; }
function keySummary(value) {
  const data = value && value.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("OpenRouter returned an invalid allowance response.");
  const amount = (name, nullable) => {
    const n = data[name];
    if (nullable && n === null) return null;
    if (typeof n !== "number" || !Number.isFinite(n) || (name !== "limit_remaining" && n < 0) || Math.abs(n) > Number.MAX_SAFE_INTEGER) throw new Error("OpenRouter returned an invalid allowance response.");
    return n;
  };
  const limit = amount("limit", true), remaining = amount("limit_remaining", true), usage = amount("usage", false);
  if ((limit === null) !== (remaining === null)) throw new Error("OpenRouter returned an incomplete allowance response.");
  return { ok: true, provider: "openrouter", accountBalance: null, status: "key_allowance", currency: "USD", limit, remaining, usage,
    limitReset: ["daily", "weekly", "monthly"].includes(data.limit_reset) ? data.limit_reset : null, checkedAt: Date.now() };
}
function httpError(code) {
  if (code === 401) return "OpenRouter rejected the saved API key. Check it in Chat settings.";
  if (code === 403) return "This key does not have permission to read its allowance. Check the provider dashboard.";
  if (code === 429) return "OpenRouter limited this check. Try Refresh later.";
  if (code >= 300 && code < 400) return "OpenRouter redirected this check. The redirect was refused.";
  return "OpenRouter could not provide the allowance (HTTP " + code + "). Try Refresh later.";
}
function setupProviderBalancesIpc({ ipcMain, safeStorage, app, shell, isLocked = () => true }) {
  let active = null;
  const guard = () => { if (isLocked()) throw new Error("Unlock the vault before checking API balances."); };
  const keyFile = provider => path.join(app.getPath("userData"), provider === "openrouter" ? "openrouter-key.bin" : "image-generation-" + provider + "-key.bin");
  const fail = error => ({ ok: false, error: error.message });
  const cancelAll = () => { if (active) active.abort("API balance check cancelled."); };
  ipcMain.handle("provider-balances-status", () => {
    try { guard(); return { ok: true, configured: Object.fromEntries(Object.keys(DASHBOARDS).map(provider => [provider, fs.existsSync(keyFile(provider))])) }; }
    catch (error) { return fail(error); }
  });
  ipcMain.handle("provider-balances-set-unlocked", (_event, input) => { if (!input || !input.unlocked) cancelAll(); return { ok: true }; });
  ipcMain.handle("provider-balances-cancel", (_event, input) => { if (active && input && active.id === input.requestId) cancelAll(); return { ok: true }; });
  ipcMain.handle("provider-balances-open-dashboard", async (_event, input) => {
    try { guard(); const provider = providerOf(input && input.provider); await shell.openExternal(DASHBOARDS[provider]); return { ok: true }; }
    catch (_) { return { ok: false, error: "Could not open the provider billing page. Unlock the vault and try again." }; }
  });
  ipcMain.handle("provider-balances-refresh", (event, input) => new Promise(resolve => {
    let key, provider;
    try {
      guard(); provider = providerOf(input && input.provider);
      if (provider !== "openrouter") { resolve({ ok: true, provider, status: "unavailable", accountBalance: null }); return; }
      if (!input || !/^[A-Za-z0-9_-]{1,100}$/.test(input.requestId || "")) throw new Error("Invalid balance check identity.");
      if (active) throw new Error("Wait for the current balance check or cancel it first.");
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows credential encryption is unavailable.");
      try { key = safeStorage.decryptString(fs.readFileSync(keyFile(provider))).trim(); }
      catch (_) { throw new Error("Save a valid OpenRouter key in Chat settings first."); }
      if (!/^[!-~]{24,512}$/.test(key)) throw new Error("Save a valid OpenRouter key in Chat settings first.");
      if (event.sender && event.sender.isDestroyed && event.sender.isDestroyed()) throw new Error("The account panel was closed.");
    } catch (error) { resolve(fail(error)); return; }
    let req, res, timer, settled = false;
    const chunks = [], sender = event.sender;
    const finish = result => {
      if (settled) return;
      settled = true; clearTimeout(timer); chunks.length = 0;
      if (active === operation) active = null;
      if (sender && sender.removeListener) sender.removeListener("destroyed", onDestroyed);
      resolve(result);
    };
    const abort = error => { finish({ ok: false, error }); if (res) res.destroy(); if (req) req.destroy(); };
    const onDestroyed = () => abort("The account panel was closed.");
    const operation = { id: input.requestId, abort }; active = operation;
    if (sender && sender.once) sender.once("destroyed", onDestroyed);
    timer = setTimeout(() => abort("The balance check timed out. Try Refresh when your connection is ready."), TIMEOUT_MS);
    try {
      req = https.request({ protocol: "https:", hostname: "openrouter.ai", servername: "openrouter.ai", port: 443, method: "GET", path: "/api/v1/key", headers: { Authorization: "Bearer " + key, Accept: "application/json" } }, incoming => {
        if (settled) { incoming.destroy(); return; }
        res = incoming; let bytes = 0, ended = false;
        if (res.statusCode !== 200) { abort(httpError(res.statusCode)); return; }
        if (Number(res.headers && res.headers["content-length"]) > MAX_RESPONSE) { abort("The balance response exceeded the size limit."); return; }
        res.on("data", chunk => { if (settled) return; bytes += chunk.length; if (bytes > MAX_RESPONSE) { abort("The balance response exceeded the size limit."); return; } chunks.push(Buffer.from(chunk)); });
        res.on("end", () => {
          ended = true; if (settled) return;
          try { guard(); const result = keySummary(JSON.parse(Buffer.concat(chunks).toString("utf8"))); finish(result); }
          catch (_) { finish({ ok: false, error: isLocked() ? "Unlock the vault before checking API balances." : "OpenRouter returned an invalid allowance response. Check the provider dashboard." }); }
        });
        res.on("error", () => abort("The balance connection was interrupted. Try Refresh again."));
        res.on("aborted", () => abort("The balance connection was interrupted. Try Refresh again."));
        res.on("close", () => { if (!ended && !settled) abort("The balance connection closed before completing."); });
      });
      req.on("error", () => abort("Could not reach OpenRouter securely. Check your connection and try Refresh again."));
      req.on("close", () => { if (!res && !settled) abort("The balance connection closed before completing."); });
      req.end();
    } catch (_) { abort("Could not start the balance check. Try Refresh again."); }
  }));
  app.on("before-quit", cancelAll);
  return cancelAll;
}
module.exports = { setupProviderBalancesIpc, keySummary, httpError, DASHBOARDS, MAX_RESPONSE, TIMEOUT_MS };
