/* Exercise shipped stage/download functions, including legacy native shells. */
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm"),crypto=require("crypto");
const source=fs.readFileSync(path.join(__dirname,"../app/vault-sync.js"),"utf8");
const digest=s=>crypto.createHash("sha256").update(s).digest("hex");
function fixture(batch){
  const cache=new Map(),calls=[],window={RolecraftSyncCore:{},vaultSync:{call:async(method,args={})=>{
    calls.push({method,args});if(method==="pause")return {};
    if(method==="put"||method==="putBatch"){
      const texts=method==="put"?[args.text]:args.texts;
      assert(texts.length>0&&texts.length<=4);
      const hashes=texts.map(text=>{assert(Buffer.byteLength(text)<=256*1024);const hash=digest(text);cache.set(hash,text);return hash;});
      return method==="put"?{hash:hashes[0]}:{hashes};
    }
    if(method==="chunk")return {text:cache.get(args.hash)};
    if(method==="chunks")return {texts:args.hashes.map(hash=>cache.get(hash))};
    throw Error(method);
  }}};
  const anchor="return {supported:!!transport",probe="return {probe:{stage,download,setBatch(value,concurrency){settings={chunkBatch:value,chunkConcurrency:concurrency};}},supported:!!transport";
  assert(source.includes(anchor),"Real engine return anchor");
  vm.runInNewContext(source.replace(anchor,probe),{window,document:{hidden:false},crypto:crypto.webcrypto,TextEncoder,setTimeout,clearTimeout,Date});
  const engine=window.RolecraftVaultSync.create({storage:{syncCommit(){}},ready:()=>true});engine.probe.setBatch(batch);
  return {engine,cache,calls,window};
}
(async()=>{
  const original="data:image/jpeg;base64,"+crypto.randomBytes(12*1024*1024).toString("base64"),results=[];
  for(const batch of [undefined,4]){
    const f=fixture(batch),descriptor=await f.engine.probe.stage(original,0);
    assert.equal(descriptor.hash,digest(original));assert.equal(descriptor.bytes,Buffer.byteLength(original));
    const puts=f.calls.length;assert.equal(await f.engine.probe.download(descriptor,"peer",0),original);
    assert.equal(f.calls.length-puts,puts);results.push({descriptor,puts});
    assert(f.calls.every(c=>batch===4?["putBatch","chunks"].includes(c.method):["put","chunk"].includes(c.method)));
    f.engine.stop();
  }
  assert.equal(JSON.stringify(results[0].descriptor),JSON.stringify(results[1].descriptor),"Batching preserves existing chunk identities and whole-photo checksum");
  assert.equal(results[1].puts,Math.ceil(results[0].puts/4));
  console.log(`PASS 12 MiB photo: ${results[0].puts} -> ${results[1].puts} native calls per staging/download pass, identical original bytes and legacy descriptors`);
  const unicode="a".repeat(192*1024-1)+"😀雪".repeat(200000),f=fixture(4),d=await f.engine.probe.stage(unicode,0);
  assert.equal(await f.engine.probe.download(d,"peer",0),unicode);assert.equal(d.bytes,Buffer.byteLength(unicode));
  for(const text of f.cache.values())assert(!/[\uD800-\uDBFF]$/.test(text),"No split surrogate pair");
  const empty=await f.engine.probe.stage("",0);assert.equal(await f.engine.probe.download(empty,"peer",0),"");
  const saved=f.window.vaultSync.call;
  f.window.vaultSync.call=async(method,args)=>{const result=await saved(method,args);if(method==="chunks")result.texts.reverse();return result;};
  await assert.rejects(f.engine.probe.download(d,"peer",0),/checksum/);
  for(const result of [{texts:[]},{texts:[null]},{texts:["x".repeat(256*1024+1)]},{texts:["wrong bytes"]}]){
    f.window.vaultSync.call=async()=>result;
    await assert.rejects(f.engine.probe.download({hash:digest("good bytes"),parts:[digest("good bytes")],bytes:10},"peer",0),/Missing|safe size|checksum|declared size/);
  }
  f.window.vaultSync.call=async()=>({hashes:[]});await assert.rejects(f.engine.probe.stage("new writing",0),/Invalid staged/);
  f.window.vaultSync.call=saved;f.engine.stop();
  const interrupted=fixture(4);let batches=0,call=interrupted.window.vaultSync.call;
  interrupted.window.vaultSync.call=async(method,args)=>{const result=await call(method,args);if(method==="putBatch"&&++batches===1)interrupted.engine.stop();return result;};
  await assert.rejects(interrupted.engine.probe.stage(original,0),/paused/);assert.equal(batches,1,"Stop prevents subsequent native batches");
  const pipelined=fixture(4);pipelined.engine.probe.setBatch(4,2);
  const parallelFile=await pipelined.engine.probe.stage(original,0),native=pipelined.window.vaultSync.call;
  let active=0,peak=0,failed=false;
  pipelined.window.vaultSync.call=async(method,args)=>{
    if(method!=="chunks")return native(method,args);
    active++;peak=Math.max(peak,active);
    try{await new Promise(r=>setTimeout(r,args.hashes[0]===parallelFile.parts[0]?15:1));return await native(method,args);}finally{active--;}
  };
  assert.equal(await pipelined.engine.probe.download(parallelFile,"peer",0),original,"out-of-order completion preserves exact original bytes");
  assert.equal(peak,2,"updated shells overlap exactly two bounded requests");assert.equal(active,0);
  pipelined.window.vaultSync.call=async(method,args)=>{
    if(method!=="chunks")return native(method,args);active++;
    try{if(!failed){failed=true;throw Error("Simulated failed batch");}await new Promise(r=>setTimeout(r,20));return await native(method,args);}finally{active--;}
  };
  await assert.rejects(pipelined.engine.probe.download(parallelFile,"peer",0),/Simulated/);assert.equal(active,0,"failure drains the other request before a later pass");
  pipelined.engine.stop();
  console.log("PASS two-window download overlaps bounded requests, retains order and drains failures before returning");
  console.log("PASS Unicode, empty files, bounded responses, missing/reordered/corrupt chunks, malformed staging and cancellation fail closed");
})().catch(e=>{console.error(e);process.exitCode=1;});
