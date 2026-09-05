const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const root=path.join(__dirname,'..');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'rcv-sync-legacy-')));
const source=fs.readFileSync(path.join(root,'web/js/rolecraft-web-platform.js'),'utf8');
setTimeout(()=>app.exit(2),30000);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:false}});await win.loadFile(path.join(root,'web/index.html'));
 await win.webContents.executeJavaScript(source.replace('  window.vaultPlatform = "web";','window.__legacy={put:idbSet,read:idbGet,locked:function(){securityCache={};masterKey=null;}}; window.vaultPlatform = "web";'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
  const t=window.__legacy,s=window.storage;
  await t.put('v:img:old','file:immutable-original');await t.put('v:th:old','file:immutable-preview');
  t.locked();const first=await s.fingerprints(['img:old','th:old','th:absent']);
  const second=await s.fingerprint('img:old');
  await t.put('v:img:old','file:replacement-original');const replaced=await s.fingerprint('img:old');
  return {first,second,replaced,unwritten:await t.read('h:img:old')};
 })()`);
 assert(result.first['img:old']&&result.first['th:old'],'Legacy originals and previews are not missing');
 assert.equal(result.first['th:absent'],null);assert.equal(result.second,result.first['img:old']);assert.notEqual(result.replaced,result.second);
 assert.equal(result.unwritten,null,'Fingerprinting is read-only even while locked');
 console.log('PASS legacy Android pictures have stable metadata fingerprints; replacements invalidate caches; absent previews stay absent; no locked writes');app.exit(0);
}).catch(e=>{console.error(e);app.exit(1)});
