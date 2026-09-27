"use strict";
const http = require("http"), dgram = require("dgram"), crypto = require("crypto"), zlib = require("zlib"), fs = require("fs"), path = require("path"), os = require("os");
const LIMIT = 64 * 1024 * 1024, SNAPSHOT_LIMIT = 48 * 1024 * 1024, PORT = 44189, DISCOVERY = 44190;
const privateIp = ip => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip || "") && ip.split(".").length === 4 && ip.split(".").every(n => /^\d{1,3}$/.test(n) && +n < 256);
const digest = text => crypto.createHash("sha256").update(text).digest("hex");
function seal(text, key, direction) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key,"hex"),iv);
  cipher.setAAD(Buffer.from("RCCHAT1:" + direction));
  return Buffer.concat([iv,cipher.update(zlib.gzipSync(Buffer.from(text))),cipher.final(),cipher.getAuthTag()]).toString("base64");
}
function unseal(body, key, direction) {
  if (typeof body !== "string" || body.length > LIMIT || !/^[A-Za-z0-9+/=]+$/.test(body)) throw new Error("Invalid encrypted packet");
  const bytes = Buffer.from(body,"base64");
  if(bytes.length<29) throw new Error("Invalid encrypted packet");
  const cipher=crypto.createDecipheriv("aes-256-gcm",Buffer.from(key,"hex"),bytes.subarray(0,12));
  cipher.setAAD(Buffer.from("RCCHAT1:"+direction)); cipher.setAuthTag(bytes.subarray(-16));
  return zlib.gunzipSync(Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]),{maxOutputLength:LIMIT}).toString("utf8");
}
function addressFrom(interfaces) {
  const candidates=[];
  for(const [name,rows] of Object.entries(interfaces || {})) for(const row of rows || []) {
    if(!(["IPv4",4].includes(row.family)) || row.internal || !privateIp(row.address))continue;
    // A virtual RFC1918 adapter is not necessarily reachable from the phone.
    // Prefer the actual Wi-Fi interface, then a physical wired LAN.
    if(/vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Tailscale|ZeroTier|VPN|TAP|Loopback/i.test(name))continue;
    const rank=/Wi-Fi|WLAN|Wireless|wlan\d*/i.test(name)?0:/Ethernet|^eth\d|^en\d/i.test(name)?1:2;
    candidates.push({address:row.address,rank,name});
  }
  candidates.sort((a,b)=>a.rank-b.rank||a.name.localeCompare(b.name)||a.address.localeCompare(b.address));
  return candidates.length?candidates[0].address:null;
}
function address() { return addressFrom(os.networkInterfaces()); }
function setupChatLink({ipcMain,safeStorage,app,isLocked,getWindow,network={}}) {
  const getAddress=network.address || address, allowedAddress=network.privateIp || privateIp;
  const listenPort=network.port===undefined?PORT:network.port;
  const file=path.join(app.getPath("userData"),"private-chat-link.json");
  let config=null, server=null, udp=null, bound=null, host=null, published=0, lastSeen=0, peerAck="", pending=new Map(), acknowledgments=new Set(), starting=null, generation=0;
  function guard() { if(isLocked()) throw new Error("Unlock the vault to link chats"); }
  function readConfig() {
    guard();
    if(config) return config;
    if(!fs.existsSync(file)) return null;
    if(!safeStorage.isEncryptionAvailable()) throw new Error("Windows secure storage is unavailable");
    config=JSON.parse(safeStorage.decryptString(Buffer.from(fs.readFileSync(file,"utf8"),"base64")));
    if(!config || !/^[a-f0-9]{64}$/.test(config.key)) throw new Error("Saved device pairing is damaged. Unlink and pair again.");
    return config;
  }
  function writeConfig(value) {
    guard(); if(!safeStorage.isEncryptionAvailable()) throw new Error("Windows secure storage is unavailable");
    const temporary=file+".tmp";
    fs.writeFileSync(temporary,safeStorage.encryptString(JSON.stringify(value)).toString("base64")); fs.renameSync(temporary,file); config=value;
  }
  function stop() {
    const window=getWindow && getWindow(); if(window && !window.isDestroyed())window.webContents.setBackgroundThrottling(true);
    generation++; if(server) { server.close(); if(server.closeAllConnections) server.closeAllConnections(); } if(udp) udp.close();
    server=null; udp=null; bound=null; host=null; published=0; pending.clear(); acknowledgments.clear(); peerAck=""; lastSeen=0;
  }
  function ready() { guard(); if(!host || Date.now()-published>20000) throw new Error("Windows Chat is paused or busy"); }
  async function listen() {
    guard(); const cfg=readConfig(); if(!cfg || !cfg.enabled) throw new Error("Chat linking is off");
    const ip=getAddress(); if(!ip || !allowedAddress(ip)) throw new Error("Connect Windows to your private Wi-Fi network");
    if(server && bound===ip) return;
    if(starting) return starting;
    stop(); const run=generation;
    starting=new Promise((resolve,reject)=>{
      const srv=http.createServer((req,res)=>{
        res.setHeader("Cache-Control","no-store");
        if(!allowedAddress(req.socket.remoteAddress) || req.method!=="POST" || req.url!=="/chat-sync" || req.headers.origin) { res.writeHead(403);res.end();return; }
        try { ready(); } catch (_) { res.writeHead(423);res.end();return; }
        const chunks=[]; let size=0;
        req.setTimeout(15000,()=>req.destroy());
        req.on("data",chunk=>{size+=chunk.length;if(size>LIMIT) req.destroy();else chunks.push(chunk);});
        req.on("error",()=>{});
        req.on("end",()=>{
          try {
            ready(); const msg=JSON.parse(unseal(Buffer.concat(chunks).toString("utf8"),cfg.key,"request"));
            if(typeof msg.nonce!=="string" || !/^[a-f0-9-]{20,80}$/.test(msg.nonce) || Math.abs(Date.now()-Number(msg.time))>120000 || typeof msg.client!=="string" || !/^[a-f0-9-]{20,80}$/.test(msg.client)) throw new Error("Invalid sync request");
            const paired=readConfig();
            if(paired.client && paired.client!==msg.client) throw new Error("This link already belongs to another phone. Unlink to pair a different one.");
            if(!paired.client) writeConfig(Object.assign({},paired,{client:msg.client}));
            const hasSnapshot=typeof msg.snapshot==="string";
            if(hasSnapshot && Buffer.byteLength(msg.snapshot)>SNAPSHOT_LIMIT) throw new Error("This one-phone Chat link is too small for the full conversation history. Use Automatic device sync in Settings.");
            const hash=hasSnapshot?digest(msg.snapshot):msg.hash;
            if(typeof hash!=="string" || !/^[a-f0-9]{64}$/.test(hash))throw new Error("Missing sync fingerprint");
            const needSnapshot=!hasSnapshot && !acknowledgments.has(hash) && !pending.has(hash);
            if(hasSnapshot && !acknowledgments.has(hash)) {
              const queued=Array.from(pending.values()).reduce((n,text)=>n+Buffer.byteLength(text),0);
              if(!pending.has(hash) && (pending.size>=8 || queued+Buffer.byteLength(msg.snapshot)>LIMIT)) { res.writeHead(429);res.end();return; }
              pending.set(hash,msg.snapshot);
            }
            lastSeen=Date.now(); peerAck=msg.ack || "";
            const reply={nonce:msg.nonce,snapshot:msg.known===host.hash?null:host.text,hash:host.hash,ack:acknowledgments.has(hash)?hash:"",needSnapshot};
            res.writeHead(200,{"Content-Type":"text/plain"});res.end(seal(JSON.stringify(reply),cfg.key,"response"));
          } catch (_) { if(!res.headersSent)res.writeHead(400);res.end(); }
        });
      });
      srv.maxConnections=4; srv.requestTimeout=20000; srv.headersTimeout=10000;
      srv.once("error",error=>{if(server===srv)server=null;reject(new Error("Could not open the private chat link: "+error.code));});
      srv.listen(listenPort,ip,()=>{
        if(run!==generation || isLocked()) {srv.close();reject(new Error("Vault locked"));return;}
        server=srv; bound=ip;
        const window=getWindow && getWindow(); if(window && !window.isDestroyed())window.webContents.setBackgroundThrottling(false);
        if(network.discovery===false){resolve();return;}
        const socket=dgram.createSocket("udp4"); udp=socket;
        socket.on("error",()=>{try{socket.close();}catch(_){}if(udp===socket)udp=null;});
        socket.on("message",(bytes,remote)=>{
          if(isLocked() || !privateIp(remote.address) || bytes.length>256 || Date.now()-published>20000)return;
          const parts=bytes.toString().split("|"); if(parts.length!==3 || parts[0]!=="RCCHAT1" || !/^[a-f0-9-]{20,80}$/.test(parts[1]))return;
          const mac=crypto.createHmac("sha256",Buffer.from(cfg.key,"hex")).update(parts[1]).digest("hex");
          if(parts[2].length!==64 || !crypto.timingSafeEqual(Buffer.from(parts[2]),Buffer.from(mac)))return;
          const answer=parts[1]+"|"+ip+"|"+PORT;
          socket.send(Buffer.from(answer+"|"+crypto.createHmac("sha256",Buffer.from(cfg.key,"hex")).update(answer).digest("hex")),remote.port,remote.address);
        });
        socket.bind(DISCOVERY,"0.0.0.0"); resolve();
      });
    }).finally(()=>{starting=null;});
    return starting;
  }
  ipcMain.handle("chatlink-status",()=>{ const c=readConfig(); return {enabled:!!(c&&c.enabled),host:true}; });
  ipcMain.handle("chatlink-configure",async(_event,opts)=>{
    guard(); stop();
    if(!opts || !opts.enabled) { if(fs.existsSync(file))fs.unlinkSync(file);config=null;return {enabled:false,host:true}; }
    const old=readConfig(); writeConfig(old || {enabled:true,key:crypto.randomBytes(32).toString("hex")});
    await listen();return {enabled:true,host:true,code:"RCCHAT1-"+bound+":"+server.address().port+"-"+config.key};
  });
  ipcMain.handle("chatlink-exchange",async(_event,request)=>{
    guard(); await listen(); guard();
    if(!request || typeof request!=="object")throw new Error("Missing chat sync request");
    if(typeof request.snapshot==="string"){
      if(Buffer.byteLength(request.snapshot)>SNAPSHOT_LIMIT)throw new Error("This one-phone Chat link is too small for the full conversation history. Use Automatic device sync in Settings.");
      if(host && host.text!==request.snapshot)acknowledgments.clear();
      host=host && host.text===request.snapshot?host:{text:request.snapshot,hash:digest(request.snapshot)};
    }else if(typeof request.hash!=="string" || !host || request.hash!==host.hash)return {needSnapshot:true,incoming:[]};
    published=Date.now();
    for(const hash of request.acks || []) if(pending.has(hash)) {pending.delete(hash);acknowledgments.add(hash);}
    while(acknowledgments.size>100)acknowledgments.delete(acknowledgments.values().next().value);
    return {incoming:Array.from(pending,([hash,snapshot])=>({hash,snapshot})),localHash:host.hash,peerAck,lastSeen,needSnapshot:false};
  });
  ipcMain.handle("chatlink-pause",()=>{stop();return true;});
  app.on("before-quit",stop);
  return stop;
}
module.exports={setupChatLink,seal,unseal,privateIp,digest,addressFrom};
