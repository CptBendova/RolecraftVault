/* 1.333 reachability audit. Before this, every lock, Android app switch and
   restart rebound the sync listener to a new random port and forgot every
   peer. Only UDP discovery (often blocked by routers, Android multicast
   filtering or a Windows Public-network firewall) could find a device again,
   and the stale invitation address was re-added as if it were fresh. These
   checks run the real transport over real sockets. */
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto"),http=require("http");
const T=require("../app/vault-sync-transport");
const {createTransport,seal,unseal,interfaceRows,broadcastOf}=T;
const root=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-reach-")),transports=[];
const storageKey=crypto.randomBytes(32).toString("hex");
/* Each device gets its own discovery port, so UDP between them never works:
   everything below must succeed without broadcast discovery. */
let udpPort=45400;
function make(name,network={}){const t=createTransport({directory:path.join(root,name),protect:s=>Buffer.from(seal(s,storageKey,"fixture-storage")),unprotect:b=>unseal(b.toString(),storageKey,"fixture-storage"),unlocked:()=>true,network:{addresses:()=>["127.0.0.1"],privateIp:ip=>ip==="127.0.0.1",discoveryPort:udpPort++,...network}});transports.push(t);return t;}
const portOf=async t=>JSON.parse(Buffer.from((await t.call("invite")).code.slice(9),"base64url")).port;
(async()=>{
  // Adapter ranking and netmask broadcast, from a Windows-like interface list.
  const real=os.networkInterfaces;
  os.networkInterfaces=()=>({
    "vEthernet (WSL)":[{family:"IPv4",address:"172.20.48.1",netmask:"255.255.240.0",internal:false}],
    "VMware Network Adapter VMnet8":[{family:"IPv4",address:"192.168.80.1",netmask:"255.255.255.0",internal:false}],
    "Local Area Connection* 10":[{family:"IPv4",address:"192.168.137.1",netmask:"255.255.255.0",internal:false}],
    "Wi-Fi":[{family:"IPv4",address:"10.0.5.9",netmask:"255.255.0.0",internal:false}],
    "Loopback Pseudo-Interface 1":[{family:"IPv4",address:"127.0.0.1",netmask:"255.0.0.0",internal:true}]
  });
  try{
    const rows=interfaceRows();
    assert.equal(rows[0].name,"Wi-Fi","Real Wi-Fi must be advertised before virtual adapters");
    assert.equal(rows[1].name,"Local Area Connection* 10","The Windows hotspot stays usable but ranks below Wi-Fi");
    assert(rows.slice(2).every(r=>/vEthernet|VMware/.test(r.name)),"Hyper-V/WSL/VMware adapters rank last");
  }finally{os.networkInterfaces=real;}
  assert.equal(broadcastOf("10.0.5.9","255.255.0.0"),"10.0.255.255");
  assert.equal(broadcastOf("192.168.1.20","255.255.255.0"),"192.168.1.255");
  assert.equal(broadcastOf("172.20.48.1","255.255.240.0"),"172.20.63.255");
  console.log("PASS real Wi-Fi/Ethernet outrank virtual adapters and broadcasts follow the netmask");

  const pc=make("pc"),created=await pc.call("configure",{action:"create",label:"Desk PC"});
  const pcPort=await portOf(pc);
  await pc.call("pause");await pc.call("serve");
  assert.equal(await portOf(pc),pcPort,"A lock/unlock cycle must keep the listening port");
  pc.pause();const pcAgain=make("pc");await pcAgain.call("serve");
  assert.equal(await portOf(pcAgain),pcPort,"A restart must keep the listening port");
  assert.equal((await pcAgain.call("diagnose")).host,"0.0.0.0","The listener covers every adapter, not only the first address");
  console.log("PASS the listening port survives lock, pause and restart");

  const code=(await pcAgain.call("invite")).code;
  const phone=make("phone"),joined=await phone.call("configure",{action:"join",code,label:"Phone"});
  let found=(await phone.call("discover",{waitMs:0})).peers.find(p=>p.id===created.device);
  assert(found,"The invitation endpoint is a usable first hint");
  assert.equal((await phone.call("index",{peer:created.device})).label,"Desk PC");
  // Phone locks/backgrounds and comes back: no UDP, yet the PC is still known.
  await phone.call("pause");await phone.call("serve");
  found=(await phone.call("discover",{waitMs:0})).peers.find(p=>p.id===created.device);
  assert(found&&found.port===pcPort&&found.label==="Desk PC","A verified endpoint must survive pause without UDP discovery");
  assert.equal((await phone.call("index",{peer:created.device})).label,"Desk PC");
  // Phone app restarts.
  phone.pause();const phone2=make("phone");await phone2.call("serve");
  found=(await phone2.call("discover",{waitMs:0})).peers.find(p=>p.id===created.device);
  assert(found&&found.port===pcPort,"A verified endpoint must survive an app restart");
  assert.equal((await phone2.call("index",{peer:created.device})).label,"Desk PC");
  // The PC learned the phone from its authenticated requests, not UDP.
  const back=(await pcAgain.call("discover",{waitMs:0})).peers.find(p=>p.id===joined.device);
  assert(back&&back.inboundAt>0,"An authenticated inbound request records the sender's endpoint");
  assert.equal((await pcAgain.call("index",{peer:joined.device})).label,"Phone");
  console.log("PASS paired devices find each other after pause and restart with UDP discovery blocked");

  // Gossip carries only directly observed endpoints, with their age.
  const tablet=make("tablet");const tabletInfo=await tablet.call("configure",{action:"join",code:(await pcAgain.call("invite")).code,label:"Tablet"});
  const index=await tablet.call("index",{peer:created.device});
  const gossip=(index.peers||[]).find(p=>p.id===joined.device);
  assert(gossip&&Number.isSafeInteger(gossip.age)&&gossip.age>=0&&gossip.age<60000,"Gossip reports how long ago the endpoint was verified");
  assert(!(index.peers||[]).some(p=>p.id===tabletInfo.device),"A device is not told about itself");
  assert.equal((await tablet.call("index",{peer:joined.device})).label,"Phone","A gossiped endpoint works without UDP");
  console.log("PASS gossip relays verified endpoints with their age");

  // Precise failures from a stand-in on the PC's (stable) port.
  pcAgain.pause();
  const respond={status:409,headers:{}};
  const fake=http.createServer((req,res)=>{req.resume();req.on("end",()=>{res.writeHead(respond.status,respond.headers);res.end();});});
  await new Promise(r=>fake.listen(pcPort,"0.0.0.0",r));
  respond.status=409;respond.headers={"X-RCV-Reason":"expired","X-RCV-Time":String(Date.now()-11*60000)};
  await assert.rejects(phone2.call("index",{peer:created.device}),/clocks on these devices differ by about 11 minutes/);
  respond.status=423;respond.headers={"X-RCV-Reason":"paused","X-RCV-Time":String(Date.now())};
  await assert.rejects(phone2.call("index",{peer:created.device}),/locked or in the background/);
  respond.status=409;respond.headers={"X-RCV-Reason":"auth","X-RCV-Time":String(Date.now())};
  await assert.rejects(phone2.call("index",{peer:created.device}),/did not accept this group's key/);
  await new Promise(r=>fake.close(r));
  const started=Date.now();
  await assert.rejects(phone2.call("index",{peer:created.device}),/not accepting connections/);
  assert(Date.now()-started<3000,"A closed port fails fast");
  console.log("PASS clock skew, locked, re-paired and closed-app failures are named precisely");

  // The phone just failed to reach the PC. When the PC reaches the phone, it
  // learns that the path back is blocked (typical Windows Public firewall).
  const pcBack=make("pc");await pcBack.call("serve");
  const reply=await pcBack.call("index",{peer:joined.device});
  assert.equal(reply.cannotReachMe,true,"The reachable side must learn that the other device cannot connect back");
  await phone2.call("index",{peer:created.device});
  assert.equal((await pcBack.call("index",{peer:joined.device})).cannotReachMe,false,"A later success clears the warning");
  console.log("PASS a one-way firewall is reported to the device that can fix it");

  // A real request with a malformed body gets a reason and a time, never a body.
  const raw=await new Promise((resolve,reject)=>{const req=http.request({host:"127.0.0.1",port:pcPort,path:"/sync",method:"POST",headers:{"Content-Type":"text/plain"}},res=>{let text="";res.on("data",d=>text+=d);res.on("end",()=>resolve({res,text}));});req.on("error",reject);req.end("AAAA");});
  assert.equal(raw.res.statusCode,409);assert.equal(raw.res.headers["x-rcv-reason"],"auth");assert(Math.abs(Number(raw.res.headers["x-rcv-time"])-Date.now())<5000);assert.equal(raw.text,"");
  console.log("PASS refusals carry only a reason code and the server time");

  for(const t of transports)t.pause();fs.rmSync(root,{recursive:true,force:true});
})().catch(error=>{console.error(error);for(const t of transports)try{t.pause();}catch(_){}process.exit(1);});
