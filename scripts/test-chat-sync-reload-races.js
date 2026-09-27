/* Execute the shipped Chat reload paths against held encrypted storage reads. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Sync = require("../app/chat-sync-core");
const source = fs.readFileSync(path.join(__dirname, "../app/chat.js"), "utf8");
const helperWindow = { storage: {}, RolecraftChatSync: Sync, React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} }, ReactDOM: { createRoot: () => ({ render() {} }) } };
vm.runInNewContext(source, { window: helperWindow, document: { createElement: () => ({}), body: { appendChild() {} } } });
const parseChats = helperWindow.__rcvChatInternals.parseChats;
function between(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert(first >= 0 && last > first, "shipped function boundary: " + start);
  return source.slice(first, last);
}
function line(needle) {
  const result = source.split("\n").find(row => row.includes(needle));
  assert(result, "shipped assignment: " + needle);
  return result;
}
const initial = Sync.stamp([{ id: "story", characterId: "hero", messages: [{ id: "m1", role: "user", content: "Original" }], leafId: "m1" }], [], () => "revision-1")[0];
const records = new Map([["chats:all", JSON.stringify([initial])]]);
let heldKey = "", releaseRead, enteredRead;
const storage = {
  async get(key) {
    const value = records.has(key) ? records.get(key) : null;
    if (key === heldKey) {
      enteredRead();
      await new Promise(resolve => { releaseRead = resolve; });
    }
    return { value };
  },
  async set(key, value) { records.set(key, value); }
};
let rendered = [initial], selected = "story", ready = true, closed = false;
const context = {
  window: { storage }, Sync, CHAT_KEY: "chats:all", GROUP_ROUNDS_KEY: "ui:chat-group-rounds", parseChats,
  captureCast: chat => chat, ready, edit: null, activeId: "story", activeIdRef: { current: "story" }, linkNative: null,
  saveFailed: { current: false }, busyRef: { current: false }, linkBusy: { current: false }, pendingSaves: { current: 0 },
  epoch: { current: 0 }, saveQueue: { current: Promise.resolve() }, plannedRef: { current: [initial] }, savedRawRef: { current: records.get("chats:all") },
  roundPlansRef: { current: {} }, chatsRef: { current: [initial] }, ackRef: { current: [] }, linkRef: { current: null },
  deviceSyncReload: { current: null }, draftRef: { current: {} }, uid: () => "revision-2",
  setLibrary() {}, setChats(value) { rendered = value; }, setReady(value) { ready = value; }, setOpen(value) { closed = !value; },
  setError() {}, setActiveId(value) { selected = value; }, setLinkStatus() {}, setSaved() {}, setLink() {},
  setDraft() {}, setBucketCovers() {}, setRoundPlans() {},
  document: { querySelector: () => null }
};
vm.createContext(context);
vm.runInContext([
  between("  var valueOf =", "  function parseChats("),
  between("  function validRoundPlan(", "  function inspectRoundPlan("),
  between("    function load(", "    function save(next)"),
  line("deviceSyncReload.current ="),
  between("    window.RolecraftChatReloadStories = async function () {", "    var native ="),
  line("window.RolecraftChatReloadAfterSync =")
].join("\n"), context);

async function holdRead(key, operation) {
  heldKey = key;
  const entered = new Promise(resolve => { enteredRead = resolve; });
  const pending = operation();
  await entered;
  heldKey = "";
  return { pending, release: () => releaseRead() };
}
async function run() {
  context.busyRef.current = true;
  await assert.rejects(context.window.RolecraftChatReloadStories(), /retry/i, "busy Chat-only reload must not acknowledge an unapplied update");
  await assert.rejects(context.window.RolecraftChatReloadAfterSync(), /retry/i, "busy full-sync reload must not acknowledge an unapplied update");
  context.busyRef.current = false;

  let held = await holdRead("chats:all", () => context.window.RolecraftChatReloadStories());
  const local = { ...initial, messages: initial.messages.concat({ id: "m2", role: "user", content: "Local edit", parentId: "m1" }), leafId: "m2" };
  context.chatsRef.current = [local];
  records.set("chats:all", JSON.stringify([local]));
  held.release();
  await assert.rejects(held.pending, /retry/i, "a stale story read must request another pass");
  assert.strictEqual(rendered[0], initial, "stale read does not render the old storage copy");
  assert.strictEqual(context.chatsRef.current[0], local, "stale read does not overwrite the newer in-memory chat");
  assert.strictEqual(context.plannedRef.current[0], initial, "stale read does not reset revision ancestry");
  assert.strictEqual(context.pendingSaves.current, 0, "story reload releases its sync guard");

  const remote = Sync.stamp([{ ...local, messages: local.messages.concat({ id: "m3", role: "assistant", content: "New reply", parentId: "m2" }), leafId: "m3" }], [initial], () => "revision-3")[0];
  records.set("chats:all", JSON.stringify([remote]));
  await context.window.RolecraftChatReloadStories();
  assert.strictEqual(rendered[0].messages.at(-1).content, "New reply", "successful Chat-only reload renders the saved reply");
  assert.strictEqual(context.plannedRef.current[0]._sync.rev, remote._sync.rev, "later edits descend from the actual saved revision");
  assert.strictEqual(selected, "story", "active conversation selection stays put");

  held = await holdRead("chats:all", () => context.window.RolecraftChatReloadAfterSync());
  const later = [{ ...remote, title: "Changed while loading" }];
  context.chatsRef.current = later;
  held.release();
  await assert.rejects(held.pending, /retry/i, "full sync must retry a stale UI read");
  assert.strictEqual(context.chatsRef.current, later, "full sync must not roll back the visible chat");
  assert.strictEqual(ready, true, "retryable sync race must not hide Chat");
  assert.strictEqual(closed, false, "retryable sync race must not close Chat");
  assert.strictEqual(context.pendingSaves.current, 0, "full reload releases its sync guard");
  console.log("PASS shipped Chat sync reloads reject busy/stale reads, preserve local edits and apply current saved replies");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
