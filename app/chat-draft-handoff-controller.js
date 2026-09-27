(function (root) {
  "use strict";

  var HANDOFF_KEY = "chats:draft-handoffs";
  var DRAFT_KEY = "ui:chat-drafts";
  var CHAT_KEY = "chats:all";
  var STATE_KEY = "sync:state";
  var OFFER_FIELDS = ["format", "revision", "ownerDeviceId", "targetDeviceId", "chatId", "chatRevision", "leafId", "text", "createdAt", "expiresAt"];
  var UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

  function valueOf(result) { return result == null ? null : typeof result === "object" ? result.value ?? null : result; }
  function read(storage, key) {
    return Promise.resolve().then(function () { return storage.get(key); }).then(valueOf).catch(function (error) {
      if (error && /not found/i.test(error.message || "")) return null;
      throw error;
    });
  }
  function json(raw, fallback, message) {
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (_) { throw new Error(message); }
  }
  function draftMap(raw) {
    var parsed = json(raw, {}, "Saved drafts could not be read");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Saved drafts are damaged");
    var copy = Object.create(null);
    Object.keys(parsed).forEach(function (id) {
      if (typeof parsed[id] !== "string") throw new Error("Saved drafts are damaged");
      copy[id] = parsed[id];
    });
    return copy;
  }
  function savedChat(raw, id) {
    var rows = json(raw, [], "Saved conversations could not be read");
    if (!Array.isArray(rows)) throw new Error("Saved conversations are damaged");
    var found = rows.filter(function (row) { return row && row.id === id; });
    if (found.length !== 1 || !found[0]._sync || found[0]._sync.deleted ||
      typeof found[0]._sync.rev !== "string" || !Array.isArray(found[0].messages) ||
      typeof found[0].leafId !== "string" || found[0].leafId &&
      !found[0].messages.some(function (message) { return message && message.id === found[0].leafId; }) ||
      found[0].messages.some(function (message) { return !message || message.pending; })) {
      throw new Error("Save this conversation before handing off a draft");
    }
    return found[0];
  }
  function sameChat(live, saved) {
    return !!live && live.id === saved.id && live._sync && !live._sync.deleted &&
      live._sync.rev === saved._sync.rev && live.leafId === saved.leafId &&
      JSON.stringify(live._sync) === JSON.stringify(saved._sync);
  }
  function sameOffer(left, right) {
    return !!left && !!right && OFFER_FIELDS.every(function (field) { return left[field] === right[field]; });
  }
  function create(options) {
    options = options || {};
    var storage = options.storage, helper = options.helper || root.RolecraftChatDraftHandoff;
    var lane = options.lane || root.RolecraftSyncCore && root.RolecraftSyncCore.draftHandoff;
    if (!storage || typeof storage.get !== "function" || typeof storage.syncCommit !== "function" ||
      !helper || typeof helper.createOffer !== "function" || typeof helper.consume !== "function" ||
      !lane || lane.key !== HANDOFF_KEY || typeof lane.parse !== "function" || typeof lane.merge !== "function" ||
      typeof options.status !== "function" || typeof options.chat !== "function" ||
      typeof options.draft !== "function" || typeof options.uid !== "function") {
      throw new Error("Draft handoff controller is unavailable");
    }
    var waitForSave = options.waitForSave || function () { return Promise.resolve(); };
    var ready = options.ready || function () { return true; };
    var now = options.now || Date.now;
    function revisionId() {
      var value = options.uid();
      if (UUID.test(value)) return value;
      if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
      if (root.crypto && typeof root.crypto.getRandomValues === "function") {
        var bytes = root.crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
        var hex = Array.from(bytes,function (byte) { return byte.toString(16).padStart(2,"0"); }).join("");
        return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
      }
      throw new Error("Secure draft handoff identity is unavailable");
    }
    function available() {
      if (!ready()) throw new Error("Finish saving or unlock Chat before handing off a draft");
      var state = options.status(), settings = state && state.settings;
      if (!settings || settings.enabled !== true || typeof settings.group !== "string" ||
        typeof settings.device !== "string") throw new Error("Pair and enable automatic device sync first");
      return {state:state,settings:settings};
    }
    async function snapshot(chatId) {
      var raw = await Promise.all([read(storage,HANDOFF_KEY),read(storage,DRAFT_KEY),read(storage,CHAT_KEY),read(storage,STATE_KEY)]);
      var state = json(raw[3], null, "Device sync state could not be read");
      var pairing = available();
      if (!state || state.group !== pairing.settings.group || !(state.approved || state.accepted)) {
        throw new Error("Approve the first device sync comparison before sharing drafts");
      }
      var conversation = savedChat(raw[2],chatId);
      if (!sameChat(options.chat(),conversation)) throw new Error("Conversation changed before the draft handoff");
      return {raw:raw,lane:lane.parse(raw[0]),drafts:draftMap(raw[1]),chat:conversation,pairing:pairing};
    }
    function current(pairing,conversation,expectedDraft) {
      var latest = available();
      if (latest.settings.group !== pairing.settings.group || latest.settings.device !== pairing.settings.device ||
        !sameChat(options.chat(),conversation) || options.draft() !== expectedDraft) {
        throw new Error("Chat or draft changed before the handoff could save");
      }
      return latest;
    }
    function notifySaved(result) {
      if (typeof options.onSaved === "function") {
        try { Promise.resolve(options.onSaved(result)).catch(function () {}); } catch (_) { /* The durable save succeeded. */ }
      }
    }
    async function list() {
      available();
      return lane.parse(await read(storage,HANDOFF_KEY));
    }
    async function offer(input) {
      input = input || {};
      await waitForSave();
      var live = options.chat(), text = options.draft();
      if (!live || typeof live.id !== "string" || typeof text !== "string") throw new Error("Open a saved conversation with a draft first");
      var observed = await snapshot(live.id), pairing = observed.pairing;
      if (typeof input.targetDeviceId === "string" && !pairing.state.peers?.some(function (peer) {
        return peer.id === input.targetDeviceId && peer.draftHandoffSupported === true;
      })) throw new Error("That paired device cannot receive draft handoffs yet");
      var timestamp = now();
      var offered = helper.createOffer({revision:revisionId(),ownerDeviceId:pairing.settings.device,
        targetDeviceId:input.targetDeviceId == null?null:input.targetDeviceId,chatId:observed.chat.id,
        chatRevision:observed.chat._sync.rev,leafId:observed.chat.leafId,text:text,now:timestamp,
        ttlMs:input.ttlMs == null?60*60*1000:input.ttlMs});
      var nextLane = lane.merge([observed.lane,{format:1,offers:[offered],receipts:[]}],timestamp);
      var nextDrafts = observed.drafts;
      nextDrafts[observed.chat.id] = text;
      current(pairing,observed.chat,text);
      if (now() >= offered.expiresAt) throw new Error("Draft offer expired before it could be saved");
      await storage.syncCommit({[HANDOFF_KEY]:JSON.stringify(nextLane),[DRAFT_KEY]:JSON.stringify(nextDrafts)},
        {[HANDOFF_KEY]:observed.raw[0],[DRAFT_KEY]:observed.raw[1],[CHAT_KEY]:observed.raw[2],[STATE_KEY]:observed.raw[3]});
      var result = {offer:offered,text:text,keptSourceDraft:true,liveChanged:options.draft()!==text};
      notifySaved(result);
      return result;
    }
    async function accept(input) {
      input = input || {};
      helper.validateOffer(input.offer);
      await waitForSave();
      var live = options.chat();
      if (!live || live.id !== input.offer.chatId) throw new Error("Open the offered conversation before accepting its draft");
      var observed = await snapshot(live.id), pairing = observed.pairing;
      var found = observed.lane.offers.find(function (value) { return value.revision === input.offer.revision; });
      if (!sameOffer(found,input.offer)) throw new Error("The draft offer changed before acceptance");
      var savedDraft = observed.drafts[observed.chat.id] || "";
      var liveDraft = options.draft();
      var peers = Array.isArray(pairing.state.peers)?pairing.state.peers:[];
      var timestamp = now();
      var accepted = helper.consume(found,{now:timestamp,deviceId:pairing.settings.device,
        pairedDeviceIds:[pairing.settings.device].concat(peers.map(function (peer) { return peer.id; })),
        expectedRevision:input.offer.revision,chatId:observed.chat.id,
        chatRevision:observed.chat._sync.rev,leafId:observed.chat.leafId,
        liveDraft:liveDraft,savedDraft:savedDraft,receipts:observed.lane.receipts});
      if (!accepted.ok) throw new Error("Draft handoff cannot be accepted: "+accepted.reason);
      var nextLane = lane.merge([observed.lane,{format:1,offers:[],receipts:[accepted.receipt]}],timestamp);
      var nextDrafts = observed.drafts;
      nextDrafts[observed.chat.id] = accepted.draft;
      current(pairing,observed.chat,liveDraft);
      if (now() >= found.expiresAt) throw new Error("Draft offer expired before it could be accepted");
      await storage.syncCommit({[HANDOFF_KEY]:JSON.stringify(nextLane),[DRAFT_KEY]:JSON.stringify(nextDrafts)},
        {[HANDOFF_KEY]:observed.raw[0],[DRAFT_KEY]:observed.raw[1],[CHAT_KEY]:observed.raw[2],[STATE_KEY]:observed.raw[3]});
      var result = {draft:accepted.draft,receipt:accepted.receipt,liveChanged:options.draft()!==liveDraft};
      notifySaved(result);
      return result;
    }
    return {list:list,offer:offer,accept:accept};
  }
  var api = {create:create,HANDOFF_KEY:HANDOFF_KEY,DRAFT_KEY:DRAFT_KEY};
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RolecraftChatDraftHandoffController = api;
})(typeof window === "object" ? window : globalThis);
