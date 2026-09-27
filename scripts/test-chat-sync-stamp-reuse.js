/* Every Chat save runs ChatSyncCore.stamp over the whole chats:all table. It
   used to canonicalize every conversation twice (the previous and next copy)
   even when the conversation was the very same object as last time, which on
   a long history cost hundreds of milliseconds per saved turn. An untouched
   conversation must now keep its revision without its transcript being read,
   while a real edit still receives a new revision. Lifts the shipped core. */
const assert = require("assert");
const core = require("../app/chat-sync-core");

let sequence = 0;
const uid = () => "rev-" + (++sequence);
let reads = 0;
function watchedChat(id, count) {
  const messages = [];
  for (let i = 0; i < count; i++) {
    const message = { id: id + "-" + i, role: i % 2 ? "assistant" : "user", content: "Turn " + i, parentId: i ? id + "-" + (i - 1) : "" };
    // validate() never reads this field; only canonicalizing the transcript does.
    Object.defineProperty(message, "note", { enumerable: true, get() { reads++; return "n"; } });
    messages.push(message);
  }
  return { id, title: "Story " + id, messages, leafId: id + "-" + (count - 1) };
}

const first = core.stamp([watchedChat("a", 50), watchedChat("b", 50)], [], uid);
reads = 0;
const edited = first.map(c => c.id === "a" ? Object.assign({}, c, { title: "Renamed" }) : c);
const second = core.stamp(edited, first, uid);
const a = second.find(c => c.id === "a"), b = second.find(c => c.id === "b");
const oldA = first.find(c => c.id === "a"), oldB = first.find(c => c.id === "b");

assert.notStrictEqual(a._sync.rev, oldA._sync.rev, "an edited conversation receives a new revision");
assert(a._sync.ancestors.includes(oldA._sync.rev), "the edit descends from the previous revision");
assert.strictEqual(b._sync, oldB._sync, "an untouched conversation keeps its revision");
assert.notStrictEqual(b, oldB, "stamp still returns a fresh row for the saved table");
assert.deepStrictEqual(Object.keys(b), Object.keys(oldB), "the untouched row keeps every field");
const perCanonical = (() => { const before = reads; core.payload(oldA); return reads - before; })();
reads -= perCanonical;
assert.strictEqual(reads, 2 * perCanonical, "only the edited conversation's transcript is canonicalized (old and new copy), got " + reads + " reads");

// Equal content in a different object still takes the full comparison path.
reads = 0;
const copied = second.map(c => Object.assign({}, c));
const third = core.stamp(copied, second, uid);
assert(third.every((c, i) => c._sync === second[i]._sync), "equal copies keep their revisions");
assert(reads > 0, "non-identical rows are still compared by content");

// A conversation without a saved revision is never waved through.
const legacy = watchedChat("legacy", 2);
const stamped = core.stamp([legacy], [legacy], uid);
assert(stamped[0]._sync && stamped[0]._sync.rev, "a legacy row still receives its first revision");

console.log("PASS: untouched conversations skip canonicalization; edits and legacy rows are still revised");
