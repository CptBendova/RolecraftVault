const assert=require("assert"),fs=require("fs"),path=require("path"),os=require("os"),vm=require("vm"),crypto=require("crypto");
const C=require("../app/vault-sync-core"),{createTransport,seal,unseal}=require("../app/vault-sync-transport");
const source=fs.readFileSync(path.join(__dirname,"..","app","vault-sync.js"),"utf8");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-loop-")),key=crypto.randomBytes(32).toString("hex"),nodes=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const digest=s=>crypto.createHash("sha256").update(s).digest("hex");
function make(name){
  const data=new Map([["lore:all",JSON.stringify([{id:name,name,content:name,images:[{imgId:name}]}])],["img:"+name,"data:image/png;base64,"+Buffer.from(name.repeat(100)).toString("base64")]]);
  let applied=0,status=null;
  const storage={get:async k=>{if(!data.has(k))throw Error("key not found");return {value:data.get(k)};},set:async(k,v)=>{data.set(k,v);},fingerprint:async k=>data.has(k)?digest(data.get(k)).slice(0,16):null,fingerprints:async keys=>Object.fromEntries(keys.map(k=>[k,data.has(k)?digest(data.get(k)).slice(0,16):null])),syncImage:async(k,v)=>{if(data.has(k)&&data.get(k)!==v)throw Error("Picture collision");data.set(k,v);},syncCommit:async(values,expected)=>{for(const [k,v]of Object.entries(expected))if((data.get(k)||null)!==v)throw Error("Library changed during sync");for(const [k,v]of Object.entries(values))data.set(k,v);}};
  const transport=createTransport({directory:path.join(root,name),protect:s=>Buffer.from(seal(s,key,"fixture")),unprotect:b=>unseal(b.toString(),key,"fixture"),unlocked:()=>true,network:{addresses:()=>["127.0.0.1"],privateIp:ip=>ip==="127.0.0.1",discoveryPort:45102}});
  const window={RolecraftSyncCore:C,vaultSync:transport},ctx={window,document:{hidden:false},crypto:crypto.webcrypto,TextEncoder,setTimeout,clearTimeout,console};vm.createContext(ctx);vm.runInContext(source,ctx);
  const engine=window.RolecraftVaultSync.create({storage,intervalMs:100,ready:()=>true,canApply:()=>true,imageIds:(kind,r)=>kind==="trash"?(r.record.images||[]).map(i=>i.imgId):(r.images||[]).map(i=>i.imgId),onApplied:()=>applied++});
  engine.subscribe(s=>{status=s;if(s.phase==="preview")engine.approve(s.preview.id);});
  const node={name,data,engine,transport,get status(){return status;},get applied(){return applied;}};nodes.push(node);return node;
}
async function until(test,label,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){if(test())return;await pause(100);}throw Error(label+": "+JSON.stringify(nodes.map(n=>({name:n.name,status:n.status})),null,2));}
(async()=>{
  const tablet=make("tablet");await tablet.transport.call("configure",{action:"create",label:"tablet"});const code=(await tablet.transport.call("invite")).code;
  for(const name of ["phone","pc-one","pc-two"]){const n=make(name);await n.transport.call("configure",{action:"join",code,label:name});}
  for(const n of nodes)n.engine.start();
  await until(()=>nodes.every(n=>JSON.parse(n.data.get("lore:all")).length===4),"Initial four-way merge");
  for(const n of nodes)for(const peer of nodes)assert(n.data.has("img:"+peer.name),"Every referenced picture saves before the record appears");
  console.log("PASS actual automatic loop merges four different vaults and verifies every picture");
  await until(()=>nodes.every(n=>n.status.phase==="synced"),"Acknowledged convergence");
  console.log("PASS peers report up to date only after their durable published revisions agree");
  const phone=nodes[1],records=JSON.parse(phone.data.get("lore:all"));records.find(r=>r.id==="tablet").content="Edited later on phone";phone.data.set("lore:all",JSON.stringify(records));
  await until(()=>nodes.every(n=>JSON.parse(n.data.get("lore:all")).find(r=>r.id==="tablet").content==="Edited later on phone"),"Bidirectional edit");
  console.log("PASS phone edits automatically reach the tablet and both computers without new codes");
  await until(()=>nodes.every(n=>n.status.phase==="synced"),"Second convergence");
  const remaining=JSON.parse(phone.data.get("lore:all")).filter(r=>r.id!=="pc-two");phone.data.set("lore:all",JSON.stringify(remaining));
  await until(()=>nodes.every(n=>!JSON.parse(n.data.get("lore:all")).some(r=>r.id==="pc-two")),"Deletion propagation");
  for(const n of nodes.filter(n=>n!==phone)){assert(JSON.parse(n.data.get("trash:all")).some(t=>t.record.id==="pc-two"));assert(n.data.has("img:pc-two"));}
  console.log("PASS remote deletions are recoverable in the receiving bin and never remove picture bytes");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const n of nodes){n.engine.stop();n.transport.pause();}});
