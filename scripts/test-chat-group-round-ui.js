// Exercise the shipped two/three-reply queue in a disposable web vault. All provider
// calls are fake and recorded; no API key or network access is used.
const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcv-group-round-'));
const site = path.join(tmp, 'web');
fs.cpSync(path.join(root, 'web'), site, { recursive: true });
for (const [source, target] of [
  ['app/chat.js', 'js/rolecraft-chat.js'],
  ['app/chat-sync-core.js', 'js/chat-sync-core.js'],
  ['app/chat.css', 'css/chat.css'],
]) fs.copyFileSync(path.join(root, source), path.join(site, target));
app.setPath('userData', path.join(tmp, 'profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
const preload = path.join(tmp, 'preload.js');
fs.writeFileSync(preload, `window.__requests=[];window.__cancels=[];
window.openRouter={status:async()=>({configured:true}),onEvent:callback=>{window.__emit=callback;return()=>{}},
models:async()=>({ok:true,models:[{id:'fixture/group',name:'Fixture group',context_length:32000,max_completion_tokens:500,pricing:{prompt:0.000001,completion:0.000002}}]}),
cancel:async id=>{window.__cancels.push(id);return {ok:true}},
start:async request=>{window.__requests.push(request);return {ok:true}}};`);

let win;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = async source => {
  try { return await win.webContents.executeJavaScript(source); }
  catch (error) { throw Error(error.message + '\nProbe: ' + source); }
};
async function until(source) {
  for (let attempt = 0; attempt < 160; attempt++) {
    if (await run(source)) return;
    await wait(50);
  }
  throw Error('Timed out: ' + source);
}
async function click(label, selector = '#rcv-chat-root button') {
  await run(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(selector)})]
    .find(item=>(item.getAttribute('aria-label')||item.textContent).trim()===${JSON.stringify(label)});
    if(!button)throw Error('Missing button '+${JSON.stringify(label)});button.click()})()`);
  await wait(50);
}
async function type(text) {
  await run(`(()=>{const input=document.querySelector('.rcchat-compose textarea');input.focus();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});
    input.setSelectionRange(input.value.length,input.value.length);
    input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await wait(60);
}
async function saved() { return run("window.storage.get('chats:all').then(result=>JSON.parse(result.value)[0])"); }
async function finish(index, text, error) {
  await run(`(()=>{const request=window.__requests[${index}];
    ${error ? `window.__emit({id:request.requestId,type:'error',error:${JSON.stringify(error)}});` : `window.__emit({id:request.requestId,type:'delta',text:${JSON.stringify(text)}});window.__emit({id:request.requestId,type:'done'});`}
  })()`);
}
const chars = [
  { id: 'ari', name: 'Ari', story: 'ARI_PROFILE' },
  { id: 'bea', name: 'Bea', story: 'BEA_PROFILE' },
  { id: 'cyra', name: 'Cyra', story: 'CYRA_PROFILE' },
];
const initial = {
  id: 'story', title: 'Round fixture', characterId: 'ari', personaId: 'player',
  participants: [{ characterId: 'ari', variantId: '' }, { characterId: 'bea', variantId: '' }, { characterId: 'cyra', variantId: '' }],
  activeSpeakerKey: JSON.stringify(['ari', '']), model: 'fixture/group',
  contextTokens: 32000, maxTokens: 500, autoMemory: false, messages: [], leafId: null,
};
async function reset(patch = {}) {
  const fixture = { ...initial, ...patch };
  await run(`(async()=>{
    await storage.set('ui:onboarded','1');
    await storage.set('chars:all',JSON.stringify(${JSON.stringify(chars)}));
    await storage.set('personas:all',JSON.stringify([{id:'player',name:'Robin'}]));
    for(const key of ['lore:all','prompts:all'])await storage.set(key,'[]');
    await storage.set('chats:all',JSON.stringify([${JSON.stringify(fixture)}]));
    await storage.set('ui:chat-group-rounds','{}');
  })()`);
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); });
  await until("!!document.querySelector('.rcchat-launch')");
  await run("document.querySelector('.rcchat-launch').click()");
  await until("!!document.querySelector('.rcchat-compose textarea')");
  await type('');
}
async function reviewRound(secondId, cancelFirst = false) {
  await click('Choose next speaker');
  await click('Manage cast & scene');
  await until("!!document.querySelector('.rcchat-group-round')");
  await run("document.querySelector('.rcchat-group-round').open=true");
  await run(`(()=>{const select=document.querySelector('#rcchat-round-second');
    select.value=${JSON.stringify(JSON.stringify([secondId, '']))};
    select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait(60);
  await click('Review 2 paid replies');
  assert.strictEqual(await run('window.__requests.length'), 0, 'review does not spend money');
  assert(await run("document.querySelector('.rcchat-group-round .rcchat-notice').textContent.includes('two paid roleplay requests')"));
  await click('Load model prices', '.rcchat-group-round button');
  await until("document.querySelector('.rcchat-group-round .rcchat-notice').textContent.includes('Estimated queue:')");
  assert(await run("document.querySelector('.rcchat-price-estimate').textContent.includes('Estimated next reply')"), 'single reply estimate is visible before Send');
  assert.strictEqual(await run('window.__requests.length'), 0, 'reading catalog prices starts no reply');
  if (cancelFirst) {
    await click('Cancel');
    assert.strictEqual(await run('window.__requests.length'), 0, 'cancelling review does not send');
    await click('Review 2 paid replies');
  }
  await click('Confirm 2 replies');
  await until('window.__requests.length===1');
}
const timeout = setTimeout(() => { console.error('Group round UI timeout'); app.exit(1); }, 120000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: true, width: 360, height: 800,
    webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  win.setContentSize(360, 800); win.focus();
  await win.loadFile(path.join(site, 'index.html'));
  await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");

  // A local first-speaker change and the explicit paid review precede both calls.
  await reset();
  await type('Robin asks both characters to inspect the bridge.');
  await click('Choose next speaker');
  await click('Reply as Bea', '.rcchat-speaker-picker button');
  await until("document.querySelector('.rcchat-cast-trigger').textContent.includes('Bea')");
  assert.strictEqual(await run('window.__requests.length'), 0);
  await reviewRound('cyra', true);
  let requests = await run('window.__requests');
  assert(requests[0].messages[0].content.includes('AI-controlled character: Bea'));
  assert(requests[0].messages.some(message => message.content.includes('Robin asks both characters to inspect the bridge.')));
  await finish(0, 'Bea checks the bridge.');
  await until('window.__requests.length===2');
  requests = await run('window.__requests');
  assert(requests[1].messages[0].content.includes('AI-controlled character: Cyra'));
  assert(requests[1].messages.some(message => message.content === '[Speaker: Bea]\nBea checks the bridge.'),
    'the second request reads the completed first reply');
  await finish(1, 'Cyra sees damage below.');
  await until("!document.querySelector('.rcchat-compose button.danger')");
  await wait(150);
  assert.strictEqual(await run('window.__requests.length'), 2, 'a confirmed round makes exactly two roleplay requests');
  let chat = await saved();
  assert.deepStrictEqual(chat.messages.map(message => message.role), ['user', 'assistant', 'assistant']);
  assert.deepStrictEqual(chat.messages.filter(message => message.role === 'assistant').map(message => message.speaker.characterId), ['bea', 'cyra']);
  assert.strictEqual(chat.messages[2].parentId, chat.messages[1].id, 'second reply extends the first, without another user turn');
  assert(chat.messages.every(message => !message.pending));

  // An opted-in conversation chooses two present actors automatically. The
  // second paid request sees the first completed, durably saved reply.
  await reset({ autoPairReplies: true, groupAutomationMode: 'off', castScene: {
    [JSON.stringify(['ari', ''])]: { presence: 'present', knowledge: '' },
    [JSON.stringify(['bea', ''])]: { presence: 'present', knowledge: '' },
    [JSON.stringify(['cyra', ''])]: { presence: 'away', knowledge: '' },
  } });
  await type('Robin asks Ari and Bea what they think.');
  await click('Send to Ari');
  await until('window.__requests.length===1');
  requests = await run('window.__requests');
  assert(requests[0].messages[0].content.includes('AI-controlled character: Ari'));
  await finish(0, 'Ari says the gate is open.');
  await until('window.__requests.length===2');
  requests = await run('window.__requests');
  assert(requests[1].messages[0].content.includes('AI-controlled character: Bea'));
  assert(requests[1].messages.some(message => message.content === '[Speaker: Ari]\nAri says the gate is open.'), 'automatic second speaker sees the first saved reply');
  await finish(1, 'Bea tells Ari she agrees.');
  await until("!document.querySelector('.rcchat-queue-progress')");
  assert.strictEqual(await run('window.__requests.length'), 2, 'automatic pairs are capped at two paid replies');

  // The entire three-speaker queue can be reordered, including the first
  // speaker. The draft is included once and each later call sees saved turns.
  await reset();
  await type('Robin asks the whole cast to inspect the gate.');
  await click('Choose next speaker');
  await click('Manage cast & scene');
  await run("document.querySelector('.rcchat-group-round').open=true");
  await click('Add third reply');
  await click('Move reply 3 earlier');
  await click('Move reply 2 earlier');
  assert.deepStrictEqual(await run("[...document.querySelectorAll('.rcchat-queue-row select')].map(select=>select.selectedOptions[0].textContent)"), ['Cyra','Ari','Bea']);
  assert(await run("(()=>{const panel=document.querySelector('.rcchat-cast-sheet');return panel.scrollWidth<=panel.clientWidth+1})()"), 'the queue fits the 360px cast sheet without horizontal clipping');
  await click('Review 3 paid replies');
  assert(await run("document.querySelector('.rcchat-group-round .rcchat-notice').textContent.includes('three paid roleplay requests')"));
  assert.strictEqual(await run('window.__requests.length'), 0, 'reordering and reviewing make no paid calls');
  await click('Confirm 3 replies');
  await until('window.__requests.length===1');
  requests = await run('window.__requests');
  assert(requests[0].messages[0].content.includes('AI-controlled character: Cyra'));
  assert(requests[0].messages.some(message=>message.content.includes('Robin asks the whole cast to inspect the gate.')));
  await finish(0, 'Cyra checks the lock.');
  await until('window.__requests.length===2');
  requests = await run('window.__requests');
  assert(requests[1].messages[0].content.includes('AI-controlled character: Ari'));
  assert(requests[1].messages.some(message=>message.content === '[Speaker: Cyra]\nCyra checks the lock.'));
  await finish(1, 'Ari hears movement.');
  await until('window.__requests.length===3');
  requests = await run('window.__requests');
  assert(requests[2].messages[0].content.includes('AI-controlled character: Bea'));
  assert(requests[2].messages.some(message=>message.content === '[Speaker: Ari]\nAri hears movement.'));
  await finish(2, 'Bea guards the exit.');
  await until("!document.querySelector('.rcchat-compose button.danger')");
  await wait(150);
  assert.strictEqual(await run('window.__requests.length'), 3, 'three confirmed replies never create a fourth');
  chat = await saved();
  assert.deepStrictEqual(chat.messages.map(message=>message.role), ['user','assistant','assistant','assistant']);
  assert.deepStrictEqual(chat.messages.filter(message=>message.role==='assistant').map(message=>message.speaker.characterId), ['cyra','ari','bea']);
  assert.strictEqual(chat.messages[3].parentId, chat.messages[2].id);
  assert.strictEqual(chat.messages.filter(message=>message.role==='user').length, 1, 'the draft is used only for the first turn');

  // Stop-after-current finishes the in-flight paid reply, then suppresses the
  // rest of the queue without cancelling or retrying that reply.
  await reset();
  await click('Choose next speaker');
  await click('Manage cast & scene');
  await run("document.querySelector('.rcchat-group-round').open=true");
  await click('Add third reply');
  await click('Review 3 paid replies');
  await click('Confirm 3 replies');
  await until('window.__requests.length===1');
  await click('Stop after current reply');
  await finish(0, 'Ari completes the first queued turn.');
  await until("!document.querySelector('.rcchat-queue-progress')");
  await wait(150);
  assert.strictEqual(await run('window.__requests.length'), 1);
  assert.strictEqual(await run('window.__cancels.length'), 0, 'stop-after-current does not abort the current answer');
  chat = await saved();
  assert.strictEqual(chat.messages[0].content, 'Ari completes the first queued turn.');

  // Closing Chat while the completed first reply is still being saved stops
  // the queued second request. The first reply still reaches local storage.
  await reset();
  await reviewRound('bea');
  await run(`(()=>{window.__roundRealCommit=storage.syncCommit;
    storage.syncCommit=(values,expected)=>{
      if(values['chats:all']&&!window.__roundRelease&&JSON.parse(values['chats:all'])[0].messages.some(message=>message.content==='Ari finishes before close.'&&!message.pending))
        return new Promise((resolve,reject)=>{window.__roundRelease=()=>Promise.resolve(window.__roundRealCommit(values,expected)).then(resolve,reject)});
      return window.__roundRealCommit(values,expected);
    }})()`);
  await finish(0, 'Ari finishes before close.');
  await until('!!window.__roundRelease');
  await run("document.querySelector('.rcchat-header-options').open=true");
  await click('Return to vault');
  await until("window.RolecraftChatOpen===false&&!document.querySelector('.rcchat-shell')");
  await run('(()=>{const release=window.__roundRelease;storage.syncCommit=window.__roundRealCommit;return release()})()');
  await wait(180);
  assert.strictEqual(await run('window.__requests.length'), 1, 'closing Chat prevents the queued second reply');
  chat = await saved();
  assert.strictEqual(chat.messages[0].content, 'Ari finishes before close.');
  assert.strictEqual(chat.messages[0].pending, false);
  await run("document.querySelector('.rcchat-launch').click()");
  await until("!!document.querySelector('.rcchat-compose textarea')");
  await wait(150);
  assert.strictEqual(await run('window.__requests.length'), 1, 'reopening does not resume the second paid request');
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); });
  await until("!!document.querySelector('.rcchat-launch')");
  await run("document.querySelector('.rcchat-launch').click()");
  await until("!!document.querySelector('.rcchat-queue-resume')");
  assert.strictEqual(await run('window.__requests.length'), 0, 'restarting the app never resumes a paid request automatically');
  await click('Review remaining replies', '.rcchat-queue-resume button');
  assert.strictEqual(await run('window.__requests.length'), 0, 'reviewing an interrupted queue never spends money');
  assert(await run("document.querySelector('.rcchat-queue-resume').textContent.includes('1 new paid roleplay request')"));
  await click('Confirm remaining replies', '.rcchat-queue-resume button');
  await until('window.__requests.length===1');
  requests = await run('window.__requests');
  assert(requests[0].messages.some(message => message.content === '[Speaker: Ari]\nAri finishes before close.'), 'resumed reply reads the saved completed reply');
  await finish(0, 'Bea responds after explicit resume.');
  await until("!document.querySelector('.rcchat-queue-resume')");
  await until("storage.get('chats:all').then(result=>JSON.parse(result.value)[0].messages.some(message=>message.content==='Bea responds after explicit resume.'&&!message.pending))");
  chat = await saved();
  assert.deepStrictEqual(chat.messages.filter(message => message.role === 'assistant').map(message => message.content), ['Ari finishes before close.', 'Bea responds after explicit resume.']);

  // A successful terminal event with no actual reply also cannot advance.
  await reset();
  await reviewRound('bea');
  await finish(0, '');
  await until("!document.querySelector('.rcchat-compose button.danger')");
  await wait(150);
  assert.strictEqual(await run('window.__requests.length'), 1, 'empty first reply stops the round');
  chat = await saved();
  assert.strictEqual(chat.messages[0].content, '');
  assert.strictEqual(chat.messages[0].pending, false);

  // A failed first request cannot start the second or retry on its own.
  await reset();
  await reviewRound('bea');
  await finish(0, '', 'Fixture first failure');
  await until("!document.querySelector('.rcchat-compose button.danger')");
  await wait(150);
  assert.strictEqual(await run('window.__requests.length'), 1);
  chat = await saved();
  assert.strictEqual(chat.messages.length, 1, JSON.stringify(chat.messages));
  assert(chat.messages[0].error.includes('Fixture first failure'));

  // A failed second request keeps the first, then a manual Regenerate resumes.
  await reset();
  await reviewRound('bea');
  await finish(0, 'Ari found the river crossing.');
  await until('window.__requests.length===2');
  await finish(1, '', 'Fixture second failure');
  await until("!document.querySelector('.rcchat-compose button.danger')");
  await wait(150);
  assert.strictEqual(await run('window.__requests.length'), 2, 'failed second reply is never retried automatically');
  chat = await saved();
  assert.strictEqual(chat.messages[0].content, 'Ari found the river crossing.');
  assert(chat.messages[1].error.includes('Fixture second failure'));
  await run("(()=>{const last=[...document.querySelectorAll('.rcchat-message.assistant')].at(-1);last.querySelector('.rcchat-message-actions').open=true;[...last.querySelectorAll('button')].find(button=>button.textContent.includes('Regenerate as Bea')).click()})()");
  await until('window.__requests.length===3');
  requests = await run('window.__requests');
  assert(requests[2].messages[0].content.includes('AI-controlled character: Bea'));
  await finish(2, 'Bea takes the crossing.');
  await until("!document.querySelector('.rcchat-compose button.danger')");
  chat = await saved();
  assert.strictEqual(chat.messages.at(-1).parentId, chat.messages[0].id, 'manual retry branches from the completed first reply');
  assert.strictEqual(chat.messages[0].content, 'Ari found the river crossing.');

  // Stop cancels the in-flight call and cannot advance the round.
  await reset();
  await reviewRound('bea');
  await run("(()=>{const request=window.__requests[0];window.__emit({id:request.requestId,type:'delta',text:'Ari began to speak.'})})()");
  await click('Stop');
  await wait(180);
  assert.strictEqual(await run('window.__requests.length'), 1);
  assert.strictEqual(await run('window.__cancels.length'), 1);
  chat = await saved();
  assert.strictEqual(chat.messages[0].content, 'Ari began to speak.');

  // Lock cancels the request, hides Chat, and reopening never resumes spending.
  await reset();
  await reviewRound('bea');
  await run("window.dispatchEvent(new Event('rcv-locking'))");
  await until("!document.querySelector('.rcchat-shell')");
  assert.strictEqual(await run('window.__cancels.length'), 1);
  assert.strictEqual(await run('window.__requests.length'), 1);
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); });
  await until("!!document.querySelector('.rcchat-launch')");
  await run("document.querySelector('.rcchat-launch').click()");
  await until("!!document.querySelector('.rcchat-compose textarea')");
  await wait(150);
  assert.strictEqual(await run('window.__requests.length'), 0, 'reopening a locked round makes no request');
  assert((await saved()).messages.length >= 1, 'the interrupted local branch remains recoverable');
  await run("(()=>{const last=[...document.querySelectorAll('.rcchat-message.assistant')].at(-1);last.querySelector('.rcchat-message-actions').open=true;[...last.querySelectorAll('button')].find(button=>button.textContent.includes('Regenerate as Ari')).click()})()");
  await until('window.__requests.length===1');
  assert((await run('window.__requests[0].messages[0].content')).includes('AI-controlled character: Ari'),
    'the interrupted first reply resumes only through a fresh manual request');
  await finish(0, 'Ari resumes after unlocking.');
  await until("!document.querySelector('.rcchat-compose button.danger')");
  await until("storage.get('chats:all').then(result=>JSON.parse(result.value)[0].messages.some(message=>message.content==='Ari resumes after unlocking.'&&!message.pending))");
  assert((await saved()).messages.some(message => message.content === 'Ari resumes after unlocking.'));

  // A long existing transcript may need dozens of paid history calls for a
  // newly selected speaker. One Send may make at most four, save each complete
  // checkpoint, and pause before any roleplay request or placeholder is made.
  const oldTurns = Array.from({ length: 70 }, (_, index) => ({
    id: 'history-' + index, parentId: index ? 'history-' + (index - 1) : null,
    role: index % 2 ? 'assistant' : 'user',
    speaker: index % 2 ? { characterId: 'ari', variantId: '', name: 'Ari' } : undefined,
    content: 'Shared account of the battle at the bridge. '.repeat(11),
    createdAt: index + 1,
  }));
  await reset({ contextTokens: 8000, autoMemory: true, memoryTriggerTokens: 0, messages: oldTurns, leafId: oldTurns.at(-1).id });
  await type('Robin asks Ari to continue the battle.');
  await click('Send to Ari');
  for (let index = 0; index < 4; index++) {
    await until(`window.__requests.length===${index + 1}`);
    assert.strictEqual(await run(`window.__requests[${index}].purpose`), 'memory');
    await run(`(()=>{const request=window.__requests[${index}];window.__emit({id:request.requestId,type:'delta',text:'The group fought at the bridge. [END_MEMORY]'});window.__emit({id:request.requestId,type:'finish',reason:'stop'});window.__emit({id:request.requestId,type:'done'})})()`);
  }
  await until("document.querySelector('.rcchat-error')?.textContent.includes('four paid summary batches')");
  assert.strictEqual(await run('window.__requests.length'), 4, 'no fifth summary or roleplay request starts automatically');
  chat = await saved();
  assert.strictEqual(chat.messages.length, oldTurns.length, 'the draft and pending reply are not saved before memory is ready');
  assert.strictEqual(chat.memories.length, 4, 'all four completed checkpoints are durable and can resume next Send');

  clearTimeout(timeout);
  console.log('PASS: confirmed reorderable two/three-reply queue, one draft, no auto retries, close/empty/Stop/lock recovery, and bounded resumable memory preparation');
  app.exit(0);
}).catch(error => { console.error(error.stack); clearTimeout(timeout); app.exit(1); });
