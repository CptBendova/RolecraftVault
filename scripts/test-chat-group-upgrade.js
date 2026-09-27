// Execute the shipped group context helpers without a provider request.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const sync = require('../app/chat-sync-core');
let providerStarts = 0;
const window = {
  storage: {},
  RolecraftChatSync: sync,
  openRouter: { start() { providerStarts++; throw new Error('Context assembly must not contact the provider'); } },
  crypto: { randomUUID: crypto.randomUUID },
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) },
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'app/chat.js'), 'utf8'), {
  window, document: { createElement: () => ({}), body: { appendChild() {} } },
}, { filename: 'app/chat.js' });
const I = window.__rcvChatInternals;
const plain = value => JSON.parse(JSON.stringify(value));

const ari = { characterId: 'ari', variantId: '' };
const bea = { characterId: 'bea', variantId: '' };
const cyra = { characterId: 'cyra', variantId: '' };
const library = {
  chars: [
    { id: 'ari', name: 'Ari', tagline: 'ARI_TAGLINE', story: 'ARI_FULL_STORY',
      personality: 'ARI_FULL_PERSONALITY', sections: [{ title: 'History', content: 'ARI_FULL_SECTION' }],
      systemPrompt: 'ARI_SELECTED_SYSTEM', alwaysActiveSystemPrompt: 'ARI_SELECTED_ALWAYS' },
    { id: 'bea', name: 'Bea', tagline: 'BEA_REFERENCE_TAGLINE', age: '34', pronouns: 'she/her',
      story: 'BEA_LONG_STORY_START ' + 'Detailed biography. '.repeat(180) + ' BEA_LONG_STORY_TAIL',
      personality: 'BEA_LONG_PERSONALITY ' + 'Private voice guidance. '.repeat(100) + ' BEA_PERSONALITY_TAIL',
      sections: [{ title: 'Private instructions', content: 'BEA_FULL_SECTION_TAIL' }],
      systemPrompt: 'BEA_SYSTEM_MUST_NOT_CONTROL_ARI',
      alwaysActiveSystemPrompt: 'BEA_ALWAYS_MUST_NOT_CONTROL_ARI' },
    { id: 'cyra', name: 'Cyra', tagline: 'CYRA_REFERENCE_TAGLINE', story: 'CYRA_FULL_STORY_TAIL',
      systemPrompt: 'CYRA_SYSTEM_MUST_NOT_CONTROL_ARI' },
  ],
  personas: [{ id: 'player', name: 'Robin', description: 'ROBIN_PERSONA_REFERENCE' }],
  lore: [],
};
const messages = Array.from({ length: 14 }, (_, index) => ({
  id: 'm' + index,
  parentId: index ? 'm' + (index - 1) : null,
  role: index % 2 ? 'assistant' : 'user',
  content: 'Established shared event ' + index,
  ...(index === 11 ? { speaker: { characterId: 'bea', variantId: '', name: 'Bea' } } : {}),
}));
const legacy = {
  id: 'story', characterId: 'ari', personaId: 'player', model: 'fixture/group',
  contextTokens: 64000, maxTokens: 600, messages, leafId: 'm13',
  memories: [{ id: 'checkpoint', throughId: 'm5', text: 'SHARED_MEMORY_OF_EARLIER_EVENTS' }],
};
let group = I.changeParticipants(legacy, library, 'add', bea);
group = I.changeParticipants(group, library, 'add', cyra);
group = I.changeParticipants(group, library, 'select', ari);
const groupBefore = JSON.stringify(group);
const oldContext = I.assemble(group, library);

// Existing chats without scene metadata still retain shared ancestry and memory.
const reopenedLegacy = I.parseChats(JSON.stringify([group]))[0];
const oldReopenedContext = I.assemble(reopenedLegacy, library);
assert.strictEqual(oldReopenedContext.memory.text, 'SHARED_MEMORY_OF_EARLIER_EVENTS');
assert.deepStrictEqual(plain(oldReopenedContext.messages), plain(oldContext.messages));
assert(oldReopenedContext.messages.some(message => message.role === 'user' && message.content === '[Speaker: Bea]\nEstablished shared event 11'));

const scene = {
  ...group,
  sceneState: 'SCENE_STATE_THE_TOWER_COLLAPSED_AND_THE_BRIDGE_BURNED',
  castScene: {
    [I.participantKey(ari)]: { presence: 'present', knowledge: 'ARI_KNOWLEDGE_SAW_THE_BRIDGE_BURN' },
    [I.participantKey(bea)]: { presence: 'observing', knowledge: 'BEA_KNOWLEDGE_SAW_THE_GUARD_SIGNAL' },
    [I.participantKey(cyra)]: { presence: 'away', knowledge: 'CYRA_KNOWLEDGE_ONLY_THE_OLD_MAP' },
  },
};
const reopenedScene = I.parseChats(JSON.stringify([scene]))[0];
const context = I.assemble(reopenedScene, library);
assert(!context.error, context.error);
const system = context.messages[0].content;

// The reply actor keeps their full card; others supply bounded identity facts.
for (const marker of ['ARI_FULL_STORY', 'ARI_FULL_PERSONALITY', 'ARI_FULL_SECTION', 'ARI_SELECTED_SYSTEM', 'ARI_SELECTED_ALWAYS']) {
  assert(system.includes(marker), 'selected speaker lost ' + marker);
}
for (const marker of ['BEA_REFERENCE_TAGLINE', 'CYRA_REFERENCE_TAGLINE']) {
  assert(system.includes(marker), 'active reference character lost ' + marker);
}
for (const marker of ['BEA_LONG_STORY_TAIL', 'BEA_PERSONALITY_TAIL', 'BEA_FULL_SECTION_TAIL',
  'BEA_SYSTEM_MUST_NOT_CONTROL_ARI', 'BEA_ALWAYS_MUST_NOT_CONTROL_ARI',
  'CYRA_FULL_STORY_TAIL', 'CYRA_SYSTEM_MUST_NOT_CONTROL_ARI']) {
  assert(!system.includes(marker), 'nonselected cast detail should not crowd or control this reply: ' + marker);
}

