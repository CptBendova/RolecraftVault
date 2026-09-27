// Source-backed display helpers only: no vault writes, GUI or provider calls.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const window = {
  storage: {},
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/chat.js'), 'utf8'), {
  window, document: { createElement: () => ({}), body: { appendChild() {} } },
});
const I = window.__rcvChatInternals;
assert.strictEqual(typeof I.chatTitle, 'function', 'use the shipped title helper');
assert.strictEqual(typeof I.lastChatAt, 'function', 'use the shipped last-chat timestamp helper');

for (const [saved, shown] of [
  ['Mountain story', 'Mountain story'],
  ['Mountain story (memory rebuilt)', 'Mountain story'],
  ['Mountain story (memory rebuilt) (memory rebuilt)', 'Mountain story'],
  ['Mountain story (memory rebuilt) (branch)', 'Mountain story (branch)'],
  ['Mountain story (memory rebuilt) (branch) (memory rebuilt)', 'Mountain story (branch)'],
  ['Mountain story (branch) (branch)', 'Mountain story (branch) (branch)'],
  ['The memory rebuilt our world', 'The memory rebuilt our world'],
  ['Mountain story (alternative ending)', 'Mountain story (alternative ending)'],
]) {
  const chat = { title: saved, messages: [{ id: 'm', content: 'Original story text.' }] };
  const before = JSON.stringify(chat);
  assert.strictEqual(I.chatTitle(chat), shown, 'clean only legacy rebuild suffixes: ' + saved);
  assert.strictEqual(JSON.stringify(chat), before, 'display cleanup never rewrites saved titles or story text');
}
assert.strictEqual(I.chatTitle({}), 'Untitled story');
assert.strictEqual(I.chatTitle({ title: '' }), 'Untitled story');

const earlier = Date.UTC(2026, 7, 1, 12);
const latest = Date.UTC(2026, 7, 2, 12);
const maintenance = Date.UTC(2026, 8, 20, 12);
const transcript = [
  { id: 'newer', role: 'assistant', content: 'The latest completed response.', createdAt: latest },
  { id: 'older', role: 'user', content: 'An earlier user message.', createdAt: earlier },
  { id: 'pending', role: 'assistant', content: 'An unfinished response.', createdAt: maintenance, pending: true },
  { id: 'empty', role: 'assistant', content: '', createdAt: maintenance },
  { id: 'blank', role: 'assistant', content: '   ', createdAt: maintenance },
  { id: 'zero', role: 'user', content: 'Invalid zero date.', createdAt: 0 },
  { id: 'negative', role: 'assistant', content: 'Invalid negative date.', createdAt: -1 },
  { id: 'infinite', role: 'assistant', content: 'Invalid infinite date.', createdAt: Infinity },
  { id: 'out-of-range', role: 'assistant', content: 'Outside the JavaScript date range.', createdAt: 8640000000000001 },
  { id: 'missing', role: 'assistant', content: 'No date recorded.' },
];
const chat = { title: 'Shared story (memory rebuilt)', messages: transcript, createdAt: earlier - 1000, updatedAt: maintenance };
assert.strictEqual(I.lastChatAt(chat), latest, 'maximum actual completed-message time wins, independently of array order');
assert.strictEqual(I.lastChatAt({ ...chat, updatedAt: maintenance + 10000 }), latest, 'settings and sync bookkeeping cannot make an old chat look newly active');
assert.strictEqual(I.lastChatAt({ ...chat, createdAt: maintenance, updatedAt: maintenance }), latest, 'a newly rebuilt copy retains the original transcript date, not rebuild time');
assert.strictEqual(I.lastChatAt({ ...chat, messages: transcript.concat([{ id: 'new-user', role: 'user', content: 'A new turn.', createdAt: maintenance }]) }), maintenance, 'a real new user message advances the last-chat date');
assert.strictEqual(I.lastChatAt({ ...chat, messages: [{ role: 'assistant', content: 'A preserved partial reply.', error: 'Interrupted', createdAt: latest }] }), latest, 'saved nonpending partial text still counts as a real conversation event');

for (const messages of [[], undefined, [{ role: 'assistant', content: '', createdAt: latest }], [{ role: 'assistant', content: 'Still streaming.', pending: true, createdAt: latest }]]) {
  assert.strictEqual(I.lastChatAt({ messages, createdAt: earlier, updatedAt: maintenance }), earlier, 'an unused/undated chat falls back to creation before maintenance');
}
assert.strictEqual(I.lastChatAt({ messages: [], updatedAt: maintenance }), maintenance, 'legacy chats with no creation timestamp may use their last update');
assert.strictEqual(I.lastChatAt({ messages: [], createdAt: NaN, updatedAt: maintenance }), maintenance, 'invalid creation timestamp must not hide the valid fallback');
assert.strictEqual(I.lastChatAt({ messages: [] }), 0, 'an entirely undated chat does not invent a date');
assert.strictEqual(chat.title, 'Shared story (memory rebuilt)', 'date/title inspection is read-only');
assert.strictEqual(chat.messages, transcript);
console.log('PASS: legacy rebuild-name cleanup, branch/custom-name preservation and last actual message dates unaffected by rebuilds/settings');
