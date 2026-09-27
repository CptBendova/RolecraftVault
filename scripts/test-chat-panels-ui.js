/* Private 1.331 chat panels and group chrome in the real UI with a disposable
   profile: the group scene summary in the header, sectioned Settings and Scene
   panels, a sticky close control, a working docked Scene panel on wide screens,
   expandable long help text, and legible group avatars in the story list. */
const {app,BrowserWindow}=require('electron');
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..'),site=path.join(root,'web'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-chat-panels-'));
app.setPath('userData',tmp);app.commandLine.appendSwitch('force-device-scale-factor','1');
const preload=path.join(tmp,'preload.js');
fs.writeFileSync(preload,`window.openRouter={status:async()=>({configured:true}),models:async()=>({ok:true,models:[]}),onEvent:cb=>{window.__replyEvent=cb;return()=>{}},start:async r=>{window.__request=r;return{ok:true}},cancel:async()=>({ok:true})};`);
let win,failed=0;const wait=ms=>new Promise(r=>setTimeout(r,ms));
const run=async s=>{try{return await win.webContents.executeJavaScript(s)}catch(e){throw Error(e.message+'\nProbe: '+s.slice(0,300))}};
async function until(s,label){for(let i=0;i<160;i++){if(await run(s))return;await wait(50);}throw Error('Timed out: '+(label||s));}
async function check(name,fn){try{await fn();console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+': '+e.message)}}
async function size(w,h){win.setContentSize(w,h);await until(`innerWidth===${w}&&innerHeight===${h}`);await wait(250);}
const press=label=>run(`(()=>{const b=[...document.querySelectorAll('#rcv-chat-root button,#rcv-chat-root summary')].find(e=>(e.getAttribute('aria-label')||e.textContent).trim()===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);
const tab=id=>run(`document.querySelector('.rcchat-modal [data-tab="${id}"]').click()`);
const closeModal=async()=>{await run("document.querySelector('.rcchat-modal [aria-label=\"Close dialog\"]').click()");await until("!document.querySelector('.rcchat-modal')");};
const timer=setTimeout(()=>{console.error('Chat panels test timed out');app.exit(1)},180000);
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.setContentSize(360,800);win.focus();
  await win.loadFile(path.join(site,'index.html'));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  win.webContents.debugger.attach('1.3');
  await run(`(async()=>{const now=Date.now();await storage.set('ui:onboarded','1');await storage.set('chars:all',JSON.stringify([{id:'a',name:'Ari',story:'ARI'},{id:'b',name:'Beatrice Valcourt-Ashgrove of the Northern Marches',story:'BEA'},{id:'c',name:'Celeste',story:'CEL'}]));await storage.set('personas:all',JSON.stringify([{id:'p',name:'Robin',description:'ROBIN'}]));for(const k of ['lore:all','prompts:all'])await storage.set(k,'[]');
    const cast=['a','b','c'].map(id=>({characterId:id,variantId:''}));const group=[];for(let i=0;i<9;i++)group.push({id:'g'+i,parentId:i?'g'+(i-1):null,role:i%3===2?'user':'assistant',content:'Group turn '+i+'. "Who kept the lamp lit?"',speaker:i%3===2?undefined:{characterId:['a','b'][i%3],variantId:'',name:i%3?'Beatrice Valcourt-Ashgrove of the Northern Marches':'Ari'},createdAt:now-(9-i)*90000});
    await storage.set('chats:all',JSON.stringify([{id:'group',title:'Council',characterId:'a',personaId:'p',model:'fixture/model',autoMemory:false,participants:cast,activeSpeakerKey:JSON.stringify(['b','']),messages:group,leafId:'g8',createdAt:now-864e5}]));})()`);
  await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload()});await until("!!document.querySelector('.rcchat-launch')");
  await run("document.querySelector('.rcchat-launch').click()");await until("!!document.querySelector('.rcchat-transcript .rcchat-message')");

  await check('group scene summary sits in the header, with no stray counters, and opens above the story',async()=>{
    const g=await run("(()=>{const s=document.querySelector('.rcchat-head .rcchat-scene-strip'),r=s.querySelector('summary').getBoundingClientRect(),m=document.querySelector('.rcchat-messages').getBoundingClientRect();return{inHead:!!s.closest('.rcchat-head'),h:r.height,bottom:r.bottom,top:m.top,text:s.textContent,floating:[...document.querySelectorAll('.rcchat-scene-strip')].length}})()");
    assert(g.inHead&&g.floating===1&&g.h>=48&&g.bottom<=g.top+1&&!/0{2,}/.test(g.text)&&g.text.includes('3 in cast'),JSON.stringify(g));
    await run("document.querySelector('.rcchat-head .rcchat-scene-strip>summary').click()");await wait(150);
    assert(await run("(()=>{const b=document.querySelector('.rcchat-head .rcchat-scene-strip-body'),r=b.getBoundingClientRect(),btn=b.querySelector('.rcchat-btn'),q=btn.getBoundingClientRect(),hit=document.elementFromPoint(q.x+q.width/2,q.y+q.height/2);return r.left>=0&&r.right<=innerWidth&&btn.contains(hit)&&b.querySelector('.is-next')&&b.textContent.includes('next')})()"),'summary panel is on top and marks the next speaker');
    await run("document.querySelector('.rcchat-head .rcchat-scene-strip-body .rcchat-btn').click()");await until("!!document.querySelector('.rcchat-modal [data-tab=\"scene\"]')");
    assert(await run("!document.querySelector('.rcchat-head .rcchat-scene-strip').open"),'opening the Scene panel closes the summary');
    await closeModal();
  });
  await check('no permanent context row above the composer; the picker keeps the preview',async()=>{
    assert(await run("!document.querySelector('.rcchat-speaker-preflight')"));
    await press('Choose next speaker');await until("!!document.querySelector('.rcchat-speaker-picker')");
    assert(await run("(()=>{const p=document.querySelector('.rcchat-speaker-picker');return [...p.querySelectorAll('button')].some(b=>b.textContent.includes('Preview what they will see'))&&[...p.querySelectorAll('small')].every(s=>!/not specified/i.test(s.textContent))})()"));
    await run("window.__rcvWorkspaceBack()");await until("!document.querySelector('.rcchat-speaker-picker')");
  });
  await check('story list shows a compact group avatar cluster inside its card',async()=>{
    await press('Show conversations');await wait(250);
    const c=await run("(()=>{const card=document.querySelector('.rcchat-story-card'),stack=card.querySelector('.rcchat-cast-stack'),s=stack.getBoundingClientRect(),k=card.getBoundingClientRect(),items=[...stack.querySelectorAll('.rcchat-stack-item')].map(i=>i.getBoundingClientRect());return{w:s.width,h:s.height,inside:items.every(r=>r.left>=k.left-1&&r.top>=k.top-1&&r.bottom<=k.bottom+1),card:k.height,count:items.length}})()");
    assert(c.w<=52&&c.h<=52&&c.inside&&c.card<=120&&c.count===3,JSON.stringify(c));
    await run("document.querySelector('.rcchat-convo').click()");await wait(200);
  });
  await check('conversation settings open on Story in short sections with a sticky close control',async()=>{
    await press('Conversation settings');await until("!!document.querySelector('.rcchat-modal [role=tablist]')");
    const t=await run("(()=>{const tabs=[...document.querySelectorAll('.rcchat-modal [role=tab]')];return{labels:tabs.map(b=>b.textContent),selected:tabs.find(b=>b.getAttribute('aria-selected')==='true').textContent,visible:[...document.querySelectorAll('.rcchat-modal .rcchat-pane')].filter(p=>!p.hidden).length,fits:tabs.every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=44})}})()");
    assert(t.labels.join()==='Story,Writing,Memory,Usage,Connection,Export'&&t.selected==='Story'&&t.visible===1&&t.fits,JSON.stringify(t));
    for(const id of ['story','writing','memory','usage','device','data']){
      await tab(id);await wait(80);
      const h=await run("document.querySelector('.rcchat-modal').scrollHeight");assert(h<2600,id+' section is '+h+'px tall');
      assert(await run(`!document.getElementById('rcchat-settings-tabs-${id}').hidden`),id+' pane shows');
    }
    await tab('memory');await run("document.querySelector('.rcchat-modal').scrollTop=100000");await wait(100);
    assert(await run("(()=>{const b=document.querySelector('.rcchat-modal [aria-label=\"Close dialog\"]'),r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&b.contains(hit)})()"),'close stays reachable after scrolling');
    await run("document.querySelector('.rcchat-modal [data-tab=\"memory\"]').focus()");
    await win.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'});await wait(120);
    assert(await run("document.activeElement.getAttribute('data-tab')==='usage'&&!document.getElementById('rcchat-settings-tabs-usage').hidden"),'arrow keys move between sections');
    await closeModal();
  });
  await check('long help text previews three lines and expands on demand',async()=>{
    await press('Conversation settings');await until("!!document.querySelector('.rcchat-modal [role=tablist]')");await tab('memory');await wait(200);
    const p=await run("(()=>{const p=document.querySelector('#rcchat-settings-tabs-memory p[data-long]');if(!p)return null;const before=p.getBoundingClientRect().height;p.click();const after=p.getBoundingClientRect().height;return{before,after,tab:p.tabIndex,full:p.textContent.length}})()");
    assert(p&&p.before<=70&&p.after>p.before&&p.tab===0&&p.full>=260,JSON.stringify(p));
    await closeModal();
  });
  await check('connection settings from the story list open on Connection',async()=>{
    await press('Connection settings');await until("!!document.querySelector('.rcchat-modal')");
    assert(await run("document.querySelector('.rcchat-modal [role=tab][aria-selected=true]').getAttribute('data-tab')==='device'&&!!document.querySelector('#rcchat-settings-tabs-device:not([hidden]) #rcchat-api-key')"));
    await closeModal();
  });
  await check('scene panel splits Scene, AI & rules and Memory; cast notes are compact',async()=>{
    await press('Scene panel');await until("!!document.querySelector('.rcchat-modal [data-tab=\"scene\"]')");
    const s=await run("(()=>{const heads=[...document.querySelectorAll('.rcchat-scene-member-head')];return{tabs:[...document.querySelectorAll('.rcchat-modal [role=tab]')].map(b=>b.textContent).join(),heads:heads.length,selects:heads.every(h=>h.querySelector('select')&&h.querySelector('select').getBoundingClientRect().height>=44),ids:!!document.getElementById('rcchat-presence-0')&&!!document.getElementById('rcchat-knowledge-0'),height:document.querySelector('.rcchat-modal').scrollHeight}})()");
    assert(s.tabs==='Scene,AI & rules,Memory'&&s.heads===3&&s.selects&&s.ids&&s.height<2200,JSON.stringify(s));
    await tab('ai');await wait(80);assert(await run("!!document.querySelector('#rcchat-scene-tabs-ai:not([hidden]) #rcchat-group-lore-scope')"),'AI & rules holds coordinator and lore scope');
    await closeModal();
  });
  await check('wide screens dock the Scene panel beside a still-usable story',async()=>{
    await size(1440,900);await press('Scene panel');await until("!!document.querySelector('.rcchat-docked .rcchat-modal')");
    const d=await run("(()=>{const m=document.querySelector('.rcchat-docked .rcchat-modal').getBoundingClientRect(),t=document.querySelector('.rcchat-compose textarea').getBoundingClientRect(),hit=document.elementFromPoint(t.x+20,t.y+t.height/2);return{left:m.left,right:m.right,top:m.top,bottom:m.bottom,textarea:hit===document.querySelector('.rcchat-compose textarea'),overlap:t.right>m.left}})()");
    assert(d.left>=1000&&d.right<=1440&&d.top>=0&&d.bottom<=900&&d.textarea&&!d.overlap,JSON.stringify(d));
    await closeModal();
  });
  await check('an older chat without a saved context size shows the model limit, not an empty custom box',async()=>{
    await press('Change model');await until("!!document.querySelector('#rcchat-context')");
    assert(await run("document.querySelector('#rcchat-context').value==='0'&&!document.querySelector('[aria-label=\"Custom context tokens\"]')"));
    await closeModal();
  });
  clearTimeout(timer);app.exit(failed?1:0);
}).catch(e=>{console.error(e.stack||e);clearTimeout(timer);app.exit(1)});
