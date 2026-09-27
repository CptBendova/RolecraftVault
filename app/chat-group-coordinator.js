(function (root) {
  "use strict";

  function own(value) { return value && typeof value === "object" && !Array.isArray(value); }
  function participantKey(participant) { return JSON.stringify([participant.characterId, participant.variantId || ""]); }
  function keysOf(chat) { return new Set((Array.isArray(chat && chat.participants) ? chat.participants : []).map(participantKey)); }
  function copyNotes(notes, preserveUnknown) {
    var copy = Object.create(null);
    if (!own(notes)) return copy;
    Object.keys(notes).forEach(function (key) {
      var note = notes[key];
      if (!own(note)) return;
      copy[key] = Object.assign(preserveUnknown ? Object.assign({}, note) : {}, {
        presence: note.presence || "unknown",
        knowledge: typeof note.knowledge === "string" ? note.knowledge : "",
        aiPresence: note.aiPresence || "unknown",
        aiKnowledge: typeof note.aiKnowledge === "string" ? note.aiKnowledge : ""
      });
    });
    return copy;
  }
  function capture(chat) {
    return {
      leafId: chat && chat.leafId || "",
      sceneLocation: chat && typeof chat.sceneLocation === "string" ? chat.sceneLocation : "",
      sceneState: chat && typeof chat.sceneState === "string" ? chat.sceneState : "",
      aiSceneLocation: chat && typeof chat.aiSceneLocation === "string" ? chat.aiSceneLocation : "",
      aiSceneState: chat && typeof chat.aiSceneState === "string" ? chat.aiSceneState : "",
      castScene: copyNotes(chat && chat.castScene),
      activeSpeakerKey: chat && chat.activeSpeakerKey || ""
    };
  }
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (own(value)) return "{" + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ":" + canonical(value[key]); }).join(",") + "}";
    return JSON.stringify(value);
  }
  function sameCapture(left, right) { return own(right) && canonical(left) === canonical(right); }
  function boundedText(value, limit, field) {
    if (typeof value !== "string" || value.length > limit) throw new Error("Invalid AI group " + field);
    return value.trim();
  }
  function sanitizeProposal(result, chat) {
    if (!Array.isArray(chat && chat.participants) || chat.participants.length < 2) throw new Error("AI group automation requires a group chat");
    var raw = result && result.update || result;
    if (!own(raw)) throw new Error("Invalid AI group update");
    var castKeys = keysOf(chat), proposal = {};
    var location = raw.location === undefined ? (raw.aiSceneLocation === undefined ? raw.sceneLocation : raw.aiSceneLocation) : raw.location;
    var scene = raw.scene === undefined ? (raw.aiSceneState === undefined ? raw.sceneState : raw.aiSceneState) : raw.scene;
    if (location !== undefined && location !== null) {
      location = boundedText(location, 400, "location");
      if (location) proposal.aiSceneLocation = location;
    }
    if (scene !== undefined && scene !== null) {
      scene = boundedText(scene, 1200, "scene");
      if (scene) proposal.aiSceneState = scene;
    }
    var cast = raw.cast === undefined ? raw.castScene : raw.cast;
    if (cast !== undefined && cast !== null) {
      if (own(cast)) cast = Object.keys(cast).map(function (key) { return Object.assign({}, cast[key], { key: key }); });
      if (!Array.isArray(cast) || cast.length > 8) throw new Error("Invalid AI group cast update");
      var notes = Object.create(null), seen = new Set();
      cast.forEach(function (entry) {
        if (!own(entry) || typeof entry.key !== "string" || !castKeys.has(entry.key) || seen.has(entry.key)) throw new Error("AI group update named a character outside this chat");
        seen.add(entry.key);
        var note = {};
        var presence = entry.aiPresence === undefined ? entry.presence : entry.aiPresence;
        if (presence !== undefined && presence !== null) {
          if (["unknown", "present", "observing", "away"].indexOf(presence) < 0) throw new Error("Invalid AI group presence");
          if (presence !== "unknown") note.aiPresence = presence;
        }
        var inferred = entry.aiKnowledge === undefined ? entry.knowledge : entry.aiKnowledge;
        if (inferred !== undefined && inferred !== null) {
          var knowledge = boundedText(inferred, 600, "knowledge");
          if (knowledge) note.aiKnowledge = knowledge;
        }
        if (Object.keys(note).length) notes[entry.key] = note;
      });
      if (Object.keys(notes).length) proposal.castScene = notes;
    }
    var next = raw.nextSpeakerKey;
    if (next !== undefined && next !== null && next !== "") {
      if (typeof next !== "string" || !castKeys.has(next)) throw new Error("AI group update named an unavailable next speaker");
      proposal.nextSpeakerKey = next;
    }
    if (!Object.keys(proposal).length) throw new Error("AI group update had no usable changes");
    return proposal;
  }
  function assertCurrent(chat, messageId, expected) {
    if (!chat || chat.leafId !== messageId || !Array.isArray(chat.messages) || !chat.messages.some(function (message) { return message && message.id === messageId && message.role === "assistant"; })) throw new Error("The scene has moved since AI group analysis started");
    if (!sameCapture(capture(chat), expected)) throw new Error("The scene was edited since AI group analysis started");
  }
  function makeReview(messageId, proposal, expected, applied, now) {
    return { messageId: messageId, leafId: messageId, createdAt: now == null ? Date.now() : now, proposal: proposal, expected: capture(expected), applied: !!applied };
  }
  function stageProposal(chat, proposal, messageId, expected, now) {
    assertCurrent(chat, messageId, expected);
    proposal = sanitizeProposal(proposal, chat);
    return Object.assign({}, chat, { groupAutomationReview: makeReview(messageId, proposal, expected, false, now), updatedAt: Date.now() });
  }
  function applyProposal(chat, proposal, messageId, patchScene, expected, now) {
    if (typeof patchScene !== "function") throw new Error("Scene checkpoint writer is unavailable");
    assertCurrent(chat, messageId, expected);
    proposal = sanitizeProposal(proposal, chat);
    var before = capture(chat), patch = {}, castKeys = keysOf(chat);
    if (proposal.aiSceneLocation !== undefined) patch.aiSceneLocation = proposal.aiSceneLocation;
    if (proposal.aiSceneState !== undefined) patch.aiSceneState = proposal.aiSceneState;
    if (proposal.castScene) {
      var notes = copyNotes(chat.castScene, true);
      Object.keys(proposal.castScene).forEach(function (key) {
        if (!castKeys.has(key)) throw new Error("AI group update named a character outside this chat");
        notes[key] = Object.assign({}, notes[key] || {}, proposal.castScene[key]);
      });
      patch.castScene = notes;
    }
    if (proposal.nextSpeakerKey) patch.activeSpeakerKey = proposal.nextSpeakerKey;
    var updated = patchScene(chat, patch), after = capture(updated);
    return Object.assign({}, updated, {
      groupAutomationReview: makeReview(messageId, proposal, expected, true, now),
      groupAutomationUndo: { messageId: messageId, leafId: messageId, before: before, after: after }
    });
  }
  function undoProposal(chat, patchScene) {
    if (typeof patchScene !== "function") throw new Error("Scene checkpoint writer is unavailable");
    var token = chat && chat.groupAutomationUndo;
    if (!own(token) || chat.leafId !== token.leafId || !sameCapture(capture(chat), token.after)) throw new Error("The scene changed after AI applied its update; review it before undoing");
    var before = token.before, notes = copyNotes(chat.castScene, true);
    Object.keys(token.after.castScene).forEach(function (key) {
      var previous = before.castScene[key], current = notes[key];
      if (!current) return;
      if (previous) {
        current.aiPresence = previous.aiPresence || "unknown";
        current.aiKnowledge = previous.aiKnowledge || "";
      } else {
        delete current.aiPresence;
        delete current.aiKnowledge;
        if (!Object.keys(current).some(function (field) { return current[field] !== "" && current[field] !== "unknown"; })) delete notes[key];
      }
    });
    var updated = patchScene(chat, { aiSceneLocation: before.aiSceneLocation, aiSceneState: before.aiSceneState, castScene: notes, activeSpeakerKey: before.activeSpeakerKey });
    return Object.assign({}, updated, { groupAutomationReview: null, groupAutomationUndo: null });
  }
  var api = { capture: capture, sanitizeProposal: sanitizeProposal, stageProposal: stageProposal, applyProposal: applyProposal, undoProposal: undoProposal, sameCapture: sameCapture };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RolecraftGroupCoordinator = api;
})(typeof window === "object" ? window : globalThis);
