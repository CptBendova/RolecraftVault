// A saved Chat turn should not restage or retain the whole photo library.
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ChatSync = require("../app/chat-sync-core");
const {createTransport, seal, unseal} = require("../app/vault-sync-transport");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-story-fast-publish-"));
const storageKey = crypto.randomBytes(32).toString("hex");
const sources = name => fs.readFileSync(path.join(__dirname, "..", "app", name), "utf8");
const sha = text => crypto.createHash("sha256").update(text).digest("hex");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const transports = [];
async function until(test, description, timeout = 3000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (test()) return;
    await delay(10);
  }
  throw Error("Timed out waiting for " + description);
}

async function fixture(name, seedHead, manual = false) {
  const directory = path.join(root, name);
  const transport = createTransport({
    directory,
    protect: text => Buffer.from(seal(text, storageKey, "fixture")),
    unprotect: bytes => unseal(bytes.toString(), storageKey, "fixture"),
    unlocked: () => true,
    network: {addresses: () => ["127.0.0.1"], privateIp: ip => ip === "127.0.0.1", discoveryPort: name === "existing" ? 45330 : 45331}
  });
  transports.push(transport);
  const settings = await transport.call("configure", {action: "create", label: name, namespace: "library1"});
  const invitation = JSON.parse(Buffer.from((await transport.call("invite")).code.slice(9), "base64url"));
  const calls = [];
  const host = {
    vaultSync: {async call(method, args) {
      if (method === "discover") { calls.push({method, args, result: {peers: []}}); return {peers: []}; }
      const result = await transport.call(method, args);
      calls.push({method, args, result});
      return result;
    }},
    RolecraftChatSync: ChatSync
  };
  const context = vm.createContext({window: host, document: {hidden: false}, crypto: crypto.webcrypto, TextEncoder, setTimeout, clearTimeout, console});
  vm.runInContext(sources("vault-sync-core.js"), context);
  vm.runInContext(sources("private-sync.js"), context);
  vm.runInContext(sources("vault-sync.js"), context);
  const C = host.RolecraftSyncCore;
  const character = {id: "character-one", name: "Existing character", images: [{imgId: "art-one"}]};
  const base = await C.scan({[C.keyOf("character", character.id)]: character}, {format: 1, entries: {}}, settings.device, async text => sha(text));
  const picture = "data:image/png;base64," + Buffer.from("existing picture bytes").toString("base64");
  const picturePart = await transport.call("put", {text: picture});
  const image = {hash: sha(picture), parts: [picturePart.hash], bytes: Buffer.byteLength(picture), fingerprint: "unchanged-image-pointer"};
  const images = {"img:art-one": image};
  const baseRevision = sha(C.canonical({snapshot: base, images: {"img:art-one": image.hash}}));
  if (seedHead) {
    const baseText = C.canonical({format: 1, group: settings.group, snapshot: base, images: {"img:art-one": {hash: image.hash, parts: image.parts, bytes: image.bytes}}});
    const part = await transport.call("put", {text: baseText});
    await transport.call("beginPublish");
    await transport.call("retain", {hashes: [part.hash, picturePart.hash]});
    await transport.call("publish", {head: {format: 1, index: {hash: sha(baseText), parts: [part.hash], bytes: Buffer.byteLength(baseText)}, revision: baseRevision, extensions: {}, established: true}});
  }
  const initialChat = {
    id: "chat-one", title: "Test chat",
    messages: [{id: "turn-one", parentId: null, role: "assistant", content: "The story continues."}],
    leafId: "turn-one", memories: [], pinnedFacts: ""
  };
  const data = new Map([
    ["sync:state", JSON.stringify({group: settings.group, approved: true, snapshot: base, images})],
    ["chats:all", JSON.stringify([initialChat])],
    ["ui:sync-manual-refresh", manual ? "1" : "0"]
  ]);
  let imageReads = 0;
  const storage = {
    async get(key) { if (/^(img:|th:)/.test(key)) imageReads++; if (!data.has(key)) throw Error("key not found"); return {value: data.get(key)}; },
    async syncCommit(values, expected) {
      for (const [key, value] of Object.entries(expected)) assert.equal(data.get(key) || null, value, "Exact saved-record CAS must remain intact");
      for (const [key, value] of Object.entries(values)) data.set(key, value);
    }
  };
  const engine = host.RolecraftVaultSync.create({
    storage, namespace: "library1", intervalMs: 5000,
    ready: () => true, canApply: () => true, canApplyStories: () => true,
    imageIds: (kind, record) => kind === "character" ? (record.images || []).map(item => item.imgId) : [], onApplied: () => {}, onStoriesApplied: () => {}
  });
  let status;
  engine.subscribe(next => { status = next; });
  return {engine, transport, directory, invitation, baseRevision, pictureHash: picturePart.hash, calls, data, get imageReads() { return imageReads; }, get status() { return status; }};
}

