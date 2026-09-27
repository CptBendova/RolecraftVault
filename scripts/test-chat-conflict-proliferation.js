// Concurrent story appends should stay in one conversation, while real edits
// remain recoverable without creating a conflict of a conflict forever.
const assert = require("assert");
const crypto = require("crypto");
const C = require("../app/vault-sync-core");
const ChatSync = require("../app/chat-sync-core");
C.TABLES.conversation = ["chats:all", "id"];
const hash = text => crypto.createHash("sha256").update(text).digest("hex");
const key = id => C.keyOf("conversation", id);
const chat = {
  id: "story", title: "Irethia", messages: [{id:"root", role:"user", content:"Scene", parentId:null}],
  leafId: "root", pinnedFacts: "", updatedAt: 1,
  _sync: {rev:"base", ancestors:[], deleted:false}
};
const item = row => ({[key(row.id)]:row});
const clone = value => JSON.parse(JSON.stringify(value));

(async () => {
  const base = await C.scan(item(chat), null, "tablet", hash);
  const branches = await Promise.all(["tablet", "phone", "windows"].map(async (device, i) => {
    const next = clone(chat), id = "turn-" + device;
    next.messages.push({id, role:"assistant", content:device, parentId:"root"});
    next.leafId = id; next.updatedAt = i + 2;
    next._sync = {rev:"reply-" + device, ancestors:["base"], deleted:false};
    return C.scan(item(next), base, device, hash);
  }));
  const joined = await C.merge(branches, "tablet", hash);
  await C.validate(joined.snapshot, hash);
  assert.strictEqual(Object.keys(joined.items).length, 1, "three safe concurrent append paths must not create conflict copies");
  assert.deepStrictEqual(joined.items[key("story")].messages.map(m => m.id).sort(),
    ["root", "turn-phone", "turn-tablet", "turn-windows"].sort());
  const rewritten = clone(chat);
  rewritten.messages[0].content = "Changed earlier writing";
  rewritten.messages.push({id:"turn-rewritten", role:"assistant", content:"Later", parentId:"root"});
  rewritten.leafId = "turn-rewritten";
  rewritten._sync = {rev:"reply-rewritten", ancestors:["base"], deleted:false};
  const unsafe = await C.merge([branches[0], branches[1], await C.scan(item(rewritten), base, "fourth", hash)], "tablet", hash);
  assert(Object.keys(unsafe.items).length > 1, "an edited shared turn must retain separate recoverable versions");

  const clockOnly = await Promise.all(["phone", "windows"].map(async (device, i) => {
    const next = clone(chat);
    next.updatedAt = i + 3;
    next._sync = {rev:"timestamp-" + device, ancestors:["base"], deleted:false};
    return C.scan(item(next), base, device, hash);
  }));
  const timeJoined = await C.merge(clockOnly, "tablet", hash);
  assert.strictEqual(Object.keys(timeJoined.items).length, 1, "timestamp-only saves must not duplicate an unchanged story");
  assert.strictEqual(timeJoined.items[key("story")].updatedAt, 4);

  const edits = await Promise.all(["phone", "windows"].map(async (device, i) => {
    const next = clone(chat);
    next.pinnedFacts = "Different " + device + " notes";
    next.updatedAt = i + 3;
    next._sync = {rev:"edit-" + device, ancestors:["base"], deleted:false};
    return C.scan(item(next), base, device, hash);
  }));
  const first = await C.merge(edits, "tablet", hash);
  const oldCopy = Object.values(first.items).find(row => row.id !== "story");
  assert(oldCopy, "real competing edits must remain recoverable");
  const deleted = await C.scan(Object.fromEntries(Object.entries(first.items).filter(([record]) => record !== key(oldCopy.id))), first.snapshot, "tablet", hash);
  const afterDelete = await C.merge([deleted, first.snapshot], "tablet", hash);
  assert(!afterDelete.items[key(oldCopy.id)], "a reviewed and deleted copy must not return from a stale peer");
  const afterRetry = await C.merge([afterDelete.snapshot, first.snapshot], "tablet", hash);
  assert(!afterRetry.items[key(oldCopy.id)], "repeated sync must not reseed a deleted conflict copy");
  const copyEdits = await Promise.all(["phone", "windows"].map(async (device, i) => {
    const changed = clone(oldCopy);
    changed.pinnedFacts = "Copy changed on " + device;
    changed.updatedAt = 10 + i;
    changed._sync = {rev:"copy-edit-" + device, ancestors:[oldCopy._sync.rev], deleted:false};
    return C.scan({...first.items, [key(oldCopy.id)]:changed}, first.snapshot, device, hash);
  }));
  const second = await C.merge(copyEdits, "tablet", hash);
  await C.validate(second.snapshot, hash);
  const copies = Object.values(second.items).filter(row => row.id !== "story");
  assert(copies.length >= 2, "competing edits to a copy must both survive");
  assert(copies.every(row => !/\(sync conflict\) \(sync conflict\)/.test(row.title)), "copy titles must not grow nested suffixes");
  assert(copies.every(row => !/-conflict-[a-f0-9]{24}-conflict-/.test(row.id)), "copy identities must remain siblings of the original");
  assert(copies.some(row => row.pinnedFacts === "Copy changed on phone"));
  assert(copies.some(row => row.pinnedFacts === "Copy changed on windows"));

  const legacy = clone(chat);
  legacy.id = "story~conflict-older";
  legacy.title = "Irethia (conflict copy)";
  legacy.conflictOf = "story";
  const left = {...legacy, pinnedFacts:"left", _sync:{rev:"link-left", ancestors:["older"], deleted:false}};
  const right = {...legacy, pinnedFacts:"right", _sync:{rev:"link-right", ancestors:["older"], deleted:false}};
  const link = ChatSync.merge([left], [right]);
  assert.strictEqual(link.chats.length, 2);
  assert(link.chats.every(row => ChatSync.conflictOriginId(row) === "story"));
  assert(link.chats.every(row => !/\(conflict copy\) \(conflict copy\)/.test(row.title)));
  assert(link.chats.every(row => !row.id.includes("~conflict-older~conflict-")));

  const linkBase = clone(chat);
  linkBase.id = "story~conflict-older";
  linkBase.title = "Irethia (conflict copy)";
  const linkSnapshot = await C.scan(item(linkBase), null, "tablet", hash);
  const linkEdits = await Promise.all(["phone", "windows"].map(async device => {
    const next = clone(linkBase);
    next.pinnedFacts = "Legacy copy on " + device;
    next._sync = {rev:"legacy-" + device, ancestors:["base"], deleted:false};
    return C.scan(item(next), linkSnapshot, device, hash);
  }));
  const fullOfLink = await C.merge(linkEdits, "tablet", hash);
  assert(Object.values(fullOfLink.items).some(row => row.id.startsWith("story-conflict-")), "full sync must keep a legacy link alternate under its original source");
  console.log("PASS three-device append joins, timestamp-only deduplication, and flat recoverable conflict copies");
})().catch(error => { console.error(error); process.exitCode = 1; });
