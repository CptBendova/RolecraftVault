const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto");
const {createTransport,privateIp,seal,unseal}=require("../app/vault-sync-transport");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-transport-")),transports=[];
const storageKey=crypto.randomBytes(32).toString("hex");let locked=false;
function make(name,network={}){const t=createTransport({directory:path.join(root,name),protect:s=>Buffer.from(seal(s,storageKey,"fixture-storage")),unprotect:b=>unseal(b.toString(),storageKey,"fixture-storage"),unlocked:()=>!locked,network:{addresses:()=>["127.0.0.1"],privateIp:ip=>ip==="127.0.0.1",discoveryPort:45100,...network}});transports.push(t);return t;}
(async()=>{
  assert(privateIp("192.168.1.2")&&!privateIp("127.0.0.1")&&!privateIp("8.8.8.8")&&!privateIp("192.168.1.999"));
  const primary=make("tablet"),status=await primary.call("configure",{action:"create",label:"Tablet"});
  const code=(await primary.call("invite")).code;
  const text="Private picture bytes 😀".repeat(5000),chunk=await primary.call("put",{text});
  await primary.call("beginPublish");await primary.call("retain",{hashes:[chunk.hash]});await primary.call("publish",{head:{revision:"fixture",index:{parts:[chunk.hash]}}});
  for(const name of ["phone","pc-one","pc-two"]){
    const t=make(name,{discoveryPort:name==="pc-two"?45103:45100}),s=await t.call("configure",{action:"join",code,label:name});assert.equal(s.primary,status.primary);
    const peers=await t.call("discover");assert(peers.peers.some(p=>p.id===status.device));
    const index=await t.call("index",{peer:status.device});assert.equal(index.label,"Tablet");
    const result=await t.call("chunk",{peer:status.device,hash:chunk.hash});assert.equal(result.text,text);
  }
  const discovered=await primary.call("discover");assert.equal(discovered.peers.length,3);
  console.log("PASS all four peers exchange authenticated encrypted chunks over real sockets");
  assert(!fs.readFileSync(path.join(root,"tablet","pairing.bin"),"utf8").includes(JSON.parse(Buffer.from(code.slice(9),"base64url")).key));
  assert(!fs.readFileSync(path.join(root,"tablet","chunks",chunk.hash),"utf8").includes("Private picture"));
  primary.pause();const restarted=make("tablet",{discoveryPort:45101});const remembered=await restarted.call("status");
  assert.equal(remembered.device,status.device);assert.equal(remembered.group,status.group);
  // A restarted primary has a new listening port. Authenticated discovery must
  // supersede the address embedded in the original invitation permanently.
  const renewed=JSON.parse(Buffer.from((await restarted.call("invite")).code.slice(9),"base64url"));
  const last=transports.find(t=>t.info().label==="pc-two");
  const udp=require("dgram").createSocket("udp4"),body=["RCVSYNC1!",status.group,status.device,"test",Date.now(),renewed.port].join("|");
  const discoveryPacket=body+"|"+crypto.createHmac("sha256",Buffer.from(renewed.key,"hex")).update(body).digest("hex");
  await new Promise((resolve,reject)=>udp.send(Buffer.from(discoveryPacket),45103,"127.0.0.1",e=>e?reject(e):resolve()));udp.close();
  await new Promise(r=>setTimeout(r,100));
  const moved=(await last.call("discover")).peers.find(p=>p.id===status.device);
  assert.equal(moved.port,renewed.port,"Remembered seed must not replace newly discovered endpoint");
  assert.equal((await last.call("index",{peer:status.device})).label,"Tablet");
  console.log("PASS authenticated rediscovery reconnects to a changed endpoint without another code");
  const realNow=Date.now;let elapsed=0;
  try{
    Date.now=()=>realNow()+elapsed;
    elapsed=15000;await restarted.call("status");elapsed=25000;
    assert.equal((await last.call("index",{peer:status.device})).label,"Tablet","An unlocked preparation heartbeat renews the serving lease");
    locked=true;await assert.rejects(restarted.call("status"),/Unlock/);locked=false;
  }finally{Date.now=realNow;locked=false;}
  console.log("PASS a busy unlocked device stays available beyond the old lease without weakening lock guards");
  restarted.pause();
  // The immutable download cache is usable even while the source is offline.
  for(const t of transports.filter(t=>t.info().label==="pc-two"))assert.equal((await t.call("chunk",{peer:status.device,hash:chunk.hash})).text,text);
  console.log("PASS pairing survives a restart and staged writing is encrypted at rest");
  locked=true;await assert.rejects(restarted.call("invite"),/Unlock/);locked=false;
  const bad=JSON.parse(Buffer.from(code.slice(9),"base64url"));bad.ip="8.8.8.8";
  await assert.rejects(make("bad").call("configure",{action:"join",code:"RCVSYNC1."+Buffer.from(JSON.stringify(bad)).toString("base64url")}),/expired|edition/);
  const packet=seal("secret",storageKey,"request");assert.throws(()=>unseal(packet,storageKey,"response"));
  console.log("PASS locked access, public endpoints and wrong-direction packets fail closed");
  const handlers=new Map(),throttling=[];
  const idle=require("../app/vault-sync-transport").setupVaultSync({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},app:{getPath:()=>path.join(root,"off"),on:()=>{}},safeStorage:{},isLocked:()=>false,getWindow:()=>({isDestroyed:()=>false,webContents:{setBackgroundThrottling:v=>throttling.push(v)}})});
  await handlers.get("vault-sync")(null,"status",{});
  assert(!throttling.includes(false),"An unpaired app must retain normal background power saving");idle.pause();
  console.log("PASS polling an unpaired app does not disable background power saving");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const t of transports)t.pause();});
