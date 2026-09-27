// Payload regression for changing the speaking character in an ongoing battle.
// This executes shipped helpers, not a copy of the assembler, and makes no paid
// requests. It verifies what the model receives, not how a live model responds.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const baselineAt = process.argv.indexOf('--baseline-ref');
const source = baselineAt < 0
  ? fs.readFileSync(path.join(root, 'app/chat.js'), 'utf8')
  : execFileSync('git', ['show', process.argv[baselineAt + 1] + ':app/chat.js'], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const window = {
  storage: {}, crypto: { randomUUID: crypto.randomUUID },
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) },
};
vm.runInNewContext(source, { window, document: { createElement: () => ({}), body: { appendChild() {} } } });
const I = window.__rcvChatInternals;
const plain = value => JSON.parse(JSON.stringify(value));
const { validatePayload } = require('../app/openrouter');
const ari = { characterId: 'a', variantId: '' };
const bea = { characterId: 'b', variantId: '' };
const scout = { characterId: 'b', variantId: 'scout' };
const library = {
  chars: [
    { id: 'a', name: 'Ari', story: 'ARI_STATIC_PROFILE', systemPrompt: 'ARI_ROLE_COMMAND' },
    { id: 'b', name: 'Bea', story: 'BEA_BASE_PROFILE', personality: 'Observant and cautious.',
      scenario: 'FIRST_MEETING_IN_A_DIFFERENT_CITY', firstMessage: 'HELLO_UNKNOWN_TRAVELLER',
      exampleMessage: 'UNRELATED_GREETING_EXAMPLE', systemPrompt: 'BEA_ROLE_COMMAND',
      variants: [{ id: 'scout', name: 'Scout', story: 'BEA_SCOUT_PROFILE' }] },
  ], personas: [{ id: 'p', name: 'Robin', description: 'The user controls Robin.' }], lore: [],
};
const events = [
  'We left the village together.', 'Ari promised Robin protection.',
  'I accepted the promise.', 'Ari secured the west gate.',
  'We moved to the old bridge.', 'Ari prepared to defend the bridge.',
  'The enemy reaches the bridge; I stand beside Ari.',
  'Bea watches the entire battle from the bridge parapet. Ari calls out the enemy position.',
  'My left arm is wounded. Bea can see the torn sleeve.',
  'Ari breaks the enemy spear; its pieces fall into the river below Bea.',
  'I point out the tower beginning to collapse.',
  'The tower collapses beside the bridge. Bea ducks the falling stone.',
  'I drop my damaged sword and take the shield.',
  'Ari defeats the last attacker. The battle is over, and Bea sees the shield crack.',
  'I ask Ari whether everyone survived.',
  'Ari confirms that Bea and the villagers are safe. Smoke still rises from the tower.',
  'I turn toward Bea, keeping pressure on my wounded arm.',
  'Ari steps aside beside the broken spear, leaving Robin facing Bea on the battle-damaged bridge.',
];
const messages = events.map((content, i) => ({ id: 'm' + i, parentId: i ? 'm' + (i - 1) : null, role: i % 2 ? 'assistant' : 'user', content }));
const earlier = { id: 'memory-1', throughId: 'm1', text: 'Earlier history: Ari promised to protect Robin.', createdAt: 1 };
const cumulative = { id: 'memory-2', throughId: 'm5', text: earlier.text + '\n\nLater history: Robin accepted; Ari secured the west gate and they moved to the bridge.', createdAt: 2 };
const original = { id: 'battle', title: 'The bridge', characterId: 'a', personaId: 'p', model: 'fixture/observer', contextTokens: 64000, maxTokens: 800, messages, leafId: 'm17', memories: [earlier, cumulative], memoryPins: 'Robin and Ari are already allies.' };
const untouched = JSON.stringify(original), untouchedLibrary = JSON.stringify(library);
const joined = I.changeParticipants(original, library, 'add', bea);

function budget(request, count) {
  assert.strictEqual(request.error, '');
  assert.strictEqual(request.trimmed, 0, 'the generous fixture budget must retain every post-checkpoint message');
  assert.strictEqual(request.messages.length, count + 2, 'one system message and one request-only handoff surround the real transcript');
  const tokens = request.messages.reduce((sum, message) => sum + I.tokenEstimate(message.content), 0);
  assert.strictEqual(request.estimatedTokens, tokens, 'actor/persona labels must be counted in the request budget');
  assert.strictEqual(request.untrimmedTokens, tokens);
  assert.strictEqual(request.permanentTokens + request.temporaryTokens, tokens);
  const native = JSON.parse(validatePayload({ model: original.model, messages: request.messages, max_tokens: request.limits.reply }));
  assert.deepStrictEqual(native.messages, plain(request.messages), 'native validation must preserve attributed scene input exactly');
}

