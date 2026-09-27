// Exercise the shipped scene-fact save path without a real vault or provider.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Sync = require('../app/chat-sync-core');
const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'chat.js'), 'utf8');
const window = { storage: {}, React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} }, ReactDOM: { createRoot: () => ({ render() {} }) } };
vm.runInNewContext(source, { window, document: { createElement: () => ({}), body: { appendChild() {} } } });
const I = window.__rcvChatInternals;
const start = source.indexOf('    function saveSceneEvent(');
const end = source.indexOf('    function saveManualScene(', start);
assert(start >= 0 && end > start, 'shipped scene-fact save function exists');
const member = { characterId: 'hero', variantId: '' };
const chat = { id: 'story', characterId: 'hero', participants: [member], activeSpeakerKey: I.participantKey(member), messages: [{ id: 'u1', parentId: null, role: 'user', content: 'A saved scene', createdAt: 1 }], leafId: 'u1', sceneEvents: [] };
const fact = { id: 'fact1', text: 'Saw the bridge collapse', audience: [I.participantKey(member)], kind: 'witnessed', sourceMessageId: 'u1', createdAt: 2 };
let saves = 0, retries = 0;
const context = {
  Sync, window, activePath: I.activePath, patchScene: I.patchScene,
  chatsRef: { current: [chat] }, activeIdRef: { current: 'story' }, busyRef: { current: false }, saveFailed: { current: false },
  save(next) { saves++; context.chatsRef.current = next; context.saveFailed.current = true; return Promise.reject(new Error('disk full')); },
  retrySave() { retries++; assert.equal(context.chatsRef.current[0].sceneEvents.length, 1); context.saveFailed.current = false; return Promise.resolve(); },
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
(async () => {
  await assert.rejects(context.saveSceneEvent(fact, 'other-leaf'), /scene changed/i);
  await assert.rejects(context.saveSceneEvent({ ...fact, sourceMessageId: 'missing' }, 'u1'), /no longer on this story branch/i);
  assert.equal(saves, 0, 'stale facts never write');
  await assert.rejects(context.saveSceneEvent(fact, 'u1'), /disk full/);
  assert.equal(context.chatsRef.current[0].sceneEvents.length, 1, 'failed storage keeps the pending fact for Retry save');
  await context.saveSceneEvent(fact, 'u1');
  assert.equal(saves, 1, 'retry does not create a second fact');
  assert.equal(retries, 1, 'retry waits for encrypted persistence');
  assert.equal(context.chatsRef.current[0].sceneEvents.length, 1);
  assert.doesNotThrow(() => Sync.validate(context.chatsRef.current));
  console.log('PASS: selected-message scene fact is branch-checked, validated and retried without duplication');
})().catch(error => { console.error(error); process.exitCode = 1; });
