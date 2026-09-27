const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),http=require("http"),crypto=require("crypto");
const {setupChatLink,seal,unseal,privateIp,digest,addressFrom}=require("../app/chat-link-server");
const core=require("../app/chat-sync-core");
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-chat-link-test-")),handlers=new Map();
let locked=false,stop;
const invoke=(name,...args)=>handlers.get("chatlink-"+name)(null,...args);
function post(port,text,headers={}){return new Promise((resolve,reject)=>{const req=http.request({hostname:"127.0.0.1",port,path:"/chat-sync",method:"POST",headers},res=>{let body="";res.setEncoding("utf8");res.on("data",v=>body+=v);res.on("end",()=>resolve({status:res.statusCode,body}));});req.on("error",reject);req.end(text);});}
(async()=>{
  stop=setupChatLink({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},app:{getPath:()=>directory,on(){}},isLocked:()=>locked,network:{address:()=>"127.0.0.1",privateIp:ip=>ip==="127.0.0.1",port:0,discovery:false}});
  const configured=await invoke("configure",{enabled:true}),parts=/^RCCHAT1-127\.0\.0\.1:(\d+)-([a-f0-9]{64})$/.exec(configured.code),port=+parts[1],key=parts[2];
  const base=core.stamp([{id:"story",title:"Both",messages:[{id:"start",role:"user",content:"hello"}],memoryPins:"Pinned",memories:[]}],[],()=>crypto.randomUUID());
  const pc=core.stamp([{...base[0],messages:base[0].messages.concat({id:"pc",role:"assistant",content:"PC writing"})}],base,()=>crypto.randomUUID());
  const phone=core.stamp([{...base[0],messages:base[0].messages.concat({id:"phone",role:"assistant",content:"Phone writing"})}],base,()=>crypto.randomUUID());
  const pcText=core.canonical(pc),phoneText=core.canonical(phone),client=crypto.randomUUID();
  await invoke("exchange",{snapshot:pcText,acks:[]});
  async function exchange(change={}){const msg={snapshot:phoneText,nonce:crypto.randomUUID(),time:Date.now(),client,...change};const raw=await post(port,seal(JSON.stringify(msg),key,"request"));return {raw,msg,reply:raw.status===200?JSON.parse(unseal(raw.body,key,"response")):null};}
  let response=await exchange();assert.equal(response.raw.status,200);assert.equal(response.reply.nonce,response.msg.nonce);assert.equal(response.reply.ack,"","received is not yet durably saved");assert.equal(response.reply.snapshot,pcText);
  let desktop=await invoke("exchange",{snapshot:pcText,acks:[]});assert.equal(desktop.incoming.length,1);
  const merged=core.merge(pc,JSON.parse(desktop.incoming[0].snapshot));assert.equal(merged.chats.length,2);
  const mergedText=core.canonical(merged.chats);await invoke("exchange",{snapshot:mergedText,acks:[digest(phoneText)]});
  const unchanged=await invoke("exchange",{hash:digest(mergedText),acks:[]});
  assert.equal(unchanged.localHash,digest(mergedText),"an unchanged large snapshot is not resent across the renderer bridge");
  assert.equal(unchanged.needSnapshot,false);
  assert.equal((await invoke("exchange",{hash:"a".repeat(64),acks:[]})).needSnapshot,true,"a missing or changed native snapshot requests a complete retry");
  response=await exchange({known:digest(pcText)});assert.equal(response.reply.ack,digest(phoneText));assert.equal(response.reply.snapshot,mergedText);
  // Phone commits before acknowledging the Windows snapshot.
  response=await exchange({snapshot:mergedText,ack:digest(mergedText),known:digest(mergedText)});assert.equal(response.reply.snapshot,null);
  desktop=await invoke("exchange",{snapshot:mergedText,acks:[digest(mergedText)]});assert.equal(desktop.peerAck,desktop.localHash,"both saved only after durable peer acknowledgement");
  response=await exchange({snapshot:null,hash:digest(mergedText),known:digest(mergedText)});assert.equal(response.reply.needSnapshot,false,"unchanged snapshots need no retransmission");
  response=await exchange({snapshot:null,hash:"a".repeat(64)});assert.equal(response.reply.needSnapshot,true,"restart/lost-cache asks for safe retransmission");
  assert.equal((await exchange({client:crypto.randomUUID()})).raw.status,400,"one code belongs to one paired phone");
  assert.equal((await exchange({time:Date.now()-300000})).raw.status,400,"stale requests fail closed");
  assert.equal((await post(port,"not ciphertext")).status,400);
  assert.equal((await post(port,seal("{}",key,"response"))).status,400,"reflection fails authentication");
  assert.equal((await post(port,"ignored",{Origin:"https://example.invalid"})).status,403,"web origins cannot use LAN endpoint");
  locked=true;assert.equal((await exchange()).raw.status,423);await assert.rejects(async()=>invoke("exchange",{snapshot:pcText}),/Unlock/);
  assert(!privateIp("127.0.0.1")&&!privateIp("8.8.8.8")&&!privateIp("192.168.1.999")&&privateIp("192.168.1.10"));
  assert.equal(addressFrom({"vEthernet (WSL)":[{family:"IPv4",address:"172.24.16.1",internal:false}],"Wi-Fi":[{family:"IPv4",address:"192.168.1.42",internal:false}]}),"192.168.1.42","a WSL adapter must not displace the reachable Wi-Fi address");
  assert.equal(addressFrom({"DockerNAT":[{family:"IPv4",address:"10.0.75.1",internal:false}]}),null,"a virtual-only address must not be advertised to a phone");
  assert.throws(()=>unseal(seal("hello",key,"request"),key,"response"));
  console.log("PASS: real encrypted LAN exchange, durable acknowledgments, conflicts, retries, pairing isolation and locked/origin/replay guards");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(stop)stop();fs.rmSync(directory,{recursive:true,force:true});});
