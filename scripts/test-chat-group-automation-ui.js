// Exercise the shipped group coordinator through a disposable 360px chat UI.
// Both the roleplay model and the extra scene-analysis call are offline stubs.
const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcv-group-automation-ui-'));
const site = path.join(tmp, 'web');
fs.cpSync(path.join(root, 'web'), site, { recursive: true });
for (const [source, target] of [
  ['app/chat.js', 'js/rolecraft-chat.js'],
  ['app/chat-sync-core.js', 'js/chat-sync-core.js'],
  ['app/chat-group-coordinator.js', 'js/chat-group-coordinator.js'],
  ['app/chat.css', 'css/chat.css'],
]) fs.copyFileSync(path.join(root, source), path.join(site, target));
app.setPath('userData', path.join(tmp, 'profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
const preload = path.join(tmp, 'preload.js');
fs.writeFileSync(preload, `window.__requests=[];window.__coordinatorCalls=[];window.__coordinatorResolvers=[];
window.__directorCalls=[];
window.__coordinatorCancelCount=0;
window.__completeCoordinator=(index,result)=>window.__coordinatorResolvers[index](result);
window.openRouter={status:async()=>({configured:true}),onEvent:callback=>{window.__emit=callback;return()=>{}},
  cancel:async()=>({ok:true}),start:async request=>{window.__requests.push(request);return{ok:true}},
  director:async request=>{window.__directorCalls.push(request);return{ok:true,scores:{tone:3,continuity:3,agency:0,cost:.0001}}},
  coordinator:request=>new Promise(resolve=>{window.__coordinatorCalls.push(request);window.__coordinatorResolvers.push(resolve)}),
  coordinatorCancel:async()=>{window.__coordinatorCancelCount++;return{ok:true}}};`);

const keyA = JSON.stringify(['a', '']);
const keyB = JSON.stringify(['b', '']);
const chars = [
  { id: 'a', name: 'Ari', story: 'ARI_PROFILE', systemPrompt: 'ARI_PERMANENT_DIRECTION', creatorMemo: 'SECRET_CREATOR_MEMO' },
  { id: 'b', name: 'Bea', story: 'BEA_PROFILE' },
];
const messages = Array.from({ length: 12 }, (_, index) => ({
  id: 'm' + index, parentId: index ? 'm' + (index - 1) : null,
  role: index % 2 ? 'assistant' : 'user',
  speaker: index % 2 ? { characterId: 'a', variantId: '', name: 'Ari' } : undefined,
  content: 'MAIN_SCENE_' + index,
  createdAt: index + 1,
}));
messages.push({ id: 's10', parentId: 'm9', role: 'user', content: 'SIBLING_ONLY_USER', createdAt: 20 });
messages.push({ id: 's11', parentId: 's10', role: 'assistant', speaker: { characterId: 'b', variantId: '', name: 'Bea' }, content: 'SIBLING_ONLY_REPLY', createdAt: 21 });
const original = {
  id: 'g', title: 'AI group scene', characterId: 'a', model: 'fixture/model',
  contextTokens: 64000, maxTokens: 500, autoMemory: false,
  participants: [{ characterId: 'a', variantId: '' }, { characterId: 'b', variantId: '' }],
  activeSpeakerKey: keyA, originalSpeaker: { characterId: 'a', variantId: '', name: 'Ari' },
  alwaysActivePrompt: 'PRIORITY_ONE_USER_DIRECTION',
  sceneLocation: 'USER_LOCATION', sceneState: 'USER_SCENE_FACTS',
  aiSceneLocation: 'OLDER_AI_LOCATION', aiSceneState: 'OLDER_AI_SCENE',
  castScene: { [keyB]: { presence: 'away', knowledge: 'PRIVATE_MANUAL_KNOWLEDGE', aiPresence: 'observing', aiKnowledge: 'OLD_AI_WITNESS_NOTE' } },
  sceneEvents: [{ id: 'private', text: 'PRIVATE_OFF_SCENE_EVENT', audience: [keyB], createdAt: 1 }],
  memories: [{ id: 'memory', throughId: 'm2', text: 'EARLIER_COMPACTED_HISTORY', createdAt: 1 }],
  messages, leafId: 'm11', createdAt: 1, updatedAt: 12,
};
const proposal = {
  location: 'AI_NEW_LOCATION', scene: 'AI_NEW_SCENE',
  cast: [{ key: keyB, presence: 'present', knowledge: 'AI_NEW_WITNESS_NOTE' }],
  nextSpeakerKey: keyB,
};
let win;
const run = source => win.webContents.executeJavaScript(source);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(source) {
  for (let attempt = 0; attempt < 160; attempt++) {
    if (await run(source)) return;
    await wait(50);
  }
  throw Error('Timed out: ' + source);
}
async function saved() { return run("storage.get('chats:all').then(result=>JSON.parse(result.value)[0])"); }
async function click(label, selector = '#rcv-chat-root button') {
  await run(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>(item.getAttribute('aria-label')||item.textContent).trim()===${JSON.stringify(label)});if(!button)throw Error('Missing '+${JSON.stringify(label)});button.click()})()`);
}
async function type(selector, value) {
  await run(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
}
async function seed(mode, extra = {}) {
  const chat = { ...original, groupAutomationMode: mode, ...extra };
  await run(`(async()=>{await storage.set('ui:onboarded','1');await storage.set('chars:all',JSON.stringify(${JSON.stringify(chars)}));await storage.set('personas:all','[]');await storage.set('lore:all','[]');await storage.set('prompts:all','[]');await storage.set('chats:all',JSON.stringify([${JSON.stringify(chat)}]));})()`);
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); });
  await until("!!document.querySelector('.rcchat-launch')");
  await run("document.querySelector('.rcchat-launch').click()");
  await until("!!document.querySelector('.rcchat-compose textarea')");
}
async function openScene() {
  await run("document.querySelector('.rcchat-header-options').open=true");
  await click('Scene panel');
  await until("!!document.querySelector('#rcchat-group-automation')");
}
async function reply(text) {
  if (text) {
    await type('.rcchat-compose textarea', text);
    await click('Send to Ari');
  } else {
    await click('Reply as Ari', '.rcchat-compose button');
  }
  await until('window.__requests.length>0');
}
async function finish(index, content) {
  await run(`(()=>{const request=window.__requests[${index}];window.__emit({id:request.requestId,type:'delta',text:${JSON.stringify(content)}});window.__emit({id:request.requestId,type:'done'})})()`);
}
const timeout = setTimeout(() => { console.error('Group automation UI timeout'); process.exit(1); }, 120000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: true, width: 360, height: 800,
    webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  win.setContentSize(360, 800); win.focus();
  await win.loadFile(path.join(site, 'index.html'));
  await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await seed('off');

  // State construction follows the active branch and sends only bounded shared facts.
  const state = await run(`storage.get('chats:all').then(result=>window.__rcvChatInternals.groupCoordinatorState(JSON.parse(result.value)[0],{chars:${JSON.stringify(chars)},personas:[],lore:[]},'m11'))`);
  assert.strictEqual(state.memory, 'EARLIER_COMPACTED_HISTORY');
  assert.deepStrictEqual(state.recent_turns.map(turn => turn.text), messages.slice(4, 12).map(turn => turn.content));
  assert(state.manual_notes.includes('USER_SCENE_FACTS') && state.manual_notes.includes('User presence for Bea: away'));
  assert.strictEqual(state.cast[1].presence, 'observing');
  assert.strictEqual(state.cast[1].knowledge, 'OLD_AI_WITNESS_NOTE');
  assert(!JSON.stringify(state).includes('SIBLING_ONLY') && !JSON.stringify(state).includes('PRIVATE_OFF_SCENE_EVENT'));
  assert(!JSON.stringify(state).includes('PRIVATE_MANUAL_KNOWLEDGE') && !JSON.stringify(state).includes('SECRET_CREATOR_MEMO'));
  const priority = await run(`storage.get('chats:all').then(result=>window.__rcvChatInternals.assemble(JSON.parse(result.value)[0],{chars:${JSON.stringify(chars)},personas:[],lore:[]}).messages[0].content)`);
  assert(priority.indexOf('PRIORITY_ONE_USER_DIRECTION') < priority.indexOf('ARI_PERMANENT_DIRECTION'));
  assert(priority.indexOf('USER_SCENE_FACTS') < priority.indexOf('OLDER_AI_SCENE'));
  assert(priority.includes('AI-TRACKED SCENE RECAP') && priority.includes('fallible'));
  const sibling = await run(`storage.get('chats:all').then(result=>{const i=window.__rcvChatInternals;const moved=i.navigateScene(JSON.parse(result.value)[0],'s11');return i.groupCoordinatorState(moved,{chars:${JSON.stringify(chars)},personas:[],lore:[]},'s11')})`);
  assert(sibling.recent_turns.some(turn => turn.text === 'SIBLING_ONLY_REPLY'));
  assert(!sibling.recent_turns.some(turn => turn.text === 'MAIN_SCENE_11'));
  assert.strictEqual(sibling.scene, '', 'an AI note from a later sibling must not enter this branch');

  // Off never invokes the extra paid analysis.
  await reply();
  await finish(0, 'Ari continues the scene.');
  await until("!document.querySelector('.rcchat-compose button.danger')");
  await wait(150);
  assert.strictEqual(await run('window.__coordinatorCalls.length'), 0);

  // The visible per-chat toggle enables a proposed update without applying it.
  await seed('off');
  await openScene();
  assert(await run("(()=>{const panel=document.querySelector('.rcchat-group-coordinator'),rect=panel.getBoundingClientRect();return rect.left>=-1&&rect.right<=innerWidth+1&&panel.scrollWidth<=panel.clientWidth+1})()"), 'AI controls fit within a 360px phone viewport');
  assert.strictEqual(await run("document.querySelector('#rcchat-group-automation').value"), 'off');
  assert(await run("document.querySelector('.rcchat-group-coordinator').textContent.includes('one additional paid request')"));
  await run("(()=>{const select=document.querySelector('#rcchat-group-automation');select.value='suggest';select.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await until("storage.get('chats:all').then(result=>JSON.parse(result.value)[0].groupAutomationMode==='suggest')");
  await run("(()=>{const input=document.querySelector('#rcchat-coordinator-model');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'fixture/cheap');input.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await until("storage.get('chats:all').then(result=>JSON.parse(result.value)[0].groupCoordinatorModel==='fixture/cheap')");
  await click('Close dialog');
  await reply();
  await finish(0, 'Ari asks Bea to answer.');
  await until('window.__coordinatorCalls.length===1');
  const call = await run('window.__coordinatorCalls[0]');
  assert.strictEqual(call.optIn, true);
  assert.strictEqual(call.requireZdr, true);
  assert.strictEqual(call.model, 'fixture/cheap', 'analysis model is independent of the roleplay model');
  assert(call.state.recent_turns.at(-1).text.includes('Ari asks Bea to answer.'));
  assert(!JSON.stringify(call.state).includes('PRIVATE_OFF_SCENE_EVENT'));
  await run(`window.__completeCoordinator(0,{ok:true,cost:.0002,update:${JSON.stringify(proposal)}})`);
  await until("storage.get('chats:all').then(result=>!!JSON.parse(result.value)[0].groupAutomationReview)");
  let chat = await saved();
  assert.strictEqual(chat.groupAutomationReview.applied, false);
  assert.strictEqual(chat.sceneState, 'USER_SCENE_FACTS');
  assert.strictEqual(chat.aiSceneState, 'OLDER_AI_SCENE', 'suggest mode must not change the scene before review');
  await openScene();
  await until("!!document.querySelector('.rcchat-group-coordinator button')");
  assert(await run("document.querySelector('.rcchat-group-coordinator').textContent.includes('AI scene suggestion')"));
  await click('Analyze this scene now · paid');
  await until("document.querySelector('.rcchat-group-coordinator').textContent.includes('Force another paid check')");
  assert.strictEqual(await run('window.__coordinatorCalls.length'), 1, 'identical Analyze now does not start another paid request');
  await click('Force another paid check');
  await until('window.__coordinatorCalls.length===2');
  await run(`window.__completeCoordinator(1,{ok:true,update:${JSON.stringify(proposal)}})`);
  await until(`storage.get('ui:chat-extra-cost:g').then(result=>JSON.parse(result.value)[${JSON.stringify(chat.leafId)}]?.coordinator?.requests===2)`);
  const extra = await run("storage.get('ui:chat-extra-cost:g').then(result=>JSON.parse(result.value))");
  const analyzedId = chat.leafId;
  assert.strictEqual(extra[analyzedId].coordinator.requests, 2);
  assert.strictEqual(extra[analyzedId].coordinator.knownCost, .0002);
  assert.strictEqual(extra[analyzedId].coordinator.unknownCostRequests, 1, 'missing provider cost remains unknown');
  assert(await run("document.querySelector('.rcchat-group-coordinator').textContent.includes('Based on the reply:')"), 'the AI review shows its source reply');
  assert(await run("document.querySelector('.rcchat-group-coordinator').textContent.includes('Before: OLDER_AI_SCENE')"), 'the AI review shows the prior value');
  await run("(()=>{const field=[...document.querySelectorAll('.rcchat-ai-review-field')].find(node=>node.textContent.includes('Location'));field.querySelector('input[type=checkbox]').click()})()");
  await type('.rcchat-ai-review-field textarea[aria-label="Correct Scene recap"]', 'CORRECTED_AI_SCENE');
  await click('Apply selected AI facts');
  await until("storage.get('chats:all').then(result=>JSON.parse(result.value)[0].groupAutomationReview?.applied===true)");
  chat = await saved();
  assert.strictEqual(chat.sceneState, 'USER_SCENE_FACTS');
  assert.strictEqual(chat.aiSceneState, 'CORRECTED_AI_SCENE');
  assert.strictEqual(chat.aiSceneLocation, 'OLDER_AI_LOCATION', 'unchecked AI field was not applied');
  assert.strictEqual(chat.activeSpeakerKey, keyB);
  assert.strictEqual(chat.castScene[keyB].presence, 'away', 'manual presence stays authoritative');
  assert.strictEqual(chat.castScene[keyB].knowledge, 'PRIVATE_MANUAL_KNOWLEDGE');
  assert.strictEqual(chat.castScene[keyB].aiKnowledge, 'AI_NEW_WITNESS_NOTE');
  await run("document.querySelector('.rcchat-group-coordinator .rcchat-review:last-of-type').open=true");
  await click('Undo AI update');
  await until("storage.get('chats:all').then(result=>!JSON.parse(result.value)[0].groupAutomationUndo)");
  chat = await saved();
  assert.strictEqual(chat.aiSceneState, 'OLDER_AI_SCENE');
  assert.strictEqual(chat.activeSpeakerKey, keyA);
  await run("document.querySelector('.rcchat-group-coordinator .rcchat-review:first-of-type').open=true");
  await click('Correct AI fields');
  await type('.rcchat-ai-edit textarea', 'MANUALLY_CORRECTED_AI_RECAP');
  await run("window.__realAiSave=storage.syncCommit;window.__failAiSave=true;storage.syncCommit=function(values,expected){if(values['chats:all']&&window.__failAiSave){window.__failAiSave=false;return Promise.reject(Error('Fixture encrypted write failed'))}return window.__realAiSave(values,expected)};true");
  await click('Save AI corrections');
  await until("!!document.querySelector('.rcchat-ai-edit .rcchat-error')");
  assert(await run("document.querySelector('.rcchat-ai-edit textarea').value==='MANUALLY_CORRECTED_AI_RECAP'"), 'a failed encrypted write keeps AI corrections editable');
  assert.strictEqual((await saved()).aiSceneState, 'OLDER_AI_SCENE', 'failed correction must not be mistaken for a saved scene');
  await run("document.querySelector('.rcchat-save-retry button').click()");
  await until("window.RolecraftChatSyncIdle()");
  await click('Save AI corrections');
  await until("storage.get('chats:all').then(result=>JSON.parse(result.value)[0].aiSceneState==='MANUALLY_CORRECTED_AI_RECAP')");
  chat = await saved();
  assert.strictEqual(chat.sceneState, 'USER_SCENE_FACTS', 'AI correction cannot replace the manual scene');
  assert.strictEqual(chat.castScene[keyB].knowledge, 'PRIVATE_MANUAL_KNOWLEDGE', 'AI correction cannot replace manual character knowledge');
  await click('Close dialog');

  // In automatic mode a manual edit during analysis invalidates the old result.
  await seed('auto');
  await reply();
  await finish(0, 'Ari sees the gate open.');
  await until('window.__coordinatorCalls.length===1');
  await openScene();
  await type('#rcchat-scene-state', 'USER_CORRECTED_SCENE');
  await until("storage.get('chats:all').then(result=>JSON.parse(result.value)[0].sceneState==='USER_CORRECTED_SCENE')");
  await run(`window.__completeCoordinator(0,{ok:true,update:${JSON.stringify(proposal)}})`);
  await wait(180);
  chat = await saved();
  assert.strictEqual(chat.sceneState, 'USER_CORRECTED_SCENE');
  assert.strictEqual(chat.aiSceneState, 'OLDER_AI_SCENE', 'stale AI result must not overwrite a manual edit');
  assert(!chat.groupAutomationReview);

  // A queued group round runs the coordinator once, after the final reply.
  await seed('auto', { directorMode: 'observe', requireZdr: false });
  await click('Choose next speaker');
  await click('Manage cast & scene');
  await until("!!document.querySelector('.rcchat-group-round')");
  await run("document.querySelector('.rcchat-group-round').open=true");
  await click('Review 2 paid replies');
  await click('Confirm 2 replies');
  await until('window.__requests.length===1');
  await finish(0, 'Ari hears Bea behind the gate.');
  await until('window.__requests.length===2');
  assert.strictEqual(await run('window.__coordinatorCalls.length'), 0, 'no analysis while the next queued reply is pending');
  assert.strictEqual(await run('window.__directorCalls.length'), 0, 'Story Director does not score an intermediate queued reply');
  await run("window.__realReplySave=storage.syncCommit;window.__replySaveHeld=false;storage.syncCommit=function(values,expected){if(values['chats:all']&&!window.__replySaveHeld&&JSON.parse(values['chats:all']).some(chat=>chat.messages.some(message=>message.content==='Bea opens the gate from inside.'&&!message.pending))){window.__replySaveHeld=true;return new Promise(resolve=>{window.__releaseReplySave=()=>resolve(window.__realReplySave(values,expected))})}return window.__realReplySave(values,expected)};true");
  await finish(1, 'Bea opens the gate from inside.');
  await until('window.__replySaveHeld');
  await wait(120);
  assert.strictEqual(await run('window.__directorCalls.length'), 0, 'Story Director must wait for the completed reply to be durably saved');
  assert.strictEqual(await run('window.__coordinatorCalls.length'), 0, 'scene analysis must also wait for the saved reply');
  await run('window.__releaseReplySave();true');
  await until('window.__coordinatorCalls.length===1');
  await until('window.__directorCalls.length===1');
  const queueCall = await run('window.__coordinatorCalls[0]');
  assert(queueCall.state.recent_turns.some(turn => turn.text === 'Ari hears Bea behind the gate.'));
  assert(queueCall.state.recent_turns.at(-1).text === 'Bea opens the gate from inside.');
  await run(`window.__completeCoordinator(0,{ok:true,update:${JSON.stringify(proposal)}})`);
  await until("storage.get('chats:all').then(result=>JSON.parse(result.value)[0].aiSceneState==='AI_NEW_SCENE')");
  chat = await saved();
  assert.strictEqual(chat.messages.length, messages.length + 2);
  assert.strictEqual(chat.groupAutomationReview.applied, true);
  assert.strictEqual(chat.sceneState, 'USER_SCENE_FACTS');

  // A sparse native no-op still counts the paid check and leaves scene notes untouched.
  await seed('auto');
  await reply();
  await finish(0, 'Ari keeps watch in silence.');
  await until('window.__coordinatorCalls.length===1');
  const noOpLeaf = (await saved()).leafId;
  await run('window.__completeCoordinator(0,{ok:true,cost:.00005,update:{}})');
  await until(`storage.get('ui:chat-extra-cost:g').then(result=>JSON.parse(result.value)[${JSON.stringify(noOpLeaf)}]?.coordinator?.requests===1)`);
  chat = await saved();
  assert(!chat.groupAutomationReview, 'a no-op does not write a proposal or scene');
  assert.strictEqual(chat.aiSceneState, 'OLDER_AI_SCENE');

  // A provider output-limit failure records the paid attempt but leaves explicit retry available.
  await run("storage.set('ui:chat-extra-cost:g','{}')");
  await seed('suggest');
  await openScene();
  await click('Analyze this scene now · paid');
  await until('window.__coordinatorCalls.length===1');
  await run("window.__completeCoordinator(0,{ok:false,error:'AI group coordination reached the provider output limit'})");
  await until("document.querySelector('.rcchat-group-coordinator').textContent.includes('provider output limit')");
  const failedLedger = await run("storage.get('ui:chat-extra-cost:g').then(result=>JSON.parse(result.value))");
  assert.strictEqual(failedLedger.m11.coordinator.requests, 1);
  assert(!failedLedger.m11.lastFingerprint, 'a failed analysis must not mark this scene as analyzed');
  await click('Analyze this scene now · paid');
  await until('window.__coordinatorCalls.length===2');
  await run('window.__completeCoordinator(1,{ok:true,update:{}})');
  await until("storage.get('ui:chat-extra-cost:g').then(result=>JSON.parse(result.value).m11?.coordinator?.requests===2)");

  clearTimeout(timeout);
  console.log('PASS: active-branch AI scene context, prompt priority, opt-in, review/undo, stale-result guard, queued-round analysis and explicit retry after provider failure');
  app.exit(0);
}).catch(error => { console.error(error.stack); clearTimeout(timeout); process.exit(1); });
