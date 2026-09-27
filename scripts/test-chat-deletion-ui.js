// Real private renderer, isolated storage and no provider traffic.
const {app,BrowserWindow}=require('electron');
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-chat-delete-'));
app.setPath('userData',tmp);app.commandLine.appendSwitch('force-device-scale-factor','1');
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=async s=>{try{return await win.webContents.executeJavaScript(s)}catch(e){throw Error(e.message+'\nProbe: '+s)}};
async function until(s){for(let i=0;i<140;i++){if(await run(s))return;await wait(50)}throw Error('Timed out: '+s)}
async function click(label){await run(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(label === "Chat" ? "#rcv-sidebar-chat button,#rcv-dashboard-chat button" : "#rcv-chat-root button")})].find(b=>(b.getAttribute('aria-label')||b.textContent).trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);await wait(80)}
let failures=0;function check(ok,reason){if(ok)console.log('PASS '+reason);else{failures++;console.error('FAIL '+reason)}}
const timeout=setTimeout(()=>{console.error('Deletion UI timeout');app.exit(1)},60000);
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.setContentSize(360,800);win.focus();
  win.webContents.on('console-message',e=>{if(e.level==='error')console.error(e.message)});
  await win.loadFile(path.join(root,'web/index.html'));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run(`(async()=>{await window.storage.set('ui:onboarded','1');for(const k of ['chars:all','personas:all','lore:all','prompts:all'])await window.storage.set(k,'[]');await window.storage.set('chats:all',JSON.stringify(['First','Deleted','Survivor'].map((title,i)=>({id:'c'+i,title,characterId:'ari',castSnapshot:{character:{id:'ari',name:'Ari',story:'A traveller'},lore:[]},model:'fixture',messages:[{id:'m'+i,parentId:null,role:'assistant',content:'Welcome to '+title}],leafId:'m'+i,_sync:{rev:'rev'+i,ancestors:[],deleted:i===1}}))))})()`);
  await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload()});await until("!!document.querySelector('.rcchat-launch')");await click('Chat');
  check(await run("document.querySelector('.rcchat-msghead strong').textContent==='Ari'"),'saved cast name labels replies when the live card is unavailable');
  await wait(350);await click('Conversation settings');await click('Delete conversation');await click('Move to recently deleted');await until("!document.querySelector('.rcchat-modal')");
  check(await run("document.querySelector('.rcchat-title').textContent==='Survivor'"),'deleting selects a live conversation, skipping earlier tombstones');
  const stored=await run("window.storage.get('chats:all').then(r=>JSON.parse(r.value))");
  assert(stored.find(c=>c.id==='c0')._sync.deleted&&stored.find(c=>c.id==='c1')._sync.deleted);
  assert(!stored.find(c=>c.id==='c2')._sync.deleted,'remaining story stays live');
  if(!failures){win.setContentSize(1440,900);await click('Conversation settings');await click('Delete conversation');await click('Move to recently deleted');await until("!document.querySelector('.rcchat-modal')");assert(await run("!!document.querySelector('.rcchat-empty')"),'last deletion leaves the intentional empty state');}
  clearTimeout(timeout);app.exit(failures?1:0);
}).catch(e=>{console.error(e.stack);clearTimeout(timeout);app.exit(1)});