// Shared scene state and every presence are visible. Private knowledge belongs
// only to the selected speaker, even though other active cast remain references.
assert(system.includes(scene.sceneState));
for (const [actor, presence] of [['Ari', 'present'], ['Bea', 'observing'], ['Cyra', 'away']]) {
  const pair = new RegExp(actor + '[\\s\\S]{0,150}' + presence + '|' + presence + '[\\s\\S]{0,150}' + actor, 'i');
  assert(pair.test(system), actor + ' must have an attributed ' + presence + ' presence');
}
assert(system.includes('ARI_KNOWLEDGE_SAW_THE_BRIDGE_BURN'));
assert(!JSON.stringify(context.messages).includes('BEA_KNOWLEDGE_SAW_THE_GUARD_SIGNAL'));
assert(!JSON.stringify(context.messages).includes('CYRA_KNOWLEDGE_ONLY_THE_OLD_MAP'));

const beaSelected = I.changeParticipants(reopenedScene, library, 'select', bea);
const beaContext = I.assemble(beaSelected, library);
assert(beaContext.messages[0].content.includes('BEA_LONG_STORY_TAIL'), 'selected Bea receives her full profile');
assert(beaContext.messages[0].content.includes('BEA_KNOWLEDGE_SAW_THE_GUARD_SIGNAL'));
assert(!JSON.stringify(beaContext.messages).includes('ARI_KNOWLEDGE_SAW_THE_BRIDGE_BURN'));
assert(!JSON.stringify(beaContext.messages).includes('CYRA_KNOWLEDGE_ONLY_THE_OLD_MAP'));
assert(!beaContext.messages[0].content.includes('ARI_SELECTED_SYSTEM'), 'Ari system instructions cannot control Bea');

// The separate factual memory worker uses the same selected/full versus
// reference/compact boundary. Scene knowledge is not an event to summarize.
const profiles = I.memoryProfiles(reopenedScene, library);
const ariProfile = profiles.characters.find(profile => profile.name === 'Ari');
const beaProfile = profiles.characters.find(profile => profile.name === 'Bea');
assert(ariProfile.details.includes('ARI_FULL_STORY'));
assert(ariProfile.details.includes('ARI_FULL_PERSONALITY'));
assert(ariProfile.details.includes('ARI_FULL_SECTION'));
assert(beaProfile.details.includes('BEA_REFERENCE_TAGLINE'));
for (const marker of ['BEA_LONG_STORY_TAIL', 'BEA_PERSONALITY_TAIL', 'BEA_FULL_SECTION_TAIL',
  'ARI_KNOWLEDGE_SAW_THE_BRIDGE_BURN', 'BEA_KNOWLEDGE_SAW_THE_GUARD_SIGNAL',
  'CYRA_KNOWLEDGE_ONLY_THE_OLD_MAP']) {
  assert(!JSON.stringify(profiles).includes(marker), 'memory worker must not receive ' + marker);
}
const beaProfiles = I.memoryProfiles(beaSelected, library);
assert(beaProfiles.characters.find(profile => profile.name === 'Bea').details.includes('BEA_LONG_STORY_TAIL'));
assert(!beaProfiles.characters.find(profile => profile.name === 'Ari').details.includes('ARI_FULL_STORY'));
const memoryRequest = I.memoryPlan(reopenedScene, library, [], true);
const worker = JSON.parse(memoryRequest.messages[1].content);
assert.deepStrictEqual(plain(worker.knownProfiles), plain(profiles), 'memory call uses the inspected compact references');

assert.strictEqual(context.memory.text, oldContext.memory.text, 'scene notes do not replace shared memory');
assert.deepStrictEqual(plain(context.messages.slice(1)), plain(oldContext.messages.slice(1)),
  'scene notes change the system context, not historical turns or the request count');
assert.strictEqual(providerStarts, 0, 'editing and inspecting scene context make no provider calls');
assert.strictEqual(JSON.stringify(group), groupBefore, 'assembling context never mutates the saved conversation');

// Removing someone stops sending their profile and scene notes, but keeps history.
const removed = I.changeParticipants(scene, library, 'remove', cyra);
const afterRemoval = I.assemble(removed, library);
assert(!afterRemoval.messages[0].content.includes('CYRA_REFERENCE_TAGLINE'));
assert(!afterRemoval.messages[0].content.includes('CYRA_KNOWLEDGE_ONLY_THE_OLD_MAP'));
assert.deepStrictEqual(plain(removed.messages), plain(scene.messages));

// New metadata is bounded and validated before a synced record can replace data.
for (const broken of [
  { ...scene, sceneState: 42 },
  { ...scene, sceneState: 'x'.repeat(100000) },
  { ...scene, castScene: [] },
  { ...scene, castScene: { [I.participantKey(bea)]: { presence: 'telepathic', knowledge: 'Wrong enum' } } },
  { ...scene, castScene: { [I.participantKey(bea)]: { presence: 'present', knowledge: 123 } } },
]) assert.throws(() => sync.validate([plain(broken)]), /Invalid|invalid|too large|long/i);

console.log('PASS: selected full profile, concise reference cast, speaker-private scene knowledge, shared presence/state, legacy history, unchanged request count and bounded sync metadata');
