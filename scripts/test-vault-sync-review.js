"use strict";
const assert = require("assert"), crypto = require("crypto"), path = require("path");
const C = require(path.join(__dirname, "../app/vault-sync-core"));
const R = require(path.join(__dirname, "../app/vault-sync-review"));
const hash = async value => crypto.createHash("sha256").update(value).digest("hex");
const key = (kind, id) => C.keyOf(kind, id);
const clone = value => JSON.parse(JSON.stringify(value));
const records = rows => Object.fromEntries(rows.map(([kind, value]) => [key(kind, value.id), value]));
const resolve = (items, snapshot, choices, device = "tablet") => R.resolve({items, snapshot, choices, device, hash, core: C});
(async () => {
  const id = "irethia", copyId = id + "-conflict-" + "a".repeat(24), nestedId = copyId + "-conflict-" + "b".repeat(24);
  const original = {id, name: "Irethia", description: "Earlier writing", profileImg: "portrait-old", images: ["gallery-old"], variants: [{id: "variant", profileImg: "variant-old"}], updatedAt: 10};
  const copy = {id: copyId, name: "Irethia (sync conflict)", description: "Latest writing", profileImg: "portrait-new", images: ["gallery-new"], variants: [{id: "variant", profileImg: "variant-new"}], syncAliases: ["earlier-alias"], updatedAt: 20};
  const nested = {id: nestedId, name: "Irethia (sync conflict) (sync conflict)", description: "Other writing", images: ["gallery-nested"]};
  const unrelated = {id: "unrelated", name: "Irethia (sync conflict)", images: ["unrelated-picture"]};
  const items = records([["character", original], ["character", copy], ["character", nested], ["character", unrelated]]);
  const before = C.canonical(items), groups = R.groups(items);
  assert.equal(C.canonical(items), before);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, key("character", id));
  assert.equal(groups[0].candidates.length, 3);
  assert.deepEqual(groups[0].candidates.map(row => row.original), [true, false, false]);
  console.log("PASS discovery groups exact and nested legacy IDs without mutating records or guessing by name");

  const snapshot = await C.scan(items, null, "tablet", hash);
  const noChoice = await resolve(items, snapshot, {});
  assert.strictEqual(noChoice.items, items);
  assert.strictEqual(noChoice.snapshot, snapshot);
  assert.equal(noChoice.count, 0);
  await assert.rejects(resolve(items, snapshot, {[key("character", id)]: key("character", "unrelated")}), /no longer available/);
  await assert.rejects(resolve(items, snapshot, {[key("character", "missing")]: key("character", copyId)}), /no longer available/);
  assert.equal(C.canonical(items), before);
  console.log("PASS no selection changes nothing, and invalid choices fail before any mutation");

  // The selected copy was independently edited on the phone after pairing.
  const phoneItems = {...items, [key("character", copyId)]: {...copy, description: "Latest phone writing"}};
  const phone = await C.scan(phoneItems, snapshot, "phone", hash);
  const fixed = await resolve(phoneItems, phone, {[key("character", id)]: key("character", copyId)});
  const kept = fixed.items[key("character", id)], bin = Object.entries(fixed.items).filter(([k]) => C.parts(k)[0] === "trash").map(([, value]) => value);
  assert.equal(fixed.count, 1);
  assert.equal(kept.name, "Irethia");
  assert.equal(kept.id, id);
  assert.equal(kept.description, "Latest phone writing");
  assert.equal(kept.profileImg, "portrait-new");
  assert.equal(kept.variants[0].profileImg, "variant-new");
  assert.deepEqual(kept.syncAliases, ["earlier-alias", copyId, nestedId].sort());
  assert(!fixed.items[key("character", copyId)] && !fixed.items[key("character", nestedId)]);
  assert.strictEqual(fixed.items[key("character", "unrelated")], unrelated);
  assert.equal(bin.length, 3);
  assert(bin.every(value => value.syncConflict && value.syncRecovered && value.type === "character"));
  assert(bin.some(value => value.record.profileImg === "portrait-old" && value.record.variants[0].profileImg === "variant-old"));
  assert(bin.some(value => value.record.images.includes("gallery-new")));
  assert(bin.some(value => value.record.images.includes("gallery-nested")));
  assert.equal(C.canonical(items), before);
  await C.validate(fixed.snapshot, hash);
  console.log("PASS chosen writing becomes canonical; removed copies and overwritten original retain all picture references in Bin");

  const stale = await C.merge([fixed.snapshot, snapshot, phone], "tablet", hash, {singleLibrary: true, device: "tablet", localSnapshot: fixed.snapshot});
  assert.equal(C.canonical(stale.items), C.canonical(fixed.items));
  assert.equal(R.groups(stale.items).length, 0);
  const newPhoneItems = {...fixed.items, [key("character", id)]: {...kept, description: "A later normal edit"}};
  const nextPhone = await C.scan(newPhoneItems, fixed.snapshot, "phone", hash);
  const ordinary = await C.merge([fixed.snapshot, nextPhone], "tablet", hash, {singleLibrary: true, device: "tablet", localSnapshot: fixed.snapshot});
  assert.equal(ordinary.items[key("character", id)].description, "A later normal edit");
  console.log("PASS reviewed ancestry and copy tombstones beat stale peers, while later phone edits still update the canonical record");

  const lateRecord = {...phoneItems[key("character", copyId)], description: "Unseen offline writing after review", images: ["late-offline-picture"]};
  const latePhone = await C.scan({...phoneItems, [key("character", copyId)]: lateRecord}, phone, "phone", hash);
  const lateMerged = await C.merge([fixed.snapshot, latePhone], "tablet", hash, {singleLibrary: true, device: "tablet", localSnapshot: fixed.snapshot});
  assert(!lateMerged.items[key("character", copyId)], "a genuinely unseen edit to a removed alias must not resurrect a duplicate card");
  assert.equal(lateMerged.items[key("character", id)].description, kept.description);
  assert(Object.entries(lateMerged.items).some(([k, value]) => C.parts(k)[0] === "trash" && value.record.description === lateRecord.description && value.record.images.includes("late-offline-picture")), "unseen offline writing and all its pictures remain recoverable");
  const replayLate = await C.merge([lateMerged.snapshot, latePhone, fixed.snapshot], "tablet", hash, {singleLibrary: true, device: "tablet", localSnapshot: lateMerged.snapshot});
  assert.equal(C.canonical(replayLate.items), C.canonical(lateMerged.items));
  const restored = await C.scan({...lateMerged.items, [key("character", copyId)]: lateRecord}, lateMerged.snapshot, "tablet", hash);
  const restoredMerge = await C.merge([restored, lateMerged.snapshot, latePhone], "tablet", hash, {singleLibrary: true, device: "tablet", localSnapshot: restored});
  assert.equal(restoredMerge.items[key("character", copyId)].description, lateRecord.description, "intentional restore after seeing the tombstone remains an ordinary causal edit");
  console.log("PASS unseen offline edits to reviewed aliases go to Bin with pictures, while explicit later restores remain live");

  const keepOriginal = await resolve(items, snapshot, {[key("character", id)]: key("character", id)});
  const originalBin = Object.entries(keepOriginal.items).filter(([k]) => C.parts(k)[0] === "trash").map(([, value]) => value);
  assert.equal(originalBin.length, 2);
  assert.equal(keepOriginal.items[key("character", id)].description, "Earlier writing");
  const keepNested = await resolve(items, snapshot, {[key("character", id)]: key("character", nestedId)});
  assert.equal(keepNested.items[key("character", id)].name, "Irethia");
  const named = records([["lore", {id: "named", name: "Story (sync conflict)"}], ["lore", {id: "named-conflict-" + "a".repeat(24), name: "Story (sync conflict) (sync conflict)"}]]);
  const preserveName = await resolve(named, await C.scan(named, null, "tablet", hash), {[key("lore", "named")]: key("lore", "named-conflict-" + "a".repeat(24))});
  assert.equal(preserveName.items[key("lore", "named")].name, "Story (sync conflict)");
  console.log("PASS keeping the original only archives its copies; choosing a nested copy strips only generated name suffixes");

  const pcopy = "prompt-conflict-" + "c".repeat(24);
  const more = records([
    ["prompt", {id: "prompt", title: "Old prompt", text: "old"}], ["prompt", {id: pcopy, title: "New prompt (sync conflict)", text: "new"}],
    ["persona", {id: "persona", name: "You", images: ["you-old"]}], ["persona", {id: "persona-conflict-" + "d".repeat(24), name: "You (sync conflict)", images: ["you-new"]}],
    ["lore", {id: "lore", name: "World", text: "old"}], ["lore", {id: "lore-conflict-" + "e".repeat(24), name: "World (sync conflict)", text: "new"}],
    ["character", {id: "orphan-conflict-" + "f".repeat(24), name: "Orphan"}],
    ["character", {id: "bad-conflict-not-a-hash", name: "Bad"}]
  ]);
  more[JSON.stringify(["character", "malformed-conflict-" + "a".repeat(24)])] = {id: "different", name: "Broken"};
  const found = R.groups(more);
  assert.equal(found.length, 3);
  delete more[JSON.stringify(["character", "malformed-conflict-" + "a".repeat(24)])];
  const multi = await resolve(more, await C.scan(more, null, "tablet", hash), Object.fromEntries(found.map(group => [group.key, group.candidates[1].key])));
  assert.equal(multi.count, 3);
  assert.equal(multi.items[key("prompt", "prompt")].title, "New prompt");
  assert(!own(multi.items[key("persona", "persona")], "syncAliases"));
  assert(multi.items[key("character", "orphan-conflict-" + "f".repeat(24))]);
  console.log("PASS supported record kinds review independently; malformed, orphan and non-generated identities stay untouched");

  const onceAgain = await resolve(phoneItems, phone, {[key("character", id)]: key("character", copyId)}, "computer");
  const convergence = await C.merge([fixed.snapshot, onceAgain.snapshot], "tablet", hash, {singleLibrary: true, device: "tablet", localSnapshot: fixed.snapshot});
  const archiveIds = new Set(bin.map(value => value.tid));
  const convergedArchives = Object.entries(convergence.items).filter(([k, v]) => C.parts(k)[0] === "trash" && archiveIds.has(v.tid));
  assert.equal(convergedArchives.length, 3);
  assert(!Object.keys(convergence.items).some(k => C.parts(k)[0] === "trash" && C.parts(k)[1].includes("-conflict-", "sync-review-".length)));
  console.log("PASS deterministic recovery identities avoid multiplying archives on concurrent review");

  const purgeItems = {...fixed.items}, purgedKey = key("trash", bin[0].tid);
  delete purgeItems[purgedKey];
  const purge = await C.scan(purgeItems, fixed.snapshot, "tablet", hash);
  const afterPurge = await C.merge([purge, onceAgain.snapshot], "tablet", hash, {singleLibrary: true, device: "tablet", localSnapshot: purge});
  assert(!afterPurge.items[purgedKey]);
  const wrongArchive = {...phoneItems, [purgedKey]: {tid: bin[0].tid, type: "character", record: {id: "other", name: "Other"}, deletedAt: 1}};
  await assert.rejects(resolve(wrongArchive, await C.scan(wrongArchive, phone, "tablet", hash), {[key("character", id)]: key("character", copyId)}), /identity is already in use/);
  console.log("PASS purged recovery stays purged; unexpected archive identity collisions fail closed");
})().catch(error => {console.error(error); process.exitCode = 1;});
function own(value, field) { return Object.prototype.hasOwnProperty.call(value, field); }
