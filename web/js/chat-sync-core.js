(function (root) {
  "use strict";
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value).sort().filter(function (key) { return value[key] !== undefined; }).map(function (key) { return JSON.stringify(key) + ":" + canonical(value[key]); }).join(",") + "}";
    return JSON.stringify(value);
  }
  function payload(chat) { var copy = Object.assign({}, chat); delete copy._sync; return canonical(copy); }
  function meta(chat) { return chat && chat._sync || { rev: "", ancestors: [], deleted: false }; }
  function validateCast(c) {
    function validId(value, empty) { return typeof value === "string" && value.length <= 500 && (empty || value.length > 0); }
    function key(p) { return JSON.stringify([p.characterId, p.variantId || ""]); }
    function participant(p) { return p && validId(p.characterId, false) && (p.variantId == null || validId(p.variantId, true)); }
    function crop(value) { return value == null || value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(function (name) { return ["x","y","zoom"].indexOf(name) >= 0; }) && ["x","y","zoom"].every(function (name) { return typeof value[name] === "number" && Number.isFinite(value[name]) && value[name] >= (name === "zoom" ? 1 : 0) && value[name] <= (name === "zoom" ? 4 : 1); }); }
    function identity(p) {
      return p && validId(p.characterId, true) && (p.variantId == null || validId(p.variantId, true)) && typeof p.name === "string" && p.name.length <= 1000 && Object.keys(p).every(function (name) { return ["characterId","variantId","name","activeVariantName","profileImg","chatPortraitCrop","nsfwPicture"].indexOf(name) >= 0; }) && ["activeVariantName","profileImg"].every(function (name) { return p[name] == null || typeof p[name] === "string" && p[name].length <= 500 && !/^(?:data:|blob:|https?:)/i.test(p[name]); }) && crop(p.chatPortraitCrop) && (p.nsfwPicture == null || typeof p.nsfwPicture === "boolean");
    }
    function validParticipantKey(name) {
      if (typeof name !== "string" || name.length > 1100) return false;
      try { var parsed = JSON.parse(name); return Array.isArray(parsed) && parsed.length === 2 && validId(parsed[0], false) && validId(parsed[1], true); } catch (_) { return false; }
    }
    function validKnowledgeKey(name) {
      if (!validParticipantKey(name)) return false;
      try { return JSON.stringify(JSON.parse(name)) === name; } catch (_) { return false; }
    }
    function validKnowledgeAudience(value) {
      return Array.isArray(value) && value.length > 0 && value.length <= 8 &&
        new Set(value).size === value.length && value.every(validKnowledgeKey);
    }
    function validLaneMemories(lanes) {
      if (!lanes || typeof lanes !== "object" || Array.isArray(lanes) || Object.keys(lanes).length > 128) return false;
      var total = 0;
      return Object.keys(lanes).every(function (speaker) {
        var rows = lanes[speaker];
        if (!validKnowledgeKey(speaker) || !Array.isArray(rows) || rows.length > 2000) return false;
        total += rows.length;
        if (total > 20000) return false;
        return rows.every(function (entry) {
          return entry && typeof entry === "object" && !Array.isArray(entry) &&
            typeof entry.id === "string" && !!entry.id && entry.id.length <= 100 &&
            typeof entry.text === "string" && entry.text.length <= 100000 &&
            typeof entry.fromId === "string" && !!entry.fromId && entry.fromId.length <= 500 &&
            typeof entry.throughId === "string" && !!entry.throughId && entry.throughId.length <= 500 &&
            (entry.previousThroughId == null || typeof entry.previousThroughId === "string" && entry.previousThroughId.length <= 500) &&
            Array.isArray(entry.laneSourceIds) && entry.laneSourceIds.length > 0 && entry.laneSourceIds.length <= 8 &&
            new Set(entry.laneSourceIds).size === entry.laneSourceIds.length &&
            entry.laneSourceIds.every(function (id) { return typeof id === "string" && !!id && id.length <= 500; }) &&
            entry.fromId === entry.laneSourceIds[0] && entry.throughId === entry.laneSourceIds[entry.laneSourceIds.length - 1] &&
            typeof entry.laneSourceDigest === "string" && /^[0-9a-f]{16}$/.test(entry.laneSourceDigest);
        });
      });
    }
    function validStoryLedger(rows) {
      if (!Array.isArray(rows) || rows.length > 24) return false;
      var ids = new Set();
      return rows.every(function (entry) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
            typeof entry.id !== "string" || !entry.id || entry.id.length > 100 || ids.has(entry.id) ||
            ["fact","relationship","promise"].indexOf(entry.kind) < 0 ||
            typeof entry.text !== "string" || !entry.text.trim() || entry.text.length > 400 ||
            typeof entry.sourceMessageId !== "string" || !entry.sourceMessageId || entry.sourceMessageId.length > 100 ||
            typeof entry.sourceDigest !== "string" || !/^[0-9a-f]{16}$/.test(entry.sourceDigest) ||
            !Number.isSafeInteger(entry.createdAt) || entry.createdAt < 0 ||
            !Number.isSafeInteger(entry.updatedAt) || entry.updatedAt < 0 ||
            Object.keys(entry).some(function (name) { return ["id","kind","text","sourceMessageId","sourceDigest","createdAt","updatedAt"].indexOf(name) < 0; })) return false;
        ids.add(entry.id); return true;
      });
    }
    function validNotes(notes, limit, allowed) {
      return notes && typeof notes === "object" && !Array.isArray(notes) && Object.keys(notes).length <= limit && Object.keys(notes).every(function (name) {
        var note = notes[name];
        return validParticipantKey(name) && (!allowed || allowed.has(name)) && note && typeof note === "object" && !Array.isArray(note) && Object.keys(note).every(function (field) { return ["presence","knowledge","aiPresence","aiKnowledge"].indexOf(field) >= 0; }) &&
          (note.presence == null || ["unknown","present","observing","away"].indexOf(note.presence) >= 0) && (note.aiPresence == null || ["unknown","present","observing","away"].indexOf(note.aiPresence) >= 0) &&
          (note.knowledge == null || typeof note.knowledge === "string" && note.knowledge.length <= 600) && (note.aiKnowledge == null || typeof note.aiKnowledge === "string" && note.aiKnowledge.length <= 600);
      });
    }
    function validEvents(events) {
      if (!Array.isArray(events) || events.length > 24) return false;
      var eventIds = new Set();
      return events.every(function (event) {
        if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.id !== "string" || !event.id || event.id.length > 100 || eventIds.has(event.id) || typeof event.text !== "string" || !event.text.trim() || event.text.length > 600 || !Array.isArray(event.audience) || !event.audience.length || event.audience.length > 8 || new Set(event.audience).size !== event.audience.length || event.audience.some(function (name) { return !validParticipantKey(name); }) || event.createdAt != null && (!Number.isSafeInteger(event.createdAt) || event.createdAt < 0) || event.kind != null && ["witnessed","heard","told","private"].indexOf(event.kind) < 0 || event.sourceMessageId != null && (typeof event.sourceMessageId !== "string" || !event.sourceMessageId || event.sourceMessageId.length > 500) || Object.keys(event).some(function (name) { return ["id","text","audience","createdAt","kind","sourceMessageId"].indexOf(name) < 0; })) return false;
        eventIds.add(event.id); return true;
      });
    }
    function validAutomationProposal(proposal) {
      if (!proposal || typeof proposal !== "object" || Array.isArray(proposal) || !Object.keys(proposal).length || Object.keys(proposal).some(function (field) { return ["aiSceneLocation","aiSceneState","castScene","nextSpeakerKey"].indexOf(field) < 0; })) return false;
      if (Object.prototype.hasOwnProperty.call(proposal, "aiSceneLocation") && (typeof proposal.aiSceneLocation !== "string" || !proposal.aiSceneLocation.trim() || proposal.aiSceneLocation.length > 400)) return false;
      if (Object.prototype.hasOwnProperty.call(proposal, "aiSceneState") && (typeof proposal.aiSceneState !== "string" || !proposal.aiSceneState.trim() || proposal.aiSceneState.length > 1200)) return false;
      if (Object.prototype.hasOwnProperty.call(proposal, "nextSpeakerKey") && !validParticipantKey(proposal.nextSpeakerKey)) return false;
      if (Object.prototype.hasOwnProperty.call(proposal, "castScene")) {
        if (!proposal.castScene || typeof proposal.castScene !== "object" || Array.isArray(proposal.castScene) || Object.keys(proposal.castScene).length > 8) return false;
        if (Object.keys(proposal.castScene).some(function (name) {
          var note = proposal.castScene[name];
          return !validParticipantKey(name) || !note || typeof note !== "object" || Array.isArray(note) || !Object.keys(note).length || Object.keys(note).some(function (field) { return ["aiPresence","aiKnowledge"].indexOf(field) < 0; }) ||
            note.aiPresence != null && ["present","observing","away"].indexOf(note.aiPresence) < 0 || note.aiKnowledge != null && (typeof note.aiKnowledge !== "string" || !note.aiKnowledge.trim() || note.aiKnowledge.length > 600);
        })) return false;
      }
      return !!(proposal.aiSceneLocation || proposal.aiSceneState || proposal.nextSpeakerKey || proposal.castScene && Object.keys(proposal.castScene).length);
    }
    function validAutomationCapture(snapshot) {
      return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && Object.keys(snapshot).every(function (field) { return ["leafId","sceneLocation","sceneState","aiSceneLocation","aiSceneState","castScene","activeSpeakerKey"].indexOf(field) >= 0; }) &&
        typeof snapshot.leafId === "string" && snapshot.leafId.length <= 500 && typeof snapshot.sceneLocation === "string" && snapshot.sceneLocation.length <= 400 && typeof snapshot.sceneState === "string" && snapshot.sceneState.length <= 1200 &&
        typeof snapshot.aiSceneLocation === "string" && snapshot.aiSceneLocation.length <= 400 && typeof snapshot.aiSceneState === "string" && snapshot.aiSceneState.length <= 1200 && validNotes(snapshot.castScene, 8) &&
        (snapshot.activeSpeakerKey === "" || validParticipantKey(snapshot.activeSpeakerKey));
    }
    function validAutomationReview(review) {
      return review && typeof review === "object" && !Array.isArray(review) && Object.keys(review).every(function (field) { return ["messageId","leafId","createdAt","proposal","expected","applied"].indexOf(field) >= 0; }) &&
        typeof review.messageId === "string" && !!review.messageId && review.messageId.length <= 500 && review.leafId === review.messageId && Number.isSafeInteger(review.createdAt) && review.createdAt >= 0 && typeof review.applied === "boolean" && validAutomationProposal(review.proposal) && validAutomationCapture(review.expected) && review.expected.leafId === review.leafId;
    }
    function validAutomationUndo(token) {
      return token && typeof token === "object" && !Array.isArray(token) && Object.keys(token).every(function (field) { return ["messageId","leafId","before","after"].indexOf(field) >= 0; }) &&
        typeof token.messageId === "string" && !!token.messageId && token.messageId.length <= 500 && token.leafId === token.messageId && validAutomationCapture(token.before) && validAutomationCapture(token.after) && token.before.leafId === token.leafId && token.after.leafId === token.leafId;
    }
    if (c.sceneState != null && (typeof c.sceneState !== "string" || c.sceneState.length > 1200)) throw new Error("Invalid group scene state");
    if (c.aiSceneLocation != null && (typeof c.aiSceneLocation !== "string" || c.aiSceneLocation.length > 400)) throw new Error("Invalid AI group scene location");
    if (c.aiSceneState != null && (typeof c.aiSceneState !== "string" || c.aiSceneState.length > 1200)) throw new Error("Invalid AI group scene state");
    if (c.groupLoreScope != null && ["shared","speaker"].indexOf(c.groupLoreScope) < 0) throw new Error("Invalid group lorebook scope");
    if (c.originalSpeaker != null && !identity(c.originalSpeaker)) throw new Error("Invalid original conversation speaker");
    c.messages.forEach(function (m) { if (m.speaker != null && (m.role !== "assistant" || !identity(m.speaker))) throw new Error("Invalid conversation speaker"); });
    if (c.participants == null) {
      if (c.castScene != null || c.dormantCastScene != null || c.sceneEvents != null || c.sceneVersions != null || c.groupAutomationMode != null || c.groupAutomationCadence != null || c.groupCoordinatorModel != null || c.groupAutomationReview != null || c.groupAutomationUndo != null || c.aiSceneLocation != null || c.aiSceneState != null || c.autoPairReplies != null || c.groupSpendLimitUsd != null || c.knowledgeLanes != null || c.knowledgeLaneMemories != null || c.storyLedger != null || c.messages.some(function (m) { return m.audience != null; })) throw new Error("Invalid group scene data");
      return;
    }
    if (!Array.isArray(c.participants) || !c.participants.length || c.participants.length > 8 || c.participants.some(function (p) { return !participant(p) || Object.keys(p).some(function (name) { return ["characterId","variantId"].indexOf(name) < 0; }); })) throw new Error("Invalid conversation participants (1 to 8 required)");
    var keys = new Set(c.participants.map(key));
    if (keys.size !== c.participants.length || !keys.has(c.activeSpeakerKey)) throw new Error("Invalid or duplicate active conversation speaker");
    if (c.knowledgeLanes != null && typeof c.knowledgeLanes !== "boolean") throw new Error("Invalid character knowledge lanes");
    if (c.messages.some(function (m) { return m.audience != null && !validKnowledgeAudience(m.audience); })) throw new Error("Invalid message knowledge audience");
    if (c.knowledgeLaneMemories != null && !validLaneMemories(c.knowledgeLaneMemories)) throw new Error("Invalid character knowledge memories");
    if (c.knowledgeLanes !== true && (c.messages.some(function (m) { return m.audience != null; }) || c.knowledgeLaneMemories && Object.keys(c.knowledgeLaneMemories).some(function (name) { return c.knowledgeLaneMemories[name].length; }))) throw new Error("Private character knowledge cannot be made shared");
    if (c.storyLedger != null && !validStoryLedger(c.storyLedger)) throw new Error("Invalid story ledger");
    if (c.castScene != null && !validNotes(c.castScene, 8, keys)) throw new Error("Invalid group cast scene");
    if (c.groupAutomationMode != null && ["off","suggest","auto"].indexOf(c.groupAutomationMode) < 0) throw new Error("Invalid AI group automation mode");
    if (c.autoPairReplies != null && typeof c.autoPairReplies !== "boolean") throw new Error("Invalid automatic group reply choice");
    if (c.groupSpendLimitUsd != null && [0,.25,.5,1,2,5,10,25].indexOf(c.groupSpendLimitUsd) < 0) throw new Error("Invalid group spending warning");
    if (c.groupAutomationCadence != null && ["balanced","events","every"].indexOf(c.groupAutomationCadence) < 0) throw new Error("Invalid AI group automation cadence");
    if (c.groupCoordinatorModel != null && (typeof c.groupCoordinatorModel !== "string" || c.groupCoordinatorModel.length > 200 || c.groupCoordinatorModel && !/^~?[A-Za-z0-9._:/-]+$/.test(c.groupCoordinatorModel))) throw new Error("Invalid AI group coordinator model");
    if (c.groupAutomationReview != null && !validAutomationReview(c.groupAutomationReview)) throw new Error("Invalid AI group review");
    if (c.groupAutomationUndo != null && !validAutomationUndo(c.groupAutomationUndo)) throw new Error("Invalid AI group undo");
    if (c.dormantCastScene != null && (!validNotes(c.dormantCastScene, 128) || Object.keys(c.dormantCastScene).some(function (name) { return keys.has(name); }))) throw new Error("Invalid dormant cast scene");
    if (c.sceneEvents != null && !validEvents(c.sceneEvents)) throw new Error("Invalid private scene event");
    if (c.sceneVersions != null) {
      if (!c.sceneVersions || typeof c.sceneVersions !== "object" || Array.isArray(c.sceneVersions) || Object.keys(c.sceneVersions).length > 2000 || !Object.prototype.hasOwnProperty.call(c.sceneVersions, "$root")) throw new Error("Invalid scene checkpoints");
      var messageIds = new Set(c.messages.map(function (m) { return m.id; }));
      Object.keys(c.sceneVersions).forEach(function (anchor) {
        var scene = c.sceneVersions[anchor];
        if (anchor !== "$root" && !messageIds.has(anchor) || !scene || typeof scene !== "object" || Array.isArray(scene) || Object.keys(scene).some(function (name) { return ["sceneLocation","sceneState","aiSceneLocation","aiSceneState","castScene","dormantCastScene","sceneEvents","activeSpeakerKey"].indexOf(name) < 0; }) || typeof scene.sceneLocation !== "string" || scene.sceneLocation.length > 400 || typeof scene.sceneState !== "string" || scene.sceneState.length > 1200 || scene.aiSceneLocation != null && (typeof scene.aiSceneLocation !== "string" || scene.aiSceneLocation.length > 400) || scene.aiSceneState != null && (typeof scene.aiSceneState !== "string" || scene.aiSceneState.length > 1200) || !validNotes(scene.castScene, 128) || !validNotes(scene.dormantCastScene, 128) || !validEvents(scene.sceneEvents) || scene.activeSpeakerKey !== "" && !validParticipantKey(scene.activeSpeakerKey)) throw new Error("Invalid scene checkpoint");
      });
    }
    var saved = c.castSnapshot;
    if (saved && saved.character && !keys.has(key({ characterId: c.characterId, variantId: c.variantId }))) throw new Error("Inactive character profile in conversation snapshot");
    if (saved && saved.participants != null && (!Array.isArray(saved.participants) || saved.participants.length > 8 || new Set(saved.participants.map(key)).size !== saved.participants.length || saved.participants.some(function (p) { return !participant(p) || !keys.has(key(p)) || p.character && p.character.id !== p.characterId; }))) throw new Error("Invalid conversation cast snapshot");
  }
  function validate(rows) {
    if (!Array.isArray(rows) || rows.length > 20000) throw new Error("Invalid conversation sync data");
    var ids = new Set();
    rows.forEach(function (c) {
      if (!c || typeof c.id !== "string" || !c.id || ids.has(c.id) || !Array.isArray(c.messages)) throw new Error("Invalid or duplicate conversation");
      ids.add(c.id);
      var messages = new Set();
      c.messages.forEach(function (m) { if (!m || typeof m.id !== "string" || messages.has(m.id) || typeof m.content !== "string" || ["user", "assistant"].indexOf(m.role) < 0) throw new Error("Invalid conversation message"); messages.add(m.id); });
      if (c.memoryModel != null && (typeof c.memoryModel !== "string" || c.memoryModel.length > 200 || c.memoryModel && !/^~?[A-Za-z0-9._:/-]+$/.test(c.memoryModel))) throw new Error("Invalid memory summarizer model");
      if ([c.memoryModelContext, c.memoryModelReplyLimit].some(function (value) { return value != null && (!Number.isSafeInteger(value) || value < 0 || value > 2000000); })) throw new Error("Invalid memory model limits");
      validateCast(c);
      if (c.memories != null && (!Array.isArray(c.memories) || c.memories.some(function (m) { return !m || typeof m.text !== "string" || typeof m.throughId !== "string"; }))) throw new Error("Invalid story memories");
      if (c._sync && (typeof c._sync.rev !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(c._sync.rev) || !Array.isArray(c._sync.ancestors) || c._sync.ancestors.some(function (id) { return typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id); }) || typeof c._sync.deleted !== "boolean")) throw new Error("Invalid conversation revision");
    });
    return rows;
  }
  function lineage(c) { var m = meta(c); return m.ancestors.concat(m.rev || []).filter(Boolean); }
  function conflictOriginId(chat) {
    if (!chat || typeof chat.id !== "string") return "";
    var source = typeof chat.conflictOf === "string" && chat.conflictOf && chat.conflictOf !== chat.id ? chat.conflictOf : chat.id;
    var previous, match;
    do {
      previous = source;
      match = /^(.+)(?:~conflict-[A-Za-z0-9-]{1,100}|-conflict-[0-9a-f]{24})$/.exec(source);
      if (match) source = match[1];
    } while (source !== previous);
    return source !== chat.id ? source : "";
  }
  function stamp(next, previous, uid) {
    var prior = new Map(previous.map(function (c) { return [c.id, c]; })), result = next.map(function (c) {
      var old = prior.get(c.id); prior.delete(c.id);
      // An untouched conversation keeps the same object between saves, so its
      // payload cannot differ; skip canonicalizing its whole transcript again.
      if (old && old === c && meta(old).rev) return Object.assign({}, c, { _sync: old._sync });
      if (old && payload(old) === payload(c) && meta(old).deleted === meta(c).deleted && meta(old).rev) return Object.assign({}, c, { _sync: old._sync });
      return Object.assign({}, c, { _sync: { rev: uid(), ancestors: Array.from(new Set(lineage(old).concat(lineage(c)))).sort(), deleted: !!meta(c).deleted } });
    });
    prior.forEach(function (c) { result.push(meta(c).deleted ? c : Object.assign({}, c, { _sync: { rev: uid(), ancestors: lineage(c), deleted: true } })); });
    return validate(result);
  }
  function merge(left, right) {
    validate(left); validate(right);
    var result = new Map(left.map(function (c) { return [c.id, c]; })), conflicts = 0;
    right.forEach(function (incoming) {
      var local = result.get(incoming.id);
      if (!local) { result.set(incoming.id, incoming); return; }
      var a = meta(local), b = meta(incoming);
      if (!a.rev || !b.rev) throw new Error("Sync revisions are missing. Save the chats locally before linking.");
      if (payload(local) === payload(incoming) && a.deleted === b.deleted) {
        var chosen = a.rev > b.rev ? local : incoming;
        result.set(local.id, Object.assign({}, chosen, { _sync: { rev: meta(chosen).rev, ancestors: Array.from(new Set(lineage(local).concat(lineage(incoming)))).filter(function (id) { return id !== meta(chosen).rev; }).sort(), deleted: a.deleted } }));
      } else if (b.ancestors.indexOf(a.rev) >= 0 && a.ancestors.indexOf(b.rev) < 0) result.set(local.id, incoming);
      else if (a.ancestors.indexOf(b.rev) < 0 || a.rev === b.rev) {
        if (a.rev === b.rev) throw new Error("A sync revision contains conflicting data. Neither copy was replaced.");
        var winner = a.deleted !== b.deleted ? (a.deleted ? incoming : local) : (a.rev > b.rev ? local : incoming);
        var other = winner === local ? incoming : local;
        var sourceId = conflictOriginId(local) || local.id;
        var copyId = sourceId + "~conflict-" + meta(other).rev;
        var copyTitle = String(other.title || "Story").replace(/(?: \((?:sync conflict|conflict copy)\))+$/, "") + " (conflict copy)";
        var copy = Object.assign({}, other, { id: copyId, title: copyTitle, conflictOf: sourceId });
        if (!result.has(copyId)) { result.set(copyId, copy); conflicts++; }
        result.set(local.id, winner);
      }
    });
    return { chats: Array.from(result.values()).sort(function (a, b) { return a.id.localeCompare(b.id); }), conflicts: conflicts };
  }
  // Called only after a durable sync reload. Describe what arrived without
  // rewriting a conversation, reading its prose into the UI notice, or
  // treating a switched branch as a continuation of the old leaf.
  function handoffChanges(beforeRows, afterRows, activeChatId) {
    if (!Array.isArray(beforeRows) || !Array.isArray(afterRows)) throw new Error("Invalid conversation handoff data");
    var before = new Map(beforeRows.map(function (chat) { return [chat.id, chat]; }));
    var after = new Map(afterRows.map(function (chat) { return [chat.id, chat]; }));
    function leaf(chat) { return chat && (chat.leafId || chat.messages.length && chat.messages[chat.messages.length - 1].id) || ""; }
    function path(chat, byId) {
      var result = [], seen = new Set(), id = leaf(chat);
      while (id && byId.has(id) && !seen.has(id)) {
        seen.add(id);
        var message = byId.get(id); result.push(message); id = message.parentId || "";
      }
      return result.reverse();
    }
    function classify(oldChat, chat) {
      if (!chat && oldChat && !meta(oldChat).deleted) return { id: oldChat.id, kind: "deleted", addedTurns: 0, previousLeafId: leaf(oldChat), leafId: "" };
      if (!chat || meta(chat).deleted && (!oldChat || meta(oldChat).deleted)) return null;
      if (!oldChat) return { id: chat.id, kind: conflictOriginId(chat) ? "conflict-copy" : "new", addedTurns: 0, previousLeafId: "", leafId: leaf(chat) };
      if (meta(chat).deleted) return { id: chat.id, kind: "deleted", addedTurns: 0, previousLeafId: leaf(oldChat), leafId: "" };
      if (meta(oldChat).deleted && !meta(chat).deleted) return { id: chat.id, kind: "updated", addedTurns: 0, previousLeafId: leaf(oldChat), leafId: leaf(chat) };
      if (oldChat === chat) return null;
      if (payload(oldChat) === payload(chat)) return null;
      var previousLeafId = leaf(oldChat), leafId = leaf(chat);
      var oldById = new Map(oldChat.messages.map(function (message) { return [message.id, message]; }));
      var newById = new Map(chat.messages.map(function (message) { return [message.id, message]; }));
      var oldPath = path(oldChat, oldById), newPath = path(chat, newById);
      var oldIndex = newPath.findIndex(function (message) { return message.id === previousLeafId; });
      var suffix = oldIndex < 0 ? [] : newPath.slice(oldIndex + 1);
      var immutable = oldPath.every(function (message) { return newById.has(message.id) && canonical(message) === canonical(newById.get(message.id)); });
      var addedTurns = newPath.filter(function (message) { return !oldById.has(message.id); }).length;
      var kind = "updated";
      if (leafId !== previousLeafId) kind = oldIndex >= 0 && immutable && suffix.length && suffix.every(function (message) { return !oldById.has(message.id); }) ? "advanced" : "branch-changed";
      else if (chat.messages.some(function (message) { return !oldById.has(message.id); })) kind = "branch-added";
      return { id: chat.id, kind: kind, addedTurns: addedTurns, previousLeafId: previousLeafId, leafId: leafId };
    }
    var active = activeChatId ? classify(before.get(activeChatId), after.get(activeChatId)) : null;
    var changes = [], more = 0;
    if (active) changes.push(active);
    afterRows.forEach(function (chat) {
      if (chat.id === activeChatId) return;
      var change = classify(before.get(chat.id), chat);
      if (!change) return;
      if (changes.length < 8) changes.push(change); else more++;
    });
    return { active: active, changes: changes, more: more };
  }
  var api = { canonical: canonical, payload: payload, stamp: stamp, merge: merge, validate: validate, validateCast: validateCast, handoffChanges: handoffChanges, conflictOriginId: conflictOriginId };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RolecraftChatSync = api;
})(typeof window === "object" ? window : globalThis);
