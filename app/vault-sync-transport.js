"use strict";
/* Privileged, explicitly paired LAN-only immutable chunk server. It never
   writes vault records. Peers pull; the unlocked local UI owns reconciliation. */
const fs=require("fs"),path=require("path"),os=require("os"),http=require("http"),dgram=require("dgram"),crypto=require("crypto"),zlib=require("zlib");
const DISCOVERY=44218, MAX=2*1024*1024, CHUNK=256*1024;
const CHUNK_BATCH=4;
const PRIMARY_UPDATE="Update every paired app to the latest private Chat version before syncing with a selected primary device.";
function primaryPreference(value){
  if(value==null)return null;
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if(!value||typeof value!=="object"||Array.isArray(value)||value.format!==1||typeof value.device!=="string"||!uuid.test(value.device)||typeof value.author!=="string"||!uuid.test(value.author)||!Number.isSafeInteger(value.sequence)||value.sequence<1||typeof value.label!=="string"||value.label.length>80)throw Error("Invalid primary device selection");
  return {format:1,device:value.device,author:value.author,sequence:value.sequence,label:value.label};
}
function comparePrimary(a,b){
  if(!a||!b)return a?1:b?-1:0;
  if(a.sequence!==b.sequence)return a.sequence>b.sequence?1:-1;
  for(const key of ["author","device","label"])if(a[key]!==b[key])return a[key]>b[key]?1:-1;
  return 0;
}
const digest=b=>crypto.createHash("sha256").update(b).digest("hex");
function privateIp(ip) {return typeof ip==="string" && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) && ip.split(".").length===4 && ip.split(".").every(n=>/^\d{1,3}$/.test(n)&&+n<256);}
/* Rank real Wi-Fi/Ethernet first. Hyper-V, WSL, VMware, VirtualBox, Docker and
   VPN adapters also carry private addresses; advertising one of those in a QR
   or using it as the source address made paired devices unreachable. The
   Windows hotspot adapter is kept (a phone may be on it) but ranked lower. */
