"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app", "main.js"), "utf8");
const start = source.indexOf('  ipcMain.handle("vault-sync-fingerprint"');
const end = source.indexOf('  ipcMain.handle("vault-set"', start);
assert(start >= 0 && end > start, "The shipped Windows sync commit handler must be present");

const disk = new Map();
const handlers = {};
const writes = [];
const restores = [];
let locked = false;
let activeRestore = null;
const context = {
  ipcMain: { handle: (name, handler) => { handlers[name] = handler; } },
  isLocked: () => locked,
  readValue: key => disk.get(key) ?? null,
  writeValue: (key, value) => { writes.push(key); disk.set(key, value); },
  beginVaultRestore: spec => { const tx = { spec, values: new Map() }; restores.push(tx); return tx; },
  setVaultRestoreValue: (tx, key, value) => { tx.values.set(key, value); },
  commitVaultRestore: tx => { for (const [key, value] of tx.values) disk.set(key, value); },
  abortVaultRestore: () => {},
  get activeRestore() { return activeRestore; },
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const commit = handlers["vault-sync-commit"];
assert.equal(typeof commit, "function");

const chatKey = "chats:all";
const first = '[{"id":"first","messages":[]}]';
const second = '[{"id":"first","messages":[{"id":"reply"}]}]';
assert.equal(commit(null, { [chatKey]: first }, { [chatKey]: null }), true);
assert.equal(disk.get(chatKey), first);
assert.deepEqual(writes, [chatKey], "a one-key Chat save uses the atomic file writer directly");
assert.equal(restores.length, 0, "Chat saves must not clone the whole vault");

assert.throws(() => commit(null, { [chatKey]: second }, { [chatKey]: null }), /changed/);
assert.equal(disk.get(chatKey), first, "a stale chat save cannot erase a newer conversation");
assert.throws(() => commit(null, { [chatKey]: second }, {}), /expected value/);
assert.equal(disk.get(chatKey), first, "Chat CAS cannot silently become an unchecked write");

activeRestore = {};
assert.throws(() => commit(null, { [chatKey]: second }, { [chatKey]: first }), /restore/);
assert.equal(disk.get(chatKey), first, "an active restore prevents the fast Chat write");
activeRestore = null;
locked = true;
assert.throws(() => commit(null, { [chatKey]: second }, { [chatKey]: first }), /locked/);
assert.equal(disk.get(chatKey), first, "a locked vault cannot save Chat");
locked = false;

assert.equal(commit(null, { [chatKey]: second }, { [chatKey]: first }), true);
assert.equal(disk.get(chatKey), second);
assert.deepEqual(writes, [chatKey, chatKey]);
assert.equal(restores.length, 0);

assert.equal(commit(null, { [chatKey]: first, "sync:state": "next" }, { [chatKey]: second, "sync:state": null }), true);
assert.equal(restores.length, 1, "multi-record commits retain the atomic restore path");
assert.equal(disk.get(chatKey), first);
assert.equal(commit(null, { "lore:all": "[]" }, { "lore:all": null }), true);
assert.equal(restores.length, 2, "unrelated one-key commits still use the existing restore path");
assert.equal(commit(null, { "sync:state": "later" }, { "sync:state": "next" }), true);
assert.equal(restores.length, 2, "sync state retains its fast path");
console.log("PASS Windows Chat CAS rejects stale, unchecked, locked and restoring writes without whole-vault clone");
