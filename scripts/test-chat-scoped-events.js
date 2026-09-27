// Execute the shipped request builder and sync validator; no provider calls.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { validate } = require('../app/chat-sync-core');
const root = path.join(__dirname, '..');
const window = {
  storage: {},
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) },
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'app/chat.js'), 'utf8'), { window, document: { createElement: () => ({}), body: { appendChild() {} } } });
const I = window.__rcvChatInternals;
const a = { characterId: 'a', variantId: '' }, b = { characterId: 'b', variantId: '' };
const ak = I.participantKey(a), bk = I.participantKey(b);
const library = {
  chars: [
    { id: 'a', name: 'Ari', story: 'Ari profile', lorebooks: ['A-book'] },
    { id: 'b', name: 'Bea', story: 'Bea profile', lorebooks: ['B-book'] },
  ], personas: [{ id: 'p', name: 'Robin', lorebooks: ['P-book'] }], lore: [
    { id: 'la', world: 'A-book', title: 'A lore', content: 'A_LORE_ONLY', triggers: ['event'] },
    { id: 'lb', world: 'B-book', title: 'B lore', content: 'B_LORE_ONLY', triggers: ['event'] },
    { id: 'lp', world: 'P-book', title: 'Persona lore', content: 'PERSONA_LORE', triggers: ['event'] },
    { id: 'lc', world: 'C-book', title: 'Chat lore', content: 'CHAT_LORE', triggers: ['event'] },
    { id: 'li', world: 'P-book', title: 'Inactive lore', content: 'NO_TRIGGER_LORE', triggers: [] },
  ],
};
const messages = Array.from({ length: 16 }, (_, i) => ({ id: 'm' + i, parentId: i ? 'm' + (i - 1) : null, role: i % 2 ? 'assistant' : 'user', content: 'Shared event ' + i }));
const chat = {
  id: 'scene', title: 'Group', characterId: 'a', personaId: 'p', lorebooks: ['C-book'], participants: [a, b], activeSpeakerKey: ak,
  originalSpeaker: { characterId: 'a', variantId: '', name: 'Ari' },
  model: 'fixture', contextTokens: 64000, maxTokens: 600, autoMemory: true,
  messages, leafId: 'm15', groupLoreScope: 'speaker',
  sceneEvents: [
    { id: 'ea', text: 'ARI_PRIVATE_EVENT', audience: [ak], createdAt: 1, kind: 'witnessed', sourceMessageId: 'm14' },
    { id: 'eb', text: 'BEA_PRIVATE_EVENT', audience: [bk], createdAt: 2, kind: 'told', sourceMessageId: 'm15' },
  ],
};
assert.doesNotThrow(() => validate([chat]));
let request = I.assemble(chat, library);
assert(request.messages[0].content.includes('ARI_PRIVATE_EVENT'));
assert(request.messages[0].content.includes('Witnessed: ARI_PRIVATE_EVENT'));
assert(!JSON.stringify(request.messages).includes('BEA_PRIVATE_EVENT'));
assert(request.messages[0].content.includes('A_LORE_ONLY'));
assert(!JSON.stringify(request.messages).includes('B_LORE_ONLY'));
assert(request.messages[0].content.includes('PERSONA_LORE') && request.messages[0].content.includes('CHAT_LORE'), 'persona and chat-attached books remain available');
assert(!JSON.stringify(request.messages).includes('NO_TRIGGER_LORE'), 'attached entries without triggers stay inactive');
const bea = I.changeParticipants(chat, library, 'select', b);
request = I.assemble(bea, library);
assert(request.messages[0].content.includes('BEA_PRIVATE_EVENT'));
assert(request.messages[0].content.includes('Was told: BEA_PRIVATE_EVENT'));
assert(!JSON.stringify(request.messages).includes('ARI_PRIVATE_EVENT'));
assert(request.messages[0].content.includes('B_LORE_ONLY'));
assert(!JSON.stringify(request.messages).includes('A_LORE_ONLY'));
const plan = I.memoryPlan(bea, library, [], true);
assert(plan && !JSON.stringify(plan.messages).includes('ARI_PRIVATE_EVENT') && !JSON.stringify(plan.messages).includes('BEA_PRIVATE_EVENT'), 'private ledger data must not enter shared memory');
const shared = I.assemble({ ...bea, groupLoreScope: 'shared' }, library);
assert(shared.messages[0].content.includes('A_LORE_ONLY') && shared.messages[0].content.includes('B_LORE_ONLY'), 'existing all-cast lore behavior remains the default');
const legacy = I.assemble({ ...bea, groupLoreScope: undefined }, library);
assert(legacy.messages[0].content.includes('A_LORE_ONLY') && legacy.messages[0].content.includes('B_LORE_ONLY'), 'older groups without a saved scope retain all-cast behavior');
assert.throws(() => validate([{ ...chat, sceneEvents: [{ ...chat.sceneEvents[0], audience: ['not-a-character-key'] }] }]), /private scene event/);
assert.throws(() => validate([{ ...chat, sceneEvents: [{ ...chat.sceneEvents[0], text: 'x'.repeat(601) }] }]), /private scene event/);
assert.throws(() => validate([{ ...chat, sceneEvents: [{ ...chat.sceneEvents[0], kind: 'secretly omniscient' }] }]), /private scene event/);
assert.throws(() => validate([{ ...chat, sceneEvents: [{ ...chat.sceneEvents[0], sourceMessageId: 'x'.repeat(501) }] }]), /private scene event/);
assert.throws(() => validate([{ ...chat, groupLoreScope: 'unknown' }]), /lorebook scope/);
console.log('PASS: private scene events stay speaker-scoped and out of shared memory; group lore scope is validated');
