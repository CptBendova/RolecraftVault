"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto");
const {createCredentialShare}=require("../app/credential-share");
const {createTransport,seal,unseal}=require("../app/vault-sync-transport");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-key-share-")),transports=[];
let locked=false,offset=0;
const master=crypto.randomBytes(32).toString("hex");
const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(seal(s,master,"fixture-store")),decryptString:b=>unseal(b.toString(),master,"fixture-store")};
const fakeKeys={openrouter:"sk-or-fixture-"+"a".repeat(30),openai:"sk-openai-fixture-"+"b".repeat(24),xai:"xai-fixture-"+"c".repeat(24)};
function filename(name){return name==="openrouter"?"openrouter-key.bin":"image-generation-"+name+"-key.bin";}
function device(name,enabled=true){const directory=path.join(root,name);fs.mkdirSync(directory);const keys=createCredentialShare({directory,safeStorage,unlocked:()=>!locked,now:()=>Date.now()+offset});const t=createTransport({directory:path.join(directory,"sync"),credentials:enabled?keys:null,protect:s=>safeStorage.encryptString(s),unprotect:b=>safeStorage.decryptString(b),unlocked:()=>!locked,network:{addresses:()=>["127.0.0.1"],privateIp:ip=>ip==="127.0.0.1",discoveryPort:45212}});transports.push(t);return {t,keys,directory};}
(async()=>{
  const source=device("source"),target=device("target"),standard=device("standard",false);
  for(const [name,key]of Object.entries(fakeKeys))fs.writeFileSync(path.join(source.directory,filename(name)),safeStorage.encryptString(key));
  const identity=await source.t.call("configure",{action:"create",label:"Fixture desktop"});
  const code=(await source.t.call("invite")).code;
  for(const peer of [target,standard]){await peer.t.call("configure",{action:"join",code});await peer.t.call("discover");}
  assert.equal((await target.t.call("keyInfo",{peer:identity.device})).offer,null,"No automatic credential sharing after pairing");
  for(const [name,key]of Object.entries(fakeKeys)){
    const shared=await source.t.call("keyShare",{provider:name});
    assert(!JSON.stringify(shared).includes(key));
    const info=await target.t.call("keyInfo",{peer:identity.device});
    assert.equal(info.offer.provider,name);assert(!JSON.stringify(info).includes(key));
    await assert.rejects(target.t.call("keyImport",{peer:identity.device,id:info.offer.id,provider:name==="xai"?"openai":"xai"}),/changed/);
    await assert.rejects(target.t.call("keyImport",{peer:identity.device,id:"a".repeat(32),provider:name}),/Peer/);
    const result=await target.t.call("keyImport",{peer:identity.device,id:info.offer.id,provider:name});
    assert.deepEqual(result,{ok:true,provider:name});
    const bytes=fs.readFileSync(path.join(target.directory,filename(name)));
    assert(!bytes.includes(Buffer.from(key)));assert.equal(safeStorage.decryptString(bytes),key);
    await assert.rejects(target.t.call("keyImport",{peer:identity.device,id:info.offer.id,provider:name}),/already saved/);
    const index=await target.t.call("index",{peer:identity.device});
    assert(!JSON.stringify(index).includes(key)&&!JSON.stringify(index).includes(info.offer.id),"Ordinary sync never advertises key offers");
    assert(!fs.existsSync(path.join(source.directory,"sync","head.bin")),"Keys never staged as vault records");
  }
  console.log("PASS three providers transfer via real encrypted paired sockets; UI responses contain metadata only; native keys stay encrypted and existing keys cannot be overwritten");
  await assert.rejects(standard.t.call("keyShare",{provider:"openai"}),/Chat app/);
  await assert.rejects(source.t.call("keyShare",{provider:"../openrouter"}),/supported/);
  const current=(await source.t.call("keyShare",{provider:"openai"})).offer;
  await source.t.call("keyStop");assert.equal((await target.t.call("keyInfo",{peer:identity.device})).offer,null);
  assert.throws(()=>source.keys.pull(current.id),/expired/);
  await source.t.call("keyShare",{provider:"openai"});offset=300001;assert.equal(source.keys.metadata(),null);offset=0;
  await source.t.call("keyShare",{provider:"openai"});source.t.pause();assert.equal(source.keys.metadata(),null);
  locked=true;assert.throws(()=>source.keys.share("openai"),/Unlock/);assert.throws(()=>target.keys.receive({key:fakeKeys.xai},{provider:"xai"}),/Unlock/);await assert.rejects(source.t.call("keyStatus"),/Unlock/);locked=false;
  const empty=device("empty");assert.throws(()=>empty.keys.share("openai"),/valid key/);
  const restart=createCredentialShare({directory:source.directory,safeStorage,unlocked:()=>true});assert.equal(restart.metadata(),null);
  console.log("PASS unsupported/standard editions, missing keys, expiry, stop, lock, pause and restart fail closed");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{locked=false;for(const t of transports)t.pause();});
