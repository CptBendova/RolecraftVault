const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const C=require('../app/vault-sync-core'),source=fs.readFileSync(path.join(__dirname,'../app/vault-sync.js'),'utf8');
const data=new Map([['lore:all',JSON.stringify([{id:'large',content:'A large gallery',images:Array.from({length:741},(_,i)=>({imgId:String(i)}))}])]]);
for(let i=0;i<741;i++)data.set('img:'+i,'original-'+i);
let head,engine,reads=0,missingReads=0;const statuses=[];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),chunks=new Map();
const storage={get:async key=>{if(key.startsWith('th:'))missingReads++;if(key.startsWith('img:'))reads++;return data.has(key)?{value:data.get(key)}:null;},fingerprint:async k=>data.has(k)?'saved:'+k:null,fingerprints:async keys=>Object.fromEntries(keys.map(k=>[k,data.has(k)?'saved:'+k:null])),syncCommit:async(values,expected)=>{for(const [k,v]of Object.entries(expected))assert.equal(data.get(k)??null,v);for(const [k,v]of Object.entries(values))data.set(k,v);}};
const transport={call:async(method,args={})=>{
 if(method==='status')return {enabled:true,group:'g',device:'local',primary:'local'};
 if(method==='put'){const id=hash(args.text);chunks.set(id,args.text);return {hash:id};}
 if(method==='publish'){head=args.head;return {};}
 if(method==='discover')return {peers:[{id:'peer'}]};
 if(method==='index')return {head,label:'Same saved library'};
 if(method==='chunk')return {text:chunks.get(args.hash)};
 if(['pause','beginPublish','retain'].includes(method))return {};
 throw Error(method);
}};
const window={RolecraftSyncCore:C,vaultSync:transport};
vm.runInNewContext(source,{window,document:{hidden:false},crypto:crypto.webcrypto,TextEncoder,setTimeout,clearTimeout,Date});
engine=window.RolecraftVaultSync.create({storage,ready:()=>true,canApply:()=>true,imageIds:(_k,r)=>(r.images||[]).map(x=>x.imgId),onApplied:async()=>{},intervalMs:10});
engine.subscribe(s=>statuses.push(s));
(async()=>{engine.start();const end=Date.now()+10000;while(Date.now()<end&&!statuses.some(s=>s.phase==='synced'))await new Promise(r=>setTimeout(r,10));engine.stop();
 const synced=statuses.find(s=>s.phase==='synced');assert(synced,JSON.stringify(statuses.at(-1)));
 assert.equal(missingReads,0,'Absent optional thumbnails are not re-prepared forever');
 assert.equal(reads,741,'An idle pass reuses every verified original');
 const prep=statuses.filter(s=>s.phase==='preparing');assert.equal(prep.at(-1).done,741,'Final progress bypasses throttling');assert.equal(prep.at(-1).total,741);
 assert.equal(synced.done,null,'Up-to-date status cannot retain unfinished preparation counts');assert.equal(synced.total,null);
 console.log('PASS 741 originals, missing optional previews, cached idle pass and complete/cleared progress');
})().catch(e=>{engine.stop();console.error(e);process.exitCode=1;});
