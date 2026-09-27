// Lift the shipped scheduling/fingerprint helpers; no copied coordinator logic.
"use strict";
const assert = require("assert").strict;
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { webcrypto } = require("crypto");
const window = {
  crypto: webcrypto,
  storage: {},
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "app", "chat.js"), "utf8"), {
  window, TextEncoder, document: { createElement: () => ({}), body: { appendChild() {} } },
});
const chatApi = window.__rcvChatInternals;
const { validate } = require("../app/chat-sync-core");

const messages = [
  { id: "a1", parentId: null, role: "assistant", content: "The room is quiet.", createdAt: 1 },
  { id: "a2", parentId: "a1", role: "assistant", content: "I study the map.", createdAt: 2 },
  { id: "a3", parentId: "a2", role: "assistant", content: "The candles burn steadily.", createdAt: 3 },
  { id: "a4", parentId: "a3", role: "assistant", content: "I put the map away.", createdAt: 4 },
];
const cast = [{ characterId: "a", variantId: "" }, { characterId: "b", variantId: "" }];
const chat = { id: "group", characterId: "a", participants: cast, activeSpeakerKey: JSON.stringify(["a", ""]), groupAutomationMode: "auto", groupAutomationCadence: "balanced", groupCoordinatorModel: "fixture/fast", model: "fixture/roleplay", messages, leafId: "a1" };
const checked = { a1: { coordinator: { requests: 1 } } };
assert(chatApi.coordinatorDue(chat, "a1", {}, false), "first completed reply bootstraps tracking");
assert(!chatApi.coordinatorDue(chat, "a1", checked, false), "a checked reply is never auto-charged twice");
assert(!chatApi.coordinatorDue({ ...chat, leafId: "a2" }, "a2", checked, false), "the next routine reply is skipped");
assert(!chatApi.coordinatorDue({ ...chat, leafId: "a3" }, "a3", checked, false), "the second routine reply is skipped");
assert(chatApi.coordinatorDue({ ...chat, leafId: "a4" }, "a4", checked, false), "the third reply is due");
assert(!chatApi.coordinatorDue({ ...chat, leafId: "a4", groupAutomationCadence: "events" }, "a4", checked, false), "event-only mode has no timer cadence");
assert(chatApi.coordinatorDue({ ...chat, leafId: "a2" }, "a2", checked, true), "a queued round gets one final check");
assert(chatApi.coordinatorDue({ ...chat, leafId: "a2", groupAutomationCadence: "every" }, "a2", checked, false), "every-reply mode remains available");
const eventReply = { ...messages[1], content: "Bea arrives at the gate." };
assert(chatApi.coordinatorDue({ ...chat, messages: [messages[0], eventReply], leafId: "a2", groupAutomationCadence: "events" }, "a2", checked, false), "a clear arrival triggers an event-only check");
assert(chatApi.coordinatorDue({ ...chat, leafId: "a2", sceneEvents: [{ id: "e", text: "The bridge broke.", audience: [], createdAt: 1.5 }] }, "a2", checked, false), "a saved scene event triggers a check without sending private event text");
for (const content of ["I lifted my left hand.", "I turned left toward her.", "She returned my gaze."]) {
  assert(!chatApi.coordinatorDue({ ...chat, messages: [messages[0], { ...messages[1], content }], leafId: "a2", groupAutomationCadence: "events" }, "a2", checked, false), "ordinary prose does not trigger a paid scene check: " + content);
}
for (const content of ["Mara left the chamber.", "Mara leaves through the gate.", "Mara traveled to the city."]) {
  assert(chatApi.coordinatorDue({ ...chat, messages: [messages[0], { ...messages[1], content }], leafId: "a2", groupAutomationCadence: "events" }, "a2", checked, false), "a real departure can trigger a scene check: " + content);
}
assert(!chatApi.coordinatorDue({ ...chat, leafId: "a2" }, "a1", checked, false), "an older branch reply is not current");
const groupCast = ["a", "b", "c", "d"].map(characterId => ({ characterId, variantId: "" }));
const groupKeys = groupCast.map(chatApi.participantKey);
const groupLibrary = { chars: [{ id: "a", name: "Ari" }, { id: "b", name: "Bea" }, { id: "c", name: "Selindë" }, { id: "d", name: "Dara" }] };
const groupScene = Object.fromEntries(groupKeys.map(key => [key, { presence: "present" }]));
const pairChat = { ...chat, participants: groupCast, castScene: groupScene, autoPairReplies: true, leafId: "a1" };
assert.deepEqual(Array.from(chatApi.autoPairKeys(pairChat, "", groupLibrary)), [groupKeys[0], groupKeys[1]], "cast rotation is the offline fallback");
assert.deepEqual(Array.from(chatApi.autoPairKeys(pairChat, "I ask Selinde what happened.", groupLibrary)), [groupKeys[0], groupKeys[2]], "a directly addressed accented name takes priority");
assert.deepEqual(Array.from(chatApi.autoPairKeys(pairChat, "@Dara, your turn.", groupLibrary)), [groupKeys[0], groupKeys[3]], "an explicit @mention takes priority");
assert.deepEqual(Array.from(chatApi.autoPairKeys(pairChat, "@Dar, your turn.", groupLibrary)), [groupKeys[0], groupKeys[1]], "a partial name does not select the wrong speaker");
assert.deepEqual(Array.from(chatApi.autoPairKeys(pairChat, "@Dara", { chars: groupLibrary.chars.map(character => character.id === "c" ? { ...character, name: "Dara" } : character) })), [groupKeys[0], groupKeys[1]], "an ambiguous name falls back to the visible cast order");
const suggestion = { messageId: "a1", applied: true, proposal: { nextSpeakerKey: groupKeys[3] } };
assert.deepEqual(Array.from(chatApi.autoPairKeys({ ...pairChat, groupAutomationReview: suggestion }, "", groupLibrary)), [groupKeys[0], groupKeys[3]], "a current applied coordinator suggestion beats rotation");
assert.deepEqual(Array.from(chatApi.autoPairKeys({ ...pairChat, groupAutomationReview: suggestion }, "I ask Selinde.", groupLibrary)), [groupKeys[0], groupKeys[2]], "the user address outranks the coordinator");
assert.deepEqual(Array.from(chatApi.autoPairKeys({ ...pairChat, groupAutomationReview: { ...suggestion, applied: false } }, "", groupLibrary)), [groupKeys[0], groupKeys[1]], "an unapproved suggestion is not silently used");
assert.deepEqual(Array.from(chatApi.autoPairKeys({ ...pairChat, groupAutomationReview: { ...suggestion, messageId: "old" } }, "", groupLibrary)), [groupKeys[0], groupKeys[1]], "an earlier scene suggestion is stale");
assert.deepEqual(Array.from(chatApi.autoPairKeys({ ...pairChat, castScene: { ...groupScene, [groupKeys[3]]: { presence: "away", aiPresence: "present" } } }, "@Dara", groupLibrary)), [groupKeys[0], groupKeys[1]], "manual away status excludes an addressed character");
assert.equal(chatApi.autoPairKeys({ ...pairChat, autoPairReplies: false }, "@Dara", groupLibrary).length, 0, "opt-out never starts a second paid reply");
assert.doesNotThrow(() => validate([{ ...chat, leafId: "a2" }]));
assert.throws(() => validate([{ ...chat, groupCoordinatorModel: "bad model" }]), /coordinator model/);
assert.throws(() => validate([{ ...chat, groupAutomationCadence: "unknown" }]), /automation cadence/);

