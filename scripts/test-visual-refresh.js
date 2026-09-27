/* Real renderer: visual parity, readable bucket art, modes, themes and keyboard fit.
   Run with Electron; all records/images use a disposable profile and native stub. */
const {app,BrowserWindow}=require('electron');
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-visual-refresh-'));
app.setPath('userData',tmp);app.commandLine.appendSwitch('force-device-scale-factor','1');
const preload=path.join(tmp,'preload.js');
fs.writeFileSync(preload,`window.openRouter={status:async()=>({configured:true}),onEvent:()=>()=>{},models:async()=>({ok:true,models:[]})};`);
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(e){throw Error(e.message+'\nProbe: '+s);}};
async function until(s){for(let i=0;i<100;i++){if(await run(s))return;await wait(50);}console.error(await run("JSON.stringify({visibility:document.visibilityState,focus:document.hasFocus(),width:innerWidth,height:innerHeight,portraits:[...document.querySelectorAll('.rcchat-portrait')].map(e=>({rect:e.getBoundingClientRect().toJSON(),html:e.outerHTML.slice(0,240)}))})"));throw Error('Timed out: '+s);}
async function click(label){await run(`(()=>{const b=[...(${JSON.stringify(label)}==='Chat'?document.querySelector('.rcchat-launch')?.parentElement:(document.querySelector('.rcchat-modal')||document.querySelector('#rcv-chat-root'))).querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.textContent).trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click()})()`);await wait(80);}
async function size(w,h){win.setContentSize(w,h);await until(`innerWidth===${w}&&innerHeight===${h}`);await wait(80);}
async function checkProse(theme) {
  const colours=await run(`(()=>{const host=document.querySelector('#rcv-chat-root'),test=document.createElement('span');host.append(test);const resolve=v=>{test.style.color='var(--'+v+')';return getComputedStyle(test).color};const text=resolve('text'),accent=resolve('brass');test.remove();return [...document.querySelectorAll('.rcchat-message')].map(m=>({text,accent,plain:getComputedStyle(m.querySelector('.rcchat-prose')).color,dialogue:getComputedStyle(m.querySelector('.rcchat-dialogue')).color,em:m.querySelector('.rcchat-prose em')&&getComputedStyle(m.querySelector('.rcchat-prose em')).color,surface:getComputedStyle(m.closest('.rcchat-novel')?m:m.querySelector('.rcchat-bubble')).backgroundColor}))})()`);
  const lum=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(n=>{n=Number(n)/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
  for(const c of colours){
    assert.equal(c.plain,c.text,theme+' narration follows theme');
    assert.equal(c.dialogue,c.accent,theme+' speech follows accent');
    assert.notEqual(c.dialogue,c.plain,theme+' speech and narration are distinct');
    if(c.em)assert.equal(c.em,c.text,theme+' action prose uses readable theme text');
    for(const foreground of [c.plain,c.dialogue]){const a=lum(foreground),b=lum(c.surface);assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,theme+' readable prose contrast '+JSON.stringify(c));}
  }
}
async function capture(name){if(process.env.RCV_CAPTURE_CHAT){await wait(350);const version=JSON.parse(fs.readFileSync(path.join(root,'app/package.json'),'utf8')).version;fs.writeFileSync(path.join(root,'dist','visual-'+version+'-'+name+'.png'),(await win.webContents.capturePage()).toPNG());}}
const timeout=setTimeout(()=>app.exit(1),120000);
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:true,width:1440,height:900,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.focus();
  win.webContents.on('console-message',e=>{if(e.level==='error')console.error('Renderer: '+e.message);});
  await win.loadFile(path.join(root,'web/index.html'));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run(`(async()=>{
    const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;const x=canvas.getContext('2d');
    const g=x.createLinearGradient(0,0,0,600);g.addColorStop(0,'#264764');g.addColorStop(.55,'#eab576');g.addColorStop(1,'#15283a');x.fillStyle=g;x.fillRect(0,0,800,600);
    x.fillStyle='#f6d9a3';x.beginPath();x.arc(520,190,48,0,Math.PI*2);x.fill();
    for(let j=0;j<3;j++){x.fillStyle=['#597286','#344f67','#1a3348'][j];x.beginPath();x.moveTo(0,330+j*70);for(let i=0;i<=800;i+=40)x.lineTo(i,320+j*60+Math.sin(i/80+j)*50);x.lineTo(800,600);x.lineTo(0,600);x.fill();}
    for(const key of ['img:art','th:art'])await window.storage.set(key,canvas.toDataURL());
    await window.storage.set('buckets:meta',JSON.stringify({Valley:{cover:'art'}}));
    await window.storage.set('chars:all',JSON.stringify([{id:'ari',name:'Ari Everwood',bucket:'Valley',profileImg:'art',tagline:'Cartographer of forgotten places',story:'A wandering mapmaker.',sections:[],variants:[],gallery:[],tags:[]}]));
    await window.storage.set('personas:all','[]');await window.storage.set('lore:all','[]');await window.storage.set('prompts:all','[]');
    await window.storage.set('ui:onboarded','1');await window.storage.set('chats:all',JSON.stringify([{id:'story',title:'Beyond the quiet valley',characterId:'ari',model:'test/story-model',leafId:'a2',messages:[{id:'a1',role:'assistant',content:'*Ari unfolds a worn map as the last light settles over the valley.*\\n\\n"The old road ends here. Shall we see what lies beyond it?"'},{id:'u1',parentId:'a1',role:'user',content:'I take a closer look at the map. "Lead the way. We have a little daylight left."'},{id:'a2',parentId:'u1',role:'assistant',content:'*She smiles, tracing a faint trail toward the mountains.*\\n\\n"Then we will make our own path."'}],autoMemory:false}]));
  })()`);
  const geometry={};
  for(const theme of ['dark','light','charsnap','custom'])for(const mode of ['quality','performance']){
    await run(`localStorage.setItem('rcv-theme',${JSON.stringify(theme)});localStorage.setItem('rcv-perfmode',${JSON.stringify(mode)});localStorage.setItem('rcv-custom-theme',JSON.stringify({background:'#201c29',surface:'#2c2637',accent:'#dda8cb',text:'#f4eaf2'}))`);
    // BrowserWindow.reload returns void. Wait for the new document, not a launch
    // button still present in the old page while navigation is starting.
    await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});await until("!!document.querySelector('.rcchat-launch')");await click('Chat');await until("!!document.querySelector('.rcchat-bucket-backdrop img')");
    assert.equal(await run("document.querySelector('#rcv-chat-root').classList.contains('rcchat-perf')"),mode==='performance');
    await checkProse(theme);
    for(const [w,h] of [[1440,900],[800,900],[360,800],[360,420]]){
      await size(w,h);
      const p=await run(`(()=>{const c=document.querySelector('.rcchat-compose'),m=document.querySelector('.rcchat-messages'),s=document.querySelector('.rcchat-shell');const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};return{header:rect(document.querySelector('.rcchat-head')),compose:rect(c),messages:rect(m),overflow:s.scrollWidth-s.clientWidth,buttons:[...document.querySelectorAll('.rcchat-head button,.rcchat-composefoot button')].filter(b=>b.getClientRects().length).every(b=>{const r=b.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}),radius:getComputedStyle(document.querySelector('.rcchat-composebox')).borderRadius}})()`);
      assert(p.overflow<=1&&p.buttons&&p.messages.h>=64&&p.compose.y+p.compose.h<=h+1,`${theme}/${mode}/${w}x${h}: ${JSON.stringify(p)}`);
      if(w===1440)assert(p.header.h<=100&&p.compose.h<=185&&p.messages.h>=600,`${theme}/${mode}: desktop chrome leaves reading space: ${JSON.stringify(p)}`);
      assert.equal(p.radius,w<=760?'14px':'20px','new composer geometry');
      if(mode==='performance'&&w===360&&h===800){
        const cards=await run("[...document.querySelectorAll('.rcchat-message')].map(e=>{const head=e.querySelector('.rcchat-msghead').getBoundingClientRect(),body=e.querySelector('.rcchat-bubble').getBoundingClientRect();return{gap:body.top-head.bottom,surface:getComputedStyle(e).backgroundColor,shadow:getComputedStyle(e).boxShadow}})");
        assert(cards.length&&cards.every(c=>Math.abs(c.gap)<=1&&c.surface!=='rgba(0, 0, 0, 0)'&&c.shadow==='none'),`${theme}: Performance keeps one opaque, unshadowed card per turn: ${JSON.stringify(cards)}`);
      }
      if(w===360){assert(p.compose.h<=150,'Phone composer leaves room for the transcript: '+p.compose.h);assert(await run("(()=>{const t=document.querySelector('.rcchat-compose textarea');return t.rows===1&&t.autocapitalize==='sentences'&&t.spellcheck})()"),'Mobile sentence capitalisation and compact input');}
      if(w===360&&h===800){
        assert(await run("!document.querySelector('.rcchat-message-actions').open&&!document.querySelector('.rcchat-tools').getClientRects().length"),'phone actions start collapsed');
        await run("document.querySelector('.rcchat-message-actions>summary').click()");await wait(60);
        assert(await run("document.querySelector('.rcchat-message-actions').open&&document.querySelector('.rcchat-tools').getClientRects().length>0"),'phone actions remain reachable');
        await run("document.querySelector('.rcchat-message-actions>summary').click()");await wait(60);
      }
      const key=theme+'/'+w+'/'+h;if(mode==='quality')geometry[key]=p;else assert.deepEqual(p,geometry[key],'mode switch must not change geometry: '+JSON.stringify({key,actual:p,expected:geometry[key]}));
      if(w===1440&&theme==='dark'&&mode==='quality')await capture('desktop-quality');
      if(w===360&&h===800&&theme==='dark')await capture('phone-'+mode);
    }
    await size(360,800);await click('Conversation settings');
    assert(await run("(()=>{const m=document.querySelector('.rcchat-modal'),r=m.getBoundingClientRect();return m.scrollWidth<=m.clientWidth+1&&r.left>=0&&r.right<=innerWidth})()"),'settings fits');
    assert.equal(await run("getComputedStyle(document.querySelector('.rcchat-modalback')).backdropFilter"),mode==='performance'?'none':'blur(6px)');
    if(mode==='performance')assert(await run("[...document.querySelectorAll('#rcv-chat-root *')].every(e=>['','::before','::after'].every(p=>{const s=getComputedStyle(e,p||null);return s.animationName==='none'&&s.backdropFilter==='none'&&s.transitionDuration.split(',').every(t=>parseFloat(t)===0)}))"),'Performance stops all decorative effects, including pseudo-elements');
    await run("(()=>{const select=document.querySelector('#rcchat-reading-mode');select.value='novel';select.dispatchEvent(new Event('change',{bubbles:true}))})()");await click('Done');
    assert(await run("getComputedStyle(document.querySelector('.rcchat-novel .rcchat-message')).backgroundColor===getComputedStyle(document.querySelector('.rcchat-head')).backgroundColor"),'novel text has an opaque theme surface over cover art');
    await checkProse(theme+' novel');
    if(theme==='light'&&mode==='quality'){await size(1440,900);await capture('light-novel');}
    await click('Conversation settings');await run("(()=>{const select=document.querySelector('#rcchat-reading-mode');select.value='bubbles';select.dispatchEvent(new Event('change',{bubbles:true}))})()");await click('Done');await wait(150);
    await click('Close chat');
    // Real shared CSS on the Android-shaped navigation (no native vault touched).
    await run("document.querySelector('.rcv').classList.add('phone')");await size(360,800);
    if(mode==='performance')assert.equal(await run("getComputedStyle(document.querySelector('.rcv .sidebar')).backdropFilter"),'none','Performance mobile bar has no blur');
    console.log('PASS visual surfaces/layout '+theme+' '+mode);
  }
  await click('Chat');
  // Open conversations must recolour immediately, without remounting the transcript.
  await run("document.querySelector('.rcv').style.setProperty('--brass','#83d5b8')");
  await until("getComputedStyle(document.querySelector('.rcchat-dialogue')).color==='rgb(131, 213, 184)'");
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await run("document.querySelector('.rcv').classList.remove('perf')");await wait(600);
  assert(await run("[...document.querySelectorAll('#rcv-chat-root *')].every(e=>['','::before','::after'].every(p=>getComputedStyle(e,p||null).animationName==='none'))"),'reduced motion includes pseudo-elements');
  console.log('PASS reduced motion; 32 responsive theme/mode layouts');clearTimeout(timeout);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(timeout);app.exit(1);});
