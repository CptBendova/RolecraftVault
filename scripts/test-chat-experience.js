// Real shipped UI, isolated IndexedDB profile, and an offline native-service stub.
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert");
const root = path.join(__dirname, ".."), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-chat-experience-"));
app.setPath("userData", tmp);
app.commandLine.appendSwitch("force-device-scale-factor", "1");
const preload = path.join(tmp, "preload.js");
fs.writeFileSync(preload, `window.Capacitor={isNativePlatform:()=>true};
window.openRouter={status:async()=>({configured:true,secure:true}),models:async()=>({ok:true,models:[{id:'test/long',name:'Long context fixture',context_length:1048576,max_completion_tokens:8192},{id:'test/other',name:'Another model',context_length:128000,max_completion_tokens:4096}]}),onEvent:cb=>{window.__emitChat=cb;return()=>{}},start:async r=>{window.__lastChatRequest=r;window.__emitChat({id:r.requestId,type:'delta',text:'Immediate first token'});return {ok:true,id:r.requestId}},cancel:async id=>{window.__cancelledChat=id;return {ok:true}}};`);
const wait = ms => new Promise(r => setTimeout(r, ms));
let win;
const run = async script => { try { return await win.webContents.executeJavaScript(script); } catch (e) { console.error("Failed probe: " + script.slice(0, 180)); throw e; } };
const click = label => run(`(()=>{const b=[...(${JSON.stringify(label)}==='Chat'?document.querySelector('.rcchat-launch')?.parentElement:(document.querySelector('.rcchat-modal')||document.querySelector('#rcv-chat-root'))).querySelectorAll('button')].find(e=>[e.getAttribute('aria-label'),e.textContent].some(v=>v&&v.trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)}));if(!b)throw Error('Missing button: '+${JSON.stringify(label)});b.click()})()`);
const input = (selector, value) => run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const timeout = setTimeout(() => { console.error("Chat UI timed out"); app.exit(1); }, 120000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: true, width: 1440, height: 950, webPreferences: { preload, contextIsolation: false, sandbox: false } });
  win.focus();
  win.webContents.on("console-message", event => { if (event.level === "error") console.error("Renderer: " + event.message); });
  await win.loadFile(path.join(root, "web/index.html")); await wait(1100);
  await run(`(async()=>{await window.storage.set('chars:all',JSON.stringify(Array.from({length:30},(_,i)=>({id:'c'+i,name:'Story character '+i,tagline:'A thoughtful traveller with a new story to tell',tags:['adventure'],searchables:[],profileImg:'',gallery:[],albums:[],imgMeta:{},history:[],sections:[],lorebooks:[],variants:i?[]:[{id:'night',name:'Night version',story:'Night story',profileImg:''}],story:'A journey begins',firstMessage:'Welcome to the story.',createdAt:Date.now(),updatedAt:Date.now()}))));await window.storage.set('personas:all',JSON.stringify([{id:'p',name:'My traveller',avatar:'',tags:[],sections:[],gallery:[],lorebooks:[],description:'Curious'}]));for(const k of ['lore:all','prompts:all','chats:all'])await window.storage.set(k,'[]');await window.storage.set('ui:onboarded','1');localStorage.setItem('rcv-perfmode','performance')})()`);
  const portrait = "data:image/png;base64," + fs.readFileSync(path.join(root,"app/vendor/crest-256.png")).toString("base64");
  await run(`(async()=>{await window.storage.set('th:portrait',${JSON.stringify(portrait)});const c=JSON.parse((await window.storage.get('chars:all')).value);c[0].profileImg='portrait';await window.storage.set('chars:all',JSON.stringify(c))})()`);
  await win.webContents.reload(); await wait(1700);
  await click("Chat"); await wait(500);
  assert.strictEqual(await run("document.querySelectorAll('.rcchat-cast-grid .rcchat-cast').length"), 24);
  assert.strictEqual(await run("document.querySelectorAll('.rcchat-wizard select').length"), 0, "cast is cards, not dropdowns");
  assert(await run("!!document.querySelector('.rcchat-cast img')"), "the selected character's stored portrait loads");
  assert.strictEqual(await run("getComputedStyle(document.querySelector('.rcchat-modal h2')).color"), await run("getComputedStyle(document.querySelector('.rcv')).color"), "modal headings inherit readable theme text");
  assert(await run("getComputedStyle(document.querySelector('.rcchat-modal p')).fontFamily.includes('Inter')"));
  await run("document.querySelector('.rcchat-cast').click()"); await wait(100);
  assert(await run("document.querySelectorAll('.rcchat-versions .rcchat-cast').length===2"));
  for (const width of [360,800,1440]) {
    win.setContentSize(width, 850); await wait(200);
    const bounds = await run(`(()=>{const m=document.querySelector('.rcchat-modal'),g=document.querySelector('.rcchat-cast-grid'),r=m.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:m.scrollWidth-m.clientWidth,tracks:getComputedStyle(g).gridTemplateColumns.split(' ').length}})()`);
    assert(bounds.left>=0 && bounds.right<=bounds.width+1 && bounds.overflow<2, JSON.stringify(bounds));
    assert.strictEqual(bounds.tracks, bounds.width <= 600 ? 2 : bounds.width <= 900 ? 3 : 4, JSON.stringify(bounds));
    console.log("PASS: guided character cards fit " + width + "px");
    if (process.env.RCV_CAPTURE_CHAT) { win.show(); win.focus(); await wait(150); fs.writeFileSync(path.join(root,"dist","chat-walkthrough-"+width+".png"),(await win.webContents.capturePage()).toPNG()); }
  }
  await click("Continue"); await wait(100);
  await run("[...document.querySelectorAll('.rcchat-cast')].find(e=>e.textContent.includes('My traveller')).click()");await wait(100);
  await click("Continue"); await wait(100);
  assert(await run("document.querySelector('.rcchat-review').textContent.includes('Story character')"));
  await click("Load available models"); await wait(100);
  assert(await run("document.querySelector('#rcchat-model').tagName==='SELECT'"), "model choices can load in the first-chat walkthrough");
  await run("document.querySelector('#rcchat-model').value='test/long';document.querySelector('#rcchat-model').dispatchEvent(new Event('change',{bubbles:true}))");
  await run("document.querySelector('#rcchat-context').value='1000000';document.querySelector('#rcchat-context').dispatchEvent(new Event('change',{bubbles:true}))");
  await run("for(const [id,v] of [['rcchat-perspective','first'],['rcchat-balance','dialogue'],['rcchat-length','short']]){const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))}");
  await input('#rcchat-always-prompt','Persist my roleplay directions.');
  assert.strictEqual(await run("document.querySelector('#rcchat-privacy').value"),'strict','new chats default to zero retention');
  await run("document.querySelector('#rcchat-privacy').value='allow';document.querySelector('#rcchat-privacy').dispatchEvent(new Event('change',{bubbles:true}))");
  await click("Create roleplay"); await wait(400);
  assert(!(await run("!!document.querySelector('.rcchat-wizard')")), await run("document.querySelector('.rcchat-wizard')?.textContent || ''"));
  await input('.rcchat-compose textarea', 'Keep my draft while switching');
  await click('Change model'); await wait(100);
  assert.strictEqual(await run("document.querySelector('#rcchat-privacy').value"),'allow','model dialog preserves the new-story privacy choice');
  await run("document.querySelector('#rcchat-model').value='test/other';document.querySelector('#rcchat-model').dispatchEvent(new Event('change',{bubbles:true}))");
  await click('Use model'); await wait(200);
  assert(await run("!document.querySelector('.rcchat-modal') && !document.querySelector('.rcchat-shell').inert && !document.querySelector('.rcchat-compose textarea').disabled && document.activeElement===document.querySelector('.rcchat-compose textarea')"), "model application returns focus to the clickable, editable composer");
  assert.strictEqual(await run("document.querySelector('.rcchat-compose textarea').value"), 'Keep my draft while switching');
  assert.strictEqual(await run("window.storage.get('chats:all').then(r=>JSON.parse(r.value)[0].model)"), 'test/other');
  assert.strictEqual(await run("window.storage.get('chats:all').then(r=>JSON.parse(r.value)[0].requireZdr)"), false);
  const point = await run("(()=>{const r=document.querySelector('.rcchat-compose textarea').getBoundingClientRect();return{x:Math.round(r.x+20),y:Math.round(r.y+20)}})()");
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
  win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
  await win.webContents.insertText(' clickable'); await wait(60);
  assert(await run("document.querySelector('.rcchat-compose textarea').value.includes('clickable')"), 'real pointer and text input still work after model change');
  await input('.rcchat-compose textarea', "A reply for this character"); await click("Send"); await wait(200);
  assert(await run("document.querySelector('.rcchat-messages').textContent.includes('Immediate first token')"), "early stream events are retained");
  assert.strictEqual(await run('window.__lastChatRequest.requireZdr'),false,'explicit opt-out reaches the Send bridge');
  assert(await run("window.__lastChatRequest.messages[0].content.includes('Persist my roleplay directions.')&&window.__lastChatRequest.messages[0].content.includes('first person')&&window.__lastChatRequest.messages[0].content.includes('short and concise')"),'new-story style and prompt reach the real request');
  assert(await run("window.__lastChatRequest.messages[0].role==='system'&&window.__lastChatRequest.messages[0].content.includes('collaborative fictional roleplay')&&window.__lastChatRequest.messages[0].content.includes('User-controlled persona: My traveller')&&window.__lastChatRequest.messages[0].content.includes('Curious')"),'selected persona and explicit roleplay task reach the native Send request');
  // Focus mode calculates advisory estimates only when their details are opened.
  await run("document.querySelector('.rcchat-compose .rcchat-composer-status').open=true");await wait(150);
  assert(await run("document.querySelector('.rcchat-compose .rcchat-token-breakdown').textContent.includes('Permanent')&&document.querySelector('.rcchat-compose .rcchat-token-breakdown').textContent.includes('Temporary')"));
  await click("Stop"); await wait(150);
  assert(await run("!!window.__cancelledChat"));
  const originalCount = await run("window.storage.get('chats:all').then(r=>JSON.parse(r.value)[0].messages.length)");
  await click("Edit"); await input('.rcchat-edit', 'A revised greeting'); await click('Save and branch here'); await wait(150);
  assert.strictEqual(await run("window.storage.get('chats:all').then(r=>JSON.parse(r.value)[0].messages.length)"), originalCount + 1, "editing retains original replies");
  await click("Conversation settings"); await wait(100);
  assert(await run("document.querySelector('[role=dialog]').getAttribute('aria-modal')==='true'"));
  assert(await run("[...document.querySelectorAll('.rcchat-modal button')].some(b=>b.textContent.trim()==='Export review JSON')"), 'review export is available in conversation settings');
  assert.strictEqual(await run("document.querySelector('#rcchat-always-prompt').value"),'Persist my roleplay directions.');
  await run("document.querySelector('#rcchat-length').value='long';document.querySelector('#rcchat-length').dispatchEvent(new Event('change',{bubbles:true}))");await wait(100);
  assert(await run("document.querySelector('[data-chat-length-warning]').textContent.includes('900')"),'long reply warns about the effective cap');
  assert.strictEqual(await run("document.querySelector('#rcchat-reply').value"),'900','style does not silently raise spend');
  await input('#rcchat-reply','3000');await wait(100);
  assert(await run("!document.querySelector('[data-chat-length-warning]')"),'raising the cap clears the warning');
  await input('#rcchat-reply','900');await wait(100);
  for(const width of [360,1440]){
    win.setContentSize(width,850);await wait(120);
    assert(await run("(()=>{const m=document.querySelector('.rcchat-modal');return m.scrollWidth<=m.clientWidth+1})()"),'prompt/style controls fit '+width);
    if(process.env.RCV_CAPTURE_CHAT){win.show();win.focus();await run("document.querySelector('.rcchat-prompt-controls').scrollIntoView({block:'start'})");await wait(150);fs.writeFileSync(path.join(root,'dist','chat-prompt-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
  }
  await run("document.querySelector('#rcchat-model').value='test/long';document.querySelector('#rcchat-model').dispatchEvent(new Event('change',{bubbles:true}))");
  await run("window.__rcvAndroidBack()"); await wait(100);
  assert(!(await run("!!document.querySelector('.rcchat-modal')")), "Android Back dismisses only the top Chat dialog");
  assert(await run("!!document.querySelector('.rcchat-shell')"));
  assert(await run("!document.querySelector('.rcchat-shell').inert&&!document.querySelector('.rcchat-compose textarea').disabled&&document.activeElement===document.querySelector('.rcchat-compose textarea')"), 'settings model changes and Android Back also restore the reply box');
  await click("Conversation settings"); await wait(100);
  await click("Verify and load models"); await wait(150);
  await click("Done");
  for (const theme of ["light","dark","charsnap","custom"]) {
    await run(`localStorage.setItem('rcv-theme',${JSON.stringify(theme)})`); await win.webContents.reload(); await wait(1500); await click("Chat"); await wait(200);
    const tones = await run("({base:getComputedStyle(document.querySelector('.rcv')).getPropertyValue('--panel').trim(),chat:getComputedStyle(document.querySelector('.rcchat-head')).backgroundColor,expected:getComputedStyle(document.querySelector('#rcv-chat-root')).getPropertyValue('--panel').trim(),perf:document.querySelector('#rcv-chat-root').classList.contains('rcchat-perf')})");
    assert.strictEqual(tones.base, tones.expected); assert(tones.perf);
    console.log("PASS: Chat inherits " + theme + " theme and Performance mode");
  }
  await run("window.dispatchEvent(new Event('rcv-locking'))"); await wait(100);
  assert(!(await run("!!document.querySelector('.rcchat-shell')")), "lock conceals private conversation immediately");
  console.log("PASS: walkthrough, immediate streaming, Stop, non-destructive edits, and lock privacy");
  clearTimeout(timeout); app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(timeout);app.exit(1)});
