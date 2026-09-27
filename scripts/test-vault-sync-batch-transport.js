/* Exercise the shipped native batch transport over real sockets, including
   authenticated old peers and deliberately damaged new-peer replies. */
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),http=require("http"),crypto=require("crypto");
const {createTransport,seal,unseal,digest,sealChunkBatch,unsealChunkBatch}=require("../app/vault-sync-transport");
const CHUNK=256*1024,MAX=2*1024*1024,root=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-batch-"));
const key=crypto.randomBytes(32).toString("hex"),device=crypto.randomUUID(),transports=[];
let locked=false,mode="normal",releaseReply=null;const actions=[];
const texts=Array.from({length:4},()=>crypto.randomBytes(CHUNK/4*3).toString("base64")),hashes=texts.map(digest);
const packets=new Map(texts.map((text,i)=>[hashes[i],seal(text,key,"blob:"+hashes[i])]));
function make(name){
  const directory=path.join(root,name),t=createTransport({directory,protect:s=>Buffer.from(seal(s,key,"storage")),unprotect:b=>unseal(b.toString(),key,"storage"),unlocked:()=>!locked,network:{addresses:()=>["127.0.0.1"],privateIp:ip=>ip==="127.0.0.1",discoveryPort:45218}});
  transports.push(t);return {t,directory};
}
const peer=http.createServer(async(req,res)=>{
  try{
    const pieces=[];for await(const p of req)pieces.push(p);
    const request=JSON.parse(unseal(Buffer.concat(pieces).toString(),key,"request"));actions.push(request.action);
    let result;
    if(request.action==="index")result={device,label:"Fixture peer",head:null,peers:[],...(mode==="legacy"?{}:{chunkBatch:4})};
    else if(request.action==="chunk")result={packet:packets.get(request.hash)};
    else if(request.action==="chunks"){
      const chunks=request.hashes.map(hash=>({hash,packet:packets.get(hash)})),body={device,chunks};
      if(mode==="wrong-device")body.device=crypto.randomUUID();
      if(mode==="wrong-order")chunks.reverse();
      if(mode==="wrong-count")chunks.pop();
      if(mode==="wrong-plaintext")chunks[chunks.length-1].packet=seal("different plaintext",key,"blob:"+chunks[chunks.length-1].hash);
      if(mode==="oversized-plaintext")chunks[chunks.length-1].packet=seal("x".repeat(CHUNK+1),key,"blob:"+chunks[chunks.length-1].hash);
      if(mode==="bad-inner")chunks[chunks.length-1].packet=chunks[chunks.length-1].packet.slice(0,-4)+"AAAA";
      let reply=sealChunkBatch(JSON.stringify(body),key,mode==="wrong-nonce"?"f".repeat(32):request.nonce);
      if(mode==="bad-mac")reply=reply.slice(0,43)+(reply[43]==="a"?"b":"a")+reply.slice(44);
      if(mode==="oversized-wire")reply="x".repeat(MAX+1);
      if(mode==="held")await new Promise(resolve=>{releaseReply=resolve;});
      res.writeHead(200,{"Content-Type":"text/plain"});res.end(reply);return;
    }else throw Error("Unexpected operation");
    res.writeHead(200,{"Content-Type":"text/plain"});res.end(seal(JSON.stringify({nonce:request.nonce,result}),key,"response"));
  }catch(_){if(!res.headersSent)res.writeHead(409);res.end();}
});
async function join(name){
  const item=make(name),code="RCVSYNC1."+Buffer.from(JSON.stringify({key,primary:device,device,namespace:"library1",ip:"127.0.0.1",port:peer.address().port,expires:Date.now()+600000})).toString("base64url");
  assert.equal((await item.t.call("configure",{action:"join",code})).chunkBatch,4);
  await item.t.call("index",{peer:device});actions.length=0;return item;
}
function cached(item){const dir=path.join(item.directory,"chunks");return fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/^[a-f0-9]{64}$/.test(n)):[];}
async function heldReply(){const end=Date.now()+5000;while(!releaseReply){if(Date.now()>end)throw Error("Expected held network reply");await new Promise(r=>setTimeout(r,5));}}
(async()=>{
  const nonce=crypto.randomBytes(16).toString("hex"),body="Immutable ciphertext fixture 😀\n",wire=sealChunkBatch(body,key,nonce);
  assert.equal(unsealChunkBatch(wire,key,nonce),body);
  assert.throws(()=>unsealChunkBatch(wire,key,"0".repeat(32)),/authentication/);
  assert.throws(()=>unsealChunkBatch(wire+"changed",key,nonce),/authentication/);
  assert.throws(()=>sealChunkBatch("x".repeat(MAX),key,nonce),/large/);
  assert.throws(()=>unsealChunkBatch("x".repeat(MAX+1),key,nonce),/Invalid/);
  assert.throws(()=>sealChunkBatch(body,key,"not-a-nonce"),/Invalid/);
  await new Promise(resolve=>peer.listen(0,"127.0.0.1",resolve));

  const receiver=await join("batch");
  assert.deepEqual((await receiver.t.call("chunks",{peer:device,hashes})).texts,texts);
  assert.deepEqual(actions,["chunks"],"Four full chunks use one authenticated socket request");
  assert.equal(cached(receiver).length,4);
  for(const hash of hashes)assert.equal(fs.readFileSync(path.join(receiver.directory,"chunks",hash),"utf8"),packets.get(hash),"Cache keeps the encrypted immutable packet, not decrypted picture text");
  actions.length=0;
  assert.deepEqual((await receiver.t.call("chunks",{peer:device,hashes:[hashes[2],hashes[2],hashes[0]]})).texts,[texts[2],texts[2],texts[0]]);
  assert.deepEqual(actions,[],"Repeated or already-downloaded chunks require no network");
  fs.writeFileSync(path.join(receiver.directory,"chunks",hashes[1]),"damaged");
  assert.deepEqual((await receiver.t.call("chunks",{peer:device,hashes})).texts,texts);
  assert.deepEqual(actions,["chunks"],"A damaged cached chunk is fetched again");
  console.log("PASS four maximum-size chunks use one encrypted batch; exact bytes, duplicates, cache-only reuse and corrupt-cache repair");

  mode="legacy";const legacy=await join("legacy");
  assert.deepEqual((await legacy.t.call("chunks",{peer:device,hashes})).texts,texts);
  assert.deepEqual(actions,["chunk","chunk","chunk","chunk"],"Only authenticated missing capability selects legacy requests");
  mode="normal";await legacy.t.call("index",{peer:device});
  const duplicate=await join("duplicate");
  assert.deepEqual((await duplicate.t.call("chunks",{peer:device,hashes:[hashes[0],hashes[0]]})).texts,[texts[0],texts[0]]);
  assert.deepEqual(actions,["chunks"]);
  console.log("PASS old authenticated peers use unchanged singles; repeated requested hashes preserve exact order");

  for(const bad of ["bad-mac","wrong-nonce","wrong-device","wrong-order","wrong-count","wrong-plaintext","oversized-plaintext","bad-inner","oversized-wire"]){
    mode=bad;const item=await join(bad);
    await assert.rejects(item.t.call("chunks",{peer:device,hashes}));
    assert.deepEqual(actions,["chunks"],bad+" never downgrades to unauthenticated or legacy retries");
    assert.equal(cached(item).length,0,bad+" must not cache any partial response");item.t.pause();
  }
  console.log("PASS modified MAC/nonce/device/order/count/content and oversized packets fail closed before caching, without fallback");

  mode="normal";const bounded=await join("bounded");
  for(const value of [[],hashes.concat(hashes[0]),["bad"]])await assert.rejects(bounded.t.call("chunks",{peer:device,hashes:value}),/Invalid/);
  for(const value of [[],texts.concat("extra"),[texts[0],"x".repeat(CHUNK+1)],[3]])await assert.rejects(bounded.t.call("putBatch",{texts:value}),/Invalid/);
  assert.equal(cached(bounded).length,0,"Reject all invalid upload entries before writing any");
  assert.deepEqual((await bounded.t.call("putBatch",{texts})).hashes,hashes);
  assert.deepEqual((await bounded.t.call("chunks",{peer:"offline",hashes})).texts,texts);
  console.log("PASS upload/download batches enforce four chunks and per-chunk byte bounds; local cache works with an offline peer");

  for(const action of ["lock","pause"]){
    mode="held";releaseReply=null;const item=await join(action),pending=item.t.call("chunks",{peer:device,hashes});
    const rejected=assert.rejects(pending);await heldReply();
    if(action==="lock")locked=true;else item.t.pause();releaseReply();await rejected;locked=false;
    assert.equal(cached(item).length,0,"No delayed cache write after "+action);item.t.pause();
  }
  console.log("PASS locking or pausing during the network reply prevents every delayed cache write");

  mode="normal";const sender=make("real-sender");await sender.t.call("configure",{action:"create"});
  const written=await sender.t.call("putBatch",{texts});assert.deepEqual(written.hashes,hashes);
  const real=make("real-receiver"),code=(await sender.t.call("invite")).code;
  await real.t.call("configure",{action:"join",code});const senderId=sender.t.info().device;
  assert.equal((await real.t.call("index",{peer:senderId})).chunkBatch,4);
  assert.deepEqual((await real.t.call("chunks",{peer:senderId,hashes})).texts,texts);
  assert.equal((await real.t.call("chunk",{peer:senderId,hash:hashes[0]})).text,texts[0],"Legacy single entry point remains available");
  console.log("PASS real shipped Windows peers publish and receive the batch wire without fixture transport code");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{locked=false;if(releaseReply)releaseReply();for(const t of transports)t.pause();peer.closeAllConnections();peer.close();});
