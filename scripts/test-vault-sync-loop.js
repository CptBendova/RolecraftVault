const assert=require("assert"),fs=require("fs"),path=require("path"),os=require("os"),vm=require("vm"),crypto=require("crypto");
const C=require("../app/vault-sync-core"),ChatSync=require("../app/chat-sync-core"),{createTransport,seal,unseal}=require("../app/vault-sync-transport");
const source=fs.readFileSync(path.join(__dirname,"..","app","vault-sync.js"),"utf8");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-loop-")),key=crypto.randomBytes(32).toString("hex"),nodes=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const digest=s=>crypto.createHash("sha256").update(s).digest("hex");
const stories=process.argv.includes("--stories"),namespace="library1",mixed=process.argv.includes("--mixed");
const oversized=process.argv.includes("--oversized"),testSource=oversized?source.replace("STORY_LIMIT=64*1024*1024","STORY_LIMIT=1024"):source;
assert(!oversized||testSource!==source,"The oversized story fixture must lower only the shipped per-conversation limit");
const focus=process.argv.includes("--chat-focus"),earlyStories=process.argv.includes("--early-stories");
function make(name){
  const withStories=stories&&(!mixed||name==="phone"||name==="pc-two");
  const data=new Map([["lore:all",JSON.stringify([{id:name,name,content:name,images:[{imgId:name}]}])],["img:"+name,"data:image/png;base64,"+Buffer.from(name.repeat(100)).toString("base64")]]);
  if(withStories)data.set("chats:all",JSON.stringify([{id:name,title:name,messages:[{id:name+"-reply",role:"assistant",content:"Story from "+name,parentId:null}],leafId:name+"-reply",memories:[],pinnedFacts:oversized&&name==="phone"?"x".repeat(2048):"Remember "+name,branchNames:{[name+"-reply"]:"Original path"}}]));
  let applied=0,status=null,focused=false,applicable=true,imageReads=0,warningSeen=false,oversizeWarningSeen=false,imageBarrier=null;
  const chunkReads=[];
  const storage={get:async k=>{if(!data.has(k))throw Error("key not found");return {value:data.get(k)};},set:async(k,v)=>{data.set(k,v);},fingerprint:async k=>data.has(k)?digest(data.get(k)).slice(0,16):null,fingerprints:async keys=>Object.fromEntries(keys.map(k=>[k,data.has(k)?digest(data.get(k)).slice(0,16):null])),syncImage:async(k,v)=>{if(imageBarrier)await imageBarrier.promise;if(data.has(k)&&data.get(k)!==v)throw Error("Picture collision");data.set(k,v);},syncCommit:async(values,expected)=>{for(const [k,v]of Object.entries(expected))if((data.get(k)||null)!==v)throw Error("Library changed during sync");for(const [k,v]of Object.entries(values))data.set(k,v);}};
  const transport=createTransport({directory:path.join(root,name),protect:s=>Buffer.from(seal(s,key,"fixture")),unprotect:b=>unseal(b.toString(),key,"fixture"),unlocked:()=>true,network:{addresses:()=>["127.0.0.1"],privateIp:ip=>ip==="127.0.0.1",discoveryPort:45102}});
  const window={vaultSync:{call(method,args){if(method==="chunk")chunkReads.push(args.hash);if(method==="chunks")chunkReads.push(...args.hashes);return transport.call(method,args);}}},ctx={window,document:{hidden:false},crypto:crypto.webcrypto,TextEncoder,setTimeout,clearTimeout,console};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,"../app/vault-sync-core.js"),"utf8"),ctx);vm.runInContext(testSource,ctx);
  if(withStories){window.RolecraftChatSync=require("../app/chat-sync-core");vm.runInContext(fs.readFileSync(path.join(__dirname,"../app/private-sync.js"),"utf8"),ctx);}
  for(const method of ["fingerprint","fingerprints","syncImage"]){const original=storage[method];storage[method]=async(...args)=>{if(focused)imageReads++;return original(...args);};}
  const originalGet=storage.get;storage.get=async k=>{if(focused&&/^(img:|th:)/.test(k))imageReads++;return originalGet(k);};
  const engine=window.RolecraftVaultSync.create({storage,namespace,intervalMs:100,ready:()=>true,canApply:()=>applicable,canApplyStories:()=>applicable,imageIds:(kind,r)=>kind==="trash"?(r.record.images||[]).map(i=>i.imgId):(r.images||[]).map(i=>i.imgId),onApplied:()=>applied++,onStoriesApplied:()=>applied++});
  engine.subscribe(s=>{status=s;if(/update.*private Chat/i.test(s.message||""))warningSeen=true;if(/oversized conversation/i.test(s.message||""))oversizeWarningSeen=true;if(s.phase==="preview")engine.approve(s.preview.id);});
  const node={name,withStories,data,engine,transport,chunkReads,focus(value){focused=value;engine.setWorkspacePaused(value);},holdImages(){let release;const promise=new Promise(resolve=>release=resolve);imageBarrier={promise,release};},releaseImages(){if(imageBarrier){imageBarrier.release();imageBarrier=null;}},allow(value){applicable=value;},get imageReads(){return imageReads;},get status(){return status;},get warningSeen(){return warningSeen;},get oversizeWarningSeen(){return oversizeWarningSeen;},get applied(){return applied;}};nodes.push(node);return node;
}
async function until(test,label,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){if(test())return;await pause(100);}throw Error(label+": "+JSON.stringify(nodes.map(n=>({name:n.name,status:n.status})),null,2));}
function acknowledgedSince(mark){return mixed?nodes.filter(n=>n.withStories).every(n=>n.warningSeen):nodes.every(n=>n.status&&n.status.lastSynced>=mark);}
(async()=>{
  if(earlyStories){
    assert(stories&&!mixed,"Early story test needs two private Chat peers");
    const tablet=make("tablet");await tablet.transport.call("configure",{action:"create",label:"tablet",namespace});
    const code=(await tablet.transport.call("invite")).code,phone=make("phone");await phone.transport.call("configure",{action:"join",code,label:"phone",namespace});
    phone.holdImages();phone.focus(true);tablet.engine.start();phone.engine.start();await pause(350);
    assert(!JSON.parse(phone.data.get("chats:all")).some(c=>c.id==="tablet"),"Pairing alone must never import conversations before initial merge approval");
    phone.focus(false);
    await until(()=>{const state=JSON.parse(phone.data.get("sync:state")||"{}");return state.accepted===true&&state.approved!==true;},"Phone explicitly approved initial merge before pictures finish");
    phone.focus(true);phone.releaseImages();
    await until(()=>JSON.parse(phone.data.get("chats:all")).some(c=>c.id==="tablet"),"Accepted phone imports conversations before picture transfer completes");
    assert.notEqual(JSON.parse(phone.data.get("sync:state")).approved,true,"Story-only sync must not falsely mark the unfinished library fully approved");
    assert(!phone.data.has("img:tablet"),"Chat-only sync must not read or import the still-blocked tablet picture");
    phone.focus(false);
    await until(()=>phone.data.has("img:tablet")&&JSON.parse(phone.data.get("sync:state")||"{}").approved===true,"Library and pictures finish after leaving Chat");
    console.log("PASS approved first-merge conversations transfer while photo sync is unfinished, without importing pictures or bypassing consent");return;
  }
  const tablet=make("tablet");await tablet.transport.call("configure",{action:"create",label:"tablet",namespace});const code=(await tablet.transport.call("invite")).code;
  for(const name of ["phone","pc-one","pc-two"]){const n=make(name);await n.transport.call("configure",{action:"join",code,label:name,namespace});}
  let syncMark=Date.now();for(const n of nodes)n.engine.start();
  await until(()=>nodes.every(n=>JSON.parse(n.data.get("lore:all")).length===4),"Initial four-way merge");
  for(const n of nodes)for(const peer of nodes)assert(n.data.has("img:"+peer.name),"Every referenced picture saves before the record appears");
  console.log("PASS actual automatic loop merges four different vaults and verifies every picture");
  if(oversized){
    const normal=["tablet","pc-one","pc-two"];
    await until(()=>nodes.every(n=>normal.every(id=>JSON.parse(n.data.get("chats:all")||"[]").some(chat=>chat.id===id))),"Other conversations still converge beside an oversized Chat");
    await until(()=>nodes.every(n=>n.oversizeWarningSeen),"Every paired device sees incomplete Chat warning");
    assert(JSON.parse(nodes[1].data.get("chats:all")).find(chat=>chat.id==="phone").pinnedFacts.length===2048,"the oversized source Chat remains intact");
    for(const n of nodes.filter(n=>n.name!=="phone"))assert(!JSON.parse(n.data.get("chats:all")).some(chat=>chat.id==="phone"),"the omitted Chat must not be half-imported");
    assert(nodes.every(n=>n.status.phase!=="synced"),"no peer may claim all Chat is up to date");
    console.log("PASS an oversized Chat stays intact and visibly unsynced while the library and other conversations reach every peer");return;
  }
  await until(()=>acknowledgedSince(syncMark),"Acknowledged convergence");
  if(mixed)console.log("PASS private Chat never reports conversations up to date with a paired app that does not publish Chat support");
  console.log(mixed?"PASS mixed peers merge the library without claiming Chat is up to date":"PASS peers report up to date only after their durable published revisions agree");
  syncMark=Date.now();const phone=nodes[1],records=JSON.parse(phone.data.get("lore:all"));records.find(r=>r.id==="tablet").content="Edited later on phone";phone.data.set("lore:all",JSON.stringify(records));
  await until(()=>nodes.every(n=>JSON.parse(n.data.get("lore:all")).find(r=>r.id==="tablet").content==="Edited later on phone"),"Bidirectional edit");
  console.log("PASS phone edits automatically reach the tablet and both computers without new codes");
  if(stories){
    const writers=nodes.filter(n=>n.withStories);
    for(const n of nodes.filter(n=>!n.withStories))assert(!n.data.has("chats:all"),"A library-only device must never import conversations");
    await until(()=>writers.every(n=>JSON.parse(n.data.get("chats:all")).length===writers.length),"All private conversations");
    for(const n of writers)for(const c of JSON.parse(n.data.get("chats:all"))){assert.equal(c.messages[0].content,"Story from "+c.id);assert.equal(c.pinnedFacts,"Remember "+c.id);assert.equal(c.branchNames[c.leafId],"Original path");}
    syncMark=Date.now();const rows=JSON.parse(phone.data.get("chats:all"));rows.find(c=>c.id==="phone").pinnedFacts="Updated on phone";phone.data.set("chats:all",JSON.stringify(rows));
    await until(()=>writers.every(n=>JSON.parse(n.data.get("chats:all")).find(c=>c.id==="phone").pinnedFacts==="Updated on phone"),"Bidirectional memories");
    console.log("PASS conversations, named paths and pinned memories survive four-device sync and later phone edits");
  }
  await until(()=>acknowledgedSince(syncMark),"Second convergence");
  if(stories&&!mixed){
    // Once peers have validated a conversation, changing one other chat must
    // fetch only the changed record, not every large history in the manifest.
    const state=JSON.parse(phone.data.get("sync:state"));
    const unchanged=digest(C.canonical(state.snapshot.entries[JSON.stringify(["conversation","tablet"])]));
    for(const n of nodes)n.chunkReads.length=0;
    const deltaMark=Date.now();
    const rows=JSON.parse(phone.data.get("chats:all"));
    rows.find(c=>c.id==="phone").pinnedFacts="One more changed conversation";
    phone.data.set("chats:all",JSON.stringify(rows));
    await until(()=>nodes.every(n=>JSON.parse(n.data.get("chats:all")).find(c=>c.id==="phone").pinnedFacts==="One more changed conversation"),"One changed conversation reaches every peer");
    await until(()=>acknowledgedSince(deltaMark),"Changed conversation is acknowledged");
    assert(!nodes.some(n=>n.chunkReads.includes(unchanged)),"An unchanged validated conversation must not be downloaded again");
    assert(nodes.some(n=>n.chunkReads.length),"The changed conversation should still be downloaded and verified");
    console.log("PASS changed Chat revisions reuse validated conversations without re-downloading histories");
  }
  if(focus){
    assert(stories&&!mixed,"Focus scenario requires private peers");
    for(const n of nodes)n.focus(true);
    const phoneRows=JSON.parse(phone.data.get("chats:all")),story=phoneRows.find(c=>c.id==="phone");
    story.messages.push({id:"phone-typed",parentId:story.leafId,role:"user",content:"Typed on my phone; read on the tablet."},{id:"reply-pending",parentId:"phone-typed",role:"assistant",content:"",pending:true});story.leafId="reply-pending";
    phone.allow(false);phone.data.set("chats:all",JSON.stringify(phoneRows));
    await until(()=>nodes.filter(n=>n!==phone).every(n=>JSON.parse(n.data.get("chats:all")).some(c=>c.id==="phone"&&c.messages.some(m=>m.id==="phone-typed"))),"Sent user turn reaches open tablets and computers");
    for(const n of nodes.filter(n=>n!==phone)){const c=JSON.parse(n.data.get("chats:all")).find(c=>c.id==="phone");assert.equal(c.leafId,"phone-typed");assert(!c.messages.some(m=>m.pending),"No false interrupted-reply placeholder is imported");}
    const reply=story.messages.find(m=>m.id==="reply-pending");reply.pending=false;reply.content="The completed reply appears on every device.";
    phone.data.set("chats:all",JSON.stringify(phoneRows));phone.allow(true);
    await until(()=>nodes.every(n=>JSON.parse(n.data.get("chats:all")).some(c=>c.id==="phone"&&c.messages.some(m=>m.content===reply.content))),"Completed reply reaches every open Chat device");
    for(const n of nodes)assert.equal(n.imageReads,0,"Chat focus never scans or prepares gallery pictures");
    console.log("PASS open Chat peers share sent turns and completed replies without image work or interrupted placeholders");
    const paused=nodes[2];paused.allow(false);
    const foregroundMark=Date.now();story.memoryPins="An incoming edit must wait for local writing.";phone.data.set("chats:all",JSON.stringify(phoneRows));
    await until(()=>paused.status.phase==="busy","Busy Chat peer defers incoming writes");
    assert.notEqual(JSON.parse(paused.data.get("chats:all")).find(c=>c.id==="phone").memoryPins,story.memoryPins);
    paused.allow(true);await until(()=>JSON.parse(paused.data.get("chats:all")).find(c=>c.id==="phone").memoryPins===story.memoryPins,"Deferred changes resume safely");
    // Each 100ms loop briefly returns to checking. Require every peer's durable
    // acknowledgement of this edit, not four transient UI phases simultaneously.
    await until(()=>nodes.every(n=>n.status.lastSynced>=foregroundMark&&JSON.parse(n.data.get("chats:all")).find(c=>c.id==="phone").memoryPins===story.memoryPins),"Foreground convergence before concurrent edits");
    for(const n of [phone,tablet]){const rows=JSON.parse(n.data.get("chats:all"));rows.find(c=>c.id==="phone").memoryPins="Concurrent writing on "+n.name;n.data.set("chats:all",JSON.stringify(rows));}
    await until(()=>nodes.every(n=>{const rows=JSON.parse(n.data.get("chats:all"));return rows.some(c=>c.memoryPins==="Concurrent writing on phone")&&rows.some(c=>c.memoryPins==="Concurrent writing on tablet");}),"Concurrent foreground edits keep both copies");
    await until(()=>{const signatures=nodes.map(n=>C.canonical(JSON.parse(n.data.get("chats:all")).sort((a,b)=>a.id.localeCompare(b.id))));return signatures.every(value=>value===signatures[0]);},"Every peer converges on the exact same chat messages and conflict copies");
    console.log("PASS concurrent foreground edits retain both versions on every device");
    for(const n of [phone,tablet]){
      const previous=JSON.parse(n.data.get("chats:all")),next=previous.map(c=>c.id==="tablet"?{...c,messages:c.messages.concat({id:"switch-"+n.name,parentId:c.leafId,role:"user",content:"Continued on "+n.name,createdAt:Date.now()}),leafId:"switch-"+n.name,updatedAt:Date.now()}:c);
      n.data.set("chats:all",JSON.stringify(ChatSync.stamp(next,previous,()=>"switch-revision-"+n.name)));
    }
    await until(()=>nodes.every(n=>{const rows=JSON.parse(n.data.get("chats:all")),chat=rows.find(c=>c.id==="tablet");return chat&&rows.filter(c=>c.id==="tablet"||c.id.startsWith("tablet-conflict-")).length===1&&chat.messages.some(m=>m.id==="switch-phone")&&chat.messages.some(m=>m.id==="switch-tablet");}),"Rapidly switching devices keeps both new turns as paths in one conversation");
    await until(()=>{const signatures=nodes.map(n=>C.canonical(JSON.parse(n.data.get("chats:all")).sort((a,b)=>a.id.localeCompare(b.id))));return signatures.every(value=>value===signatures[0]);},"Switched conversation and its branches converge exactly");
    console.log("PASS simultaneous replies on different devices stay in one conversation as alternate paths");
    for(const n of nodes)n.focus(false);
    console.log("PASS chat-only incoming writes wait for editing and full library sync resumes after closing Chat");
  }
  const remaining=JSON.parse(phone.data.get("lore:all")).filter(r=>r.id!=="pc-two");phone.data.set("lore:all",JSON.stringify(remaining));
  await until(()=>nodes.every(n=>!JSON.parse(n.data.get("lore:all")).some(r=>r.id==="pc-two")),"Deletion propagation");
  for(const n of nodes.filter(n=>n!==phone)){assert(JSON.parse(n.data.get("trash:all")).some(t=>t.record.id==="pc-two"));assert(n.data.has("img:pc-two"));}
  console.log("PASS remote deletions are recoverable in the receiving bin and never remove picture bytes");
  await until(()=>acknowledgedSince(0),"Established group");
  tablet.engine.stop();tablet.transport.pause();
  const computer=nodes[2],fresh=make('new-device');
  const invitation=(await computer.transport.call('invite')).code;
  await fresh.transport.call('configure',{action:'join',code:invitation,label:'new-device',namespace});fresh.engine.start();
  await until(()=>JSON.parse(fresh.data.get('lore:all')).some(r=>r.id==='tablet'),'Join through an established computer with starting tablet offline');
  const edits=JSON.parse(computer.data.get('lore:all'));edits.find(r=>r.id==='tablet').content='Computer edit while tablet sleeps';computer.data.set('lore:all',JSON.stringify(edits));
  await until(()=>nodes.filter(n=>n!==tablet).every(n=>JSON.parse(n.data.get('lore:all')).some(r=>r.id==='tablet'&&r.content==='Computer edit while tablet sleeps')),'Equal-peer updates without the starting tablet');
  console.log('PASS a synced computer pairs a new device and exchanges updates while the original tablet is offline');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const n of nodes){n.engine.stop();n.transport.pause();}});
