// A reviewed Chat conflict copy is a single recoverable conversation deletion,
// not a title-based cleanup or a replacement of the original story.
const assert = require("assert");
const Sync = require("../app/chat-sync-core");

let revision = 0;
const uid = () => "revision-" + ++revision;
const first = Sync.stamp([{
  id: "story", title: "Original story",
  messages: [{ id: "turn-1", role: "user", content: "Begin." }],
  leafId: "turn-1"
}], [], uid);
const left = Sync.stamp([{ ...first[0], title: "Device A story" }], first, uid);
const right = Sync.stamp([{ ...first[0], title: "Device B story" }], first, uid);
const resolved = Sync.merge(left, right).chats;
const generatedCopy = resolved.find(chat => chat.conflictOf === "story");
assert(generatedCopy && /^story~conflict-[A-Za-z0-9-]+$/.test(generatedCopy.id));
const legacyCopy = {
  ...resolved.find(chat => chat.id === "story"),
  id: "story-conflict-" + "a".repeat(24),
  title: "Renamed older alternate",
  _sync: { rev: uid(), ancestors: [], deleted: false }
};
const initialAll = Sync.validate([...resolved, legacyCopy]);
const all = Sync.stamp(initialAll.map(chat => chat.id === generatedCopy.id ? { ...chat, title: "Renamed current alternate" } : chat), initialAll, uid);
const currentCopy = all.find(chat => chat.id === generatedCopy.id);
assert.strictEqual(Sync.conflictOriginId(currentCopy), "story", "renamed chat-link copies retain their source identity");
assert.strictEqual(Sync.conflictOriginId(legacyCopy), "story", "renamed full-sync copies retain their source identity");
assert.strictEqual(Sync.conflictOriginId({ id: "story", title: "sync conflict" }), "", "a title alone cannot mark a story as a conflict copy");
const classifications = Sync.handoffChanges([first[0]], all, "story").changes;
assert.deepStrictEqual(classifications.filter(change => change.id !== "story").map(change => change.kind), ["conflict-copy", "conflict-copy"], "both generated formats are recognized without reading their titles");

for (const target of [currentCopy, legacyCopy]) {
  const retained = all.filter(chat => chat.id !== target.id);
  const deleted = Sync.stamp(retained, all, uid);
  assert.deepStrictEqual(deleted.map(chat => chat.id).sort(), all.map(chat => chat.id).sort(), "stamp keeps the removed copy as a tombstone");
  const tombstone = deleted.find(chat => chat.id === target.id);
  assert(tombstone._sync.deleted && tombstone._sync.ancestors.includes(target._sync.rev), "the deleted copy retains recoverable ancestry");
  assert.deepStrictEqual(tombstone.messages, target.messages, "deletion preserves the copy transcript");
  assert(deleted.filter(chat => chat._sync.deleted).length === 1, "only the selected copy is deleted");
  assert(deleted.find(chat => chat.id === "story" && !chat._sync.deleted), "the source story stays live");
  assert(deleted.find(chat => chat.id !== target.id && chat.id !== "story" && !chat._sync.deleted), "another alternate stays live");

  for (const [older, newer] of [[all, deleted], [deleted, all]]) {
    const joined = Sync.merge(older, newer).chats;
    assert(joined.find(chat => chat.id === target.id)._sync.deleted, "an older peer cannot resurrect the deleted copy");
    assert(joined.find(chat => chat.id === "story" && !chat._sync.deleted), "peer merge keeps the original story");
  }

  const editedTitle = target.title + " edited elsewhere";
  const concurrentEdit = Sync.stamp(all.map(chat => chat.id === target.id ? { ...chat, title: editedTitle } : chat), all, uid);
  const competing = Sync.merge(deleted, concurrentEdit).chats;
  assert(competing.some(chat => chat.id === target.id && !chat._sync.deleted && chat.title === editedTitle), "a concurrent newer edit remains reviewable");
  assert(competing.some(chat => chat._sync.deleted && chat.id !== target.id && chat.messages.length === target.messages.length), "the competing deletion stays recoverable");
  assert.deepStrictEqual(Sync.merge(deleted, concurrentEdit).chats, Sync.merge(concurrentEdit, deleted).chats, "concurrent cleanup converges on both peers");
}

console.log("PASS: both Chat conflict-copy formats delete exactly one copy, retain tombstones, resist older peers, and preserve concurrent edits");
