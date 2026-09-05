/* Real IndexedDB transactions and shipped storage functions, disposable profile. */
const {app,BrowserWindow}=require("electron");
const fs=require("fs"),path=require("path"),os=require("os"),assert=require("assert");
const root=path.join(__dirname,".."),tmp=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-storage-"));app.setPath("userData",tmp);
const source=fs.readFileSync(path.join(root,"web/js/rolecraft-web-platform.js"),"utf8");
setTimeout(()=>app.exit(2),60000);
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:false}});
  await win.loadFile(path.join(root,"web/index.html"));
  // Expose test gates from the real closure, without replacing any implementation.
  const patched=source.replace('  window.vaultPlatform = "web";',`window.__syncTest={commit:commitStorageReplacement,read:idbGet,locked:function(){securityCache={};masterKey=null;},gate:function(fn){var real=prepareReplacementValue;prepareReplacementValue=function(k,v){return real(k,v).then(async function(item){await fn(k);return item;});};}}; window.vaultPlatform = "web";`);
  await win.webContents.executeJavaScript(patched);
  const result=await win.webContents.executeJavaScript(`(async()=>{
    const s=window.storage,t=window.__syncTest,ok=[];
    await s.set("lore:all","old");
    await s.syncCommit({"lore:all":"new"},{"lore:all":"old"});
    if((await s.get("lore:all")).value!=="new")throw Error("Commit missing");ok.push("atomic replacement");
    await s.syncImage("img:test","original");
    try{await s.syncImage("img:test","different");throw Error("accepted overwrite");}catch(e){if(e.message==="accepted overwrite")throw e;}
    if((await s.get("img:test")).value!=="original")throw Error("Picture overwritten");ok.push("picture collision refuses overwrite");
    t.gate(async function(k){if(k==="lore:all")await s.set(k,"edit while staging");});
    try{await s.syncCommit({"lore:all":"remote","sync:state":"new state"},{"lore:all":"new","sync:state":null});throw Error("accepted stale write");}catch(e){if(e.message==="accepted stale write")throw e;}
    if((await s.get("lore:all")).value!=="edit while staging"||await t.read("v:sync:state")!=null)throw Error("Race partially committed");ok.push("concurrent edit aborts the entire transaction");
    const pointer=await t.read("v:lore:all");t.locked();
    try{await t.commit([{key:"lore:all",stored:"raw:unsafe",hash:"unsafe"}],[],{"lore:all":pointer});throw Error("accepted locked write");}catch(e){if(e.message==="accepted locked write")throw e;}
    if(await t.read("v:lore:all")!==pointer)throw Error("Locked write landed");ok.push("lock at commit fails closed");return ok;
  })()`);
  assert.equal(result.length,4);result.forEach(s=>console.log("PASS "+s));app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
