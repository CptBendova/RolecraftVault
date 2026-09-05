/* Execute the shipped engine: interrupt a large first sync, edit both peers,
   then restart it against the same durable storage and immutable chunk cache. */
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const C=require('../app/vault-sync-core'),source=fs.readFileSync(path.join(__dirname,'../app/vault-sync.js'),'utf8');
const hash=async s=>crypto.createHash('sha256').update(s).digest('hex'),pause=ms=>new Promise(r=>setTimeout(r,ms));
const data=new Map([['lore:all',JSON.stringify([{id:'local',content:'local writing',images:[]}])]]),cache=new Map(),remoteChunks=new Map(),reads=new Map(),pictureWrites=new Map();
let engine,status,head,remoteSnapshot,fail=true,approvals=0,pulses=0,edited=false;
const pictures={'img:one':'first original','img:two':'second original','img:three':'third original'};
let rows=[{id:'text',content:'text first',images:[]},{id:'one',content:'one',images:[{imgId:'one'}]},{id:'large',content:'original word',images:[{imgId:'two'},{imgId:'three'}]}];
async function pack(text){const id=await hash(text);remoteChunks.set(id,text);return {hash:id,parts:[id],bytes:Buffer.byteLength(text)};}
async function publish(){remoteSnapshot=await C.scan(C.collect({'lore:all':JSON.stringify(rows)}),remoteSnapshot,'source',hash);const images={};for(const [key,text]of Object.entries(pictures))images[key]=await pack(text);head={format:1,index:await pack(C.canonical({format:1,group:'fixture',snapshot:remoteSnapshot,images})),revision:await hash(C.canonical(remoteSnapshot)),established:true};}
const settings={enabled:true,device:'receiver',primary:'source',group:'fixture'};
const transport={call:async(method,args={})=>{
 if(method==='status'){pulses++;return settings;}
 if(method==='pause'||method==='beginPublish'||method==='retain'||method==='publish')return {};
 if(method==='put'){const id=await hash(args.text);cache.set(id,args.text);return {hash:id};}
 if(method==='discover')return {peers:[{id:'source'}]};
 if(method==='index')return {head,label:'Source'};
 if(method==='chunk'){
  if(cache.has(args.hash))return {text:cache.get(args.hash)};
  const text=remoteChunks.get(args.hash);if(text===pictures['img:three']&&fail){await pause(70);throw Error('Simulated network timeout');}
  if(text===pictures['img:two']&&!edited){edited=true;const current=JSON.parse(data.get('lore:all'));current.find(r=>r.id==='local').content='A local edit during download';data.set('lore:all',JSON.stringify(current));}
  assert.equal(typeof text,'string');reads.set(args.hash,(reads.get(args.hash)||0)+1);cache.set(args.hash,text);return {text};
 }
 throw Error(method);
}};
const storage={get:async key=>{if(!data.has(key))throw Error('key not found');return {value:data.get(key)};},fingerprint:async key=>data.has(key)?hash(data.get(key)):null,fingerprints:async keys=>Object.fromEntries(await Promise.all(keys.map(async key=>[key,await storage.fingerprint(key)]))),syncImage:async(key,value)=>{pictureWrites.set(key,(pictureWrites.get(key)||0)+1);if(data.has(key))assert.equal(data.get(key),value);data.set(key,value);},syncCommit:async(values,expected)=>{for(const [key,value]of Object.entries(expected))if((data.get(key)??null)!==value)throw Error('Library changed during sync');for(const [key,value]of Object.entries(values))data.set(key,value);}};
function start(){const window={RolecraftSyncCore:C,vaultSync:transport},ctx={window,document:{hidden:false},crypto:crypto.webcrypto,TextEncoder,Date,console,setTimeout:(fn,ms)=>setTimeout(fn,ms===5000?25:ms),clearTimeout};vm.createContext(ctx);vm.runInContext(source,ctx);engine=window.RolecraftVaultSync.create({storage,intervalMs:20,ready:()=>true,canApply:()=>true,imageIds:(_kind,r)=>(r.images||[]).map(i=>i.imgId),onApplied:async()=>{}});engine.subscribe(s=>{status=s;if(s.phase==='preview'){approvals++;engine.approve(s.preview.id);}});engine.start();}
async function until(fn){const end=Date.now()+6000;while(Date.now()<end){if(fn())return;await pause(10);}throw Error('Timed out: '+JSON.stringify(status));}
(async()=>{
 await publish();start();await until(()=>status.phase==='error');engine.stop();await pause(40);
 const saved=JSON.parse(data.get('lore:all')),state=JSON.parse(data.get('sync:state'));
 assert(saved.some(r=>r.id==='text'),'Text-only records appear before all pictures');
 assert(!saved.some(r=>r.id==='large'),'A record cannot appear before all its originals are verified');
 assert(data.has('img:two')&&state.images['img:two'],'Interrupted picture work is checkpointed');
 assert(state.accepted&&!state.approved,'Consent survives restart but incomplete first sync is not established');
 assert(!state.snapshot.entries[C.keyOf('lore','large')],'No causal history for uncommitted records');
 assert(pulses>2,'A busy sync renews its native serving lease');
 const before=reads.get(await hash(pictures['img:two']));rows.find(r=>r.id==='large').content='one word changed remotely';await publish();fail=false;start();
 await until(()=>JSON.parse(data.get('lore:all')).some(r=>r.id==='large'&&r.content==='one word changed remotely')&&JSON.parse(data.get('sync:state')).approved);engine.stop();
 assert.equal(approvals,1,'Restart and remote edits do not request the entire initial approval again');
 assert.equal(reads.get(await hash(pictures['img:two'])),before,'A verified saved picture is not downloaded again');
 assert.equal(pictureWrites.get('img:two'),1,'A checkpointed original is reused without reassembly and saving again');
 assert.equal(JSON.parse(data.get('lore:all')).find(r=>r.id==='local').content,'A local edit during download');
 for(const [key,value]of Object.entries(pictures))assert.equal(data.get(key),value);
 console.log('PASS incremental records, durable interrupted pictures, local/remote edits, remembered approval, restart and busy heartbeat');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(engine)engine.stop();});
