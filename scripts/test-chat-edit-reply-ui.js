// Real renderer and storage, disposable profile, offline provider only.
const {app,BrowserWindow}=require('electron');
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-edit-reply-'));
let site=path.join(root,'web');
if(process.env.RCV_CHAT_REGRESSION_BASE){
  site=path.join(tmp,'previous-web');fs.cpSync(path.join(root,'web'),site,{recursive:true});
  fs.writeFileSync(path.join(site,'js/rolecraft-chat.js'),require('child_process').execFileSync('git',['show',process.env.RCV_CHAT_REGRESSION_BASE+':app/chat.js'],{cwd:root}));
}
app.setPath('userData',tmp);app.commandLine.appendSwitch('force-device-scale-factor','1');
const preload=path.join(tmp,'preload.js');
fs.writeFileSync(preload,`/* 1.331 test shim: chat saves now use storage.syncCommit; route it through storage.set so these fault-injection checks still exercise failed-save UI. CAS itself is covered by test-sync-chat-cas. */(function(){var s;Object.defineProperty(window,'storage',{configurable:true,get:function(){return s},set:function(v){if(v&&typeof v.syncCommit==='function'&&typeof v.set==='function'){v.syncCommit=async function(values){for(var k of Object.keys(values||{}))await v.set(k,values[k]);return true}}s=v}})})();window.__requests=[];window.openRouter={status:async()=>({configured:true}),onEvent:cb=>{window.__emit=cb;return()=>{}},cancel:async()=>({ok:true}),start:async r=>{window.__savedBeforeSend=JSON.parse((await window.storage.get('chats:all')).value)[0];window.__requests.push(r);return{ok:true}}};`);
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=async s=>{try{return await win.webContents.executeJavaScript(s)}catch(e){throw Error(e.message+'\nProbe: '+s)}};
async function until(s){for(let i=0;i<140;i++){if(await run(s))return;await wait(50);}throw Error('Timed out: '+s);}
async function click(label){await run(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(label === "Chat" ? "#rcv-sidebar-chat button,#rcv-dashboard-chat button" : "#rcv-chat-root button")})].find(b=>[b.getAttribute('aria-label'),b.textContent].some(v=>v&&v.trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)}));if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);await wait(80);}
async function editUser(text){
  await run("document.querySelector('.rcchat-message.user .rcchat-message-actions').open=true;[...document.querySelectorAll('.rcchat-message.user button')].find(b=>b.textContent==='Edit').click()");
  await until("!!document.querySelector('.rcchat-edit')");
  await run(`(()=>{const t=document.querySelector('.rcchat-edit');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(text)});t.dispatchEvent(new Event('input',{bubbles:true}))})()`);
}
const timeout=setTimeout(()=>{console.error('Edit/reply UI timeout');app.exit(1)},90000);
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.setContentSize(360,800);win.focus();
  await win.loadFile(path.join(site,'index.html'));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run(`(async()=>{await window.storage.set('ui:onboarded','1');for(const k of ['chars:all','personas:all','lore:all','prompts:all'])await window.storage.set(k,'[]');await window.storage.set('chats:all',JSON.stringify([{id:'s',title:'Edit fixture',model:'fixture',autoMemory:false,messages:[{id:'u',parentId:null,role:'user',content:'Original question'},{id:'a',parentId:'u',role:'assistant',content:'Original answer'}],leafId:'a'}]))})()`);
  await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload()});await until("!!document.querySelector('.rcchat-launch')");await click('Chat');
  // A native tablet can have a mouse attached; completion must not depend on
  // coarse-pointer detection. Blurring represents dismissing the keyboard.
  await run("(()=>{const t=document.querySelector('.rcchat-compose textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Next turn');t.dispatchEvent(new Event('input',{bubbles:true}))})()");await click('Send');await until('window.__requests.length===1');
  await run("document.querySelector('.rcchat-compose textarea').blur();window.__emit({id:window.__requests[0].requestId,type:'delta',text:'An answer to read.'});window.__emit({id:window.__requests[0].requestId,type:'done'})");await wait(200);
  assert(await run("document.activeElement!==document.querySelector('.rcchat-compose textarea')"),'completion never reopens the keyboard, including fine-pointer tablets');
  await editUser('Revised question');
  const geometry=await run("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Save and regenerate reply');if(!b)return null;const r=b.getBoundingClientRect();return{left:r.left,right:r.right,height:r.height,overflow:document.querySelector('.rcchat-shell').scrollWidth-innerWidth}})()");
  assert(geometry&&geometry.left>=0&&geometry.right<=361&&geometry.height>=48&&geometry.overflow<=1,JSON.stringify(geometry));
  await click('Save and regenerate reply');await until('window.__requests.length===2');
  const result=await run('({request:window.__requests[1],saved:window.__savedBeforeSend})');
  assert.deepStrictEqual(result.request.messages.slice(1),[{role:'user',content:'Revised question'}],'regeneration uses the edited turn, not original or future replies');
  assert(result.saved.messages.some(m=>m.id==='u'&&m.content==='Original question'));
  assert(result.saved.messages.some(m=>m.id==='a'&&m.content==='Original answer'));
  const edited=result.saved.messages.find(m=>m.content==='Revised question'),reply=result.saved.messages.find(m=>m.id===result.saved.leafId);
  assert(edited&&reply.parentId===edited.id&&reply.pending,'new branch is durably saved before provider starts');
  await run("window.__emit({id:window.__requests[1].requestId,type:'delta',text:'Revised answer'});window.__emit({id:window.__requests[1].requestId,type:'done'})");await wait(150);
  await editUser('Cannot save this yet');
  await run("window.__originalSet=window.storage.set;window.storage.set=async function(k,v){if(k==='chats:all')throw Error('fixture disk failure');return window.__originalSet.call(this,k,v)};void 0");
  await click('Save and regenerate reply');await until("document.querySelector('#rcv-chat-root').textContent.includes('Not saved')");
  assert.equal(await run('window.__requests.length'),2,'failed edit save never calls the provider');
  assert(await run("document.querySelector('.rcchat-messages').textContent.includes('Cannot save this yet')"),'failed edit is kept for recovery');
  assert(await run("window.storage.get('chats:all').then(r=>!r.value.includes('Cannot save this yet'))"));
  await run('window.storage.set=window.__originalSet;void 0');win.setContentSize(1440,900);await click('Retry save');await until("window.storage.get('chats:all').then(r=>r.value.includes('Cannot save this yet'))");
  await editUser('Another edit');await click('Save and regenerate reply');await until('window.__requests.length===3');
  await run("document.querySelector('.rcchat-compose textarea').blur()");await click('Stop');assert(await run("document.activeElement!==document.querySelector('.rcchat-compose textarea')"),'Stop does not refocus composer');
  console.log('PASS: quiet reply completion, edit/regenerate exact durable branch, preserved replies, mobile fit, failed-save recovery and Stop');clearTimeout(timeout);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(timeout);app.exit(1)});
