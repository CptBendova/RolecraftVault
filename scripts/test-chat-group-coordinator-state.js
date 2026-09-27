// Exercise the shipped AI scene sanitizer and branch writer against real chat state.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const window = {
  storage: {}, crypto: { randomUUID: () => 'test-id' },
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/chat.js'), 'utf8'), {
  window, document: { createElement: () => ({}), body: { appendChild() {} } },
});
const chatState = window.__rcvChatInternals;
const coordinator = require('../app/chat-group-coordinator');
const sync = require('../app/chat-sync-core');
const plain = value => JSON.parse(JSON.stringify(value));

const a = { characterId: 'a', variantId: '' }, b = { characterId: 'b', variantId: '' };
const keyA = chatState.participantKey(a), keyB = chatState.participantKey(b);
let chat = {
  id: 'group', title: 'Story', characterId: 'a',
  participants: [a, b], activeSpeakerKey: keyA, leafId: 'm1', groupAutomationMode: 'suggest',
  messages: [
    { id: 'm0', parentId: null, role: 'user', content: 'We enter the hall.' },
    { id: 'm1', parentId: 'm0', role: 'assistant', content: 'The doors close behind us.' },
  ],
};
chat = chatState.patchScene(chat, {
  sceneLocation: 'The hall', sceneState: 'The players are alert.',
  castScene: { [keyB]: { presence: 'away', knowledge: 'A private promise.' } },
});
const expected = coordinator.capture(chat);
const nativeReply = {
  update: {
    location: 'The sealed hall', scene: 'The doors have closed and the torches dimmed.',
    cast: [{ key: keyB, presence: 'observing', knowledge: 'Saw the doors close.' }],
    nextSpeakerKey: keyB,
  },
  apiKey: 'must-never-be-saved',
};
const proposal = coordinator.sanitizeProposal(nativeReply, chat);
assert.strictEqual(proposal.aiSceneLocation, 'The sealed hall');
assert.strictEqual(proposal.aiSceneState, 'The doors have closed and the torches dimmed.');
assert.strictEqual(proposal.castScene[keyB].aiKnowledge, 'Saw the doors close.');
assert.strictEqual(proposal.castScene[keyB].aiPresence, 'observing');
assert(!JSON.stringify(proposal).includes('must-never-be-saved'));

const staged = coordinator.stageProposal(chat, proposal, 'm1', expected, 123);
assert.strictEqual(staged.groupAutomationReview.applied, false);
assert.strictEqual(staged.sceneState, 'The players are alert.', 'a suggestion does not rewrite the scene');
assert.doesNotThrow(() => sync.validate([plain(staged)]));
const reviewFields = chatState.coordinatorReviewFields(staged, [{ ...a, name: 'A' }, { ...b, name: 'B' }]);
assert(reviewFields.some(field => field.id === 'location' && field.before === 'Not specified' && field.after === 'The sealed hall'));
assert(reviewFields.some(field => field.kind === 'knowledge' && field.before === 'Not specified'), 'AI-only fields show a before value');
const selected = chatState.selectedCoordinatorProposal(reviewFields, { scene: false, speaker: false, [`presence:${keyB}`]: false }, { location: 'The corrected hall', [`knowledge:${keyB}`]: 'Only heard the doors.' });
const selectivelyApplied = coordinator.applyProposal(staged, selected, 'm1', chatState.patchScene, expected);
assert.strictEqual(selectivelyApplied.aiSceneLocation, 'The corrected hall', 'reviewed corrections replace only the chosen AI field');
assert.strictEqual(selectivelyApplied.aiSceneState || '', '', 'unchecked AI scene recap is not applied');
assert.strictEqual(selectivelyApplied.castScene[keyB].aiKnowledge, 'Only heard the doors.');
assert.strictEqual(selectivelyApplied.castScene[keyB].aiPresence, 'unknown', 'unchecked AI presence is not applied');
assert.strictEqual(selectivelyApplied.activeSpeakerKey, keyA, 'unchecked speaker suggestion is not applied');
assert.strictEqual(selectivelyApplied.castScene[keyB].knowledge, 'A private promise.', 'manual knowledge stays untouched');
assert.doesNotThrow(() => sync.validate([plain(selectivelyApplied)]));
assert.throws(() => coordinator.applyProposal(staged, chatState.selectedCoordinatorProposal(reviewFields, {}, { location: 'x'.repeat(401) }), 'm1', chatState.patchScene, expected), /Invalid AI group location/, 'edited AI fields keep native bounds');
const applied = coordinator.applyProposal(staged, staged.groupAutomationReview.proposal, 'm1', chatState.patchScene, staged.groupAutomationReview.expected, 124);
assert.strictEqual(applied.sceneLocation, 'The hall', 'AI does not erase user-authored location');
assert.strictEqual(applied.sceneState, 'The players are alert.', 'AI does not erase user-authored scene notes');
assert.strictEqual(applied.castScene[keyB].presence, 'away', 'AI does not erase user-authored presence');
assert.strictEqual(applied.castScene[keyB].knowledge, 'A private promise.', 'AI does not erase user-authored knowledge');
assert.strictEqual(applied.aiSceneLocation, 'The sealed hall');
assert.strictEqual(applied.aiSceneState, 'The doors have closed and the torches dimmed.');
assert.strictEqual(applied.castScene[keyB].aiPresence, 'observing');
assert.strictEqual(applied.castScene[keyB].aiKnowledge, 'Saw the doors close.');
assert.strictEqual(applied.activeSpeakerKey, keyB);
assert(!applied.sceneEvents || !applied.sceneEvents.length, 'AI never creates private/off-scene facts');
assert.strictEqual(applied.sceneVersions.m1.aiSceneState, applied.aiSceneState, 'AI scene data is stored in the current branch checkpoint');
assert.doesNotThrow(() => sync.validate([plain(applied)]));

