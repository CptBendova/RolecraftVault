"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm"), { EventEmitter } = require("events");
const root = path.join(__dirname, "..");
const handlers = {}, files = new Map(), requests = [], timers = new Map(), opened = [];
let locked = false, secure = true, timerId = 0;
const fakeFs = { existsSync: file => files.has(file), readFileSync(file) { if (!files.has(file)) throw Error("fixture missing"); return files.get(file); } };
const fakeHttps = { request(options, callback) {
  const req = new EventEmitter(); req.options = options; req.end = body => { req.body = body; }; req.destroy = () => { req.destroyed = true; req.emit("close"); };
  req.respond = (body, code = 200, headers = {}) => {
    const response = new EventEmitter(); Object.assign(response, { statusCode: code, headers, destroy() { this.destroyed = true; this.emit("close"); } });
    req.response = response; callback(response);
    if (body !== undefined && !response.destroyed) { response.emit("data", Buffer.from(typeof body === "string" ? body : JSON.stringify(body))); response.emit("end"); response.emit("close"); }
    return response;
  }; requests.push(req); return req;
} };
const box = { module: { exports: {} }, Buffer, Date, require: name => name === "fs" ? fakeFs : name === "https" ? fakeHttps : require(name),
  setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); } };
vm.runInNewContext(fs.readFileSync(path.join(root, "app/provider-balances.js"), "utf8"), box);
const native = box.module.exports;
const app = new EventEmitter(); app.getPath = () => path.join(root, "unused-balance-fixture");
const stop = native.setupProviderBalancesIpc({ ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }, app, isLocked: () => locked,
  safeStorage: { isEncryptionAvailable: () => secure, decryptString: value => value }, shell: { openExternal: async url => { opened.push(url); } } });
