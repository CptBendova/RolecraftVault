/* This adapter ships only in the owner's private edition. */
(function(host){
  "use strict";
  host.RolecraftSyncNamespace="library1";
  host.RolecraftPreviousSyncNamespace="library-stories1";
  const core=host.RolecraftSyncCore,validate=core.validate,collect=core.collect;
  core.TABLES.conversation=["chats:all","id"];
  core.extension={id:"stories1",kinds:["conversation"]};
  // Draft offers are explicit, short-lived vault data. Keep them outside the
  // conversation table so no unsent text can become a transcript revision.
  // The optional stories1 manifest descriptor is ignored by older Chat peers.
  const HANDOFF_KEY="chats:draft-handoffs",HANDOFF_LIMIT=2*1024*1024;
  function handoffCore(){
    if(!host.RolecraftChatDraftHandoff)throw Error("The draft handoff validator has not loaded yet");
    return host.RolecraftChatDraftHandoff;
  }
  function emptyHandoff(){return {format:1,offers:[],receipts:[]};}
  function validateHandoff(value){
    const H=handoffCore();
    if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==3||
      value.format!==1||!Object.prototype.hasOwnProperty.call(value,"offers")||
      !Object.prototype.hasOwnProperty.call(value,"receipts"))throw Error("Invalid draft handoff lane");
    H.validateOffers(value.offers);H.validateReceipts(value.receipts);
    const offers=new Map(value.offers.map(offer=>[offer.revision,offer]));
    for(const receipt of value.receipts){
      const offer=offers.get(receipt.revision);
      if(offer&&(receipt.ownerDeviceId!==offer.ownerDeviceId||receipt.chatId!==offer.chatId||
        offer.targetDeviceId&&receipt.recipientDeviceId!==offer.targetDeviceId||
        receipt.consumedAt<offer.createdAt-5*60*1000||receipt.consumedAt>offer.expiresAt))throw Error("Draft handoff receipt does not match its offer");
    }
    return value;
  }
  function parseHandoff(raw){
    if(raw==null)return emptyHandoff();
    if(typeof raw!=="string"||new TextEncoder().encode(raw).length>HANDOFF_LIMIT)throw Error("Draft handoff lane exceeds its safe size");
    let value;try{value=JSON.parse(raw);}catch(_){throw Error("Invalid draft handoff lane");}
    return validateHandoff(value);
  }
  function mergeHandoffs(lanes,now){
    const H=handoffCore();
    if(!Number.isSafeInteger(now)||now<0||!Array.isArray(lanes))throw Error("Invalid draft handoff merge");
    let offers=[],receipts=new Map();
    for(const lane of lanes){
      validateHandoff(lane);
      offers=H.mergeOffers(offers,lane.offers,now);
      for(const receipt of lane.receipts){
        if(receipt.expiresAt<=now)continue;
        const key=receipt.revision+":"+receipt.recipientDeviceId,prior=receipts.get(key);
        if(prior&&core.canonical(prior)!==core.canonical(receipt))throw Error("Draft handoff receipt contains conflicting data");
        receipts.set(key,receipt);
      }
    }
    return validateHandoff({format:1,offers,receipts:[...receipts.values()].sort((a,b)=>
      a.consumedAt-b.consumedAt||a.revision.localeCompare(b.revision)||a.recipientDeviceId.localeCompare(b.recipientDeviceId))});
  }
  if(host.RolecraftChatDraftHandoff)core.draftHandoff={key:HANDOFF_KEY,limit:HANDOFF_LIMIT,
    empty:emptyHandoff,parse:parseHandoff,validate:validateHandoff,merge:mergeHandoffs};
  core.collect=function(raw){
    if(!host.RolecraftChatSync)throw Error("The story validator has not loaded yet");
    host.RolecraftChatSync.validate(JSON.parse(raw["chats:all"]||"[]"));
    return collect(raw);
  };
  core.validate=async function(snapshot,hash){
    await validate(snapshot,hash);
    for(const [key,entry]of Object.entries(snapshot.entries))if(core.parts(key)[0]==="conversation")for(const v of entry.versions)if(v.value)host.RolecraftChatSync.validate([v.value]);
    return snapshot;
  };
})(window);
