#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const window = {
  storage: {},
  crypto: { randomUUID: () => 'fixture-id' },
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'chat.js'), 'utf8'), {
  window, document: { createElement: () => ({}), body: { appendChild() {} } },
});
const I = window.__rcvChatInternals;
assert(I && I.storySearchResults && I.storySearchJumpPlan, 'search uses the shipped Chat implementation');

const messages = [];
for (let i = 0; i < 35; i++) messages.push({ id: 'm' + i, parentId: i ? 'm' + (i - 1) : null, role: i % 2 ? 'assistant' : 'user', content: i === 3 ? 'The Copper Bridge held.' : 'Ordinary turn ' + i });
messages.push({ id: 'alternate', parentId: 'm8', role: 'assistant', content: 'A secret COPPER tunnel opens.' });
messages.push({ id: 'alternate-next', parentId: 'alternate', role: 'user', content: 'The tunnel is explored.' });
const chat = { id: 'story', leafId: 'm34', messages };
const results = I.storySearchResults(chat, '  copper  ');
assert.strictEqual(results.length, 2, 'all saved branches are searched');
assert.strictEqual(results[0].message.id, 'alternate', 'newer alternate result appears first');
assert.strictEqual(results[0].current, false);
assert.strictEqual(results[1].message.id, 'm3');
assert.strictEqual(results[1].current, true);
assert(results[0].excerpt.includes('COPPER'));
const speaker = { characterId: 'character-a', variantId: '' };
messages[3].speaker = speaker;
messages[messages.length - 2].speaker = { characterId: 'character-b', variantId: '' };
const before = JSON.stringify(chat);
assert.strictEqual(I.storySearchResults(chat, 'copper', { speakerKey: I.participantKey(speaker) }).map(row => row.message.id).join(','), 'm3', 'speaker filter does not mix group characters');
assert.strictEqual(I.storySearchResults(chat, 'copper', { currentOnly: true }).map(row => row.message.id).join(','), 'm3', 'current-path filter excludes sibling branches');
assert.strictEqual(I.storySearchResults(chat, '', { speakerKey: '__user__' }).length, messages.filter(row => row.role === 'user').length, 'speaker browsing works without a text query');
assert.strictEqual(I.storySearchResults(chat, '' ).length, 0);
assert.strictEqual(I.storySearchResults(chat, 'never said').length, 0);
const expandedCase = { id: 'unicode', leafId: 'u', messages: [{ id: 'u', parentId: null, role: 'user', content: 'İ'.repeat(100) + 'x marks the spot.' }] };
assert(I.storySearchResults(expandedCase, 'x')[0].excerpt.includes('x marks the spot'), 'Unicode case-fold expansion must not shift the excerpt beyond the actual match');
const old = I.storySearchJumpPlan(chat, 'm3', 12);
assert.strictEqual(old.leaf, 'm34', 'jumping to an ancestor keeps the current branch');
assert(old.visible >= 35 - 3, 'an older match is included beyond the initial message window');
const alternate = I.storySearchJumpPlan(chat, 'alternate', 12);
assert.strictEqual(alternate.leaf, 'alternate-next', 'off-path result selects its saved descendant branch');
assert(I.activePath(Object.assign({}, chat, { leafId: alternate.leaf })).some(message => message.id === 'alternate'));
assert.strictEqual(I.storySearchJumpPlan(chat, 'missing', 12), null);
assert.strictEqual(JSON.stringify(chat), before, 'search and jump planning never rewrite stored messages');
console.log('PASS offline story search across branches and older-message jump planning');
