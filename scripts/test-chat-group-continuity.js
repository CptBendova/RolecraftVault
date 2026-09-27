// Execute the shipped assembler and native payload validator without provider calls.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const window = {
  storage: {}, crypto: { randomUUID: crypto.randomUUID },
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) },
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'app/chat.js'), 'utf8'), {
  window, document: { createElement: () => ({}), body: { appendChild() {} } },
});
const I = window.__rcvChatInternals;
const plain = value => JSON.parse(JSON.stringify(value));
const { validatePayload } = require('../app/openrouter');
const library = {
  chars: [
    { id: 'a', name: 'Ari', tagline: 'ARI_REFERENCE_FACT', story: 'ARI_STATIC_PROFILE', personality: 'A patient navigator.',
      scenario: 'ARI_OPENING_AT_INN', exampleMessage: 'ARI_EXAMPLE_GREETING',
      systemPrompt: 'ARI_ROLE_COMMAND', alwaysActiveSystemPrompt: 'ARI_ALWAYS_COMMAND',
      creatorMemo: 'PRIVATE_ARI_MEMO' },
    { id: 'b', name: 'Bea', story: 'BEA_BASE_PROFILE', variants: [
      { id: 'night', name: 'Night watch', tagline: 'BEA_NIGHT_REFERENCE', story: 'BEA_NIGHT_PROFILE',
        scenario: 'BEA_UNRELATED_FIRST_MEETING_IN_DESERT', exampleMessage: 'BEA_HELLO_STRANGER_EXAMPLE',
        systemPrompt: 'BEA_ROLE_COMMAND', alwaysActiveSystemPrompt: 'BEA_ALWAYS_COMMAND' },
    ], creatorMemo: 'PRIVATE_BEA_MEMO' },
  ],
  personas: [{ id: 'p', name: 'Robin', description: 'ROBIN_PERSONA', creatorMemo: 'PRIVATE_PERSONA_MEMO' }],
  lore: [],
};
const messages = Array.from({ length: 18 }, (_, i) => ({
  id: 'm' + i, parentId: i ? 'm' + (i - 1) : null,
  role: i % 2 ? 'assistant' : 'user',
  content: 'Established event ' + i + (i === 17 ? ': Ari asks Bea about their recovered compass.' : ' at the mountain observatory.'),
}));
const source = {
  id: 'story', title: 'Shared scene', characterId: 'a', personaId: 'p', model: 'fixture/group',
  contextTokens: 64000, maxTokens: 600, messages, leafId: 'm17',
  alwaysActivePrompt: 'SHARED_SUPER_PROMPT', memoryPins: 'SHARED_PINNED_FACT',
};
const bea = { characterId: 'b', variantId: 'night' };
const ari = { characterId: 'a', variantId: '' };
const originalSource = JSON.stringify(source), originalLibrary = JSON.stringify(library);
const joined = I.changeParticipants(source, library, 'add', bea);

function handoff(request, expectedName) {
  const last = request.messages.at(-1);
  assert.strictEqual(last.role, 'user', 'the request must not end with another character\'s assistant prefill');
  assert(last.content.startsWith('[Roleplay direction:'), 'handoff is explicitly an instruction, not invented user dialogue');
  assert(last.content.includes(expectedName), 'handoff names the selected speaker');
  assert(/current scene/i.test(last.content), 'handoff continues the existing scene');
  assert(/latest turn/i.test(last.content), 'handoff answers the latest turn, not only the last user turn');
}

function exactBudget(request, historyCount) {
  const estimated = request.messages.reduce((sum, message) => sum + I.tokenEstimate(message.content), 0);
  assert.strictEqual(request.estimatedTokens, estimated, 'handoff is included in the displayed/request input budget');
  assert.strictEqual(request.permanentTokens + request.temporaryTokens, estimated);
  assert.strictEqual(request.messages.length - 2, historyCount, 'only system + actual history + handoff are sent');
  assert.strictEqual(request.untrimmedTokens, estimated, 'untrimmed budget includes the handoff too when no history is omitted');
  assert(!request.error, request.error);
  const native = JSON.parse(validatePayload({ model: 'fixture/group', messages: request.messages, max_tokens: request.limits.reply }));
  assert.deepStrictEqual(native.messages, plain(request.messages), 'native transport preserves the assembled context and handoff');
}

