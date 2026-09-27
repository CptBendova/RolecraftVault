// Real UI, disposable history, fake native provider: no network or user vault.
const {app,BrowserWindow}=require('electron');
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-chat-typing-')),site=path.join(tmp,'web');
fs.cpSync(path.join(root,'web'),site,{recursive:true});
const source=process.env.RCV_CHAT_REGRESSION_BASE?require('child_process').execFileSync('git',['show',process.env.RCV_CHAT_REGRESSION_BASE+':app/chat.js'],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,'app/chat.js'),'utf8');
// Count actual parent renders, without changing hooks or the shipped algorithm.
fs.writeFileSync(path.join(site,'js/rolecraft-chat.js'),source.replace('function ChatApp() {','function ChatApp() { window.__chatRenders=(window.__chatRenders||0)+1;').replace('function assemble(chat, library, extraUser, models) {','function assemble(chat, library, extraUser, models) { window.__contextScans=(window.__contextScans||0)+1;'));
const preload=path.join(tmp,'preload.js');
fs.writeFileSync(preload,`window.openRouter={status:async()=>({configured:true}),models:async()=>({ok:true,models:[]}),onEvent:cb=>{window.__replyEvent=cb;return()=>{}},start:async r=>{window.__requests=(window.__requests||[]).concat([r]);return{ok:true}},cancel:async()=>({ok:true})};`);
app.setPath('userData',path.join(tmp,'profile'));app.commandLine.appendSwitch('force-device-scale-factor','1');
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=s=>win.webContents.executeJavaScript(s);
async function until(s){for(let i=0;i<160;i++){if(await run(s))return;await wait(50)}throw Error('Timed out: '+s)}
async function button(label){await run(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button');b.click()})()`)}
const timer=setTimeout(()=>{console.error('Typing regression timeout');app.exit(1)},90000);
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.setContentSize(360,800);win.focus();
 await win.loadFile(path.join(site,'index.html'));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
 await run(`(async()=>{await window.storage.set('ui:onboarded','1');await window.storage.set('chars:all',JSON.stringify([{id:'c',name:'Ari',sections:[],gallery:[],tags:[]}]));for(const k of ['personas:all','lore:all','prompts:all'])await window.storage.set(k,'[]');await window.storage.set('chats:all',JSON.stringify([{id:'story',title:'Typing fixture',characterId:'c',model:'test/model',contextTokens:32000,autoMemory:false,leafId:'m199',messages:Array.from({length:200},(_,i)=>({id:'m'+i,parentId:i?'m'+(i-1):null,role:i%2?'assistant':'user',content:'History turn '+i+'. The river flows gently.'}))}]))})()`);
 await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload()});await until("!!document.querySelector('.rcchat-launch')");await run("document.querySelector('.rcchat-launch').click()");await until("!!document.querySelector('.rcchat-compose textarea')");await wait(1600);
 assert.equal(await run("document.querySelectorAll('.rcchat-message').length"),12,'phone limits only rendered history');
 assert(await run("window.RolecraftChatOpen&&document.querySelector('.rcv').classList.contains('workspace-paused')"),'library is suspended behind chat');
 await run("window.__themeWrites=0;const hostStyle=document.getElementById('rcv-chat-root').style,put=hostStyle.setProperty;hostStyle.setProperty=function(...args){window.__themeWrites++;return put.apply(this,args)};void 0");
 await wait(1200);assert.equal(await run('window.__themeWrites'),0,'no recurring theme rewrites');
 await run("document.querySelector('.rcchat-messages>button').click()");await until("document.querySelectorAll('.rcchat-message').length===24");await button('Show latest messages only');await until("document.querySelectorAll('.rcchat-message').length===12");await wait(900);
 win.webContents.debugger.attach('1.3');await run("document.querySelector('.rcchat-compose textarea').focus()");
 const before=await run('window.__chatRenders');
 const scans=await run('window.__contextScans||0');
 for(const text of 'An immediate corrected reply.'){await win.webContents.debugger.sendCommand('Input.insertText',{text});}
 assert.equal(await run('window.__chatRenders'),before,'keystrokes must not rerender ChatApp/transcript');
 await wait(1100);assert.equal(await run('window.__contextScans||0'),scans,'a typing pause does not scan context in the background');
 assert(await run('window.RolecraftChatSyncIdle()'),'a focused composer permits incoming chat updates after draft saving');
 await run(`(async()=>{const r=await window.storage.get('chats:all'),rows=JSON.parse(r.value);rows[0].messages[199].content='A completed reply received from my phone.';await window.storage.set('chats:all',JSON.stringify(rows));await window.RolecraftChatReloadStories()})()`);
 await until("document.querySelector('.rcchat-messages').textContent.includes('A completed reply received from my phone.')");
 assert.equal(await run("document.querySelector('.rcchat-compose textarea').value"),'An immediate corrected reply.','incoming replies do not overwrite a local draft');
 assert(await run("document.activeElement===document.querySelector('.rcchat-compose textarea')"),'incoming replies keep composer focus');
 await button('Send');await until('window.__requests&&window.__requests.length===1');
 const payload=await run('window.__requests[0]');assert.equal(payload.messages.at(-1).content,'An immediate corrected reply.','Send reads live text before the advisory debounce');assert.equal(payload.messages.length,202,'all 200 history turns plus system and new message, not just the 12 rendered');assert(payload.messages.some(m=>m.content.startsWith('History turn 0.')));
 await until("document.querySelector('.rcchat-compose textarea').value===''");
 await run("window.__replyEvent({id:window.__requests[0].requestId,type:'delta',text:'A partial reply worth keeping.'});document.querySelector('.rcchat-compose textarea').blur()");await wait(120);
 await run("window.__replyEvent({id:window.__requests[0].requestId,type:'error',error:'Connection interrupted. Use Regenerate to try again.'})");
 await until("[...document.querySelectorAll('.rcchat-error')].some(e=>e.textContent.includes('Connection interrupted'))");
 assert(await run("document.activeElement!==document.querySelector('.rcchat-compose textarea')"),'completion/error must not open keyboard');assert.equal(await run('window.__requests.length'),1,'no automatic paid retry');
 await until("(async()=>JSON.parse((await window.storage.get('chats:all')).value)[0].messages.at(-1).content==='A partial reply worth keeping.')()");
 assert.equal(await run("(async()=>JSON.parse((await window.storage.get('chats:all')).value)[0].messages.length)()"),202,'display window never deletes history');
 win.setContentSize(1440,900);await wait(150);assert(await run("document.querySelector('.rcchat-shell').scrollWidth<=innerWidth+1"));
 console.log('PASS isolated typing, live Send, 12-message view with complete AI history, persisted partial replies, visible error, no paid retry or keyboard theft');clearTimeout(timer);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(timer);app.exit(1)});
