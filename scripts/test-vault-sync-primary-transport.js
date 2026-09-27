// Real native transport, isolated encrypted profiles and loopback sockets only.
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto"),http=require("http");
const {createTransport,seal,unseal}=require("../app/vault-sync-transport");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-primary-transport-")),transports=[],servers=[];
const storageKey=crypto.randomBytes(32).toString("hex"),controls=new Map();
function make(name){
  const control=controls.get(name)||{locked:false,failSave:false};controls.set(name,control);
  const t=createTransport({directory:path.join(root,name),protect:s=>{if(control.failSave)throw Error("Fixture persistence failure");return Buffer.from(seal(s,storageKey,"storage"));},unprotect:b=>unseal(b.toString(),storageKey,"storage"),unlocked:()=>!control.locked,network:{addresses:()=>["127.0.0.1"],privateIp:ip=>ip==="127.0.0.1",discoveryPort:45319}});transports.push(t);return t;
}
const invite=async t=>JSON.parse(Buffer.from((await t.call("invite")).code.slice(9),"base64url"));
const code=value=>"RCVSYNC1."+Buffer.from(JSON.stringify(value)).toString("base64url");
async function direct(target,fields){
  const nonce=crypto.randomBytes(16).toString("hex"),body=seal(JSON.stringify({nonce,at:Date.now(),action:"index",device:crypto.randomUUID(),port:41234,...fields}),target.key,"request");
  return new Promise((resolve,reject)=>{const req=http.request({host:"127.0.0.1",port:target.port,path:"/sync",method:"POST",headers:{"Content-Length":Buffer.byteLength(body)}},res=>{let text="";res.on("data",b=>text+=b);res.on("end",()=>{try{resolve(res.statusCode===200?unseal(text,target.key,"response"):{status:res.statusCode});}catch(e){reject(e);}});});req.on("error",reject);req.end(body);});
}
(async()=>{
  const a=make("tablet"),original=await a.call("configure",{action:"create",label:"Tablet"}),firstInvite=await invite(a);
  const b=make("phone"),c=make("computer");
  await b.call("configure",{action:"join",code:code(firstInvite),label:"Phone"});
  await c.call("configure",{action:"join",code:code({...firstInvite,primaryPreference:undefined}),label:"Computer"});
  assert.equal((await c.call("status")).primaryPreference,null,"old invitations remain supported");
  const initialIndex=await b.call("index",{peer:original.device});assert.equal(initialIndex.primarySelection,1);assert.equal(initialIndex.primaryPreference,null);assert.equal(initialIndex.head,null,"selection support is discoverable before any images or preference");
  const chunk=await b.call("put",{text:"original protected photo"});await b.call("beginPublish");await b.call("retain",{hashes:[chunk.hash]});await b.call("publish",{head:{revision:"unchanged",index:{parts:[chunk.hash]}}});
  const headPath=path.join(root,"phone","head.bin"),head=fs.readFileSync(headPath);
  const chosen=await b.call("setPrimary");assert.equal(chosen.primarySelection,1);assert.equal(chosen.primary,original.primary);assert.equal(chosen.group,original.group);
  assert.equal(chosen.primaryPreference.device,chosen.device);assert.equal(chosen.primaryPreference.author,chosen.device);assert.equal(chosen.primaryPreference.sequence,1);
  assert(fs.readFileSync(headPath).equals(head));assert.equal((await b.call("chunk",{hash:chunk.hash})).text,"original protected photo");
  await assert.rejects(b.call("setPrimary",{device:original.device}),/on the device/);
  controls.get("phone").failSave=true;await assert.rejects(b.call("setPrimary"),/persistence/);controls.get("phone").failSave=false;assert.equal((await b.call("status")).primaryPreference.sequence,1);
  console.log("PASS changing primary preserves pairing identity, encrypted chunks and head; cannot select a remote device or advertise failed persistence");

  // Request propagation works even while the source has not prepared a head.
  const reply=await b.call("index",{peer:original.device});assert.equal(reply.head,null);assert.deepEqual((await a.call("status")).primaryPreference,chosen.primaryPreference);
  const newer=await a.call("setPrimary");assert.equal(newer.primaryPreference.sequence,2);
  await b.call("index",{peer:original.device});await c.call("index",{peer:original.device});
  assert.deepEqual((await b.call("status")).primaryPreference,newer.primaryPreference);assert.deepEqual((await c.call("status")).primaryPreference,newer.primaryPreference);
  console.log("PASS authenticated requests and replies propagate a durable preference before image preparation");

  // Two offline selections have equal counters and converge by UUID, not clocks.
  const pb=(await b.call("setPrimary")).primaryPreference,pc=(await c.call("setPrimary")).primaryPreference;
  assert.equal(pb.sequence,3);assert.equal(pc.sequence,3);
  const expected=pb.author>pc.author?pb:pc;
  await b.call("index",{peer:original.device});await c.call("index",{peer:original.device});await b.call("index",{peer:original.device});
  assert.deepEqual((await a.call("status")).primaryPreference,expected);assert.deepEqual((await b.call("status")).primaryPreference,expected);assert.deepEqual((await c.call("status")).primaryPreference,expected);
  const latestInvite=await invite(a),d=make("new-device"),joined=await d.call("configure",{action:"join",code:code(latestInvite)});assert.deepEqual(joined.primaryPreference,expected);assert.equal(joined.primary,original.primary);
  b.pause();const restarted=make("phone");assert.deepEqual((await restarted.call("status")).primaryPreference,expected);
  assert(!fs.readFileSync(path.join(root,"phone","pairing.bin"),"utf8").includes(expected.device));
  console.log("PASS concurrent choices converge, survive encrypted restart and travel in invitations without replacing the original starting device");

  const before=(await a.call("status")).primaryPreference;
  const legacyIncoming=JSON.parse(await direct(latestInvite,{})).result;assert.equal(legacyIncoming.error,"PRIMARY_SELECTION_UPDATE_REQUIRED");assert.equal(legacyIncoming.head,undefined);
  for(const bad of [{...before,sequence:0},{...before,sequence:"4"},{...before,sequence:1.5},{...before,sequence:Number.MAX_SAFE_INTEGER+1},{...before,author:"not-a-device"},{...before,author:[before.author]},{...before,device:[before.device]},{...before,format:2},{...before,label:"x".repeat(81)},[]]){
    assert.equal((await direct(latestInvite,{primarySelection:1,primaryPreference:bad})).status,409);
  }
  assert.deepEqual((await a.call("status")).primaryPreference,before);
  const incompatible=JSON.parse(await direct(latestInvite,{primaryPreference:{...before,sequence:50}})).result;assert.equal(incompatible.error,"PRIMARY_SELECTION_UPDATE_REQUIRED");assert.deepEqual((await a.call("status")).primaryPreference,before);
  console.log("PASS old incoming index exchanges fail closed after selection; malformed registers never enter protected settings");

  let responseCapability=false,responsePreference=null,lockOnResponse=false;
  const fakeId=crypto.randomUUID(),fake=http.createServer(async(req,res)=>{
    const pieces=[];for await(const p of req)pieces.push(p);
    const request=JSON.parse(unseal(Buffer.concat(pieces).toString(),firstInvite.key,"request"));
    if(lockOnResponse)controls.get("legacy-probe").locked=true;
    res.end(seal(JSON.stringify({nonce:request.nonce,result:{device:fakeId,head:null,...(responseCapability?{primarySelection:1}:{}),primaryPreference:responsePreference}}),firstInvite.key,"response"));
  });servers.push(fake);await new Promise(r=>fake.listen(0,"127.0.0.1",r));
  const probe=make("legacy-probe");await probe.call("configure",{action:"join",code:code({...firstInvite,device:fakeId,port:fake.address().port,primaryPreference:undefined})});
  assert.equal((await probe.call("index",{peer:fakeId})).head,null,"legacy peers still work before an explicit primary selection");
  await probe.call("setPrimary");await assert.rejects(probe.call("index",{peer:fakeId}),/Update every paired app/);
  responseCapability=true;responsePreference={...before,sequence:100};lockOnResponse=true;
  await assert.rejects(probe.call("index",{peer:fakeId}),/Unlock|paused/);controls.get("legacy-probe").locked=false;assert.equal((await probe.call("status")).primaryPreference.sequence,1);
  controls.get("phone").locked=true;await assert.rejects(restarted.call("setPrimary"),/Unlock/);controls.get("phone").locked=false;
  console.log("PASS old outgoing exchanges are blocked only after selection; locked and late replies cannot change the preference");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const t of transports)t.pause();for(const server of servers)server.close();});
