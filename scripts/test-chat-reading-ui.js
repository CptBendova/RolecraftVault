const {app,BrowserWindow}=require('electron');
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-chat-reading-'));
app.setPath('userData',tmp);app.commandLine.appendSwitch('force-device-scale-factor','1');
let win,failed=0;const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=s=>win.webContents.executeJavaScript(s);
async function until(s){for(let i=0;i<160;i++){if(await run(s))return;await wait(50)}throw Error('Timed out: '+s)}
async function check(name,fn){try{await fn();console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+': '+e.message)}}
const timer=setTimeout(()=>{console.error('Chat reading timeout');app.exit(1)},90000);
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.setContentSize(360,800);win.focus();
 await win.loadFile(path.join(root,'web/index.html'));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
 await run(`(async()=>{await window.storage.set('ui:onboarded','1');await window.storage.set('chars:all',JSON.stringify([{id:'c',name:'Ari',sections:[],gallery:[],tags:[]}]));for(const k of ['personas:all','lore:all','prompts:all'])await window.storage.set(k,'[]');const messages=Array.from({length:200},(_,i)=>({id:'m'+i,parentId:i?'m'+(i-1):null,role:i%2?'user':'assistant',content:'Turn '+i+' — '+('The rain falls gently outside the window. '.repeat(5))}));await window.storage.set('chats:all',JSON.stringify([{id:'s',title:'Reading fixture',characterId:'c',messages,leafId:'m199'}]))})()`);
 await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload()});await until("!!document.querySelector('.rcchat-launch')");await run("document.querySelector('.rcchat-launch').click()");await until("document.querySelectorAll('.rcchat-message').length===12");await wait(400);
 for(const width of [360,1440]){
  win.setContentSize(width,800);await wait(150);
  await check('conversation drawer preserves older-message reading position at '+width+'px',async()=>{
   await run("(()=>{const n=document.querySelector('.rcchat-messages');n.scrollTop=n.scrollHeight/2;n.dispatchEvent(new Event('scroll',{bubbles:true}));window.beforeChatScroll=n.scrollTop})()");await wait(80);
   await run("document.querySelector('[aria-label=\"Show conversations\"]').click()");await wait(150);
   assert(await run("Math.abs(document.querySelector('.rcchat-messages').scrollTop-window.beforeChatScroll)<3"),'opening drawer jumped to latest reply');
  });
  await run("document.querySelector('.rcchat-convo').click()");await wait(100);
 }
 win.setContentSize(360,800);await wait(150);
 await check('show earlier messages preserves the first visible message position',async()=>{
  await run("(()=>{const n=document.querySelector('.rcchat-messages');n.scrollTop=0;n.dispatchEvent(new Event('scroll',{bubbles:true}));const first=n.querySelector('.rcchat-message');window.readAnchor={text:first.querySelector('.rcchat-prose').textContent,top:first.getBoundingClientRect().top}})()");await wait(60);
  await run("document.querySelector('.rcchat-messages>button').click()");await until("document.querySelectorAll('.rcchat-message').length===24");
  const offset=await run("(()=>{const e=[...document.querySelectorAll('.rcchat-message')].find(e=>e.querySelector('.rcchat-prose').textContent===window.readAnchor.text);return e.getBoundingClientRect().top-window.readAnchor.top})()");assert(Math.abs(offset)<3,'anchor moved '+offset+'px');
 });
 clearTimeout(timer);app.exit(failed?1:0);
}).catch(e=>{console.error(e.stack);clearTimeout(timer);app.exit(1)});