assert.strictEqual(joined.messages, source.messages, 'adding a speaker preserves immutable transcript identity');
assert.strictEqual(joined.leafId, source.leafId, 'adding a speaker keeps the active branch');
const uncompressed = I.assemble(joined, library);
const initialSystem = uncompressed.messages[0].content;
for (const seed of ['BEA_UNRELATED_FIRST_MEETING_IN_DESERT', 'BEA_HELLO_STRANGER_EXAMPLE', 'ARI_OPENING_AT_INN', 'ARI_EXAMPLE_GREETING']) {
  assert(!initialSystem.includes(seed), 'an established group story must not restart from a character opening: ' + seed);
}
for (const value of ['SELECTED SPEAKER', 'REFERENCE CHARACTER', 'BEA_NIGHT_PROFILE', 'ARI_REFERENCE_FACT', 'BEA_ROLE_COMMAND', 'BEA_ALWAYS_COMMAND', 'SHARED_SUPER_PROMPT', 'SHARED_PINNED_FACT', 'ROBIN_PERSONA']) {
  assert(initialSystem.includes(value), 'selected instructions and active cast facts must remain: ' + value);
}
assert(!initialSystem.includes('ARI_STATIC_PROFILE'), 'nonselected Ari contributes compact factual reference only');
assert(!initialSystem.includes('ARI_ROLE_COMMAND') && !initialSystem.includes('ARI_ALWAYS_COMMAND'), 'nonselected character commands cannot override the selected speaker');
assert(!initialSystem.includes('BEA_BASE_PROFILE'), 'selected variant retains its own profile');
assert(!JSON.stringify(uncompressed.messages).includes('PRIVATE_'), 'creator memos never enter context');
assert(initialSystem.includes('Ari'), 'legacy memory origin retains the original speaker identity');
handoff(uncompressed, 'Bea (Night watch)');
exactBudget(uncompressed, messages.length);
assert.strictEqual(uncompressed.messages.at(-2).content, '[Speaker: Ari]\n' + messages.at(-1).content, 'Continue keeps the previous character turn verbatim before the handoff');

const memory = { id: 'memory', throughId: 'm7', text: 'ORIGINAL_SHARED_MEMORY: Robin and Ari recovered the compass before reaching the observatory.', createdAt: 1 };
const compactedSource = { ...source, memories: [memory] };
const compacted = I.changeParticipants(compactedSource, library, 'add', bea);
assert.strictEqual(compacted.memories, compactedSource.memories, 'joining never replaces earlier memories');
let request = I.assemble(compacted, library);
assert.strictEqual(request.memory, memory, 'the same valid ancestry checkpoint is selected for the new speaker');
assert.strictEqual(request.compacted, 8);
assert(request.messages[0].content.includes(memory.text), 'the full previous memory is sent to the new speaker');
assert.deepStrictEqual(plain(request.messages.slice(1, -1)).map(m => m.content), messages.slice(8).map(m => (m.role === 'assistant' ? '[Speaker: Ari]\n' : '[User-controlled persona: Robin]\n') + m.content), 'every post-checkpoint turn stays in order, not just five messages');
handoff(request, 'Bea (Night watch)');
exactBudget(request, 10);

const nextUser = { id: 'new-user', role: 'user', content: 'Bea, what do you think of our recovered compass?' };
const sendRequest = I.assemble(compacted, library, nextUser);
assert.strictEqual(sendRequest.messages.at(-2).content, '[User-controlled persona: Robin]\n' + nextUser.content, 'explicit Send labels the user while preserving the actual latest turn verbatim');
handoff(sendRequest, 'Bea (Night watch)');
exactBudget(sendRequest, 11);

const selectedAgain = I.changeParticipants(compacted, library, 'select', ari);
request = I.assemble(selectedAgain, library);
assert.strictEqual(selectedAgain.memories, compacted.memories);
assert.strictEqual(selectedAgain.messages, compacted.messages);
assert(request.messages[0].content.includes(memory.text));
assert(request.messages[0].content.includes('ARI_ROLE_COMMAND') && !request.messages[0].content.includes('BEA_ROLE_COMMAND'), 'reselection switches only the controlling character instructions');
assert(request.messages[0].content.includes('BEA_NIGHT_REFERENCE'), 'other active cast identity facts remain available');
assert(!request.messages[0].content.includes('BEA_NIGHT_PROFILE'), 'nonselected Bea does not send her full profile');
handoff(request, 'Ari');
exactBudget(request, 10);

