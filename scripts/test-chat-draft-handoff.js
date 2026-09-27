"use strict";
const assert = require("assert");
const Handoff = require("../app/chat-draft-handoff");

const owner = "11111111-1111-4111-8111-111111111111";
const phone = "22222222-2222-4222-8222-222222222222";
const tablet = "33333333-3333-4333-8333-333333333333";
const stranger = "44444444-4444-4444-8444-444444444444";
const revision = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondRevision = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = 1_800_000_000_000;
const offered = Handoff.createOffer({
  revision, ownerDeviceId: owner, chatId: "story", chatRevision: "chat-rev-1",
  leafId: "turn-7", text: "  Wait for me at the bridge. 🐉  ", now, ttlMs: 60 * 60 * 1000
});
const context = {
  now: now + 1000, deviceId: phone, pairedDeviceIds: [owner, phone, tablet],
  expectedRevision: revision, chatId: "story", chatRevision: "chat-rev-1", leafId: "turn-7",
  liveDraft: "", savedDraft: "", receipts: []
};
const withContext = changes => ({ ...context, ...changes });
const reject = (offer, changes, reason) =>
  assert.deepStrictEqual(Handoff.inspect(offer, withContext(changes)), { ok: false, reason });

assert.strictEqual(offered.targetDeviceId, null, "an omitted target broadcasts only within the paired group");
assert.strictEqual(Handoff.validateOffer(offered), offered);
assert.deepStrictEqual(Handoff.inspect(offered, context), { ok: true });
const accepted = Handoff.consume(offered, context);
assert.strictEqual(accepted.ok, true);
assert.strictEqual(accepted.draft, offered.text, "handoff preserves the exact text and whitespace");
assert.deepStrictEqual(accepted.receipt, {
  format: 1, revision, ownerDeviceId: owner, recipientDeviceId: phone,
  chatId: "story", consumedAt: now + 1000, expiresAt: offered.expiresAt
});
assert(!JSON.stringify(accepted.receipt).includes("bridge"), "receipt carries no draft prose");
assert.strictEqual(offered.text, "  Wait for me at the bridge. 🐉  ", "consume does not change the source offer");

reject(offered, { receipts: [accepted.receipt] }, "already-consumed");
reject(offered, { liveDraft: "a new unsent reply" }, "local-draft");
reject(offered, { savedDraft: "a saved unsent reply" }, "local-draft");
reject(offered, { liveDraft: " " }, "local-draft");
reject(offered, { chatId: "another-story" }, "wrong-chat");
reject(offered, { chatRevision: "chat-rev-2" }, "changed-chat");
reject(offered, { leafId: "another-branch" }, "changed-chat");
reject(offered, { expectedRevision: secondRevision }, "changed-offer");
reject(offered, { deviceId: owner }, "wrong-device");
reject(offered, { pairedDeviceIds: [phone, tablet] }, "unpaired-owner");
reject(offered, { pairedDeviceIds: [owner, tablet] }, "unpaired-owner");
reject(offered, { now: offered.expiresAt }, "expired");
reject(offered, { now: offered.createdAt - 5 * 60 * 1000 - 1 }, "not-yet-valid");
reject(offered, { savedDraft: undefined }, "invalid-context");

const targeted = Handoff.createOffer({
  revision: secondRevision, ownerDeviceId: owner, targetDeviceId: phone,
  chatId: "story", chatRevision: "chat-rev-1", leafId: "turn-7",
  text: "Only the phone should see this.", now, ttlMs: 60 * 1000
});
reject(targeted, { deviceId: tablet, expectedRevision: secondRevision }, "wrong-device");
assert.strictEqual(Handoff.inspect(targeted, withContext({ expectedRevision: secondRevision })).ok, true);
assert.strictEqual(Handoff.inspect(offered, withContext({ deviceId: tablet, receipts: [accepted.receipt] })).ok, true,
  "broadcast recipients can independently claim; a phone receipt does not consume the tablet's copy");
assert.deepStrictEqual(Handoff.consume(offered, withContext({ liveDraft: "keep this" })), { ok: false, reason: "local-draft" },
  "a failed claim never returns prose for replacement");

const invalid = changes => assert.throws(() => Handoff.validateOffer({ ...offered, ...changes }), /Invalid draft handoff offer/);
invalid({ revision: "predictable" });
invalid({ ownerDeviceId: stranger, targetDeviceId: stranger });
invalid({ targetDeviceId: "not-a-device" });
invalid({ text: " " });
invalid({ text: "🐉".repeat(9000) });
invalid({ expiresAt: offered.createdAt + Handoff.MAX_TTL_MS + 1 });
invalid({ expiresAt: offered.createdAt + 1 });
invalid({ secret: "extra field" });
assert.throws(() => Handoff.createOffer({ ...offered, now, ttlMs: Handoff.MAX_TTL_MS + 1 }), /lifetime/);
assert.deepStrictEqual(Handoff.inspect({ ...offered, text: "" }, context), { ok: false, reason: "invalid-offer" });

const combined = Handoff.mergeOffers([offered], [offered, targeted], now + 1000);
assert.deepStrictEqual(combined.map(offer => offer.revision), [revision, secondRevision], "immutable offers merge without editing transcripts");
assert.deepStrictEqual(Handoff.mergeOffers([offered], [targeted], targeted.expiresAt), [offered], "expired offers fall out of the separate offer lane");
assert.throws(() => Handoff.mergeOffers([offered], [{ ...offered, text: "equivocation" }], now), /conflicting data/,
  "one revision cannot silently acquire different prose");
assert.throws(() => Handoff.validateOffers([offered, offered]), /Duplicate/);
assert.throws(() => Handoff.validateOffers(Array(33).fill(offered)), /Too many/);
assert.deepStrictEqual(Handoff.pruneReceipts([accepted.receipt], offered.expiresAt), [], "expired one-time receipts can be discarded");
assert.throws(() => Handoff.validateReceipts([accepted.receipt, accepted.receipt]), /Duplicate/);

console.log("PASS explicit draft handoff bounds, paired ownership, exact revision/leaf, local draft protection, expiry and one-time consume");
