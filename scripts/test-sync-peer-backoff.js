/* Shipped engine: stale peers must not stall every healthy-device poll. */
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm"),crypto=require("crypto");
const C=require("../app/vault-sync-core"),source=fs.readFileSync(path.join(__dirname,"../app/vault-sync.js"),"utf8");
const hash=text=>crypto.createHash("sha256").update(text).digest("hex");
(async()=>{
  let clock=1000,locked=false,failing=true,group="fixture",address="192.168.1.8",head;const data=new Map(),chunks=new Map(),calls=[],states=[];
  const raw=JSON.stringify([{id:"shared",content:"Shared writing",images:[]}]);data.set("lore:all",raw);
  const snapshot=await C.scan(C.collect({"lore:all":raw}),null,"local",hash);
  data.set("sync:state",JSON.stringify({group,approved:true,accepted:true,snapshot,images:{}}));
  const pack=text=>{const id=hash(text);chunks.set(id,text);return {hash:id,parts:[id],bytes:Buffer.byteLength(text)};};
  const storage={get:async key=>data.has(key)?{value:data.get(key)}:null,fingerprints:async()=>({}),syncCommit:async(values,expected)=>{for(const[key,value]of Object.entries(expected))assert.equal(data.get(key)??null,value);for(const[key,value]of Object.entries(values))data.set(key,value);}};
  const native={call:async(method,args={})=>{
    if(method==="status")return {enabled:true,group,device:"local",primary:"local"};
    if(["pause","beginPublish","retain"].includes(method))return {};
    if(method==="put")return {hash:pack(args.text).hash};
    if(method==="publish"){head=args.head;return {};}
    if(method==="discover")return {peers:[{id:"stale",ip:address,port:43111,label:"Offline computer"},{id:"healthy",ip:"192.168.1.9",port:43112}]};
    if(method==="index"){calls.push({peer:args.peer,at:clock});if(args.peer==="stale"&&failing)throw Error("Peer is offline. Changes remain on this device.");return {head,label:args.peer};}
    if(method==="chunk")return {text:chunks.get(args.hash)};
    throw Error(method);
  }};
  const window={RolecraftSyncCore:C,vaultSync:native},Clock=class extends Date{static now(){return clock;}},anchor="return {supported:!!transport";
  assert(source.includes(anchor));
  vm.runInNewContext(source.replace(anchor,"return {probe:{tick},supported:!!transport"),{window,document:{hidden:false},crypto:crypto.webcrypto,TextEncoder,Date:Clock,setTimeout:(fn,ms)=>ms===50?setTimeout(fn,ms):0,clearTimeout});
  const engine=window.RolecraftVaultSync.create({storage,ready:()=>!locked,canApply:()=>true,imageIds:()=>[],onApplied:async()=>{}});engine.subscribe(state=>states.push(state));
  const count=peer=>calls.filter(call=>call.peer===peer).length;
  try{
    for(const delay of [2000,5000,10000,30000,30000]){
      const before=count("stale"),healthy=count("healthy");await engine.probe.tick();assert.equal(count("stale"),before+1,"due stale endpoint tried once");
      const current=states.at(-1),offline=current.peers.find(peer=>peer.id==="stale");
      assert.equal(offline.online,false);assert.equal(offline.retryAt,clock+delay,"bounded exponential delay");
      assert.equal(current.peers.filter(peer=>peer.online).length,1,"offline peer is not counted as acknowledged/up to date");
      clock+=delay-1;await engine.probe.tick();assert.equal(count("stale"),before+1,"no repeated12second timeout before retry deadline");assert.equal(count("healthy"),healthy+2,"healthy peer still checked every poll");
      assert.equal(states.at(-1).peers.find(peer=>peer.id==="stale").error,offline.error,"offline reason remains visible during backoff");clock++;
    }
    await engine.probe.tick();const old=count("stale");address="192.168.1.88";await engine.probe.tick();assert.equal(count("stale"),old+1,"new authenticated discovery endpoint resets stale-address backoff");
    assert.equal(states.at(-1).peers.find(peer=>peer.id==="stale").retryAt,clock+2000,"address change resets attempt count");
    failing=false;engine.retry();await engine.probe.tick();assert.equal(states.at(-1).peers.filter(peer=>peer.online).length,2,"manual retry reconnects without waiting");
    failing=true;await engine.probe.tick();assert.equal(states.at(-1).peers.find(peer=>peer.id==="stale").retryAt,clock+2000,"successful response resets failure counter");
    const beforeManual=count("stale");engine.retry();await engine.probe.tick();assert.equal(count("stale"),beforeManual+1,"manual retry clears backoff");
    locked=true;await engine.probe.tick();locked=false;const beforeUnlock=count("stale");await engine.probe.tick();assert.equal(count("stale"),beforeUnlock+1,"unlock starts fresh discovery attempts");
    group="new-group";const beforeGroup=count("stale");await engine.probe.tick();assert.equal(count("stale"),beforeGroup+1,"another group never inherits old peer failures");
    assert.equal(data.get("lore:all"),raw,"offline status never changes shared writing");
    console.log("PASS actual index loop:2/5/10/30second capped stale-peer backoff; healthy peers polled throughout; address, success, manual retry, lock and group reset; no false peer acknowledgement");
  }finally{engine.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
