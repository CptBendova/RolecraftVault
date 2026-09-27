// Opt-in local smoke check: launch the real shell with an isolated empty profile.
const {spawn}=require("child_process"),fs=require("fs"),os=require("os"),path=require("path"),http=require("http"),assert=require("assert");
const root=path.join(__dirname,".."),profile=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-private-shell-"));
const child=spawn(require("electron"),[path.join(root,"app"),"--user-data-dir="+profile,"--remote-debugging-address=127.0.0.1","--remote-debugging-port=0","--disable-gpu"],{stdio:["ignore","pipe","pipe"],windowsHide:true});
let socket,counter=0;const pending=new Map();const wait=ms=>new Promise(r=>setTimeout(r,ms));
function json(url){return new Promise((resolve,reject)=>{http.get(url,res=>{let text="";res.on("data",v=>text+=v);res.on("end",()=>{try{resolve(JSON.parse(text));}catch(e){reject(e);}});}).on("error",reject);});}
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++counter,timer=setTimeout(()=>{pending.delete(id);reject(Error("Shell probe timed out"));},15000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+": "+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description));return r.result.value;}
const timeout=setTimeout(()=>{child.kill();process.exitCode=1;},70000);
(async()=>{
  let port;
  for(let i=0;i<100;i++){const file=path.join(profile,"DevToolsActivePort");if(fs.existsSync(file)){port=Number(fs.readFileSync(file,"utf8").split("\n")[0]);break;}await wait(100);}
  if(!port)throw Error("Disposable shell did not expose its test endpoint");
  let target;
  for(let i=0;i<60;i++){target=(await json("http://127.0.0.1:"+port+"/json/list")).find(p=>p.type==="page"&&p.url.includes("index.html"));if(target)break;await wait(100);}
  if(!target)throw Error("Shell page did not open");socket=new WebSocket(target.webSocketDebuggerUrl);
  socket.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  for(let i=0;i<80;i++){if(await evaluate("Boolean(document.querySelector('.rcv[data-rcv-state=\"ready\"]'))"))break;await wait(100);}
  assert(await evaluate("Boolean(window.chatLink && window.RolecraftChatSync && document.querySelector('.rcv[data-rcv-state=\"ready\"]'))"));
  if(process.argv.includes('--vault-transfer')){
    const expected={'chars:all':JSON.stringify([{id:'fixture',name:'Transfer fixture',profileImg:'fixture-image',gallery:[],sections:[],variants:[]}]),'img:fixture-image':'data:image/png;base64,'+Buffer.alloc(1024*1024,87).toString('base64'),'personas:all':'[]','lore:all':'[]','prompts:all':'[]'};
    for(const [key,value] of Object.entries(expected))await evaluate('window.storage.set('+JSON.stringify(key)+','+JSON.stringify(value)+')');
    const shared=await evaluate('window.transfer.start()');assert(shared.ok,shared.error);
    try{await require('./verify-android-vault-receiver')(shared.code,expected);}finally{await evaluate('window.transfer.stop()');}
  }
  assert.deepStrictEqual(await evaluate("window.chatLink.status()"),{enabled:false,host:true});
  assert(await evaluate("window.chatLink.configure({enabled:true}).then(r=>r.enabled&&r.host&&r.code.startsWith('RCCHAT1-'))"));
  assert(await evaluate("window.chatLink.exchange({snapshot:'[]',acks:[]}).then(r=>Array.isArray(r.incoming)&&r.localHash.length===64)"));
  assert(await evaluate("window.auth.setPassword('Disposable shell check only').then(r=>r.ok)"));
  await evaluate("window.auth.lock()");
  assert(await evaluate("window.chatLink.exchange({snapshot:'[]',acks:[]}).then(()=>false,()=>true)"),"native link refuses locked vaults");
  assert(await evaluate("window.auth.unlockPassword('Disposable shell check only').then(r=>r.ok)"));
  await evaluate("window.chatLink.configure({enabled:false})");
  console.log("PASS: real private Windows shell, native pairing, minimized timer path, exchange and lock refusal with a disposable profile");
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{clearTimeout(timeout);if(socket)socket.close();child.kill();await wait(500);try{fs.rmSync(profile,{recursive:true,force:true});}catch(_){/* Windows may still hold its disposable profile until process exit. */}});
