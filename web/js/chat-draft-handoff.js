(function (root) {
  "use strict";

  // Pure helpers for explicitly offered drafts. The caller owns encrypted
  // transport, durable storage, pairing checks and the final compare-and-swap.
  var MAX_TEXT_BYTES = 32 * 1024;
  var MAX_TTL_MS = 24 * 60 * 60 * 1000;
  var MIN_TTL_MS = 60 * 1000;
  var MAX_OFFERS = 32;
  var MAX_RECEIPTS = 128;
  var CLOCK_SKEW_MS = 5 * 60 * 1000;
  var UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  var CHAT_REV = /^[a-zA-Z0-9-]{1,100}$/;
  var OFFER_FIELDS = ["format", "revision", "ownerDeviceId", "targetDeviceId", "chatId", "chatRevision", "leafId", "text", "createdAt", "expiresAt"];
  var RECEIPT_FIELDS = ["format", "revision", "ownerDeviceId", "recipientDeviceId", "chatId", "consumedAt", "expiresAt"];
  var encoder = new TextEncoder();

  function record(value, fields) {
    return !!value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).length === fields.length &&
      fields.every(function (field) { return Object.prototype.hasOwnProperty.call(value, field); });
  }
  function time(value) { return Number.isSafeInteger(value) && value >= 0; }
  function chatId(value) { return typeof value === "string" && value.length > 0 && value.length <= 500; }
  function leafId(value) { return typeof value === "string" && value.length <= 500; }
  function validText(value) {
    return typeof value === "string" && !!value.trim() && value.length <= MAX_TEXT_BYTES && encoder.encode(value).length <= MAX_TEXT_BYTES;
  }
  function validateOffer(offer) {
    if (!record(offer, OFFER_FIELDS) || offer.format !== 1 || !UUID.test(offer.revision) ||
      !UUID.test(offer.ownerDeviceId) || offer.targetDeviceId !== null && !UUID.test(offer.targetDeviceId) ||
      offer.targetDeviceId === offer.ownerDeviceId || !chatId(offer.chatId) || !CHAT_REV.test(offer.chatRevision) ||
      !leafId(offer.leafId) || !validText(offer.text) || !time(offer.createdAt) || !time(offer.expiresAt) ||
      offer.expiresAt - offer.createdAt < MIN_TTL_MS || offer.expiresAt - offer.createdAt > MAX_TTL_MS) {
      throw new Error("Invalid draft handoff offer");
    }
    return offer;
  }
  function createOffer(input) {
    if (!input || !time(input.now) || !time(input.ttlMs) || input.ttlMs < MIN_TTL_MS || input.ttlMs > MAX_TTL_MS ||
      !Number.isSafeInteger(input.now + input.ttlMs)) throw new Error("Invalid draft handoff lifetime");
    return validateOffer({
      format: 1, revision: input.revision, ownerDeviceId: input.ownerDeviceId,
      targetDeviceId: input.targetDeviceId == null ? null : input.targetDeviceId,
      chatId: input.chatId, chatRevision: input.chatRevision, leafId: input.leafId,
      text: input.text, createdAt: input.now, expiresAt: input.now + input.ttlMs
    });
  }
  function validateOffers(offers) {
    if (!Array.isArray(offers) || offers.length > MAX_OFFERS) throw new Error("Too many draft handoff offers");
    var revisions = new Set();
    offers.forEach(function (offer) {
      validateOffer(offer);
      if (revisions.has(offer.revision)) throw new Error("Duplicate draft handoff revision");
      revisions.add(offer.revision);
    });
    return offers;
  }
  function mergeOffers(left, right, now) {
    if (!time(now)) throw new Error("Invalid draft handoff time");
    validateOffers(left); validateOffers(right);
    var merged = new Map();
    left.concat(right).forEach(function (offer) {
      if (offer.expiresAt <= now) return;
      var old = merged.get(offer.revision);
      if (old && OFFER_FIELDS.some(function (field) { return old[field] !== offer[field]; })) {
        throw new Error("Draft handoff revision contains conflicting data");
      }
      merged.set(offer.revision, offer);
    });
    var result = Array.from(merged.values()).sort(function (a, b) {
      return a.createdAt - b.createdAt || a.revision.localeCompare(b.revision);
    });
    return validateOffers(result);
  }
  function validateReceipt(receipt) {
    if (!record(receipt, RECEIPT_FIELDS) || receipt.format !== 1 || !UUID.test(receipt.revision) ||
      !UUID.test(receipt.ownerDeviceId) || !UUID.test(receipt.recipientDeviceId) || !chatId(receipt.chatId) ||
      !time(receipt.consumedAt) || !time(receipt.expiresAt) || receipt.expiresAt <= receipt.consumedAt ||
      receipt.expiresAt - receipt.consumedAt > MAX_TTL_MS + CLOCK_SKEW_MS) {
      throw new Error("Invalid draft handoff receipt");
    }
    return receipt;
  }
  function validateReceipts(receipts) {
    if (!Array.isArray(receipts) || receipts.length > MAX_RECEIPTS) throw new Error("Too many draft handoff receipts");
    var keys = new Set();
    receipts.forEach(function (receipt) {
      validateReceipt(receipt);
      var key = receipt.revision + ":" + receipt.recipientDeviceId;
      if (keys.has(key)) throw new Error("Duplicate draft handoff receipt");
      keys.add(key);
    });
    return receipts;
  }
  function pruneReceipts(receipts, now) {
    if (!time(now)) throw new Error("Invalid draft handoff time");
    return validateReceipts(receipts).filter(function (receipt) { return receipt.expiresAt > now; });
  }
  function inspect(offer, context) {
    try { validateOffer(offer); } catch (_) { return { ok: false, reason: "invalid-offer" }; }
    try {
      if (!context || !time(context.now) || !UUID.test(context.deviceId) || !UUID.test(context.expectedRevision) ||
        !Array.isArray(context.pairedDeviceIds) || context.pairedDeviceIds.length > 32 ||
        context.pairedDeviceIds.some(function (id) { return !UUID.test(id); }) ||
        !chatId(context.chatId) || !CHAT_REV.test(context.chatRevision) || !leafId(context.leafId) ||
        typeof context.liveDraft !== "string" || typeof context.savedDraft !== "string") return { ok: false, reason: "invalid-context" };
      validateReceipts(context.receipts);
    } catch (_) { return { ok: false, reason: "invalid-context" }; }
    if (offer.createdAt > context.now + CLOCK_SKEW_MS) return { ok: false, reason: "not-yet-valid" };
    if (context.now >= offer.expiresAt) return { ok: false, reason: "expired" };
    if (offer.ownerDeviceId === context.deviceId || offer.targetDeviceId && offer.targetDeviceId !== context.deviceId) return { ok: false, reason: "wrong-device" };
    if (context.pairedDeviceIds.indexOf(context.deviceId) < 0 || context.pairedDeviceIds.indexOf(offer.ownerDeviceId) < 0) return { ok: false, reason: "unpaired-owner" };
    if (context.expectedRevision !== offer.revision) return { ok: false, reason: "changed-offer" };
    if (context.chatId !== offer.chatId) return { ok: false, reason: "wrong-chat" };
    if (context.chatRevision !== offer.chatRevision || context.leafId !== offer.leafId) return { ok: false, reason: "changed-chat" };
    if (context.receipts.some(function (receipt) { return receipt.revision === offer.revision && receipt.recipientDeviceId === context.deviceId; })) return { ok: false, reason: "already-consumed" };
    if (context.liveDraft !== "" || context.savedDraft !== "") return { ok: false, reason: "local-draft" };
    return { ok: true };
  }
  function consume(offer, context) {
    var result = inspect(offer, context);
    if (!result.ok) return result;
    return {
      ok: true, draft: offer.text,
      receipt: { format: 1, revision: offer.revision, ownerDeviceId: offer.ownerDeviceId,
        recipientDeviceId: context.deviceId, chatId: offer.chatId,
        consumedAt: context.now, expiresAt: offer.expiresAt }
    };
  }
  var api = { MAX_TEXT_BYTES: MAX_TEXT_BYTES, MAX_TTL_MS: MAX_TTL_MS, MAX_OFFERS: MAX_OFFERS,
    createOffer: createOffer, validateOffer: validateOffer, validateOffers: validateOffers,
    mergeOffers: mergeOffers, validateReceipt: validateReceipt, validateReceipts: validateReceipts,
    pruneReceipts: pruneReceipts, inspect: inspect, consume: consume };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RolecraftChatDraftHandoff = api;
})(typeof window === "object" ? window : globalThis);
