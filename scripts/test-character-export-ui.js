const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-character-export-'));
app.setPath('userData',tmp);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
setTimeout(()=>app.exit(2),90000);
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:true,width:1280,height:900,webPreferences:{contextIsolation:false}});
  let downloaded;
  win.webContents.session.on('will-download',(_event,item)=>{
    item.setSavePath(path.join(tmp,'characters.json'));
    downloaded=new Promise(resolve=>item.once('done',(_e,state)=>resolve(state)));
  });
  await win.loadFile(path.join(root,'web/index.html')); await sleep(1500);
  await win.webContents.executeJavaScript(`window.storage.set('chars:all',JSON.stringify([{id:'fixture',name:'Export fixture',sections:[],variants:[],gallery:[]}]))`);
  win.reload(); await sleep(1500);
  async function start(){
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Characters').click()`); await sleep(200);
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>/Import.*Export/i.test(b.textContent)).click()`); await sleep(150);
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Export JSON')).click()`); await sleep(150);
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Export anyway').click()`); await sleep(500);
  }
  await start(); assert(downloaded,'Electron must receive the download'); assert.equal(await downloaded,'completed');
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp,'characters.json'),'utf8')).chars[0].name,'Export fixture');
  assert(await win.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Character export"] [data-backup-status="success"]')`));
  console.log('PASS real desktop export completes an actual JSON download');
  await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Character export"] button').click()`);
  win.setSize(360,800);
  await win.webContents.executeJavaScript(`window.Capacitor={nativePromise:async()=>{throw Error('Downloads unavailable')}}; void 0`);
  await start(); await sleep(3000);
  const fit=await win.webContents.executeJavaScript(`(()=>{const d=document.querySelector('[aria-label="Character export"]'),s=d.querySelector('[data-backup-status]'),r=d.getBoundingClientRect();return {phase:s.dataset.backupStatus,text:s.textContent,fit:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&d.scrollWidth<=d.clientWidth}})()`);
  assert.equal(fit.phase,'error'); assert.match(fit.text,/Downloads unavailable/); assert(fit.fit);
  console.log('PASS phone error remains visible and fits at 360px'); app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
