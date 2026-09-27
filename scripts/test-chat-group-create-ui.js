// Exercise the real new-story wizard with a disposable web vault and fake provider.
const { app, BrowserWindow } = require('electron');
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcv-group-create-')), site = path.join(tmp, 'web');
fs.cpSync(path.join(root, 'web'), site, { recursive: true });
for (const [source, target] of [['app/chat.js', 'js/rolecraft-chat.js'], ['app/chat-sync-core.js', 'js/chat-sync-core.js'], ['app/chat.css', 'css/chat.css']]) fs.copyFileSync(path.join(root, source), path.join(site, target));
app.setPath('userData', path.join(tmp, 'profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
const preload = path.join(tmp, 'preload.js');
fs.writeFileSync(preload, "window.__requests=[];window.openRouter={status:async()=>({configured:true}),onEvent:()=>()=>{},cancel:async()=>({ok:true}),start:async request=>{window.__requests.push(request);return {ok:true}}};");
let win;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = async source => { try { return await win.webContents.executeJavaScript(source); } catch (error) { throw Error(error.message + '\nProbe: ' + source); } };
async function until(source) { for (let i = 0; i < 120; i++) { if (await run(source)) return; await wait(50); } throw Error('Timed out: ' + source); }
async function click(label, selector = '#rcv-chat-root button') {
  await run(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>(item.getAttribute('aria-label')||item.textContent).trim()===${JSON.stringify(label)});if(!button)throw Error('Missing '+${JSON.stringify(label)});button.click()})()`);
  await wait(40);
}
async function card(name, selector) {
  await run(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.querySelector('strong')?.textContent===${JSON.stringify(name)});if(!button)throw Error('Missing card '+${JSON.stringify(name)});button.click()})()`);
  await wait(40);
}
const timeout = setTimeout(() => { console.error('Group creation UI timeout'); app.exit(1); }, 90000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: true, width: 360, height: 800, webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  await win.loadFile(path.join(site, 'index.html'));
  await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run(`(async()=>{await window.storage.set('ui:onboarded','1');await window.storage.set('chars:all',JSON.stringify([{id:'ari',name:'Ari',firstMessage:'Ari opens the scene.'},{id:'bea',name:'Beatrice',firstMessage:'Beatrice opens the scene.'},{id:'cy',name:'Cyra'}]));for(const key of ['personas:all','lore:all','prompts:all','chats:all'])await window.storage.set(key,'[]')})()`);
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); });
  await until("!!document.querySelector('.rcchat-launch')");
  await click('Chat', '#rcv-sidebar-chat button,#rcv-dashboard-chat button');
  await until("!!document.querySelector('.rcchat-wizard')");
  await card('Ari', '.rcchat-wizard .rcchat-cast-grid button');
  await click('+ Add characters to this story');
  await card('Beatrice', '[aria-label="Add characters to group cast"] button');
  await card('Cyra', '[aria-label="Add characters to group cast"] button');
  assert(await run("document.querySelector('.rcchat-wizard').textContent.includes('Group cast: Ari, Beatrice, Cyra')"));
  assert(await run("(()=>{const dialog=document.querySelector('.rcchat-wizard'),grid=document.querySelector('[aria-label=\"Add characters to group cast\"]'),cards=[...grid.querySelectorAll('button')],r=dialog.getBoundingClientRect();return dialog.scrollWidth<=dialog.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&cards.every(card=>card.getBoundingClientRect().width>=120)})()"), 'group picker fits a 360px phone');
  await click('Continue');
  await click('Continue');
  await until("!!document.querySelector('#rcchat-first-speaker')");
  assert(await run("document.querySelector('.rcchat-wizard').textContent.includes('blank shared scene')"));
  assert(await run("document.querySelector('#rcchat-first-speaker').getBoundingClientRect().height>=48"), 'speaker choice is touch sized');
  assert.strictEqual(await run("document.querySelector('#rcchat-new-group-lore-scope').value"), 'speaker', 'new groups default to speaker lore');
  await run("(()=>{const control=document.querySelector('#rcchat-first-speaker');control.value=JSON.stringify(['bea','']);control.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await click('Create roleplay', '.rcchat-wizard button');
  await until("window.storage.get('chats:all').then(result=>JSON.parse(result.value).length===1)");
  const group = await run("window.storage.get('chats:all').then(result=>JSON.parse(result.value)[0])");
  assert.deepStrictEqual(group.participants.map(p => p.characterId), ['ari', 'bea', 'cy']);
  assert.strictEqual(group.activeSpeakerKey, JSON.stringify(['bea', '']));
  assert.strictEqual(group.groupLoreScope, 'speaker', 'new group scope is saved');
  assert.deepStrictEqual(group.messages, [], 'group starts with a blank shared scene');
  assert.strictEqual(await run('window.__requests.length'), 0, 'creation stays local');
  await click('+ New roleplay');
  await until("!!document.querySelector('.rcchat-wizard')");
  await card('Ari', '.rcchat-wizard .rcchat-cast-grid button');
  await click('Continue');
  await click('Continue');
  assert(!await run("!!document.querySelector('#rcchat-first-speaker')"), 'solo flow keeps its original review');
  await click('Create roleplay', '.rcchat-wizard button');
  await until("window.storage.get('chats:all').then(result=>JSON.parse(result.value).length===2)");
  const solo = await run("window.storage.get('chats:all').then(result=>JSON.parse(result.value)[0])");
  assert.strictEqual(solo.messages.length, 1);
  assert.strictEqual(solo.messages[0].content, 'Ari opens the scene.');
  assert.strictEqual(await run('window.__requests.length'), 0);
  console.log('PASS group creation cast, first speaker, blank shared scene, offline creation and solo greeting');
  clearTimeout(timeout); app.exit(0);
}).catch(error => { console.error(error.stack); clearTimeout(timeout); app.exit(1); });
