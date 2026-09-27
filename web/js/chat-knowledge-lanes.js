(function (root) {
  "use strict";

  // The saved transcript remains one immutable tree. An audience controls which
  // of its turns a selected character receives; it does not change ancestry.
  function enabled(chat) { return !!(chat && chat.knowledgeLanes === true && Array.isArray(chat.participants)); }
  function participantKey(participant) { return JSON.stringify([participant.characterId, participant.variantId || ""]); }
  function castKeys(chat) { return new Set((chat.participants || []).map(participantKey)); }
  function requireSpeaker(chat, key) {
    if (!castKeys(chat).has(key)) throw new Error("Select a current group character before using knowledge lanes.");
    return key;
  }
  function validKey(key) {
    if (typeof key !== "string") return false;
    try {
      var identity = JSON.parse(key);
      return Array.isArray(identity) && identity.length === 2 && typeof identity[0] === "string" && !!identity[0] &&
        typeof identity[1] === "string" && JSON.stringify(identity) === key;
    } catch (_) { return false; }
  }
  function audienceOf(chat, message) {
    if (!enabled(chat)) return null;
    var audience = message && message.audience;
    if (audience == null) return null; // Old and explicitly shared turns.
    if (!Array.isArray(audience) || !audience.length || audience.length > 8) throw new Error("This turn has an invalid knowledge audience.");
    var seen = new Set();
    audience.forEach(function (key) {
      // A removed character can still be named on an earlier turn. Its old
      // audience stays valid and hidden from everyone currently in the cast.
      if (!validKey(key) || seen.has(key)) throw new Error("This turn has an invalid knowledge audience.");
      seen.add(key);
    });
    return audience;
  }
  function visibleTo(chat, message, speakerKey) {
    if (!enabled(chat)) return true;
    requireSpeaker(chat, speakerKey);
    var audience = audienceOf(chat, message);
    return !audience || audience.indexOf(speakerKey) >= 0;
  }
  function withAudience(chat, message, audience) {
    if (!message || typeof message !== "object") throw new Error("Choose a saved turn before setting its audience.");
    if (audience != null && !enabled(chat)) throw new Error("Knowledge lanes must be enabled for this group first.");
    var copy = Object.assign({}, message);
    if (audience == null) delete copy.audience;
    else {
      if (!Array.isArray(audience) || audience.some(function (key) { return !castKeys(chat).has(key); })) throw new Error("Choose current group characters for this audience.");
      copy.audience = audience.slice();
      audienceOf(chat, copy);
    }
    return copy;
  }

  // A strict path is required for compaction. A damaged parent link must not
  // make an apparently complete but actually truncated lane summary.
  function activePath(chat, leafId) {
    var rows = Array.isArray(chat && chat.messages) ? chat.messages : [], byId = Object.create(null);
    rows.forEach(function (message) {
      if (!message || typeof message.id !== "string" || !message.id || Object.prototype.hasOwnProperty.call(byId, message.id)) throw new Error("This story has duplicate or invalid message IDs.");
      byId[message.id] = message;
    });
    var leaf = leafId === undefined ? chat && chat.leafId : leafId;
    if (!leaf) {
      if (rows.length) throw new Error("This story has no selected branch to compact.");
      return [];
    }
    var path = [], seen = new Set(), at = leaf;
    while (at) {
      if (seen.has(at) || !Object.prototype.hasOwnProperty.call(byId, at)) throw new Error("This story has a broken message ancestry.");
      seen.add(at); path.push(byId[at]); at = byId[at].parentId || null;
    }
    return path.reverse();
  }
  function visibleHistory(chat, speakerKey, fullPath) {
    var history = fullPath || activePath(chat);
    if (!enabled(chat)) return history.slice();
    requireSpeaker(chat, speakerKey);
    return history.filter(function (message) { return visibleTo(chat, message, speakerKey); });
  }

  // A lightweight source proof makes a checkpoint unusable after an audience,
  // message or speaker edit. This protects against a once-visible turn later
  // becoming hidden while its earlier summary still exists.
  function sourceDigest(messages) {
    var data = JSON.stringify(messages.map(function (message) {
      return [message.id, message.role, message.content, message.speaker || null, message.audience || null];
    }));
    var left = 2166136261, right = 3339675911;
    for (var i = 0; i < data.length; i++) {
      var code = data.charCodeAt(i);
      left = Math.imul(left ^ code, 16777619);
      right = Math.imul(right ^ code, 2246822519);
    }
    return (left >>> 0).toString(16).padStart(8, "0") + (right >>> 0).toString(16).padStart(8, "0");
  }
  function checkpointSource(entry, history) {
    if (!entry || typeof entry.fromId !== "string" || typeof entry.throughId !== "string") return null;
    var start = history.findIndex(function (m) { return m.id === entry.fromId; });
    var end = history.findIndex(function (m) { return m.id === entry.throughId; });
    return start >= 0 && end >= start ? history.slice(start, end + 1) : null;
  }
  function proofMatches(entry, history) {
    var source = checkpointSource(entry, history);
    return !!(source && Array.isArray(entry.laneSourceIds) && entry.laneSourceIds.length === source.length &&
      entry.laneSourceIds.every(function (id, i) { return id === source[i].id; }) &&
      typeof entry.laneSourceDigest === "string" && entry.laneSourceDigest === sourceDigest(source));
  }
  function stampCheckpoint(entry, history) {
    var source = checkpointSource(entry, history);
    if (!source || !source.length || source.length > 8) throw new Error("The lane memory span is no longer available; rebuild it from the visible transcript.");
    return Object.assign({}, entry, {
      laneSourceIds: source.map(function (message) { return message.id; }),
      laneSourceDigest: sourceDigest(source)
    });
  }
  function laneRows(chat, speakerKey, history) {
    var saved = chat && chat.knowledgeLaneMemories;
    var rows = saved && typeof saved === "object" && !Array.isArray(saved) && Array.isArray(saved[speakerKey]) ? saved[speakerKey] : [];
    return rows.filter(function (entry) { return proofMatches(entry, history); });
  }
  function contextFor(chat, speakerKey, fullPath) {
    var history = visibleHistory(chat, speakerKey, fullPath);
    if (!enabled(chat)) return { history: history, memoryChat: chat, enabled: false };
    // Deliberately never consult chat.memories in lane mode. A legacy shared
    // summary may already contain text from a turn newly made private.
    return { history: history, memoryChat: Object.assign({}, chat, { memories: laneRows(chat, speakerKey, history) }), enabled: true };
  }
  function commitMemoryView(chat, speakerKey, updatedView, fullPath) {
    if (!enabled(chat)) return updatedView;
    var history = visibleHistory(chat, speakerKey, fullPath), prior = chat.knowledgeLaneMemories || {};
    var oldRows = Array.isArray(prior[speakerKey]) ? prior[speakerKey] : [];
    if (!updatedView || !Array.isArray(updatedView.memories)) throw new Error("The lane memory update is incomplete.");
    var rows = updatedView.memories.map(function (entry) {
      var old = oldRows.find(function (row) { return row && row.throughId === entry.throughId; });
      if (old && old.id === entry.id) {
        if (!proofMatches(old, history)) throw new Error("A saved lane memory no longer matches its visible source.");
        return Object.assign({}, entry, { laneSourceIds: old.laneSourceIds.slice(), laneSourceDigest: old.laneSourceDigest });
      }
      // A newly generated replacement is stamped against the current visible
      // source. The caller must only commit after the provider result is saved.
      return stampCheckpoint(entry, history);
    });
    var lanes = Object.assign(Object.create(null), prior); lanes[speakerKey] = rows;
    return Object.assign({}, chat, { knowledgeLaneMemories: lanes, updatedAt: updatedView.updatedAt || Date.now() });
  }
  function forkLaneMemories(source, fork, idMap, makeId) {
    if (!enabled(source)) return fork;
    var lanes = Object.create(null), saved = source.knowledgeLaneMemories || {};
    Object.keys(saved).forEach(function (key) {
      if (!castKeys(fork).has(key)) return;
      var sourceHistory = visibleHistory(source, key);
      var rows = Array.isArray(saved[key]) ? saved[key] : [];
      lanes[key] = rows.filter(function (entry) {
        return proofMatches(entry, sourceHistory) && idMap[entry.throughId] && idMap[entry.fromId] &&
          (!entry.previousThroughId || idMap[entry.previousThroughId]) && entry.laneSourceIds.every(function (id) { return idMap[id]; });
      }).map(function (entry) {
        var copy = Object.assign({}, entry, { id: makeId(), throughId: idMap[entry.throughId], fromId: idMap[entry.fromId], previousThroughId: entry.previousThroughId ? idMap[entry.previousThroughId] : null });
        return stampCheckpoint(copy, visibleHistory(fork, key));
      });
    });
    return Object.assign({}, fork, { knowledgeLaneMemories: lanes });
  }

  var api = { enabled: enabled, participantKey: participantKey, audienceOf: audienceOf, visibleTo: visibleTo, withAudience: withAudience,
    activePath: activePath, visibleHistory: visibleHistory, contextFor: contextFor, proofMatches: proofMatches,
    stampCheckpoint: stampCheckpoint, commitMemoryView: commitMemoryView, forkLaneMemories: forkLaneMemories };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.RolecraftChatKnowledgeLanes = api;
})(typeof window !== "undefined" ? window : null);
