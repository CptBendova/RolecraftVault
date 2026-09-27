/* Real IndexedDB, encrypted storage and adapter; only the native boundary is a fixture. */
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),os=require('os');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-native-stage-adapter-'));
app.setPath('userData',path.join(tmp,'profile'));fs.writeFileSync(path.join(tmp,'blank.html'),'<!doctype html><title>Disposable adapter</title>');
const timeout=setTimeout(()=>app.exit(2),60000);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:false}});await win.loadFile(path.join(tmp,'blank.html'));
 await win.webContents.executeJavaScript(`
 window.__files=new Map();window.__calls=[];window.__reads=0;window.__stageGate=null;
 window.Capacitor={nativePromise:async(plugin,method,opts)=>{
   if(plugin==='VaultSync'){
     if(method!=='dispatch'||opts.method!=='stageImage')throw Error('Unexpected native action');
     window.__calls.push(opts.args);if(window.__stageGate){const gate=window.__stageGate;window.__stageGate=null;await gate();}
     return {descriptor:{hash:'a'.repeat(64),parts:['b'.repeat(64)],bytes:35000}};
   }
   if(plugin!=='Filesystem')return {};
   const files=window.__files,old=files.get(opts.path);
   if(method==='requestPermissions'||method==='mkdir')return {};
   if(method==='writeFile'||method==='appendFile'){const piece=Uint8Array.from(atob(opts.data),c=>c.charCodeAt(0)),next=new Uint8Array((method==='appendFile'&&old?old.length:0)+piece.length);if(method==='appendFile'&&old)next.set(old);next.set(piece,next.length-piece.length);files.set(opts.path,next);return {};}
   if(method==='deleteFile'){files.delete(opts.path);return {};}
   if(!old)throw Error('Missing fixture');
   if(method==='stat')return {size:old.length};
   if(method==='readFile'){window.__reads++;const part=old.subarray(opts.offset||0,(opts.offset||0)+(opts.length||old.length));let text='';for(let i=0;i<part.length;i+=32768)text+=String.fromCharCode(...part.subarray(i,i+32768));return{data:btoa(text)};}
   throw Error('Unexpected filesystem action');
 }};void 0;`);
 await win.webContents.executeJavaScript(fs.readFileSync(path.join(root,'web/js/rolecraft-web-platform.js'),'utf8'));
 const results=await win.webContents.executeJavaScript(`(async()=>{
 const check=(ok,m)=>{if(!ok)throw Error(m);},rejects=async fn=>{let error=false;try{await fn();}catch(_){error=true;}check(error,'Expected fail-closed rejection');};
 const s=storage,value='data:image/png;base64,'+btoa('x'.repeat(32768));await auth.setPassword('Disposable-password');await s.syncImage('img:photo',value);
 const mark=await s.fingerprint('img:photo'),reads=window.__reads,descriptor=await s.stageSyncImage('img:photo',mark);
 check(descriptor.hash==='a'.repeat(64),'Native descriptor returned');check(window.__reads===reads,'No native image reads through WebView');
 const args=window.__calls[0];check(args.pointer.startsWith('bin2:')&&args.key==='img:photo','Exact immutable picture pointer');check(atob(args.wrapKey).length===32&&atob(args.masterKey).length===32,'Only transient derived key material');check(JSON.stringify(args).length<2048,'No whole picture in bridge arguments');
 check(await s.stageSyncImage('lore:all',null)===null,'Nonpicture key never sent to native');
 await s.set('img:small','data:image/png;base64,AA==');check(await s.stageSyncImage('img:small',await s.fingerprint('img:small'))===null,'Legacy tiny value falls back');
 await s.setBinary('img:unicode',new Uint8Array(20000),'data:image/png;name=é;base64,');check(await s.stageSyncImage('img:unicode',await s.fingerprint('img:unicode'))===null,'NonASCII prefix uses exact legacy path');
 window.__stageGate=()=>s.set('img:photo',value+'A');await rejects(()=>s.stageSyncImage('img:photo',mark));check((await s.get('img:photo')).value===value+'A','Concurrent edit retained');
 const nextMark=await s.fingerprint('img:photo');window.__stageGate=()=>auth.lock();await rejects(()=>s.stageSyncImage('img:photo',nextMark));
 const before=window.__calls.length;await rejects(()=>s.stageSyncImage('img:photo',nextMark));check(window.__calls.length===before,'Locked adapter sends no key');
 return ['One bounded native call replaces full-photo reads and restaging','Encrypted pointers and current fingerprints guard native result','Legacy fallback, concurrent edit and lock preserve source bytes'];
 })()`);
 results.forEach(s=>console.log('PASS '+s));clearTimeout(timeout);app.exit(0);
}).catch(e=>{console.error(e);clearTimeout(timeout);app.exit(1);});