function battleContext(request, expectedTurns) {
  assert.strictEqual(request.memory, cumulative, 'switching speakers must retain the cumulative checkpoint, including the first compaction');
  assert.strictEqual(request.compacted, 6);
  assert(request.messages[0].content.includes(cumulative.text), 'the entire saved memory must reach the new speaker verbatim');
  assert.deepStrictEqual(plain(request.messages.slice(1, 1 + expectedTurns.length)).map(m => m.content), expectedTurns.map(m => (m.role === 'assistant' ? '[Speaker: Ari]\n' : '[User-controlled persona: Robin]\n') + m.content), 'all recent battle facts must reach the new speaker in order, not merely the last five messages');
  // This is the 1.292 regression: Ari's turns used to masquerade as the newly
  // selected Bea's own assistant output even though they had a text label.
  for (const turn of request.messages.slice(1, 1 + expectedTurns.length)) assert.strictEqual(turn.role, 'user', 'a different character\'s historical turn must be attributed scene input, not the selected character\'s assistant output');
  const system = request.messages[0].content;
  for (const [rule, meaning] of [
    [/not an arrival in the story/i, 'joining the app cast is not a fictional arrival'],
    [/first generated reply is not automatically a first meeting/i, 'first generated reply does not erase existing acquaintance'],
    [/present or watching[\s\S]*observable actions, spoken words and outcomes/i, 'an established observer knows the visible battle events'],
    [/do not give them access to[\s\S]*private thoughts or off-scene secrets/i, 'shared context does not make the character omniscient'],
    [/do not invent presence or familiarity/i, 'absence of evidence does not invent the newcomer into earlier scenes'],
    [/current story events and established relationships update a profile's initial circumstances/i, 'profile starting circumstances do not rewind the story'],
    [/other characters' turns arrive as user-role scene input, not the user's speech or your own past replies/i, 'API roles do not transfer ownership of another actor\'s speech'],
  ]) assert(rule.test(system), meaning);
  for (const seed of ['FIRST_MEETING_IN_A_DIFFERENT_CITY', 'HELLO_UNKNOWN_TRAVELLER', 'UNRELATED_GREETING_EXAMPLE']) assert(!system.includes(seed), 'an established battle must not receive an unrelated newcomer opening');
  assert(!system.includes('ARI_ROLE_COMMAND'), 'only the selected character supplies role commands');
  assert(system.includes('BEA_ROLE_COMMAND'));
  const handoff = request.messages.at(-1);
  assert.strictEqual(handoff.role, 'user');
  assert(handoff.content.startsWith('[Roleplay direction:') && handoff.content.includes('Bea'));
}

const recent = messages.slice(6);
const continued = I.assemble(joined, library);
// Assert role before labels to make the baseline failure identify the key fault.
assert.strictEqual(continued.messages[2].role, 'user', '1.292 regression: the previous character\'s reply is not the new character\'s assistant history');
battleContext(continued, recent);
budget(continued, recent.length);
assert.strictEqual(joined.messages, original.messages);
assert.strictEqual(joined.memories, original.memories);
assert.strictEqual(joined.leafId, original.leafId);
const uncompacted = I.assemble({ ...joined, memories: [] }, library);
assert.strictEqual(uncompacted.memory, null);
assert.strictEqual(uncompacted.compacted, 0);
assert.deepStrictEqual(plain(uncompacted.messages.slice(1, -1)), messages.map(m => ({ role: 'user', content: (m.role === 'assistant' ? '[Speaker: Ari]\n' : '[User-controlled persona: Robin]\n') + m.content })), 'before compaction the observer receives the complete raw story, not only the latest exchange');
budget(uncompacted, messages.length);

// Send preserves the true user's identity instead of confusing their dialogue
// with the other character turns, which now also use the provider's user role.
const userTurn = { id: 'u18', parentId: joined.leafId, role: 'user', content: 'Bea, you saw what happened. Can you help with my wounded arm?' };
const sent = I.assemble(joined, library, userTurn);
battleContext(sent, recent);
assert.strictEqual(sent.messages.at(-2).content, '[User-controlled persona: Robin]\n' + userTurn.content);
assert.strictEqual(sent.messages.at(-2).role, 'user');
budget(sent, recent.length + 1);

// Pending replies are excluded in the real Send/Continue/regenerate assembly.
const savedUser = { ...joined, messages: joined.messages.concat(userTurn), leafId: userTurn.id };
const pending = { id: 'pending', parentId: userTurn.id, role: 'assistant', content: '', pending: true, speaker: { ...bea, name: 'Bea' } };
const inFlight = { ...savedUser, messages: savedUser.messages.concat(pending), leafId: pending.id };
assert.deepStrictEqual(plain(I.assemble(inFlight, library).messages), plain(sent.messages), 'pending generation must not erase, duplicate or change the latest battle context');

const reply = { id: 'b19', parentId: userTurn.id, role: 'assistant', content: 'I saw the tower fall and your injury; let me inspect the bandage.', speaker: { ...bea, name: 'Bea' } };
const answered = { ...savedUser, messages: savedUser.messages.concat(reply), leafId: reply.id };
const continuedAsBea = I.assemble(answered, library);
assert.strictEqual(continuedAsBea.messages.at(-2).role, 'assistant', 'the selected character\'s own historical response retains assistant role');
assert.strictEqual(continuedAsBea.messages.at(-2).content, '[Speaker: Bea]\n' + reply.content);
budget(continuedAsBea, recent.length + 2);
const regeneration = { ...answered, messages: answered.messages.concat({ ...pending, id: 'regen' }), leafId: 'regen' };
assert.deepStrictEqual(plain(I.assemble(regeneration, library).messages), plain(sent.messages), 'regenerating Bea\'s reply must use its original parent path, excluding the superseded response');
assert.strictEqual(answered.messages.at(-1), reply, 'regeneration assembly must not rewrite the saved sibling response');

// A variant is a distinct speaking identity even when its character ID matches.
const switchedVariant = I.changeParticipants(answered, library, 'add', scout);
let variantRequest = I.assemble(switchedVariant, library);
assert.strictEqual(variantRequest.messages.at(-2).role, 'user', 'Default Bea is not the Scout variant\'s own assistant history');
const scoutReply = { id: 'scout20', parentId: reply.id, role: 'assistant', content: 'I watched from the parapet and can guide you through the rubble.', speaker: { ...scout, name: 'Bea', activeVariantName: 'Scout' } };
const withScout = { ...switchedVariant, messages: switchedVariant.messages.concat(scoutReply), leafId: scoutReply.id };
variantRequest = I.assemble(withScout, library);
assert.strictEqual(variantRequest.messages.at(-2).role, 'assistant');
assert.strictEqual(variantRequest.messages.at(-3).role, 'user');
assert.strictEqual(variantRequest.messages.at(-2).content, '[Speaker: Bea (Scout)]\n' + scoutReply.content);
budget(variantRequest, recent.length + 3);
const backToDefault = I.assemble(I.changeParticipants(withScout, library, 'select', bea), library);
assert.strictEqual(backToDefault.messages.at(-2).role, 'user');
assert.strictEqual(backToDefault.messages.at(-3).role, 'assistant');

const backToAri = I.assemble(I.changeParticipants(answered, library, 'select', ari), library);
assert.strictEqual(backToAri.messages[2].role, 'assistant', 'legacy unlabeled Ari turns become Ari\'s own output again when he is selected');
assert.strictEqual(backToAri.messages.at(-2).role, 'user', 'Bea\'s reply stays visible as another actor\'s contribution');
const removed = I.changeParticipants(joined, library, 'remove', ari);
const removedRequest = I.assemble(removed, library);
battleContext(removedRequest, recent);
assert(!removedRequest.messages[0].content.includes('ARI_STATIC_PROFILE'));
assert.strictEqual(removed.messages, original.messages);
const noPersona = I.assemble({ ...removed, personaId: null, castSnapshot: { ...removed.castSnapshot, persona: null } }, library);
assert.strictEqual(noPersona.messages[1].content, '[User-controlled persona: the user]\n' + recent[0].content);

// Provider role projection is intentionally absent from stored transcripts and
// memory summaries. Those keep the factual actor labels plus original roles.
const plan = I.memoryPlan(joined, library, [], true);
const worker = JSON.parse(plan.messages[1].content);
assert.strictEqual(worker.previousMemory, cumulative.text);
assert.deepStrictEqual(worker.olderMessages, messages.slice(plan.start, plan.start + plan.count).map(m => ({ role: m.role, content: (m.role === 'assistant' ? '[Speaker: Ari]\n' : '') + m.content })));
assert(worker.olderMessages.some(m => m.role === 'assistant'));
assert(!JSON.stringify(worker).includes('[User-controlled persona:'));
assert(!JSON.stringify(worker).includes('[Roleplay direction:'));
assert.deepStrictEqual(plain(I.memoryHistory(joined)), messages);
assert.strictEqual(JSON.stringify(original), untouched);
assert.strictEqual(JSON.stringify(library), untouchedLibrary);

const legacyRequest = I.assemble(original, library);
assert.deepStrictEqual(plain(legacyRequest.messages.slice(1)), recent.map(m => ({ role: m.role, content: m.content })), 'ordinary single-character chats retain their existing provider roles and text');
console.log('PASS: battle observer receives cumulative memory and every recent turn with distinct actor/persona roles; Send, Continue, regenerate, variants, removal, original memory inputs and token accounting remain intact');