async function runCase(name, hasHead) {
  const test = await fixture(name, hasHead);
  try {
    test.engine.setWorkspacePaused(true);
    await until(() => test.calls.some(call => call.method === "publishStoryExtension") && test.status.phase === "waiting", name + " story publication");
    const fast = test.calls.find(call => call.method === "publishStoryExtension");
    assert.equal(fast.args.expectedLibraryRevision, test.baseRevision, "Story-only publication must be conditional on the existing library revision");
    assert.equal(fast.args.established, true, "The existing approval state must be retained");
    assert.equal(fast.result.published, hasHead, "Native transport must confirm whether it reused the existing head");
    assert.equal(test.imageReads, 0, "Chat focus must not fetch picture bytes");
    const methods = test.calls.map(call => call.method);
    const storyPuts = test.calls.filter(call => call.method === "put" || call.method === "putBatch");
    assert(storyPuts.length > 0, "A new story extension chunk was staged");
    const stagedTexts = storyPuts.flatMap(call => call.args.texts || [call.args.text]);
    assert(stagedTexts.some(text => text.includes("The story continues.")), "The Chat record was staged");
    const manifest = stagedTexts.map(text => { try { return JSON.parse(text); } catch (_) { return null; } }).find(value => value && value.format === 2);
    assert(manifest && Object.keys(manifest.records).length === 1, "The optional index is a small per-conversation manifest");
    assert(manifest.records[Object.keys(manifest.records)[0]].parts.length, "The manifest references chunked conversation data");
    for (const call of storyPuts) {
      const texts = call.args.texts || [call.args.text];
      assert(texts.every(text => !text.includes("data:image")), "No picture bytes were staged during Chat focus");
    }
    if (hasHead) {
      assert(stagedTexts.every(text => !text.includes("Existing character")), "The fast path stages only the Chat extension, not the library index");
      assert(!methods.includes("beginPublish") && !methods.includes("retain") && !methods.includes("publish"), "A changed Chat must not revalidate or republish the entire photo library");
      console.log("PASS established Chat turn publishes only the story extension");
    } else {
      assert(methods.includes("beginPublish") && methods.includes("retain") && methods.includes("publish"), "A missing native head safely falls back to the full publication path");
      assert(test.calls.some(call => call.method === "retain" && call.args.hashes.includes(test.pictureHash)), "Full fallback retains the existing picture chunk before advertising its index");
      console.log("PASS rejected fast path falls back to a complete, retained publication");
    }
    const head = JSON.parse(unseal(fs.readFileSync(path.join(test.directory, "head.bin"), "utf8"), test.invitation.key, "head"));
    assert.equal(head.revision, test.baseRevision, "The library revision is not replaced by a Chat-only revision");
    assert(head.extensions.stories1 && /^[a-f0-9]{64}$/.test(head.extensions.stories1.revision), "The durable head contains the new Chat extension");
    if (hasHead) {
      const absent = "f".repeat(64), fake = JSON.stringify({format: 2, group: test.invitation.group, images: {}, records: {'["conversation","missing"]': {hash: absent, parts: [absent], bytes: 2}}});
      const stored = await test.transport.call("put", {text: fake});
      const refused = await test.transport.call("publishStoryExtension", {extension: {index: {hash: sha(fake), parts: [stored.hash], bytes: Buffer.byteLength(fake)}, revision: "e".repeat(64)}, expectedLibraryRevision: test.baseRevision, established: true});
      assert.equal(refused.published, false, "A manifest cannot advertise missing conversation chunks");
    }
  } finally { test.engine.stop(); }
}

async function runManualCase() {
  const test = await fixture("manual", true, true);
  const head = () => JSON.parse(unseal(fs.readFileSync(path.join(test.directory, "head.bin"), "utf8"), test.invitation.key, "head"));
  try {
    test.engine.setWorkspacePaused(true);
    await until(() => test.calls.some(call => call.method === "serve") && !!head().extensions.stories1 && test.status.phase === "manual", "manual Chat publication and passive listener");
    const originalRevision = head().extensions.stories1.revision;
    assert(!test.calls.some(call => call.method === "discover" || call.method === "index"), "Manual mode must not poll peers on its own");
    const rows = JSON.parse(test.data.get("chats:all"));
    rows[0].messages.push({id: "turn-two", parentId: "turn-one", role: "user", content: "The next saved scene."});
    rows[0].leafId = "turn-two";
    test.data.set("chats:all", JSON.stringify(rows));
    test.engine.localStorySaved();
    await until(() => head().extensions.stories1.revision !== originalRevision, "a manual device to publish its latest saved chat");
    const focusedRevision = head().extensions.stories1.revision;
    const serves = test.calls.filter(call => call.method === "serve").length;
    test.engine.setWorkspacePaused(false);
    await until(() => test.calls.filter(call => call.method === "serve").length > serves && test.status.phase === "manual", "manual serving after Chat closes");
    const closedRows = JSON.parse(test.data.get("chats:all"));
    closedRows[0].messages.push({id: "turn-three", parentId: "turn-two", role: "assistant", content: "Saved after the Chat view closed."});
    closedRows[0].leafId = "turn-three";
    test.data.set("chats:all", JSON.stringify(closedRows));
    test.engine.localStorySaved();
    await until(() => head().extensions.stories1.revision !== focusedRevision, "a late saved Chat turn to publish after closing the view");
    assert(!test.calls.some(call => call.method === "discover" || call.method === "index"), "A local manual-mode save must not fetch or merge peers");
    assert.equal(test.imageReads, 0, "Manual Chat publication must not read pictures");
    console.log("PASS manual Chat mode serves the latest saved turn without background peer sync");
  } finally { test.engine.stop(); }
}

(async () => {
  await runCase("existing", true);
  await runCase("missing", false);
  await runManualCase();
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const transport of transports) transport.pause();
  const tmp = path.resolve(os.tmpdir()) + path.sep;
  if (path.resolve(root).startsWith(tmp)) fs.rmSync(root, {recursive: true, force: true});
});
