"use strict";
/* Privileged, explicitly paired LAN-only immutable chunk server. It never
   writes vault records. Peers pull; the unlocked local UI owns reconciliation. */
const fs=require("fs"),path=require("path"),os=require("os"),http=require("http"),dgram=require("dgram"),crypto=require("crypto"),zlib=require("zlib");
const DISCOVERY=44218, MAX=2*1024*1024, CHUNK=256*1024;
const digest=b=>crypto.createHash("sha256").update(b).digest("hex");
function privateIp(ip) {return typeof ip==="string" && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) && ip.split(".").length===4 && ip.split(".").every(n=>/^\d{1,3}$/.test(n)&&+n<256);}
function addresses(){return Object.entries(os.networkInterfaces()).sort(([a],[b])=>Number(/virtual|vethernet|vpn|wsl|tailscale|zerotier/i.test(a))-Number(/virtual|vethernet|vpn|wsl|tailscale|zerotier/i.test(b))).flatMap(([,rows])=>rows||[]).filter(n=>n&&n.family==="IPv4"&&!n.internal&&privateIp(n.address)).map(n=>n.address);}
function seal(text,key,aad){const iv=crypto.randomBytes(12),c=crypto.createCipheriv("aes-256-gcm",Buffer.from(key,"hex"),iv);c.setAAD(Buffer.from("RCVSYNC1:"+aad));return Buffer.concat([iv,c.update(zlib.gzipSync(Buffer.from(text))),c.final(),c.getAuthTag()]).toString("base64");}
function unseal(text,key,aad){if(typeof text!=="string"||text.length>MAX||!text.match(/^[A-Za-z0-9+/=]+$/))throw Error("Invalid sync packet");const b=Buffer.from(text,"base64");if(b.length<29)throw Error("Invalid sync packet");const c=crypto.createDecipheriv("aes-256-gcm",Buffer.from(key,"hex"),b.subarray(0,12));c.setAAD(Buffer.from("RCVSYNC1:"+aad));c.setAuthTag(b.subarray(-16));return zlib.gunzipSync(Buffer.concat([c.update(b.subarray(12,-16)),c.final()]),{maxOutputLength:MAX}).toString("utf8");}
function mac(key,text){return crypto.createHmac("sha256",Buffer.from(key,"hex")).update(text).digest("hex");}
function equal(a,b){return typeof a==="string"&&typeof b==="string"&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function createTransport({directory,protect,unprotect,unlocked,network={}}){
  const allowed=network.privateIp||privateIp, localAddresses=network.addresses||addresses;
  const cfgFile=path.join(directory,"pairing.bin"),chunksDir=path.join(directory,"chunks"),rootFile=path.join(directory,"head.bin");
  let cfg=null,server=null,udp=null,ip=null,port=0,lease=0,epoch=0,starting=null,retained=new Set();
  const peers=new Map(),nonces=new Map(),connections=new Set();
  let enrollment=null,enrollServer=null;
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
    return new Promise((resolve,reject)=>{const req=http.request({host:target.ip,port:target.port,localAddress:ip,path:"/pair",method:"POST",headers:{"Content-Type":"text/plain","Content-Length":Buffer.byteLength(body)},timeout:10000},res=>{
      let text="";res.on("data",piece=>{text+=piece;if(text.length>16384)req.destroy(Error("Invalid pairing reply"));});res.on("error",reject);res.on("end",()=>{try{guard();if(run!==epoch||res.statusCode!==200)throw Error("Pairing was cancelled or another offer is waiting");const reply=JSON.parse(unseal(text,target.key,"pair-reply"));if(!reply.ok||reply.request!==target.id)throw Error("Invalid pairing reply");resolve({ok:true});}catch(e){reject(e);}});
    });req.on("socket",socket=>{connections.add(socket);socket.on("close",()=>connections.delete(socket));});req.on("timeout",()=>req.destroy(Error("Device is unavailable. Keep its pairing QR open and try again.")));req.on("error",reject);req.end(body);});
  }
  function guard(){if(!unlocked())throw Error("Unlock the vault to sync");}
  function active(){return unlocked()&&Date.now()<lease&&cfg;}
  function atomic(file,bytes){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+".tmp";fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,file);}
  function load(){guard();if(!cfg&&fs.existsSync(cfgFile))cfg=JSON.parse(unprotect(fs.readFileSync(cfgFile)));if(cfg&&(!/^[a-f0-9]{64}$/.test(cfg.key)||!/^[a-f0-9-]{36}$/.test(cfg.device)))throw Error("Pairing is damaged. Leave the group and pair again.");return cfg;}
  function save(c){guard();atomic(cfgFile,protect(JSON.stringify(c)));cfg=c;}
  function info(){return {enabled:!!cfg,device:cfg&&cfg.device,primary:cfg&&cfg.primary,label:cfg&&cfg.label,group:cfg&&digest(cfg.key).slice(0,24),namespace:cfg&&cfg.namespace,canShowJoinRequest:true,joinRequest:joinInfo()};}
  function pause(){epoch++;lease=0;if(server)server.close();if(udp)udp.close();for(const socket of connections)socket.destroy();connections.clear();server=null;udp=null;starting=null;ip=null;port=0;peers.clear();nonces.clear();retained.clear();}
  function remember(p){if(!cfg||p.id===cfg.device||typeof p.id!=="string"||!/^[a-f0-9-]{36}$/.test(p.id)||!allowed(p.ip)||!Number.isInteger(p.port)||p.port<1024||p.port>65535)return;peers.set(p.id,{id:p.id,ip:p.ip,port:p.port,seen:Date.now()});while(peers.size>32)peers.delete(peers.keys().next().value);}
  function signedPacket(type,nonce){const body=[type,digest(cfg.key).slice(0,24),cfg.device,nonce,Date.now(),port].join("|");return body+"|"+mac(cfg.key,body);}
  function discovery(body,remote){
    if(!active()||!allowed(remote.address)||body.length>512)return;
    const p=body.toString().split("|");if(p.length!==7||p[1]!==digest(cfg.key).slice(0,24)||Math.abs(Date.now()-Number(p[4]))>120000||!equal(p[6],mac(cfg.key,p.slice(0,6).join("|"))))return;
    remember({id:p[2],ip:remote.address,port:Number(p[5])});
    if(p[0]==="RCVSYNC1?")udp.send(Buffer.from(signedPacket("RCVSYNC1!",p[3])),remote.port,remote.address);
  }
  async function resume(){
    guard();if(!load())throw Error("Choose or join a sync group first");lease=Date.now()+20000;
    const next=localAddresses()[0];if(!next)throw Error("Waiting for a private local network");
    if(server&&ip===next)return info();if(server)pause();lease=Date.now()+20000;if(starting)return starting;
    const run=epoch;
    starting=new Promise((resolve,reject)=>{
      const s=http.createServer(async(req,res)=>{
        if(!active()||!allowed(req.socket.remoteAddress)||req.method!=="POST"||req.url!=="/sync"){res.writeHead(423);res.end();return;}
        try{
          let size=0,parts=[];for await(const piece of req){size+=piece.length;if(size>MAX)throw Error("Packet too large");parts.push(piece);}
          if(!active())throw Error("Sync paused");
          const request=JSON.parse(unseal(Buffer.concat(parts).toString(),cfg.key,"request"));
          if(!/^[a-f0-9]{32}$/.test(request.nonce)||!Number.isSafeInteger(request.at)||Math.abs(Date.now()-request.at)>120000||nonces.has(request.nonce))throw Error("Expired sync request");
          remember({id:request.device,ip:req.socket.remoteAddress,port:request.port});nonces.set(request.nonce,Date.now());for(const [nonce,at]of nonces)if(Date.now()-at>120000)nonces.delete(nonce);if(nonces.size>4096)throw Error("Too many requests");
          let result;
          if(request.action==="index")result={head:fs.existsSync(rootFile)?JSON.parse(unseal(fs.readFileSync(rootFile,"utf8"),cfg.key,"head")):null,device:cfg.device,label:cfg.label,peers:[...peers.values()]};
          else if(request.action==="chunk"&&/^[a-f0-9]{64}$/.test(request.hash)){
            const file=path.join(chunksDir,request.hash),packet=fs.readFileSync(file,"utf8");
            try{if(digest(unseal(packet,cfg.key,"blob:"+request.hash))!==request.hash)throw Error("Checksum failed");}
            catch(e){fs.unlinkSync(file);throw Error("Cached chunk damaged; rebuilding from the vault");}
            result={packet};
          }
          else throw Error("Unknown sync operation");
          if(!active())throw Error("Sync paused");res.writeHead(200,{"Content-Type":"text/plain","Cache-Control":"no-store"});res.end(seal(JSON.stringify({nonce:request.nonce,result}),cfg.key,"response"));
        }catch(e){if(!res.headersSent)res.writeHead(409);res.end();}
      });
      s.requestTimeout=15000;s.headersTimeout=10000;s.maxConnections=12;
      s.on("connection",socket=>{connections.add(socket);socket.on("close",()=>connections.delete(socket));socket.setTimeout(20000,()=>socket.destroy());});
      s.once("error",reject);s.listen(network.port||0,next,()=>{
        if(run!==epoch){s.close();reject(Error("Sync paused"));return;}
        server=s;ip=next;port=s.address().port;
        const u=dgram.createSocket({type:"udp4",reuseAddr:true});udp=u;u.on("error",()=>{});u.on("message",discovery);
        u.bind(network.discoveryPort||DISCOVERY,()=>{try{u.setBroadcast(true);}catch(e){};resolve(info());});
        /* A blocked discovery port must not make the configured peer unusable. */
        setTimeout(()=>resolve(info()),1000).unref();
      });
    }).finally(()=>{starting=null;});return starting;
  }
  function request(peer,action,hash){
    guard();if(!active()||!allowed(peer.ip))return Promise.reject(Error("Sync is paused"));const run=epoch,nonce=crypto.randomBytes(16).toString("hex");
    const body=seal(JSON.stringify({nonce,at:Date.now(),action,hash,device:cfg.device,port}),cfg.key,"request");
    return new Promise((resolve,reject)=>{
      const req=http.request({host:peer.ip,port:peer.port,localAddress:ip,path:"/sync",method:"POST",headers:{"Content-Type":"text/plain","Content-Length":Buffer.byteLength(body)},timeout:12000},res=>{
        const pieces=[];let size=0;res.on("data",p=>{size+=p.length;if(size>MAX){req.destroy(Error("Sync reply too large"));return;}pieces.push(p);});
        res.on("end",()=>{try{guard();if(run!==epoch||!active())throw Error("Sync paused");if(res.statusCode!==200)throw Error("Peer is locked, busy or has changed. Retrying automatically.");const r=JSON.parse(unseal(Buffer.concat(pieces).toString(),cfg.key,"response"));if(r.nonce!==nonce)throw Error("Invalid sync response");resolve(r.result);}catch(e){reject(e);}});
        res.on("error",reject);
      });req.on("socket",s=>{if(!connections.has(s)){connections.add(s);s.once("close",()=>connections.delete(s));}});req.on("timeout",()=>req.destroy(Error("Peer is offline. Changes remain on this device.")));req.on("error",reject);req.end(body);
    });
  }
  async function call(method,args={}){
    if(method==="pause"){stopEnrollment();pause();return {paused:true};}
    guard();
    if(method==="status"){load();return info();}
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
      }else throw Error("Unknown sync setup action");
      if(!next.primary)next.primary=next.device;
      if(fs.existsSync(rootFile))fs.unlinkSync(rootFile);save(next);await resume();if(next.seed)remember(next.seed);return info();
    }
    await resume();guard();
    if(method==="offerJoin")return offerJoin(args.code);
    if(method==="invite"){return {code:"RCVSYNC1."+Buffer.from(JSON.stringify({key:cfg.key,primary:cfg.primary,device:cfg.device,namespace:cfg.namespace,ip,port,expires:Date.now()+10*60000})).toString("base64url")};}
    if(method==="discover"){
      if(cfg.seed&&!peers.has(cfg.seed.id))remember(cfg.seed);
      if(udp){const data=Buffer.from(signedPacket("RCVSYNC1?",crypto.randomBytes(8).toString("hex")));for(const target of new Set(["255.255.255.255",...localAddresses().map(a=>a.split(".").slice(0,3).join(".")+".255")]))try{udp.send(data,network.discoveryPort||DISCOVERY,target);}catch(e){}}
      await new Promise(r=>setTimeout(r,750));return {peers:[...peers.values()].filter(p=>Date.now()-p.seen<5*60000)};
    }
    if(method==="put"){
      if(typeof args.text!=="string"||Buffer.byteLength(args.text)>CHUNK)throw Error("Sync chunk too large");const hash=digest(args.text),file=path.join(chunksDir,hash);if(!fs.existsSync(file))atomic(file,seal(args.text,cfg.key,"blob:"+hash));else {try{unseal(fs.readFileSync(file,"utf8"),cfg.key,"blob:"+hash);}catch(e){atomic(file,seal(args.text,cfg.key,"blob:"+hash));}}return {hash};
    }
    if(method==="beginPublish"){retained=new Set();return {};}
    if(method==="retain"){if(!Array.isArray(args.hashes)||args.hashes.length>1024||args.hashes.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw Error("Invalid chunk references");for(const h of args.hashes)retained.add(h);return {};}
    if(method==="publish"){
      if(!args.head||JSON.stringify(args.head).length>MAX/2)throw Error("Invalid index header");
      for(const h of retained)if(!fs.existsSync(path.join(chunksDir,h)))throw Error("A referenced sync chunk is missing");atomic(rootFile,seal(JSON.stringify(args.head),cfg.key,"head"));
      if(fs.existsSync(chunksDir))for(const name of fs.readdirSync(chunksDir)){const file=path.join(chunksDir,name);if(/^[a-f0-9]{64}$/.test(name)&&!retained.has(name)&&Date.now()-fs.statSync(file).mtimeMs>86400000)fs.unlinkSync(file);}return {};
    }
    if(method==="index"||method==="chunk"){
      if(method==="chunk"&&/^[a-f0-9]{64}$/.test(args.hash)){
        const file=path.join(chunksDir,args.hash);
        if(fs.existsSync(file))try{const text=unseal(fs.readFileSync(file,"utf8"),cfg.key,"blob:"+args.hash);if(digest(text)===args.hash&&Buffer.byteLength(text)<=CHUNK)return {text};}catch(e){/* Retry from the authenticated peer. */}
      }
      const peer=peers.get(args.peer);if(!peer)throw Error("Waiting for the paired device on this network");
      if(method==="chunk"&&!/^[a-f0-9]{64}$/.test(args.hash))throw Error("Invalid chunk identity");
      const result=await request(peer,method,args.hash);
      if(method==="index"){if(result.device!==peer.id)throw Error("Peer identity changed");for(const p of result.peers||[])remember(p);return result;}
      const text=unseal(result.packet,cfg.key,"blob:"+args.hash);if(digest(text)!==args.hash||Buffer.byteLength(text)>CHUNK)throw Error("Sync chunk checksum failed");atomic(path.join(chunksDir,args.hash),result.packet);return {text};
    }
    throw Error("Unknown sync method");
  }
  return {call,pause:()=>{stopEnrollment();pause();},privateIp,info};
}
function setupVaultSync({ipcMain,app,safeStorage,isLocked,getWindow}){
  const t=createTransport({directory:path.join(app.getPath("userData"),"vault-sync"),unlocked:()=>!isLocked(),protect:text=>{if(!safeStorage.isEncryptionAvailable())throw Error("Windows secure storage is unavailable");return safeStorage.encryptString(text);},unprotect:bytes=>safeStorage.decryptString(bytes)});
  ipcMain.handle("vault-sync",async(_e,method,args)=>{const r=await t.call(method,args);const w=getWindow();if(method!=="status"&&w&&!w.isDestroyed())w.webContents.setBackgroundThrottling(!t.info().enabled||method==="pause");return r;});
  app.on("before-quit",t.pause);return t;
}
module.exports={createTransport,setupVaultSync,privateIp,seal,unseal,digest};
