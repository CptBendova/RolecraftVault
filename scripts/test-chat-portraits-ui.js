const {app,BrowserWindow}=require('electron');
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-chat-crop-'));
app.setPath('userData',tmp);app.commandLine.appendSwitch('force-device-scale-factor','1');
app.commandLine.appendSwitch('enable-features','OverlayScrollbar');
const preload=path.join(tmp,'phone.js');
fs.writeFileSync(preload,"window.Capacitor={isNativePlatform:()=>true};Object.defineProperty(window.screen,'width',{value:360});Object.defineProperty(window.screen,'height',{value:800});");
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=async s=>{try{return await win.webContents.executeJavaScript(s)}catch(e){throw Error(e.message+'\nProbe: '+s)}};
async function until(s){for(let i=0;i<160;i++){if(await run(s))return;await wait(50)}throw Error('Timed out: '+s)}
async function click(label){await run(`(()=>{const b=[...(${JSON.stringify(label)}==='Chat'?document.querySelector('.rcchat-launch')?.parentElement:(document.querySelector('.rcchat-modal')||document.querySelector('.rcchat-shell')||document)).querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.textContent).trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)}&&b.getClientRects().length);if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);await wait(80)}
async function slider(label,value){await run(`(()=>{const e=document.querySelector('input[aria-label="Chat portrait ${label}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(60)}
async function reload(){await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload()});await until("!!document.querySelector('.rcchat-launch')")}
const timer=setTimeout(()=>{console.error('Chat portrait timeout');app.exit(1)},90000);
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.setContentSize(360,800);win.focus();
  await win.loadFile(path.join(root,'web/index.html'));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run(`(async()=>{const c=document.createElement('canvas');c.width=100;c.height=200;const x=c.getContext('2d');x.fillStyle='#be754c';x.fillRect(0,0,100,200);x.fillStyle='#283966';x.fillRect(0,0,100,80);x.fillStyle='#f5dab8';x.fillRect(20,80,60,70);for(const k of ['img:portrait','th:portrait'])await window.storage.set(k,c.toDataURL());await window.storage.set('ui:onboarded','1');await window.storage.set('chars:all',JSON.stringify([{id:'c',name:'Ari',profileImg:'portrait',createdAt:1,sections:[],gallery:[],tags:[],variants:[{id:'v',name:'Evening',profileImg:'portrait',chatPortraitCrop:{x:0,y:0,zoom:1}}]}]));await window.storage.set('personas:all',JSON.stringify([{id:'p',name:'Robin',avatar:'portrait',sections:[],gallery:[],tags:[]}]));for(const k of ['lore:all','prompts:all'])await window.storage.set(k,'[]');await window.storage.set('chats:all',JSON.stringify([{id:'s',title:'A quiet evening',characterId:'c',personaId:'p',model:'fixture',messages:[{id:'a',parentId:null,role:'assistant',content:'The lantern glows. "Welcome back."'},{id:'u',parentId:'a',role:'user',content:'I take a seat.'}],leafId:'u'}]))})()`);
  await reload();const original=await run("window.storage.get('img:portrait').then(r=>r.value)");
  await click('Characters');await until("!!document.querySelector('.char-card')");await run("document.querySelector('.char-card').click()");await click('Edit character');await until("!!document.querySelector('.rcchat-crop-preview img')");
  await slider('zoom',2);await slider('horizontal position',.3);await slider('vertical position',.7);
  const cropBounds=await run("(()=>{const p=document.querySelector('.rcchat-crop-preview'),r=p.getBoundingClientRect(),sheet=document.querySelector('.scrollbody.sheet[aria-label=\"Edit character\"]');return{w:r.width,h:r.height,sheet:sheet.scrollWidth,viewport:innerWidth}})()");
  assert(Math.abs(cropBounds.w-cropBounds.h)<1&&cropBounds.w>0&&cropBounds.sheet<=cropBounds.viewport+1,JSON.stringify(cropBounds));
  assert(await run("[...document.querySelectorAll('.rcchat-crop-editor,.rcchat-crop-control')].every(e=>e.scrollWidth<=e.clientWidth+1)"),'crop controls do not create nested horizontal overflow');
  await click('Save character');await until("!document.querySelector('.rcchat-crop-editor')");
  const character=await run("window.storage.get('chars:all').then(r=>JSON.parse(r.value)[0])");assert.deepStrictEqual(character.chatPortraitCrop,{x:.3,y:.7,zoom:2});assert.deepStrictEqual(character.variants[0].chatPortraitCrop,{x:0,y:0,zoom:1});
  assert.equal(await run("window.storage.get('img:portrait').then(r=>r.value)"),original,'framing never rewrites the artwork');
  await click('Close character');await click('Dashboard');await until("!!document.querySelector('.sidebar .rcchat-launch')");await click('Chat');await until("document.querySelectorAll('.rcchat-mini img').length===2&&!!document.querySelector('.rcchat-headportrait img')");
  for(const [w,h,mode]of [[360,800,'quality'],[360,380,'performance'],[1440,900,'quality']]){
    win.setContentSize(w,h);await wait(100);
    await run(`document.querySelector('.rcv').classList.toggle('perf',${mode==='performance'})`);await wait(80);
    const bounds=await run("(()=>{const head=document.querySelector('.rcchat-head').getBoundingClientRect(),pic=document.querySelector('.rcchat-headportrait').getBoundingClientRect(),mini=document.querySelector('.rcchat-mini').getBoundingClientRect(),img=document.querySelector('.rcchat-message.assistant img');return{head:head.height,photo:pic.width,mini:mini.width,overflow:document.querySelector('.rcchat-shell').scrollWidth-innerWidth,crop:img.style.width,canvas:document.querySelector('.rcchat-messages').clientHeight}})()");
    assert(bounds.photo>0&&bounds.photo<=46&&bounds.mini===28&&bounds.overflow<=1&&bounds.crop==='200%',JSON.stringify(bounds));if(w===360)assert(bounds.head<=66&&bounds.canvas>=h-155,JSON.stringify(bounds));
    if(w===360&&h===800){const dir=path.join(root,'dist','screenshots');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'chat-1.270-mini-portraits.png'),(await win.webContents.capturePage()).toPNG());}
  }
  await reload();await click('Chat');await until("!!document.querySelector('.rcchat-headportrait img')");assert.equal(await run("document.querySelector('.rcchat-headportrait img').style.width"),'200%','crop survives restart');
  const captured=await run("window.storage.get('chats:all').then(r=>JSON.parse(r.value)[0].castSnapshot)");assert.deepStrictEqual(captured.character.chatPortraitCrop,{x:.3,y:.7,zoom:2});assert.equal(captured.persona.avatar,'portrait');
  console.log('PASS: real Edit Character crop/save, unchanged artwork, variant independence, mini portraits, compact keyboard layout and restart/snapshot preservation');clearTimeout(timer);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(timer);app.exit(1)});
