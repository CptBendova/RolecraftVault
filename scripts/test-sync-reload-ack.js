"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");
const start = source.indexOf("function waitForVaultSyncReload(");
const end = source.indexOf("function RolecraftVault()", start);
assert(start >= 0 && end > start, "lift the shipped sync reload acknowledgement helper");
const window = { RolecraftChatReloadAfterSync: async () => {} };
const waitForVaultSyncReload = vm.runInNewContext(source.slice(start, end) + "\nwaitForVaultSyncReload", { window, Promise, Error, setTimeout, clearTimeout });

(async () => {
  const first = { current: null };
  const success = waitForVaultSyncReload(first, () => setTimeout(() => first.current(), 0), 100);
  await success;
  assert.strictEqual(first.current, null, "a completed screen and chat reload acknowledges sync");

  const second = { current: null };
  window.RolecraftChatReloadAfterSync = async () => { throw new Error("Chat changed during reload"); };
  await assert.rejects(waitForVaultSyncReload(second, () => setTimeout(() => second.current(), 0), 100), /Chat changed during reload/);
  assert.strictEqual(second.current, null, "failed Chat reload must not leave a stale acknowledgement");

  const third = { current: null };
  await assert.rejects(waitForVaultSyncReload(third, () => setTimeout(() => third.current(new Error("Library read failed")), 0), 100), /Library read failed/);
  assert.strictEqual(third.current, null, "failed library reload must be retried by sync");

  const fourth = { current: null };
  await assert.rejects(waitForVaultSyncReload(fourth, () => {}, 5), /did not reload in time/);
  assert.strictEqual(fourth.current, null, "a timed-out reload cannot acknowledge a later load");

  console.log("PASS sync reload acknowledges only a current successful library and Chat read");
})().catch(error => { console.error(error); process.exitCode = 1; });
