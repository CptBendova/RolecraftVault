const assert = require('assert');
const Ledger = require('../app/chat-story-ledger');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ari = JSON.stringify(['ari', '']);
const bea = JSON.stringify(['bea', '']);
const m0 = { id: 'm0', parentId: null, role: 'user', content: 'The bridge is burning.', createdAt: 1 };
const m1 = { id: 'm1', parentId: 'm0', role: 'assistant', speaker: { characterId: 'ari', variantId: '', name: 'Ari' }, content: 'I promised to return.', createdAt: 2 };
const privateTurn = { id: 'm2', parentId: 'm1', role: 'user', content: 'Bea learned the hidden route.', audience: [bea], createdAt: 3 };
const alternate = { id: 'b2', parentId: 'm1', role: 'user', content: 'The party turned back.', createdAt: 4 };
const original = { id: 'c1', participants: [{ characterId: 'ari' }, { characterId: 'bea' }], messages: [m0, m1, privateTurn, alternate], leafId: 'm2', updatedAt: 4 };
let next = 0;
const id = () => 'ledger-' + (++next);

let chat = Ledger.save(original, { sourceMessageId: 'm0', kind: 'fact', text: 'The bridge is burning.' }, id, 5);
chat = Ledger.save(chat, { sourceMessageId: 'm1', kind: 'promise', text: 'Ari promised to return.' }, id, 6);
chat = Ledger.save(chat, { sourceMessageId: 'm2', kind: 'relationship', text: 'Bea privately trusts Ari.' }, id, 7);
assert.strictEqual(Ledger.active(chat, null, bea).length, 3);
assert.strictEqual(Ledger.active(chat, null, ari).length, 2, 'a private source never leaks into another speaker ledger');
assert(!Ledger.prompt(chat, null, ari).includes('privately'));
assert(Ledger.prompt(chat, null, bea).includes('Bea privately trusts Ari.'));

const branch = Object.assign({}, chat, { leafId: 'b2' });
assert.strictEqual(Ledger.active(branch, null, bea).length, 2, 'another branch cannot inherit a source-linked private fact');
assert.strictEqual(Ledger.review(branch, null, bea)[2].status, 'other-branch');
const changed = Object.assign({}, chat, { messages: chat.messages.map(message => message.id === 'm0' ? Object.assign({}, message, { content: 'The bridge was rebuilt.' }) : message) });
assert.strictEqual(Ledger.review(changed, null, ari)[0].status, 'source-changed', 'edited source must be reviewed again');
assert(!Ledger.prompt(changed, null, ari).includes('burning'));
chat = Ledger.save(changed, { id: chat.storyLedger[0].id, sourceMessageId: 'm0', kind: 'fact', text: 'The bridge was rebuilt.' }, id, 8);
assert(Ledger.prompt(chat, null, ari).includes('rebuilt'), 'explicit edit reapproves the changed source');
assert.strictEqual(chat.storyLedger[0].createdAt, 5);
const reserved = Ledger.save(chat, { id: 'reserved-note', create: true, sourceMessageId: 'm0', kind: 'fact', text: 'The repaired bridge can be crossed.' }, id, 8);
assert(reserved.storyLedger.some(entry => entry.id === 'reserved-note'), 'a retry can reuse its reserved note identity');
assert.throws(() => Ledger.save(chat, { id: 'missing-edited-note', sourceMessageId: 'm0', kind: 'fact', text: 'Lost edit' }, id, 8), /no longer exists/);

const idMap = { m0: 'f0', m1: 'f1', m2: 'f2' };
const forkMessages = [m0, m1, privateTurn].map(message => Object.assign({}, message, { id: idMap[message.id], parentId: message.parentId ? idMap[message.parentId] : null }));
const fork = Ledger.fork(chat, Object.assign({}, chat, { id: 'fork', messages: forkMessages, leafId: 'f2', storyLedger: undefined }), idMap, id);
assert.strictEqual(Ledger.active(fork, null, bea).length, 3, 'forked sources and ledger links are remapped together');
assert(fork.storyLedger.every(entry => /^f/.test(entry.sourceMessageId)));
assert.notStrictEqual(fork.storyLedger[0].id, chat.storyLedger[0].id);

const without = Ledger.remove(chat, chat.storyLedger[1].id, 9);
assert.strictEqual(without.storyLedger.length, 2);
assert.strictEqual(chat.storyLedger.length, 3, 'ledger changes do not mutate the saved transcript');
assert.throws(() => Ledger.save(chat, { sourceMessageId: 'b2', kind: 'fact', text: 'Other branch' }, id, 10), /completed message on this branch/);
assert.throws(() => Ledger.save(chat, { sourceMessageId: 'm0', kind: 'fact', text: 'x'.repeat(401) }, id, 10), /400 characters/);
assert.throws(() => Ledger.validate({ storyLedger: [chat.storyLedger[0], chat.storyLedger[0]] }), /invalid/);
const window = { storage: {}, RolecraftChatSync: require('../app/chat-sync-core'), RolecraftChatKnowledgeLanes: require('../app/chat-knowledge-lanes'), RolecraftChatStoryLedger: Ledger,
  crypto: { randomUUID: () => 'new-' + (++next) }, React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} }, ReactDOM: { createRoot: () => ({ render() {} }) } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/chat.js'), 'utf8'), { window, document: { createElement: () => ({}), body: { appendChild() {} } } });
const I = window.__rcvChatInternals;
const library = { chars: [{ id: 'ari', name: 'Ari', story: 'Ari details.' }, { id: 'bea', name: 'Bea', story: 'Bea details.' }], personas: [], lore: [] };
const scoped = { ...chat, knowledgeLanes: true, activeSpeakerKey: ari, model: 'fixture', contextTokens: 16000, maxTokens: 500 };
const ariPrompt = I.assemble(scoped, library).messages[0].content;
const beaPrompt = I.assemble({ ...scoped, activeSpeakerKey: bea }, library).messages[0].content;
assert(ariPrompt.includes('The bridge was rebuilt.'));
assert(!ariPrompt.includes('Bea privately trusts Ari.'), 'a private ledger note is not sent to the wrong speaker');
assert(beaPrompt.includes('Bea privately trusts Ari.'), 'the addressed speaker receives a reviewed private note');
assert(!I.assemble({ ...scoped, leafId: 'b2' }, library).messages[0].content.includes('Bea privately trusts Ari.'), 'other branches exclude private ledger notes');
const branched = I.forkConversation(scoped, 'm2');
assert.strictEqual(Ledger.active(branched, null, bea).length, 3, 'branch copies keep remapped ledger provenance');
console.log('PASS: story ledger sources, branch and speaker scope, explicit correction, fork, bounds');