const oldBranch = chatState.navigateScene(applied, 'm0');
assert.strictEqual(oldBranch.aiSceneState || '', '', 'earlier branches do not inherit AI scene facts from future turns');
const restored = chatState.navigateScene(oldBranch, 'm1');
assert.strictEqual(restored.aiSceneState, applied.aiSceneState, 'returning to the branch restores its AI scene note');

const undone = coordinator.undoProposal(applied, chatState.patchScene);
assert.strictEqual(undone.aiSceneState || '', '');
assert.strictEqual(undone.castScene[keyB].knowledge, 'A private promise.');
assert.strictEqual(undone.castScene[keyB].aiKnowledge || '', '');
assert.strictEqual(undone.activeSpeakerKey, keyA);
assert.doesNotThrow(() => sync.validate([plain(undone)]));
const laterSuggestion = coordinator.stageProposal(applied, proposal, 'm1', coordinator.capture(applied), 125);
assert.strictEqual(laterSuggestion.groupAutomationUndo, applied.groupAutomationUndo, 'suggesting another update retains the earlier reversible edit');
const withFutureNote = {
  ...chat, castScene: { [keyB]: { ...chat.castScene[keyB], futureNoteField: 'retain this' } },
};
const futureApplied = coordinator.applyProposal(withFutureNote, proposal, 'm1', chatState.patchScene, coordinator.capture(withFutureNote));
assert.strictEqual(futureApplied.castScene[keyB].futureNoteField, 'retain this', 'AI updates preserve unknown note fields');
assert.strictEqual(coordinator.undoProposal(futureApplied, chatState.patchScene).castScene[keyB].futureNoteField, 'retain this', 'undo preserves unknown note fields');

const edited = chatState.patchScene(staged, { sceneState: 'The user changed this note.' });
assert.throws(() => coordinator.applyProposal(edited, proposal, 'm1', chatState.patchScene, expected), /edited/);
assert.throws(() => coordinator.undoProposal(chatState.patchScene(applied, { aiSceneState: 'Changed after AI.' }), chatState.patchScene), /changed/);
assert.throws(() => coordinator.sanitizeProposal({ update: { cast: [{ key: '["outsider",""]', knowledge: 'Secret' }] } }, chat), /outside/);
assert.throws(() => coordinator.sanitizeProposal({ update: { scene: 'x'.repeat(1201) } }, chat), /Invalid/);
assert.throws(() => sync.validate([plain({ ...applied, groupAutomationReview: { ...applied.groupAutomationReview, apiKey: 'unsafe' } })]), /Invalid AI group review/);
assert.throws(() => sync.validate([plain({ ...applied, groupAutomationReview: { ...applied.groupAutomationReview, proposal: { aiSceneState: null } } })]), /Invalid AI group review/);
assert.throws(() => sync.validate([plain({ ...applied, castScene: { [keyB]: { aiKnowledge: 'x'.repeat(601) } } })]), /Invalid group cast scene/);
console.log('PASS: AI group proposal bounds, branch checkpoints, manual-note preservation, CAS undo and sync validation');
