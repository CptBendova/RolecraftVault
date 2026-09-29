// 1.339: ElevenLabs voices in the real renderer with a disposable profile. The
// native bridges and audio element are offline stubs; no key or paid request.
// Covers the character editor's voice list, Chat's Connection settings at phone
// width, the zero-retention gate, auto-read order and tap-to-stop.
const {app,BrowserWindow}=require('electron');
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-eleven-ui-'));
app.setPath('userData',tmp);app.commandLine.appendSwitch('force-device-scale-factor','1');
const VOICE='21m00Tcm4TlvDq8ikWAM',DOMI='AZnzlk1XvdvUeBnXmlld';
const preload=path.join(tmp,'preload.js');
fs.writeFileSync(preload,`(function(){var s;Object.defineProperty(window,'storage',{configurable:true,get:function(){return s},set:function(v){if(v&&typeof v.syncCommit==='function'&&typeof v.set==='function'){v.syncCommit=async function(values){for(var k of Object.keys(values||{}))await v.set(k,values[k]);return true}}s=v}})})();
window.__requests=[];window.__speech=[];window.__elevenKeys=[];window.__audios=[];window.__voiceLists=[];
window.openRouter={status:async()=>({configured:true}),onEvent:cb=>{window.__emit=cb;return()=>{}},cancel:async()=>({ok:true}),start:async r=>{window.__requests.push(r);return{ok:true}},speech:async r=>{window.__speech.push({provider:'openrouter',...r});return{ok:false,error:'unexpected OpenRouter voice'}}};
var mp3=btoa('ID3'+'\\u0005'.repeat(300));
window.elevenLabs={configured:false,status:async()=>({ok:true,secure:true,configured:window.elevenLabs.configured}),setKey:async o=>{window.__elevenKeys.push(o.key);window.elevenLabs.configured=true;return{ok:true}},clearKey:async()=>({ok:true}),cancel:async()=>({ok:true}),setUnlocked:async()=>({ok:true}),
  voices:async o=>{window.__voiceLists.push(o);return{ok:true,voices:[{id:'${VOICE}',name:'Rachel',category:'premade',description:'Calm narrator',labels:['accent: american']},{id:'${DOMI}',name:'Domi',category:'premade',description:'Strong and bright',labels:[]}],hasMore:false,nextPageToken:''}},
  speech:async r=>{window.__speech.push({provider:'elevenlabs',...r});return{ok:true,mime:'audio/mpeg',audio:mp3}}};
window.Audio=class{constructor(src){this.src=src;this.paused=false;window.__audios.push(this)}play(){return Promise.resolve()}pause(){this.paused=true}};`);
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=async s=>{try{return await win.webContents.executeJavaScript(s)}catch(e){throw Error(e.message+'\nProbe: '+s)}};
async function until(s,label){for(let i=0;i<300;i++){if(await run(s))return;await wait(50);}throw Error('Timed out: '+(label||s));}
async function click(label,scope){await run(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope||'button')})].find(b=>[b.getAttribute('aria-label'),b.textContent].some(v=>v&&v.trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)})&&b.getClientRects().length);if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);await wait(80);}
// Set a field the way React sees typing or choosing, not by assigning .value.
const setValue=(selector,value,kind)=>run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing ${selector}');Object.getOwnPropertyDescriptor(${kind}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(${JSON.stringify(kind==='HTMLSelectElement'?'change':'input')},{bubbles:true}))})()`);
const overflow=()=>run("Math.max(document.documentElement.scrollWidth,document.querySelector('.rcchat-modal')?.scrollWidth||0)-innerWidth");
async function reply(text){const n=await run('window.__requests.length');await run(`(()=>{const t=document.querySelector('.rcchat-compose textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify('Turn '+text)});t.dispatchEvent(new Event('input',{bubbles:true}))})()`);await click('Send','#rcv-chat-root button');await until('window.__requests.length==='+(n+1),'request '+text);await run(`window.__emit({id:window.__requests[${n}].requestId,type:'delta',text:${JSON.stringify(text)}});window.__emit({id:window.__requests[${n}].requestId,type:'done'})`);}
const timeout=setTimeout(()=>{console.error('ElevenLabs UI timeout');app.exit(1)},150000);
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.setContentSize(360,800);win.focus();
  await win.loadFile(path.join(root,'web/index.html'));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run(`(async()=>{await window.storage.set('ui:onboarded','1');for(const k of ['personas:all','lore:all','prompts:all'])await window.storage.set(k,'[]');await window.storage.set('chars:all',JSON.stringify([{id:'c',name:'Ari',createdAt:1,sections:[],gallery:[],tags:[],variants:[],ttsProvider:'elevenlabs',elevenVoiceId:'${VOICE}',elevenVoiceName:'Rachel'}]));await window.storage.set('chats:all',JSON.stringify([{id:'s',title:'Voice fixture',characterId:'c',model:'fixture',autoMemory:false,messages:[{id:'a',parentId:null,role:'assistant',content:'Welcome back.'}],leafId:'a'}]))})()`);
  await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload()});await until("!!document.querySelector('.rcchat-launch')");

  // Character editor: ElevenLabs provider, explicit voice list, choose a voice.
  await click('Characters');await until("!!document.querySelector('.char-card')");await run("document.querySelector('.char-card').click()");await click('Edit character');
  await until("!!document.querySelector('#character-voice-provider')");
  assert.equal(await run("document.querySelector('#character-voice-provider').value"),'elevenlabs');
  assert(await run("document.querySelector('.eleven-voice-current').textContent.includes('Rachel')"));
  assert.equal(await run('window.__voiceLists.length'),0,'the voice list is never loaded without asking');
  await run("document.querySelector('.eleven-voice-current').scrollIntoView()");await click('Load my voices');
  await until("!!document.querySelector('#character-eleven-voice')");
  await setValue('#character-eleven-voice',DOMI,'HTMLSelectElement');
  await until("document.querySelector('.eleven-voice-current').textContent.includes('Domi')",'chosen voice shown');
  assert(await overflow()<=1,'editor voice card fits a 360px phone');
  await setValue('#character-voice-provider','openrouter','HTMLSelectElement');
  await until("!document.querySelector('.eleven-voice')&&!!document.querySelector('#character-voice-provider')",'Gemini voice controls return');
  await setValue('#character-voice-provider','elevenlabs','HTMLSelectElement');
  await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload()});await until("!!document.querySelector('.rcchat-launch')");
  console.log('PASS character editor loads ElevenLabs voices only on request and switches providers at phone width');

  // Chat Connection settings: key, playback mode and the retention choices.
  await click('Chat','#rcv-sidebar-chat button,#rcv-dashboard-chat button,.rcchat-launch');await until("!!document.querySelector('.rcchat-compose textarea')");
  await run("document.querySelector('[aria-label=\"Connection settings\"]').click()");
  await until("!!document.querySelector('.rcchat-voice-settings')",'voice settings in Connection');
  await setValue('#rcchat-eleven-key','sk_fixture_key_0000000000','HTMLInputElement');
  await click('Save securely','.rcchat-voice-settings button');
  await until("window.__elevenKeys.length===1&&document.querySelector('.rcchat-voice-settings').textContent.includes('ElevenLabs key saved')",'key saved');
  assert.equal(await run("document.querySelector('#rcchat-eleven-key').value"),'','the typed key is cleared after saving');
  await setValue('#rcchat-voice-playback','auto','HTMLSelectElement');await setValue('#rcchat-eleven-model','eleven_v4_turbo','HTMLSelectElement');
  await until("window.storage.get('ui:chat-voice').then(r=>r&&JSON.parse(r.value).playback==='auto'&&JSON.parse(r.value).model==='eleven_v4_turbo')",'preferences saved');
  const fit=await run("(()=>{const f=document.querySelector('.rcchat-voice-settings').getBoundingClientRect();return{left:f.left,right:f.right,checks:[...document.querySelectorAll('.rcchat-check')].map(c=>c.getBoundingClientRect().height)}})()");
  assert(fit.left>=0&&fit.right<=361&&fit.checks.every(h=>h>=44),JSON.stringify(fit));
  assert(await overflow()<=1,'Connection settings fit a 360px phone');
  await click('Done','#rcv-chat-root button');
  console.log('PASS Connection settings save the ElevenLabs key, model and auto-read at phone width');

  // A zero-retention story does not send to ElevenLabs until explicitly allowed.
  await reply('First reply.');
  await until("document.querySelector('#rcv-chat-root').textContent.includes('requires zero data retention')",'zero-retention gate explained');
  assert.equal(await run("window.__speech.length"),0,'nothing is sent while the story requires zero retention');
  await run("document.querySelector('[aria-label=\"Connection settings\"]').click()");await until("!!document.querySelector('.rcchat-voice-settings')");
  await run("[...document.querySelectorAll('.rcchat-check')].find(l=>l.textContent.includes('Allow ElevenLabs to keep')).querySelector('input').click()");
  await until("window.storage.get('ui:chat-voice').then(r=>JSON.parse(r.value).allowRetention===true)",'allow saved');
  await click('Done','#rcv-chat-root button');

  // Auto-read: each new reply plays in order after the previous one ends.
  await reply('Second reply.');
  await until('window.__speech.length===1&&window.__audios.length===1','first auto-read');
  assert.deepEqual(await run('window.__speech[0]'),{provider:'elevenlabs',text:'Second reply.',voiceId:VOICE,model:'eleven_v4_turbo',zeroRetention:false});
  await reply('Third reply.');await wait(300);
  assert.equal(await run('window.__speech.length'),1,'a reply that finishes during playback waits its turn');
  await run('window.__audios[0].onended()');
  await until("window.__speech.length===2&&window.__speech[1].text==='Third reply.'",'queued reply plays next');
  // Tapping the playing reply's voice button stops it and clears the queue.
  await reply('Fourth reply.');await wait(200);
  await run("(()=>{const b=[...document.querySelectorAll('.rcchat-tool[data-tool=voice]')].find(b=>b.textContent==='Stop voice');if(!b)throw Error('no Stop voice');b.closest('details')&&(b.closest('details').open=true);b.click()})()");
  await wait(200);
  assert(await run('window.__audios[1].paused'),'Stop voice pauses playback');
  await run('window.__audios[1].onended&&window.__audios[1].onended()');await wait(200);
  assert.equal(await run('window.__speech.length'),2,'stopping clears queued replies');
  assert.equal(await run('window.__requests.length'),4);
  console.log('PASS zero-retention stories need an explicit ElevenLabs choice; auto-read plays new replies in order and Stop clears the queue');
  clearTimeout(timeout);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(timeout);app.exit(1)});
