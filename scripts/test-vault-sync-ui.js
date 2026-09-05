/* Real application + real sync panel at phone/tablet/desktop widths. */
const {app,BrowserWindow}=require("electron"),fs=require("fs"),path=require("path"),os=require("os"),assert=require("assert");
const root=path.join(__dirname,".."),tmp=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-ui-"));app.setPath("userData",tmp);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));setTimeout(()=>app.exit(2),60000);
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{contextIsolation:false}});
  await win.loadFile(path.join(root,"web/index.html"));await sleep(1300);
  await win.webContents.executeJavaScript(`(()=>{
    window.vaultSync={call:async()=>({enabled:false})};
    document.querySelector('#rolecraft-root').style.display='none';
    const root=document.createElement('div');document.body.append(root);window.RolecraftVaultMount(root);
  })()`);await sleep(1200);
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length).find(b=>b.textContent.trim()==='Settings').click()`);await sleep(250);
  assert(await win.webContents.executeJavaScript(`!!document.querySelector('.vault-sync-panel')`),"Settings contains the real integration");
  for(const width of [360,800,1280]){
    win.setSize(width,900);await sleep(150);
    const bounds=await win.webContents.executeJavaScript(`(()=>{const p=document.querySelector('.vault-sync-panel');p.scrollIntoView({block:'center'});const r=p.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:p.scrollWidth>p.clientWidth,buttons:[...p.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.width>30;})};})()`);
    assert(bounds.left>=0&&bounds.right<=bounds.width&&!bounds.overflow&&bounds.buttons.every(Boolean),JSON.stringify(bounds));
    console.log("PASS Settings pairing controls fit at "+width+"px without horizontal overflow");
  }
  // Exercise the same component's invitation and merge-preview states.
  await win.webContents.executeJavaScript(`(()=>{
    const container=document.querySelector('.vault-sync-panel').parentElement;container.replaceChildren();
    window.__approved=false;const engine={supported:true,approve:()=>window.__approved=true,invite:async()=>{},configure:async()=>{},retry:()=>{}};
    ReactDOM.createRoot(container).render(React.createElement(window.RolecraftSyncPanel,{engine,status:{settings:{enabled:true,device:'phone',primary:'tablet'},message:'Pairing remembered',phase:'preview',preview:{id:'preview',added:8,changed:3,removed:0,conflicts:2},code:'RCVSYNC1.'+'a'.repeat(400),peers:[{id:'tablet',label:'Primary tablet',online:true}]}}));
  })()`);await sleep(150);win.setSize(360,800);await sleep(150);
  const fit=await win.webContents.executeJavaScript(`(()=>{const p=document.querySelector('.vault-sync-panel');return {overflow:p.scrollWidth>p.clientWidth,code:!!p.querySelector('textarea[aria-label="Pairing code"]'),preview:p.textContent.includes('2 preserved conflict copies')};})()`);
  assert(!fit.overflow&&fit.code&&fit.preview,JSON.stringify(fit));
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Approve merge and start automatic sync').click()`);
  assert(await win.webContents.executeJavaScript('window.__approved'));
  console.log("PASS phone invitation and explicit merge approval are visible and usable");app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
