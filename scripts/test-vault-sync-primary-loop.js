const assert = require("assert"), fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm"), crypto = require("crypto");
const C = require("../app/vault-sync-core"), {createTransport,seal,unseal} = require("../app/vault-sync-transport");
const read = file => fs.readFileSync(path.join(__dirname,"..","app",file),"utf8");
const root = fs.mkdtempSync(path.join(os.tmpdir(),"rcv-primary-loop-")), secret = crypto.randomBytes(32).toString("hex"), nodes = [], failures = [];
const digest = text => crypto.createHash("sha256").update(text).digest("hex");
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const character = name => ({id:"shared",name,images:["base"],profileImg:"base"});
const rows = node => JSON.parse(node.data.get("chars:all") || "[]");
const archived = node => JSON.parse(node.data.get("trash:all") || "[]");
const state = node => JSON.parse(node.data.get("sync:state") || "{}");
const imagesOf = (kind,value) => kind === "trash" ? imagesOf(value.type,value.record) : kind === "character" ? [...new Set([...(value.images||[]),value.profileImg].filter(Boolean))] : [];
let protectConflict = false, primaryId = null, phoneId = null, phoneBaseClock = 0, checkedArchives = 0;

function make(name) {
  const data = new Map([["chars:all",JSON.stringify([character("Shared original")])],["img:base","data:image/png;base64,YmFzZQ=="]]);
  let status, available = true, mayApply = true;
  const storage = {
    get:async key => { if(!data.has(key)) throw Error("key not found"); return {value:data.get(key)}; },
    fingerprint:async key => data.has(key) ? digest(data.get(key)) : null,
    fingerprints:async keys => Object.fromEntries(keys.map(key => [key,data.has(key) ? digest(data.get(key)) : null])),
    syncImage:async (key,value) => {if(data.has(key)&&data.get(key)!==value) throw Error("Picture collision"); data.set(key,value);},
    syncCommit:async (values,expected) => {
      try {
        for(const [key,value] of Object.entries(expected)) assert.equal(data.get(key)??null,value,"compare-and-swap protects current editing");
        const next = new Map(data); for(const [key,value] of Object.entries(values)) next.set(key,value);
        if(protectConflict) {
          const oldRow = JSON.parse(data.get("chars:all")||"[]").find(row=>row.id==="shared");
          const newRow = JSON.parse(next.get("chars:all")||"[]").find(row=>row.id==="shared");
          const bins = JSON.parse(next.get("trash:all")||"[]");
          const revision = JSON.parse(next.get("sync:state")||"{}").snapshot?.entries[C.keyOf("character","shared")]?.versions[0];
          if(oldRow?.name==="Phone contested" && newRow?.name!==oldRow.name || name==="tablet" && newRow?.name==="Tablet contested" && revision?.author===primaryId && (revision.clock[phoneId]||0)>phoneBaseClock) {
            const saved = bins.find(row=>row.syncConflict && row.record?.name==="Phone contested");
            assert(saved,"save losing writing in Bin before any winning card/resolution checkpoint");
            for(const id of imagesOf("trash",saved)) assert(next.has("img:"+id),"save every archived original photo before resolving its source");
            checkedArchives++;
          }
        }
        for(const [key,value] of Object.entries(values)) data.set(key,value);
      } catch(error) {failures.push(error); throw error;}
    }
  };
  const transport = createTransport({directory:path.join(root,name),protect:text=>Buffer.from(seal(text,secret,"fixture")),unprotect:bytes=>unseal(bytes.toString(),secret,"fixture"),unlocked:()=>available,network:{addresses:()=>["127.0.0.1"],privateIp:ip=>ip==="127.0.0.1",discoveryPort:45104}});
  const window = {vaultSync:transport}, ctx = {window,document:{hidden:false},crypto:crypto.webcrypto,TextEncoder,setTimeout,clearTimeout,console};
  vm.createContext(ctx); vm.runInContext(read("vault-sync-core.js"),ctx); vm.runInContext(read("vault-sync.js"),ctx);
  const engine = window.RolecraftVaultSync.create({storage,namespace:"library1",intervalMs:60,ready:()=>available,canApply:()=>mayApply,imageIds:imagesOf,onApplied:()=>{}});
  engine.subscribe(value=>{status=value;if(value.phase==="preview") engine.approve(value.preview.id);});
  const node = {name,data,transport,engine,get status(){return status;},available(value){available=value;engine.retry();},allow(value){mayApply=value;}};
  nodes.push(node); return node;
}
async function until(predicate,label,timeout=25000) {
  const end=Date.now()+timeout;
  while(Date.now()<end){if(failures.length)throw failures[0];if(predicate())return;await pause(40);}
  throw Error(label+": "+JSON.stringify(nodes.map(node=>({name:node.name,status:node.status,characters:rows(node)}))));
}

