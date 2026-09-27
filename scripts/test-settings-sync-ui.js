/* 1.333 Settings navigation and the rebuilt device sync panel, in the real
   renderer. Settings was a single page about 3,000px tall with device sync
   buried in the middle of Backup; errors arrived wrapped in Electron's IPC
   prefix and Leave this group had no confirmation. */
const {app,BrowserWindow}=require("electron"),assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const root=path.join(__dirname,".."),tmp=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-settings-sync-"));app.setPath("userData",tmp);app.commandLine.appendSwitch("force-device-scale-factor","1");
const preload=path.join(tmp,"fixture.js");fs.writeFileSync(preload,"window.vaultSync={call:async()=>({enabled:false,canShowJoinRequest:true})};");
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=s=>win.webContents.executeJavaScript(s);
async function until(s,label){for(let n=0;n<200;n++){if(await run(s))return;await wait(50);}throw Error("Timeout: "+(label||s));}
const timeout=setTimeout(()=>app.exit(2),90000);
const openSettings="[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&b.textContent.trim()==='Settings').click()";
const closeSettings="[...document.querySelectorAll('.settings-modal button')].find(b=>b.textContent==='Close').click()";
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:true,width:1280,height:860,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.setContentSize(1280,860);win.focus();
  await win.loadFile(path.join(root,"web/index.html"));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')","ready");
  for(const width of [360,800,1280]){
    win.setContentSize(width,860);await wait(150);
    await run(openSettings);await until("!!document.querySelector('.settings-nav')","nav");
    const chips=await run("[...document.querySelectorAll('.settings-nav-item')].map(b=>b.textContent)");
    for(const name of ["Appearance","Security","Sync","Backup","Help"])assert(chips.includes(name),"missing chip "+name+" in "+chips);
    await run("[...document.querySelectorAll('.settings-nav-item')].find(b=>b.textContent==='Backup').click()");
    await until(`(()=>{const m=document.querySelector('.settings-modal'),head=m.querySelector('.settings-top').getBoundingClientRect(),t=m.querySelector('[data-settings-section=backup]').getBoundingClientRect(),mr=m.getBoundingClientRect();return t.top>=head.bottom-1&&(t.top-head.bottom<60||(m.scrollTop+m.clientHeight>=m.scrollHeight-4&&t.top<mr.bottom-40));})()`,"Backup scroll settles at "+width+"px");
    const placed=await run(`(()=>{const m=document.querySelector('.settings-modal'),head=m.querySelector('.settings-top').getBoundingClientRect(),t=m.querySelector('[data-settings-section=backup]').getBoundingClientRect(),close=[...m.querySelectorAll('button')].find(b=>b.textContent==='Close').getBoundingClientRect(),mr=m.getBoundingClientRect();
      return {below:t.top>=head.bottom-1,near:t.top-head.bottom<60,atEnd:m.scrollTop+m.clientHeight>=m.scrollHeight-4,visible:t.top<mr.bottom-40,headTop:Math.abs(head.top-mr.top)<2,close:close.top>=mr.top&&close.bottom<=head.bottom,active:m.querySelector('.settings-nav-item.active').textContent,overflow:m.scrollWidth-m.clientWidth,navOverflow:(()=>{const n=m.querySelector('.settings-nav'),r=n.getBoundingClientRect();return r.right>mr.right+1||r.left<mr.left-1})()};})()`);
    assert(placed.below&&(placed.near||(placed.atEnd&&placed.visible))&&placed.headTop&&placed.close&&placed.active==="Backup"&&placed.overflow<=1&&!placed.navOverflow,width+"px "+JSON.stringify(placed));
    await run(closeSettings);await wait(150);
    await run("window.__rcvSettingsSection='sync';"+openSettings);await wait(600);
    const sync=await run(`(()=>{const m=document.querySelector('.settings-modal'),head=m.querySelector('.settings-top').getBoundingClientRect(),t=m.querySelector('[data-settings-section=sync]').getBoundingClientRect();return {visible:t.top>=head.bottom-1&&t.top<innerHeight-100,active:m.querySelector('.settings-nav-item.active').textContent,panelInSync:!!m.querySelector('[data-settings-section=sync]~.vault-sync-panel'),notInBackup:!(()=>{const b=m.querySelector('[data-settings-section=backup]'),p=m.querySelector('.vault-sync-panel');return b.compareDocumentPosition(p)&Node.DOCUMENT_POSITION_FOLLOWING})()};})()`);
    assert(sync.visible&&sync.active==="Sync"&&sync.panelInSync&&sync.notInBackup,width+"px "+JSON.stringify(sync));
    await run(closeSettings);await wait(150);
    console.log("PASS "+width+"px: sticky section chips jump to and track sections, and the sync pill can open Settings at Sync");
  }
  // Panel states, mounted in place of the live panel inside the real Settings modal.
  win.setContentSize(360,860);await wait(100);await run(openSettings);await until("!!document.querySelector('.vault-sync-panel')");
  await run(`(()=>{const p=document.querySelector('.vault-sync-panel'),el=document.createElement('div');el.id='fx';p.replaceWith(el);window.__root=ReactDOM.createRoot(el);
    window.__calls=[];window.__engine={supported:true,retry(){__calls.push('retry')},invite:async()=>__calls.push('invite'),configure:async a=>__calls.push('configure:'+a),approve:id=>__calls.push('approve:'+id),setManualRefresh:async v=>__calls.push('manual:'+v)};
    window.__show=status=>__root.render(React.createElement(RolecraftSyncPanel,{engine:__engine,status,renderQr:()=>React.createElement('div',{className:'qr-fixture'},'QR')}));})()`);
  const now=Date.now();
  await run(`__show(${JSON.stringify({phase:"error",message:"Error invoking remote method 'vault-sync': Error: The clocks on these devices differ by about 11 minutes. Turn on automatic date and time on both devices.",lastSynced:now-120000,settings:{enabled:true,device:"d1",label:"Desk PC"},peers:[{id:"p1",label:"Pixel phone",online:true,reachWarning:"Pixel phone cannot connect back to this device."},{id:"t1",label:"Tablet",online:false,error:"Peer is offline or on another network. Changes remain on this device.",retryAt:now+20000}]})})`);await wait(100);
  const view=await run(`(()=>{const p=document.querySelector('#fx .vault-sync-panel');return {text:p.textContent,tone:p.querySelector('.sync-status').className,dots:[...p.querySelectorAll('.sync-device .sync-dot')].map(d=>d.className)};})()`);
  assert(!view.text.includes("Error invoking remote method")&&view.text.includes("The clocks on these devices differ"),"IPC prefix is removed");
  assert(view.tone.includes("sync-tone-bad")&&view.text.includes("Sync needs attention"),view.tone);
  assert(view.text.includes("Last synced 2 minutes ago"),"last successful sync is shown");
  assert(/Tablet: Peer is offline.*Trying again in (19|20)s/.test(view.text),"offline peer shows its retry countdown");
  assert(view.text.includes("Pixel phone: Connected one way")&&view.dots[1].includes("warn"),"one-way connection is flagged per device");
  await run("[...document.querySelectorAll('#fx button')].find(b=>b.textContent==='Sync now').click()");await wait(50);
  assert(await run("__calls.includes('retry')&&[...document.querySelectorAll('#fx button')].some(b=>b.textContent==='Checking…'&&b.disabled)"),"Sync now shows it is working");
  await run("[...document.querySelectorAll('#fx button')].find(b=>b.textContent==='Leave this group…').click()");await wait(50);
  assert(await run("!__calls.includes('configure:leave')&&!!document.querySelector('#fx [aria-label=\"Confirm leaving the group\"]')"),"leaving needs a confirmation");
  await run("[...document.querySelectorAll('#fx [aria-label=\"Confirm leaving the group\"] button')].find(b=>b.textContent==='Leave group').click()");await until("__calls.includes('configure:leave')","leave");
  console.log("PASS status is plain language with tone, last sync, per-device retry and one-way warnings; Sync now responds; leaving is confirmed");
  const expired="RCVSYNC1."+Buffer.from(JSON.stringify({expires:now-1000})).toString("base64url"),fresh="RCVSYNC1."+Buffer.from(JSON.stringify({expires:now+300000})).toString("base64url");
  await run(`__show(${JSON.stringify({phase:"waiting",message:"Waiting",code:fresh,settings:{enabled:true,device:"d1"},peers:[]})})`);await wait(100);
  assert(await run("!!document.querySelector('#fx .qr-fixture')&&/Expires in [45]:\\d\\d/.test(document.querySelector('#fx').textContent)"),"a live QR shows its countdown");
  await run(`__show(${JSON.stringify({phase:"waiting",message:"Waiting",code:expired,settings:{enabled:true,device:"d1"},peers:[]})})`);await wait(100);
  assert(await run("!document.querySelector('#fx .qr-fixture')&&document.querySelector('#fx').textContent.includes('This pairing QR has expired')"),"an expired QR is not shown as usable");
  console.log("PASS pairing QR counts down and is withdrawn when it expires");
  for(const width of [360,800,1280]){
    win.setContentSize(width,860);await wait(120);await run("document.querySelectorAll('#fx details').forEach(d=>d.open=true)");await wait(60);
    const fit=await run(`(()=>{const p=document.querySelector('#fx .vault-sync-panel'),m=p.closest('.modal'),mr=m.getBoundingClientRect();return {overflow:p.scrollWidth>p.clientWidth+1,bad:[...p.querySelectorAll('button,input,summary,select,textarea')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect()).filter(r=>r.left<mr.left-1||r.right>mr.right+1).length};})()`);
    assert(!fit.overflow&&!fit.bad,width+"px "+JSON.stringify(fit));
  }
  console.log("PASS the rebuilt panel, troubleshooting and Advanced controls fit at 360, 800 and 1280px");
  clearTimeout(timeout);app.exit(0);
}).catch(e=>{console.error(e.stack||e);clearTimeout(timeout);app.exit(1);});