(async () => {
  const state = { location: "Old AI location", scene: "Old AI recap", cast: [{ key: '["a",""]', name: "Ari", presence: "present", knowledge: "Older AI note" }], manual_notes: "User scene fact", memory: "Earlier summary", recent_turns: [{ role: "assistant", speaker: "Ari", text: "Ari studies the map." }] };
  const base = await chatApi.coordinatorFingerprint(chat, state);
  assert.equal(await chatApi.coordinatorFingerprint({ ...chat, aiSceneState: "New AI recap" }, { ...state, location: "New AI location", scene: "New AI recap", cast: [{ ...state.cast[0], presence: "away", knowledge: "New AI note" }] }), base, "applying AI output does not make a repeat manual check appear new");
  assert.notEqual(await chatApi.coordinatorFingerprint({ ...chat, groupCoordinatorModel: "fixture/other" }, state), base, "changing coordinator model allows a fresh check");
  assert.notEqual(await chatApi.coordinatorFingerprint({ ...chat, sceneState: "User changed this scene" }, state), base, "manual scene edits allow a fresh check");
  assert.notEqual(await chatApi.coordinatorFingerprint(chat, { ...state, recent_turns: [{ ...state.recent_turns[0], text: "Ari enters the hall." }] }), base, "a changed reply allows a fresh check");
  console.log("PASS: AI coordinator event/cadence checks, independent model, branch guard and repeat fingerprint");
})().catch(error => { console.error(error); process.exitCode = 1; });
