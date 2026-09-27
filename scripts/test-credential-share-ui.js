const {app,BrowserWindow}=require("electron"),fs=require("fs"),path=require("path"),os=require("os"),assert=require("assert");
const root=path.join(__dirname,".."),tmp=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-key-ui-"));app.setPath("userData",tmp);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));setTimeout(()=>app.exit(2),60000);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:true,width:360,height:900,webPreferences:{contextIsolation:false}});
 await win.loadFile(path.join(root,"web/index.html"));await sleep(1200);
 await win.webContents.executeJavaScript(`(()=>{
  document.body.replaceChildren();const wrapper=document.createElement('div');wrapper.className='rcv';wrapper.style.padding='8px';document.body.append(wrapper);
  window.__calls=[];window.__saved=['openrouter'];window.__offer=null;
  window.vaultSync={call:async(method,args)=>{__calls.push({method,args});if(method==='keyStatus')return{configured:__saved,offer:__offer};if(method==='discover')return{peers:[{id:'fixture-peer'}]};if(method==='keyInfo')return{label:'Fixture tablet',offer:{id:'a'.repeat(32),provider:'openai',expires:Date.now()+300000}};if(method==='keyShare'){__offer={id:'b'.repeat(32),provider:args.provider,expires:Date.now()+300000};return{offer:__offer};}if(method==='keyImport'){__saved.push(args.provider);return{ok:true};}if(method==='keyStop')__offer=null;return{};}};
  window.__mount=ReactDOM.createRoot(wrapper);window.__render=()=>__mount.render(React.createElement(RolecraftSyncPanel,{engine:{supported:true},status:{settings:{enabled:true},peers:[]}}));__render();
 })()`);await sleep(100);
 const click=async text=>{await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Missing enabled button');b.click();})()`);await sleep(150);};
 await click("Share API keys between devices");
 assert(await win.webContents.executeJavaScript(`document.querySelector('.credential-share').textContent.includes('provider account or credits')`));
 await click("Share for 5 minutes");assert(await win.webContents.executeJavaScript(`__offer.provider==='openrouter'`));
 await click("Import on this device");assert(await win.webContents.executeJavaScript(`__saved.includes('openai')&&document.querySelector('.credential-share').textContent.includes('saved securely')`));
 assert(await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Key already saved'&&b.disabled)`));
 for(const width of [360,800,1280]){win.setSize(width,900);await sleep(100);const bounds=await win.webContents.executeJavaScript(`(()=>{const p=document.querySelector('.credential-share');p.scrollIntoView();return{overflow:p.scrollWidth>p.clientWidth,bad:[...p.querySelectorAll('button,select')].some(b=>{const r=b.getBoundingClientRect();return r.left<0||r.right>innerWidth;})};})()`);assert(!bounds.overflow&&!bounds.bad,JSON.stringify(bounds));console.log("PASS credential share controls fit at "+width+"px");}
 await win.webContents.executeJavaScript(`window.dispatchEvent(new Event('rcv-locking'))`);await sleep(100);
 assert(await win.webContents.executeJavaScript(`__offer===null&&!document.querySelector('[aria-label="API key provider"]')`));
 await win.webContents.executeJavaScript(`delete window.vaultSync;delete window.Capacitor;window.RolecraftChatSync=null;__render()`);await sleep(100);
 assert(await win.webContents.executeJavaScript(`!!document.querySelector('.vault-sync-panel')`),"Missing bridge during cleanup must not unmount the pairing panel");
 assert(await win.webContents.executeJavaScript(`!document.querySelector('.credential-share')`));
 console.log("PASS real UI has disclosure, explicit source sharing/receiver import, no overwrite, lock cancellation, and no standard-edition controls");app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
