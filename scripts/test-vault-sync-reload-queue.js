/* Exercise committed reload retry and ancestry-only Chat checkpoints in the shipped sync loop. */
"use strict";
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ChatSync = require("../app/chat-sync-core");

const read = name => fs.readFileSync(path.join(__dirname, "..", "app", name), "utf8");
const digest = text => crypto.createHash("sha256").update(text).digest("hex");
const source = read("vault-sync.js");
const anchor = "return {supported:!!transport";
assert(source.includes(anchor), "lift the shipped sync engine's tick without copying it");

async function fixture(stories) {
  const context = vm.createContext({window: {}, document: {hidden: false}, crypto: crypto.webcrypto, TextEncoder,
    setTimeout: (fn, ms) => ms === 50 ? setTimeout(fn, ms) : 0, clearTimeout});
  vm.runInContext(read("vault-sync-core.js"), context);
  if (stories) {
    context.window.RolecraftChatSync = ChatSync;
    vm.runInContext(read("private-sync.js"), context);
  }
  const C = context.window.RolecraftSyncCore;
  const localRow = stories ? ChatSync.stamp([{
    id: "story", messages: [{id: "opening", role: "user", content: "Saved writing", parentId: null}], leafId: "opening"
  }], [], () => "shared-revision")[0] : null;
  const raw = stories ? JSON.stringify([localRow]) : "[]";
  const localItems = stories ? C.collect({"chats:all": raw}) : C.collect({"lore:all": "[]"});
  const remoteItems = stories ? localItems : C.collect({"lore:all": JSON.stringify([{id: "new-lore", content: "From peer"}])});
  const localSnapshot = await C.scan(localItems, null, "local", async text => digest(text));
  const remoteSnapshot = await C.scan(remoteItems, null, "remote", async text => digest(text));
  const data = new Map([["sync:state", JSON.stringify({group: "fixture", approved: true, accepted: true, snapshot: localSnapshot, images: {}})],
    [stories ? "chats:all" : "lore:all", raw]]);
  const chunks = new Map(), commits = [];
  function pack(text) { const hash = digest(text); chunks.set(hash, text); return {hash, parts: [hash], bytes: Buffer.byteLength(text)}; }
  const empty = {format: 1, entries: {}};
  const head = stories ? {
    revision: digest(C.canonical(empty)), established: true,
    index: pack(C.canonical({format: 1, group: "fixture", snapshot: empty, images: {}})),
    extensions: {stories1: {revision: digest(C.canonical(remoteSnapshot)),
      index: pack(C.canonical({format: 1, group: "fixture", snapshot: remoteSnapshot, images: {}}))}}
  } : {
    revision: digest(C.canonical(remoteSnapshot)), established: true,
    index: pack(C.canonical({format: 1, group: "fixture", snapshot: remoteSnapshot, images: {}}))
  };
  const storage = {
    async get(key) { if (!data.has(key)) throw Error("key not found"); return {value: data.get(key)}; },
    async syncCommit(values, expected) {
      for (const [key, value] of Object.entries(expected)) assert.strictEqual(data.get(key) ?? null, value, "sync retains exact saved-value CAS");
      commits.push({...values});
      for (const [key, value] of Object.entries(values)) data.set(key, value);
    }
  };
  let reloadAttempts = 0, failReload = true;
  context.window.vaultSync = {async call(method, args = {}) {
    if (method === "status") return {enabled: true, group: "fixture", device: "local", primary: "remote"};
    if (method === "discover") return {peers: [{id: "remote"}]};
    if (method === "index") return {head, label: "remote"};
    if (method === "chunk") return {text: chunks.get(args.hash)};
    if (method === "put") return {hash: pack(args.text).hash};
    if (["pause", "beginPublish", "retain", "publish"].includes(method)) return {};
    throw Error("Unexpected sync operation: " + method);
  }};
  vm.runInContext(source.replace(anchor, "return {probe:{tick},supported:!!transport"), context);
  const engine = context.window.RolecraftVaultSync.create({storage, ready: () => true, canApply: () => true, canApplyStories: () => true,
    imageIds: () => [], onApplied: async () => { reloadAttempts++; if (failReload) throw Error("Injected UI reload failure"); },
    onStoriesApplied: async () => { reloadAttempts++; }});
  let status;
  engine.subscribe(next => { status = next; });
  return {engine, data, commits, get status() { return status; }, get reloadAttempts() { return reloadAttempts; }, allowReload() { failReload = false; }};
}

async function run() {
  const full = await fixture(false);
  try {
    await full.engine.probe.tick();
    assert.strictEqual(full.status.phase, "error", "failed reload is reported after a durable checkpoint");
    assert.strictEqual(JSON.parse(full.data.get("lore:all"))[0].id, "new-lore", "the remote record was committed before reload failed");
    assert.strictEqual(full.reloadAttempts, 1);
    full.allowReload();
    await full.engine.probe.tick();
    assert.strictEqual(full.reloadAttempts, 2, "the next pass retries the saved checkpoint's UI reload even without another record write");
    assert.notStrictEqual(full.status.phase, "error", "sync resumes only after the reload succeeds");
    console.log("PASS full sync retries a failed UI reload after its record checkpoint has committed");
  } finally { full.engine.stop(); }

  const story = await fixture(true);
  try {
    story.engine.setWorkspacePaused(true);
    await story.engine.probe.tick();
    assert(story.commits.some(values => Object.keys(values).length === 1 && Object.hasOwn(values, "sync:state")),
      "causal ancestry still commits to sync state: " + JSON.stringify({phase: story.status.phase, message: story.status.message, commits: story.commits}));
    assert(!story.commits.some(values => Object.hasOwn(values, "chats:all")),
      "merging identical conversation text must not replace its encrypted Chat pointer");
    assert.strictEqual(story.reloadAttempts, 0, "unchanged Chat text needs no UI reload");
    console.log("PASS ancestry-only Chat merge updates sync state without rewriting chats:all");
  } finally { story.engine.stop(); }

  const fullStory = await fixture(true);
  try {
    await fullStory.engine.probe.tick();
    assert(fullStory.commits.some(values => Object.keys(values).length === 1 && Object.hasOwn(values, "sync:state")),
      "full reconciliation still saves causal ancestry");
    assert(!fullStory.commits.some(values => Object.hasOwn(values, "chats:all")),
      "full sync must not rotate the encrypted Chat pointer for identical conversation content");
    assert.strictEqual(fullStory.reloadAttempts, 0, "full ancestry-only reconciliation needs no Chat UI reload");
    console.log("PASS full sync preserves chats:all when only conversation ancestry changes");
  } finally { fullStory.engine.stop(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
