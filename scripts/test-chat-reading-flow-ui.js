/* Private 1.316 chat reading flow in the real UI with a disposable profile:
   phone, keyboard-height, group and desktop geometry; layered turn menus and
   Options; no viewport yanking while a reply streams; jump-to-latest; typing
   that leaves the transcript untouched; and mode/motion parity. */
const {app,BrowserWindow}=require('electron');
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-reading-flow-')),site=path.join(tmp,'web');
// A disposable copy of the real web payload, instrumented only to count turn renders.
fs.cpSync(path.join(root,'web'),site,{recursive:true});
fs.copyFileSync(path.join(root,'app/chat.css'),path.join(site,'css/chat.css'));
const chatSource=fs.readFileSync(path.join(root,'app/chat.js'),'utf8');assert(chatSource.includes('  function ChatMessageRow(props) {'),'turn row component exists');
fs.writeFileSync(path.join(site,'js/rolecraft-chat.js'),chatSource.replace('  function ChatMessageRow(props) {','  function ChatMessageRow(props) { window.__rowRenders=(window.__rowRenders||0)+1;'));
app.setPath('userData',tmp);app.commandLine.appendSwitch('force-device-scale-factor','1');
const preload=path.join(tmp,'preload.js');
fs.writeFileSync(preload,`window.openRouter={status:async()=>({configured:true}),models:async()=>({ok:true,models:[]}),onEvent:cb=>{window.__replyEvent=cb;return()=>{}},start:async r=>{window.__request=r;return{ok:true}},cancel:async()=>({ok:true})};`);
let win,failed=0;const wait=ms=>new Promise(r=>setTimeout(r,ms));
const run=async s=>{try{return await win.webContents.executeJavaScript(s)}catch(e){throw Error(e.message+'\nProbe: '+s.slice(0,300))}};
async function until(s,label){for(let i=0;i<160;i++){if(await run(s))return;await wait(50);}throw Error('Timed out: '+(label||s));}
async function check(name,fn){try{await fn();console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+': '+e.message)}}
const cdp=(method,params)=>win.webContents.debugger.sendCommand(method,params||{});
async function size(w,h){win.setContentSize(w,h);await until(`innerWidth===${w}&&innerHeight===${h}`);await wait(250);}
async function wheel(deltaY){const p=await run("(()=>{const r=document.querySelector('.rcchat-messages').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:p.x,y:p.y,deltaX:0,deltaY});await wait(350);}
const distance="(()=>{const m=document.querySelector('.rcchat-messages');return m.scrollHeight-m.scrollTop-m.clientHeight})()";
const bottom=`(${distance}<3)`;
const geometry="(()=>{const r=s=>{const e=document.querySelector(s);return e?e.getBoundingClientRect().toJSON():null};return{head:r('.rcchat-head'),compose:r('.rcchat-compose'),messages:r('.rcchat-messages'),overflow:document.querySelector('.rcchat-shell').scrollWidth-innerWidth}})()";
// Every visible control inside a layer must be the topmost element at its centre.
const front=sel=>`(()=>{const items=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(b=>b.getClientRects().length);return items.length>0&&items.every(b=>{const q=b.getBoundingClientRect(),hit=document.elementFromPoint(q.x+q.width/2,q.y+q.height/2);return b.contains(hit)&&q.left>=-1&&q.right<=innerWidth+1&&q.top>=-1&&q.bottom<=innerHeight+1})})()`;
const timer=setTimeout(()=>{console.error('Reading flow test timed out');app.exit(1)},180000);
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.setContentSize(360,800);win.focus();
  await win.loadFile(path.join(site,'index.html'));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  win.webContents.debugger.attach('1.3');
  await run(`(async()=>{const now=Date.now();await storage.set('ui:onboarded','1');await storage.set('chars:all',JSON.stringify([{id:'a',name:'Ari',story:'ARI'},{id:'b',name:'Beatrice Valcourt-Ashgrove of the Northern Marches',story:'BEA'},{id:'c',name:'Celeste',story:'CEL'}]));await storage.set('personas:all',JSON.stringify([{id:'p',name:'Robin',description:'ROBIN'}]));for(const k of ['lore:all','prompts:all'])await storage.set(k,'[]');
    const long=[];for(let i=0;i<60;i++){const m={id:'m'+i,parentId:i?'m'+(i-1):null,role:i%2?'assistant':'user',content:'Turn '+i+'. *The lantern gutters.* "Stay close," she says. '.repeat(i%3+2),createdAt:now-(60-i)*60000};if(m.role==='assistant')m.usage={prompt_tokens:4000+i,completion_tokens:300,total_tokens:4300+i};long.push(m);}
    long.push({id:'m55b',parentId:'m54',role:'assistant',content:'Another version of turn 55.',createdAt:now-4*60000});
    const cast=['a','b','c'].map(id=>({characterId:id,variantId:''}));const group=[];for(let i=0;i<9;i++)group.push({id:'g'+i,parentId:i?'g'+(i-1):null,role:i%3===2?'user':'assistant',content:'Group turn '+i+'. "Who kept the lamp lit?"',speaker:i%3===2?undefined:{characterId:['a','b'][i%3],variantId:'',name:i%3?'Beatrice Valcourt-Ashgrove of the Northern Marches':'Ari'},createdAt:now-(9-i)*90000});
    await storage.set('chats:all',JSON.stringify([{id:'long',title:'A long road with a very long title that must not crowd the header',characterId:'a',personaId:'p',model:'fixture/model',autoMemory:false,messages:long,leafId:'m59',createdAt:now-864e5},{id:'group',title:'Council',characterId:'a',personaId:'p',model:'fixture/model',autoMemory:false,participants:cast,activeSpeakerKey:JSON.stringify(['b','']),messages:group,leafId:'g8',createdAt:now-864e5}]));})()`);
  await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload()});await until("!!document.querySelector('.rcchat-launch')");
  await run("document.querySelector('.rcchat-launch').click()");await until("!!document.querySelector('.rcchat-transcript .rcchat-message')");
  await run("(()=>{const target=[...document.querySelectorAll('.rcchat-convo')].find(b=>b.textContent.includes('A long road'));if(target)target.click()})()");
  await until("document.querySelector('.rcchat-title').textContent.startsWith('A long road')");await until(bottom,'opens at latest');

  await check('phone opens at the latest turn with compact chrome',async()=>{
    const g=await run(geometry);
    assert(g.head.height<=56&&g.compose.height<=80&&g.messages.height>=640&&g.overflow<=1,JSON.stringify(g));
    assert(await run("document.querySelectorAll('.rcchat-transcript .rcchat-message').length===12"),'phone still renders a 12-turn window');
  });
  await check('turn identity, time, versions and tokens are present and labelled',async()=>{
    const info=await run("(()=>{const last=[...document.querySelectorAll('.rcchat-message.assistant')].at(-1),alt=[...document.querySelectorAll('.rcchat-message')].find(m=>m.querySelector('.rcchat-branch-nav'));return{time:!!last.querySelector('.rcchat-msghead time[datetime]'),speaker:last.querySelector('.rcchat-speaker-chip').getAttribute('aria-label'),label:last.getAttribute('aria-label'),tokens:last.querySelector('.rcchat-usage summary').textContent,nav:alt&&[...alt.querySelectorAll('.rcchat-branch-nav button')].map(b=>{const r=b.getBoundingClientRect();return{label:b.getAttribute('aria-label'),w:r.width,h:r.height}}),navLabel:alt&&alt.querySelector('.rcchat-branch-nav').getAttribute('aria-label')}})()");
    assert(info.time&&info.speaker==='Speaker: Ari'&&/^Ari, /.test(info.label)&&/^Tokens\s*4,359 total/.test(info.tokens),JSON.stringify(info));
    assert(info.nav&&info.nav.length===2&&info.nav[0].label==='Previous version'&&info.nav.every(b=>b.w>=44&&b.h>=44)&&/^Reply version \d of 2$/.test(info.navLabel),JSON.stringify(info));
  });
  await check('closed turn menus reserve no reading space',async()=>{
    assert(await run("[...document.querySelectorAll('.rcchat-message-actions')].every(d=>!d.open)&&[...document.querySelectorAll('.rcchat-tools')].every(t=>!t.getClientRects().length)"));
    const heads=await run("[...document.querySelectorAll('.rcchat-msghead')].map(h=>h.getBoundingClientRect().height)");
    assert(heads.every(h=>h<=52),JSON.stringify(heads));
  });
  await check('turn menu near the composer opens upward above later turns and the composer',async()=>{
    await run("[...document.querySelectorAll('.rcchat-message')].at(-1).querySelector('.rcchat-message-actions>summary').click()");await wait(250);
    assert(await run("(()=>{const d=[...document.querySelectorAll('.rcchat-message')].at(-1).querySelector('.rcchat-message-actions');return d.open&&d.classList.contains('up')&&d.closest('.rcchat-message').dataset.menu==='open'})()"),'last menu flips up and marks its turn');
    assert(await run(front('.rcchat-message-actions[open] .rcchat-tool')),'every action is on top and on screen');
    assert(await run("document.querySelector('.rcchat-message-actions[open] .rcchat-tools').getBoundingClientRect().bottom<=document.querySelector('.rcchat-compose').getBoundingClientRect().top"),'menu never hides behind the composer');
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait(150);
    assert(await run("!document.querySelector('.rcchat-message-actions[open]')&&!!document.querySelector('.rcchat-shell')&&!document.querySelector('[data-menu]')"),'Escape closes only the menu');
  });
  await check('a menu opened mid-transcript layers above the following turn',async()=>{
    await run("(()=>{const m=document.querySelectorAll('.rcchat-message')[6];m.scrollIntoView({block:'start'});})()");await wait(150);
    await run("document.querySelectorAll('.rcchat-message')[6].querySelector('.rcchat-message-actions>summary').click()");await wait(250);
    assert(await run(front('.rcchat-message-actions[open] .rcchat-tool')));
    await run("document.querySelector('.rcchat-head').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");await wait(150);
    assert(await run("!document.querySelector('.rcchat-message-actions[open]')"),'outside press closes the menu');
    await run("(()=>{const m=document.querySelector('.rcchat-messages');m.scrollTop=m.scrollHeight})()");await until(bottom);
  });
  await check('typing and the draft advisory never re-render or touch the transcript',async()=>{
    await run("window.__rowRenders=0;window.__mutations=0;window.__typingObserver=new MutationObserver(list=>{window.__mutations+=list.length});window.__typingObserver.observe(document.querySelector('.rcchat-transcript'),{subtree:true,childList:true,attributes:true,characterData:true});document.querySelector('.rcchat-compose textarea').focus()");
    for(const word of ['I ','follow ','the ','lantern ','down.'])await cdp('Input.insertText',{text:word});
    await wait(900);
    assert.equal(await run("document.querySelector('.rcchat-compose textarea').value"),'I follow the lantern down.');
    assert.equal(await run("(window.__typingObserver.disconnect(),window.__mutations)"),0,'transcript mutated while typing');
    assert.equal(await run('window.__rowRenders'),0,'turn rows re-rendered while typing');
  });
  await check('streaming follows at the end, then never yanks a reader who scrolled up',async()=>{
    await run("[...document.querySelectorAll('.rcchat-compose button')].find(b=>(b.getAttribute('aria-label')||'').startsWith('Send to')).click()");await until('!!window.__request');await until(bottom);
    for(let i=0;i<3;i++){await run(`window.__replyEvent({id:window.__request.requestId,type:'delta',text:'${'The river bends. '.repeat(12)}'})`);await wait(160);assert(await run(bottom),'following reader stays at the newest text');}
    await run('window.__rowRenders=0');await run(`window.__replyEvent({id:window.__request.requestId,type:'delta',text:'One more line. '})`);await wait(200);
    assert(await run('window.__rowRenders<=2'),'a stream delta re-rendered '+(await run('window.__rowRenders'))+' turns');
    await wheel(-80);const before=await run("document.querySelector('.rcchat-messages').scrollTop");assert(!(await run(bottom)),'wheel moved the reader up');
    for(let i=0;i<3;i++){await run(`window.__replyEvent({id:window.__request.requestId,type:'delta',text:'${'Still more words arrive. '.repeat(10)}'})`);await wait(160);}
    const after=await run("document.querySelector('.rcchat-messages').scrollTop");assert(Math.abs(after-before)<3,'moved from '+before+' to '+after);
    await until("!!document.querySelector('.rcchat-jump.is-new')",'new reply marker');
    assert(await run(front('.rcchat-jump')),'jump control is on top');
    assert(await run("document.querySelector('.rcchat-jump').getBoundingClientRect().bottom<=document.querySelector('.rcchat-compose').getBoundingClientRect().top"),'jump control sits above the composer');
    await run("document.querySelector('.rcchat-jump').click()");await until(bottom,'jump returns to latest');await until("!document.querySelector('.rcchat-jump')");
    await run("window.__replyEvent({id:window.__request.requestId,type:'done'})");await wait(200);assert(await run(bottom));
  });
  await check('keyboard-height phone keeps the transcript and a compact composer',async()=>{
    await run("document.querySelector('.rcchat-compose textarea').focus()");await size(360,430);await until(bottom,'keyboard resize keeps latest visible');
    const g=await run(geometry);assert(g.head.height<=52&&g.compose.height<=76&&g.messages.height>=290&&g.compose.bottom<=431&&g.overflow<=1,JSON.stringify(g));
    await run("document.querySelector('.rcchat-header-options>summary').click()");await wait(250);
    try{
      const menu=await run("(()=>{const m=document.querySelector('.rcchat-headtools'),r=m.getBoundingClientRect(),inside=[...m.querySelectorAll(':scope>button')].filter(b=>{const q=b.getBoundingClientRect();return q.top>=r.top&&q.bottom<=r.bottom});return{fits:r.bottom<=innerHeight+1&&r.right<=innerWidth+1&&r.left>=0,scrolls:m.scrollHeight>m.clientHeight,style:getComputedStyle(m).overflowY,visible:inside.length,front:inside.every(b=>{const q=b.getBoundingClientRect(),hit=document.elementFromPoint(q.x+q.width/2,q.y+q.height/2);return b.contains(hit)})}})()");
      assert(menu.fits&&menu.visible>=4&&menu.front&&menu.style==='auto',JSON.stringify(menu));
    }finally{await run("window.__rcvWorkspaceBack()");await until("!document.querySelector('.rcchat-header-options').open");}
  });
  await check('older turns load as the reader scrolls toward them',async()=>{
    await size(360,800);await run("document.activeElement.blur()");
    for(let i=0;i<30&&await run("document.querySelectorAll('.rcchat-transcript .rcchat-message').length===12");i++)await wheel(-900);
    assert(await run("document.querySelectorAll('.rcchat-transcript .rcchat-message').length>12"),'wheel near the top reveals earlier turns');
    assert(await run("!!document.querySelector('.rcchat-messages>.rcchat-latest-only')"),'the latest-only shortcut appears');
  });
  await check('group speaker control stays clear on phone and collapses beside the keyboard',async()=>{
    await run("document.querySelector('[aria-label=\"Show conversations\"]').click()");await wait(150);
    await run("[...document.querySelectorAll('.rcchat-convo')].find(b=>b.textContent.includes('Council')).click()");await until("!!document.querySelector('.rcchat-cast-trigger')");await until(bottom);
    const open=await run("(()=>{const p=document.querySelector('.rcchat-cast-trigger').getBoundingClientRect();return{h:p.height,w:p.width,text:document.querySelector('.rcchat-cast-trigger').textContent,group:document.querySelector('.rcchat-shell').classList.contains('is-group'),hues:new Set([...document.querySelectorAll('.rcchat-message.assistant')].map(m=>m.style.getPropertyValue('--speaker-hue'))).size}})()");
    assert(open.h>=48&&open.h<=50&&open.text.includes('Beatrice')&&open.group&&open.hues===2,JSON.stringify(open));
    await run("document.querySelector('.rcchat-compose textarea').focus()");await size(360,430);
    const kb=await run("(()=>{const p=document.querySelector('.rcchat-cast-trigger').getBoundingClientRect(),t=document.querySelector('.rcchat-compose textarea').getBoundingClientRect(),c=document.querySelector('.rcchat-compose').getBoundingClientRect();return{pill:p.width,top:p.top,input:t.width,inputTop:t.top,compose:c.height,label:document.querySelector('.rcchat-cast-trigger').getAttribute('aria-label'),text:document.querySelector('.rcchat-cast-trigger').textContent}})()");
    assert(kb.pill<=50&&Math.abs(kb.top-kb.inputTop)<=4&&kb.input>=180&&kb.compose<=76&&kb.text.includes('Beatrice')&&kb.label==='Choose next speaker',JSON.stringify(kb));
    await run("document.activeElement.blur()");await size(780,360);
    const land=await run(geometry);assert(land.head.height<=56&&land.compose.height<=116&&land.messages.height>=180&&land.overflow<=1,'rotated phone: '+JSON.stringify(land));
    assert(await run(front('.rcchat-compose button')),'rotated composer controls stay reachable');
    await size(360,800);
  });
  await check('desktop gives the transcript the height and keeps one-line composer controls',async()=>{
    await size(1440,900);await run("(()=>{const m=document.querySelector('.rcchat-messages');m.scrollTop=m.scrollHeight})()");await wait(200);
    const g=await run(geometry);assert(g.head.height<=76&&g.compose.height<=190&&g.messages.height>=640&&g.overflow<=1,JSON.stringify(g));
    await run("[...document.querySelectorAll('.rcchat-convo')].find(b=>b.textContent.includes('A long road')).click()");await until("document.querySelector('.rcchat-title').textContent.startsWith('A long road')");await until(bottom);
    const single=await run(geometry);assert(single.compose.height<=150&&single.messages.height>=680,JSON.stringify(single));
    assert(await run("(()=>{const f=document.querySelector('.rcchat-composefoot').getBoundingClientRect(),m=document.querySelector('.rcchat-compose-meta').getBoundingClientRect();return Math.abs(f.top-m.top)<=2})()"),'status/price and actions share one row');
    const heads=await run("[...document.querySelectorAll('.rcchat-msghead')].slice(-8).map(h=>h.getBoundingClientRect().height)");assert(heads.every(h=>h<=50),JSON.stringify(heads));
    await run("[...document.querySelectorAll('.rcchat-message')].at(-2).querySelector('.rcchat-message-actions>summary').click()");await wait(250);
    assert(await run(front('.rcchat-message-actions[open] .rcchat-tool')));
    await run("window.__rcvWorkspaceBack()");await wait(120);assert(await run("!document.querySelector('.rcchat-message-actions[open]')&&!!document.querySelector('.rcchat-shell')"),'Back closes the turn menu first');
  });
  await check('rendered history far from the reader skips work but stays in the DOM',async()=>{
    const cv=await run("(()=>{const all=[...document.querySelectorAll('.rcchat-transcript>.rcchat-message')];return{count:all.length,first:getComputedStyle(all[0]).contentVisibility,recent:all.slice(-24).every(m=>getComputedStyle(m).contentVisibility==='visible'),text:all[0].textContent.includes('Turn 0.')}})()");
    assert(cv.count>=60&&cv.first==='auto'&&cv.recent&&cv.text,JSON.stringify(cv));
  });
  await check('Performance keeps Quality geometry and drops menu/jump motion',async()=>{
    const quality=await run(geometry);
    await run("document.querySelector('.rcv').classList.add('perf')");await until("document.querySelector('#rcv-chat-root').classList.contains('rcchat-perf')");await wait(150);
    assert.deepStrictEqual(await run(geometry),quality);
    await run("[...document.querySelectorAll('.rcchat-message')].at(-1).querySelector('.rcchat-message-actions>summary').click()");await wait(120);
    assert.equal(await run("getComputedStyle(document.querySelector('.rcchat-message-actions[open] .rcchat-tools')).animationName"),'none');
    await run("window.__rcvWorkspaceBack()");await run("document.querySelector('.rcv').classList.remove('perf')");await until("!document.querySelector('#rcv-chat-root').classList.contains('rcchat-perf')");
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await run("[...document.querySelectorAll('.rcchat-message')].at(-1).querySelector('.rcchat-message-actions>summary').click()");await wait(120);
    assert.equal(await run("getComputedStyle(document.querySelector('.rcchat-message-actions[open] .rcchat-tools')).animationName"),'none','reduced motion removes menu motion');
    await cdp('Emulation.setEmulatedMedia',{features:[]});await run("window.__rcvWorkspaceBack()");
  });
  assert.equal(await run('document.querySelectorAll(".rcchat-message-actions[open]").length'),0);
  clearTimeout(timer);app.exit(failed?1:0);
}).catch(e=>{console.error(e.stack||e);clearTimeout(timer);app.exit(1)});
