"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const window = {storage: {}, React: {createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {}}, ReactDOM: {createRoot: () => ({render() {}})}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../app/chat.js"), "utf8"), {window, document: {createElement: () => ({}), body: {appendChild() {}}}});
const I = window.__rcvChatInternals, plain = value => JSON.parse(JSON.stringify(value));
const removedId = "irethia-conflict-" + "a".repeat(24);
const character = {id: "irethia", name: "Irethia", story: "LATEST_CANONICAL_STORY", profileImg: "latest-portrait", syncAliases: [removedId], variants: [{id: "night", name: "Night", story: "LATEST_VARIANT_STORY", profileImg: "latest-variant-portrait"}]};
const oldCharacter = {id: removedId, name: "Old Irethia (sync conflict)", story: "STALE_COPY_STORY", profileImg: "stale-portrait"};
const other = {id: "selinde", name: "Selinde", story: "OTHER_ACTIVE_CHARACTER"};
const library = {chars: [character, other], personas: [], lore: []};
const messages = [
  {id: "m0", parentId: null, role: "user", content: "The earlier battle started."},
  {id: "m1", parentId: "m0", role: "assistant", content: "I raised my shield.", speaker: {characterId: removedId, variantId: "", name: "Original display name"}},
  {id: "m2", parentId: "m1", role: "user", content: "We reached the tower."},
  {id: "m3", parentId: "m2", role: "assistant", content: "I opened the tower door.", speaker: {characterId: removedId, variantId: "", name: "Original display name"}}
];
for (let index = 4; index < 8; index++) messages.push({id: "m" + index, parentId: "m" + (index - 1), role: index % 2 ? "assistant" : "user", content: "The story continued: " + index, ...(index % 2 ? {speaker: {characterId: removedId, variantId: "", name: "Original display name"}} : {})});
const memories = [{id: "memory", throughId: "m1", text: "OUR_EXISTING_BATTLE_MEMORY", createdAt: 1}];
const single = {id: "story", characterId: removedId, model: "fixture", contextTokens: 32000, maxTokens: 500, messages, memories, leafId: "m7", castSnapshot: {character: oldCharacter}};
const beforeSingle = JSON.stringify(single), beforeLibrary = JSON.stringify(library);
const request = I.assemble(single, library);
assert(request.messages[0].content.includes("LATEST_CANONICAL_STORY"));
assert(!request.messages[0].content.includes("STALE_COPY_STORY"), "chatLibrary must not append the saved old copy and shadow its live alias");
assert(request.messages[0].content.includes(memories[0].text));
assert.equal(request.compacted, 2);
assert.deepEqual(plain(request.messages.slice(1)), messages.slice(2).map(message => ({role: message.role, content: message.content})));
assert.equal(I.participantCharacter(single, I.selectedParticipant(single), library).profileImg, "latest-portrait");
const refreshed = I.captureCast(single, library);
assert.equal(refreshed.castSnapshot.character.id, "irethia");
assert.equal(refreshed.castSnapshot.character.story, "LATEST_CANONICAL_STORY");
assert.equal(refreshed.characterId, removedId, "only profile lookup changes; conversation identity remains stable");
assert.strictEqual(refreshed.messages, messages);
assert.strictEqual(refreshed.memories, memories);
assert.strictEqual(I.messageSpeaker(refreshed, messages[1], library), messages[1].speaker);
console.log("PASS existing single chat uses the reviewed canonical profile while saved history, speakers and memory remain unchanged");

const participant = {characterId: removedId, variantId: ""};
const group = {...single, participants: [participant, {characterId: other.id, variantId: ""}], activeSpeakerKey: I.participantKey(participant), castSnapshot: {character: oldCharacter, participants: [{...participant, character: oldCharacter}]}};
const beforeGroup = JSON.stringify(group), groupRequest = I.assemble(group, library);
assert(groupRequest.messages[0].content.includes("LATEST_CANONICAL_STORY"));
assert(groupRequest.messages[0].content.includes("Selinde"), "group context still identifies the other participant");
assert(!groupRequest.messages[0].content.includes("OTHER_ACTIVE_CHARACTER"), "non-selected participants use bounded identity details, not their full story");
assert(!groupRequest.messages[0].content.includes("STALE_COPY_STORY"));
assert(groupRequest.messages[0].content.includes(memories[0].text));
assert(groupRequest.messages.some(message => message.role === "assistant" && message.content === "[Speaker: Original display name]\n" + messages[3].content), "alias resolution must not change which historical turns belong to the selected speaker");
const updatedGroup = I.captureCast(group, library);
assert.strictEqual(updatedGroup.participants, group.participants);
assert.strictEqual(updatedGroup.messages, messages);
assert.strictEqual(updatedGroup.memories, memories);
assert.equal(updatedGroup.castSnapshot.participants[0].characterId, removedId);
assert.equal(updatedGroup.castSnapshot.participants[0].character.story, "LATEST_CANONICAL_STORY");
console.log("PASS group profile and selected-speaker lookup follow aliases without rewriting participant keys or transcript attribution");

const variantParticipant = {characterId: removedId, variantId: "night"};
const variant = {...single, variantId: "night", castSnapshot: {character: {id: removedId, story: "SAVED_VARIANT_FALLBACK"}}};
assert.equal(I.participantCharacter(variant, variantParticipant, library).story, "LATEST_VARIANT_STORY");
assert.equal(I.participantCharacter(variant, variantParticipant, library).profileImg, "latest-variant-portrait");
assert.equal(I.participantCharacter(variant, variantParticipant, {...library, chars: [{...character, variants: []}]}).story, "SAVED_VARIANT_FALLBACK", "a missing variant never silently changes to the base profile");
assert.equal(I.participantCharacter(single, participant, {...library, chars: [character, {...oldCharacter, story: "EXPLICIT_RESTORED_COPY"}]}).story, "EXPLICIT_RESTORED_COPY", "an exact restored identity takes precedence over an alias");
assert.equal(JSON.stringify(single), beforeSingle);
assert.equal(JSON.stringify(group), beforeGroup);
assert.equal(JSON.stringify(library), beforeLibrary);
console.log("PASS alias variants retain their own portraits, missing variants fall back safely, and exact live identities take precedence");