const VIRTUAL_ADAPTER=/virtual|vethernet|hyper-v|vmware|vmnet|vbox|docker|wsl|vpn|wintun|wireguard|nordlynx|tailscale|zerotier|hamachi|radmin|npcap|bluetooth|teredo|isatap|\b(tap|tun|utun)\d*\b/i;
const REAL_ADAPTER=/^(wi-?fi|wlan|wireless|ethernet|eth\d|en\d|enp|wlp|wl\d)/i;
function interfaceRows(){
  const rows=[];
  for(const [name,list] of Object.entries(os.networkInterfaces()))for(const n of list||[])if(n&&(n.family==="IPv4"||n.family===4)&&!n.internal&&privateIp(n.address))rows.push({name,address:n.address,netmask:n.netmask||"255.255.255.0"});
  const rank=r=>VIRTUAL_ADAPTER.test(r.name)?3:(/^Local Area Connection\*/i.test(r.name)||/^192\.168\.137\./.test(r.address))?2:REAL_ADAPTER.test(r.name)?0:1;
  return rows.map((r,i)=>({...r,i})).sort((a,b)=>rank(a)-rank(b)||a.i-b.i).map(({i,...r})=>r);
}
function addresses(){return interfaceRows().map(r=>r.address);}
function broadcastOf(address,netmask){
  const a=String(address).split(".").map(Number),m=String(netmask||"255.255.255.0").split(".").map(Number);
  if(a.length!==4||m.length!==4||m.some(n=>!(n>=0&&n<=255)))return a.slice(0,3).join(".")+".255";
  return a.map((n,i)=>(n&m[i])|(~m[i]&255)).join(".");
}
function plainIp(value){return String(value||"").replace(/^::ffff:/i,"");}
function seal(text,key,aad){const iv=crypto.randomBytes(12),c=crypto.createCipheriv("aes-256-gcm",Buffer.from(key,"hex"),iv);c.setAAD(Buffer.from("RCVSYNC1:"+aad));return Buffer.concat([iv,c.update(zlib.gzipSync(Buffer.from(text))),c.final(),c.getAuthTag()]).toString("base64");}
function unseal(text,key,aad){if(typeof text!=="string"||text.length>MAX||!text.match(/^[A-Za-z0-9+/=]+$/))throw Error("Invalid sync packet");const b=Buffer.from(text,"base64");if(b.length<29)throw Error("Invalid sync packet");const c=crypto.createDecipheriv("aes-256-gcm",Buffer.from(key,"hex"),b.subarray(0,12));c.setAAD(Buffer.from("RCVSYNC1:"+aad));c.setAuthTag(b.subarray(-16));return zlib.gunzipSync(Buffer.concat([c.update(b.subarray(12,-16)),c.final()]),{maxOutputLength:MAX}).toString("utf8");}
function mac(key,text){return crypto.createHmac("sha256",Buffer.from(key,"hex")).update(text).digest("hex");}
function equal(a,b){return typeof a==="string"&&typeof b==="string"&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
/* Blob packets already use authenticated encryption. Bind a bounded batch of
   those immutable ciphertexts to this request without compressing/encrypting
   the same picture a second time. Legacy single-chunk replies stay unchanged. */
function sealChunkBatch(body,key,nonce){
  if(typeof body!=="string"||!/^[a-f0-9]{32}$/.test(nonce))throw Error("Invalid chunk batch");
  const packet="RCVSYNCB1\n"+nonce+"\n"+mac(key,"RCVSYNC1:chunks-response\n"+nonce+"\n"+body)+"\n"+body;
  if(Buffer.byteLength(packet)>MAX)throw Error("Chunk batch too large");return packet;
}
function unsealChunkBatch(packet,key,nonce){
  if(typeof packet!=="string"||Buffer.byteLength(packet)>MAX||!/^[a-f0-9]{32}$/.test(nonce))throw Error("Invalid chunk batch");
  const prefix="RCVSYNCB1\n"+nonce+"\n",start=prefix.length,body=packet.slice(start+65),signature=packet.slice(start,start+64);
  if(!packet.startsWith(prefix)||packet[start+64]!=="\n"||!/^[a-f0-9]{64}$/.test(signature)||!equal(signature,mac(key,"RCVSYNC1:chunks-response\n"+nonce+"\n"+body)))throw Error("Invalid chunk batch authentication");
  return body;
}
/* Windows blocks inbound connections on networks marked Public unless the
   firewall rule allows them there. Reading the category is read-only. */
function windowsNetworkProfile(address){
  if(process.platform!=="win32"||!address)return Promise.resolve(null);
  return new Promise(resolve=>{
    let done=false;const finish=value=>{if(!done){done=true;resolve(value);}};
    try{
      const script="$ErrorActionPreference='Stop';$a=Get-NetIPAddress -AddressFamily IPv4 -IPAddress '"+String(address).replace(/[^0-9.]/g,"")+"';$p=Get-NetConnectionProfile -InterfaceIndex $a.InterfaceIndex;[pscustomobject]@{alias=$p.InterfaceAlias;category=[string]$p.NetworkCategory;name=$p.Name}|ConvertTo-Json -Compress";
      const child=require("child_process").execFile("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{timeout:5000,windowsHide:true,maxBuffer:65536},(error,stdout)=>{
        if(error)return finish(null);
        try{const r=JSON.parse(String(stdout).trim());finish({alias:String(r.alias||"").slice(0,80),category:["Public","Private","DomainAuthenticated"].includes(r.category)?r.category:"Unknown",name:String(r.name||"").slice(0,80)});}catch(_){finish(null);}
      });
      child.on("error",()=>finish(null));
    }catch(_){finish(null);}
  });
}
function createTransport({directory,protect,unprotect,unlocked,network={},credentials=null}){
  const allowed=ip=>(network.privateIp||privateIp)(plainIp(ip)), localAddresses=network.addresses||addresses;
  const localBroadcasts=()=>network.addresses?network.addresses().map(a=>broadcastOf(a)):interfaceRows().map(r=>broadcastOf(r.address,r.netmask));
  const cfgFile=path.join(directory,"pairing.bin"),chunksDir=path.join(directory,"chunks"),rootFile=path.join(directory,"head.bin");
  let cfg=null,server=null,udp=null,ip=null,port=0,lease=0,epoch=0,starting=null,retained=new Set();
  const peers=new Map(),nonces=new Map(),wakeNonces=new Map(),connections=new Set(),batchPeers=new Set();
  /* Reachability evidence, per paired device: when it last reached us, and
     when our last attempt to reach it failed (cleared by any success). */
  const inbound=new Map(),outFail=new Map();
  const REACH_WINDOW=3*60000,FRESH=5*60000;
  let enrollment=null,enrollServer=null;
  let keyEpoch=0;
  function stopEnrollment(){enrollment=null;if(enrollServer)enrollServer.close();enrollServer=null;}
  function joinInfo(){if(enrollment&&Date.now()>enrollment.expires)stopEnrollment();return enrollment?{code:enrollment.code,pendingLabel:enrollment.received&&enrollment.received.label,expires:enrollment.expires}:null;}
  async function joinRequest(args){
    load();if(cfg)throw Error("This device already belongs to a group");stopEnrollment();const address=localAddresses()[0];if(!address)throw Error("Connect to the same private local network first");
    const pending={key:crypto.randomBytes(32).toString("hex"),id:crypto.randomUUID(),namespace:args.namespace||"library1",label:String(args.label||os.hostname()).slice(0,80),expires:Date.now()+10*60000,received:null};enrollment=pending;
    const s=http.createServer(async(req,res)=>{
      try{
        if(!unlocked()||enrollment!==pending||Date.now()>pending.expires||!allowed(req.socket.remoteAddress)||req.method!=="POST"||req.url!=="/pair")throw Error("Pairing unavailable");
        const chunks=[];let length=0;for await(const piece of req){length+=piece.length;if(length>16384)throw Error("Pairing message too large");chunks.push(piece);}
        const data=JSON.parse(unseal(Buffer.concat(chunks).toString(),pending.key,"pair-offer"));
        if(data.request!==pending.id||typeof data.code!=="string"||data.code.length>2000||!data.code.startsWith("RCVSYNC1."))throw Error("Invalid pairing offer");
        const invite=JSON.parse(Buffer.from(data.code.slice(9),"base64url").toString());if(invite.namespace!==pending.namespace||!allowed(invite.ip)||invite.expires<Date.now())throw Error("Incompatible invitation");
        if(!unlocked()||enrollment!==pending||Date.now()>pending.expires)throw Error("Pairing expired");
        if(pending.received&&pending.received.code!==data.code)throw Error("Another offer is waiting for approval");
        pending.received={code:data.code,label:String(data.label||"Paired device").slice(0,80)};
        res.writeHead(200,{"Content-Type":"text/plain","Cache-Control":"no-store"});res.end(seal(JSON.stringify({ok:true,request:pending.id}),pending.key,"pair-reply"));
      }catch(_){if(!res.headersSent)res.writeHead(409);res.end();}
    });
    enrollServer=s;s.requestTimeout=10000;s.headersTimeout=10000;s.maxConnections=4;
    s.on("connection",socket=>{connections.add(socket);socket.on("close",()=>connections.delete(socket));socket.setTimeout(10000,()=>socket.destroy());});
    await new Promise((resolve,reject)=>{s.once("error",reject);s.listen(0,address,resolve);});
    if(enrollment!==pending||!unlocked()){s.close();throw Error("Pairing cancelled");}
    pending.code="RCVJOIN1."+Buffer.from(JSON.stringify({key:pending.key,id:pending.id,ip:address,port:s.address().port,namespace:pending.namespace,expires:pending.expires})).toString("base64url");return info();
  }
  async function offerJoin(code){
    let target;try{if(!String(code).startsWith("RCVJOIN1.")||code.length>2000)throw Error();target=JSON.parse(Buffer.from(code.slice(9),"base64url").toString());}catch(_){throw Error("Scan a device's join-request QR");}
    if(!allowed(target.ip)||!Number.isInteger(target.port)||target.port<1024||target.port>65535||!/^[a-f0-9]{64}$/.test(target.key)||!/^[a-f0-9-]{36}$/.test(target.id)||target.namespace!==cfg.namespace||!Number.isSafeInteger(target.expires)||target.expires<Date.now()||target.expires>Date.now()+15*60000)throw Error("Device QR is expired or incompatible");
    const run=epoch,invite=(await call("invite")).code,body=seal(JSON.stringify({request:target.id,code:invite,label:cfg.label}),target.key,"pair-offer");
    return new Promise((resolve,reject)=>{const req=http.request({host:target.ip,port:target.port,localAddress:sourceFor(target.ip),agent:false,path:"/pair",method:"POST",headers:{"Content-Type":"text/plain","Content-Length":Buffer.byteLength(body)},timeout:10000},res=>{
      let text="";res.on("data",piece=>{text+=piece;if(text.length>16384)req.destroy(Error("Invalid pairing reply"));});res.on("error",reject);res.on("end",()=>{try{guard();if(run!==epoch||res.statusCode!==200)throw Error("Pairing was cancelled or another offer is waiting");const reply=JSON.parse(unseal(text,target.key,"pair-reply"));if(!reply.ok||reply.request!==target.id)throw Error("Invalid pairing reply");resolve({ok:true});}catch(e){reject(e);}});
    });req.on("socket",socket=>{connections.add(socket);socket.on("close",()=>connections.delete(socket));});req.on("timeout",()=>req.destroy(Error("Device is unavailable. Keep its pairing QR open and try again.")));req.on("error",reject);req.end(body);});
  }
  function guard(){if(!unlocked())throw Error("Unlock the vault to sync");}
  function active(){return unlocked()&&Date.now()<lease&&cfg;}
  function atomic(file,bytes){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+".tmp";fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,file);}
  function load(){guard();if(!cfg&&fs.existsSync(cfgFile))cfg=JSON.parse(unprotect(fs.readFileSync(cfgFile)));if(cfg&&(!/^[a-f0-9]{64}$/.test(cfg.key)||!/^[a-f0-9-]{36}$/.test(cfg.device)))throw Error("Pairing is damaged. Leave the group and pair again.");if(cfg)primaryPreference(cfg.primaryPreference);return cfg;}
  function save(c){guard();atomic(cfgFile,protect(JSON.stringify(c)));cfg=c;}
  function info(){return {enabled:!!cfg,device:cfg&&cfg.device,primary:cfg&&cfg.primary,label:cfg&&cfg.label,group:cfg&&digest(cfg.key).slice(0,24),namespace:cfg&&cfg.namespace,canShowJoinRequest:true,chunkBatch:CHUNK_BATCH,chunkConcurrency:2,photoCacheInspection:1,primarySelection:1,storyPublishFast:1,primaryPreference:primaryPreference(cfg&&cfg.primaryPreference),joinRequest:joinInfo()};}
  function acceptPrimary(message,run){
    guard();if(run!==epoch||!active())throw Error("Sync paused. Open and unlock Rolecraft to resume.");
    const incoming=primaryPreference(message.primaryPreference),current=primaryPreference(cfg.primaryPreference);
    if((current||incoming)&&message.primarySelection!==1)throw Error(PRIMARY_UPDATE);
    if(comparePrimary(incoming,current)>0)save({...cfg,primaryPreference:incoming});
  }
  function pause(){keyEpoch++;if(credentials)credentials.stop();epoch++;lease=0;if(server)server.close();if(udp)udp.close();for(const socket of connections)socket.destroy();connections.clear();server=null;udp=null;starting=null;ip=null;port=0;peers.clear();batchPeers.clear();nonces.clear();wakeNonces.clear();retained.clear();inbound.clear();outFail.clear();}
  function validHashes(hashes){return Array.isArray(hashes)&&hashes.length>0&&hashes.length<=CHUNK_BATCH&&hashes.every(h=>typeof h==="string"&&/^[a-f0-9]{64}$/.test(h));}
  function readChunk(hash){
    const packet=fs.readFileSync(path.join(chunksDir,hash),"utf8"),text=unseal(packet,cfg.key,"blob:"+hash);
    if(digest(text)!==hash||Buffer.byteLength(text)>CHUNK)throw Error("Sync chunk checksum failed");return {packet,text};
  }
  function serveChunk(hash){
    try{return readChunk(hash).packet;}
    catch(_){try{fs.unlinkSync(path.join(chunksDir,hash));}catch(_){}throw Error("Cached chunk damaged; rebuilding from the vault");}
  }
  function putText(text){
    if(typeof text!=="string"||Buffer.byteLength(text)>CHUNK)throw Error("Sync chunk too large");
    const hash=digest(text),file=path.join(chunksDir,hash);let valid=false;
    if(fs.existsSync(file))try{readChunk(hash);valid=true;}catch(_){/* Repair from the supplied verified text. */}
    if(!valid)atomic(file,seal(text,cfg.key,"blob:"+hash));return hash;
  }
  function validPeer(p){return !!(cfg&&p&&p.id!==cfg.device&&typeof p.id==="string"&&/^[a-f0-9-]{36}$/.test(p.id)&&allowed(p.ip)&&Number.isInteger(p.port)&&p.port>=1024&&p.port<=65535);}
  /* how: "direct" = authenticated contact just now (UDP, inbound request or a
     verified index reply); "gossip" = another member's view, aged; "known" =
     an endpoint persisted from an earlier verified contact, or the invitation
     seed. Weaker evidence never replaces a recently verified endpoint. */
  function remember(p,how="direct"){
    if(!validPeer(p))return;
    const now=Date.now(),old=peers.get(p.id),age=Number.isSafeInteger(p.age)&&p.age>=0?Math.min(p.age,30*60000):60000;
    const seen=how==="direct"?now:how==="gossip"?now-age:0;
    if(old&&how!=="direct"&&(old.seen>=seen||(now-old.seen<FRESH&&(old.ip!==p.ip||old.port!==p.port))))return;
    const label=typeof p.label==="string"&&p.label?p.label.slice(0,80):old&&old.label;
    peers.set(p.id,{id:p.id,ip:plainIp(p.ip),port:p.port,seen,label,known:!!(old&&old.known)||how!=="gossip"});
    while(peers.size>32){let drop=null;for(const q of peers.values())if(!drop||q.seen<drop.seen)drop=q;peers.delete(drop.id);}
  }
  function persistEndpoint(id,label){
    const p=peers.get(id);if(!cfg||!p||!validPeer(p))return;
    const endpoints=cfg.endpoints&&typeof cfg.endpoints==="object"?cfg.endpoints:{},old=endpoints[id],name=String(label||p.label||(old&&old.label)||"").slice(0,80);
    if(old&&old.ip===p.ip&&old.port===p.port&&(old.label||"")===name)return;
    const next={...endpoints,[id]:{ip:p.ip,port:p.port,label:name,at:Date.now()}};
    const ids=Object.keys(next).sort((a,b)=>(next[b].at||0)-(next[a].at||0)).slice(0,32);
    try{save({...cfg,endpoints:Object.fromEntries(ids.map(k=>[k,next[k]]))});}catch(_){/* Best effort; discovery still works. */}
  }
  function restoreEndpoints(){
    if(!cfg)return;
    const endpoints=cfg.endpoints&&typeof cfg.endpoints==="object"?cfg.endpoints:{};
    for(const [id,e] of Object.entries(endpoints))if(e)remember({id,ip:e.ip,port:e.port,label:e.label},"known");
    // The invitation address is only a first hint; never over a discovered endpoint.
    if(cfg.seed&&!peers.has(cfg.seed.id))remember(cfg.seed,"known");
  }
  function candidates(){
    const now=Date.now();
    return [...peers.values()].filter(p=>now-p.seen<FRESH||p.known).map(p=>({id:p.id,ip:p.ip,port:p.port,seen:p.seen,label:p.label,inboundAt:inbound.get(p.id)||0}));
  }
  function signedPacket(type,nonce){const body=[type,digest(cfg.key).slice(0,24),cfg.device,nonce,Date.now(),port].join("|");return body+"|"+mac(cfg.key,body);}
  function sameStoryExtension(a,b){
    const x=a&&a.index,y=b&&b.index;
    return !!(x&&y&&a.revision===b.revision&&x.hash===y.hash&&x.bytes===y.bytes&&Array.isArray(x.parts)&&Array.isArray(y.parts)&&x.parts.length===y.parts.length&&x.parts.every((part,i)=>part===y.parts[i]));
  }
  function wakePeers(){
    if(!active()||!udp)return;
    const packet=Buffer.from(signedPacket("RCVSYNC1~",crypto.randomBytes(16).toString("hex")));
    const targets=new Set([...peers.values()].filter(p=>Date.now()-p.seen<5*60000).map(p=>p.ip));
    // A sleeping peer may have changed IP since its last index exchange.
    targets.add("255.255.255.255");
    for(const address of localBroadcasts())targets.add(address);
    for(const target of targets)try{udp.send(packet,network.discoveryPort||DISCOVERY,target);}catch(_){}
  }
  function discovery(body,remote){
    if(!active()||!allowed(remote.address)||body.length>512)return;
    const p=body.toString().split("|");if(p.length!==7||!["RCVSYNC1?","RCVSYNC1!","RCVSYNC1~"].includes(p[0])||p[1]!==digest(cfg.key).slice(0,24)||p[2]===cfg.device||!/^[a-f0-9-]{36}$/.test(p[2])||!Number.isSafeInteger(Number(p[4]))||Math.abs(Date.now()-Number(p[4]))>120000||!Number.isInteger(Number(p[5]))||Number(p[5])<1024||Number(p[5])>65535||!equal(p[6],mac(cfg.key,p.slice(0,6).join("|"))))return;
    remember({id:p[2],ip:remote.address,port:Number(p[5])},"direct");
    if(p[0]==="RCVSYNC1?")udp.send(Buffer.from(signedPacket("RCVSYNC1!",p[3])),remote.port,remote.address);
    if(p[0]==="RCVSYNC1~"&&/^[a-f0-9]{32}$/.test(p[3])){
      const nonce=p[2]+":"+p[3],now=Date.now();if(wakeNonces.has(nonce))return;
      for(const [key,at]of wakeNonces)if(now-at>120000)wakeNonces.delete(key);
      if(wakeNonces.size>=4096)return;
      wakeNonces.set(nonce,now);
      if(typeof network.onWake==="function")try{network.onWake(p[2]);}catch(_){}
    }
  }
  async function resume(){
    guard();if(!load())throw Error("Choose or join a sync group first");lease=Date.now()+20000;
    const next=localAddresses()[0];if(!next)throw Error("Waiting for a private local network");
    // The listener covers every adapter, so a changed Wi-Fi address only changes
    // what this device advertises. Rebinding used to drop every known peer.
    if(server){ip=next;return info();}lease=Date.now()+20000;if(starting)return starting;
    const run=epoch;
    starting=new Promise((resolve,reject)=>{
      const s=http.createServer(async(req,res)=>{
        const refuse=(status,reason)=>{if(!res.headersSent)res.writeHead(status,{"X-RCV-Reason":reason,"X-RCV-Time":String(Date.now()),"Cache-Control":"no-store"});res.end();};
        if(!allowed(req.socket.remoteAddress)||!allowed(req.socket.localAddress)||req.method!=="POST"||req.url!=="/sync"){refuse(404,"invalid");return;}
        if(!active()){refuse(423,"paused");return;}
        let stage="auth";
        try{
          let size=0,parts=[];for await(const piece of req){size+=piece.length;if(size>MAX)throw Error("Packet too large");parts.push(piece);}
          if(!active())throw Error("Sync paused");
          const request=JSON.parse(unseal(Buffer.concat(parts).toString(),cfg.key,"request"));stage="expired";
          if(!/^[a-f0-9]{32}$/.test(request.nonce)||!Number.isSafeInteger(request.at)||Math.abs(Date.now()-request.at)>120000||nonces.has(request.nonce))throw Error("Expired sync request");
          stage="busy";nonces.set(request.nonce,Date.now());for(const [nonce,at]of nonces)if(Date.now()-at>120000)nonces.delete(nonce);if(nonces.size>4096)throw Error("Too many requests");
          // Only a fresh, authenticated request is evidence of the sender's endpoint.
          if(validPeer({id:request.device,ip:req.socket.remoteAddress,port:request.port})){remember({id:request.device,ip:req.socket.remoteAddress,port:request.port},"direct");inbound.set(request.device,Date.now());persistEndpoint(request.device);}
          let result;
          if(request.action==="index"){
            try{acceptPrimary(request,run);}
            catch(e){if(e.message!==PRIMARY_UPDATE)throw e;result={device:cfg.device,primarySelection:1,error:"PRIMARY_SELECTION_UPDATE_REQUIRED"};}
            if(!result){
              const now=Date.now(),gossip=[...peers.values()].filter(p=>p.seen>0&&now-p.seen<30*60000&&p.id!==request.device).map(p=>({id:p.id,ip:p.ip,port:p.port,age:now-p.seen,label:p.label}));
              // Tell the caller when we recently failed to reach it, so a
              // one-way firewall is reported on the device that can fix it.
              const cannotReach=[...outFail].filter(([,at])=>now-at<REACH_WINDOW).map(([id])=>id).slice(0,32);
              result={head:fs.existsSync(rootFile)?JSON.parse(unseal(fs.readFileSync(rootFile,"utf8"),cfg.key,"head")):null,device:cfg.device,label:cfg.label,peers:gossip,cannotReach,chunkBatch:CHUNK_BATCH,primarySelection:1,primaryPreference:primaryPreference(cfg.primaryPreference)};
            }
          }
          else if(request.action==="chunks"&&validHashes(request.hashes)){
            const chunks=request.hashes.map(hash=>({hash,packet:serveChunk(hash)}));
            if(!active())throw Error("Sync paused");
            const reply=sealChunkBatch(JSON.stringify({device:cfg.device,chunks}),cfg.key,request.nonce);
            res.writeHead(200,{"Content-Type":"text/plain","Cache-Control":"no-store"});res.end(reply);return;
          }
          else if(request.action==="chunk"&&/^[a-f0-9]{64}$/.test(request.hash)){
            const file=path.join(chunksDir,request.hash),packet=fs.readFileSync(file,"utf8");
            try{if(digest(unseal(packet,cfg.key,"blob:"+request.hash))!==request.hash)throw Error("Checksum failed");}
            catch(e){fs.unlinkSync(file);throw Error("Cached chunk damaged; rebuilding from the vault");}
            result={packet};
          }
          else if(credentials&&request.action==="credential-info")result={device:cfg.device,label:cfg.label,offer:credentials.metadata()};
          else if(credentials&&request.action==="credential-pull")result={device:cfg.device,credential:credentials.pull(request.hash)};
          else throw Error("Unknown sync operation");
          if(!active())throw Error("Sync paused");res.writeHead(200,{"Content-Type":"text/plain","Cache-Control":"no-store"});res.end(seal(JSON.stringify({nonce:request.nonce,result}),cfg.key,"response"));
        }catch(e){refuse(409,active()?stage:"paused");}
      });
      s.requestTimeout=15000;s.headersTimeout=10000;s.maxConnections=12;
      s.on("connection",socket=>{connections.add(socket);socket.on("close",()=>connections.delete(socket));socket.setTimeout(20000,()=>socket.destroy());});
      /* Keep one port for the life of the pairing. Peers remember this endpoint;
         a new random port after every lock, app switch or restart made them
         unreachable until UDP discovery (often blocked) found it again. */
      const host=network.host||"0.0.0.0",wanted=network.port||(cfg&&Number.isInteger(cfg.listenPort)?cfg.listenPort:0);let retried=false;
      s.on("error",error=>{if(server===s)return;if(!retried&&wanted&&!network.port&&["EADDRINUSE","EACCES","EADDRNOTAVAIL"].includes(error.code)){retried=true;s.listen(0,host);return;}reject(error);});
      s.listen(wanted,host);
      s.once("listening",()=>{
        if(run!==epoch){s.close();reject(Error("Sync paused"));return;}
        server=s;ip=next;port=s.address().port;
        if(!network.port&&cfg&&cfg.listenPort!==port)try{save({...cfg,listenPort:port});}catch(_){}
        restoreEndpoints();
        const u=dgram.createSocket({type:"udp4",reuseAddr:true});udp=u;u.on("error",()=>{});u.on("message",discovery);
        u.bind(network.discoveryPort||DISCOVERY,()=>{try{u.setBroadcast(true);}catch(e){};resolve(info());});
        /* A blocked discovery port must not make the configured peer unusable. */
        setTimeout(()=>resolve(info()),1000).unref();
      });
    }).finally(()=>{starting=null;});return starting;
  }
  function request(peer,action,hash,hashes){
    guard();if(!active()||!allowed(peer.ip))return Promise.reject(Error("Sync is paused"));const run=epoch,nonce=crypto.randomBytes(16).toString("hex");
    const body=seal(JSON.stringify({nonce,at:Date.now(),action,hash,hashes,device:cfg.device,port,...(action==="index"?{primarySelection:1,primaryPreference:primaryPreference(cfg.primaryPreference)}:{})}),cfg.key,"request");
    const failed=error=>{if(run===epoch)outFail.set(peer.id,Date.now());return error;};
    return new Promise((resolve,reject)=>{
      const req=http.request({host:peer.ip,port:peer.port,localAddress:sourceFor(peer.ip),agent:false,path:"/sync",method:"POST",headers:{"Content-Type":"text/plain","Content-Length":Buffer.byteLength(body)},timeout:12000},res=>{
        const pieces=[];let size=0;res.on("data",p=>{size+=p.length;if(size>MAX){req.destroy(Error("Sync reply too large"));return;}pieces.push(p);});
        res.on("end",()=>{try{guard();if(run!==epoch||!active())throw Error("Sync paused");if(res.statusCode!==200){outFail.delete(peer.id);throw refusal(res);}const packet=Buffer.concat(pieces).toString();let result;if(action==="chunks")result=JSON.parse(unsealChunkBatch(packet,cfg.key,nonce));else{const r=JSON.parse(unseal(packet,cfg.key,"response"));if(r.nonce!==nonce)throw Error("Invalid sync response");result=r.result;}outFail.delete(peer.id);resolve(result);}catch(e){reject(e);}});
        res.on("error",reject);
      });
      let connectTimer=null;
      req.on("socket",s=>{if(!connections.has(s)){connections.add(s);s.once("close",()=>connections.delete(s));}
        // An absent device otherwise holds the whole pass for the OS connect timeout.
        if(s.connecting){connectTimer=setTimeout(()=>req.destroy(Object.assign(Error("connect timeout"),{code:"ETIMEDOUT"})),network.connectTimeout||3000);s.once("connect",()=>clearTimeout(connectTimer));}});
      req.on("timeout",()=>req.destroy(Object.assign(Error("reply timeout"),{code:"ETIMEDOUT"})));
      req.on("error",error=>{clearTimeout(connectTimer);reject(error&&error.code?failed(networkError(error)):error);});req.on("close",()=>clearTimeout(connectTimer));req.end(body);
    });
  }
  function sourceFor(target){
    if(network.addresses)return ip||undefined;
    const t=String(target).split(".").map(Number);
    const row=interfaceRows().find(r=>{const a=r.address.split(".").map(Number),m=String(r.netmask).split(".").map(Number);return m.length===4&&a.every((n,i)=>(n&m[i])===(t[i]&m[i]));});
    // Outside every local subnet: let the operating system choose the route.
    return row?row.address:undefined;
  }
  function refusal(res){
    const reason=String(res.headers["x-rcv-reason"]||""),stamp=Number(res.headers["x-rcv-time"]);
    if(Number.isFinite(stamp)&&Math.abs(Date.now()-stamp)>90000){const minutes=Math.max(2,Math.round(Math.abs(Date.now()-stamp)/60000));return Object.assign(Error("The clocks on these devices differ by about "+minutes+" minutes. Turn on automatic date and time on both devices."),{code:"RCV_CLOCK"});}
    if(res.statusCode===423||reason==="paused")return Object.assign(Error("Paired device is locked or in the background. Open and unlock Rolecraft on it."),{code:"RCV_PAUSED"});
    if(reason==="auth")return Object.assign(Error("Paired device did not accept this group's key. If it was re-paired, leave the group there and pair it again."),{code:"RCV_AUTH"});
    return Object.assign(Error("Peer is busy or declined this request. Retrying automatically."),{code:"RCV_BUSY"});
  }
  function networkError(error){
    if(error.code==="ECONNREFUSED")return Object.assign(Error("Device found, but Rolecraft is not accepting connections on it. Open and unlock Rolecraft there."),{code:"RCV_REFUSED"});
    if(["ETIMEDOUT","EHOSTUNREACH","ENETUNREACH","EHOSTDOWN","EADDRNOTAVAIL"].includes(error.code))return Object.assign(Error("Peer is offline or on another network. Changes remain on this device."),{code:"RCV_OFFLINE"});
    if(error.code==="ECONNRESET"||error.code==="EPIPE")return Object.assign(Error("Connection was interrupted. Retrying automatically."),{code:"RCV_RESET"});
    return error;
  }
  async function call(method,args={}){
    if(method==="pause"){stopEnrollment();pause();return {paused:true};}
    if(method==="keyStop"){keyEpoch++;if(credentials)credentials.stop();return {ok:true};}
    const keyRun=keyEpoch;
    guard();
    if(method==="keyStatus"){if(!credentials)throw Error("Key sharing needs an updated Chat app.");return credentials.status();}
    if(method==="status"){load();if(server&&cfg)lease=Date.now()+20000;return info();}
    if(method==="upgradeNamespace"){
      load();if(!cfg||cfg.namespace!==args.from||args.to!=="library1")throw Error("Incompatible group upgrade");
      pause();if(fs.existsSync(rootFile))fs.unlinkSync(rootFile);save({...cfg,namespace:args.to});return info();
    }
    if(method==="joinRequest")return joinRequest(args);
    if(method==="configure"){
      if(args.action==="accept-request"){
        if(!enrollment||!enrollment.received||enrollment.expires<Date.now())throw Error("No current pairing offer. Show a new QR and scan again.");
        args={action:"join",code:enrollment.received.code,namespace:enrollment.namespace,label:enrollment.label};
      }
      stopEnrollment();
      pause();
      if(args.action==="leave"){if(fs.existsSync(cfgFile))fs.unlinkSync(cfgFile);cfg=null;return info();}
      let next;
      if(args.action==="create")next={key:crypto.randomBytes(32).toString("hex"),device:crypto.randomUUID(),label:String(args.label||os.hostname()).slice(0,80),namespace:args.namespace||"library1"};
      else if(args.action==="join"){
        let invite;try{invite=JSON.parse(Buffer.from(String(args.code).replace(/^RCVSYNC1\./,""),"base64url").toString());}catch(e){throw Error("Invalid pairing code");}
        if(!String(args.code).startsWith("RCVSYNC1.")||!invite||!/^[a-f0-9]{64}$/.test(invite.key)||!/^[a-f0-9-]{36}$/.test(invite.primary)||invite.namespace!==(args.namespace||"library1")||!Number.isSafeInteger(invite.expires)||Date.now()>invite.expires||invite.expires>Date.now()+15*60000||!allowed(invite.ip)||!Number.isInteger(invite.port)||invite.port<1024||invite.port>65535)throw Error("Pairing code is expired or belongs to a different edition");
        next={key:invite.key,primary:invite.primary,device:crypto.randomUUID(),label:String(args.label||os.hostname()).slice(0,80),namespace:invite.namespace,seed:{id:invite.device,ip:invite.ip,port:invite.port}};
        const preference=primaryPreference(invite.primaryPreference);if(preference)next.primaryPreference=preference;
      }else throw Error("Unknown sync setup action");
      if(!next.primary)next.primary=next.device;
      if(fs.existsSync(rootFile))fs.unlinkSync(rootFile);save(next);await resume();restoreEndpoints();return info();
    }
    if(method==="setPrimary"){
      load();if(!cfg)throw Error("Choose or join a sync group first");
      if(args.device!=null&&args.device!==cfg.device)throw Error("Choose Make this device primary on the device you want to use.");
      const prior=primaryPreference(cfg.primaryPreference),sequence=(prior?prior.sequence:0)+1;
      if(!Number.isSafeInteger(sequence))throw Error("Primary selection counter is exhausted");
      save({...cfg,primaryPreference:primaryPreference({format:1,device:cfg.device,author:cfg.device,sequence,label:cfg.label||"Paired device"})});return info();
    }
    await resume();guard();
    // Manual refresh leaves this unlocked peer reachable without initiating a
    // discovery, download or reconciliation pass on its behalf.
    if(method==="serve")return info();
    if(method.startsWith("key")&&keyRun!==keyEpoch)throw Error("Key sharing stopped.");
    if(method==="keyShare"){if(!credentials)throw Error("Key sharing needs an updated Chat app.");return {offer:credentials.share(args.provider)};}
    if(method==="keyInfo"||method==="keyImport"){
      if(!credentials)throw Error("Key sharing needs an updated Chat app.");
      const peer=peers.get(args.peer);if(!peer)throw Error("Open and unlock the paired device on this network first.");
      if(method==="keyImport"&&(!/^[a-f0-9]{32}$/.test(args.id)||!["openrouter","openai","xai"].includes(args.provider)))throw Error("Refresh the shared keys first.");
      const result=await request(peer,method==="keyInfo"?"credential-info":"credential-pull",args.id);
      if(keyRun!==keyEpoch)throw Error("Key sharing stopped.");
      guard();if(result.device!==peer.id)throw Error("Peer identity changed.");
      if(method==="keyInfo")return {device:result.device,label:String(result.label||"Paired device").slice(0,80),offer:result.offer&&/^[a-f0-9]{32}$/.test(result.offer.id)&&["openrouter","openai","xai"].includes(result.offer.provider)?{id:result.offer.id,provider:result.offer.provider,expires:result.offer.expires}:null};
      return credentials.receive(result.credential,{id:args.id,provider:args.provider});
    }
    if(method==="offerJoin")return offerJoin(args.code);
    if(method==="invite"){return {code:"RCVSYNC1."+Buffer.from(JSON.stringify({key:cfg.key,primary:cfg.primary,device:cfg.device,namespace:cfg.namespace,ip,port,expires:Date.now()+10*60000,primaryPreference:primaryPreference(cfg.primaryPreference)})).toString("base64url")};}
    if(method==="discover"){
      restoreEndpoints();
      if(udp){const data=Buffer.from(signedPacket("RCVSYNC1?",crypto.randomBytes(8).toString("hex")));for(const target of new Set(["255.255.255.255",...localBroadcasts()]))try{udp.send(data,network.discoveryPort||DISCOVERY,target);}catch(e){}}
      if(args.waitMs!==0)await new Promise(r=>setTimeout(r,750));return {peers:candidates()};
    }
    if(method==="diagnose"){
      const now=Date.now();
      return {...info(),address:ip,port,host:network.host||"0.0.0.0",adapters:network.addresses?localAddresses().map(address=>({name:"test",address})):interfaceRows(),discovery:!!udp,
        peers:[...peers.values()].map(p=>({id:p.id,label:p.label||"",ip:p.ip,port:p.port,lastSeen:p.seen||0,inboundAt:inbound.get(p.id)||0,failedAt:outFail.get(p.id)||0,fresh:now-p.seen<FRESH})),
        networkProfile:await windowsNetworkProfile(ip)};
    }
    if(method==="put")return {hash:putText(args.text)};
    if(method==="putBatch"){
      if(!Array.isArray(args.texts)||!args.texts.length||args.texts.length>CHUNK_BATCH||args.texts.some(text=>typeof text!=="string"||Buffer.byteLength(text)>CHUNK))throw Error("Invalid sync chunk batch");
      return {hashes:args.texts.map(putText)};
    }
    if(method==="missingChunks"){
      if(!Array.isArray(args.hashes)||args.hashes.length>1024||args.hashes.some(h=>typeof h!=="string"||!/^[a-f0-9]{64}$/.test(h)))throw Error("Invalid chunk references");
      const run=epoch,missing=[];
      for(let i=0;i<args.hashes.length;i++){
        if(i%64===63)await new Promise(resolve=>setImmediate(resolve));
        guard();if(run!==epoch||!active())throw Error("Sync paused");
        if(!fs.existsSync(path.join(chunksDir,args.hashes[i])))missing.push(args.hashes[i]);
      }
      return {missing};
    }
    if(method==="beginPublish"){retained=new Set();return {};}
    if(method==="retain"){if(!Array.isArray(args.hashes)||args.hashes.length>1024||args.hashes.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw Error("Invalid chunk references");for(const h of args.hashes)retained.add(h);return {};}
    if(method==="publish"){
      if(!args.head||JSON.stringify(args.head).length>MAX/2)throw Error("Invalid index header");
      for(const h of retained)if(!fs.existsSync(path.join(chunksDir,h)))throw Error("A referenced sync chunk is missing");
      let oldStory=null;try{const old=JSON.parse(unseal(fs.readFileSync(rootFile,"utf8"),cfg.key,"head"));oldStory=old.extensions&&old.extensions.stories1;}catch(_){}
      atomic(rootFile,seal(JSON.stringify(args.head),cfg.key,"head"));
      const newStory=args.head.extensions&&args.head.extensions.stories1;
      if(newStory&&!sameStoryExtension(oldStory,newStory))try{wakePeers();}catch(_){}
      if(fs.existsSync(chunksDir))for(const name of fs.readdirSync(chunksDir)){const file=path.join(chunksDir,name);if(/^[a-f0-9]{64}$/.test(name)&&!retained.has(name)&&Date.now()-fs.statSync(file).mtimeMs>86400000)fs.unlinkSync(file);}return {};
    }
    if(method==="publishStoryExtension"){
      const extension=args.extension,descriptor=extension&&extension.index;
      if(!extension||typeof extension.revision!=="string"||!/^[a-f0-9]{64}$/.test(extension.revision)||!descriptor||!/^[a-f0-9]{64}$/.test(descriptor.hash)||!Array.isArray(descriptor.parts)||!descriptor.parts.length||descriptor.parts.length>4096||descriptor.parts.some(h=>typeof h!=="string"||!/^[a-f0-9]{64}$/.test(h))||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||descriptor.bytes>64*1024*1024)throw Error("Invalid story sync index");
      if(typeof args.expectedLibraryRevision!=="string"||!/^[a-f0-9]{64}$/.test(args.expectedLibraryRevision)||typeof args.established!=="boolean")throw Error("Invalid story sync base");
      let previous;try{previous=JSON.parse(unseal(fs.readFileSync(rootFile,"utf8"),cfg.key,"head"));}catch(_){return {published:false};}
      if(!previous||previous.format!==1||previous.revision!==args.expectedLibraryRevision||previous.established!==args.established||!previous.index||!previous.extensions||typeof previous.extensions!=="object")return {published:false};
      const h=crypto.createHash("sha256");let size=0,body="";
      for(const part of descriptor.parts){let text;try{text=readChunk(part).text;}catch(_){return {published:false};}size+=Buffer.byteLength(text);if(size>descriptor.bytes)return {published:false};h.update(text);body+=text;}
      if(size!==descriptor.bytes||h.digest("hex")!==descriptor.hash)return {published:false};
      let manifest;try{manifest=JSON.parse(body);}catch(_){return {published:false};}
      if(manifest.format===2){
        if(!manifest.records||typeof manifest.records!=="object"||Array.isArray(manifest.records)||Object.keys(manifest.records).length>10000)return {published:false};
        for(const [key,record] of Object.entries(manifest.records)){
          let identity;try{identity=JSON.parse(key);}catch(_){return {published:false};}
          if(!Array.isArray(identity)||identity.length!==2||identity[0]!=="conversation"||!record||typeof record.hash!=="string"||!/^[a-f0-9]{64}$/.test(record.hash)||!Number.isSafeInteger(record.bytes)||record.bytes<0||record.bytes>64*1024*1024||!Array.isArray(record.parts)||record.parts.length>4096||record.parts.some(part=>typeof part!=="string"||!/^[a-f0-9]{64}$/.test(part)||!fs.existsSync(path.join(chunksDir,part))))return {published:false};
        }
      }else if(manifest.format!==1)return {published:false};
      const nextStory={index:{hash:descriptor.hash,parts:descriptor.parts,bytes:descriptor.bytes},revision:extension.revision};
      const next={...previous,extensions:{...previous.extensions,stories1:nextStory}};
      if(sameStoryExtension(previous.extensions.stories1,nextStory))return {published:true,libraryRevision:previous.revision,changed:false};
      atomic(rootFile,seal(JSON.stringify(next),cfg.key,"head"));
      try{wakePeers();}catch(_){}
      return {published:true,libraryRevision:previous.revision,changed:true};
    }
    if(method==="chunks"){
      if(!validHashes(args.hashes))throw Error("Invalid chunk identities");
      const run=epoch,texts=new Array(args.hashes.length),missing=[],positions=[];
      args.hashes.forEach((hash,i)=>{try{texts[i]=readChunk(hash).text;}catch(_){missing.push(hash);positions.push(i);}});
      if(!missing.length)return {texts};
      const peer=peers.get(args.peer);if(!peer)throw Error("Waiting for the paired device on this network");
      if(!batchPeers.has(peer.id)){
        for(let i=0;i<missing.length;i++){
          const reply=await call("chunk",{peer:peer.id,hash:missing[i]});guard();if(run!==epoch||!active())throw Error("Sync paused");texts[positions[i]]=reply.text;
        }
        return {texts};
      }
      const reply=await request(peer,"chunks",undefined,missing);
      guard();if(run!==epoch||!active())throw Error("Sync paused");
      if(!reply||reply.device!==peer.id||!Array.isArray(reply.chunks)||reply.chunks.length!==missing.length)throw Error("Invalid sync chunk batch");
      const verified=reply.chunks.map((item,i)=>{
        if(!item||item.hash!==missing[i])throw Error("Invalid sync chunk order");
        const text=unseal(item.packet,cfg.key,"blob:"+item.hash);if(digest(text)!==item.hash||Buffer.byteLength(text)>CHUNK)throw Error("Sync chunk checksum failed");return text;
      });
      /* Validate the whole response before any packet enters the local cache. */
      for(let i=0;i<missing.length;i++){atomic(path.join(chunksDir,missing[i]),reply.chunks[i].packet);texts[positions[i]]=verified[i];}
      return {texts};
    }
    if(method==="index"||method==="chunk"){
      if(method==="chunk"&&/^[a-f0-9]{64}$/.test(args.hash)){
        const file=path.join(chunksDir,args.hash);
        if(fs.existsSync(file))try{const text=unseal(fs.readFileSync(file,"utf8"),cfg.key,"blob:"+args.hash);if(digest(text)===args.hash&&Buffer.byteLength(text)<=CHUNK)return {text};}catch(e){/* Retry from the authenticated peer. */}
      }
      const peer=peers.get(args.peer);if(!peer)throw Error("Waiting for the paired device on this network");
      if(method==="chunk"&&!/^[a-f0-9]{64}$/.test(args.hash))throw Error("Invalid chunk identity");
      const run=epoch,result=await request(peer,method,args.hash);
      if(method==="index"){
        if(result.device!==peer.id)throw Error("Peer identity changed");if(result.error==="PRIMARY_SELECTION_UPDATE_REQUIRED")throw Error(PRIMARY_UPDATE);acceptPrimary(result,run);if(result.chunkBatch===CHUNK_BATCH)batchPeers.add(peer.id);else batchPeers.delete(peer.id);
        remember({id:peer.id,ip:peer.ip,port:peer.port,label:typeof result.label==="string"?result.label:undefined},"direct");persistEndpoint(peer.id,result.label);
        for(const p of Array.isArray(result.peers)?result.peers.slice(0,32):[])if(p&&p.id!==cfg.device)remember(p,"gossip");
        return {...result,cannotReachMe:Array.isArray(result.cannotReach)&&result.cannotReach.includes(cfg.device)};
      }
      const text=unseal(result.packet,cfg.key,"blob:"+args.hash);if(digest(text)!==args.hash||Buffer.byteLength(text)>CHUNK)throw Error("Sync chunk checksum failed");atomic(path.join(chunksDir,args.hash),result.packet);return {text};
    }
    throw Error("Unknown sync method");
  }
  return {call,pause:()=>{stopEnrollment();pause();},privateIp,info};
}
function setupVaultSync({ipcMain,app,safeStorage,isLocked,getWindow}){
  const credentials=require("./package.json").name==="rolecraft-vault-chat"?require("./credential-share").createCredentialShare({directory:app.getPath("userData"),safeStorage,unlocked:()=>!isLocked()}):null;
  const t=createTransport({directory:path.join(app.getPath("userData"),"vault-sync"),credentials,unlocked:()=>!isLocked(),network:{onWake:deviceId=>{const w=getWindow();if(w&&!w.isDestroyed())w.webContents.send("vault-sync-wake",{deviceId});}},protect:text=>{if(!safeStorage.isEncryptionAvailable())throw Error("Windows secure storage is unavailable");return safeStorage.encryptString(text);},unprotect:bytes=>safeStorage.decryptString(bytes)});
  ipcMain.handle("vault-sync",async(_e,method,args)=>{const r=await t.call(method,args);const w=getWindow();if(method!=="status"&&w&&!w.isDestroyed())w.webContents.setBackgroundThrottling(!t.info().enabled||method==="pause");return r;});
  app.on("before-quit",t.pause);return t;
}
module.exports={createTransport,setupVaultSync,privateIp,seal,unseal,digest,sealChunkBatch,unsealChunkBatch,interfaceRows,broadcastOf};
