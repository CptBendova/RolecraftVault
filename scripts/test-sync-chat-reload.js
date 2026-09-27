/* Execute the shipped Chat reload/load/persist functions alongside the real sync engine. */
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm"),crypto=require("crypto");
const root=path.join(__dirname,".."),read=file=>fs.readFileSync(path.join(root,file),"utf8"),Sync=require("../app/chat-sync-core");
const chatSource=read("app/chat.js"),engineSource=read("app/vault-sync.js"),hash=text=>crypto.createHash("sha256").update(text).digest("hex");
const helperWindow={storage:{},RolecraftChatSync:Sync,React:{createElement(){},useState(){},useEffect(){},useMemo(){},useRef(){}},ReactDOM:{createRoot:()=>({render(){}})}};
vm.runInNewContext(chatSource,{window:helperWindow,document:{createElement:()=>({}),body:{appendChild(){}}}});
const I=helperWindow.__rcvChatInternals;
function sourceBetween(start,end){const a=chatSource.indexOf(start),b=chatSource.indexOf(end,a);assert(a>=0&&b>a,"shipped Chat function boundary");return chatSource.slice(a,b);}
function sourceLine(needle){const line=chatSource.split("\n").find(line=>line.includes(needle));assert(line,needle);return line;}
function chatReload(storage){
  let revisions=0,renderedChats=[],renderedLibrary=null;
  const notices=[];
  const context={window:{storage,CustomEvent:function(type,options){this.type=type;this.detail=options&&options.detail;},dispatchEvent:event=>notices.push(event)},document:{querySelector:()=>null},Sync,CHAT_KEY:"chats:all",GROUP_ROUNDS_KEY:"ui:chat-group-rounds",parseChats:I.parseChats,captureCast:I.captureCast,
    saveFailed:{current:false},busyRef:{current:false},linkBusy:{current:false},pendingSaves:{current:0},epoch:{current:0},saveQueue:{current:Promise.resolve()},plannedRef:{current:[]},savedRawRef:{current:null},chatsRef:{current:[]},ackRef:{current:[]},linkRef:{current:null},deviceSyncReload:{current:null},draftRef:{current:{}},roundPlansRef:{current:{}},ready:true,edit:null,activeId:"story",linkNative:null,
    activeIdRef:{current:"story"},
    uid:()=>"reload-revision-"+(++revisions),setLibrary:value=>renderedLibrary=value,setChats:value=>renderedChats=value,setReady:value=>context.ready=value,
    setError(){},setOpen(){},setNewOpen(){},setActiveId(){},setLinkStatus(){},setSaved(){},setLink(){},setDraft(){},setBucketCovers(){},setRoundPlans(){},setLoadErrorOpen(){}};
  vm.createContext(context);
  const helpers=sourceBetween("  var valueOf =","  function parseChats(");
  vm.runInContext(helpers+"\n"+sourceBetween("  function validRoundPlan(","  function inspectRoundPlan(")+"\n"+sourceBetween("    function load(","    function save(next)")+"\n"+sourceLine("deviceSyncReload.current =")+"\n"+sourceLine("window.RolecraftChatReloadAfterSync =")+"\n"+sourceLine("window.RolecraftChatSyncIdle =")+"\n"+sourceBetween("    window.RolecraftChatReloadStories = async function () {","    var native = useMemo("),context);
  return {context,notices,normal:async()=>{await context.load();await context.saveQueue.current;await Promise.resolve();},afterSync:()=>context.window.RolecraftChatReloadAfterSync(),storyReload:()=>context.window.RolecraftChatReloadStories(),idle:()=>context.window.RolecraftChatSyncIdle(),get chats(){return renderedChats;},get library(){return renderedLibrary;}};
}
function makeStory(character){return Sync.stamp([I.captureCast({id:"story",characterId:"hero",messages:[{id:"u1",role:"user",content:"Saved conversation history"}],leafId:"u1"},{chars:[character],personas:[],lore:[]})],[],()=>"initial-revision")[0];}
function basicStorage(data){const direct=[];return {direct,get:async key=>data.has(key)?{value:data.get(key)}:Promise.reject(Error("key not found: "+key)),set:async(key,value)=>{direct.push(key);data.set(key,value);},syncCommit:async(values,expected)=>{for(const[key,value]of Object.entries(expected))if((data.get(key)??null)!==value)throw Error("Library changed during sync: "+key);for(const[key,value]of Object.entries(values)){direct.push(key);data.set(key,value);}}};}
async function reloadChecks(){
  const character={id:"hero",name:"Fixture hero",description:"Original profile"},story=makeStory(character),data=new Map([["chars:all",JSON.stringify([character])],["chats:all",Sync.canonical([story])]]),storage=basicStorage(data),reload=chatReload(storage);
  const before=data.get("chats:all");await reload.normal();
  assert.equal(storage.direct.length,0,"normal no-op load must not rewrite encrypted chat storage just to reorder object properties");assert.equal(data.get("chats:all"),before);
  data.set("chars:all",JSON.stringify([{...character,description:"Incoming character profile"}]));await reload.afterSync();await reload.context.saveQueue.current;
  assert.equal(storage.direct.length,0,"sync-triggered reload must not rewrite stored cast profiles or revisions");assert.equal(data.get("chats:all"),before);assert.equal(reload.library.chars[0].description,"Incoming character profile","UI still receives refreshed character data");
  const incoming={...story,messages:story.messages.concat({id:"u2",parentId:"u1",role:"user",content:"A new turn from the phone"}),leafId:"u2",updatedAt:2,_sync:{rev:"incoming-turn",ancestors:[story._sync.rev],deleted:false}};
  data.set("chats:all",JSON.stringify([incoming]));await reload.afterSync();
  assert.equal(reload.notices.at(-1).type,"rcv-chat-handoff","a successful full-library sync reload emits a handoff notice");
  assert.equal(reload.notices.at(-1).detail.active.kind,"advanced");
  assert(!JSON.stringify(reload.notices.at(-1)).includes("A new turn from the phone"),"handoff notice contains no story text");
  const incomingAgain={...incoming,messages:incoming.messages.concat({id:"a3",parentId:"u2",role:"assistant",content:"Another saved reply"}),leafId:"a3",updatedAt:3,_sync:{rev:"incoming-reply",ancestors:[story._sync.rev,incoming._sync.rev],deleted:false}};
  data.set("chats:all",JSON.stringify([incomingAgain]));await reload.storyReload();
  assert.equal(reload.notices.at(-1).type,"rcv-chat-handoff","a successful lightweight chat reload emits a handoff notice");
  assert.equal(reload.notices.at(-1).detail.active.kind,"advanced");
  assert.equal(storage.direct.length,0,"handoff notification never rewrites synced chat storage");
  data.set("chats:all",before);await reload.storyReload();
  await reload.normal();assert.equal(storage.direct.filter(key=>key==="chats:all").length,1,"ordinary open still saves a genuinely changed character snapshot");assert.equal(JSON.parse(data.get("chats:all"))[0].castSnapshot.character.description,"Incoming character profile");
  const legacy={...story};delete legacy._sync;data.set("chats:all",JSON.stringify([legacy]));const legacyWrites=storage.direct.length;await reload.normal();assert.equal(storage.direct.length,legacyWrites+1);assert(Sync.validate(JSON.parse(data.get("chats:all")))[0]._sync.rev,"ordinary load stamps a missing legacy revision");
  const pending={...JSON.parse(data.get("chats:all"))[0],messages:[{id:"a1",role:"assistant",content:"Saved partial reply",pending:true}],leafId:"a1"};
  const previous=pending._sync.rev;data.set("chats:all",JSON.stringify([pending]));await reload.normal();
  const recovered=JSON.parse(data.get("chats:all"))[0];assert.equal(recovered.messages[0].pending,false);assert.equal(recovered.messages[0].content,"Saved partial reply");assert.match(recovered.messages[0].error,/interrupted/);assert.notEqual(recovered._sync.rev,previous,"recovering a pending reply is a new revision, not different content under the same revision");assert(recovered._sync.ancestors.includes(previous));
  const incomingPending={...recovered,messages:[{id:"a2",role:"assistant",content:"Incoming saved partial",pending:true}],leafId:"a2",_sync:{rev:"incoming-pending",ancestors:[recovered._sync.rev],deleted:false}},pendingRaw=JSON.stringify([incomingPending]);data.set("chats:all",pendingRaw);const beforeSync=storage.direct.length;await reload.afterSync();
  assert.equal(data.get("chats:all"),pendingRaw,"sync reload displays interrupted content without rewriting the received revision");assert.equal(storage.direct.length,beforeSync);assert.equal(reload.chats[0].messages[0].pending,false);
  await reload.context.persist(reload.chats.map(chat=>({...chat,pinnedFacts:"A later real user save"})));
  const savedAfterReload=JSON.parse(data.get("chats:all"))[0];assert.notEqual(savedAfterReload._sync.rev,"incoming-pending");assert(savedAfterReload._sync.ancestors.includes("incoming-pending"),"later real saves descend from the actual stored revision, not the display-normalized copy");
  console.log("PASS actual Chat load/reload: no-op reads do not write; sync reload stays read-only; normal profile, legacy and pending-reply changes retain revisions");
}
async function heldReloadChecks(){
  for(const fromSync of [false,true])for(const interruption of ["edit","lock"]){
    const character={id:"hero",name:"Fixture hero",description:"Original profile"},story=makeStory(character),data=new Map([["chars:all",JSON.stringify([character])],["chats:all",JSON.stringify([story])]]),storage=basicStorage(data),reload=chatReload(storage);
    await reload.normal();const get=storage.get;let release,entered;
    const held=new Promise(resolve=>release=resolve),readStarted=new Promise(resolve=>entered=resolve);
    storage.get=async key=>{const result=await get(key);if(key==="chats:all"){entered();await held;}return result;};
    const pending=fromSync?reload.afterSync():reload.context.load();await readStarted;
    const before=data.get("chats:all");let newer;
    if(interruption==="edit"){
      newer=reload.context.chatsRef.current.map(chat=>({...chat,messages:chat.messages.concat({id:"u2",role:"user",content:"Typed while the old read was pending",parentId:chat.leafId}),leafId:"u2"}));
      reload.context.chatsRef.current=newer;reload.context.setChats(newer);await reload.context.persist(newer);
    }else{
      reload.context.epoch.current++;reload.context.chatsRef.current=[];reload.context.plannedRef.current=[];reload.context.setChats([]);reload.context.setLibrary({chars:[],personas:[],lore:[]});reload.context.setReady(false);
    }
    release();if(fromSync)await assert.rejects(pending,/Chat changed during sync/);else await pending;await reload.context.saveQueue.current;
    assert.equal(reload.context.pendingSaves.current,0,"abandoned reload releases its pending-save guard");
    if(interruption==="edit"){
      assert.strictEqual(reload.context.chatsRef.current,newer,"a stale storage read must not replace a newer local chat array");assert.strictEqual(reload.chats,newer,"a stale reload must not roll back the visible conversation");
      assert.equal(JSON.parse(data.get("chats:all"))[0].messages.at(-1).content,"Typed while the old read was pending");assert.equal(reload.context.plannedRef.current[0]._sync.rev,newer[0]._sync.rev,"stale reload must not roll back the saved ancestry baseline");assert.equal(storage.direct.length,1,"only the real local edit writes storage");
    }else{
      assert.equal(reload.chats.length,0);assert.equal(reload.library.chars.length,0);assert.equal(reload.context.ready,false,"late unlocked read must not reveal the vault after a lock");assert.equal(data.get("chats:all"),before);assert.equal(storage.direct.length,0,"late locked read never writes a recovered or refreshed chat");
    }
  }
  console.log("PASS actual normal/sync reloads discard held reads after a newer local save or vault lock; UI, ancestry and stored edits remain intact");
}
async function saveRaceChecks(){
  const character={id:"hero",name:"Fixture hero",description:"Original profile"},story=makeStory(character);
  const data=new Map([["chars:all",JSON.stringify([character])],["chats:all",JSON.stringify([story])]]),storage=basicStorage(data),reload=chatReload(storage);
  await reload.normal();
  const originalCommit=storage.syncCommit;let release,entered;
  const held=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
  let first=true;
  storage.syncCommit=async(values,expected)=>{if(first){first=false;entered();await held;}return originalCommit(values,expected);};
  const local1=reload.context.chatsRef.current.map(chat=>({...chat,messages:chat.messages.concat({id:"local-1",parentId:chat.leafId,role:"user",content:"First local turn"}),leafId:"local-1"}));
  reload.context.chatsRef.current=local1;reload.context.setChats(local1);
  const saving1=reload.context.persist(local1);await started;
  const local2=local1.map(chat=>({...chat,messages:chat.messages.concat({id:"local-2",parentId:chat.leafId,role:"user",content:"Second queued local turn"}),leafId:"local-2"}));
  reload.context.chatsRef.current=local2;reload.context.setChats(local2);
  const saving2=reload.context.persist(local2);
  const incoming=Sync.stamp([{...story,messages:story.messages.concat({id:"remote-1",parentId:story.leafId,role:"assistant",content:"Newer turn from the tablet"}),leafId:"remote-1"}],[story],()=>"remote-revision")[0];
  data.set("chats:all",JSON.stringify([incoming]));release();
  await assert.rejects(saving1,/Library changed/);await assert.rejects(saving2,/earlier chat save failed/);
  assert.equal(JSON.parse(data.get("chats:all"))[0].messages.at(-1).content,"Newer turn from the tablet","queued stale local saves never replace the newer tablet transcript");
  assert.equal(reload.context.saveFailed.current,true);assert.equal(reload.idle(),false,"device sync must not acknowledge a failed local save");
  await reload.context.retrySave();
  const recovered=JSON.parse(data.get("chats:all"));Sync.validate(recovered);
  const texts=recovered.flatMap(chat=>chat.messages.map(message=>message.content));
  for(const text of ["Newer turn from the tablet","First local turn","Second queued local turn"])assert(texts.includes(text),"retry preserves "+text);
  assert(recovered.length>=2,"divergent Chat branches remain recoverable as separate conversations");
  assert.equal(reload.context.savedRawRef.current,data.get("chats:all"));assert.equal(reload.context.saveFailed.current,false);
  assert.equal(reload.idle(),true,"sync may resume only after the merged Chat is durably saved");
  console.log("PASS actual Chat CAS rejects a stale save and its queued successor; Retry save keeps both newer remote and unsaved local story versions");
}
async function integration(editDuringPictures){
  const data=new Map(),chunks=new Map(),heads=new Map(),states=[],imageWrites=new Map(),beforeChar={id:"hero",name:"Fixture hero",description:"Old profile"},afterChar={...beforeChar,description:"Updated on tablet"};let edited=false;
  const window={RolecraftChatSync:Sync},context={window,document:{hidden:false},crypto:crypto.webcrypto,TextEncoder,Date,setTimeout:(fn,ms)=>ms<=50?setTimeout(fn,ms):0,clearTimeout};vm.createContext(context);vm.runInContext(read("app/vault-sync-core.js"),context);vm.runInContext(read("app/private-sync.js"),context);const C=window.RolecraftSyncCore;
  data.set("chars:all",JSON.stringify([beforeChar]));data.set("chats:all",JSON.stringify([makeStory(beforeChar)]));
  const raw=Object.fromEntries(data),base=await C.scan(C.collect(raw),null,"local",hash);data.set("sync:state",JSON.stringify({group:"fixture",approved:true,accepted:true,snapshot:base,images:{}}));
  const pack=text=>{const id=hash(text);chunks.set(id,text);return {hash:id,parts:[id],bytes:Buffer.byteLength(text)};};
  for(const peer of ["tablet","phone"]){
    const rows={...raw,"chars:all":JSON.stringify([afterChar]),"lore:all":JSON.stringify([{id:"lore-"+peer,content:"New writing from "+peer,images:[{imgId:peer}]}])},snapshot=await C.scan(C.collect(rows),base,peer,hash),library={format:1,entries:{}},stories={format:1,entries:{}};
    for(const[key,value]of Object.entries(snapshot.entries))(C.parts(key)[0]==="conversation"?stories:library).entries[key]=value;
    heads.set(peer,{format:1,index:pack(C.canonical({format:1,group:"fixture",snapshot:library,images:{["img:"+peer]:pack("Exact original "+peer)}})),revision:hash(C.canonical(library)),established:true,extensions:{stories1:{index:pack(C.canonical({format:1,group:"fixture",snapshot:stories,images:{}})),revision:hash(C.canonical(stories))}}});
  }
  const storage=basicStorage(data);
  storage.fingerprint=async key=>data.has(key)?hash(data.get(key)):null;
  storage.fingerprints=async keys=>Object.fromEntries(keys.map(key=>[key,data.has(key)?hash(data.get(key)):null]));
  storage.syncImage=async(key,value)=>{
    assert(!data.has(key)||data.get(key)===value);data.set(key,value);imageWrites.set(key,(imageWrites.get(key)||0)+1);
    if(editDuringPictures&&!edited&&imageWrites.size===2){edited=true;const rows=JSON.parse(data.get("chats:all"));rows[0].pinnedFacts="Actual user edit during image transfer";await storage.set("chats:all",JSON.stringify(rows));}
  };
  storage.syncCommit=async(values,expected)=>{for(const[key,value]of Object.entries(expected))if((data.get(key)??null)!==value)throw Error("Library changed during sync: "+key);for(const[key,value]of Object.entries(values))data.set(key,value);};
  const reload=chatReload(storage);
  window.vaultSync={call:async(method,args={})=>{if(method==="status")return {enabled:true,group:"fixture",device:"local",primary:"tablet"};if(["pause","beginPublish","retain","publish"].includes(method))return {};if(method==="put")return {hash:pack(args.text).hash};if(method==="discover")return {peers:[{id:"tablet"},{id:"phone"}]};if(method==="index")return {head:heads.get(args.peer),label:args.peer};if(method==="chunk")return {text:chunks.get(args.hash)};throw Error(method);}};
  const anchor="return {supported:!!transport";assert(engineSource.includes(anchor));vm.runInContext(engineSource.replace(anchor,"return {probe:{tick},supported:!!transport"),context);
  const engine=window.RolecraftVaultSync.create({storage,ready:()=>true,canApply:reload.idle,imageIds:(_kind,row)=>(row.images||[]).map(image=>image.imgId),onApplied:reload.afterSync});engine.subscribe(state=>states.push(state));
  try{
    await engine.probe.tick();await reload.context.saveQueue.current;
    if(editDuringPictures){
      assert.equal(states.at(-1).phase,"error");assert.match(states.at(-1).message,/Library changed/);assert.equal(JSON.parse(data.get("chars:all"))[0].description,afterChar.description,"earlier completed record remains saved");
      const checkpoint=JSON.parse(data.get("sync:state"));for(const peer of ["tablet","phone"]){assert.equal(data.get("img:"+peer),"Exact original "+peer);assert(checkpoint.images["img:"+peer],"completed picture progress survives a real edit");}
      assert.equal(JSON.parse(data.get("chats:all"))[0].pinnedFacts,"Actual user edit during image transfer","CAS never overwrites a real local edit");await engine.probe.tick();
    }
    assert.notEqual(states.at(-1).phase,"error",states.at(-1).message);assert.equal(JSON.parse(data.get("lore:all")||"[]").length,2,"all records from both other devices commit in the same pass without self-generated reload conflicts");
    assert.equal(storage.direct.filter(key=>key==="chats:all").length,editDuringPictures?1:0,"UI refresh never adds unsolicited chat writes");
    for(const peer of ["tablet","phone"]){assert.equal(data.get("img:"+peer),"Exact original "+peer);assert.equal(imageWrites.get("img:"+peer),1,"saved picture bytes are not downloaded/written again after retry");}
    assert.equal(JSON.parse(data.get("chats:all"))[0].messages[0].content,"Saved conversation history");
    if(editDuringPictures)assert.equal(JSON.parse(data.get("chats:all"))[0].pinnedFacts,"Actual user edit during image transfer");
    console.log("PASS actual sync engine + shipped Chat reload: "+(editDuringPictures?"real edit protected, completed records/images retained and resumed once":"three open devices apply changed character profiles and both peer libraries without a self-conflict"));
  }finally{engine.stop();}
}
(async()=>{await reloadChecks();await heldReloadChecks();await saveRaceChecks();await integration(false);await integration(true);})().catch(error=>{console.error(error);process.exitCode=1;});
