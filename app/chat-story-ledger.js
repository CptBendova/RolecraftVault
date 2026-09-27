(function (root) {
  "use strict";

  var KINDS = { fact: "Fact", relationship: "Relationship", promise: "Promise" };
  var MAX_ENTRIES = 24;
  var MAX_TEXT = 400;

  function own(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function sourceDigest(message) {
    var data = JSON.stringify([message.id, message.role, message.content, message.speaker || null, message.audience || null]);
    var left = 2166136261, right = 3339675911;
    for (var i = 0; i < data.length; i++) {
      var code = data.charCodeAt(i);
      left = Math.imul(left ^ code, 16777619);
      right = Math.imul(right ^ code, 2246822519);
    }
    return (left >>> 0).toString(16).padStart(8, "0") + (right >>> 0).toString(16).padStart(8, "0");
  }
  function validEntry(entry) {
    return own(entry) && typeof entry.id === "string" && !!entry.id && entry.id.length <= 100 &&
      Object.prototype.hasOwnProperty.call(KINDS, entry.kind) &&
      typeof entry.text === "string" && !!entry.text.trim() && entry.text.length <= MAX_TEXT &&
      typeof entry.sourceMessageId === "string" && !!entry.sourceMessageId && entry.sourceMessageId.length <= 100 &&
      typeof entry.sourceDigest === "string" && /^[0-9a-f]{16}$/.test(entry.sourceDigest) &&
      Number.isFinite(entry.createdAt) && entry.createdAt >= 0 &&
      Number.isFinite(entry.updatedAt) && entry.updatedAt >= 0;
  }
  function validate(chat) {
    var rows = chat && chat.storyLedger;
    if (rows == null) return [];
    if (!Array.isArray(rows) || rows.length > MAX_ENTRIES) throw new Error("The saved story ledger is invalid.");
    var seen = new Set();
    rows.forEach(function (entry) {
      if (!validEntry(entry) || seen.has(entry.id)) throw new Error("The saved story ledger is invalid.");
      seen.add(entry.id);
    });
    return rows;
  }
  function path(chat, leafId) {
    var messages = Array.isArray(chat && chat.messages) ? chat.messages : [], byId = Object.create(null);
    messages.forEach(function (message) {
      if (!message || typeof message.id !== "string" || !message.id || Object.prototype.hasOwnProperty.call(byId, message.id)) throw new Error("The story has a broken message ancestry.");
      byId[message.id] = message;
    });
    var at = leafId === undefined ? chat && chat.leafId : leafId, seen = new Set(), result = [];
    while (at) {
      if (seen.has(at) || !Object.prototype.hasOwnProperty.call(byId, at)) throw new Error("The story has a broken message ancestry.");
      seen.add(at); result.push(byId[at]); at = byId[at].parentId || null;
    }
    return result.reverse();
  }
  function sourceAccessible(message, speakerKey) {
    var audience = message && message.audience;
    if (audience == null) return true;
    return Array.isArray(audience) && !!speakerKey && audience.indexOf(speakerKey) >= 0;
  }
  function review(chat, fullPath, speakerKey) {
    var rows = validate(chat), history = fullPath || path(chat), onPath = new Set(history.map(function (message) { return message.id; }));
    var byId = Object.create(null);
    (chat.messages || []).forEach(function (message) { if (message && message.id) byId[message.id] = message; });
    return rows.map(function (entry) {
      var source = byId[entry.sourceMessageId] || null;
      var status = !source ? "missing-source" : !onPath.has(entry.sourceMessageId) ? "other-branch" :
        source.pending || source.error ? "unfinished-source" : sourceDigest(source) !== entry.sourceDigest ? "source-changed" :
        !sourceAccessible(source, speakerKey) ? "hidden-from-speaker" : "active";
      return { entry: entry, source: source, status: status };
    });
  }
  function active(chat, fullPath, speakerKey) {
    return review(chat, fullPath, speakerKey).filter(function (item) { return item.status === "active"; });
  }
  function prompt(chat, fullPath, speakerKey) {
    var rows = active(chat, fullPath, speakerKey);
    return rows.map(function (item) { return "- " + KINDS[item.entry.kind] + ": " + item.entry.text.replace(/\s+/g, " ").trim(); }).join("\n");
  }
  function safeSource(chat, sourceMessageId) {
    var source = path(chat).find(function (message) { return message.id === sourceMessageId; });
    if (!source || source.pending || source.error || !source.content || !source.content.trim()) throw new Error("Choose a completed message on this branch as the source.");
    return source;
  }
  function save(chat, proposal, makeId, now) {
    if (!Array.isArray(chat && chat.participants) || chat.participants.length < 2) throw new Error("A story ledger needs a group chat.");
    var rows = validate(chat), source = safeSource(chat, proposal && proposal.sourceMessageId);
    var kind = proposal && proposal.kind, text = proposal && proposal.text;
    if (!Object.prototype.hasOwnProperty.call(KINDS, kind) || typeof text !== "string" || !text.trim() || text.trim().length > MAX_TEXT) throw new Error("Enter a fact, relationship or promise of 400 characters or less.");
    var existing = proposal.id && rows.find(function (entry) { return entry.id === proposal.id; });
    if (proposal.id && !existing && proposal.create !== true) throw new Error("That story ledger entry no longer exists.");
    if (!existing && rows.length >= MAX_ENTRIES) throw new Error("This story already has 24 ledger entries. Remove an old entry first.");
    var id = existing ? existing.id : proposal.id || makeId();
    if (typeof id !== "string" || !id || id.length > 100 || rows.some(function (entry) { return entry.id === id && entry !== existing; })) throw new Error("Could not create a unique story ledger entry.");
    var time = Number.isFinite(now) && now >= 0 ? now : Date.now();
    var entry = { id: id, kind: kind, text: text.trim(), sourceMessageId: source.id, sourceDigest: sourceDigest(source), createdAt: existing ? existing.createdAt : time, updatedAt: time };
    return Object.assign({}, chat, { storyLedger: existing ? rows.map(function (row) { return row.id === id ? entry : row; }) : rows.concat([entry]), updatedAt: time });
  }
  function remove(chat, id, now) {
    var rows = validate(chat), next = rows.filter(function (entry) { return entry.id !== id; });
    if (next.length === rows.length) throw new Error("That story ledger entry no longer exists.");
    return Object.assign({}, chat, { storyLedger: next, updatedAt: Number.isFinite(now) && now >= 0 ? now : Date.now() });
  }
  function fork(source, copy, idMap, makeId) {
    var rows = validate(source), sourceMessages = new Map((source.messages || []).map(function (message) { return [message.id, message]; }));
    var forkedMessages = new Map((copy.messages || []).map(function (message) { return [message.id, message]; }));
    var mapped = rows.filter(function (entry) {
      var oldMessage = sourceMessages.get(entry.sourceMessageId), newId = idMap[entry.sourceMessageId], newMessage = newId && forkedMessages.get(newId);
      return !!(oldMessage && sourceDigest(oldMessage) === entry.sourceDigest && newMessage);
    }).map(function (entry) {
      var newId = idMap[entry.sourceMessageId], newMessage = forkedMessages.get(newId);
      return Object.assign({}, entry, { id: makeId(), sourceMessageId: newId, sourceDigest: sourceDigest(newMessage) });
    });
    return Object.assign({}, copy, { storyLedger: mapped });
  }

  var api = { MAX_ENTRIES: MAX_ENTRIES, MAX_TEXT: MAX_TEXT, KINDS: KINDS, sourceDigest: sourceDigest, validate: validate, path: path,
    review: review, active: active, prompt: prompt, save: save, remove: remove, fork: fork };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.RolecraftChatStoryLedger = api;
})(typeof window !== "undefined" ? window : null);
