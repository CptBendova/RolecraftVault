/* Opt-in native shell check. Never opens an installed/personal vault. */
const {spawn}=require("child_process"),fs=require("fs"),os=require("os"),path=require("path"),http=require("http"),assert=require("assert");
const root=path.join(__dirname,".."),profile=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-native-sync-"));
const child=spawn(require("electron"),[path.join(root,"app"),"--user-data-dir="+profile,"--remote-debugging-address=127.0.0.1","--remote-debugging-port=0","--disable-gpu"],{stdio:["ignore","pipe","pipe"],windowsHide:true});
let socket,counter=0;const pending=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms));
function json(url){return new Promise((resolve,reject)=>{http.get(url,res=>{let text="";res.on("data",v=>text+=v);res.on("end",()=>{try{resolve(JSON.parse(text));}catch(e){reject(e);}});}).on("error",reject);});}
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++counter,timer=setTimeout(()=>{pending.delete(id);reject(Error("Shell probe timed out"));},15000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+": "+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description));return r.result.value;}
const timeout=setTimeout(()=>{child.kill();process.exitCode=1;},70000);
(async()=>{
  let port,target;
  for(let i=0;i<100;i++){const f=path.join(profile,"DevToolsActivePort");if(fs.existsSync(f)){port=Number(fs.readFileSync(f,"utf8").split("\n")[0]);break;}await wait(100);}
  if(!port)throw Error("Disposable shell did not start");
  for(let i=0;i<60;i++){target=(await json("http://127.0.0.1:"+port+"/json/list")).find(p=>p.type==="page"&&p.url.includes("index.html"));if(target)break;await wait(100);}
  assert(target);socket=new WebSocket(target.webSocketDebuggerUrl);socket.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  for(let i=0;i<80;i++){if(await evaluate("Boolean(document.querySelector('.rcv[data-rcv-state=\"ready\"]'))"))break;await wait(100);}
  assert(await evaluate("Boolean(window.vaultSync&&window.storage.syncCommit&&document.querySelector('.rcv[data-rcv-state=\"ready\"]'))"));
  await evaluate(`window.storage.set('lore:all','[]')`);
  await evaluate(`window.storage.syncImage('img:fixture','data:image/png;base64,AA==')`);
  await evaluate(`window.storage.syncCommit({'lore:all':'[{"id":"fixture","title":"Native sync"}]'},{'lore:all':'[]'})`);
  assert(await evaluate(`window.storage.syncCommit({'lore:all':'[]'},{'lore:all':'[]'}).then(()=>false,()=>true)`));
  assert(await evaluate(`window.storage.get('img:fixture').then(r=>r.value==='data:image/png;base64,AA==')`));
  const namespace=await evaluate(`window.RolecraftSyncNamespace||'library1'`);
  assert(await evaluate(`window.vaultSync.call('configure',{action:'create',namespace:${JSON.stringify(namespace)},label:'Disposable test'}).then(r=>r.enabled)`));
  assert(await evaluate(`window.vaultSync.call('invite').then(r=>r.code.startsWith('RCVSYNC1.'))`));
  await evaluate(`window.vaultSync.call('pause')`);assert(await evaluate(`window.vaultSync.call('status').then(r=>r.enabled)`));
  assert(await evaluate(`window.auth.setPassword('Disposable sync test only').then(r=>r.ok)`));await evaluate(`window.auth.lock()`);
  assert(await evaluate(`window.storage.syncCommit({'lore:all':'[]'},{}).then(()=>false,()=>true)`));
  assert(await evaluate(`window.vaultSync.call('invite').then(()=>false,()=>true)`));
  assert(await evaluate(`window.auth.unlockPassword('Disposable sync test only').then(r=>r.ok)`));await evaluate(`window.vaultSync.call('configure',{action:'leave'})`);
  console.log("PASS real Windows shell: protected pairing, pause/resume, atomic native records, retained pictures and locked IPC refusal");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(timeout);if(socket)socket.close();child.kill();});
