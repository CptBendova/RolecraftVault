// Focused source-backed group UI checks. No network or real provider keys.
const { app, BrowserWindow } = require('electron');
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcv-group-ui-regressions-')), site = path.join(tmp, 'web');
fs.cpSync(path.join(root, 'web'), site, { recursive: true });
for (const [source, target] of [['app/chat.js', 'js/rolecraft-chat.js'], ['app/chat-sync-core.js', 'js/chat-sync-core.js'], ['app/chat.css', 'css/chat.css']]) fs.copyFileSync(path.join(root, source), path.join(site, target));
app.setPath('userData', path.join(tmp, 'profile')); app.commandLine.appendSwitch('force-device-scale-factor', '1');
const preload = path.join(tmp, 'preload.js');
fs.writeFileSync(preload, `/* 1.331 test shim: chat saves now use storage.syncCommit; route it through storage.set so these fault-injection checks still exercise failed-save UI. CAS itself is covered by test-sync-chat-cas. */(function(){var s;Object.defineProperty(window,'storage',{configurable:true,get:function(){return s},set:function(v){if(v&&typeof v.syncCommit==='function'&&typeof v.set==='function'){v.syncCommit=async function(values){for(var k of Object.keys(values||{}))await v.set(k,values[k]);return true}}s=v}})})();window.__requests=[];window.openRouter={status:async()=>({configured:true}),onEvent:()=>()=>{},cancel:async()=>({ok:true}),start:async r=>{window.__requests.push(r);return{ok:true}}};`);
let win; const wait = ms => new Promise(r => setTimeout(r, ms));
const run = s => win.webContents.executeJavaScript(s);
async function until(s) { for (let i = 0; i < 150; i++) { if (await run(s)) return; await wait(40); } throw Error('Timed out: ' + s); }
async function type(text) { await run(`(()=>{const t=document.querySelector('.rcchat-compose textarea');t.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(text)});t.setSelectionRange(t.value.length,t.value.length);t.dispatchEvent(new Event('input',{bubbles:true}))})()`); await wait(80); }
async function selectSpeaker(name) {
  await run("document.querySelector('.rcchat-cast-trigger').click()"); await until("!!document.querySelector('.rcchat-speaker-picker')");
  await run(`(()=>{const b=[...document.querySelectorAll('.rcchat-speaker-picker button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify('Reply as ' + name)});if(!b)throw Error('Missing speaker '+${JSON.stringify(name)});b.click()})()`);
  await until("!document.querySelector('.rcchat-speaker-picker')");
  await until(`document.querySelector('.rcchat-speaker-pill').textContent.includes(${JSON.stringify(name)})`);
}
const failures = [];
function check(label, ok, info) { console.log((ok ? 'PASS: ' : 'FAIL: ') + label + (ok ? '' : ' ' + JSON.stringify(info))); if (!ok) failures.push(label); }
const timeout = setTimeout(() => { console.error('Group UI regression timeout'); app.exit(1); }, 90000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: true, width: 360, height: 800, webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false } }); win.setContentSize(360, 800); win.focus();
  await win.loadFile(path.join(site, 'index.html')); await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run(`(async()=>{await storage.set('ui:onboarded','1');const chars=[{id:'a',name:'Ari',story:'ARI'},{id:'b',name:'Beatrice the exceedingly long-name Night Watch Captain',story:'BEATRICE'},{id:'c',name:'Celeste',story:'CELESTE'}];await storage.set('chars:all',JSON.stringify(chars));await storage.set('personas:all',JSON.stringify([{id:'p',name:'Robin',description:'ROBIN'}]));for(const k of ['lore:all','prompts:all'])await storage.set(k,'[]');const messages=[];for(let i=0;i<20;i++)messages.push({id:'m'+i,parentId:i?'m'+(i-1):null,role:i%2?'assistant':'user',content:'Scene continuity '+i+'. '+('A long moment in this ongoing scene. ').repeat(18),createdAt:Date.UTC(2026,8,15,10,30)+i*1000});await storage.set('chats:all',JSON.stringify([{id:'s',title:'Group fixture (memory rebuilt) (memory rebuilt)',characterId:'a',personaId:'p',model:'fixture',autoMemory:false,messages,leafId:'m19',createdAt:Date.UTC(2026,8,14),updatedAt:Date.UTC(2026,8,20)}]));})()`);
  await new Promise(r => { win.webContents.once('did-finish-load', r); win.reload(); }); await until("!!document.querySelector('.rcchat-launch')"); await run("document.querySelector('.rcchat-launch').click()"); await until("!!document.querySelector('.rcchat-compose textarea')");
  await wait(250); await type('@bea'); await until("!!document.querySelector('.rcchat-mentions [role=option]')"); await run("document.querySelector('.rcchat-mentions [role=option]').click()"); await until("!!document.querySelector('.rcchat-speaker-pill')");
  await type('Keep this exact draft while changing the cast.');
  await run("document.querySelector('.rcchat-messages').scrollTop=120;document.querySelector('.rcchat-messages').dispatchEvent(new Event('scroll'))");
  await selectSpeaker('Ari');
  await wait(100);
  check('choosing a speaker preserves draft and reading position', await run("document.querySelector('.rcchat-compose textarea').value==='Keep this exact draft while changing the cast.'&&Math.abs(document.querySelector('.rcchat-messages').scrollTop-120)<2"));
  await selectSpeaker('Beatrice the exceedingly long-name Night Watch Captain'); await wait(100);
  const identities = await run("[...document.querySelectorAll('.rcchat-message.assistant strong')].map(n=>n.textContent)");
  check('new speaker never relabels prior character messages', identities.length > 0 && identities.every(name => name === 'Ari'), identities);
  check('rebuilt-copy title is clean in header and conversation list', await run("document.querySelector('.rcchat-title').textContent==='Group fixture'&&document.querySelector('.rcchat-story-copy strong').textContent==='Group fixture'"));
  check('last-chat date uses message time, not recent participant or settings edits', await run("(()=>{const expected='Last chatted '+new Date(Date.UTC(2026,8,15,10,30)+19000).toLocaleDateString(),summary=[...document.querySelectorAll('.rcchat-story-copy small')].map(n=>n.textContent).join(' ');return summary.includes('Next:')&&summary.includes('Last:')&&summary.includes(expected)&&document.querySelector('.rcchat-sub').textContent.includes(expected)&&document.querySelector('.rcchat-title').title.includes(expected)})()"));
  await type('');
  for (const perf of [false, true]) {
    await selectSpeaker('Beatrice the exceedingly long-name Night Watch Captain'); await wait(60);
    await run(`document.querySelector('.rcv').classList.toggle('perf',${perf})`); await until(`document.querySelector('#rcv-chat-root').classList.contains('rcchat-perf')===${perf}`);
    for (const [width, height] of [[360, 800], [360, 420], [1440, 900]]) {
      win.setContentSize(width, height); await wait(180);
      const label = (perf ? 'performance ' : 'quality ') + width + 'x' + height;
      if (width === 360) {
        await run("document.querySelector('.rcchat-header-options').open=true"); await wait(240);
        const options = await run(`(()=>{const menu=document.querySelector('.rcchat-headtools'),r=menu.getBoundingClientRect();return{bounds:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},buttons:[...menu.querySelectorAll('button')].filter(b=>{const q=b.getBoundingClientRect();return q.top>=r.top&&q.bottom<=r.bottom}).map(b=>{const q=b.getBoundingClientRect(),hit=document.elementFromPoint(q.x+q.width/2,q.y+q.height/2);return{label:b.getAttribute('aria-label')||b.textContent,front:b.contains(hit),hit:hit&&hit.className}})}})()`);
        check(label + ' Options stays above transcript and composer', options.buttons.length >= 3 && options.buttons.every(b => b.front), options);
        check(label + ' Options fits visual viewport', options.bounds.left >= 0 && options.bounds.right <= width + 1 && options.bounds.bottom <= height + 1, options);
        if (process.env.RCV_CAPTURE_IMAGES && !perf && height === 420) { const dir = path.join(root, 'dist', 'maintenance'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'chat-options-keyboard-360.png'), (await win.webContents.capturePage()).toPNG()); }
        await run("document.querySelector('.rcchat-header-options').open=false");
      }
      await type('A short unsent reply.');
      const composer = await run(`(()=>{const t=document.querySelector('.rcchat-compose textarea'),f=document.querySelector('.rcchat-compose'),m=document.querySelector('.rcchat-messages'),r=t.getBoundingClientRect();return{input:r.width,footer:f.getBoundingClientRect().height,bottom:f.getBoundingClientRect().bottom,messages:m.clientHeight,overflow:document.querySelector('.rcchat-shell').scrollWidth-innerWidth}})()`);
      check(label + ' group composer leaves typing and reading room', composer.input >= (width === 360 ? 140 : 300) && composer.messages >= 150 && composer.bottom <= height + 1 && composer.overflow <= 1, composer);
      await type('');
      const empty = await run(`(()=>{const t=document.querySelector('.rcchat-compose textarea'),b=document.querySelector('.rcchat-composefoot>.primary');return{input:t.getBoundingClientRect().width,button:b.getBoundingClientRect().width,footer:document.querySelector('.rcchat-compose').getBoundingClientRect().height,clientHeight:t.clientHeight,scrollHeight:t.scrollHeight}})()`);
      check(label + ' long selected name does not squeeze empty reply input', empty.input >= (width === 360 ? 140 : 300), empty);
      check(label + ' empty placeholder is not clipped', empty.scrollHeight <= empty.clientHeight + 1, empty);
      await type('A multiline draft.\nKeep the scene intact.\nThese words are still editable.\nOne more line.\nAnd another line.');
      const multiline = await run(`(()=>{const t=document.querySelector('.rcchat-compose textarea'),f=document.querySelector('.rcchat-compose'),m=document.querySelector('.rcchat-messages'),b=document.querySelector('.rcchat-composefoot>.primary'),r=b.getBoundingClientRect();return{footer:f.getBoundingClientRect().height,bottom:f.getBoundingClientRect().bottom,messages:m.clientHeight,input:t.getBoundingClientRect().height,buttonFront:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()`);
      check(label + ' multiline group draft and Send remain reachable', multiline.messages >= 150 && multiline.bottom <= height + 1 && multiline.buttonFront, multiline);
      await type('');
      if (process.env.RCV_CAPTURE_IMAGES && !perf && width === 360 && height === 420) { const dir = path.join(root, 'dist', 'maintenance'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'chat-group-keyboard-360.png'), (await win.webContents.capturePage()).toPNG()); }
    }
    win.setContentSize(360, 420); await wait(100);
    await run("window.__storageSet=storage.set;storage.set=(key,value)=>key==='chats:all'?Promise.reject(Error('Fixture disk full')):window.__storageSet(key,value);void 0");
    await selectSpeaker('Ari');
    await until("[...document.querySelectorAll('.rcchat-compose button')].some(b=>b.textContent==='Retry save')");
    const failedSave = await run(`(()=>{const t=document.querySelector('.rcchat-compose textarea'),f=document.querySelector('.rcchat-compose');return{width:t.getBoundingClientRect().width,overflow:document.querySelector('.rcchat-shell').scrollWidth-innerWidth,bottom:f.getBoundingClientRect().bottom}})()`);
    check((perf ? 'performance' : 'quality') + ' Retry save leaves a usable mobile draft input', failedSave.width >= 140 && failedSave.overflow <= 1 && failedSave.bottom <= 421, failedSave);
    await run("storage.set=window.__storageSet;[...document.querySelectorAll('.rcchat-compose button')].find(b=>b.textContent==='Retry save').click()");
    await until("![...document.querySelectorAll('.rcchat-compose button')].some(b=>b.textContent==='Retry save')");
  }
  assert.equal(await run('window.__requests.length'), 0, 'UI changes never call the provider');
  clearTimeout(timeout); assert.equal(failures.length, 0, failures.join('\n')); console.log('PASS: private group UI overlays and composer in quality/performance phone, keyboard-height and desktop'); app.exit(0);
}).catch(e => { console.error(e.stack); clearTimeout(timeout); app.exit(1); });
