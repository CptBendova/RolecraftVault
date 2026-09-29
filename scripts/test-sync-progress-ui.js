const {app,BrowserWindow}=require('electron'),fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'rcv-sync-progress-')));
const wait=ms=>new Promise(r=>setTimeout(r,ms));setTimeout(()=>app.exit(2),90000);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{contextIsolation:false}});await win.loadFile(path.join(root,'web/index.html'));await wait(1000);
 await win.webContents.executeJavaScript(`(()=>{document.querySelector('#rolecraft-root').style.display='none';window.RolecraftVaultSync.create=()=>({supported:true,start(){},stop(){},retry(){window.__retried=(window.__retried||0)+1;},subscribe(fn){window.__syncStatus=fn;fn({phase:'preparing',message:'Checking saved pictures',settings:{enabled:true},done:20,total:100});return()=>{};}});const el=document.createElement('div');document.body.append(el);RolecraftVaultMount(el)})()`);await wait(800);
 for(const width of [360,800,1280]){win.setSize(width,800);await wait(100);const result=await win.webContents.executeJavaScript(`(()=>{const p=document.querySelector('.sync-progress'),r=p.getBoundingClientRect(),b=p.querySelector('button').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,height:r.height,buttonWidth:b.width,touch:b.height,overflow:p.scrollWidth>p.clientWidth,modal:!!p.closest('.modal-back'),spin:!!p.querySelector('.spin'),bar:!!p.querySelector('progress')}})()`);assert(result.left>=0&&result.right<=result.width&&result.height<=52&&result.buttonWidth<=210&&result.touch>=44&&!result.overflow&&!result.modal&&result.spin&&!result.bar,JSON.stringify(result));}
 // 1.338: an on-demand device keeps a single Sync now control in place.
 await win.webContents.executeJavaScript(`__syncStatus({phase:'manual',manualRefresh:true,message:'Manual refresh is on.',settings:{enabled:true}})`);await wait(150);
 for(const width of [360,1280]){win.setSize(width,800);await wait(100);const manual=await win.webContents.executeJavaScript(`(()=>{const p=document.querySelector('.sync-progress-manual');if(!p)return null;const r=p.getBoundingClientRect(),b=p.querySelector('button').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,touch:b.height,text:p.textContent,spin:!!p.querySelector('.spin')}})()`);assert(manual&&manual.left>=0&&manual.right<=manual.width&&manual.touch>=44&&manual.text==='Sync now'&&!manual.spin,JSON.stringify(manual));}
 await win.webContents.executeJavaScript(`document.querySelector('.sync-progress-manual button').click()`);await wait(100);
 assert.equal(await win.webContents.executeJavaScript('window.__retried'),1,'Sync now asks the engine for one requested pass');
 await win.webContents.executeJavaScript(`__syncStatus({phase:'applying',chatOnly:true,reloadOnly:false,manualRefresh:true,settings:{enabled:true}})`);await wait(100);
 assert(await win.webContents.executeJavaScript(`!document.querySelector('.sync-saving')`),'chat-only changes never cover the library');
 await win.webContents.executeJavaScript(`__syncStatus({phase:'applying',chatOnly:false,reloadOnly:true,manualRefresh:true,settings:{enabled:true}})`);await wait(100);
 assert(await win.webContents.executeJavaScript(`!document.querySelector('.sync-saving')`),'redrawing already-saved records never covers the library');
 await win.webContents.executeJavaScript(`__syncStatus({phase:'applying',chatOnly:false,reloadOnly:false,manualRefresh:true,settings:{enabled:true}})`);await wait(100);
 assert(await win.webContents.executeJavaScript(`!!document.querySelector('.sync-saving')`),'writing library records still protects the screen');
 // 1.340: the overlay can never freeze the app. With no new status for 20 s it
 // becomes a small non-blocking banner, and any new status clears it.
 await wait(21000);
 assert(await win.webContents.executeJavaScript(`!document.querySelector('.sync-saving')&&!!document.querySelector('.sync-saving-banner')&&!document.querySelector('.modal-back')`),'a long-running save no longer blocks the app');
 await win.webContents.executeJavaScript(`__syncStatus({phase:'manual',manualRefresh:true,settings:{enabled:true}})`);await wait(100);
 assert(await win.webContents.executeJavaScript(`!document.querySelector('.sync-saving-banner')`),'the banner clears when sync moves on');
 await win.webContents.executeJavaScript(`__syncStatus({phase:'preparing',message:'Checking saved pictures',settings:{enabled:true},done:20,total:100})`);await wait(150);
 console.log('PASS on-demand Sync now pill fits phone and desktop; the saving overlay covers only library writes');
 await win.webContents.executeJavaScript(`document.querySelector('.sync-progress button').click()`);await wait(200);assert(await win.webContents.executeJavaScript(`!!document.querySelector('.modal-back')`),'Settings remains interactive during preparation');
 await win.webContents.executeJavaScript(`__syncStatus({phase:'synced',settings:{enabled:true}})`);await wait(100);assert(await win.webContents.executeJavaScript(`!document.querySelector('.sync-progress')`));
 console.log('PASS compact spinner fits one short row on phone/tablet/desktop with a touch-sized details button; completed status clears');app.exit(0);
}).catch(e=>{console.error(e);app.exit(1)});
