// Source-backed phone UI check for review-before-save scene notes and scoped events.
const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcv-scene-ledger-ui-'));
const site = path.join(tmp, 'web');
fs.cpSync(path.join(root, 'web'), site, { recursive: true });
for (const [source, target] of [['app/chat.js', 'js/rolecraft-chat.js'], ['app/chat-sync-core.js', 'js/chat-sync-core.js'], ['app/chat.css', 'css/chat.css']]) fs.copyFileSync(path.join(root, source), path.join(site, target));
app.setPath('userData', path.join(tmp, 'profile'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const preload = path.join(tmp, 'preload.js');
fs.writeFileSync(preload, 'window.openRouter={status:async()=>({configured:false}),onEvent:()=>()=>{},cancel:async()=>({ok:true})};');
let win;
const run = expression => win.webContents.executeJavaScript(expression);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) { for (let i = 0; i < 150; i++) { if (await run(expression)) return; await wait(40); } throw new Error('Timed out: ' + expression); }
async function setInput(selector, text) {
  await run(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
}
const timeout = setTimeout(() => { console.error('Scene ledger UI timeout'); app.exit(1); }, 90000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: true, width: 360, height: 800, webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  win.setContentSize(360, 800); win.focus();
  await win.loadFile(path.join(site, 'index.html'));
  await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run(`(async()=>{await storage.set('ui:onboarded','1');await storage.set('chars:all',JSON.stringify([{id:'a',name:'Ari',story:'Ari profile'},{id:'b',name:'Bea',story:'Bea profile'}]));for(const key of ['personas:all','lore:all','prompts:all'])await storage.set(key,'[]');await storage.set('chats:all',JSON.stringify([{id:'g',title:'Group',characterId:'a',participants:[{characterId:'a',variantId:''},{characterId:'b',variantId:''}],activeSpeakerKey:JSON.stringify(['a','']),originalSpeaker:{characterId:'a',variantId:'',name:'Ari'},model:'fixture',messages:[{id:'m0',parentId:null,role:'user',content:'We reached the bridge.',createdAt:1},{id:'m1',parentId:'m0',role:'assistant',speaker:{characterId:'a',variantId:'',name:'Ari'},content:'I saw Bea across the bridge.',createdAt:2}],leafId:'m1',createdAt:1,updatedAt:2}]));})()`);
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); });
  await until("!!document.querySelector('.rcchat-launch')");
  await run("document.querySelector('.rcchat-launch').click()");
  await until("!!document.querySelector('.rcchat-header-options')");
  await run("document.querySelector('.rcchat-header-options').open=true");
  await run("document.querySelector('[aria-label=\"Scene panel\"]').click()");
  await until("!!document.querySelector('#rcchat-scene-state')");
  await run("[...document.querySelectorAll('button')].find(button=>button.textContent==='Draft from recent turns').click()");
  await until("!!document.querySelector('[aria-label=\"Review scene draft\"]')");
  assert(await run("document.querySelector('[aria-label=\"Review scene draft\"]').value.includes('bridge')"));
  assert.strictEqual(await run("storage.get('chats:all').then(result=>JSON.parse(result.value)[0].sceneState||'')"), '', 'drafting never saves before approval');
  await setInput('[aria-label="Review scene draft"]', 'Everyone is at the bridge; Bea is visible across it.');
  await run("[...document.querySelectorAll('button')].find(button=>button.textContent==='Apply reviewed scene').click()");
  await until("storage.get('chats:all').then(result=>JSON.parse(result.value)[0].sceneState==='Everyone is at the bridge; Bea is visible across it.')");
  await run("document.querySelector('.rcchat-private-events>summary').click()");
  await setInput('#rcchat-private-event-text', 'Ari learned a private route.');
  await run("document.querySelector('.rcchat-event-audience input').click()");
  await run("[...document.querySelectorAll('button')].find(button=>button.textContent==='Save private event').click()");
  await until("storage.get('chats:all').then(result=>(JSON.parse(result.value)[0].sceneEvents||[]).length===1)");
  const saved = await run("storage.get('chats:all').then(result=>JSON.parse(result.value)[0])");
  assert.strictEqual(saved.sceneEvents[0].audience[0], JSON.stringify(['a', '']));
  assert(saved.sceneVersions && saved.sceneVersions.m1, 'scene approval and private events are checkpointed on the current branch');
  const geometry = await run("(()=>{const panel=document.querySelector('.rcchat-modal'),field=document.querySelector('#rcchat-private-event-text');return{panel:panel.getBoundingClientRect().width,field:field.getBoundingClientRect().width,overflow:document.querySelector('#rcv-chat-root').scrollWidth-innerWidth}})()");
  assert(geometry.field >= 200 && geometry.panel <= 361 && geometry.overflow <= 1, JSON.stringify(geometry));
  clearTimeout(timeout); console.log('PASS: phone scene draft needs approval; scoped event saves and fits without overflow'); app.exit(0);
}).catch(error => { console.error(error.stack); clearTimeout(timeout); app.exit(1); });
