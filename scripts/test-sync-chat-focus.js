// Execute the actual sync engine; suspend in-flight work without forgetting peers.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const source=fs.readFileSync(path.join(__dirname,'../app/vault-sync.js'),'utf8'),C=require('../app/vault-sync-core');
let engine,reads=0,commits=0,held=null,hold=false,latest=null;const calls=[],data=new Map([['lore:all','[]']]);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const storage={get:async key=>{reads++;if(hold){hold=false;await new Promise(r=>held=r);}return data.has(key)?{value:data.get(key)}:null;},fingerprints:async()=>({}),syncCommit:async(values,expected)=>{commits++;for(const[k,v]of Object.entries(expected))assert.equal(data.get(k)??null,v);for(const[k,v]of Object.entries(values))data.set(k,v);}};
const transport={call:async(method,args={})=>{calls.push(method);if(method==='status')return {enabled:true,group:'remembered',device:'local',primary:'local'};if(method==='put')return {hash:crypto.createHash('sha256').update(args.text).digest('hex')};if(method==='discover')return {peers:[]};return {};}};
const window={RolecraftSyncCore:C,vaultSync:transport};
vm.runInNewContext(source,{window,document:{hidden:false},crypto:crypto.webcrypto,TextEncoder,setTimeout:(fn,ms)=>setTimeout(fn,ms===5000?30:ms),clearTimeout,Date});
engine=window.RolecraftVaultSync.create({storage,ready:()=>true,canApply:()=>true,imageIds:()=>[],onApplied:async()=>{},intervalMs:20});engine.subscribe(s=>latest=s);
async function until(fn){for(let i=0;i<300;i++){if(fn())return;await wait(10)}throw Error('Timeout: '+JSON.stringify(latest));}
(async()=>{
 engine.setWorkspacePaused(true);engine.start();await wait(100);assert.equal(reads,0);assert.deepEqual(calls,['pause']);assert.equal(latest.phase,'paused');
 engine.setWorkspacePaused(false);await until(()=>calls.includes('publish'));engine.setWorkspacePaused(true);await wait(50);
 const at={reads,commits,calls:calls.length};await wait(130);assert.deepEqual({reads,commits,calls:calls.length},at,'no scans, writes, hashing or native heartbeats while Chat is open');
 hold=true;engine.setWorkspacePaused(false);await until(()=>held);engine.setWorkspacePaused(true);const before=reads;held();held=null;await wait(100);assert.equal(reads,before,'an in-flight read cannot start the rest of the vault scan');assert.equal(latest.phase,'paused');
 data.set('lore:all',JSON.stringify([{id:'new',content:'Saved while writing',images:[]}]));engine.setWorkspacePaused(false);await until(()=>JSON.parse(data.get('sync:state')||'{}').snapshot?.entries[C.keyOf('lore','new')]);
 assert.equal(JSON.parse(data.get('sync:state')).group,'remembered');assert(!calls.includes('configure'),'resuming does not re-pair');
 console.log('PASS focus stops scans/heartbeats, interrupts in-flight work at a safe boundary and resumes saved edits in the same group');
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>engine.stop());
