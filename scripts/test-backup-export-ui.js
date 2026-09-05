/* Real Settings/export UI at phone and desktop sizes; no personal vault. */
const {app, BrowserWindow} = require("electron");
const fs=require("fs"), path=require("path"), os=require("os"), assert=require("assert");
const root=path.join(__dirname,".."), tmp=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-backup-ui-"));
app.setPath("userData",tmp);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
setTimeout(()=>app.exit(2),90000);
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{contextIsolation:false}});
  await win.loadFile(path.join(root,"web","index.html")); await sleep(1500);
  await win.webContents.executeJavaScript(`(async()=>{
    await window.storage.set("lore:all",JSON.stringify([{id:"lore",name:"Backup fixture",world:"Test",content:"Keep me",images:[]}]));
    await window.storage.set("trash:all",JSON.stringify([{tid:"bin",type:"lore",deletedAt:Date.now(),record:{id:"old",name:"Bin fixture",images:[]}}]));
  })()`);
  win.reload(); await sleep(1700);
  await win.webContents.executeJavaScript(`(()=>{
    window.__backupChunks=[]; window.__backupDenied=false;
    window.Capacitor={nativePromise:async(plugin,method,opts)=>{
      if(plugin!=="FileExport") throw Error("Unexpected bridge: "+plugin);
      if(window.__backupDenied) throw Error("Downloads is unavailable");
      if(method==="begin") {await new Promise(resolve=>window.__finishBackupBegin=resolve); return {token:"ui"};}
      if(method==="append") window.__backupChunks.push(opts.data);
      return {};
    }};
    [...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Settings").click();
  })()`); await sleep(500);
  await win.webContents.executeJavaScript(`(()=>{
    [...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Export backup").click();
  })()`); await sleep(200);
  await win.webContents.executeJavaScript(`[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Export anyway").click()`);
  await sleep(3000);
  let result=await win.webContents.executeJavaScript(`(()=>{
    const dialog=document.querySelector('[aria-label="Backup export"]');
    const status=dialog.querySelector('[data-backup-status]');
    const rect=dialog.getBoundingClientRect();
    return {phase:status.dataset.backupStatus,text:status.textContent,inside:rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight,overflow:dialog.scrollWidth>dialog.clientWidth};
  })()`);
  assert.equal(result.phase,"working"); assert(/Opening backup destination/.test(result.text));
  assert(result.inside&&!result.overflow,"360px progress dialog must fit: "+JSON.stringify(result));
  console.log("PASS phone progress survives the old toast timeout and fits at 360px");
  await win.webContents.executeJavaScript("window.__finishBackupBegin()"); await sleep(500);
  const success=await win.webContents.executeJavaScript(`(()=>{
    const status=document.querySelector('[aria-label="Backup export"] [data-backup-status]');
    return {phase:status.dataset.backupStatus,text:status.textContent,data:JSON.parse(window.__backupChunks.join(""))};
  })()`);
  assert.equal(success.phase,"success"); assert(/Downloads/.test(success.text)); assert(/rolecraft-backup-/.test(success.text));
  assert.equal(success.data.lore[0].content,"Keep me"); assert.equal(success.data.trash.length,1);
  win.focus(); if(process.env.RCV_BACKUP_SCREENSHOT) fs.writeFileSync(process.env.RCV_BACKUP_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Backup export"] button').click()`); await sleep(200);
  assert(await win.webContents.executeJavaScript(`!!document.querySelector('[data-backup-status="success"]')`),"Settings retains the completed result");
  console.log("PASS completed backup keeps filename/location in Settings and contains live and bin records");
  win.setSize(1280,900); await sleep(250);
  await win.webContents.executeJavaScript(`(()=>{window.__backupDenied=true; [...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Export backup").click();})()`); await sleep(150);
  await win.webContents.executeJavaScript(`[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Export anyway").click()`); await sleep(3000);
  result=await win.webContents.executeJavaScript(`(()=>{const d=document.querySelector('[aria-label="Backup export"]'); const s=d.querySelector('[data-backup-status]');const r=d.getBoundingClientRect();return {phase:s.dataset.backupStatus,text:s.textContent,inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight};})()`);
  assert.equal(result.phase,"error"); assert(/Downloads is unavailable/.test(result.text)); assert(result.inside);
  console.log("PASS desktop error remains visible after three seconds with the original storage failure");
  app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