(async()=>{
  const tablet=make("tablet"), phone=make("phone"), computer=make("computer");
  const initial=await tablet.transport.call("configure",{action:"create",label:"tablet",namespace:"library1"});
  const invitation=(await tablet.transport.call("invite")).code;
  for(const node of [phone,computer]) await node.transport.call("configure",{action:"join",code:invitation,label:node.name,namespace:"library1"});
  for(const node of nodes) node.engine.start();
  await until(()=>nodes.every(node=>state(node).approved&&node.status.lastSynced),"initial convergence");
  const identities=await Promise.all(nodes.map(node=>node.transport.call("status")));
  primaryId=identities[0].device;phoneId=identities[1].device;
  const chosen=await tablet.engine.setPrimary();
  assert.equal(chosen.primaryPreference.device,primaryId);
  await until(()=>nodes.every(node=>node.status.settings?.primaryPreference?.device===primaryId),"primary preference propagation");
  for(let i=0;i<nodes.length;i++){const current=await nodes[i].transport.call("status");assert.equal(current.group,identities[i].group);assert.equal(current.device,identities[i].device);}
  assert.equal(chosen.group,initial.group);
  console.log("PASS choosing primary preserves remembered group and all device identities without pairing again");

  let mark=Date.now();phone.data.set("chars:all",JSON.stringify([character("Edited on phone")]));
  await until(()=>nodes.every(node=>rows(node)[0].name==="Edited on phone"&&node.status.lastSynced>=mark),"ordinary phone change reaches primary");
  assert(nodes.every(node=>rows(node).length===1));
  console.log("PASS ordinary phone changes update the primary and every peer, without duplicate cards");

  for(const node of nodes) node.available(false);
  await until(()=>nodes.every(node=>node.status.phase==="paused"),"pause before offline edits");
  phoneBaseClock=state(phone).snapshot.entries[C.keyOf("character","shared")].versions[0].clock[phoneId]||0;
  tablet.data.set("chars:all",JSON.stringify([character("Tablet contested")]));
  phone.data.set("img:phone-extra","data:image/png;base64,cGhvbmUtZnVsbC1yZXNvbHV0aW9u");
  phone.data.set("chars:all",JSON.stringify([{...character("Phone contested"),images:["base","phone-extra"]}]));
  protectConflict=true; mark=Date.now();for(const node of nodes) node.available(true);
  await until(()=>nodes.every(node=>rows(node).length===1&&rows(node)[0].name==="Tablet contested"&&archived(node).some(row=>row.record?.name==="Phone contested")&&node.status.lastSynced>=mark),"concurrent conflict convergence");
  assert(checkedArchives>0,"exercise a real replacement/resolution checkpoint");
  for(const node of nodes)assert(node.data.has("img:phone-extra"));
  protectConflict=false;
  console.log("PASS genuine conflicts converge to one card; alternate writing and original photos are durable before replacement");

  mark=Date.now();const next=await computer.engine.setPrimary();
  assert.equal(next.primaryPreference.device,identities[2].device);
  await until(()=>nodes.every(node=>node.status.settings?.primaryPreference?.device===identities[2].device&&node.status.lastSynced>=mark),"change primary propagation");
  assert.equal(next.group,initial.group);
  computer.available(false);await until(()=>computer.status.phase==="paused","selected primary offline");
  mark=Date.now();phone.data.set("chars:all",JSON.stringify([character("Edit while primary sleeps")]));
  await until(()=>[phone,tablet].every(node=>rows(node)[0].name==="Edit while primary sleeps"&&node.status.lastSynced>=mark),"ordinary edit while primary offline");
  computer.available(true);await until(()=>rows(computer)[0].name==="Edit while primary sleeps","primary catches up after returning");
  assert(nodes.every(node=>rows(node).length===1));
  console.log("PASS primary can change without re-pairing; ordinary edits flow while it sleeps and reach it on return");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{for(const node of nodes){node.engine.stop();node.transport.pause();}});
