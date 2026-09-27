// Exercise the shipped cast and branch panels in a disposable phone-width UI.
const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcv-group-navigation-'));
const site = path.join(temp, 'web');
fs.cpSync(path.join(root, 'web'), site, { recursive: true });
for (const [source, target] of [
  ['app/chat.js', 'js/rolecraft-chat.js'],
  ['app/chat-sync-core.js', 'js/chat-sync-core.js'],
  ['app/chat-group-coordinator.js', 'js/chat-group-coordinator.js'],
  ['app/chat.css', 'css/chat.css'],
]) fs.copyFileSync(path.join(root, source), path.join(site, target));
app.setPath('userData', path.join(temp, 'profile'));
app.disableHardwareAcceleration();
const preload = path.join(temp, 'preload.js');
fs.writeFileSync(preload, 'window.openRouter={status:async()=>({configured:false}),onEvent:()=>()=>{},cancel:async()=>({ok:true})};');
let win;
const run = source => win.webContents.executeJavaScript(source);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(source) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await run(source)) return;
    await wait(40);
  }
  throw Error('Timed out: ' + source);
}
const timeout = setTimeout(() => { console.error('Group navigation UI timeout'); app.exit(1); }, 90000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: true, width: 360, height: 800, webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  win.setContentSize(360, 800);
  win.focus();
  await win.loadFile(path.join(site, 'index.html'));
  await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run(`(async()=>{
    await storage.set('ui:onboarded','1');
    await storage.set('chars:all',JSON.stringify([{id:'a',name:'Ari'},{id:'b',name:'Bea'}]));
    for(const key of ['personas:all','lore:all','prompts:all'])await storage.set(key,'[]');
    const I=window.__rcvChatInternals, a={characterId:'a',variantId:''}, b={characterId:'b',variantId:''}, keyB=I.participantKey(b);
    const messages=[
      {id:'m0',parentId:null,role:'user',content:'At the crossroads.',createdAt:1},
      {id:'m1',parentId:'m0',role:'assistant',content:'Choose a path.',createdAt:2},
      {id:'a2',parentId:'m1',role:'user',content:'Cross the bridge.',createdAt:3},
      {id:'a3',parentId:'a2',role:'assistant',content:'The bridge falls.',createdAt:4},
      {id:'b2',parentId:'m1',role:'user',content:'Enter the library.',createdAt:5},
      {id:'b3',parentId:'b2',role:'assistant',content:'The books stir.',createdAt:6}
    ];
    let chat={id:'group',title:'Two paths',characterId:'a',participants:[a,b],activeSpeakerKey:I.participantKey(a),originalSpeaker:{characterId:'a',variantId:'',name:'Ari'},model:'fixture',autoMemory:false,messages,leafId:'m1',createdAt:1,updatedAt:6};
    chat=I.patchScene(chat,{sceneLocation:'Crossroads',sceneState:'Everyone chooses.'});
    chat=I.navigateScene(chat,'a3');
    chat=I.patchScene(chat,{sceneLocation:'Bridge',sceneState:'The bridge is broken.',castScene:{[keyB]:{presence:'present',knowledge:'Saw the bridge fall.'}}});
    chat=I.navigateScene(chat,'b3');
    chat=I.patchScene(chat,{sceneLocation:'Library',sceneState:'The books are moving.',castScene:{[keyB]:{presence:'unknown',aiPresence:'observing',knowledge:'Knows the archive key.',aiKnowledge:'May have seen the hidden door.'}}});
    await storage.set('chats:all',JSON.stringify([chat]));
  })()`);
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); });
  await until("!!document.querySelector('.rcchat-launch')");
  await run("document.querySelector('.rcchat-launch').click()");
  await until("!!document.querySelector('.rcchat-cast-trigger')");
  // Since 1.322 the speaker control opens a quick picker; the full cast sheet is one step further.
  await run("document.querySelector('.rcchat-cast-trigger').click()");
  await until("!!document.querySelector('.rcchat-speaker-picker')");
  await run("[...document.querySelectorAll('.rcchat-speaker-picker button')].find(b=>b.textContent.includes('Manage cast')).click()");
  await until("!!document.querySelector('.rcchat-cast-sheet')");
  const cast = await run(`(()=>{const card=[...document.querySelectorAll('.rcchat-cast-card')].find(node=>node.textContent.includes('Bea'));card.querySelector('.rcchat-cast-knowledge summary').click();return card.textContent})()`);
  assert(cast.includes('observing · AI inferred'), 'effective AI presence should appear in the cast');
  assert(cast.includes('Manual note:') && cast.includes('Knows the archive key.'), 'manual knowledge should be labelled');
  assert(cast.includes('AI inference:') && cast.includes('May have seen the hidden door.'), 'AI knowledge should be labelled');
  assert(await run("document.querySelector('.rcchat-cast-sheet').textContent.includes('not a secrecy barrier')"), 'shared transcript warning stays visible');
  await run("document.querySelector('[aria-label=\"Close cast\"]').click()");
  await until("!document.querySelector('.rcchat-cast-sheet')");
  await run("document.querySelector('.rcchat-header-options').open=true");
  await run("document.querySelector('[aria-label=\"Story branches\"]').click()");
  await until("!!document.querySelector('.rcchat-branch-card')");
  const branches = await run("[...document.querySelectorAll('.rcchat-branch-card')].map(card=>card.textContent)");
  assert.strictEqual(branches.length, 2);
  assert(branches.some(text => text.includes('Bridge') && text.includes('The bridge is broken.') && text.includes('Bea present')), 'bridge checkpoint should be shown');
  assert(branches.some(text => text.includes('Library') && text.includes('The books are moving.') && text.includes('Bea observing')), 'library checkpoint should be shown');
  assert(!branches.some(text => text.includes('Bridge') && text.includes('The books are moving.')), 'sibling scene must not leak into another branch preview');
  const geometry = await run("(()=>{const panel=document.querySelector('.rcchat-modal');return{right:panel.getBoundingClientRect().right,overflow:document.querySelector('#rcv-chat-root').scrollWidth-innerWidth}})()");
  assert(geometry.right <= 361 && geometry.overflow <= 1, JSON.stringify(geometry));
  clearTimeout(timeout);
  console.log('PASS: effective cast knowledge and branch checkpoint previews fit on a phone');
  app.exit(0);
}).catch(error => { console.error(error.stack); clearTimeout(timeout); app.exit(1); });
