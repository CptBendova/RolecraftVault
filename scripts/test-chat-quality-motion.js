// Real renderer, disposable storage and a fake provider. No paid requests.
const {app,BrowserWindow}=require('electron'),assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-quality-'));
app.setPath('userData',tmp);app.commandLine.appendSwitch('force-device-scale-factor','1');
const preload=path.join(tmp,'provider.js');
fs.writeFileSync(preload,`window.openRouter={status:async()=>({configured:true}),onEvent:cb=>{window.__emit=cb;return()=>{}},start:async r=>{window.__request=r;window.__emit({id:r.requestId,type:'delta',text:'A quiet reply. "Welcome back."'});return {ok:true}},cancel:async()=>({ok:true})};`);
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=s=>win.webContents.executeJavaScript(s);
async function until(s){for(let i=0;i<180;i++){if(await run(s))return;await wait(50)}throw Error('Timeout: '+s)}
const click=label=>run(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(label === "Chat" ? "#rcv-sidebar-chat button,#rcv-dashboard-chat button" : "#rcv-chat-root button")})].find(b=>[b.getAttribute('aria-label'),b.textContent].some(v=>v&&v.trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)}));if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);
const motion=()=>run("[...document.querySelectorAll('.rcchat-writing-dots>i')].map(e=>({name:getComputedStyle(e).animationName,state:getComputedStyle(e).animationPlayState}))");
const timer=setTimeout(()=>app.exit(1),90000);
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.setContentSize(360,800);win.focus();
 await win.loadFile(path.join(root,'web/index.html'));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
 win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await run(`(async()=>{localStorage.setItem('rcv-perfmode','quality');await window.storage.set('ui:onboarded','1');await window.storage.set('chars:all',JSON.stringify([{id:'c',name:'Ari',sections:[],gallery:[],tags:[]}]));for(const k of ['personas:all','lore:all','prompts:all'])await window.storage.set(k,'[]');const messages=Array.from({length:12},(_,i)=>({id:'m'+i,parentId:i?'m'+(i-1):null,role:i%2?'user':'assistant',content:'An older passage. '.repeat(30)}));await window.storage.set('chats:all',JSON.stringify([{id:'s',title:'Quality fixture',characterId:'c',model:'fixture',messages,leafId:'m11'}]))})()`);
 await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload()});await until("!!document.querySelector('.rcchat-launch')");await click('Chat');await until("!!document.querySelector('.rcchat-compose textarea')");
 await run("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))");
 await run("(()=>{const e=document.querySelector('.rcchat-compose textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Hello');e.dispatchEvent(new Event('input',{bubbles:true}))})()");await click('Send');await until("!!document.querySelector('.rcchat-writing[data-motion=on]')");
 const activeMotion=await motion();assert.equal(activeMotion.length,3);assert(activeMotion.every(x=>x.name==='rcchat-quality-dot'&&x.state==='running'),JSON.stringify(activeMotion));
 assert.notEqual(await run("getComputedStyle(document.querySelector('.rcchat-message')).boxShadow"),'none','Quality adds theme depth');
 await run("document.querySelector('.rcchat-messages').scrollTop=0");await until("!!document.querySelector('.rcchat-writing[data-motion=off]')");assert((await motion()).every(x=>x.name==='none'),'offscreen writing stops all repeat motion');
 await run("document.querySelector('.rcchat-messages').scrollTop=1e8");await until("!!document.querySelector('.rcchat-writing[data-motion=on]')");
 await run("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");assert((await motion()).every(x=>x.state==='paused'),'hidden window pauses immediately');
 await run("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))");assert((await motion()).every(x=>x.state==='running'));
 await run("document.querySelector('.rcv').classList.add('perf')");await until("document.querySelector('#rcv-chat-root').classList.contains('rcchat-perf')");assert((await motion()).every(x=>x.name==='none'));assert.equal(await run("getComputedStyle(document.querySelector('.rcchat-bubble')).boxShadow"),'none');
 await run("document.querySelector('.rcv').classList.remove('perf')");await until("!document.querySelector('#rcv-chat-root').classList.contains('rcchat-perf')");
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert((await motion()).every(x=>x.name==='none'));
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'forced-colors',value:'active'}]});assert.equal(await run("getComputedStyle(document.querySelector('.rcchat-side')).backgroundImage"),'none');
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});await run("document.querySelector('.rcchat-compose textarea').blur()");await click('Stop');await until("!document.querySelector('.rcchat-writing')");await wait(350);assert(await run("!document.querySelector('.rcchat-compose textarea').matches(':focus')"),'completion must not refocus the composer');
 for(const [w,h] of [[360,380],[800,900],[1440,900]]){win.setContentSize(w,h);await wait(350);assert(await run("document.querySelector('.rcchat-shell').scrollWidth<=innerWidth+1"));if(w===360)assert(await run("document.querySelector('.rcchat-head').getBoundingClientRect().height<=66&&document.querySelector('.rcchat-messages').clientHeight>=220"),'compact keyboard layout');}
 console.log('PASS Quality depth, visible-only writing dots, hidden-window pause, Performance/reduced-motion/forced-colour gates, unchanged focus and responsive fit');clearTimeout(timer);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(timer);app.exit(1)});
