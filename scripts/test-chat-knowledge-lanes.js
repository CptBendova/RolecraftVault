const assert = require('assert');
const Lanes = require('../app/chat-knowledge-lanes');

const a = { characterId: 'a', variantId: '' };
const b = { characterId: 'b', variantId: '' };
const ak = Lanes.participantKey(a);
const bk = Lanes.participantKey(b);
const turn = (id, parentId, role, content, audience, speaker) => ({
  id, parentId, role, content,
  ...(audience ? { audience } : {}),
  ...(speaker ? { speaker } : {})
});
const messages = [
  turn('m1', null, 'user', 'The public scene begins.'),
  turn('m2', 'm1', 'user', 'ARI_ONLY_CLUE', [ak]),
  turn('m3', 'm2', 'assistant', 'ARI_ONLY_REPLY', [ak], a),
  turn('m4', 'm3', 'user', 'BEA_ONLY_CLUE', [bk]),
  turn('m5', 'm4', 'assistant', 'BEA_ONLY_REPLY', [bk], b),
  turn('m6', 'm5', 'user', 'Everyone sees the bridge.'),
  turn('m7', 'm6', 'assistant', 'ARI_PUBLIC_REPLY', undefined, a),
  turn('alternate', 'm3', 'user', 'SIBLING_SECRET', [ak])
];
const shared = { id: 'shared', participants: [a, b], activeSpeakerKey: ak, leafId: 'm7', messages, memories: [{ throughId: 'm5', text: 'OLD_SHARED_SUMMARY_CONTAINS_BEA_ONLY_CLUE' }] };
const chat = { ...shared, knowledgeLanes: true };
const contents = rows => rows.map(m => m.content).join('|');

// Older groups keep the original shared history and memory behavior.
assert.strictEqual(Lanes.enabled(shared), false);
assert.strictEqual(contents(Lanes.contextFor(shared, ak).history), contents(messages.slice(0, 7)));
assert.strictEqual(Lanes.contextFor(shared, ak).memoryChat, shared);
assert.strictEqual(Lanes.visibleTo(shared, messages[3], ak), true);

const original = JSON.stringify(chat);
const aContext = Lanes.contextFor(chat, ak);
const bContext = Lanes.contextFor(chat, bk);
assert.strictEqual(contents(aContext.history), 'The public scene begins.|ARI_ONLY_CLUE|ARI_ONLY_REPLY|Everyone sees the bridge.|ARI_PUBLIC_REPLY');
assert.strictEqual(contents(bContext.history), 'The public scene begins.|BEA_ONLY_CLUE|BEA_ONLY_REPLY|Everyone sees the bridge.|ARI_PUBLIC_REPLY');
assert(!contents(aContext.history).includes('BEA_ONLY'));
assert(!contents(bContext.history).includes('ARI_ONLY'));
assert(!contents(aContext.history).includes('SIBLING_SECRET'), 'a sibling branch never enters the selected leaf');
const afterRemoval = { ...chat, participants: [a] };
assert(!contents(Lanes.contextFor(afterRemoval, ak).history).includes('BEA_ONLY'), 'removing Bea keeps her older private audience valid and hidden');
assert.deepStrictEqual(aContext.memoryChat.memories, [], 'opt-in ignores legacy shared compaction even when its through ID is visible');
assert(!JSON.stringify(aContext.memoryChat.memories).includes('OLD_SHARED_SUMMARY_CONTAINS_BEA_ONLY_CLUE'));
assert.strictEqual(JSON.stringify(chat), original, 'request selection never changes the saved transcript');

const publicEdit = Lanes.withAudience(chat, messages[1], null);
assert(!Object.hasOwn(publicEdit, 'audience'));
assert.deepStrictEqual(messages[1].audience, [ak], 'audience edits return a fresh turn');
assert.deepStrictEqual(Lanes.withAudience(chat, messages[0], [ak, bk]).audience, [ak, bk]);
assert.throws(() => Lanes.withAudience(shared, messages[0], [ak]), /enabled/);
for (const bad of [[], [ak, ak], ['missing'], 'all']) {
  assert.throws(() => Lanes.withAudience(chat, messages[0], bad), /audience|slice/);
}
assert.throws(() => Lanes.contextFor(chat, 'not-a-member'), /current group character/);
assert.throws(() => Lanes.visibleHistory({ ...chat, messages: [...messages, { ...messages[0] }] }, ak), /duplicate/);
assert.throws(() => Lanes.visibleHistory({ ...chat, messages: messages.filter(m => m.id !== 'm3') }, ak), /ancestry/);

