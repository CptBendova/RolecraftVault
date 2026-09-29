/* Real renderer engine/core with disposable storage and an immutable native
   bridge fixture. Timings measure JS work here, not physical Android/LAN speed. */
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto"), {performance} = require("perf_hooks");
const source = name => fs.readFileSync(path.join(__dirname,"../app",name),"utf8");
const C = require("../app/vault-sync-core");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const profileOnly = process.argv.includes("--profile"), PHOTOS=741, RECORDS=120, PARTS=32, group="fixture-private-group", device="fixture-tablet", peer="fixture-phone";
const statuses=[],timers=new Map(),data=new Map(),chunks=new Map(),summary=[];
let timerId=0,stats={},published=null,peerHead=null,engine,timeShift=0,unlocked=true;
const reset=()=>stats={native:{},get:0,getBytes:0,stateReads:0,imagesRead:0,fingerprintCalls:0,fingerprintKeys:0,commits:0,commitBytes:0,expectedBytes:0,hashes:0,hashBytes:0,scan:0,scanRecords:0,validate:0,validateRecords:0,merge:0,canonical:0,canonicalMs:0,putBytes:0,retainHashes:0};
reset();
const settings={enabled:true,group,device,primary:device,namespace:"library1",primarySelection:1,primaryPreference:{format:1,device,author:device,sequence:1,label:"Tablet"},chunkBatch:4};
const countNative=(method,args)=>{stats.native[method]=(stats.native[method]||0)+1;if(method==="retain")stats.retainHashes+=(args.hashes||[]).length;};
const transport={call:async(method,args={})=>{
  countNative(method,args);
  if(method==="status")return {...settings};
  if(method==="pause")return {};
  if(method==="putBatch"||method==="put"){
    const texts=method==="putBatch"?args.texts:[args.text];
    const hashes=texts.map(text=>{stats.putBytes+=Buffer.byteLength(text);const hash=digest(text);chunks.set(hash,text);return hash;});
    return method==="putBatch"?{hashes}:{hash:hashes[0]};
  }
  if(method==="retain"||method==="beginPublish")return {};
  if(method==="publish"){published=structuredClone(args.head);if(!peerHead)peerHead=structuredClone(published);return {};}
  if(method==="discover")return {peers:[{id:peer}]};
  if(method==="index")return {head:structuredClone(peerHead),device:peer,label:"Phone",primarySelection:1,primaryPreference:settings.primaryPreference};
  if(method==="chunks")return {texts:args.hashes.map(hash=>{assert(chunks.has(hash));return chunks.get(hash);})};
  if(method==="chunk"){assert(chunks.has(args.hash));return {text:chunks.get(args.hash)};}
  throw Error("Unexpected native operation "+method);
}};
const fingerprint=key=>/^img:/.test(key)&&data.has(key)?"encrypted-pointer:"+key:null;
const storage={
  get:async key=>{stats.get++;if(key==="sync:state")stats.stateReads++;if(/^(?:img:|th:)/.test(key))stats.imagesRead++;const value=data.get(key);stats.getBytes+=value?Buffer.byteLength(value):0;return value==null?null:{value};},
  fingerprints:async keys=>{stats.fingerprintCalls++;stats.fingerprintKeys+=keys.length;return Object.fromEntries(keys.map(key=>[key,fingerprint(key)]));},
  fingerprint:async key=>{stats.fingerprintCalls++;stats.fingerprintKeys++;return fingerprint(key);},
  syncCommit:async(values,expected)=>{stats.commits++;for(const [key,value]of Object.entries(expected)){assert.equal(data.get(key)??null,value,"CAS must retain intervening writing");stats.expectedBytes+=value?Buffer.byteLength(value):0;}for(const[key,value]of Object.entries(values)){stats.commitBytes+=Buffer.byteLength(value);data.set(key,value);}},
  syncImage:async(key,value)=>{assert(!data.has(key)||data.get(key)===value);data.set(key,value);}
};
const window={vaultSync:transport};
const ctx={window,document:{hidden:false},Date:class extends Date{static now(){return Date.now()+timeShift;}},crypto:{subtle:{digest:async(algorithm,bytes)=>{stats.hashes++;stats.hashBytes+=bytes.byteLength;return crypto.webcrypto.subtle.digest(algorithm,bytes);}}},TextEncoder,console,
  setTimeout(fn,ms){const id=++timerId;if(ms>=1000)timers.set(id,{fn,ms});else setTimeout(fn,ms);return id;},
  clearTimeout(id){timers.delete(id);}
};
vm.createContext(ctx);vm.runInContext(source("vault-sync-core.js"),ctx);vm.runInContext(source("vault-sync.js"),ctx);
for(const method of ["scan","validate","merge"]){const original=window.RolecraftSyncCore[method];window.RolecraftSyncCore[method]=async(...args)=>{stats[method]++;if(method==="scan")stats.scanRecords+=Object.keys(args[0]).length;if(method==="validate")stats.validateRecords+=Object.keys(args[0].entries).length;return original(...args);};}
const canonical=window.RolecraftSyncCore.canonical;window.RolecraftSyncCore.canonical=value=>{const start=performance.now();stats.canonical++;try{return canonical(value);}finally{stats.canonicalMs+=performance.now()-start;}};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const nextPollMs=()=>Math.max(0,...[...timers.values()].filter(timer=>timer.ms>=100000).map(timer=>timer.ms));
async function tick(label,first=false){
  reset();statuses.length=0;const start=performance.now();
  // 1.338 stretches an unchanged poll up to 4x the base interval.
  if(first)engine.start();else{const scheduled=[...timers.entries()].find(([,timer])=>timer.ms>=100000);assert(scheduled,"engine must schedule next poll");timers.delete(scheduled[0]);scheduled[1].fn();}
  const deadline=Date.now()+15000;
  while(![...timers.values()].some(timer=>timer.ms>=100000)){if(Date.now()>deadline)throw Error("Timed out "+label+": "+JSON.stringify(statuses.slice(-3)));await pause(2);}
  const error=statuses.find(status=>status.phase==="error");assert(!error,error?.message);
  const result={label,elapsedMs:Math.round(performance.now()-start),...structuredClone(stats)};result.canonicalMs=Math.round(result.canonicalMs);summary.push(result);return result;
}
(async()=>{
  const records=Array.from({length:RECORDS},(_,i)=>({id:"character-"+i,name:"Character "+i,story:"Saved character history. ".repeat(80),images:[],profileImg:null}));
  const images={};
  for(let i=0;i<PHOTOS;i++){
    const id="photo-"+i;records[i%RECORDS].images.push(id);records[i%RECORDS].profileImg ||= id;
    data.set("img:"+id,"original-fixture-"+i);
    images["img:"+id]={hash:digest("image "+i),parts:Array.from({length:PARTS},(_,part)=>digest(id+" part "+part)),bytes:PARTS*192*1024,fingerprint:fingerprint("img:"+id)};
  }
  data.set("chars:all",JSON.stringify(records));
  const items=C.collect(Object.fromEntries(data)),snapshot=await C.scan(items,null,device,async text=>digest(text));
  data.set("sync:state",JSON.stringify({group,approved:true,accepted:true,snapshot,images}));
  engine=window.RolecraftVaultSync.create({storage,namespace:"library1",intervalMs:100000,ready:()=>unlocked,canApply:()=>true,imageIds:(kind,value)=>kind==="character"?value.images:[],onApplied:()=>{}});
  engine.subscribe(status=>statuses.push(status));
  await tick("warm",true);
  const idle=await tick("idle"),idleAgain=await tick("idle-again");
  assert(nextPollMs()>100000&&nextPollMs()<=400000,"unchanged polls back off, capped at 4x: "+nextPollMs());
  const modified=JSON.parse(data.get("chars:all"));modified[0].name="Character changed";data.set("chars:all",JSON.stringify(modified));
  const edit=await tick("one-word-edit");
  assert.equal(nextPollMs(),100000,"a pass that saved a change returns to the base interval");
  assert.equal(JSON.parse(data.get("chars:all"))[0].name,"Character changed");
  assert.equal(idle.imagesRead+idleAgain.imagesRead+edit.imagesRead,0,"unchanged original pictures must never be decrypted/restaged");
  assert.equal(idle.commits+idleAgain.commits,0,"idle polls must not write the causal snapshot");
  if(!profileOnly){
    assert.equal(idle.putBytes+idleAgain.putBytes,0,"unchanged polls must not rebuild/stage the full image descriptor index");
    assert.equal(idle.retainHashes+idleAgain.retainHashes,0,"unchanged polls must not re-enumerate retained picture chunks");
    assert.equal((idle.native.publish||0)+(idleAgain.native.publish||0),0,"unchanged polls must reuse the published immutable head");
    assert.equal(idle.hashes+idleAgain.hashes,0,"unchanged polls must not rehash all saved records");
    assert(edit.putBytes>0&&edit.commits>0,"a one-word edit must invalidate the local publication and preserve causal history");
    settings.primaryPreference={...settings.primaryPreference,sequence:2,device:peer,author:peer};
    const selection=await tick("primary-changed");assert(selection.merge>0,"primary changes invalidate reconciliation");
    timeShift+=31000;const renewed=await tick("cache-renewal");assert(renewed.native.publish&&renewed.retainHashes>0,"periodic native retain validation detects missing disposable chunks");
    unlocked=false;await tick("locked");unlocked=true;const resumed=await tick("unlocked");assert(resumed.native.publish,"lock discards publication caches");
  }
  console.log(JSON.stringify({fixture:{records:RECORDS,photos:PHOTOS,chunksPerPhoto:PARTS,source:"actual renderer/core, mocked encrypted metadata bridge"},samples:summary},null,2));
  console.log("PASS cached original pictures and local writing stay intact"+(profileOnly?" (profile only; optimization assertions disabled)":"; idle polls avoid repeated publication"));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(engine)engine.stop();});
