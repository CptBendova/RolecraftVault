// Real private renderer with offline provider/link fixtures and a disposable vault.
const {app,BrowserWindow}=require("electron"),assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const root=path.join(__dirname,".."),tmp=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-chat-polish-"));app.setPath("userData",tmp);app.commandLine.appendSwitch("force-device-scale-factor","1");
const preload=path.join(tmp,"preload.js");
fs.writeFileSync(preload,`/* 1.331 test shim: chat saves now use storage.syncCommit; route it through storage.set so these fault-injection checks still exercise failed-save UI. CAS itself is covered by test-sync-chat-cas. */(function(){var s;Object.defineProperty(window,'storage',{configurable:true,get:function(){return s},set:function(v){if(v&&typeof v.syncCommit==='function'&&typeof v.set==='function'){v.syncCommit=async function(values){for(var k of Object.keys(values||{}))await v.set(k,values[k]);return true}}s=v}})})();window.__incoming=[];window.__acks=[];window.__linkRequests=[];window.__linkEnabled=false;window.__held=false;
window.chatLink={status:async()=>({enabled:window.__linkEnabled,host:true}),configure:async o=>{window.__linkEnabled=o.enabled;return{enabled:o.enabled,host:true}},pause:async()=>{window.__paused=true},exchange:async r=>{window.__linkRequests.push(r);window.__acks.push(r.acks.slice());if(window.__held)await new Promise(resolve=>window.__release=resolve);return{incoming:window.__incoming,localHash:'local-hash',peerAck:window.__peerSaved?'local-hash':'',lastSeen:Date.now()}}};
window.openRouter={status:async()=>({configured:true}),onEvent:cb=>{window.__emit=cb;return()=>{}},models:async()=>({ok:true,models:[]}),start:async r=>{window.__request=r;window.__emit({id:r.requestId,type:'delta',text:'*I look around.* "Hello."'});return{ok:true}},cancel:async()=>({ok:true})};`);
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms));const run=s=>win.webContents.executeJavaScript(s);
const click=label=>run(`(()=>{const b=[...(${JSON.stringify(label)}==='Chat'?document.querySelector('.rcchat-launch')?.parentElement:(document.querySelector('.rcchat-modal')||document.querySelector('#rcv-chat-root'))).querySelectorAll('button')].find(b=>[b.getAttribute('aria-label'),b.textContent].some(text=>text&&text.trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)}));if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);
const input=(selector,text)=>run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
async function until(probe){for(let i=0;i<220;i++){if(await run(probe))return;await wait(100);}throw Error("Timed out: "+probe);}
const timeout=setTimeout(()=>app.exit(1),120000);
app.whenReady().then(async()=>{
  // Chromium can defer matchMedia change events in a hidden native window.
  // This test measures a real responsive transition, so keep it visible/focused.
  win=new BrowserWindow({show:true,width:1440,height:900,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.focus();
  win.webContents.on("console-message",e=>{if(e.level==="error")console.error("Renderer: "+e.message);});
  await win.loadFile(path.join(root,"web/index.html"));await wait(1100);
  await run(`(async()=>{
    function pic(colour){const c=document.createElement('canvas');c.width=200;c.height=120;const x=c.getContext('2d');x.fillStyle=colour;x.fillRect(0,0,200,120);return c.toDataURL();}
    await window.storage.set('th:portrait',pic('#375c76'));await window.storage.set('th:cover',pic('#766137'));await window.storage.set('img:portrait',pic('#375c76'));await window.storage.set('img:cover',pic('#766137'));
    await window.storage.set('buckets:meta',JSON.stringify({Forest:{cover:'cover'}}));
    await window.storage.set('chars:all',JSON.stringify([{id:'c',name:'Ari',bucket:'Forest',profileImg:'portrait',story:'A traveller.',creatorMemo:'NEVER_SEND_MEMO',lorebooks:['Forest'],sections:[],variants:[],gallery:[],tags:[]}]));
    await window.storage.set('personas:all','[]');await window.storage.set('lore:all',JSON.stringify([{id:'l',title:'Elves',world:'Forest',content:'Ancient forest people.',triggers:['elf']} ]));await window.storage.set('prompts:all','[]');
    await window.storage.set('chats:all',JSON.stringify([{id:'story',title:'Forest paths',characterId:'c',model:'test/model',messages:[{id:'first',role:'assistant',content:'*An elf bows.* "Welcome."\\n\\n**Ancient gates**'},{id:'alternate',parentId:null,role:'assistant',content:'A different opening.'}],leafId:'first',autoMemory:false,memoryPins:'Keep the promise.',createdAt:1,updatedAt:2}]));await window.storage.set('ui:onboarded','1');
  })()`);
  await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});await wait(1300);await click('Chat');await wait(400);
  assert(await run("!!document.querySelector('.rcchat-bubble em')&&!!document.querySelector('.rcchat-bubble strong')&&!!document.querySelector('.rcchat-dialogue')"),'safe roleplay formatting');
  await until("!!document.querySelector('.rcchat-story-card .rcchat-portrait img')&&!!document.querySelector('.rcchat-bucket-backdrop img')");
  assert(await run("window.storage.get('th:cover').then(r=>document.querySelector('.rcchat-bucket-backdrop img').src===r.value)"),'background is the bucket cover, not the portrait');
  assert(!(await run("document.querySelector('.rcchat-composer-status').open")),'technical detail starts collapsed');
  for(const width of [360,800,1440]){
    win.setContentSize(width,900);await until('innerWidth==='+width);await wait(80);
    const measured=await run(`(()=>{const s=document.querySelector('.rcchat-shell'),c=document.querySelector('.rcchat-compose'),r=c.getBoundingClientRect();return {overflow:s.scrollWidth-s.clientWidth,bottom:r.bottom,height:innerHeight,buttons:[...document.querySelectorAll('.rcchat-head button')].filter(x=>x.getClientRects().length).every(x=>{const r=x.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})}})()`);
    assert(measured.overflow<2 && measured.bottom<=measured.height+1 && measured.buttons,JSON.stringify(measured));
    if(process.env.RCV_CAPTURE_CHAT){win.show();win.focus();await wait(120);fs.writeFileSync(path.join(root,'dist','chat-polish-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
  }
  await click('Inspect context');await wait(100);assert(await run("document.querySelector('.rcchat-lore-inspector').textContent.includes('elf · Character reply')"));await click('Done');
  await click('Scene panel');await wait(150);assert(await run("document.querySelector('.rcchat-modal').getAttribute('aria-modal')==='false'&&!document.querySelector('.rcchat-shell').inert"),'desktop scene panel leaves conversation usable: '+await run("JSON.stringify({width:innerWidth,media:matchMedia('(min-width:1200px)').matches,modal:document.querySelector('.rcchat-modal').getAttribute('aria-modal'),inert:document.querySelector('.rcchat-shell').inert})"));
  await input('#rcchat-scene-location','Ancient forest');await wait(150);assert(await run("document.querySelector('.rcchat-memory-overview').textContent.includes('Keep the promise.')"));
  win.setContentSize(360,900);await until('innerWidth===360');await wait(150);assert(await run("document.querySelector('.rcchat-modal').getAttribute('aria-modal')==='true'&&document.querySelector('.rcchat-shell').inert"),'phone scene sheet is modal: '+await run("JSON.stringify({width:innerWidth,modal:document.querySelector('.rcchat-modal').getAttribute('aria-modal'),inert:document.querySelector('.rcchat-shell').inert})"));await click('Close dialog');await until("!document.querySelector('.rcchat-modal')");
  await click('Story branches');await wait(100);assert.strictEqual(await run("document.querySelectorAll('.rcchat-branch-card').length"),2);await click('Continue this path');await wait(100);
  await click('Conversation settings');await wait(100);await run("document.querySelector('#rcchat-reading-mode').value='novel';document.querySelector('#rcchat-reading-mode').dispatchEvent(new Event('change',{bubbles:true}))");await click('Done');assert(await run("document.querySelector('.rcchat-shell').classList.contains('rcchat-novel')"));
  await input('.rcchat-compose textarea','Continue please');await click('Send');await wait(160);assert(!(await run("document.querySelector('.rcchat-compose textarea').disabled")));await input('.rcchat-compose textarea','My next draft');await click('Stop');await until("window.storage.get('ui:chat-drafts').then(r=>JSON.parse(r.value).story==='My next draft')");
  assert(!(await run("JSON.stringify(window.__request).includes('NEVER_SEND_MEMO')")));
  await click('Conversation settings');await click('Enable Wi-Fi chat link');await wait(200);await click('Done');
  await run(`window.storage.get('chats:all').then(r=>{const rows=JSON.parse(r.value),source=rows.find(c=>c.id==='story');window.__incoming=[{hash:'peer-one',snapshot:window.RolecraftChatSync.canonical(window.RolecraftChatSync.stamp([{...source,id:'phone-story',title:'From phone'}],[],()=>crypto.randomUUID()))}];})`);
  await until("window.storage.get('chats:all').then(r=>JSON.parse(r.value).some(c=>c.id==='phone-story'))");
  await until("window.__acks.some(a=>a.includes('peer-one'))");
  assert(await run("window.__linkRequests.some(r=>typeof r.snapshot==='string')"),'first exchange sends a complete snapshot');
  await until("window.__linkRequests.some(r=>r.hash==='local-hash'&&r.snapshot===undefined)");
  await click('Return to vault');
  await run("window.__peerSaved=true");
  await run(`window.__realSet=window.storage.set;window.__failSave=true;window.storage.set=(key,value)=>key==='chats:all'&&window.__failSave?Promise.reject(Error('fixture disk failure')):window.__realSet(key,value);window.storage.get('chats:all').then(r=>{const c=JSON.parse(r.value)[0];window.__incoming=[{hash:'peer-two',snapshot:window.RolecraftChatSync.canonical(window.RolecraftChatSync.stamp([{...c,id:'unsaved-story',title:'Save retry fixture'}],[],()=>crypto.randomUUID()))}];})`);
  await until("window.__acks.length>"+(await run('window.__acks.length')));await wait(200);await click('Chat');await until("document.querySelector('.rcchat-compose').textContent.includes('Not saved')");
  assert(!(await run("window.storage.get('chats:all').then(r=>JSON.parse(r.value).some(c=>c.id==='unsaved-story'))")));
  assert(!(await run("window.__acks.some(a=>a.includes('peer-two'))")),'failed writes must never acknowledge the peer');
  await run("window.__failSave=false");await click('Retry save');await until("window.storage.get('chats:all').then(r=>JSON.parse(r.value).some(c=>c.id==='unsaved-story'))");await click('Return to vault');await until("window.__acks.some(a=>a.includes('peer-two'))");
  // A late network response after locking cannot save or reopen anything.
  await run("window.__held=true;window.__peerSaved=false");await until("typeof window.__release==='function'");
  const before=await run("window.storage.get('chats:all').then(r=>r.value)");await run("window.dispatchEvent(new Event('rcv-locking'));window.__release()");await wait(200);assert(!(await run("!!document.querySelector('.rcchat-shell')")));assert.equal(await run("window.storage.get('chats:all').then(r=>r.value)"),before);
  console.log('PASS: bucket artwork, formatted/novel reading, scene responsiveness, branches, drafting during replies, real renderer sync acknowledgments and late-lock safety');
  clearTimeout(timeout);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(timeout);app.exit(1);});
