"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const H=require("../app/chat-draft-handoff"),C=require("../app/vault-sync-core");
const Controller=require("../app/chat-draft-handoff-controller");
const window={RolecraftSyncCore:C,RolecraftChatSync:require("../app/chat-sync-core"),RolecraftChatDraftHandoff:H};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","app","private-sync.js"),"utf8"),{window,TextEncoder});
const lane=window.RolecraftSyncCore.draftHandoff;
const ownerId="11111111-1111-4111-8111-111111111111",receiverId="22222222-2222-4222-8222-222222222222";
const offerId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",chatId="story";
const chat={id:chatId,title:"Story",messages:[{id:"turn-1",role:"user",content:"A saved turn",parentId:null}],
  leafId:"turn-1",_sync:{rev:"chat-rev-1",ancestors:[],deleted:false}};
const chatsRaw=JSON.stringify([chat]),syncRaw=JSON.stringify({group:"paired-group",approved:true});
function make(device,other,draftText){
  const data=new Map([["chats:all",chatsRaw],["sync:state",syncRaw],["ui:chat-drafts",JSON.stringify({other:"Keep another story"})]]);
  let live=chat,typed=draftText,commits=0,wakes=0,beforeCommit=null,enabled=true,saveGate=Promise.resolve();
  const storage={
    get:async key=>data.has(key)?{value:data.get(key)}:null,
    syncCommit:async(values,expected)=>{
      commits++;
      if(beforeCommit){const hook=beforeCommit;beforeCommit=null;hook();}
      for(const [key,value]of Object.entries(expected))if((data.get(key)??null)!==value)throw Error("Library changed during sync");
      for(const [key,value]of Object.entries(values))data.set(key,value);
    }
  };
  const controller=Controller.create({storage,helper:H,lane,
    status:()=>({settings:{enabled,group:"paired-group",device},peers:[{id:other,draftHandoffSupported:true}]}),
    chat:()=>live,draft:()=>typed,uid:()=>offerId,waitForSave:()=>saveGate,
    onSaved:()=>{wakes++;},ready:()=>true,now:()=>1_800_000_000_000});
  return {data,controller,get commits(){return commits;},get wakes(){return wakes;},
    type(value){typed=value;},setChat(value){live=value;},setEnabled(value){enabled=value;},
    onCommit(hook){beforeCommit=hook;},waitFor(promise){saveGate=promise;}};
}
(async()=>{
  const owner=make(ownerId,receiverId,"  Keep this exact unsent scene. 🐉  ");
  let releaseSave;owner.waitFor(new Promise(resolve=>{releaseSave=resolve;}));
  const offering=owner.controller.offer({targetDeviceId:receiverId,ttlMs:60*60*1000});
  await Promise.resolve();
  assert.equal(owner.commits,0,"offer must wait for the Chat save queue");
  releaseSave();
  const offered=await offering;
  assert.equal(offered.keptSourceDraft,true);
  assert.equal(offered.liveChanged,false);
  assert.equal(offered.offer.text,"  Keep this exact unsent scene. 🐉  ");
  assert.equal(owner.wakes,1,"durable offer wakes paired sync");
  assert.equal(JSON.parse(owner.data.get("ui:chat-drafts")).story,offered.text,
    "offer and source draft save in one transaction, preserving recovery");
  assert.equal(JSON.parse(owner.data.get("ui:chat-drafts")).other,"Keep another story");
  assert.equal(owner.data.get("chats:all"),chatsRaw,"offer does not enter the transcript");
  assert.deepEqual((await owner.controller.list()).offers.map(value=>value.revision),[offerId]);

  const receiver=make(receiverId,ownerId,"");
  receiver.data.set(Controller.HANDOFF_KEY,owner.data.get(Controller.HANDOFF_KEY));
  const accepted=await receiver.controller.accept({offer:offered.offer});
  assert.equal(accepted.draft,offered.text);
  assert.equal(accepted.liveChanged,false);
  assert.equal(receiver.wakes,1,"durable receipt wakes paired sync");
  assert.equal(JSON.parse(receiver.data.get("ui:chat-drafts")).story,offered.text,
    "receipt and imported draft save atomically");
  assert.equal(JSON.parse(receiver.data.get(Controller.HANDOFF_KEY)).receipts[0].recipientDeviceId,receiverId);
  assert.equal(receiver.data.get("chats:all"),chatsRaw,"claim never edits transcript ancestry");
  await assert.rejects(receiver.controller.accept({offer:offered.offer}),/already-consumed|local-draft/);

  const busy=make(receiverId,ownerId,"A local unsent turn");
  busy.data.set(Controller.HANDOFF_KEY,owner.data.get(Controller.HANDOFF_KEY));
  await assert.rejects(busy.controller.accept({offer:offered.offer}),/local-draft/);
  assert.equal(busy.commits,0,"a local draft prevents replacement before storage writes");
  const saved=make(receiverId,ownerId,"");
  saved.data.set(Controller.HANDOFF_KEY,owner.data.get(Controller.HANDOFF_KEY));
  saved.data.set(Controller.DRAFT_KEY,JSON.stringify({story:"Saved here already"}));
  await assert.rejects(saved.controller.accept({offer:offered.offer}),/local-draft/);
  assert.equal(saved.commits,0,"a saved draft also prevents replacement");
  const stale=make(receiverId,ownerId,"");
  stale.data.set(Controller.HANDOFF_KEY,owner.data.get(Controller.HANDOFF_KEY));
  stale.setChat({...chat,leafId:"another-turn"});
  await assert.rejects(stale.controller.accept({offer:offered.offer}),/changed/);
  assert.equal(stale.commits,0,"changed branch ancestry prevents claim");

  const race=make(ownerId,receiverId,"Race-safe draft");
  race.onCommit(()=>race.data.set("chats:all",JSON.stringify([{...chat,leafId:"new-leaf"}])));
  await assert.rejects(race.controller.offer({targetDeviceId:receiverId}),/changed/);
  assert(!race.data.has(Controller.HANDOFF_KEY),"CAS race never half-saves an offer");
  assert.equal(JSON.parse(race.data.get("ui:chat-drafts")).story,undefined);
  const typedDuringCommit=make(receiverId,ownerId,"");
  typedDuringCommit.data.set(Controller.HANDOFF_KEY,owner.data.get(Controller.HANDOFF_KEY));
  typedDuringCommit.onCommit(()=>typedDuringCommit.type("New local typing"));
  const late=await typedDuringCommit.controller.accept({offer:offered.offer});
  assert.equal(late.liveChanged,true,"UI can avoid replacing typing that arrived during the storage commit");
  const mismatched=make(receiverId,ownerId,"");
  mismatched.data.set(Controller.HANDOFF_KEY,owner.data.get(Controller.HANDOFF_KEY));
  await assert.rejects(mismatched.controller.accept({offer:{...offered.offer,text:"Changed preview"}}),/changed/);
  assert.equal(mismatched.commits,0,"a changed preview cannot claim a different offer with the same revision");
  const unpaired=make(ownerId,receiverId,"Local only");unpaired.setEnabled(false);
  await assert.rejects(unpaired.controller.offer({targetDeviceId:receiverId}),/Pair and enable/);
  assert.equal(unpaired.commits,0,"an unpaired vault never offers a draft");

  console.log("PASS explicit draft offer/accept waits for saves, preserves source, commits with transcript CAS, and refuses local-draft, stale-chat, or unpaired races");
})().catch(error=>{console.error(error);process.exitCode=1;});
