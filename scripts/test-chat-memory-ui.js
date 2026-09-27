// Real shipped UI with a disposable vault and offline provider fixture.
const { app, BrowserWindow } = require("electron");
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const root = path.join(__dirname, ".."), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-memory-ui-"));
app.setPath("userData", tmp);
const preload = path.join(tmp, "preload.js");
fs.writeFileSync(preload, `window.Capacitor={isNativePlatform:()=>true};window.__requests=[];window.__mode='success';
window.openRouter={status:async()=>({configured:true}),onEvent:cb=>{window.__emit=cb;return()=>{}},cancel:async id=>{window.__cancelled=id;return{ok:true}},start:async r=>{window.__requests.push(r);const memory=r.messages[0].content.includes('Produce a concise rolling memory');if(memory){if(window.__mode==='hold')return{ok:true};if(window.__mode==='error'){window.__emit({id:r.requestId,type:'error',error:'Fixture provider failure'});return{ok:true}}window.__emit({id:r.requestId,type:'delta',text:window.__mode==='truncate'?'incomplete memory':'Events: the travellers met. Relationships: friends. Promises: return home. Scene: the old road. [END_MEMORY]'});window.__emit({id:r.requestId,type:'finish',reason:'stop'});window.__emit({id:r.requestId,type:'done'});}else{window.__emit({id:r.requestId,type:'delta',text:'The journey continues.'});window.__emit({id:r.requestId,type:'done'});}return{ok:true}}};`);
let win, lastProbe = "startup";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = async script => { lastProbe = script; try { return await win.webContents.executeJavaScript(script); } catch (e) { console.error("Failed probe: " + script.slice(0, 180)); throw e; } };
const until = async (script, label) => { const deadline = Date.now() + 12000; while (Date.now() < deadline) { if (await run(script)) return; await wait(50); } throw Error('Timed out waiting for ' + label); };
const click = label => run(`(()=>{const b=[...(${JSON.stringify(label)}==='Chat'?document.querySelector('.rcchat-launch')?.parentElement:(document.querySelector('.rcchat-modal')||document.querySelector('#rcv-chat-root'))).querySelectorAll('button')].find(b=>[b.getAttribute('aria-label'),b.textContent].some(s=>s&&s.trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)}));if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);
const input = (selector, text) => run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
// Twenty-seven eligible turns fit within the four paid automatic batches per Send.
const messages = Array.from({length:32}, (_,i)=>({id:'m'+i,parentId:i?'m'+(i-1):null,role:i%2?'assistant':'user',content:'Turn '+i+': '+'A long established story event. '.repeat(30),...(i===31?{usage:{prompt_tokens:21197,completion_tokens:1683,total_tokens:22880,prompt_tokens_details:{cached_tokens:0},completion_tokens_details:{reasoning_tokens:806},cost:.02221}}:{})}));
const fixture = { id:'story', title:'Memory fixture', model:'fixture/model', contextTokens:12000, maxTokens:500, temperature:.8, messages, leafId:'m31', memoryPins:'Keep the promise.' };
async function reset(seed = fixture) {
  await run(`window.storage.set('chats:all',${JSON.stringify(JSON.stringify([seed]))})`);
  await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload();}); await wait(1400); await click('Chat'); await wait(200);
}
const timeout=setTimeout(()=>{console.error('Memory UI timeout at: '+lastProbe);app.exit(1)},90000);
app.whenReady().then(async()=>{
  // Keep this disposable test window foreground for real user-action guards;
  // keep timers/frames running so packaging cannot consume the watchdog.
  win=new BrowserWindow({show:true,width:360,height:850,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});
  win.focus();
  await win.loadFile(path.join(root,'web/index.html')); await wait(1200);
  await run(`(async()=>{for(const k of ['chars:all','personas:all','lore:all','prompts:all'])await window.storage.set(k,'[]');await window.storage.set('ui:onboarded','1')})()`);
  await reset();
  assert.strictEqual(await run('window.__requests.length'),0,'opening Chat never contacts the provider');
  assert(await run("document.querySelector('.rcchat-usage summary').textContent.replace(/,/g,'').includes('21197 input')"),'reply badge separates input from output');
  await run("document.querySelector('.rcchat-usage summary').click()");
  assert(await run("document.querySelector('.rcchat-usage').textContent.includes('Reasoning: 806 tokens, included in output')"),'expanded badge explains reasoning is included in output');
  await click('Conversation settings'); await wait(100);
  await click('Usage'); await wait(50);
  assert(await run("!!document.querySelector('[data-chat-cost-breakdown]')"), 'provider cost breakdown is available in conversation settings');
  await click('Memory'); await wait(50);
  assert.strictEqual(await run("document.querySelector('#rcchat-memory-trigger').value"),'5000','existing active chats offer the earlier trigger without migrating their saved records');
  await click('Done'); await wait(100);
  assert.strictEqual(await run('window.__requests.length'),0,'opening settings does not compact an active chat');
  await input('.rcchat-compose textarea','Continue our journey'); await click('Send');
  await until("window.__requests.some(r=>!r.messages[0].content.includes('Produce a concise rolling memory'))", 'roleplay after bounded memory');
  const requests=await run('window.__requests');
  assert.strictEqual(requests.length,5,'four memory batches are the maximum before the roleplay reply');
  assert(requests.every(r=>r.requireZdr===true),'old chats protect both memory and reply requests by default');
  assert(requests[0].messages[0].content.includes('rolling memory'));
  const reply=requests[requests.length-1];
  assert(reply.messages[0].content.includes('EARLIER STORY MEMORY'));
  assert(reply.messages[0].content.includes('Keep the promise.'));
  assert.strictEqual(reply.messages.length,7,'five messages and latest input follow system/memory');
  await until("window.storage.get('chats:all').then(r=>JSON.parse(r.value)[0].messages.length===34)", 'saved reply');
  let saved=await run("window.storage.get('chats:all').then(r=>JSON.parse(r.value)[0])");
  assert.strictEqual(saved.messages.length,34); assert.strictEqual(saved.memories.length,4,'each completed memory batch has a durable checkpoint');
  assert.deepStrictEqual(saved.messages.slice(0,32),messages,'compaction never rewrites history');
  await click('Conversation settings'); await click('Memory'); await wait(100);
  await input('#rcchat-memory-pins','Pinned forever'); await input('#rcchat-memory-text','Edited memory: the promise matters.'); await click('Save memory and pins'); await wait(150);
  for(const width of [360,800,1440]){
    win.setContentSize(width,850);await wait(120);
    assert(await run("(()=>{const m=document.querySelector('.rcchat-modal'),r=m.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&m.scrollWidth<=m.clientWidth+1})()"),'memory controls fit '+width);
    if(process.env.RCV_CAPTURE_CHAT){win.show();win.focus();await run("document.querySelector('.rcchat-memory').scrollIntoView({block:'start'})");await wait(150);fs.writeFileSync(path.join(root,'dist','chat-memory-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
  }
  await click('Done'); await wait(100);
  saved=await run("window.storage.get('chats:all').then(r=>JSON.parse(r.value)[0])");
  assert.strictEqual(saved.memoryPins,'Pinned forever');assert(saved.memories.some(m=>m.text==='Edited memory: the promise matters.'));
  await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload();});await wait(1400);await click('Chat');await wait(150);
  assert.strictEqual(await run('window.__requests.length'),0,'restart never auto-contacts provider');
  assert(await run("window.storage.get('chats:all').then(r=>{const c=JSON.parse(r.value)[0];return window.__rcvChatInternals.assemble(c,{chars:[],personas:[],lore:[]}).messages[0].content.includes('Edited memory: the promise matters.')})"),'saved edited memory survives restart');
  const previous = {id:'previous',throughId:'m1',text:'A good earlier memory'};
  await reset(); await click('Conversation settings'); await wait(100);
  await click('Connection'); await wait(50);
  assert.strictEqual(await run("document.querySelector('#rcchat-privacy').value"),'strict');
  await click('Memory'); await wait(50);
  assert.strictEqual(await run("document.querySelector('#rcchat-memory-model').value"),'','existing chats inherit their roleplay model for memory');
  await run("(()=>{const e=document.querySelector('#rcchat-memory-model');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'fixture/fast');e.dispatchEvent(new Event('input',{bubbles:true}))})()"); await wait(150);
  await click('Connection'); await wait(50);
  await run("document.querySelector('#rcchat-privacy').value='allow';document.querySelector('#rcchat-privacy').dispatchEvent(new Event('change',{bubbles:true}))"); await wait(150);
  assert(await run("document.querySelector('.rcchat-modal').textContent.includes('Providers may store the context')"));
  await click('Done'); await wait(150);
  const optedOut=await run("window.storage.get('chats:all').then(r=>JSON.parse(r.value)[0])");
  assert.strictEqual(optedOut.requireZdr,false);
  assert.strictEqual(optedOut.memoryModel,'fixture/fast','memory model selection persists with the conversation');
  await reset(optedOut); await input('.rcchat-compose textarea','Continue with my chosen privacy'); await click('Send');
  await until("window.__requests.some(r=>!r.messages[0].content.includes('Produce a concise rolling memory'))", 'roleplay with separate memory model');
  const relaxed=await run('window.__requests');assert(relaxed.length>=2&&relaxed.every(r=>r.requireZdr===false),'persisted choice reaches memory and replies after reopening');
  assert(relaxed.slice(0,-1).every(r=>r.model==='fixture/fast'),'only memory requests use the selected summarizer');
  assert.strictEqual(relaxed.at(-1).model,'fixture/model','roleplay requests keep the chosen roleplay model');
  await click('Conversation settings'); await click('Connection'); await wait(100);
  await run("document.querySelector('#rcchat-privacy').value='strict';document.querySelector('#rcchat-privacy').dispatchEvent(new Event('change',{bubbles:true}))");await wait(150);await click('Done');await wait(150);
  assert.strictEqual(await run("window.storage.get('chats:all').then(r=>JSON.parse(r.value)[0].requireZdr)"),true,'privacy can be re-enabled');
  for(const mode of ['truncate','error','hold']){
    await reset({...fixture,memories:[previous]}); await run(`window.__mode=${JSON.stringify(mode)}`); await input('.rcchat-compose textarea','Keep this unsent draft'); await click('Send'); await wait(200);
    if(mode==='hold'){await click('Stop');await wait(100);assert(await run('!!window.__cancelled'));}
    saved=await run("window.storage.get('chats:all').then(r=>JSON.parse(r.value)[0])");
    assert.deepStrictEqual(saved.memories,[previous],mode+' keeps previous good memory');
    assert.strictEqual(saved.messages.length,messages.length,mode+' keeps original transcript');
    assert.strictEqual(await run("document.querySelector('.rcchat-compose textarea').value"),'Keep this unsent draft');
    assert.strictEqual(await run('window.__requests.length'),1,mode+' never starts roleplay');
  }
  await reset();
  await run("window.__realCommit=window.storage.syncCommit;window.storage.syncCommit=(values,expected)=>values&&JSON.parse(values['chats:all']||'[]')[0]?.memories?.length?Promise.reject(new Error('Fixture disk full')):window.__realCommit(values,expected);void 0");
  await input('.rcchat-compose textarea','Retain on disk failure');await click('Send');await wait(250);
  assert.strictEqual(await run('window.__requests.length'),1,'failed checkpoint save blocks the reply');
  assert(await run("document.querySelector('.rcchat-messages').textContent.includes('Fixture disk full')"));
  await run('window.storage.syncCommit=window.__realCommit;void 0');await reset();await run("window.__mode='hold'");await input('.rcchat-compose textarea','Lock during memory');await click('Send');await wait(100);
  await run("window.dispatchEvent(new Event('rcv-locking'))");await wait(100);
  assert(await run("!document.querySelector('.rcchat-shell')&&!!window.__cancelled"),'locking cancels and conceals memory');
  console.log('PASS: actual memory Send, saved checkpoints, edit/pins, responsive controls, truncation, provider error, Stop, disk failure and lock');
  clearTimeout(timeout);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(timeout);app.exit(1)});
