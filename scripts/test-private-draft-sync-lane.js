"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),os=require("os"),vm=require("vm"),crypto=require("crypto");
const H=require("../app/chat-draft-handoff"),{createTransport,seal,unseal}=require("../app/vault-sync-transport");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-draft-sync-")),key=crypto.randomBytes(32).toString("hex"),nodes=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const source=name=>fs.readFileSync(path.join(__dirname,"..","app",name),"utf8");
const shared={format:1,offers:[],receipts:[]},handoffKey="chats:draft-handoffs";
function make(name,legacy=false){
  const data=new Map([["chats:all","[]"]]);
  const storage={
    get:async key=>{if(!data.has(key))throw Error("key not found");return {value:data.get(key)};},
    set:async(key,value)=>{data.set(key,value);},
    fingerprints:async()=>({}),fingerprint:async()=>null,syncImage:async()=>{throw Error("Unexpected image transfer");},
    syncCommit:async(values,expected)=>{
      for(const [key,value]of Object.entries(expected))if((data.get(key)??null)!==value)throw Error("Library changed during sync");
      for(const [key,value]of Object.entries(values))data.set(key,value);
    }
  };
  const transport=createTransport({directory:path.join(root,name),protect:s=>Buffer.from(seal(s,key,"fixture")),
    unprotect:b=>unseal(b.toString(),key,"fixture"),unlocked:()=>true,
    network:{addresses:()=>["127.0.0.1"],privateIp:ip=>ip==="127.0.0.1",discoveryPort:45122}});
  const window={vaultSync:{call:(method,args)=>transport.call(method,args)},RolecraftChatSync:require("../app/chat-sync-core"),RolecraftChatDraftHandoff:H};
  const context={window,document:{hidden:false},crypto:crypto.webcrypto,TextEncoder,setTimeout,clearTimeout,console};
  vm.createContext(context);
  for(const file of ["vault-sync-core.js","vault-sync.js","private-sync.js"])vm.runInContext(source(file),context,{filename:file});
  if(legacy)delete window.RolecraftSyncCore.draftHandoff;
  let applied=0,status;
  const engine=window.RolecraftVaultSync.create({storage,namespace:"library1",intervalMs:100,ready:()=>true,
    canApply:()=>true,canApplyStories:()=>true,imageIds:()=>[],onApplied:()=>{},onStoriesApplied:()=>{},onDraftHandoffsApplied:()=>{applied++;}});
  engine.subscribe(value=>{status=value;});
  const node={name,legacy,data,storage,transport,engine,draftLane:window.RolecraftSyncCore.draftHandoff,
    get applied(){return applied;},get status(){return status;}};
  nodes.push(node);return node;
}
async function until(predicate,label,timeout=45000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(predicate())return;await pause(50);}
  throw Error(label+": "+JSON.stringify(nodes.map(node=>({name:node.name,status:node.status}))));
}
function lane(node){return JSON.parse(node.data.get(handoffKey)||JSON.stringify(shared));}
async function writeLane(node,value){
  const previous=node.data.get(handoffKey)??null;
  await node.storage.syncCommit({[handoffKey]:JSON.stringify(value)},{[handoffKey]:previous});
  node.engine.localDraftHandoffSaved();
}
(async()=>{
  const owner=make("owner"),receiver=make("receiver"),oldPeer=make("old-peer",true);
  const created=await owner.transport.call("configure",{action:"create",label:"owner",namespace:"library1"});
  const code=(await owner.transport.call("invite")).code;
  const joined=await receiver.transport.call("configure",{action:"join",code,label:"receiver",namespace:"library1"});
  const oldJoined=await oldPeer.transport.call("configure",{action:"join",code,label:"old-peer",namespace:"library1"});
  for(const [node,cfg]of [[owner,created],[receiver,joined],[oldPeer,oldJoined]]){
    node.data.set("sync:state",JSON.stringify({group:cfg.group,approved:true,accepted:true,images:{},snapshot:{format:1,entries:{}}}));
    node.engine.setWorkspacePaused(true);node.engine.start();
  }
  await until(()=>nodes.every(node=>node.status&&node.status.settings&&node.status.settings.enabled),"paired sync starts");
  await until(()=>nodes.every(node=>node.status.phase==="synced"),"empty Chat extension stays revision-compatible with old peers");
  assert(owner.status.peers.some(peer=>peer.id===joined.device&&peer.label==="receiver"&&peer.online),
    "story-only sync status names the online handoff target: "+JSON.stringify(owner.status.peers));
  const now=Date.now(),offer=H.createOffer({revision:crypto.randomUUID(),ownerDeviceId:created.device,
    targetDeviceId:joined.device,chatId:"shared-story",chatRevision:"revision-1",leafId:"turn-1",
    text:"Secret unsent bridge scene 🐉",now,ttlMs:60*60*1000});
  await writeLane(owner,{format:1,offers:[offer],receipts:[]});
  await until(()=>lane(receiver).offers.some(value=>value.revision===offer.revision),"explicit offer reaches current peer");
  assert(!oldPeer.data.has(handoffKey),"older Chat peer must ignore the optional draft descriptor");
  assert(receiver.applied>0,"incoming offer is announced after encrypted local persistence");
  const stale=JSON.stringify(shared);
  await assert.rejects(receiver.storage.syncCommit({[handoffKey]:stale},{[handoffKey]:null}),/Library changed/,
    "a stale local draft writer cannot overwrite a received offer");
  const claim=H.consume(offer,{now:Date.now(),deviceId:joined.device,pairedDeviceIds:[created.device,joined.device],
    expectedRevision:offer.revision,chatId:offer.chatId,chatRevision:offer.chatRevision,leafId:offer.leafId,
    liveDraft:"",savedDraft:"",receipts:[]});
  assert(claim.ok);
  await writeLane(receiver,{...lane(receiver),receipts:[claim.receipt]});
  await until(()=>lane(owner).receipts.some(value=>value.revision===offer.revision),"receipt reaches offer owner");
  assert.equal(lane(owner).offers[0].text,offer.text,"acknowledgement does not erase the original offer");
  assert.throws(()=>owner.draftLane.merge([
    {format:1,offers:[offer],receipts:[claim.receipt]},
    {format:1,offers:[offer],receipts:[{...claim.receipt,consumedAt:claim.receipt.consumedAt+1}]}
  ],Date.now()),/conflicting data/,"one receipt identity cannot silently change its acknowledgement");
  await owner.engine.setManualRefresh(true);
  const second=H.createOffer({revision:crypto.randomUUID(),ownerDeviceId:created.device,targetDeviceId:joined.device,
    chatId:"shared-story",chatRevision:"revision-1",leafId:"turn-1",text:"Manually shared second scene",
    now:Date.now(),ttlMs:60*60*1000});
  await writeLane(owner,{...lane(owner),offers:[...lane(owner).offers,second]});
  await until(()=>lane(receiver).offers.some(value=>value.revision===second.revision),
    "manual-refresh source passively serves a newly saved offer");
  await owner.engine.setManualRefresh(false);
  for(const node of nodes)node.engine.setWorkspacePaused(false);
  const third=H.createOffer({revision:crypto.randomUUID(),ownerDeviceId:created.device,targetDeviceId:joined.device,
    chatId:"shared-story",chatRevision:"revision-1",leafId:"turn-1",text:"Full vault pass offer",
    now:Date.now(),ttlMs:60*60*1000});
  await writeLane(owner,{...lane(owner),offers:[...lane(owner).offers,third]});
  await until(()=>lane(receiver).offers.some(value=>value.revision===third.revision),
    "full vault pass preserves and merges the separate draft lane");
  await until(()=>owner.status.peers.some(peer=>peer.id===joined.device&&peer.label==="receiver"&&peer.online),
    "full sync status names the online handoff target");
  const row={id:"shared-story",title:"Shared story",messages:[{id:"turn-1",parentId:null,role:"user",content:"A sent turn"}],
    leafId:"turn-1",memories:[],pinnedFacts:"Transcript still syncs",branchNames:{}};
  owner.data.set("chats:all",JSON.stringify([row]));owner.engine.localStorySaved();
  await until(()=>[receiver,oldPeer].every(node=>JSON.parse(node.data.get("chats:all")).some(value=>value.id===row.id)),
    "conversation reaches new and old Chat peers");
  assert(!oldPeer.data.has(handoffKey),"old peer still receives no draft-lane storage record");
  owner.data.set(handoffKey,"{damaged draft lane");
  row.pinnedFacts="A later sent edit still transfers";
  owner.data.set("chats:all",JSON.stringify([row]));owner.engine.localStorySaved();
  await until(()=>[receiver,oldPeer].every(node=>JSON.parse(node.data.get("chats:all"))
    .some(value=>value.id===row.id&&value.pinnedFacts===row.pinnedFacts)),
    "invalid optional draft lane does not block conversation sync");
  assert.equal(owner.data.get(handoffKey),"{damaged draft lane","sync never overwrites invalid local draft data");
  const packetBytes=fs.readdirSync(root,{recursive:true}).filter(file=>typeof file==="string"&&fs.statSync(path.join(root,file)).isFile())
    .map(file=>fs.readFileSync(path.join(root,file))).map(buffer=>buffer.toString("utf8")).join("\n");
  assert(!packetBytes.includes(offer.text),"native sync cache holds no plaintext draft offer");
  console.log("PASS explicit encrypted draft-offer and receipt convergence, storage CAS, old-peer Chat compatibility, and no plaintext sync cache");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{for(const node of nodes){node.engine.stop();node.transport.pause();}});
