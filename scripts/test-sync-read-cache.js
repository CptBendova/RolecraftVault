/* Actual IndexedDB/WebCrypto storage: cache identity, encryption and CAS remain real. */
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const root=path.join(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-sync-read-cache-'));app.setPath('userData',path.join(temp,'profile'));
const html=path.join(temp,'blank.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><title>Disposable storage performance test</title>');
const source=fs.readFileSync(path.join(root,'web/js/rolecraft-web-platform.js'),'utf8');
setTimeout(()=>app.exit(2),60000);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:false}});await win.loadFile(html);
 const probe=`window.__cacheProbe={reads:0,scans:0,bytes:()=>syncReadBytes,size:()=>syncReads.size,read:idbGet,limit:n=>{clearSyncReads();SYNC_READ_LIMIT=n;},gate:fn=>{var real=prepareReplacementValue;prepareReplacementValue=function(){var args=arguments;prepareReplacementValue=real;return real.apply(null,args).then(async item=>{await fn();return item;});};}};
 var realPlain=plainFromStored;plainFromStored=function(){window.__cacheProbe.reads++;return realPlain.apply(null,arguments);};
 var realKeys=dataKeys;dataKeys=function(){window.__cacheProbe.scans++;return realKeys.apply(null,arguments);};
 window.vaultPlatform = "web";`;
 assert(source.includes('  window.vaultPlatform = "web";'));
 await win.webContents.executeJavaScript(source.replace('  window.vaultPlatform = "web";',probe));
 const results=await win.webContents.executeJavaScript(`(async()=>{
 const s=storage,t=window.__cacheProbe,result=[],password='Disposable-test-password';
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 async function rejects(fn,message){let caught=false;try{await fn();}catch(_){caught=true;}check(caught,message);}
 await auth.setPassword(password);const large='private saved story '.repeat(15000);
 await s.set('chars:all',large);await s.set('sync:state','checkpoint');
 check((await t.read('v:chars:all')).startsWith('pwd:'),'real encrypted payload');
 await s.get('chars:all');await s.get('sync:state');let before=t.reads,scans=t.scans;
 await s.get('chars:all');await s.get('sync:state');
 await s.syncCommit({'sync:state':'checkpoint 2'},{'chars:all':large,'sync:state':'checkpoint'});
 check(t.reads===before,'same-pointer reads and CAS avoid repeated decryption');check(t.scans===scans,'exact sync checkpoint never scans all photo keys');
 result.push('same encrypted pointers reuse exact plaintext; checkpoint performs zero repeat decryptions and zero full-store scans');
 await s.set('chars:all',large+' new');before=t.reads;check((await s.get('chars:all')).value===large+' new'&&t.reads>before,'changed pointer invalidates cached read');
 await rejects(()=>s.syncCommit({'chars:all':'bad'},{'chars:all':large}),'stale expected string cannot use memo');
 t.gate(()=>s.set('chars:all','concurrent edit'));
 await rejects(()=>s.syncCommit({'chars:all':'remote','sync:state':'wrong'},{'chars:all':large+' new','sync:state':'checkpoint 2'}),'pointer race aborts entire CAS');
 check((await s.get('chars:all')).value==='concurrent edit'&&(await s.get('sync:state')).value==='checkpoint 2','racing edit retained and state not partly committed');
 result.push('changed pointers, stale expected strings and edits during staging still reject atomically');
 await auth.lock();check(t.size()===0&&t.bytes()===0,'lock clears every plaintext memo');await rejects(()=>s.get('chars:all'),'locked read');await auth.unlockPassword(password);
 await s.get('chars:all');t.gate(async()=>{await auth.lock();await auth.unlockPassword(password);});
 await rejects(()=>s.syncCommit({'chars:all':'unsafe'},{'chars:all':'concurrent edit'}),'lock/unlock epoch interrupts checkpoint');check((await s.get('chars:all')).value==='concurrent edit','late checkpoint cannot land after unlock');
 result.push('lock clears memo and lock/unlock during a save cancels its old epoch');
 t.limit(512);await s.set('lore:all','a'.repeat(75));await s.set('prompts:all','b'.repeat(75));await s.get('lore:all');await s.get('prompts:all');check(t.bytes()<=512,'strict memory limit');
 await s.set('chars:all',large);before=t.reads;await s.get('chars:all');await s.get('chars:all');check(t.reads===before+2,'oversize values are not retained');await s.set('img:uncached','picture');before=t.reads;await s.get('img:uncached');await s.get('img:uncached');check(t.reads===before+2,'photos never enter plaintext memo');
 result.push('memo is byte-bounded and never caches photos or oversized records');return result;
 })()`);
 results.forEach(x=>console.log('PASS '+x));app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