const removed = I.changeParticipants(compacted, library, 'remove', ari);
request = I.assemble(removed, library);
assert.strictEqual(removed.memories, compacted.memories);
assert.strictEqual(removed.messages, compacted.messages);
assert(request.messages[0].content.includes(memory.text));
assert(!request.messages[0].content.includes('ARI_STATIC_PROFILE'), 'removed profiles are excluded without deleting their history');
assert(request.messages[1].role === 'user' && request.messages[2].content.startsWith('[Speaker: Ari]'), 'historical attribution survives original speaker removal');
handoff(request, 'Bea (Night watch)');
const fallback = I.assemble(removed, { chars: [], personas: [], lore: [] });
assert(fallback.messages[0].content.includes(memory.text));
assert(fallback.messages[0].content.includes('BEA_NIGHT_PROFILE'));
assert(!fallback.messages[0].content.includes('ARI_STATIC_PROFILE'));
handoff(fallback, 'Bea (Night watch)');

const plan = I.memoryPlan(compacted, library, [], true);
const worker = JSON.parse(plan.messages[1].content);
assert.strictEqual(worker.previousMemory, memory.text);
assert.strictEqual(plan.start, 8, 'next compaction resumes after the shared checkpoint');
assert.strictEqual(plan.count, 5, 'five actual recent messages stay verbatim');
assert.strictEqual(worker.olderMessages.length, 5);
assert(worker.olderMessages.some(m => m.content.startsWith('[Speaker: Ari]')));
assert(!JSON.stringify(plan.messages).includes('[Roleplay direction:'), 'synthetic handoff never enters compaction history');
assert(!JSON.stringify(plan.messages).includes('BEA_ROLE_COMMAND'), 'roleplay commands remain outside factual memory worker');
assert.deepStrictEqual(plain(I.memoryHistory(compacted)), messages, 'memory source remains the complete original transcript');

const sibling = { ...compacted, messages: compacted.messages.concat([{ id: 'sibling', parentId: 'm3', role: 'user', content: 'A different timeline.' }]), leafId: 'sibling' };
assert(!I.assemble(sibling, library).messages[0].content.includes(memory.text), 'speaker selection must not leak a future checkpoint into sibling history');
const fork = I.forkConversation(compacted, compacted.leafId);
assert.strictEqual(I.assemble(fork, library).memory.text, memory.text, 'forked checkpoints preserve shared story memory');

// Reserve one request slot for handoff as well as one for system instructions.
const largeMessages = Array.from({ length: 2050 }, (_, i) => ({ id: 'large-' + i, parentId: i ? 'large-' + (i - 1) : null, role: i % 2 ? 'assistant' : 'user', content: 'Event ' + i }));
const large = { ...joined, autoMemory: false, contextTokens: 1000000, messages: largeMessages, leafId: 'large-2049' };
const bounded = I.assemble(large, library);
assert.strictEqual(bounded.messages.length, 2048, 'native maximum includes system and final handoff');
assert.strictEqual(bounded.trimmed, 4, 'only the excess historical messages count as omitted');
assert.strictEqual(bounded.messages.at(-2).content, '[Speaker: Ari]\nEvent 2049', 'latest actual turn wins over oldest excess messages');
handoff(bounded, 'Bea (Night watch)');
assert.strictEqual(bounded.estimatedTokens, bounded.messages.reduce((sum, m) => sum + I.tokenEstimate(m.content), 0));
assert.strictEqual(bounded.untrimmedTokens - bounded.estimatedTokens, largeMessages.slice(0, 4).reduce((sum, m) => sum + I.tokenEstimate((m.role === 'assistant' ? '[Speaker: Ari]\n' : '[User-controlled persona: Robin]\n') + m.content), 0));
assert.doesNotThrow(() => validatePayload({ model: 'fixture/group', messages: bounded.messages }));

const legacy = I.assemble(source, library);
assert(legacy.messages[0].content.includes('ARI_OPENING_AT_INN'), 'existing single-character opening behavior remains unchanged');
assert.strictEqual(legacy.messages.at(-1).content, messages.at(-1).content, 'legacy single-character transcript remains unwrapped');
assert.strictEqual(JSON.stringify(source), originalSource);
assert.strictEqual(JSON.stringify(library), originalLibrary);
console.log('PASS: group handoff, selected-only commands, existing-scene seeds, complete shared memory/history, branch preservation and counted native request limits');
