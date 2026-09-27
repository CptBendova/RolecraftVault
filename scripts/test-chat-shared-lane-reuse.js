const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const Lanes = require('../app/chat-knowledge-lanes');

const root = path.join(__dirname, '..');
const window = {
  storage: {}, crypto: { randomUUID: crypto.randomUUID }, RolecraftChatKnowledgeLanes: Lanes,
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) }
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'app/chat.js'), 'utf8'), {
  window, document: { createElement: () => ({}), body: { appendChild() {} } }
});
const I = window.__rcvChatInternals;
assert.strictEqual(typeof I.sharedLaneReplyContext, 'function');
const a = { characterId: 'a', variantId: '' }, b = { characterId: 'b', variantId: '' };
const ak = Lanes.participantKey(a), bk = Lanes.participantKey(b);
const messages = Array.from({ length: 30 }, (_, index) => ({
  id: 'm' + index, parentId: index ? 'm' + (index - 1) : null,
  role: index % 2 ? 'assistant' : 'user',
  speaker: index % 2 ? a : undefined,
  content: 'Shared event ' + index + ': ' + 'They discuss the changing battle. '.repeat(10)
}));
const library = { chars: [{ id: 'a', name: 'Ari' }, { id: 'b', name: 'Bea' }], personas: [{ id: 'player', name: 'Robin' }], lore: [] };
const chat = {
  id: 'shared-story', title: 'Shared story', characterId: 'a', personaId: 'player',
  participants: [a, b], activeSpeakerKey: bk, knowledgeLanes: true,
  messages, leafId: messages.at(-1).id, model: 'fixture/model',
  contextTokens: 12000, maxTokens: 500, autoMemory: true,
  memoryTriggerTokens: 0, memoryRecent: 5, knowledgeLaneMemories: {}
};
const source = [0, 8, 16].map((start, index) => ({
  id: 'source-' + index, fromId: 'm' + start, throughId: 'm' + (start + 7),
  previousThroughId: index ? 'm' + (start - 1) : null,
  format: 'incremental-v2', text: 'Messages ' + (start + 1) + '–' + (start + 8) + ': Public battle history ' + index
}));
const saved = Lanes.commitMemoryView(chat, ak, { memories: source });
const original = JSON.stringify(saved);
const requestView = I.sharedLaneReplyContext(saved, library, []);
assert.notStrictEqual(requestView, saved, 'a shared, proven source lane can serve the next speaker');
assert.strictEqual(JSON.stringify(requestView.knowledgeLaneMemories[bk]), JSON.stringify(saved.knowledgeLaneMemories[ak]), 'reuse is only a request view');
assert.strictEqual(saved.knowledgeLaneMemories[bk], undefined, 'the selected speaker is not overwritten');
assert.strictEqual(JSON.stringify(saved), original, 'saved transcript and both lanes remain unchanged');
assert.strictEqual(I.memoryPlan(requestView, library, [], false), null, 'the ready source does not start another paid backfill');
assert(I.assemble(requestView, library, null, []).messages[0].content.includes('Public battle history 2'));

const privateTurn = { ...saved, messages: saved.messages.map((message, index) => index === 3 ? { ...message, audience: [ak] } : message) };
assert.strictEqual(I.sharedLaneReplyContext(privateTurn, library, []), privateTurn, 'any private turn disables cross-speaker reuse');
const editedSource = { ...saved, knowledgeLaneMemories: { [ak]: saved.knowledgeLaneMemories[ak].map((entry, index) => index === 1 ? { ...entry, editedAt: Date.now() } : entry) } };
assert.strictEqual(I.sharedLaneReplyContext(editedSource, library, []), editedSource, 'manual source memory is not borrowed');
const damagedSource = { ...saved, messages: saved.messages.map((message, index) => index === 10 ? { ...message, content: 'Changed source turn.' } : message) };
assert.strictEqual(I.sharedLaneReplyContext(damagedSource, library, []), damagedSource, 'a changed source digest invalidates reuse');
const brokenChain = { ...saved, knowledgeLaneMemories: { [ak]: saved.knowledgeLaneMemories[ak].filter((_, index) => index !== 1) } };
assert.strictEqual(I.sharedLaneReplyContext(brokenChain, library, []), brokenChain, 'missing earlier checkpoints invalidate reuse');
const ownEdited = Lanes.commitMemoryView(saved, bk, { memories: [{ ...source[0], id: 'own', text: 'My corrected story.', editedAt: Date.now() }] });
assert.strictEqual(I.sharedLaneReplyContext(ownEdited, library, []), ownEdited, 'recipient manual memory stays authoritative');

console.log('PASS: read-only shared lane reuse with complete proof; private, edited and broken histories fail closed');
