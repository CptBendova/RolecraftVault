const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'chat.js'), 'utf8');
const h = (type, props, ...children) => ({ type, props: props || {}, children });
const window = {
  storage: {},
  React: { createElement: h, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) }
};
vm.runInNewContext(source.replace('  var host = document.createElement', '  window.testLoreInspector = LoreInspector;\n  var host = document.createElement'), {
  window, document: { createElement: () => ({}), body: { appendChild() {} } }
});
const I = window.__rcvChatInternals;
const partA = { characterId: 'a', variantId: '' }, partB = { characterId: 'b', variantId: '' };
const baseChat = {
  id: 'group', characterId: 'a', participants: [partA, partB], activeSpeakerKey: I.participantKey(partA),
  groupLoreScope: 'speaker', contextTokens: 8192, maxTokens: 500,
  messages: [
    { id: 'old', parentId: null, role: 'user', content: 'ancient elf' },
    { id: 'new', parentId: 'old', role: 'assistant', content: 'A current dark elf arrived.' }
  ], leafId: 'new'
};
const text = 'World details. '.repeat(100);
const library = {
  chars: [{ id: 'a', name: 'Ari', lorebooks: ['Forest'] }, { id: 'b', name: 'Bea', lorebooks: ['Other'] }],
  personas: [],
  lore: [
    { id: 'old', world: 'Forest', title: 'Old event', triggers: ['ancient'], content: 'OLD_' + text },
    { id: 'new', world: 'Forest', title: 'Current event', triggers: ['current'], content: 'NEW_' + text },
    { id: 'other', world: 'Other', title: 'Other book', triggers: ['current'], content: 'OTHER_' + text }
  ]
};
const original = JSON.stringify({ baseChat, library });
let context = I.assemble(baseChat, library);
assert(context.loreBudget > 0 && context.loreBudget <= 2048);
assert(context.loreBudgetUsed <= context.loreBudget, 'included lore must stay within its cap');
assert.deepStrictEqual(Array.from(context.lore, e => e.id), ['new'], 'the newest triggered entry wins the small group budget');
assert.deepStrictEqual(Array.from(context.skippedLore, d => d.entry.id), ['old']);
assert(context.messages[0].content.includes('NEW_') && !context.messages[0].content.includes('OLD_'));
assert(!context.messages[0].content.includes('OTHER_'), 'selected-speaker lore scope is preserved');
assert(context.skippedLore[0].reasons[0].messageId === 'old', 'why a skipped entry triggered remains inspectable');
assert.equal(context.permanentTokens + context.temporaryTokens, context.estimatedTokens);

const review = I.chatReviewBundle(baseChat, library);
assert.equal(review.contextPreview.activeLore[0].id, 'new');
assert.equal(review.contextPreview.skippedLore[0].id, 'old');
assert.equal(review.contextPreview.groupLoreBudget, context.loreBudget);
function flattened(node) {
  if (node == null || node === false) return '';
  if (Array.isArray(node)) return node.map(flattened).join(' ');
  if (typeof node === 'object') return flattened(node.children);
  return String(node);
}
const inspector = flattened(window.testLoreInspector({ details: context.loreDetails, skipped: context.skippedLore, budget: context.loreBudget, used: context.loreBudgetUsed }));
assert(inspector.includes('Included · Current event') && inspector.includes('Skipped · Old event'));
assert(inspector.includes('not sent'), 'the inspect panel must explicitly disclose omission');

const specific = { ...baseChat, messages: [{ id: 'both', parentId: null, role: 'user', content: 'A dark elf' }], leafId: 'both' };
const specificLibrary = { ...library, lore: [
  { id: 'generic', world: 'Forest', triggers: ['elf'], content: 'GENERIC_' + text },
  { id: 'specific', world: 'Forest', triggers: ['dark elf'], content: 'SPECIFIC_' + text }
] };
context = I.assemble(specific, specificLibrary);
assert.deepStrictEqual(Array.from(context.lore, e => e.id), ['specific'], 'a longer phrase wins equal-recency matches');

const oversizeLibrary = { ...library, lore: [
  { id: 'giant', world: 'Forest', triggers: ['current'], content: 'GIANT_' + text.repeat(4) },
  { id: 'small', world: 'Forest', triggers: ['current'], content: 'SMALL_lore' }
] };
context = I.assemble(baseChat, oversizeLibrary);
assert.deepStrictEqual(Array.from(context.lore, e => e.id), ['small'], 'an oversized entry must not crowd out a smaller relevant one');
assert(context.skippedLore[0].skippedReason.includes('by itself'));
assert(!context.messages[0].content.includes('GIANT_'), 'entries are not truncated into the prompt');

const solo = { ...baseChat, participants: undefined, activeSpeakerKey: undefined };
context = I.assemble(solo, library);
assert.deepStrictEqual(Array.from(context.lore, e => e.id), ['old', 'new'], 'solo lore behavior stays unchanged');
assert.equal(context.loreBudget, null);
assert.equal(context.skippedLore.length, 0);
assert.equal(JSON.stringify({ baseChat, library }), original, 'inspection must not modify saved chat or library records');
console.log('PASS: group lore budget prioritizes recent/specific whole-word matches, discloses skipped entries, and leaves solo prompts unchanged');
