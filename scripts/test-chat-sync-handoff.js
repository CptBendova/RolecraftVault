"use strict";
const assert = require("assert");
const Sync = require("../app/chat-sync-core");

const copy = value => JSON.parse(JSON.stringify(value));
const m0 = { id: "m0", parentId: null, role: "user", content: "The story starts." };
const m1 = { id: "m1", parentId: "m0", role: "assistant", content: "I enter the room." };
const baseline = { id: "story", title: "A story", messages: [m0, m1], leafId: "m1", updatedAt: 1, _sync: { rev: "r1", ancestors: [], deleted: false } };

const unchanged = copy(baseline);
unchanged._sync = { rev: "r2", ancestors: ["r1"], deleted: false };
assert.deepStrictEqual(Sync.handoffChanges([baseline], [unchanged], "story"), { active: null, changes: [], more: 0 }, "revision bookkeeping alone is not an incoming turn");

const next = copy(baseline);
next.messages.push({ id: "m2", parentId: "m1", role: "user", content: "Where are we?" });
next.leafId = "m2";
next.updatedAt = 2;
const advanced = Sync.handoffChanges([baseline], [next], "story");
assert.deepStrictEqual(advanced.active, { id: "story", kind: "advanced", addedTurns: 1, previousLeafId: "m1", leafId: "m2" });
assert.strictEqual(advanced.changes.length, 1);
assert(!JSON.stringify(advanced).includes("Where are we?"), "notices do not expose message text");
assert.strictEqual(JSON.stringify(baseline.messages), JSON.stringify([m0, m1]), "classification never changes the saved story");

const newcomer = { id: "new-story", title: "Another conversation", messages: [], leafId: "" };
const newResult = Sync.handoffChanges([baseline], [baseline, newcomer], "story");
assert.strictEqual(newResult.active, null);
assert.deepStrictEqual(newResult.changes[0], { id: "new-story", kind: "new", addedTurns: 0, previousLeafId: "", leafId: "" });

const sibling = copy(baseline);
sibling.messages.push({ id: "sibling", parentId: "m0", role: "user", content: "A different direction." });
sibling.leafId = "sibling";
sibling.updatedAt = 2;
assert.strictEqual(Sync.handoffChanges([baseline], [sibling], "story").active.kind, "branch-changed", "a peer's selected alternate branch is not described as the next turn");
const newBranch = { ...sibling, leafId: "m1" };
assert.strictEqual(Sync.handoffChanges([baseline], [newBranch], "story").active.kind, "branch-added", "new selectable writing on another branch remains visible in the notice");

const conflict = { ...copy(baseline), id: "story-conflict-" + "a".repeat(24), title: "A story (sync conflict)" };
assert.strictEqual(Sync.handoffChanges([baseline], [baseline, conflict], "story").changes[0].kind, "conflict-copy", "a recoverable alternate is never presented as a new independent story");
const olderLinkConflict = { ...copy(baseline), id: "story~conflict-r3", conflictOf: "story" };
assert.strictEqual(Sync.handoffChanges([baseline], [baseline, olderLinkConflict], "story").changes[0].kind, "conflict-copy");

const editedAncestor = copy(next);
editedAncestor.messages[1].content = "This was edited on another device.";
assert.strictEqual(Sync.handoffChanges([baseline], [editedAncestor], "story").active.kind, "branch-changed", "changed history cannot be reported as a safe append");
const editedSameLeaf = copy(baseline);
editedSameLeaf.messages[1].content = "The previous answer changed.";
assert.strictEqual(Sync.handoffChanges([baseline], [editedSameLeaf], "story").active.kind, "updated", "a changed turn is detected even if broken legacy revision metadata stayed the same");

const many = Array.from({ length: 11 }, (_, index) => ({ id: "new-" + index, messages: [], leafId: "" }));
const bounded = Sync.handoffChanges([baseline], [baseline, ...many], "story");
assert.strictEqual(bounded.changes.length, 8);
assert.strictEqual(bounded.more, 3);
console.log("PASS chat sync handoff notices classify turns, branches and conflict copies without copying prose");
