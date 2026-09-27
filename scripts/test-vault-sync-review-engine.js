"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const C = require(path.join(__dirname, "../app/vault-sync-core")), R = require(path.join(__dirname, "../app/vault-sync-review"));
const source = fs.readFileSync(path.join(__dirname, "../app/vault-sync.js"), "utf8");
const hash = async value => crypto.createHash("sha256").update(value).digest("hex"), plain = value => JSON.parse(JSON.stringify(value));
const copyId = "character-conflict-" + "a".repeat(24), originalKey = C.keyOf("character", "character"), copyKey = C.keyOf("character", copyId);
const initial = C.collect({"chars:all": JSON.stringify([{id: "character", name: "Earlier", images: ["old-photo"]}, {id: copyId, name: "Latest (sync conflict)", images: ["new-photo"]}])});
const choices = {[originalKey]: copyKey};
async function fixture({items = initial, approved = true, preference = true} = {}) {
  const snapshot = await C.scan(items, null, "tablet", hash), data = new Map(Object.entries(C.expand(items)));
  data.set("sync:state", JSON.stringify({group: "fixture", approved, snapshot, images: {}}));
  const calls = [], commits = [], chunks = new Map();
  const f = {data, calls, commits, ready: true, canApply: true, applied: 0, images: 0, status: null, nativeExtra: null, beforeCommit: null};
  f.settings = {enabled: true, device: "tablet", primary: "tablet", primarySelection: 1, primaryPreference: preference ? {format: 1, device: "tablet", author: "tablet", sequence: 1, label: "Tablet"} : null, group: "fixture"};
  const storage = {
    get: async key => {if (!data.has(key)) throw Error("key not found"); return {value: data.get(key)};},
    fingerprint: async key => data.has(key) ? hash(data.get(key)) : null,
    fingerprints: async keys => Object.fromEntries(await Promise.all(keys.map(async key => [key, await storage.fingerprint(key)]))),
    syncImage: async (key, value) => {f.images++; data.set(key, value);},
    syncCommit: async (values, expected) => {
      if (f.beforeCommit) await f.beforeCommit(values, expected);
      for (const [key, value] of Object.entries(expected)) assert.equal(data.get(key) ?? null, value, "all reviewed raw records and causal state are CAS guarded");
      commits.push({values: plain(values), expected: plain(expected)});
      for (const [key, value] of Object.entries(values)) data.set(key, value);
    }
  };
  const native = {call: async (method, args = {}) => {
    calls.push(method);
    if (f.nativeExtra) {const extra = await f.nativeExtra(method, args); if (extra !== undefined) return extra;}
    if (method === "status") return plain(f.settings);
    if (method === "setPrimary") {f.settings.primaryPreference = {...f.settings.primaryPreference, sequence: 2}; return plain(f.settings);}
    if (["pause", "beginPublish", "retain", "publish"].includes(method)) return {};
    if (method === "put") {const digest = await hash(args.text); chunks.set(digest, args.text); return {hash: digest};}
    if (method === "discover") return {peers: []};
    throw Error("Unexpected native method " + method);
  }};
  const window = {RolecraftSyncCore: C, RolecraftSyncReview: R, vaultSync: native};
  vm.runInNewContext(source, {window, document: {hidden: false}, crypto: crypto.webcrypto, TextEncoder, Date, console,
    setTimeout: (fn, ms) => ["tick", "pulse"].includes(fn.name) ? 0 : setTimeout(fn, ms), clearTimeout});
  f.engine = window.RolecraftVaultSync.create({storage, ready: () => f.ready, canApply: () => typeof f.canApply === "function" ? f.canApply() : f.canApply,
    imageIds: (kind, record) => kind === "trash" ? record.record.images || [] : record.images || [], onApplied: async () => {f.applied++;}});
  f.engine.subscribe(status => {f.status = status;});
  return f;
}
const fixtures = [];
async function make(options) {const f = await fixture(options); fixtures.push(f); return f;}
async function until(check) {const end = Date.now() + 4000; while (Date.now() < end) {if (check()) return; await new Promise(resolve => setTimeout(resolve, 10));} throw Error("Timed out waiting for engine result");}
(async () => {
  const f = await make(), originalData = plain(Object.fromEntries(f.data)), review = await f.engine.reviewConflicts();
  assert.equal(review.groups.length, 1);
  assert(review.groups[0].candidates.every(row => row.pictureCount === 1));
  assert.equal(f.commits.length, 0);
  assert.deepEqual(plain(Object.fromEntries(f.data)), originalData);
  assert.equal(await f.engine.resolveConflicts(review, {}), 0);
  assert.equal(f.commits.length, 0);
  f.data.set("chars:all", JSON.stringify([{id: "character", name: "Edit after review", images: ["old-photo"]}, initial[copyKey]]));
  await assert.rejects(f.engine.resolveConflicts(review, choices), /changed since you opened this review/);
  assert.equal(f.commits.length, 0);
  console.log("PASS opening review and empty selection never write; a stale raw-library review rejects before commit");

  const refreshed = await f.engine.reviewConflicts(), before = plain(Object.fromEntries(f.data));
  assert.equal(await f.engine.resolveConflicts(refreshed, choices), 1);
  assert.equal(f.commits.length, 1);
  assert.equal(f.applied, 1);
  const commit = f.commits[0];
  assert.deepEqual(commit.expected, before);
  assert.deepEqual(Object.keys(commit.values).sort(), [...Object.keys(C.expand(initial)), "sync:state"].sort());
  const chars = JSON.parse(f.data.get("chars:all")), bin = JSON.parse(f.data.get("trash:all")), state = JSON.parse(f.data.get("sync:state"));
  assert.equal(chars.length, 1); assert.equal(chars[0].id, "character"); assert.equal(chars[0].name, "Latest");
  assert.deepEqual(chars[0].images, ["new-photo"]);
  assert(bin.some(row => row.record.images.includes("old-photo")) && bin.some(row => row.record.images.includes("new-photo")));
  assert(state.snapshot.entries[copyKey].versions.every(revision => revision.value === null));
  await C.validate(state.snapshot, hash);
  console.log("PASS selected helper result saves records, Bin and causal tombstones together in one all-record CAS commit");

  const locked = await make(); locked.ready = false;
  await assert.rejects(locked.engine.reviewConflicts(), /unlock/);
  await assert.rejects(locked.engine.setPrimary(), /unlock/);
  assert.equal(locked.calls.length, 0); assert.equal(locked.commits.length, 0);
  const editing = await make(), editingReview = await editing.engine.reviewConflicts(); editing.canApply = false;
  await assert.rejects(editing.engine.resolveConflicts(editingReview, choices), /finish editing/);
  assert.equal(editing.commits.length, 0);
  let applyChecks = 0; editing.canApply = () => ++applyChecks === 1;
  await assert.rejects(editing.engine.resolveConflicts(editingReview, choices), /Finish editing before saving/);
  assert.equal(editing.commits.length, 0);
  const unapproved = await make({approved: false});
  await assert.rejects(unapproved.engine.setPrimary(), /first sync/);
  assert(!unapproved.calls.includes("setPrimary")); assert.equal(unapproved.commits.length, 0);
  const approved = await make(); await approved.engine.setPrimary();
  assert.equal(approved.calls.filter(method => method === "setPrimary").length, 1);
  console.log("PASS lock/edit guards and late editor activation fail closed; only an approved device may select itself primary");

  const moving = await make({items: {}, preference: false}), remoteChunks = new Map();
  async function pack(text) {const digest = await hash(text); remoteChunks.set(digest, text); return {hash: digest, parts: [digest], bytes: Buffer.byteLength(text)};}
  const remoteItems = C.collect({"chars:all": JSON.stringify([{id: "remote", name: "Remote character", images: ["remote-photo"]}])});
  const remote = await C.scan(remoteItems, null, "phone", hash), picture = await pack("A full original photo");
  const index = await pack(C.canonical({format: 1, group: "fixture", snapshot: remote, images: {"img:remote-photo": picture}}));
  moving.nativeExtra = async (method, args) => {
    if (method === "discover") return {peers: [{id: "phone"}]};
    if (method === "index") return {primarySelection: 1, label: "Phone", head: {format: 1, established: true, index, revision: await hash(C.canonical(remote))}};
    if (method === "chunk") {
      if (args.hash === picture.hash) moving.settings.primaryPreference = {format: 1, device: "phone", author: "phone", sequence: 1, label: "Phone"};
      return {text: remoteChunks.get(args.hash)};
    }
  };
  moving.engine.start(); await until(() => moving.status.phase === "error"); moving.engine.stop();
  assert.match(moving.status.message, /chosen primary changed/);
  assert.equal(moving.images, 1, "verified picture download may remain cached");
  assert.equal(JSON.parse(moving.data.get("chars:all")).length, 0, "old merge policy cannot commit visible records after primary activation");
  assert(!JSON.parse(moving.data.get("sync:state")).snapshot.entries[C.keyOf("character", "remote")], "unsaved remote writing never enters local causal history");
  assert(moving.commits.every(row => Object.keys(row.values).every(key => key === "sync:state")));
  console.log("PASS activating primary during image download aborts the old-policy record commit while preserving safe cached progress");
})().catch(error => {console.error(error); process.exitCode = 1;}).finally(() => fixtures.forEach(f => f.engine.stop()));
