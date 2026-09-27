"use strict";
const assert=require("assert"),crypto=require("crypto"),dgram=require("dgram"),fs=require("fs"),os=require("os"),path=require("path");
const {createTransport,seal,unseal}=require("../app/vault-sync-transport");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-wake-"));
const storageKey=crypto.randomBytes(32).toString("hex"),port=45328;
let locked=false,wakes=0,lastSender=null,transport,receiver;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function signed(key,group,sender,type,nonce,at=Date.now(),httpPort=23456){
  const body=[type,group,sender,nonce,at,httpPort].join("|");
  return body+"|"+crypto.createHmac("sha256",Buffer.from(key,"hex")).update(body).digest("hex");
}
async function send(packet){await new Promise((resolve,reject)=>receiver.send(Buffer.from(packet),port,"127.0.0.1",error=>error?reject(error):resolve()));await wait(50);}
(async()=>{
  transport=createTransport({directory:root,protect:text=>Buffer.from(seal(text,storageKey,"fixture")),unprotect:bytes=>unseal(bytes.toString(),storageKey,"fixture"),unlocked:()=>!locked,network:{addresses:()=>["127.0.0.1"],privateIp:ip=>ip==="127.0.0.1",discoveryPort:port,onWake:deviceId=>{wakes++;lastSender=deviceId;}}});
  const state=await transport.call("configure",{action:"create",label:"Windows"});
  const invite=JSON.parse(Buffer.from((await transport.call("invite")).code.slice(9),"base64url"));
  const sender=crypto.randomUUID(),nonce=crypto.randomBytes(16).toString("hex");
  receiver=dgram.createSocket("udp4");
  const valid=signed(invite.key,state.group,sender,"RCVSYNC1~",nonce);
  await send(valid);assert.equal(wakes,1,"authenticated publication must wake the renderer");assert.equal(lastSender,sender,"wake must identify only the authenticated sending device");
  await send(valid);assert.equal(wakes,1,"replayed wake must be ignored");
  await send(valid.slice(0,-1)+(valid.endsWith("0")?"1":"0"));assert.equal(wakes,1,"bad HMAC must be ignored");
  await send(signed(invite.key,state.group,sender,"RCVSYNC1~",crypto.randomBytes(16).toString("hex"),Date.now()-180000));assert.equal(wakes,1,"expired wake must be ignored");
  await send(signed(invite.key,state.group,state.device,"RCVSYNC1~",crypto.randomBytes(16).toString("hex")));assert.equal(wakes,1,"self wake must be ignored");
  locked=true;await send(signed(invite.key,state.group,sender,"RCVSYNC1~",crypto.randomBytes(16).toString("hex")));assert.equal(wakes,1,"locked vault must ignore wake");locked=false;
  const start=Date.now();const discovered=await transport.call("discover",{waitMs:0});assert(discovered.peers.some(peer=>peer.id===sender));assert(Date.now()-start<500,"cached discovery must not wait 750 ms");
  const dgramSocket=dgram.Socket.prototype,originalSend=dgramSocket.send,packets=[];
  try{
    dgramSocket.send=function(...args){
      if(Buffer.isBuffer(args[0])&&args[0].toString().startsWith("RCVSYNC1~")){
        const head=JSON.parse(unseal(fs.readFileSync(path.join(root,"head.bin"),"utf8"),invite.key,"head"));
        packets.push({packet:args[0].toString(),revision:head.extensions.stories1.revision});
      }
      return originalSend.apply(this,args);
    };
    const library=await transport.call("put",{text:"Library stays unchanged"});
    const baseRevision=crypto.createHash("sha256").update("library").digest("hex");
    const story=async content=>{
      const record=await transport.call("put",{text:content});
      const manifest=JSON.stringify({format:2,group:state.group,images:{},records:{[JSON.stringify(["conversation","chat-one"])]:{hash:record.hash,parts:[record.hash],bytes:Buffer.byteLength(content)}}});
      const index=await transport.call("put",{text:manifest});
      return {revision:index.hash,index:{hash:index.hash,parts:[index.hash],bytes:Buffer.byteLength(manifest)},retain:[record.hash,index.hash]};
    };
    const first=await story("First story");
    const head={format:1,revision:baseRevision,index:{parts:[library.hash]},extensions:{stories1:{revision:first.revision,index:first.index},other:{revision:"preserve"}},established:false};
    await transport.call("beginPublish");await transport.call("retain",{hashes:[library.hash,...first.retain]});
    await transport.call("publish",{head});
    assert(packets.length>0&&packets.every(item=>item.revision===head.extensions.stories1.revision),"wake must follow durable head commit");
    assert(packets.every(item=>!item.packet.includes("First story")),"wake must carry no chat content");
    const firstCount=packets.length;
    await transport.call("publish",{head});
    assert.equal(packets.length,firstCount,"unchanged story publication must not wake peers");
    const second=await story("Second story");
    const extension={revision:second.revision,index:second.index};
    const fastArgs={extension,expectedLibraryRevision:baseRevision,established:false};
    assert.deepEqual(await transport.call("publishStoryExtension",{...fastArgs,established:true}),{published:false},"incompatible establishment state must fall back");
    assert.deepEqual(await transport.call("publishStoryExtension",{...fastArgs,expectedLibraryRevision:"0".repeat(64)}),{published:false},"base revision race must fall back");
    assert.deepEqual(await transport.call("publishStoryExtension",{...fastArgs,extension:{...extension,index:{...extension.index,bytes:1}}}),{published:false},"incorrect descriptor size must fall back");
    assert.deepEqual(await transport.call("publishStoryExtension",{...fastArgs,extension:{...extension,index:{...extension.index,parts:["0".repeat(64)]}}}),{published:false},"missing story part must fall back");
    const result=await transport.call("publishStoryExtension",fastArgs);
    assert.equal(result.published,true);assert.equal(result.libraryRevision,baseRevision);
    assert(packets.length>firstCount&&packets.slice(firstCount).every(item=>item.revision===extension.revision),"changed story publication must wake peers");
    const stored=JSON.parse(unseal(fs.readFileSync(path.join(root,"head.bin"),"utf8"),invite.key,"head"));
    assert.equal(stored.revision,baseRevision);assert.deepEqual(stored.index,head.index);assert.deepEqual(stored.extensions.other,head.extensions.other);
    assert.deepEqual(stored.extensions.stories1,extension,"fast path must preserve the base and other extensions");
    const sent=packets.length;assert.equal((await transport.call("publishStoryExtension",fastArgs)).changed,false);assert.equal(packets.length,sent,"unchanged fast path must not wake peers");
    const alternate=await story("Same revision, different index");
    const alternateExtension={revision:extension.revision,index:alternate.index};
    assert.equal((await transport.call("publishStoryExtension",{...fastArgs,extension:alternateExtension})).changed,true);
    assert(packets.length>sent,"a changed descriptor must wake peers even when revision is unchanged");
  }finally{dgramSocket.send=originalSend;}
  console.log("PASS authenticated content-free wake, replay/lock guards, durable publish ordering, and fast cached discovery");
  console.log("PASS story-only publication preserves the approved library, verifies parts, and avoids photo retain scans");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(transport)transport.pause();if(receiver)receiver.close();fs.rmSync(root,{recursive:true,force:true});});
