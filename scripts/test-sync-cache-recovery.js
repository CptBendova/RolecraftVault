/* Actual engine retries must distinguish broken local caches from bad peers. */
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm"),crypto=require("crypto");
const C=require("../app/vault-sync-core"),source=fs.readFileSync(path.join(__dirname,"../app/vault-sync.js"),"utf8");
const hash=text=>crypto.createHash("sha256").update(text).digest("hex");
async function fixture(failure,{inspect=false,missingIds=["local-2"],failStageOnce=false,badInspectionOnce=false}={}){
  const data=new Map(),chunks=new Map(),reads=[],photoPuts=[],statuses=[],inspections=[];let failing=true,published=0,stageFailed=false;
  const localRows=Array.from({length:5},(_,i)=>({id:"local-"+i,content:"Local writing "+i,images:[{imgId:"local-"+i}]}));
  const remoteRows=[{id:"remote",content:"Remote writing",images:[{imgId:"remote"}]}];
  data.set("lore:all",JSON.stringify(localRows));
  const pack=text=>{const id=hash(text);chunks.set(id,text);return {hash:id,parts:[id],bytes:Buffer.byteLength(text)};};
  const localImages={};for(const row of localRows){const key="img:"+row.id,text="Exact local photo "+row.id;data.set(key,text);localImages[key]={...pack(text),fingerprint:hash(text)};}
  const missing=new Set(inspect?missingIds.map(id=>localImages["img:"+id].hash):[]);
  const snapshot=await C.scan(C.collect({"lore:all":data.get("lore:all")}),null,"local",hash);
  data.set("sync:state",JSON.stringify({group:"fixture",approved:true,accepted:true,snapshot,images:localImages}));
  const remoteSnapshot=await C.scan(C.collect({"lore:all":JSON.stringify(remoteRows)}),null,"remote",hash);
  const remotePhoto=pack("Exact remote photo"),index=pack(C.canonical({format:1,group:"fixture",snapshot:remoteSnapshot,images:{"img:remote":remotePhoto}}));
  const head={format:1,index,revision:hash(C.canonical(remoteSnapshot)),established:true};
  const storage={
    get:async key=>{if(key.startsWith("img:"))reads.push(key);return data.has(key)?{value:data.get(key)}:null;},
    fingerprint:async key=>data.has(key)?hash(data.get(key)):null,
    fingerprints:async keys=>Object.fromEntries(keys.map(key=>[key,data.has(key)?hash(data.get(key)):null])),
    syncImage:async(key,value)=>{assert(!data.has(key)||data.get(key)===value);data.set(key,value);},
    syncCommit:async(values,expected)=>{for(const[key,value]of Object.entries(expected))assert.equal(data.get(key)??null,value,"exact write CAS");for(const[key,value]of Object.entries(values))data.set(key,value);}
  };
  const native={call:async(method,args={})=>{
    if(method==="status")return {enabled:true,device:"local",primary:"local",group:"fixture",photoCacheInspection:inspect?1:undefined};
    if(["pause","beginPublish","retain"].includes(method))return {};
    if(method==="put"){if(args.text.startsWith("Exact local photo")){if(failStageOnce&&!stageFailed&&args.text.endsWith("local-3")){stageFailed=true;throw Error("Preparation interrupted fixture");}photoPuts.push(args.text);}const descriptor=pack(args.text);missing.delete(descriptor.hash);return {hash:descriptor.hash};}
    if(method==="missingChunks"){inspections.push(args.hashes);assert(args.hashes.length<=1024);return {missing:badInspectionOnce&&inspections.length===1?["0".repeat(64)]:args.hashes.filter(hash=>missing.has(hash))};}
    if(method==="publish"){published++;if(missing.size||failing&&failure.startsWith("local-"))throw Error(failure==="local-windows"?"A referenced sync chunk is missing":"A referenced chunk is missing");return {};}
    if(method==="discover")return {peers:[{id:"remote"}]};
    if(method==="index")return {head,label:"Remote"};
    if(method==="chunk"){
      if(failing&&failure==="remote-index"&&args.hash===index.hash)return {text:"!".repeat(index.bytes)};
      if(failing&&args.hash===remotePhoto.hash){
        if(failure==="remote-native")throw Error("Sync chunk checksum failed");
        if(failure==="remote-image")return {text:"!".repeat(remotePhoto.bytes)};
        if(failure==="remote-message")throw Error("A referenced sync chunk is missing");
      }
      return {text:chunks.get(args.hash)};
    }
    throw Error(method);
  }};
  const window={RolecraftSyncCore:C,vaultSync:native},anchor="return {supported:!!transport";
  assert(source.includes(anchor));
  vm.runInNewContext(source.replace(anchor,"return {probe:{tick},supported:!!transport"),{window,document:{hidden:false},crypto:crypto.webcrypto,TextEncoder,Date,setTimeout:(fn,ms)=>ms<=50?setTimeout(fn,ms):0,clearTimeout});
  function makeEngine(){const next=window.RolecraftVaultSync.create({storage,ready:()=>true,canApply:()=>true,imageIds:(_kind,row)=>(row.images||[]).map(image=>image.imgId),onApplied:async()=>{}});next.subscribe(value=>statuses.push(value));return next;}
  let engine=makeEngine();
  const result={engine,data,reads,photoPuts,statuses,inspections,missing,repair:()=>{failing=false;engine.retry();},published:()=>published,restart:()=>{engine.stop();engine=makeEngine();result.engine=engine;}};return result;
}
(async()=>{
  for(const failure of ["remote-image","remote-native","remote-index","remote-message"]){
    const f=await fixture(failure);
    try{
      await f.engine.probe.tick();
      assert.equal(f.reads.length,0,"existing healthy photos reused before peer failure");
      assert(!f.data.has("img:remote"),"failed peer bytes never commit");
      assert(!JSON.parse(f.data.get("lore:all")).some(row=>row.id==="remote"),"a failed picture cannot expose its record");
      f.repair();await f.engine.probe.tick();
      assert.equal(f.reads.length,0,failure+" does not invalidate good local picture descriptors");
      assert.equal(f.photoPuts.length,0,failure+" does not rebuild healthy local encrypted chunks");
      assert.equal(f.data.get("img:remote"),"Exact remote photo");
      assert(JSON.parse(f.data.get("lore:all")).some(row=>row.id==="remote"),"valid retry resumes and saves remote record");
    }finally{f.engine.stop();}
  }
  for(const failure of ["local-windows","local-android"]){
    const f=await fixture(failure);
    try{
      await f.engine.probe.tick();assert.equal(f.reads.length,0);
      assert.equal(f.statuses.at(-1).phase,"error","missing retained chunks stop publication");
      f.repair();await f.engine.probe.tick();
      assert.equal(f.reads.length,5,failure+" repairs all locally retained picture descriptors");
      assert.equal(f.photoPuts.length,5,"missing local cache is rebuilt from unchanged originals");
      assert(f.published()>=2);assert.equal(f.data.get("img:remote"),"Exact remote photo");
    }finally{f.engine.stop();}
  }
  for(const failure of ["local-windows","local-android"]){
    const f=await fixture(failure,{inspect:true});
    try{
      await f.engine.probe.tick();assert.equal(f.reads.length,0);f.repair();await f.engine.probe.tick();
      assert.deepEqual(f.reads,["img:local-2"],"one missing part repairs only its photo, not the entire library");assert.equal(f.inspections.length,1);assert.equal(f.missing.size,0);
    }finally{f.engine.stop();}
  }
  const interrupted=await fixture("local-android",{inspect:true,missingIds:["local-1","local-3"],failStageOnce:true});
  try{
    await interrupted.engine.probe.tick();interrupted.repair();await interrupted.engine.probe.tick();
    assert.match(interrupted.statuses.at(-1).message,/Preparation interrupted/);
    assert.deepEqual(interrupted.reads,["img:local-1","img:local-3"]);assert.equal(interrupted.missing.size,1,"completed repair is durably available before next publication");
    interrupted.restart();await interrupted.engine.probe.tick();await interrupted.engine.probe.tick();
    assert.deepEqual(interrupted.reads,["img:local-1","img:local-3","img:local-3"],"reopening does not reprepare a photo repaired before interruption");assert.equal(interrupted.missing.size,0);
  }finally{interrupted.engine.stop();}
  const invalid=await fixture("local-windows",{inspect:true,badInspectionOnce:true});
  try{
    await invalid.engine.probe.tick();invalid.repair();await invalid.engine.probe.tick();
    assert.match(invalid.statuses.at(-1).message,/Invalid local picture cache inspection/);assert.equal(invalid.reads.length,0,"invalid native inventory never triggers a blind full repair");
    await invalid.engine.probe.tick();assert.deepEqual(invalid.reads,["img:local-2"],"cache inspection retries before selectively repairing the missing photo");
  }finally{invalid.engine.stop();}
  console.log("PASS remote image/index/native checksum failures reuse healthy local pictures; exact Windows/Android local publication cache failures repair safely");
  console.log("PASS missing native cache pieces repair only affected photos; completed repairs survive interruption and full engine restart");
})().catch(error=>{console.error(error);process.exitCode=1;});
