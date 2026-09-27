// Exercise the shipped group Chat UI at phone width with a fake provider and a
// disposable web vault. No provider key or network is used.
const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcv-knowledge-draft-ui-'));
const site = path.join(temp, 'web');
fs.cpSync(path.join(root, 'web'), site, { recursive: true });
for (const [source, target] of [
  ['app/chat.js', 'js/rolecraft-chat.js'],
  ['app/chat-sync-core.js', 'js/chat-sync-core.js'],
  ['app/chat-knowledge-lanes.js', 'js/chat-knowledge-lanes.js'],
  ['app/chat-story-ledger.js', 'js/chat-story-ledger.js'],
  ['app/chat-draft-handoff.js', 'js/chat-draft-handoff.js'],
  ['app/chat-draft-handoff-controller.js', 'js/chat-draft-handoff-controller.js'],
  ['app/private-sync.js', 'js/private-sync.js'],
  ['app/chat.css', 'css/chat.css'],
]) fs.copyFileSync(path.join(root, source), path.join(site, target));
app.setPath('userData', path.join(temp, 'profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const preload = path.join(temp, 'preload.js');
fs.writeFileSync(preload, `
  window.__requests=[];
  window.__errors=[];
  window.addEventListener('error',event=>window.__errors.push(event.message+':'+event.filename+':'+event.lineno));
  window.addEventListener('unhandledrejection',event=>window.__errors.push(String(event.reason)));
  window.openRouter={
    status:async()=>({configured:true}),onEvent:callback=>{window.__emit=callback;return()=>{}},
    cancel:async()=>({ok:true}),start:async request=>{window.__requests.push(request);return{ok:true}}
  };
`);

let win;
const run = source => win.webContents.executeJavaScript(source);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(source) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await run(source)) return;
    await wait(40);
  }
  throw Error('Timed out: ' + source);
}
async function type(text) {
  await run(`(()=>{const field=document.querySelector('.rcchat-compose textarea');
    field.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,${JSON.stringify(text)});
    field.setSelectionRange(field.value.length,field.value.length);
    field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(50);
}
async function savedChat() {
  return run("storage.get('chats:all').then(result=>JSON.parse(result.value)[0])");
}
async function chooseSpeaker(name) {
  await run("document.querySelector('.rcchat-cast-trigger').click()");
  await until("!!document.querySelector('.rcchat-speaker-picker')");
  await run(`(()=>{const button=[...document.querySelectorAll('.rcchat-speaker-picker button')]
    .find(node=>node.getAttribute('aria-label')===${JSON.stringify('Reply as ' + name)});
    if(!button)throw Error('Missing '+${JSON.stringify(name)});button.click();})()`);
  await until(`document.querySelector('.rcchat-cast-trigger').textContent.includes(${JSON.stringify(name)})`);
}
function requestText(request) {
  return request.messages.map(message => message.content).join('\n');
}

const timeout = setTimeout(() => { console.error('Knowledge and draft UI timeout'); app.exit(1); }, 90000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: true, width: 360, height: 800,
    webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  win.setContentSize(360, 800);
  win.focus();
  await win.loadFile(path.join(site, 'index.html'));
  await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run(`(async()=>{
    await storage.set('ui:onboarded','1');
    await storage.set('chars:all',JSON.stringify([{id:'ari',name:'Ari',story:'Ari watches the bridge.'},{id:'bea',name:'Bea',story:'Bea guards the road.'}]));
    for(const key of ['personas:all','lore:all','prompts:all'])await storage.set(key,'[]');
    await storage.set('chats:all',JSON.stringify([{
      id:'group',title:'Bridge scene',characterId:'ari',model:'fixture/group',autoMemory:false,
      contextTokens:32000,maxTokens:500,participants:[{characterId:'ari',variantId:''},{characterId:'bea',variantId:''}],
      activeSpeakerKey:JSON.stringify(['ari','']),messages:[
        {id:'shared-user',parentId:null,role:'user',content:'We arrive at the shared bridge.',createdAt:1},
        {id:'shared-ari',parentId:'shared-user',role:'assistant',speaker:{characterId:'ari',variantId:'',name:'Ari'},content:'The bridge is still standing.',createdAt:2}
      ],leafId:'shared-ari',createdAt:1,updatedAt:2
    }]));
  })()`);
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); });
  await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  try { await until("!!document.querySelector('.rcchat-launch')"); }
  catch (error) {
    const state = await run("({slot:document.querySelector('.rcv')?.getAttribute('data-rcv-chat-launch'),base:document.querySelector('.rcv')?.outerHTML.slice(0,180),root:!!document.querySelector('#rcv-chat-root'),errors:window.__errors,body:document.body.innerText.slice(0,320)})");
    throw Error(error.message + '\nChat launcher state: ' + JSON.stringify(state));
  }
  await run("document.querySelector('.rcchat-launch').click()");
  await until("!!document.querySelector('.rcchat-compose textarea')");

  await run("document.querySelector('.rcchat-header-options').open=true");
  await run("document.querySelector('[aria-label=\"Scene panel\"]').click()");
  await until("!!document.querySelector('#rcchat-knowledge-lanes')");
  assert.strictEqual(await run("document.querySelector('#rcchat-knowledge-lanes').checked"), false);
  await run("document.querySelector('#rcchat-knowledge-lanes').click()");
  await until("storage.get('chats:all').then(result=>JSON.parse(result.value)[0].knowledgeLanes===true)");
  await run("document.querySelector('.rcchat-modal [aria-label=\"Close dialog\"]').click()");
  await until("!document.querySelector('.rcchat-modal')");

  const aside = await run(`(()=>{const button=document.querySelector('.rcchat-aside-toggle');
    if(!button)return null;const bounds=button.getBoundingClientRect();
    return {label:button.getAttribute('aria-label'),width:bounds.width,height:bounds.height,
      left:bounds.left,right:bounds.right,bottom:bounds.bottom,
      hit:button.contains(document.elementFromPoint(bounds.left+bounds.width/2,bounds.top+bounds.height/2)),
      overflow:document.querySelector('.rcchat-shell').scrollWidth-innerWidth,
      transcript:document.querySelector('.rcchat-messages').clientHeight};})()`);
  assert(aside && aside.label.includes('Ari') && aside.width >= 40 && aside.height >= 40 && aside.hit &&
    aside.left >= 0 && aside.right <= 361 && aside.bottom <= 801 && aside.overflow <= 1 && aside.transcript >= 150,
    'phone private aside control must be usable: ' + JSON.stringify(aside));
  await run("document.querySelector('.rcchat-aside-toggle').click()");
  assert.strictEqual(await run("document.querySelector('.rcchat-aside-toggle').getAttribute('aria-pressed')"), 'true');
  await type('Ari alone hears the hidden password: copper kestrel.');
  await run("document.querySelector('.rcchat-composefoot button.primary').click()");
  await until('window.__requests.length===1');
  const first = await run('window.__requests[0]');
  assert(requestText(first).includes('copper kestrel'), 'private recipient sees the aside');
  await run("(()=>{const request=window.__requests[0];window.__emit({id:request.requestId,type:'delta',text:'Ari whispers that copper kestrel opens the gate.'});window.__emit({id:request.requestId,type:'done'});})()");
  await until("storage.get('chats:all').then(result=>{const chat=JSON.parse(result.value)[0];return chat.messages.length===4&&!chat.messages[3].pending&&chat.messages[3].content.includes('copper kestrel')})");
  const chat = await savedChat();
  const ariKey = JSON.stringify(['ari', '']);
  assert.deepStrictEqual(chat.messages[2].audience, [ariKey], 'private user turn keeps its recipient');
  assert.deepStrictEqual(chat.messages[3].audience, [ariKey], 'private reply keeps the same recipient');
  assert.strictEqual(await run("[...document.querySelectorAll('.rcchat-private-badge')].filter(node=>node.textContent.includes('Private to Ari')).length"), 2,
    'both private turns are labelled in the visible transcript');

  await chooseSpeaker('Bea');
  await run("document.querySelector('.rcchat-header-options').open=true");
  await run("document.querySelector('[aria-label=\"Inspect context\"]').click()");
  await until("!!document.querySelector('.rcchat-preview')");
  const preview = await run("document.querySelector('.rcchat-preview').textContent");
  assert(preview.includes('We arrive at the shared bridge.'), 'shared context stays available');
  assert(!preview.includes('copper kestrel'), 'the other speaker cannot see private words in the context preview');
  await run("document.querySelector('.rcchat-modal [aria-label=\"Close dialog\"]').click()");
  await until("!document.querySelector('.rcchat-modal')");
  await type('Bea, what do you see from the road?');
  await run("document.querySelector('.rcchat-composefoot button.primary').click()");
  await until('window.__requests.length===2');
  const second = await run('window.__requests[1]');
  assert(requestText(second).includes('We arrive at the shared bridge.'), 'the next speaker retains shared story history');
  assert(requestText(second).includes('Bea, what do you see from the road?'), 'the next speaker receives the new message');
  assert(!requestText(second).includes('copper kestrel'), 'the provider request excludes both private turns');
  await run("(()=>{const request=window.__requests[1];window.__emit({id:request.requestId,type:'delta',text:'Bea sees the road ahead.'});window.__emit({id:request.requestId,type:'done'});})()");
  await until("storage.get('chats:all').then(result=>{const chat=JSON.parse(result.value)[0];return chat.messages.length===6&&!chat.messages[5].pending})");

  // A paired device can be represented without opening a native socket. Check
  // the actual Options control and modal layering with a mocked paired status.
  await run("window.RolecraftDeviceSyncEnabled=true;window.RolecraftDeviceSyncStatus={settings:{enabled:true,group:'fixture-group',device:'device-a'},peers:[{id:'device-b',label:'Tablet',online:true,draftHandoffSupported:true}]};window.RolecraftDeviceSyncRefresh=()=>{};void 0");
  await type('A reply to continue on the tablet.');
  await run("document.querySelector('.rcchat-header-options').open=true");
  await until("!!document.querySelector('[aria-label=\"Draft handoff\"]')");
  await run("document.querySelector('[aria-label=\"Draft handoff\"]').click()");
  await until("!!document.querySelector('.rcchat-draft-handoff')");
  const handoff = await run(`(()=>{const panel=document.querySelector('.rcchat-modal'),button=panel.querySelector('[aria-label="Close dialog"]');
    const box=panel.getBoundingClientRect(),hit=button.getBoundingClientRect();
    return {title:panel.getAttribute('aria-label'),left:box.left,right:box.right,bottom:box.bottom,
      front:button.contains(document.elementFromPoint(hit.left+hit.width/2,hit.top+hit.height/2)),
      overflow:document.documentElement.scrollWidth-innerWidth};})()`);
  assert(handoff.title === 'Draft handoff' && handoff.left >= 0 && handoff.right <= 361 &&
    handoff.bottom <= 801 && handoff.front && handoff.overflow <= 1,
    'draft handoff dialog must fit above chat at phone width: ' + JSON.stringify(handoff));

  clearTimeout(timeout);
  console.log('PASS: group knowledge opt-in, private context, provider payload and paired draft modal at 360px');
  app.exit(0);
}).catch(error => { console.error(error.stack); clearTimeout(timeout); app.exit(1); });
