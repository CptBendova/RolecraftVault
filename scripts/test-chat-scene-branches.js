// Execute the shipped chat state helpers. Scene notes follow message ancestry,
// while removing a cast member must not destroy their editable knowledge note.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const window = {
  storage: {}, crypto: { randomUUID: () => 'id-' + Math.random() },
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/chat.js'), 'utf8'), {
  window, document: { createElement: () => ({}), body: { appendChild() {} } },
});
const I = window.__rcvChatInternals;
const sync = require('../app/chat-sync-core');
const plain = value => JSON.parse(JSON.stringify(value));
const library = { chars: [{ id: 'a', name: 'Ari' }, { id: 'b', name: 'Bea' }], personas: [], lore: [] };
const ari = { characterId: 'a', variantId: '' }, bea = { characterId: 'b', variantId: '' };
const keyA = I.participantKey(ari), keyB = I.participantKey(bea);
const messages = [
  { id: 'm0', parentId: null, role: 'user', content: 'Start.' },
  { id: 'm1', parentId: 'm0', role: 'assistant', content: 'We arrive.' },
  { id: 'a2', parentId: 'm1', role: 'user', content: 'Take the bridge.' },
  { id: 'a3', parentId: 'a2', role: 'assistant', content: 'The bridge falls.' },
  { id: 'b2', parentId: 'm1', role: 'user', content: 'Stay in town.' },
];
let chat = { id: 'story', title: 'Two paths', characterId: 'a', messages, leafId: 'm1', participants: [ari, bea], activeSpeakerKey: keyA };
chat = I.patchScene(chat, { sceneLocation: 'Town', sceneState: 'Both are at the crossroads.', castScene: { [keyB]: { presence: 'present', knowledge: 'Saw the crossroads.' } } });
chat = I.navigateScene(chat, 'a3');
assert.strictEqual(chat.sceneState, 'Both are at the crossroads.', 'new turns inherit the latest ancestral scene note');
chat = I.patchScene(chat, { sceneLocation: 'Bridge', sceneState: 'The bridge fell.', castScene: { [keyB]: { presence: 'present', knowledge: 'Saw the bridge collapse.' } }, sceneEvents: [{ id: 'private-event', text: 'Bea saw the fall.', audience: [keyB] }] });
assert.doesNotThrow(() => sync.validate([plain(chat)]), 'saved branch checkpoints and private events pass the same sync validator as backups');
let alternate = I.navigateScene(chat, 'b2');
assert.strictEqual(alternate.sceneLocation, 'Town');
assert.strictEqual(alternate.sceneState, 'Both are at the crossroads.', 'future scene facts cannot leak into a sibling branch');
assert.strictEqual(alternate.castScene[keyB].knowledge, 'Saw the crossroads.', 'future witnessed knowledge cannot leak into a sibling branch');
assert.strictEqual(alternate.sceneEvents.length, 0, 'future private events cannot leak into a sibling branch');
assert.strictEqual(I.navigateScene(alternate, 'a3').castScene[keyB].knowledge, 'Saw the bridge collapse.', 'returning to a branch restores its own notes');
assert.strictEqual(I.navigateScene(alternate, 'a3').sceneEvents[0].text, 'Bea saw the fall.');
const fork = I.forkConversation(chat, 'm1');
assert.strictEqual(fork.sceneState, 'Both are at the crossroads.', 'fork at an older turn uses that turn’s scene');
assert.strictEqual(fork.castScene[keyB].knowledge, 'Saw the crossroads.');
assert.strictEqual(fork.sceneEvents.length, 0);
assert(!JSON.stringify(fork).includes('bridge fell'), 'future scene versions are not copied into an older fork');
assert.strictEqual(fork.messages.length, 2);
assert.deepStrictEqual(plain(fork.sceneVersions.$root.castScene), {});

let removed = I.changeParticipants(chat, library, 'remove', bea);
assert(!removed.castScene[keyB], 'removed cast knowledge is never sent as an active note');
assert.strictEqual(removed.dormantCastScene[keyB].knowledge, 'Saw the bridge collapse.', 'removed notes are retained outside active context');
let restored = I.changeParticipants(removed, library, 'add-only', bea);
assert.strictEqual(restored.castScene[keyB].knowledge, 'Saw the bridge collapse.', 're-adding restores the note');
assert(!restored.dormantCastScene[keyB]);
assert.strictEqual(restored.activeSpeakerKey, keyA, 'add-only does not switch speakers');

const legacy = { ...chat, sceneVersions: undefined, leafId: 'a3' };
alternate = I.navigateScene(legacy, 'b2');
assert.strictEqual(alternate.sceneState, '', 'a legacy chat does not guess that present-day notes existed in an older branch');
assert.strictEqual(I.navigateScene(alternate, 'a3').sceneState, 'The bridge fell.', 'legacy current notes remain recoverable on their original leaf');
const solo = { id: 'solo', title: 'Solo', characterId: 'a', messages, leafId: 'a3' };
const soloMoved = I.navigateScene(solo, 'b2');
assert.strictEqual(soloMoved.leafId, 'b2');
assert(!Object.prototype.hasOwnProperty.call(soloMoved, 'sceneVersions'), 'solo chats do not gain group-only checkpoints');
assert.doesNotThrow(() => sync.validate([plain(soloMoved)]), 'solo chats remain valid after branch navigation');
const noteBase = I.manualSceneDraft(chat);
const noteDraft = plain(noteBase);
noteDraft.sceneState = 'Bea is still near the fallen bridge.';
noteDraft.castScene[keyB].knowledge = 'Saw the bridge collapse and the rescue.';
const noteEdit = { chatId: chat.id, leafId: chat.leafId, before: noteBase, changes: I.manualSceneChanges(noteBase, noteDraft) };
assert.strictEqual(Object.keys(noteEdit.changes.castScene).length, 1, 'draft saves only the edited cast member');
const patched = I.patchManualScene(chat, noteEdit);
assert.strictEqual(patched.sceneState, noteDraft.sceneState);
assert.strictEqual(patched.castScene[keyB].knowledge, noteDraft.castScene[keyB].knowledge);
assert.strictEqual(I.navigateScene(patched, 'b2').sceneState, 'Both are at the crossroads.', 'manual draft does not leak into a sibling branch');
assert.doesNotThrow(() => sync.validate([plain(patched)]), 'saved manual checkpoint remains sync-valid');
assert.throws(() => I.patchManualScene(patched, noteEdit), /changed on another device/, 'a stale draft never overwrites a newer scene note');
const separateEdit = { chatId: chat.id, leafId: chat.leafId, before: noteBase, changes: { sceneLocation: 'Collapsed bridge' } };
const withIndependentChange = I.patchScene(chat, { sceneState: 'Ari has called for help.' });
assert.strictEqual(I.patchManualScene(withIndependentChange, separateEdit).sceneState, 'Ari has called for help.', 'unrelated remote scene edits survive a local draft save');
const switched = I.navigateScene(chat, 'b2');
const savedOldBranch = I.patchManualScene(switched, noteEdit);
assert.strictEqual(savedOldBranch.leafId, 'b2', 'saving an old-branch draft does not navigate the reader');
assert.strictEqual(savedOldBranch.sceneState, 'Both are at the crossroads.', 'old-branch draft cannot overwrite the visible branch');
assert.strictEqual(I.navigateScene(savedOldBranch, 'a3').sceneState, noteDraft.sceneState, 'old-branch notes remain recoverable on their original path');
console.log('PASS: branch-aware scene and cast notes, conservative legacy navigation, and dormant cast-note restoration');
