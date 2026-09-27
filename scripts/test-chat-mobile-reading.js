/* Real private UI: long loaded stories, touch keyboard geometry and Options. */
const {app,BrowserWindow}=require('electron');
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-mobile-reading-'));
let site=path.join(root,'web');
if(process.env.RCV_CHAT_REGRESSION_BASE){
  site=path.join(tmp,'previous-web');fs.cpSync(path.join(root,'web'),site,{recursive:true});
  for(const [source,target] of [['app/chat.js','js/rolecraft-chat.js'],['app/chat.css','css/chat.css']])fs.writeFileSync(path.join(site,target),require('child_process').execFileSync('git',['show',process.env.RCV_CHAT_REGRESSION_BASE+':'+source],{cwd:root}));
}
app.setPath('userData',tmp);app.commandLine.appendSwitch('force-device-scale-factor','1');
const preload=path.join(tmp,'preload.js');
fs.writeFileSync(preload,`window.openRouter={status:async()=>({configured:true}),models:async()=>({ok:true,models:[]}),onEvent:cb=>{window.__replyEvent=cb;return()=>{}},start:async r=>{window.__request=r;return{ok:true}},cancel:async()=>({ok:true})};`);
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=async s=>{try{return await win.webContents.executeJavaScript(s)}catch(e){throw Error(e.message+'\nProbe: '+s)}};
async function until(s){for(let i=0;i<160;i++){if(await run(s))return;await wait(50);}throw Error('Timed out: '+s);}
async function click(label){await run(`(()=>{const b=[...(${JSON.stringify(label)}==='Chat'?document.querySelector('.rcchat-launch')?.parentElement:(document.querySelector('.rcchat-modal')||document.querySelector('#rcv-chat-root'))).querySelectorAll('button,summary')].find(e=>[e.getAttribute('aria-label'),e.textContent].some(v=>v&&v.trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)})&&e.getClientRects().length);if(!b)throw Error('Missing visible '+${JSON.stringify(label)});b.click()})()`);await wait(100);}
const bottom="(()=>{const m=document.querySelector('.rcchat-messages');return m&&m.scrollHeight-m.scrollTop-m.clientHeight<3})()";
async function geometry(){const g=await run("(()=>{const head=document.querySelector('.rcchat-head').getBoundingClientRect(),foot=document.querySelector('.rcchat-compose').getBoundingClientRect(),messages=document.querySelector('.rcchat-messages').getBoundingClientRect();return{head:head.height,foot:foot.height,messages:messages.height,bottom:foot.bottom,overflow:document.querySelector('.rcchat-shell').scrollWidth-innerWidth}})()");assert(g.head<=66&&g.foot<=80&&g.messages>=innerTarget-150&&g.bottom<=innerTarget+1&&g.overflow<=1,JSON.stringify(g));return g;}
let innerTarget=800;
const timeout=setTimeout(()=>{console.error('Mobile reading test timed out');app.exit(1)},120000);
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.setContentSize(360,800);win.focus();
  await win.loadFile(path.join(site,'index.html'));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  console.log('Loaded disposable UI');
  await run(`(async()=>{await window.storage.set('ui:onboarded','1');await window.storage.set('chars:all',JSON.stringify([{id:'c',name:'Ari',sections:[],gallery:[],variants:[],tags:[]}]));for(const k of ['personas:all','lore:all','prompts:all'])await window.storage.set(k,'[]');await window.storage.set('chats:all',JSON.stringify(['A','B'].map(name=>({id:name,title:'Story '+name,characterId:'c',model:'deepseek/deepseek-v4-flash-0731',autoMemory:false,leafId:'m119',messages:Array.from({length:120},(_,i)=>({id:'m'+i,parentId:i?'m'+(i-1):null,role:i%2?'assistant':'user',content:name+' '+i+' *The traveller pauses beside the river.* "We will find our way." '.repeat(5)}))}))));})()`);
  await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload()});await until("!!document.querySelector('.rcchat-launch')");await click('Chat');await until(bottom);
  console.log('Opened long chat at latest');
  assert(await run("matchMedia('(pointer:coarse)').matches&&document.activeElement!==document.querySelector('.rcchat-compose textarea')"),'opening on touch does not summon the keyboard');
  await geometry();assert(await run("!document.querySelector('.rcchat-header-options').open"));
  await run("document.querySelector('.rcchat-messages').scrollTop=0");await wait(80);
  await click('Chat options');await click('Return to vault');await click('Chat');await until(bottom);
  await click('Show conversations');await run("[...document.querySelectorAll('.rcchat-convo')].find(b=>b.querySelector('strong').textContent==='Story B').click()");await until("document.querySelector('.rcchat-title').textContent==='Story B'");await until(bottom);
  console.log('Reopen and equal-length story switch passed');
  await click('Chat options');for(const label of ['Scene panel','Story branches','Inspect context','Conversation settings','Choose chat model'])assert(await run(`!![...document.querySelectorAll('.rcchat-headtools button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}&&b.getClientRects().length)`),label);
  await click('Choose chat model');await until("!!document.querySelector('.rcchat-modal')");await run("window.__rcvWorkspaceBack()");await until("!document.querySelector('.rcchat-modal')");
  await click('Chat options');await run("window.__rcvWorkspaceBack()");await until("!document.querySelector('.rcchat-header-options').open");assert(await run("!!document.querySelector('.rcchat-shell')"),'Back closes Options before chat');
  console.log('Options and model picker passed');
  await run("(()=>{const m=document.querySelector('.rcchat-messages');m.style.maxHeight='180px';m.dispatchEvent(new Event('scroll'))})()");await until(bottom);
  await run("document.querySelector('.rcchat-messages').style.maxHeight=''");await wait(80);await until(bottom);
  await run("document.querySelector('.rcchat-compose textarea').focus()");innerTarget=380;win.setContentSize(360,380);await until('innerHeight===380');await wait(150);await geometry();await until(bottom);
  const dir=path.join(root,'dist','screenshots');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'chat-1.268-keyboard.png'),(await win.webContents.capturePage()).toPNG());
  assert(await run("(()=>{const t=document.querySelector('.rcchat-compose textarea');return t.autocomplete==='on'&&t.getAttribute('autocorrect')==='on'&&t.autocapitalize==='sentences'&&t.spellcheck})()"));
  await win.webContents.debugger.sendCommand('Input.imeSetComposition',{text:'teh',selectionStart:3,selectionEnd:3});
  await run("document.querySelector('.rcchat-compose textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,isComposing:true,keyCode:229}))");assert(!(await run('!!window.__request')),'IME composition never sends');
  await win.webContents.debugger.sendCommand('Input.insertText',{text:'the corrected reply'});await wait(80);assert.equal(await run("document.querySelector('.rcchat-compose textarea').value"),'the corrected reply');
  await click('Send');await until('!!window.__request');await until(bottom);await run("document.querySelector('.rcchat-messages').scrollTop=0");await wait(80);
  await run("window.__replyEvent({id:window.__request.requestId,type:'delta',text:'A new answer arrives. '.repeat(30)})");await wait(200);assert(await run("document.querySelector('.rcchat-messages').scrollTop<3"),'streaming respects reading older messages');
  await run("window.__replyEvent({id:window.__request.requestId,type:'done'})");await wait(100);assert(await run("document.querySelector('.rcchat-messages').scrollTop<3"));
  innerTarget=800;win.setContentSize(360,800);await until('innerHeight===800');await click('Chat options');await click('Return to vault');await click('Chat');await until(bottom);await geometry();
  fs.writeFileSync(path.join(dir,'chat-1.268-phone.png'),(await win.webContents.capturePage()).toPNG());
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root,'mobile/capacitor.config.json'))).android.captureInput,false);
  console.log('PASS latest on open/reopen/switch, no streaming scroll theft, compact touch UI, Options/Back, keyboard corrections and IME composition');clearTimeout(timeout);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(timeout);app.exit(1)});
