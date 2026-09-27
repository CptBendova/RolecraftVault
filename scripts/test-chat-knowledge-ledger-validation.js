const assert = require('assert');
const Sync = require('../app/chat-sync-core');
const Lanes = require('../app/chat-knowledge-lanes');
const Ledger = require('../app/chat-story-ledger');

const a = { characterId: 'a', variantId: '' };
const b = { characterId: 'b', variantId: '' };
const ak = Lanes.participantKey(a);
const bk = Lanes.participantKey(b);
const first = { id: 'm1', parentId: null, role: 'user', content: 'The gate opens.' };
const secret = { id: 'm2', parentId: 'm1', role: 'user', content: 'Ari heard the password.', audience: [ak] };
const base = { id: 'group', participants: [a, b], activeSpeakerKey: ak, knowledgeLanes: true, messages: [first, secret], leafId: 'm2' };
const copy = value => JSON.parse(JSON.stringify(value));
assert.strictEqual(Sync.validate([base])[0], base);
let chat = Ledger.save(base, { sourceMessageId: 'm2', kind: 'fact', text: 'Ari heard the password.' }, () => 'note', 2);
assert.strictEqual(Sync.validate([chat])[0], chat);

const entry = { id: 'memory-a', fromId: 'm1', throughId: 'm2', previousThroughId: null, format: 'incremental-v2', text: 'Ari privately heard the password.' };
chat = Lanes.commitMemoryView(chat, ak, { ...chat, memories: [entry] });
assert.strictEqual(Sync.validate([chat])[0], chat);
assert.strictEqual(Sync.validate([{ ...chat, participants: [a], activeSpeakerKey: ak }]).length, 1, 'removed historical audience remains valid');
const staleSource = { ...chat, messages: chat.messages.map(m => m.id === 'm2' ? { ...m, content: 'Ari learned a different password.' } : m) };
assert.strictEqual(Sync.validate([staleSource])[0], staleSource, 'edited sources do not destructively remove stale notes or memories');
assert.strictEqual(Ledger.active(staleSource, null, ak).length, 0);
assert.strictEqual(Lanes.contextFor(staleSource, ak).memoryChat.memories.length, 0);

for (const invalid of [
  { ...chat, knowledgeLanes: false },
  { ...chat, knowledgeLanes: 'yes' },
  { ...chat, messages: [first, { ...secret, audience: [] }] },
  { ...chat, messages: [first, { ...secret, audience: [ak, ak] }] },
  { ...chat, messages: [first, { ...secret, audience: ['not-a-key'] }] },
  { ...chat, messages: [first, { ...secret, audience: [JSON.stringify(['x', '']) + ' '] }] },
  { ...chat, knowledgeLaneMemories: { [ak]: [{ ...chat.knowledgeLaneMemories[ak][0], laneSourceDigest: 'forged' }] } },
  { ...chat, knowledgeLaneMemories: { [ak]: [{ ...chat.knowledgeLaneMemories[ak][0], laneSourceIds: ['m2', 'm2'] }] } },
  { ...chat, knowledgeLaneMemories: { [ak]: [{ ...chat.knowledgeLaneMemories[ak][0], laneSourceIds: ['m1'] }] } },
  { ...chat, storyLedger: [{ ...chat.storyLedger[0], sourceDigest: 'forged' }] },
  { ...chat, storyLedger: [chat.storyLedger[0], chat.storyLedger[0]] },
  { ...chat, storyLedger: [{ ...chat.storyLedger[0], text: 'x'.repeat(401) }] }
]) assert.throws(() => Sync.validate([invalid]), /Invalid|cannot be made shared/);

assert.throws(() => Sync.validate([{ id: 'solo', messages: [{ ...first, audience: [ak] }] }]), /Invalid group scene data/);
assert.throws(() => Sync.validate([{ id: 'solo', messages: [first], storyLedger: [] }]), /Invalid group scene data/);
assert.strictEqual(Sync.validate([copy({ id: 'legacy', messages: [first] })]).length, 1, 'legacy solo chats remain readable');
console.log('PASS: sync and restore validate scoped knowledge and source-linked ledger without discarding stale history');