const sender = new EventEmitter(); sender.isDestroyed = () => false;
const invoke = (name, value) => handlers["provider-balances-" + name]({ sender }, value);
const plain = value => JSON.parse(JSON.stringify(value));
const last = () => requests[requests.length - 1];
const fixture = { data: { limit: 50, limit_remaining: 19.4321, usage: 70.5679, limit_reset: "monthly", label: "sk-fixture-secret-label", other: "ignored" } };
const input = { provider: "openrouter", requestId: "fixture-id" };
async function main() {
  const result = native.keySummary(fixture);
  assert.equal(result.accountBalance, null); assert.equal(result.remaining, 19.4321); assert.equal(result.usage, 70.5679); assert.equal(result.limitReset, "monthly");
  assert(!JSON.stringify(result).includes("secret")); assert(!JSON.stringify(result).includes("ignored"));
  assert.equal(native.keySummary({ data: { limit: 0, limit_remaining: 0, usage: 0 } }).remaining, 0, "zero is reported, not missing");
  assert.equal(native.keySummary({ data: { limit: 1, limit_remaining: -0.1, usage: 1.1 } }).remaining, -0.1, "overspent allowance is not clamped into a fake zero");
  assert.equal(native.keySummary({ data: { limit: null, limit_remaining: null, usage: 5 } }).limit, null);
  for (const data of [null, [], {}, { limit: "50", limit_remaining: 19, usage: 1 }, { limit: 50, usage: 1 }, { limit: null, limit_remaining: 4, usage: 1 }, { limit: 1, limit_remaining: 1, usage: null }, { limit: 1, limit_remaining: Infinity, usage: 0 }, { limit: 1, limit_remaining: 1, usage: -1 }]) assert.throws(() => native.keySummary({ data }));
  assert.equal(native.keySummary({ data: { ...fixture.data, limit_reset: "sk-fake-secret" } }).limitReset, null);
  assert.deepEqual(plain(invoke("status")), { ok: true, configured: { openrouter: false, openai: false, xai: false } });
  locked = true;
  for (const name of ["status", "refresh", "open-dashboard"]) assert.equal((await invoke(name, input)).ok, false);
  assert.equal(invoke("set-unlocked", { unlocked: true }).ok, true); assert.equal((await invoke("refresh", input)).ok, false, "renderer cannot override Windows vault lock");
  locked = false;
  assert.equal((await invoke("refresh", input)).ok, false); assert.equal(requests.length, 0);
  files.set(path.join(app.getPath(), "openrouter-key.bin"), "fixture-openrouter-key-never-real");
  assert.equal(invoke("status").configured.openrouter, true);
  secure = false; assert.equal((await invoke("refresh", input)).ok, false); secure = true;
  for (const provider of ["openai", "xai"]) { const value = await invoke("refresh", { ...input, provider }); assert.equal(value.ok, true); assert.equal(value.status, "unavailable"); assert.equal(value.accountBalance, null); }
  assert.equal(requests.length, 0, "unsupported providers do not try undocumented billing calls");
  for (const provider of ["evil", "__proto__", "constructor", "https://example.invalid", ["openrouter"], { provider: "openrouter" }]) { assert.equal((await invoke("refresh", { ...input, provider })).ok, false); assert.equal((await invoke("open-dashboard", { provider })).ok, false); }
  for (const provider of ["openrouter", "openai", "xai"]) assert.equal((await invoke("open-dashboard", { provider, url: "https://example.invalid" })).ok, true);
  assert.deepEqual(opened, Object.values(native.DASHBOARDS));
  let pending = invoke("refresh", { ...input, url: "https://example.invalid", method: "POST" });
  assert.equal(last().options.hostname, "openrouter.ai"); assert.equal(last().options.servername, "openrouter.ai"); assert.equal(last().options.port, 443); assert.equal(last().options.path, "/api/v1/key"); assert.equal(last().options.method, "GET"); assert.equal(last().body, undefined);
  assert.equal((await invoke("refresh", input)).ok, false, "concurrent refresh denied");
  last().respond(fixture); const success = await pending; assert.equal(success.remaining, 19.4321); assert.equal(timers.size, 0); assert.equal(sender.listenerCount("destroyed"), 0);
  for (const code of [301, 302, 307, 401, 403, 429, 500]) { const count = requests.length; pending = invoke("refresh", input); last().respond({ error: { message: "Bearer fixture-openrouter-key-never-real" } }, code, { location: "https://evil.invalid" }); const value = await pending; assert.equal(value.ok, false); assert(!JSON.stringify(value).includes("fixture-openrouter")); assert.equal(requests.length, count + 1, "no redirects/retries"); }
  for (const body of ["bad JSON", { data: {} }, { data: { ...fixture.data, usage: "sk-secret" } }]) { pending = invoke("refresh", input); last().respond(body); assert.equal((await pending).ok, false); }
  pending = invoke("refresh", input); last().respond(undefined, 200, { "content-length": "65537" }); assert.equal((await pending).ok, false);
  pending = invoke("refresh", input); const large = last().respond(undefined); large.emit("data", Buffer.alloc(65537)); assert.equal((await pending).ok, false);
  pending = invoke("refresh", input); last().respond(undefined).emit("aborted"); assert.equal((await pending).ok, false);
  pending = invoke("refresh", input); last().respond(undefined).emit("close"); assert.equal((await pending).ok, false);
  pending = invoke("refresh", input); last().emit("error", Error("Bearer fixture-openrouter-key-never-real")); assert.equal((await pending).ok, false);
  pending = invoke("refresh", input); const timer = [...timers.values()][0]; assert.equal(timer.ms, 20000); timer.fn(); assert.equal((await pending).ok, false); assert(last().destroyed);
  pending = invoke("refresh", input); invoke("cancel", { requestId: "another" }); assert.equal(last().destroyed, undefined); invoke("cancel", input); assert.equal((await pending).ok, false);
  pending = invoke("refresh", input); sender.emit("destroyed"); assert.equal((await pending).ok, false);
  pending = invoke("refresh", input); invoke("set-unlocked", { unlocked: false }); assert.equal((await pending).ok, false);
  pending = invoke("refresh", input); locked = true; last().respond(fixture); assert.equal((await pending).ok, false); locked = false;
  pending = invoke("refresh", input); stop(); last().respond(fixture); assert.equal((await pending).ok, false, "late response after cancel cannot succeed");
  assert.equal(timers.size, 0); assert.equal(sender.listenerCount("destroyed"), 0);
  console.log("PASS native balances: truthful amounts/null, secret projection, fixed GET/dashboard allowlists, no unsupported calls, guards, no redirects/retries, bounded response/deadline, cancellation and late results");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