// Compaction writes the selected lane only, with source proof. A summary of a
// private assistant reply is never available to the other character.
const aEntry = { id: 'a-checkpoint', fromId: 'm1', throughId: 'm3', previousThroughId: null, format: 'incremental-v2', text: 'ARI_MEMORY_ONLY' };
const aUpdated = { ...aContext.memoryChat, memories: [aEntry] };
const withA = Lanes.commitMemoryView(chat, ak, aUpdated);
assert.strictEqual(withA.memories, chat.memories, 'legacy shared checkpoints are preserved as source data');
assert.deepStrictEqual(Lanes.contextFor(withA, ak).memoryChat.memories.map(m => m.text), ['ARI_MEMORY_ONLY']);
assert.deepStrictEqual(Lanes.contextFor(withA, bk).memoryChat.memories, []);
assert(!JSON.stringify(Lanes.contextFor(withA, bk).memoryChat.memories).includes('ARI_MEMORY_ONLY'));

const bEntry = { id: 'b-checkpoint', fromId: 'm1', throughId: 'm5', previousThroughId: null, format: 'incremental-v2', text: 'BEA_MEMORY_ONLY' };
const withB = Lanes.commitMemoryView(withA, bk, { ...bContext.memoryChat, memories: [bEntry] });
assert.deepStrictEqual(Lanes.contextFor(withB, ak).memoryChat.memories.map(m => m.text), ['ARI_MEMORY_ONLY']);
assert.deepStrictEqual(Lanes.contextFor(withB, bk).memoryChat.memories.map(m => m.text), ['BEA_MEMORY_ONLY']);

// If an older visible turn becomes private, every checkpoint based on it is
// discarded for that character, including later incremental descendants.
const aSecond = { id: 'a-second', fromId: 'm6', throughId: 'm7', previousThroughId: 'm3', format: 'incremental-v2', text: 'ARI_LATER_MEMORY' };
const chained = Lanes.commitMemoryView(withB, ak, { ...Lanes.contextFor(withB, ak).memoryChat, memories: [withB.knowledgeLaneMemories[ak][0], aSecond] });
assert.strictEqual(Lanes.contextFor(chained, ak).memoryChat.memories.length, 2);
const changed = { ...chained, messages: chained.messages.map(m => m.id === 'm2' ? Lanes.withAudience(chained, m, [bk]) : m) };
const changedView = Lanes.contextFor(changed, ak);
assert(!JSON.stringify(changedView.memoryChat.memories).includes('ARI_MEMORY_ONLY'));
assert.strictEqual(changedView.memoryChat.memories.length, 1, 'independent later spans retain their proof; a missing prior link makes the memory chain fail closed');
assert.strictEqual(Lanes.proofMatches(chained.knowledgeLaneMemories[ak][0], changedView.history), false);
assert.throws(() => Lanes.commitMemoryView(changed, ak, { ...changedView.memoryChat, memories: [chained.knowledgeLaneMemories[ak][0]] }), /no longer matches/);

const editedText = { ...chained, messages: chained.messages.map(m => m.id === 'm2' ? { ...m, content: 'changed text' } : m) };
assert(!Lanes.contextFor(editedText, ak).memoryChat.memories.some(m => m.text === 'ARI_MEMORY_ONLY'), 'editing the source invalidates its summary');
const sibling = { ...chained, leafId: 'alternate' };
assert(!contents(Lanes.contextFor(sibling, ak).history).includes('BEA_ONLY'));
assert(contents(Lanes.contextFor(sibling, ak).history).includes('SIBLING_SECRET'));
assert(!Lanes.contextFor(sibling, ak).memoryChat.memories.some(m => m.text === 'ARI_LATER_MEMORY'), 'a sibling branch cannot use future memory');

const copied = {
  ...chained,
  id: 'fork',
  messages: chained.messages.slice(0, 7).map((m, i) => ({ ...m, id: 'f' + (i + 1), parentId: i ? 'f' + i : null })),
  leafId: 'f7',
  knowledgeLaneMemories: {}
};
const map = Object.fromEntries(messages.slice(0, 7).map((m, i) => [m.id, 'f' + (i + 1)]));
let nextId = 0;
const fork = Lanes.forkLaneMemories(chained, copied, map, () => 'fork-memory-' + ++nextId);
assert.deepStrictEqual(Lanes.contextFor(fork, ak).memoryChat.memories.map(m => m.text), ['ARI_MEMORY_ONLY', 'ARI_LATER_MEMORY']);
assert.deepStrictEqual(Lanes.contextFor(fork, bk).memoryChat.memories.map(m => m.text), ['BEA_MEMORY_ONLY']);
assert(fork.knowledgeLaneMemories[ak].every(m => m.throughId.startsWith('f') && m.laneSourceIds.every(id => id.startsWith('f'))));

console.log('PASS: opt-in group knowledge lanes keep message audiences, branch history and compaction separate');
