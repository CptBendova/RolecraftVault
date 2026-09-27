/* Run the shipped localImages path, not a copy of its preparation logic. */
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm"),crypto=require("crypto");
const C=require("../app/vault-sync-core"),source=fs.readFileSync(path.join(__dirname,"../app/vault-sync.js"),"utf8");
const digest=text=>crypto.createHash("sha256").update(text).digest("hex");
const describe=text=>({hash:digest(text),parts:[digest(text)],bytes:Buffer.byteLength(text)});
function fixture({count=741,native=true,hidden=false,background=false}={}){
  const data=new Map(),marks={},events=[],chunks=new Map(),statuses=[];let clock=0,locked=false;
  for(let i=0;i<count;i++)for(const prefix of ["img:","th:"]){const key=prefix+i;data.set(key,prefix+"exact original "+i);marks[key]="immutable:"+key;}
  const rows=[{id:"gallery",content:"Saved writing",images:Array.from({length:count},(_,i)=>({imgId:String(i)}))}];
  const snapshot={format:1,entries:{[C.keyOf("lore","gallery")]:{applied:"saved",versions:[{hash:"saved",value:rows[0]}]}}};
  const storage={
    get:async key=>{events.push({op:"get",key});return data.has(key)?{value:data.get(key)}:null;},
    fingerprints:async keys=>Object.fromEntries(keys.map(key=>[key,marks[key]??null])),
    syncCommit:async(values,expected)=>{for(const[key,value]of Object.entries(expected))assert.equal(data.get(key)??null,value,"preparation checkpoints retain exact CAS");events.push({op:"commit",bytes:Buffer.byteLength(values["sync:state"])});for(const[key,value]of Object.entries(values))data.set(key,value);}
  };
  if(native)storage.stageSyncImage=async(key,mark)=>{events.push({op:"native",key});assert.equal(mark,marks[key]);return describe(data.get(key));};
  const window={RolecraftSyncCore:C,Capacitor:{},RolecraftSyncBackground:{active:()=>background},vaultSync:{call:async(method,args={})=>{
    if(method==="pause"){events.push({op:"pause",args});return {};}
    if(method==="putBatch"){events.push({op:"put",count:args.texts.length});return {hashes:args.texts.map(text=>{const hash=digest(text);chunks.set(hash,text);return hash;})};}
    throw Error(method);
  }}};
  const anchor="return {supported:!!transport",probe="return {probe:{localImages,tick,setSettings(){settings={group:'fixture',chunkBatch:4};}},supported:!!transport";
  assert(source.includes(anchor));
  const document={hidden},Clock=class extends Date{static now(){return clock;}};
  vm.runInNewContext(source.replace(anchor,probe),{window,document,crypto:crypto.webcrypto,TextEncoder,setTimeout,clearTimeout,Date:Clock});
  const engine=window.RolecraftVaultSync.create({storage,ready:()=>!locked,imageIds:(_kind,row)=>(row.images||[]).map(image=>image.imgId)});
  engine.subscribe(value=>statuses.push(value));
  engine.probe.setSettings();
  return {engine,data,marks,events,snapshot,storage,document,window,statuses,advance:ms=>clock+=ms,lock:()=>locked=true};
}
(async()=>{
  const fast=fixture(),images=await fast.engine.probe.localImages(fast.snapshot,{},0);
  assert.equal(Object.keys(images).length,1482);
  assert.equal(fast.events.filter(e=>e.op==="native").length,1482);
  assert.equal(fast.events.filter(e=>e.op==="get"&&/^(img:|th:)/.test(e.key)).length,0,"native preparation does not round-trip full pictures through JavaScript");
  assert.equal(fast.events.filter(e=>e.op==="put").length,0,"native preparation does not send photo text back over the bridge");
  const checkpoints=fast.events.filter(e=>e.op==="commit");
  assert.equal(checkpoints.length,1,"fast originals and previews share one final state checkpoint instead of a full rewrite each16");
  const before=fast.events.length;
  await fast.engine.probe.localImages(fast.snapshot,images,0);
  assert.equal(fast.events.length,before,"unchanged exact fingerprints skip native staging, photo reads and checkpoint writes");
  const unchanged=fixture({count:741});await unchanged.engine.probe.localImages(unchanged.snapshot,images,0);
  assert(!unchanged.statuses.some(state=>state.phase==="preparing"),"reopening only checks fingerprints; it must not claim photos are being prepared again");unchanged.engine.stop();
  console.log(`PASS 741-photo/preview fixture: ${1482} native descriptors, no full-photo renderer reads/puts, ${checkpoints.length} state checkpoint (previous count trigger: ${Math.ceil(1482/16)})`);
  fast.engine.stop();

  for(const mode of ["absent","unsupported"]){
    const old=fixture({count:1,native:mode!=="absent"});
    if(mode==="unsupported")old.storage.stageSyncImage=async()=>null;
    const descriptors=await old.engine.probe.localImages(old.snapshot,{},0);
    for(const prefix of ["img:","th:"])assert.equal(descriptors[prefix+0].hash,digest(old.data.get(prefix+0)));
    assert.equal(old.events.filter(e=>e.op==="put").length,2,"legacy format retains exact text staging");old.engine.stop();
  }
  const failed=fixture({count:2});let calls=0;
  failed.storage.stageSyncImage=async(key)=>{if(++calls===3)throw Error("Image changed during preparation");return describe(failed.data.get(key));};
  await assert.rejects(failed.engine.probe.localImages(failed.snapshot,{},0),/Image changed/);
  assert.equal(failed.events.filter(e=>e.op==="put").length,0,"pointer/error rejection must never downgrade to an unguarded read");
  assert.deepEqual(Object.keys(JSON.parse(failed.data.get("sync:state")).images),["img:0","th:0"],"only finished descriptors survive an interrupted preparation");failed.engine.stop();
  const malformed=fixture({count:1});malformed.storage.stageSyncImage=async()=>({hash:"bad",parts:[],bytes:0});
  await assert.rejects(malformed.engine.probe.localImages(malformed.snapshot,{},0),/Invalid sync file description/);
  assert(!malformed.data.has("sync:state"));malformed.engine.stop();

  const slow=fixture({count:3});slow.storage.stageSyncImage=async key=>{slow.advance(1001);return describe(slow.data.get(key));};
  await slow.engine.probe.localImages(slow.snapshot,{},0);
  assert.equal(slow.events.filter(e=>e.op==="commit").length,3,"slow preparation still checkpoints every two seconds of completed work");slow.engine.stop();
  const locked=fixture({count:1});locked.storage.stageSyncImage=async key=>{locked.lock();return describe(locked.data.get(key));};
  await assert.rejects(locked.engine.probe.localImages(locked.snapshot,{},0),/paused/);assert(!locked.data.has("sync:state"));locked.engine.stop();
  const paused=fixture({count:1,hidden:true});
  await assert.rejects(paused.engine.probe.localImages(paused.snapshot,{},0),/paused/);
  await paused.engine.probe.tick();assert.equal(paused.events.find(e=>e.op==="pause").args.reason,"hidden","notification permission sheet pause does not masquerade as a vault lock");paused.engine.stop();
  const closed=fixture({count:1,hidden:true});closed.lock();await closed.engine.probe.tick();assert.equal(closed.events.find(e=>e.op==="pause").args.reason,"locked","actual lock wins even while a permission sheet hides the app");closed.engine.stop();
  const background=fixture({count:1,hidden:true,background:true});
  await background.engine.probe.localImages(background.snapshot,{},0);assert(background.data.has("sync:state"));assert.equal(background.events.filter(event=>event.op==="native").length,2,"approved native background session prepares originals and previews while hidden");background.engine.stop();
  console.log("PASS legacy fallback, native errors and descriptors, timed/interrupted checkpoints, lock and explicit background gates");
})().catch(error=>{console.error(error);process.exitCode=1;});
