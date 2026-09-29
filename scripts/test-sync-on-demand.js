// 1.338: sync must never interrupt the user. Exercises the shipped engine over
// the real encrypted LAN transport with two paired devices:
//  - a device that never chose a mode is on-demand (defaultManual) and neither
//    polls peers nor imports anything until Sync now; an explicit "0" stays automatic
//  - chats that arrive through the library lane reload Chat only, and never raise
//    the full-screen library "applying" overlay
//  - Chat typing/streaming postpones background Chat work without losing it
//  - a refused UI reload does not raise the overlay again and backs off
//  - routine unchanged polls do not repaint listeners every pass
const assert=require("assert"),fs=require("fs"),path=require("path"),os=require("os"),vm=require("vm"),crypto=require("crypto");
const {createTransport,seal,unseal}=require("../app/vault-sync-transport");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-on-demand-")),key=crypto.randomBytes(32).toString("hex"),nodes=[],namespace="library1";
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const digest=s=>crypto.createHash("sha256").update(s).digest("hex");
// The app shows its blocking overlay for exactly this condition (app.js).
const overlay=s=>s.phase==="applying"&&!s.chatOnly&&!s.reloadOnly;
function make(name,{manualPreference=null,defaultManual=true}={}){
  const data=new Map([["lore:all",JSON.stringify([{id:name,name,content:name,images:[]}])],["chats:all",JSON.stringify([{id:name,title:name,messages:[{id:name+"-m1",role:"assistant",content:"Story from "+name,parentId:null}],leafId:name+"-m1",memories:[]}])]]);
  if(manualPreference!==null)data.set("ui:sync-manual-refresh",manualPreference);
  const node={name,data,statuses:[],calls:[],chatReads:0,applied:0,storiesApplied:0,quiet:false,refuseReload:false,reloadAttempts:0};
  const storage={get:async k=>{if(k==="chats:all")node.chatReads++;if(!data.has(k))throw Error("key not found");return {value:data.get(k)};},set:async(k,v)=>{data.set(k,v);},
    fingerprint:async k=>data.has(k)?digest(data.get(k)).slice(0,16):null,fingerprints:async keys=>Object.fromEntries(keys.map(k=>[k,data.has(k)?digest(data.get(k)).slice(0,16):null])),
    syncImage:async(k,v)=>{data.set(k,v);},
    syncCommit:async(values,expected)=>{for(const [k,v]of Object.entries(expected))if((data.get(k)||null)!==v)throw Error("Library changed during sync");for(const [k,v]of Object.entries(values))data.set(k,v);}};
  const transport=createTransport({directory:path.join(root,name),protect:s=>Buffer.from(seal(s,key,"fixture")),unprotect:b=>unseal(b.toString(),key,"fixture"),unlocked:()=>true,network:{addresses:()=>["127.0.0.1"],privateIp:ip=>ip==="127.0.0.1",discoveryPort:45112}});
  const window={vaultSync:{call(method,args){node.calls.push(method);return transport.call(method,args);}}};
  const ctx={window,document:{hidden:false},crypto:crypto.webcrypto,TextEncoder,setTimeout,clearTimeout,console};vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../app/vault-sync-core.js"),"utf8"),ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../app/vault-sync.js"),"utf8"),ctx);
  window.RolecraftChatSync=require("../app/chat-sync-core");vm.runInContext(fs.readFileSync(path.join(__dirname,"../app/private-sync.js"),"utf8"),ctx);
  const reload=async()=>{node.reloadAttempts++;if(node.refuseReload)throw Error("Chat is busy. Retrying the conversation refresh after the current edit finishes.");};
  node.engine=window.RolecraftVaultSync.create({storage,namespace,intervalMs:100,defaultManual,ready:()=>true,canApply:()=>true,canApplyStories:()=>true,storiesQuiet:()=>node.quiet,
    imageIds:()=>[],onApplied:async()=>{node.applied++;await reload();},onStoriesApplied:async()=>{node.storiesApplied++;await reload();}});
  node.engine.subscribe(s=>{node.status=s;node.statuses.push(s);if(s.phase==="preview")node.engine.approve(s.preview.id);});
  node.transport=transport;nodes.push(node);return node;
}
async function until(test,label,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(test())return;await pause(50);}throw Error(label+": "+JSON.stringify(nodes.map(n=>({name:n.name,status:n.status&&{phase:n.status.phase,message:n.status.message}}))));}
const chats=n=>JSON.parse(n.data.get("chats:all"));
function addTurn(n,chatId,id,text){const rows=chats(n),c=rows.find(r=>r.id===chatId);c.messages=c.messages.concat({id,role:"user",content:text,parentId:c.leafId,createdAt:Date.now()});c.leafId=id;n.data.set("chats:all",JSON.stringify(rows));}
(async()=>{
  // Tablet has explicitly chosen automatic sync; the phone never chose.
  const tablet=make("tablet",{manualPreference:"0"});
  await tablet.transport.call("configure",{action:"create",label:"tablet",namespace});
  const code=(await tablet.transport.call("invite")).code;
  const phone=make("phone");await phone.transport.call("configure",{action:"join",code,label:"phone",namespace});
  tablet.engine.start();phone.engine.start();
  await until(()=>phone.status&&phone.status.manualRefresh===true&&["manual","waiting"].includes(phone.status.phase),"phone starts on demand");
  assert.equal(phone.status.manualRefresh,true,"an unset preference follows the on-demand default");
  await pause(600);
  assert(!phone.calls.includes("index")&&!phone.calls.includes("discover"),"on-demand device must not contact peers before Sync now: "+phone.calls.join(","));
  assert(!chats(phone).some(c=>c.id==="tablet"),"nothing is imported before Sync now");
  assert.equal(tablet.status.manualRefresh,false,"an explicit automatic choice is kept");
  console.log("PASS a device that never chose syncs only on demand; an explicit automatic choice is respected");

  // Sync now: the first merge is approved and both libraries converge.
  phone.engine.retry();
  await until(()=>chats(phone).some(c=>c.id==="tablet")&&JSON.parse(phone.data.get("lore:all")).length===2,"Sync now imports on demand");
  await until(()=>chats(tablet).some(c=>c.id==="phone"),"automatic tablet receives the phone's published chats");
  console.log("PASS Sync now exchanges library and chats on request");

  // A chat saved on the phone reaches the automatic tablet through its library
  // lane: Chat reloads, the library is not redrawn, and no overlay appears.
  tablet.statuses.length=0;const appliedBefore=tablet.applied,storiesBefore=tablet.storiesApplied;
  addTurn(phone,"phone","phone-2","Typed on the phone");phone.engine.localStorySaved();
  await until(()=>chats(tablet).find(c=>c.id==="phone").messages.some(m=>m.id==="phone-2"),"phone chat turn reaches tablet");
  assert.equal(tablet.applied,appliedBefore,"a chats-only change must not reload the whole library");
  assert(tablet.storiesApplied>storiesBefore,"Chat reloads the incoming conversation");
  assert(!tablet.statuses.some(overlay),"a chats-only change must never raise the full-screen saving overlay");
  console.log("PASS chats arriving through the library lane reload Chat only, without the saving overlay");

  // Routine unchanged polls on the automatic tablet stay silent. (Its on-demand
  // partner only confirms revisions when asked, so it settles on "waiting to
  // confirm" rather than Up to date; that settled state must not repaint.)
  await pause(1000);tablet.statuses.length=0;await pause(1500);
  assert(tablet.statuses.length<=1,"unchanged polls must not repaint listeners every pass: "+tablet.statuses.map(s=>s.phase).join(","));
  console.log("PASS unchanged automatic polls do not flash Checking or repaint the app");

  // Typing/streaming postpones the on-demand device's own chat publication.
  phone.quiet=true;const readsBefore=phone.chatReads;
  addTurn(phone,"phone","phone-3","Still typing");phone.engine.localStorySaved();
  await pause(700);
  assert.equal(phone.chatReads,readsBefore,"Chat table is not read or hashed while the user types");
  phone.quiet=false;
  await until(()=>phone.chatReads>readsBefore,"postponed publication runs once typing stops");
  await until(()=>chats(tablet).find(c=>c.id==="phone").messages.some(m=>m.id==="phone-3"),"postponed publication still reaches the tablet");
  console.log("PASS Chat work waits for typing to pause, then publishes without losing the turn");

  // A refused Chat reload keeps its obligation, never re-raises the overlay and backs off.
  tablet.refuseReload=true;tablet.statuses.length=0;const attemptsBefore=tablet.reloadAttempts;
  addTurn(phone,"tablet","phone-4","Reply to the tablet story");phone.engine.localStorySaved();
  await until(()=>chats(tablet).find(c=>c.id==="tablet").messages.some(m=>m.id==="phone-4"),"committed while Chat refuses its reload");
  await pause(2500);
  const retries=tablet.reloadAttempts-attemptsBefore;
  assert(retries>=2&&retries<=8,"refused reload retries with back-off, not every 100 ms pass: "+retries);
  assert(!tablet.statuses.some(overlay),"retrying an already-saved reload must not cover the app");
  tablet.refuseReload=false;
  const resumed=tablet.reloadAttempts;
  await until(()=>tablet.reloadAttempts>resumed&&tablet.status.phase!=="error","reload succeeds once Chat allows it",20000);
  console.log("PASS a refused reload is retried quietly with back-off until Chat is ready");
  process.exitCode=0;
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const n of nodes){n.engine.stop();n.transport.pause();}fs.rmSync(root,{recursive:true,force:true});});
