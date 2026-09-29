/* Local-only orchestration. Network access is exclusively in the native shell. */
(function(host){
  "use strict";
  const C=host.RolecraftSyncCore, STATE="sync:state", LIMIT=64*1024*1024, STORY_LIMIT=64*1024*1024;
  const encoder=new TextEncoder();
  const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(text))),b=>b.toString(16).padStart(2,"0")).join("");
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function create(options){
    const storage=options.storage;
    const transport=host.vaultSync || (host.Capacitor&&typeof host.Capacitor.nativePromise==="function"?{call:(method,args)=>host.Capacitor.nativePromise("VaultSync","dispatch",{method,args:args||{}})}:null);
    let stopped=false,busy=false,timer=null,pulseTimer=null,epoch=0,approval=null,invalidCache=false,cacheInspectionNeeded=false,settings=null,lastPaint=0,firstCheck=true;
    const pictureRepairs=new Set();
    let workspacePaused=false,pauseTask=Promise.resolve(),activityGeneration=0,storyPublication=null,storyLocal=null,storiesNeedReload=false,fullNeedReload=false,draftsNeedReload=false,maintenance=false,wakePending=false;
    let manualRefresh=false,manualModeLoaded=false,manualRequested=false,servingError=false;
    // 1.338: quiet passes. idleStreak stretches the poll while nothing changes;
    // quietDeferred postpones background work while Chat is typing/streaming;
    // reloadFailures backs off a UI reload that keeps being refused.
    let idleStreak=0,quietDeferred=false,reloadFailures=0;
    let nativeWakeOff=null,nativeWakePending=null,lastFullStoryDiscover=0;
    let localRead=null,localScan=null,publication=null,reconciliation=null;
    const storyRecords=new Map(),draftLane=C.draftHandoff||null;
    const sameRaw=(a,b)=>!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>a[key]===b[key]);
    function clearWorkCache(){localRead=null;localScan=null;publication=null;reconciliation=null;storyRecords.clear();}
    const storiesOnly=()=>workspacePaused&&C.extension&&C.extension.id==="stories1";
    const suspended=()=>workspacePaused&&!storiesOnly();
    const pauseMessage="Sync paused for Chat focus. Changes stay saved locally; return to the vault to sync.";
    let current={phase:"off",message:"Choose a primary device or join its group."};
    const remoteCache=new Map(),peerRetries=new Map();let peerRetryGroup=null;
    const endpoint=peer=>String(peer.ip||"")+":"+String(peer.port||"");
    function peerList(discovered){
      const peers=discovered.peers||[],present=new Set(peers.map(peer=>peer.id));
      for(const[id,retry]of peerRetries){const peer=peers.find(peer=>peer.id===id);if(!present.has(id)||retry.endpoint!==endpoint(peer))peerRetries.delete(id);}
      // Reachable peers keep being checked while old/offline addresses back off.
      return [...peers].sort((a,b)=>Number(peerRetries.has(a.id))-Number(peerRetries.has(b.id)));
    }
    function deferredPeer(peer){const retry=peerRetries.get(peer.id);return retry&&Date.now()<retry.at?{id:peer.id,label:retry.label,online:false,error:retry.error,retryAt:retry.at}:null;}
    /* Named once, reused by both lanes: a device that can reach us but not the
       reverse (or the reverse) is almost always a firewall on one side. */
    const INBOUND_BLOCKED="It reached this device a moment ago, but this device cannot connect back to it. Its firewall is blocking incoming connections: on a Windows PC, set that Wi-Fi network to Private or allow Rolecraft Vault through Windows Defender Firewall.";
    const reachWarning=(r,label)=>r&&r.cannotReachMe===true?(label||"A paired device")+" cannot connect back to this device, so it cannot fetch changes from here. On a Windows PC, set this Wi-Fi network to Private or allow Rolecraft Vault through Windows Defender Firewall.":null;
    function failedPeer(peer,error){
      const blocked=peer.inboundAt&&Date.now()-peer.inboundAt<180000&&/offline|not accepting|interrupted/i.test(error.message||"");
      const previous=peerRetries.get(peer.id),attempt=Math.min(4,(previous?.attempt||0)+1),retry={endpoint:endpoint(peer),attempt,at:Date.now()+[2000,5000,10000,30000][attempt-1],label:peer.label||"Paired device",error:blocked?INBOUND_BLOCKED:error.message};
      peerRetries.set(peer.id,retry);return {id:peer.id,label:retry.label,online:false,error:retry.error,retryAt:retry.at};
    }
    const listeners=new Set();
    // Every notification repaints the whole library and Chat. A routine recheck
    // that changes nothing but the lastSynced time stays silent for 30 seconds.
    const statusKey=s=>{try{return JSON.stringify({...s,lastSynced:null});}catch(_){return null;}};
    function report(phase,message,extra={},force=true){
      if(!force&&phase===current.phase&&Date.now()-lastPaint<750)return;
      const next={...current,...(phase!==current.phase?{done:null,total:null}:{}),...extra,phase,message,initial:firstCheck,manualRefresh};
      const same=statusKey(next),unchanged=same!==null&&same===statusKey(current);
      if(unchanged&&(next.lastSynced===current.lastSynced||Date.now()-lastPaint<30000)){current={...next,lastSynced:current.lastSynced};return;}
      lastPaint=Date.now();current=next;for(const fn of listeners)fn(current);
    }
    // Background rechecks keep the settled status instead of flashing Checking.
    const settled=()=>["synced","waiting","manual","error","busy"].includes(current.phase);
    const reloadStories=()=>options.onStoriesApplied?options.onStoriesApplied():options.onApplied();
    const get=async key=>{if(suspended())throw Error(pauseMessage);try{const r=await storage.get(key);return r?r.value:null;}catch(e){if(/not found/i.test(e.message))return null;throw e;}};
    const ready=()=>options.ready()&&!(host.Capacitor&&document.hidden&&!host.RolecraftSyncBackground?.active());
    const check=run=>{if(suspended())throw Error(pauseMessage);if(run!==epoch||stopped||!ready())throw Error("Sync paused. Open and unlock the app to resume.");};
    const workHash=async text=>{if(suspended())throw Error(pauseMessage);return hash(text);};
    const call=async(method,args,run=epoch)=>{await pauseTask;check(run);const result=await transport.call(method,args||{});check(run);return result||{};};
    async function pulse(){
      if(stopped||suspended())return;
      const generation=activityGeneration;
      if(settings&&settings.enabled&&ready()){
        try{
          await transport.call(manualRefresh?"serve":"status",{});
          if(manualRefresh&&servingError){
            servingError=false;
            // Recheck local publication before saying this device is sharing.
            wakePending=true;if(!busy){clearTimeout(timer);timer=setTimeout(tick,0);}
          }
        }catch(error){
          if(manualRefresh){servingError=true;report("error","This device is not serving paired chats: "+(error.message||"network unavailable")+". Saved changes remain local; reconnect to this network and retry.",{settings});}
        }
      }
      if(!stopped&&!suspended()&&generation===activityGeneration)pulseTimer=setTimeout(pulse,5000);
    }
    // Cache checkpoints never advance the causal snapshot of unsaved records.
    async function rememberImages(images,run){
      check(run);const raw=await get(STATE),state=raw?JSON.parse(raw):{};
      if(state.group&&state.group!==settings.group)throw Error("Sync group changed");
      const next=JSON.stringify({...state,group:settings.group,images:{...state.images,...images}});
      if(next!==raw){check(run);await storage.syncCommit({[STATE]:next},{[STATE]:raw});}
    }
    async function stage(text,run){
      const parts=[],batchSize=settings&&settings.chunkBatch===4?4:1;let texts=[],bytes=0;
      async function flush(){
        if(!texts.length)return;
        const result=batchSize>1?await call("putBatch",{texts},run):await call("put",{text:texts[0]},run);
        const hashes=batchSize>1?result.hashes:[result.hash];
        if(!Array.isArray(hashes)||hashes.length!==texts.length||hashes.some(h=>typeof h!=="string"||!/^[a-f0-9]{64}$/.test(h)))throw Error("Invalid staged sync chunks");
        parts.push(...hashes);texts=[];
      }
      for(let at=0;at<text.length;){
        let end=Math.min(text.length,at+192*1024);
        if(end<text.length&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff)end--;
        let piece=text.slice(at,end);
        let size=encoder.encode(piece).length;
        while(size>256*1024){end=at+Math.floor((end-at)/2);if(text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff)end--;piece=text.slice(at,end);size=encoder.encode(piece).length;}
        texts.push(piece);bytes+=size;at=end;if(texts.length===batchSize)await flush();
      }
      await flush();return {hash:await hash(text),parts,bytes};
    }
    function descriptor(d,max=128*1024*1024){if(!d||!/^[a-f0-9]{64}$/.test(d.hash)||!Array.isArray(d.parts)||d.parts.length>4096||d.parts.some(h=>!/^[a-f0-9]{64}$/.test(h))||!Number.isSafeInteger(d.bytes)||d.bytes<0||d.bytes>max)throw Error("Invalid sync file description");return d;}
    async function download(d,peer,run,max){
      descriptor(d,max);const pieces=[],batchSize=settings&&settings.chunkBatch===4?4:1,concurrency=batchSize===4&&settings.chunkConcurrency===2?2:1;let length=0;
      // Native batches retain the existing immutable chunk identities. The shell
      // negotiates peer support and uses legacy requests for an older device.
      for(let at=0;at<d.parts.length;at+=batchSize*concurrency){
        const requests=[];
        for(let offset=at;offset<Math.min(d.parts.length,at+batchSize*concurrency);offset+=batchSize){
          const hashes=d.parts.slice(offset,offset+batchSize);
          requests.push((async()=>{const r=batchSize>1?await call("chunks",{peer,hashes},run):await call("chunk",{peer,hash:hashes[0]},run);return {hashes,texts:batchSize>1?r.texts:[r.text]};})());
        }
        // Drain both bounded requests even on failure; never leave background
        // downloads running into a later sync/primary change. Order is retained.
        const results=await Promise.allSettled(requests);check(run);
        for(const result of results){
          if(result.status!=="fulfilled")throw result.reason;
          const {hashes,texts}=result.value;
          if(!Array.isArray(texts)||texts.length!==hashes.length)throw Error("Missing sync chunks");
          for(const text of texts){if(typeof text!=="string")throw Error("Missing sync chunk");const size=encoder.encode(text).length;if(size>256*1024)throw Error("Sync chunk exceeded its safe size");length+=size;if(length>d.bytes)throw Error("Sync file exceeded its declared size");pieces.push(text);}
        }
      }
      const text=pieces.join("");if(length!==d.bytes||await hash(text)!==d.hash)throw Error("Sync file checksum failed");return text;
    }
    async function storyIndex(snapshot,images,handoffRaw,run){
      const records={},omitted=[];
      for(const [key,entry]of Object.entries(snapshot.entries)){
        check(run);
        const text=C.canonical(entry),cached=storyRecords.get(key);
        if(encoder.encode(text).length>STORY_LIMIT){omitted.push(key);continue;}
        const d=cached&&cached.hash===await hash(text)?cached.descriptor:await stage(text,run);
        descriptor(d);
        storyRecords.set(key,{hash:d.hash,descriptor:d});
        records[key]=d;
      }
      for(const key of storyRecords.keys())if(!Object.prototype.hasOwnProperty.call(records,key))storyRecords.delete(key);
      let draftHandoff=null,draftError=null;
      if(draftLane){
        let value=null;
        try{
          value=draftLane.parse(handoffRaw);
        }catch(_){draftError="Invalid local draft handoff lane";}
        if(value&&(value.offers.length||value.receipts.length))draftHandoff=await stage(C.canonical(value),run);
      }
      const text=C.canonical({format:2,group:settings.group,records,images:portable(images),omitted,
        ...(draftLane?{draftHandoffFormat:1}:{}),...(draftHandoff?{draftHandoff}:{})});
      if(encoder.encode(text).length>LIMIT)throw Error("The optional writing manifest exceeds the safe sync size. Nothing was changed.");
      return {index:await stage(text,run),records,omitted,draftHandoff,draftError};
    }
    async function readStoryIndex(d,peer,run,validated){
      const incoming=JSON.parse(await download(d,peer,run,LIMIT));
      if(incoming.format===1)return {incoming,storyRecords:null};
      if(incoming.format!==2||incoming.group!==settings.group||!incoming.records||typeof incoming.records!=="object"||Array.isArray(incoming.records)||!incoming.images||typeof incoming.images!=="object"||Array.isArray(incoming.images))throw Error("Incompatible conversation index");
      const omitted=incoming.omitted===undefined?[]:incoming.omitted;
      if(!Array.isArray(omitted)||omitted.length>10000||new Set(omitted).size!==omitted.length||omitted.some(key=>typeof key!=="string"||C.parts(key)[0]!=="conversation"||Object.prototype.hasOwnProperty.call(incoming.records,key)))throw Error("Invalid omitted conversations in sync index");
      const entries={},records=Object.entries(incoming.records),nextRecords=new Map();
      if(records.length>10000)throw Error("Too many conversations in sync index");
      for(const [key,record]of records){
        if(C.parts(key)[0]!=="conversation")throw Error("Invalid conversation key in sync index");
        descriptor(record,STORY_LIMIT);
        const previous=validated&&validated.group===incoming.group&&validated.records.get(key);
        // A verified content digest identifies an immutable conversation. A
        // new manifest need not download all the unchanged Chat histories.
        const entry=previous&&previous.hash===record.hash&&previous.bytes===record.bytes?previous.entry:JSON.parse(await download(record,peer,run,STORY_LIMIT));
        entries[key]=entry;nextRecords.set(key,{hash:record.hash,bytes:record.bytes,entry});
      }
      let draftHandoff=null,draftError=null,draftSupported=false,draftCache=null;
      if(draftLane&&incoming.draftHandoffFormat===1){
        draftSupported=true;
        try{
          if(incoming.draftHandoff){
            descriptor(incoming.draftHandoff,draftLane.limit);
            const prior=validated&&validated.group===incoming.group&&validated.draftHandoff;
            draftHandoff=prior&&prior.hash===incoming.draftHandoff.hash&&prior.bytes===incoming.draftHandoff.bytes?
              prior.value:draftLane.parse(await download(incoming.draftHandoff,peer,run,draftLane.limit));
            draftCache={hash:incoming.draftHandoff.hash,bytes:incoming.draftHandoff.bytes,value:draftHandoff};
          }else draftHandoff=draftLane.empty();
        }catch(_){draftError="A paired draft handoff could not be verified";}
      }else if(draftLane&&incoming.draftHandoff!==undefined)draftError="Incompatible draft handoff descriptor";
      // The caller only retains this candidate after validating the complete
      // conversation snapshot. A partial draft download cannot block Chat sync.
      return {incoming:{format:1,group:incoming.group,snapshot:{format:1,entries},images:incoming.images,omitted,draftHandoff,draftError,draftSupported},
        storyRecords:{group:incoming.group,records:nextRecords,draftHandoff:draftCache}};
    }
    function refs(snapshot){
      const ids=new Set();
      for(const [key,entry]of Object.entries(snapshot.entries))for(const version of entry.versions){if(!version.value||version.hash!==entry.applied)continue;const [kind]=C.parts(key);for(const id of options.imageIds(kind,version.value))if(typeof id==="string"&&id)ids.add(id);}
      return [...ids];
    }
    async function localImages(snapshot,old,run){
      const images=Object.create(null), pending=Object.create(null), ids=refs(snapshot);let done=0,saved=0,lastSave=Date.now();
      async function checkpoint(){
        if(!saved)return;
        await rememberImages(pending,run);
        for(const key of Object.keys(pending))delete pending[key];
        saved=0;lastSave=Date.now();
      }
      const keys=ids.flatMap(id=>["img:"+id,"th:"+id]),keySet=new Set(keys),marks={};
      for(const key of pictureRepairs)if(!keySet.has(key))pictureRepairs.delete(key);
      for(let i=0;i<keys.length;i+=256){
        if(firstCheck)report("checking","Checking saved picture fingerprints… "+Math.min(ids.length,Math.ceil(i/2))+" of "+ids.length,{done:Math.ceil(i/2),total:ids.length},false);
        Object.assign(marks,await storage.fingerprints(keys.slice(i,i+256)));check(run);
        await sleep(0);
      }
      if(cacheInspectionNeeded){
        // Inspect rebuildable native chunks only after a publication reports a
        // missing cache file. One lost part must not restart every photograph.
        const candidates=keys.filter(key=>old&&old[key]&&marks[key]!=null&&old[key].fingerprint===marks[key]);
        const hashes=[...new Set(candidates.flatMap(key=>descriptor(old[key]).parts))],missing=new Set();
        for(let at=0;at<hashes.length;at+=1024){
          const batch=hashes.slice(at,at+1024),requested=new Set(batch),result=await call("missingChunks",{hashes:batch},run);
          if(!Array.isArray(result.missing)||result.missing.some(part=>typeof part!=="string"||!requested.has(part)))throw Error("Invalid local picture cache inspection");
          for(const part of result.missing)missing.add(part);
        }
        for(const key of candidates)if(old[key].parts.some(part=>missing.has(part)))pictureRepairs.add(key);
        cacheInspectionNeeded=false;
      }
      // Older shells cannot pinpoint missing parts. Still remember completed
      // repairs within this pass so interruption does not start them all again.
      if(invalidCache){for(const key of keys)pictureRepairs.add(key);invalidCache=false;}
      try{for(const id of ids){
        done++;
        for(const prefix of ["img:","th:"]){
          const key=prefix+id,mark=marks[key],cached=!pictureRepairs.has(key)&&old&&old[key];
          // Thumbnails are optional. A missing preview is not unfinished sync
          // work, and must not be reread/restaged on every background pass.
          if(prefix==="th:"&&mark==null){pictureRepairs.delete(key);continue;}
          if(mark!=null&&cached&&cached.fingerprint===mark){images[key]=cached;continue;}
          report("preparing","Preparing new or changed picture "+done+" of "+ids.length,{done,total:ids.length},false);
          // Android can stage an immutable encrypted image directly in its
          // native shell. The storage adapter guards the exact pointer before
          // and after staging; no full photo crosses the WebView bridge twice.
          // Null alone means an unsupported legacy format, never an error retry.
          let prepared=typeof storage.stageSyncImage==="function"?await storage.stageSyncImage(key,mark):null;check(run);
          if(prepared!=null)descriptor(prepared);
          else{
            const value=await get(key);check(run);
            if(value==null){if(prefix==="img:")throw Error("A referenced picture could not be read. No library changes were made.");continue;}
            if(value.length>128*1024*1024||encoder.encode(value).length>128*1024*1024)throw Error("One picture exceeds the safe sync size. It remains on this device.");
            prepared=await stage(value,run);
          }
          images[key]={...prepared,fingerprint:mark};pictureRepairs.delete(key);pending[key]=images[key];saved++;
          // Time-bounded checkpoints retain interruption progress without
          // rewriting a growing multi-megabyte state for each 16 tiny previews.
          if(Date.now()-lastSave>2000)await checkpoint();
        }
      }}finally{await checkpoint();}
      if(current.phase==="preparing")report("preparing","Pictures prepared: "+ids.length+" of "+ids.length,{done:ids.length,total:ids.length});
      return images;
    }
    function portable(images){return Object.fromEntries(Object.entries(images).map(([k,v])=>[k,{hash:v.hash,parts:v.parts,bytes:v.bytes}]));}
    function sameImages(a,b){return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>{const x=a[key],y=b[key];return y&&x.hash===y.hash&&x.bytes===y.bytes&&x.parts.length===y.parts.length&&x.parts.every((part,i)=>part===y.parts[i]);});}
    async function publish(snapshot,images,handoffRaw,run,established){
      // Reuse an immutable publication between polls. Periodically renew its
      // native retain validation so a missing disposable cache chunk is repaired.
      if(!invalidCache&&!cacheInspectionNeeded&&!pictureRepairs.size&&publication&&publication.group===settings.group&&publication.snapshot===snapshot&&publication.handoffRaw===handoffRaw&&publication.established===(established===true)&&Date.now()-publication.at<30000&&sameImages(publication.images,images))return publication.revision;
      const extended=C.extension, base={format:1,entries:{}}, extra={format:1,entries:{}};
      for(const [key,entry]of Object.entries(snapshot.entries))(extended&&extended.kinds.includes(C.parts(key)[0])?extra:base).entries[key]=entry;
      const baseIds=new Set(refs(base)),extraIds=new Set(refs(extra));
      const select=ids=>Object.fromEntries(Object.entries(images).filter(([key])=>ids.has(key.slice(key.indexOf(":")+1))));
      const baseImages=select(baseIds),extraImages=select(extraIds);
      const extensions={};let extensionRevision=null,storyParts=[],omittedChats=0,draftHandoffError=null;
      if(extended){
        const story=await storyIndex(extra,extraImages,handoffRaw,run);
        storyParts=[...Object.values(story.records).flatMap(d=>d.parts),...(story.draftHandoff?story.draftHandoff.parts:[])];
        omittedChats=story.omitted.length;
        draftHandoffError=story.draftError;
        const publishedExtra={format:1,entries:Object.fromEntries(Object.entries(extra.entries).filter(([key])=>Object.prototype.hasOwnProperty.call(story.records,key)))};
        const revisionInput=story.draftHandoff?{snapshot:publishedExtra,omitted:story.omitted,draftHandoff:story.draftHandoff.hash}:
          story.omitted.length?{snapshot:publishedExtra,omitted:story.omitted}:publishedExtra;
        extensionRevision=await hash(C.canonical(revisionInput));
        extensions[extended.id]={index:story.index,revision:extensionRevision};
      }
      // Preview encodings can legitimately differ between devices. They are
      // disposable presentation caches, not conflicting original artwork.
      const revision=await hash(C.canonical({snapshot:base,images:Object.fromEntries(Object.entries(baseImages).filter(([key])=>key.startsWith("img:")).map(([key,d])=>[key,d.hash]))}));
      // An established chat turn changes only the optional story index. Keep
      // the already published library head and photo chunks untouched instead
      // of retaining and checking every picture again for every message.
      if(extended&&storiesOnly()&&settings.storyPublishFast===1&&!invalidCache&&!cacheInspectionNeeded&&!pictureRepairs.size){
        let fast=null;
        try{fast=await call("publishStoryExtension",{extension:extensions[extended.id],expectedLibraryRevision:revision,established:established===true},run);}
        catch(error){if(!/unknown (?:sync )?(?:method|operation)|not implemented|unimplemented/i.test(error.message))throw error;}
        if(fast&&fast.published===true){
          const result={library:revision,extension:extensionRevision,omittedChats,draftHandoffError};
          publication={group:settings.group,snapshot,images,handoffRaw,baseText:null,baseImages,baseIndex:null,established:established===true,at:Date.now(),revision:result};
          return result;
        }
      }
      const text=C.canonical({format:1,group:settings.group,snapshot:base,images:portable(baseImages)});
      if(encoder.encode(text).length>LIMIT)throw Error("The writing index exceeds the safe sync size. All local data is unchanged.");
      const reusableBase=publication&&publication.group===settings.group&&publication.baseText===text&&sameImages(publication.baseImages,baseImages);
      const index=reusableBase?publication.baseIndex:await stage(text,run),keep=[...new Set([...index.parts,...storyParts,...Object.values({...baseImages,...extraImages}).flatMap(d=>d.parts),...Object.values(extensions).flatMap(d=>d.index.parts)])];
      await call("beginPublish",{},run);for(let i=0;i<keep.length;i+=1024)await call("retain",{hashes:keep.slice(i,i+1024)},run);
      try{await call("publish",{head:{format:1,index,revision,extensions,established:established===true}},run);}
      catch(error){
        // Only the local publisher knows that its retained immutable chunks
        // disappeared. A remote checksum/authentication error must not force
        // this device to decrypt and prepare its entire healthy photo library.
        if(/^A referenced (?:sync )?chunk is missing$/i.test(error.message)){storyRecords.clear();if(settings.photoCacheInspection===1)cacheInspectionNeeded=true;else invalidCache=true;}
        throw error;
      }
      invalidCache=false;
      const result={library:revision,extension:extensionRevision,omittedChats,draftHandoffError};publication={group:settings.group,snapshot,images,handoffRaw,baseText:text,baseImages,baseIndex:index,established:established===true,at:Date.now(),revision:result};return result;
    }
    async function readLocal(){
      const raw=Object.create(null);for(const [key]of Object.values(C.TABLES))raw[key]=await get(key);
      if(draftLane)raw[draftLane.key]=await get(draftLane.key);
      const stateRaw=await get(STATE);
      if(localRead&&localRead.group===settings.group&&localRead.stateRaw===stateRaw&&sameRaw(localRead.raw,raw))return {...localRead,raw};
      let state=stateRaw?JSON.parse(stateRaw):{};
      if(state.group!==settings.group)state={group:settings.group,approved:false,images:{}};
      localRead={group:settings.group,raw,state,stateRaw,items:C.collect(raw)};return localRead;
    }
    const primary=()=>settings.primaryPreference?.device||settings.primary;
    async function refreshPrimary(run){
      const next=await call("status",{},run);
      if(!next.enabled||next.group!==settings.group)throw Error("Sync group changed. Checking again safely.");
      settings=next;report(current.phase,current.message,{settings});
    }
    function peerWarning(peers,localOmitted=0){
      const incompatible=peers.find(p=>/update.*private Chat/i.test(p.error||""))?.error;
      if(incompatible)return incompatible;
      const blocked=peers.find(p=>p.reachWarning)?.reachWarning;
      if(blocked)return blocked;
      if(localOmitted)return localOmitted+" oversized conversation(s) cannot be shared from this device. Other chats and library changes can sync.";
      if(peers.some(p=>p.omittedChats))return "A paired device has an oversized conversation whose latest version cannot be shared. Other chats and library changes can sync.";
      if(peers.some(p=>p.draftHandoffError))return "A paired draft handoff could not be verified. Conversations can still sync; retry the handoff after checking both devices.";
      return null;
    }
    function storySnapshot(snapshot){return {format:1,entries:Object.fromEntries(Object.entries(snapshot&&snapshot.entries||{}).filter(([key])=>C.parts(key)[0]==="conversation"))};}
    async function reloadDraftHandoffs(run){
      if(!draftsNeedReload)return;
      if(options.onDraftHandoffsApplied)await options.onDraftHandoffsApplied();
      else if(typeof host.RolecraftDraftHandoffReload==="function")await host.RolecraftDraftHandoffReload();
      check(run);draftsNeedReload=false;
    }
    async function mergeDraftHandoffs(localRaw,remote,run){
      if(!draftLane)return {raw:localRaw,error:null};
      let current,next;
      try{
        current=draftLane.parse(localRaw);
        next=draftLane.merge([current,...remote.filter(Boolean)],Date.now());
      }catch(error){return {raw:localRaw,error:error.message||"Invalid draft handoff lane"};}
      if(C.canonical(current)===C.canonical(next))return {raw:localRaw,error:null,changed:false};
      const text=C.canonical(next);
      if(encoder.encode(text).length>draftLane.limit)return {raw:localRaw,error:"Draft handoff lane exceeds its safe size"};
      check(run);await storage.syncCommit({[draftLane.key]:text},{[draftLane.key]:localRaw});
      draftsNeedReload=true;localStorySaved();check(run);
      await reloadDraftHandoffs(run);
      return {raw:text,error:null,changed:true};
    }
    async function storyTick(run,localOnly=false){
      if(storiesNeedReload){
        if(!(options.canApplyStories||options.canApply)())return;
        report("applying","Refreshing saved conversations…",{chatOnly:true,reloadOnly:true});
        await reloadStories();
        check(run);storiesNeedReload=false;
      }
      // Reuse established library metadata; never read, fingerprint or prepare
      // gallery bytes while the user is writing. Initial library consent still
      // happens in Settings before this lightweight channel can run.
      const stateRaw=await get(STATE),raw=await get("chats:all"),handoffRaw=draftLane?await get(draftLane.key):null;check(run);
      const cachedLocal=storyLocal&&storyLocal.stateRaw===stateRaw&&storyLocal.raw===raw&&storyLocal.handoffRaw===handoffRaw?storyLocal:null;
      const state=cachedLocal?cachedLocal.state:stateRaw?JSON.parse(stateRaw):{};
      if(state.group!==settings.group||!state.approved&&!state.accepted){report("waiting","Approve the first library comparison in Settings, then Chat can sync while pictures continue later.",{settings,chatOnly:true});return false;}
      const rows=cachedLocal?[]:host.RolecraftChatSync.validate(JSON.parse(raw||"[]"));check(run);
      const items={};
      for(const row of rows){
        // Publish the saved user turn immediately, but not an unfinished AI
        // placeholder that another device could mistake for an interrupted reply.
        const pending=new Map(row.messages.filter(m=>m.pending).map(m=>[m.id,m]));
        let leaf=row.leafId,hops=0;while(pending.has(leaf)){if(++hops>pending.size)throw Error("A pending conversation has a broken message chain");leaf=pending.get(leaf).parentId;}
        items[C.keyOf("conversation",row.id)]=pending.size?{...row,leafId:leaf,messages:row.messages.filter(m=>!m.pending)}:row;
      }
      const snapshot=cachedLocal?cachedLocal.snapshot:await C.scan(items,storySnapshot(state.snapshot),settings.device,workHash);
      if(!cachedLocal)await C.validate(snapshot,workHash);check(run);
      const combined=cachedLocal?state.snapshot:{format:1,entries:{...state.snapshot.entries,...snapshot.entries}};
      const nextState=cachedLocal?state:{...state,snapshot:combined},nextStateRaw=cachedLocal?stateRaw:JSON.stringify(nextState);
      if(nextStateRaw!==stateRaw){await storage.syncCommit({[STATE]:nextStateRaw},{[STATE]:stateRaw,"chats:all":raw});check(run);}
      storyLocal={raw,handoffRaw,stateRaw:nextStateRaw,state:nextState,snapshot};
      const publicationKey=nextStateRaw+"\n"+handoffRaw;
      if(!storyPublication||storyPublication.key!==publicationKey){
        const revision=await publish(combined,state.images||{},handoffRaw,run,state.approved===true);
        storyPublication={key:publicationKey,revision};
      }
      if(storyPublication.revision.draftHandoffError)report(current.phase,current.message,{draftHandoffError:storyPublication.revision.draftHandoffError});
      // A manual device still stages its own durable Chat saves for peers. It
      // does not discover or import their changes until Refresh now is chosen.
      if(localOnly)return true;
      const fullDiscovery=Date.now()-lastFullStoryDiscover>=15000;
      const discovered=await call("discover",{waitMs:fullDiscovery?750:0},run),snapshots=[snapshot],peers=[],peerDrafts=[];
      if(fullDiscovery)lastFullStoryDiscover=Date.now();
      for(const peer of peerList(discovered)){
        const deferred=deferredPeer(peer);if(deferred){peers.push(deferred);continue;}
        try{
          const r=await call("index",{peer:peer.id},run),extension=r.head&&r.head.extensions&&r.head.extensions.stories1;
          if(!extension){peerRetries.delete(peer.id);peers.push({id:peer.id,label:peer.label||"Paired device",online:false,error:"Update this paired device to the latest private Chat app to sync conversations."});continue;}
          const cacheKey="stories:"+extension.revision+":"+extension.index?.hash,cached=remoteCache.get(peer.id);
          const fetched=cached&&cached.revision===cacheKey&&!cached.incoming.draftError?null:await readStoryIndex(extension.index,peer.id,run,cached&&cached.storyRecords);
          const incoming=fetched?fetched.incoming:cached.incoming;
          if(incoming.format!==1||incoming.group!==settings.group||!incoming.snapshot||Object.keys(incoming.snapshot.entries||{}).some(key=>C.parts(key)[0]!=="conversation"))throw Error("Incompatible conversation index");
          if(fetched)await C.validate(incoming.snapshot,workHash);check(run);
          peerRetries.delete(peer.id);remoteCache.set(peer.id,{revision:cacheKey,incoming,storyRecords:fetched?fetched.storyRecords:cached.storyRecords});snapshots.push(incoming.snapshot);
          peerDrafts.push(incoming.draftHandoff);
          peers.push({id:peer.id,label:r.label||peer.label||"Paired device",primarySelection:r.primarySelection,online:true,reachWarning:reachWarning(r,r.label||peer.label),revision:extension.revision,omittedChats:incoming.omitted?.length||0,draftHandoffSupported:incoming.draftSupported===true,draftHandoffError:incoming.draftError||null});
        }catch(e){check(run);peers.push(failedPeer(peer,e));}
      }
      await refreshPrimary(run);
      if(settings.primaryPreference){const received=peers.filter(p=>p.online);for(let i=received.length-1;i>=0;i--)if(received[i].primarySelection!==1){snapshots.splice(i+1,1);peerDrafts.splice(i,1);received[i].online=false;received[i].error="Update every paired private Chat app to use the selected primary without duplicate cards.";}}
      const draftResult=await mergeDraftHandoffs(handoffRaw,peerDrafts,run);
      if(draftResult.error)report(current.phase,current.message,{draftHandoffError:draftResult.error});
      else if(current.draftHandoffError)report(current.phase,current.message,{draftHandoffError:null});
      if(draftResult.changed){if(manualRefresh)manualRequested=true;report("saved","Draft handoff saved here. Sharing the updated offer lane with paired devices…",{peers,chatOnly:true});return;}
      if(snapshots.length===1){report("waiting",peerWarning(peers,storyPublication.revision.omittedChats)||"Chats saved here. Waiting for another open, unlocked Chat device.",{peers,chatOnly:true});return;}
      if(!peerWarning(peers,storyPublication.revision.omittedChats)&&peers.filter(p=>p.online).every(p=>p.revision===storyPublication.revision.extension)){
        report("synced","Chats up to date on "+peers.filter(p=>p.online).length+" other device(s).",{peers,chatOnly:true,lastSynced:Date.now()});return;
      }
      const merged=await C.merge(snapshots,primary(),workHash);
      const changed=C.canonical(merged.snapshot)!==C.canonical(snapshot);
      if(changed){
        if(!(options.canApplyStories||options.canApply)()){report("busy","Chats saved here. Incoming changes wait until this reply or edit finishes.",{peers,chatOnly:true});return;}
        const values=C.expand(merged.items,{"chats:all":raw}),text=values["chats:all"];
        // The applied content hashes distinguish a new conversation from a
        // clock-only merge without parsing and reserializing a large Chat table.
        const chatUnchanged=text===raw||Object.entries(merged.snapshot.entries).every(([key,entry])=>entry.applied===snapshot.entries[key]?.applied);
        const mergedState=JSON.stringify({...nextState,snapshot:{format:1,entries:{...combined.entries,...merged.snapshot.entries}}});
        check(run);if(!(options.canApplyStories||options.canApply)())return;
        // A clock-only merge changes bookkeeping, not anything on screen.
        if(!chatUnchanged)report("applying","Updating conversations…",{peers,chatOnly:true,reloadOnly:false});
        await storage.syncCommit(chatUnchanged?{[STATE]:mergedState}:{"chats:all":text,[STATE]:mergedState},{"chats:all":raw,[STATE]:nextStateRaw});
        if(!chatUnchanged){
          storiesNeedReload=true;check(run);
          await reloadStories();
          check(run);storiesNeedReload=false;
        }else check(run);
        report("saved","Chats saved here. Waiting for paired devices to catch up.",{peers,chatOnly:true});
      }else{
        const online=peers.filter(p=>p.online),warning=peerWarning(peers,storyPublication.revision.omittedChats),synced=!warning&&online.length&&online.every(p=>p.revision===storyPublication.revision.extension);
        report(synced?"synced":warning?"waiting":"checking",warning|| (synced?"Chats up to date on "+online.length+" other device(s).":"Exchanging conversations…"),{peers,chatOnly:true,lastSynced:synced?Date.now():current.lastSynced});
      }
    }
    function wakeStories(){
      if(stopped||suspended()||manualRefresh||maintenance||!transport||!ready())return;
      wakePending=true;idleStreak=0;
      if(busy)return;
      clearTimeout(timer);timer=setTimeout(tick,0);
    }
    function localStorySaved(){
      if(stopped||suspended()||maintenance||!transport||!ready())return;
      if(!manualRefresh)return wakeStories();
      // A native peer wake remains ignored in manual mode, but a local saved
      // turn must be available when another device explicitly refreshes.
      wakePending=true;idleStreak=0;
      if(busy)return;
      clearTimeout(timer);timer=setTimeout(tick,0);
    }
    function bindNativeWake(){
      if(nativeWakeOff||nativeWakePending)return;
      if(typeof transport.onWake==="function"){nativeWakeOff=transport.onWake(wakeStories);return;}
      if(host.Capacitor&&typeof host.Capacitor.addListener==="function"){
        nativeWakePending=Promise.resolve(host.Capacitor.addListener("VaultSync","vaultSyncWake",wakeStories)).then(handle=>{
          if(stopped){if(handle&&typeof handle.remove==="function")handle.remove();}
          else nativeWakeOff=()=>{if(handle&&typeof handle.remove==="function")handle.remove();};
        }).catch(()=>{}).finally(()=>{nativeWakePending=null;});
      }else if(host.Capacitor&&typeof host.Capacitor.nativeCallback==="function"){
        const C=host.Capacitor,callbackId=C.nativeCallback("VaultSync","addListener",{eventName:"vaultSyncWake"},wakeStories);
        nativeWakeOff=()=>{C.nativePromise("VaultSync","removeListener",{eventName:"vaultSyncWake",callbackId}).catch(()=>{});};
      }
    }
    async function tick(){
      if(stopped||suspended()||busy||maintenance||!transport)return;busy=true;const woken=wakePending;wakePending=false;quietDeferred=false;const run=epoch,requested=manualRequested;manualRequested=false;
      if(requested)idleStreak=0;
      try{
        if(!ready()){clearWorkCache();storyLocal=null;storyPublication=null;remoteCache.clear();peerRetries.clear();await transport.call("pause",{reason:options.ready()?"hidden":"locked"}).catch(()=>{});report("paused","Pairing is remembered. Open and unlock the app to resume.");return;}
        // An explicit "1" or "0" is the user's choice; a device that never chose
        // follows the app's default (on-demand since 1.338).
        if(!manualModeLoaded){const mode=await get("ui:sync-manual-refresh");manualRefresh=mode==="1"||mode!=="0"&&options.defaultManual===true;manualModeLoaded=true;}
        // Never read, hash or publish the Chat table in the middle of typing or
        // a streaming reply. Nothing is lost: the pass runs a moment later.
        if(!requested&&(storiesOnly()||manualRefresh)&&typeof options.storiesQuiet==="function"&&options.storiesQuiet()){quietDeferred=true;wakePending=woken;return;}
        settings=await call("status",{},run);
        if(settings.enabled&&options.previousNamespace&&settings.namespace===options.previousNamespace)settings=await call("upgradeNamespace",{from:options.previousNamespace,to:options.namespace||"library1"},run);
        if(peerRetryGroup!==settings.group){peerRetries.clear();storyRecords.clear();remoteCache.clear();peerRetryGroup=settings.group;}
        if(fullNeedReload){
          if(!options.canApply()){report("busy","Saved changes are waiting for this screen to finish editing before it reloads.",{settings});return;}
          // The records are already saved; this only redraws them. Do not cover
          // the app with the saving overlay on every retry (1.338).
          report("applying","Refreshing saved library and conversations…",{settings,chatOnly:false,reloadOnly:true});
          await options.onApplied();check(run);fullNeedReload=false;
        }
        if(storiesNeedReload&&!storiesOnly()){
          if(!(options.canApplyStories||options.canApply)()){report("busy","Saved chats are waiting for Chat to finish before they reload.",{settings});return;}
          report("applying","Refreshing saved conversations…",{settings,chatOnly:true,reloadOnly:true});
          await reloadStories();check(run);storiesNeedReload=false;
        }
        reloadFailures=0;
        if(!settings.enabled){report("off","Choose the most up-to-date device as primary, or join its remembered group.",{settings,preview:null,peers:[]});return;}
        await reloadDraftHandoffs(run);
        if(manualRefresh&&!requested){
          try{await call("serve",{},run);servingError=false;}catch(error){servingError=true;throw error;}
          if((await storyTick(run,true))===false)return;
          const warning=storyPublication&&peerWarning([],storyPublication.revision.omittedChats);
          report(warning?"waiting":"manual",warning||"Manual refresh is on. This device serves its published chats; choose Refresh now to fetch changes from peers.",{settings,preview:null,peers:[],chatOnly:!!storiesOnly()});
          return;
        }
        if(requested||!settled())report("checking",storiesOnly()?"Checking paired Chat devices…":"Checking for changes on this local network…",{settings,chatOnly:!!storiesOnly()});
        if(storiesOnly()){await storyTick(run);return;}
        let local=await readLocal();check(run);
        let snapshot;
        if(localScan&&localScan.group===settings.group&&localScan.stateRaw===local.stateRaw&&sameRaw(localScan.raw,local.raw))snapshot=localScan.snapshot;
        else{snapshot=await C.scan(local.items,local.state.snapshot,settings.device,workHash);await C.validate(snapshot,workHash);}
        const images=await localImages(snapshot,local.state.images,run);
        if(current.phase==="preparing")report("checking","Pictures ready. Comparing saved changes with paired devices…");
        const refreshed=await readLocal();check(run);
        if(!sameRaw(refreshed.raw,local.raw)){report("checking","Picture preparation saved. Picking up your latest writing on the next pass.");return;}
        local=refreshed;
        const localState={...local.state,group:settings.group,snapshot,images:{...local.state.images,...images}};
        const outgoingState=JSON.stringify(localState);
        /* Publish only revisions already saved in the encrypted vault. A failed
           metadata write cannot be advertised as a successful peer save. */
        if(outgoingState!==local.stateRaw){await storage.syncCommit({[STATE]:outgoingState},{...local.raw,[STATE]:local.stateRaw});local.stateRaw=outgoingState;}
        local.state=localState;
        localScan={group:settings.group,stateRaw:local.stateRaw,raw:local.raw,snapshot};
        const revision=await publish(snapshot,images,draftLane&&(local.state.approved||local.state.accepted)?local.raw[draftLane.key]:null,run,local.state.approved);
        if(revision.draftHandoffError)report(current.phase,current.message,{draftHandoffError:revision.draftHandoffError});
        const discovered=await call("discover",{},run), peers=[],sources=[],snapshots=[snapshot],peerDrafts=[];
        for(const peer of peerList(discovered)){
          const deferred=deferredPeer(peer);if(deferred){peers.push(deferred);continue;}
          try{
            const r=await call("index",{peer:peer.id},run);if(!r.head){peerRetries.delete(peer.id);continue;}
            const cached=remoteCache.get(peer.id);
            const extension=C.extension&&r.head.extensions&&r.head.extensions[C.extension.id];
            const cacheKey=r.head.revision+":"+(extension?extension.revision+":"+extension.index?.hash:"");
            let incoming=cached&&cached.revision===cacheKey&&!cached.incoming.draftError?cached.incoming:JSON.parse(await download(r.head.index,peer.id,run,LIMIT));
            let fetched=null;
            if(!(cached&&cached.revision===cacheKey&&!cached.incoming.draftError)&&extension){
              fetched=await readStoryIndex(extension.index,peer.id,run,cached&&cached.storyRecords);
              const extra=fetched.incoming;
              if(extra.format!==1||extra.group!==settings.group||!extra.images||!extra.snapshot||Object.keys(extra.snapshot.entries||{}).some(key=>!C.extension.kinds.includes(C.parts(key)[0])))throw Error("Incompatible optional sync index");
              await C.validate(extra.snapshot,workHash);
              for(const key of Object.keys(extra.snapshot.entries))if(Object.prototype.hasOwnProperty.call(incoming.snapshot.entries,key))throw Error("Duplicate optional sync record");
              incoming={...incoming,snapshot:{format:1,entries:{...incoming.snapshot.entries,...extra.snapshot.entries}},images:{...incoming.images,...extra.images},omitted:extra.omitted,
                draftHandoff:extra.draftHandoff,draftSupported:extra.draftSupported,draftError:extra.draftError};
            }
            if(incoming.format!==1||incoming.group!==settings.group||!incoming.images||typeof incoming.images!=="object")throw Error("Peer has an incompatible sync index");
            if(!(cached&&cached.revision===cacheKey&&!cached.incoming.draftError))await C.validate(incoming.snapshot,workHash);
            for(const [key,d]of Object.entries(incoming.images)){if(!/^(img:|th:)/.test(key))throw Error("Invalid picture key");descriptor(d);}
            peerRetries.delete(peer.id);remoteCache.set(peer.id,{revision:cacheKey,incoming,storyRecords:fetched?fetched.storyRecords:extension&&cached?cached.storyRecords:null});
            snapshots.push(incoming.snapshot);sources.push({peer:peer.id,images:incoming.images});peerDrafts.push(incoming.draftHandoff);
            peers.push({id:peer.id,label:r.label||peer.label||"Paired device",primarySelection:r.primarySelection,reachWarning:reachWarning(r,r.label||peer.label),revision:r.head.revision,extensionRevision:extension&&extension.revision,omittedChats:incoming.omitted?.length||0,established:r.head.established===true,online:true,
              draftHandoffSupported:incoming.draftSupported===true,draftHandoffError:incoming.draftError||null,...(C.extension&&!extension?{error:"Update this paired device to the latest private Chat app to sync conversations."}:{})});
          }catch(e){check(run);peers.push(failedPeer(peer,e));}
        }
        await refreshPrimary(run);
        // A later peer may have activated the policy during this pass. Do not
        // import a legacy peer fetched before that authenticated selection.
        if(settings.primaryPreference){for(let i=sources.length-1;i>=0;i--){const p=peers.find(p=>p.id===sources[i].peer);if(p.primarySelection!==1){snapshots.splice(i+1,1);sources.splice(i,1);peerDrafts.splice(i,1);p.online=false;p.error="Update every paired private Chat app to use the selected primary without duplicate cards.";}}}
        async function applyRemoteDrafts(){
          const result=await mergeDraftHandoffs(local.raw[draftLane.key],peerDrafts,run);
          local.raw[draftLane.key]=result.raw;
          if(result.error)report(current.phase,current.message,{draftHandoffError:result.error});
          else if(current.draftHandoffError)report(current.phase,current.message,{draftHandoffError:null});
          return result.changed===true;
        }
        if(draftLane&&(local.state.approved||local.state.accepted)&&await applyRemoteDrafts()){
          if(manualRefresh)manualRequested=true;report("saved","Draft handoff saved here. Sharing the updated offer lane with paired devices…",{peers});return;
        }
        if(snapshots.length===1){report("waiting",peerWarning(peers,revision.omittedChats)||"Pairing is remembered. Waiting for another open, unlocked device on this network.",{peers,preview:null});return;}
        if(!local.state.approved&&settings.device!==settings.primary&&!peers.some(p=>p.online&&(p.id===settings.primary||p.established))){report("waiting","Open the starting device or any device that has completed its first sync to compare this library safely.",{peers});return;}
        const selection=C.canonical(settings.primaryPreference||null);
        const peerState=C.canonical(peers.filter(p=>p.online).map(p=>[p.id,p.revision,p.extensionRevision,p.established]).sort((a,b)=>a[0].localeCompare(b[0])));
        if(local.state.approved&&reconciliation&&reconciliation.snapshot===snapshot&&reconciliation.selection===selection&&reconciliation.peers===peerState){
          const online=peers.filter(p=>p.online),warning=peerWarning(peers,revision.omittedChats),synced=!warning&&online.length&&online.every(p=>p.revision===revision.library&&(!C.extension||p.extensionRevision===revision.extension));
          report(synced?"synced":warning?"waiting":"checking",warning|| (synced?"Up to date with "+online.length+" online device(s).":"Waiting for paired devices to confirm saved changes…"),{peers,preview:null,lastSynced:synced?Date.now():current.lastSynced});return;
        }
        const merged=await C.merge(snapshots,primary(),workHash,settings.primaryPreference?{singleLibrary:true,device:settings.device,localSnapshot:snapshot}:undefined);
        /* Remote deletion is recoverable here even if this replica did not have
           the sender's bin entry yet. No image is ever deleted by sync. */
        for(const [key,value]of Object.entries(local.items))if(!Object.prototype.hasOwnProperty.call(merged.items,key)){
          const [kind,id]=C.parts(key);
          if(["character","persona","lore","prompt"].includes(kind)){
            if((merged.recoveryDependencies?.[key]||[]).some(binKey=>C.canonical(merged.items[binKey]?.record)===C.canonical(value)))continue;
            const tid="sync-"+(await hash(key+C.canonical(value))).slice(0,32),binKey=C.keyOf("trash",tid);
            if(!merged.snapshot.entries[binKey]&&!merged.items[binKey])merged.items[binKey]={tid,type:kind,record:value,deletedAt:Math.max(...merged.snapshot.entries[key].versions.map(v=>v.at)),syncRecovered:true};
          }
        }
        merged.snapshot=await C.scan(merged.items,merged.snapshot,settings.device,workHash);
        const diff=C.difference(local.items,merged.items), changed=diff.added+diff.changed+diff.removed;
        const planId=await hash(C.canonical(merged.snapshot));
        if(!local.state.approved&&!local.state.accepted&&changed&&approval!==planId){report("preview","Review the initial merge before anything in this library is replaced.",{peers,preview:{...diff,conflicts:merged.conflicts,id:planId}});return;}
        if(!options.canApply()){report("busy","Changes are ready. Finish editing to let sync save them safely.",{peers});return;}
        // Consent starts automatic reconciliation; it does not advertise a
        // partially received device as established or acknowledge unsaved work.
        if(!local.state.accepted&&!local.state.approved){
          local.state={...local.state,accepted:true};const accepted=JSON.stringify(local.state);
          await storage.syncCommit({[STATE]:accepted},{...local.raw,[STATE]:local.stateRaw});local.stateRaw=accepted;approval=null;
          if(draftLane&&await applyRemoteDrafts()){
            if(manualRefresh)manualRequested=true;report("saved","Draft handoff saved here. Sharing the updated offer lane with paired devices…",{peers});return;
          }
        }
        const needed=refs(merged.snapshot),allImages={...images},pending=[];
        let received=needed.filter(id=>allImages["img:"+id]).length,committed=false,lastCommit=Date.now(),cacheDirty=false;
        const units=Object.entries(merged.snapshot.entries).map(([key,entry])=>({key,entry,ids:merged.items[key]?refs({entries:{[key]:entry}}):[]})).sort((a,b)=>a.ids.length-b.ids.length);
        // Archive losing writing (and receive its pictures) before replacing
        // its visible card, even when an image download interrupts this pass.
        const ordered=[],visited=new Set(),byKey=new Map(units.map(u=>[u.key,u]));
        function visit(unit){if(visited.has(unit.key))return;visited.add(unit.key);for(const key of merged.recoveryDependencies?.[unit.key]||[]){const dependency=byKey.get(key);if(dependency)visit(dependency);}ordered.push(unit);}
        units.forEach(visit);
        async function commitPending(final){
          check(run);if(!options.canApply())return false;
          await refreshPrimary(run);if(C.canonical(settings.primaryPreference||null)!==selection)throw Error("The chosen primary changed. Saved progress is safe; comparing again.");
          const latest=await readLocal();check(run);
          if(!sameRaw(latest.raw,local.raw))throw Error("Library changed during sync. Completed progress is saved; picking up your edit on the next pass.");
          const items={...local.items},partial={format:1,entries:{...(local.state.snapshot||snapshot).entries}};
          for(const unit of pending){partial.entries[unit.key]=unit.entry;if(merged.items[unit.key])items[unit.key]=merged.items[unit.key];else delete items[unit.key];}
          const nextState={...latest.state,accepted:true,approved:!!latest.state.approved||final,snapshot:partial,images:{...latest.state.images,...allImages}};
          const nextRaw=C.expand(items,local.raw),values={};let writing=false;
          const tables=new Set(pending.map(u=>C.TABLES[C.parts(u.key)[0]][0]));
          const chatContentChanged=pending.some(u=>C.parts(u.key)[0]==="conversation"&&u.entry.applied!==(local.state.snapshot||snapshot).entries[u.key]?.applied);
          for(const [key,text]of Object.entries(nextRaw))if(tables.has(key)&&text!==local.raw[key]&&(key!=="chats:all"||chatContentChanged)){values[key]=text;writing=true;}
          const nextStateRaw=JSON.stringify(nextState);if(nextStateRaw!==latest.stateRaw)values[STATE]=nextStateRaw;
          if(Object.keys(values).length){
            // Chats saved on another device change nothing in the library. Chat
            // reloads them read-only; the library is not covered or redrawn.
            const chatsOnly=writing&&Object.keys(values).every(key=>key===STATE||key==="chats:all");
            if(writing){report("applying",chatsOnly?"Updating conversations…":"Saving completed records. Remaining pictures will continue next…",{peers,preview:null,chatOnly:chatsOnly,reloadOnly:false});await sleep(50);check(run);if(!(chatsOnly?(options.canApplyStories||options.canApply):options.canApply)()){report("busy","Changes are ready. Finish editing to let sync save them safely.",{peers,chatOnly:false,reloadOnly:false});return false;}}
            await refreshPrimary(run);if(C.canonical(settings.primaryPreference||null)!==selection)throw Error("The chosen primary changed. Saved progress is safe; comparing again.");
            await storage.syncCommit(values,{...local.raw,[STATE]:latest.stateRaw});if(writing){if(chatsOnly)storiesNeedReload=true;else fullNeedReload=true;}check(run);committed=true;
            local={raw:{...local.raw,...Object.fromEntries(Object.entries(values).filter(([key])=>key!==STATE))},items,state:nextState,stateRaw:nextStateRaw};
            if(writing){if(chatsOnly){await reloadStories();check(run);storiesNeedReload=false;}else{await options.onApplied();check(run);fullNeedReload=false;}}
          }
          pending.length=0;lastCommit=Date.now();cacheDirty=false;
          return true;
        }
        try{
          for(const unit of ordered){
            if(!merged.items[unit.key])continue; // Deletions wait for their recoverable bin records.
            for(const id of unit.ids)for(const prefix of ["img:","th:"]){
              const key=prefix+id,available=sources.filter(s=>s.images[key]);
              if(!available.length){if(prefix==="img:"&&!allImages[key])throw Error("A peer's referenced picture is missing. Completed records remain saved.");continue;}
              const target=available[0].images[key];
              if(prefix==="img:"&&(available.some(s=>s.images[key].hash!==target.hash)||allImages[key]&&allImages[key].hash!==target.hash))throw Error("Two libraries contain different pictures with the same identity. Neither picture was overwritten.");
              if(allImages[key])continue;
              const cached=local.state.images&&local.state.images[key];
              if(!invalidCache&&cached&&cached.hash===target.hash&&cached.fingerprint!=null&&cached.fingerprint===await storage.fingerprint(key)){allImages[key]=cached;if(prefix==="img:")received++;continue;}
              report("receiving","Receiving pictures safely… "+received+" of "+needed.length+" originals. Completed records are saved as we go.",{peers,preview:null,done:received,total:needed.length},false);
              const value=await download(target,available[0].peer,run);
              await storage.syncImage(key,value);check(run);
              allImages[key]={...target,fingerprint:await storage.fingerprint(key)};cacheDirty=true;if(prefix==="img:")received++;
              if(Date.now()-lastCommit>2000){
                if(pending.length)await commitPending(false);
                if(cacheDirty){await rememberImages(allImages,run);cacheDirty=false;lastCommit=Date.now();}
              }
            }
            if(C.canonical((local.state.snapshot||snapshot).entries[unit.key])!==C.canonical(unit.entry))pending.push(unit);
            if(pending.length>=16||Date.now()-lastCommit>2000||!committed&&pending.length)await commitPending(false);
          }
          for(const unit of units)if(!merged.items[unit.key])pending.push(unit);
          if(!await commitPending(true)){report("busy","Downloaded progress is saved. Finish editing to apply the remaining records.",{peers});return;}
        }finally{if(cacheDirty)await rememberImages(allImages,run);}
        if(committed){
          report("saved","Changes saved here. Waiting for other devices to confirm their copies.",{peers,preview:null});
        }else{
          reconciliation={snapshot,selection,peers:peerState};
          const online=peers.filter(p=>p.online),warning=peerWarning(peers,revision.omittedChats),synced=!warning&&online.length&&online.every(p=>p.revision===revision.library&&(!C.extension||p.extensionRevision===revision.extension));
          report(synced?"synced":warning?"waiting":"checking",warning|| (synced?"Up to date with "+online.length+" online device"+(online.length===1?"":"s")+".":"Exchanging changes with paired devices…"),{peers,preview:null,lastSynced:synced?Date.now():current.lastSynced});
        }
      }catch(e){clearWorkCache();if(fullNeedReload||storiesNeedReload)reloadFailures++;if(run===epoch){if(suspended())report("paused",pauseMessage);else{storyPublication=null;report("error",e.message+(manualRefresh?" Local changes are retained; choose Refresh now to try again.":" Local changes are retained; sync retries automatically."));}}}
      finally{
        if(settings&&settings.enabled&&ready()&&!workspacePaused)firstCheck=false;busy=false;
        if(current.phase==="applying"&&!stopped)report(manualRefresh?"manual":"checking",manualRefresh?"Sync stopped before it finished. Everything already saved is kept; choose Sync now to finish.":"Sync was interrupted. Everything already saved is kept; continuing…",{chatOnly:false,reloadOnly:false});
        // Nothing changed: stretch the next background poll (up to 4x). Wakes,
        // local saves and Sync now still run at once.
        if(!quietDeferred)idleStreak=run===epoch&&["synced","waiting","manual"].includes(current.phase)?idleStreak+1:0;
        const reloadPending=fullNeedReload||storiesNeedReload;
        if(!stopped&&!suspended()&&!maintenance&&(!manualRefresh||manualRequested||wakePending||quietDeferred||reloadPending||draftsNeedReload)){
          const base=options.intervalMs||(storiesOnly()?2000:5000);
          const delay=run!==epoch||manualRequested?0:quietDeferred?Math.min(base,1000):wakePending?0:reloadPending&&reloadFailures?Math.min(60000,base*2**Math.min(reloadFailures,4)):base*Math.min(4,Math.max(1,idleStreak));
          clearTimeout(timer);timer=setTimeout(tick,delay);
        }
      }
    }
    async function exclusive(fn){
      if(maintenance)throw Error("Another sync setting is being saved. Try again in a moment.");
      maintenance=true;epoch++;clearWorkCache();const run=epoch;clearTimeout(timer);
      try{
        for(let i=0;busy&&i<200;i++){check(run);await sleep(50);}
        check(run);if(busy)throw Error("Sync is still stopping. Try again in a moment.");
        settings=await call("status",{},run);
        if(!settings.enabled||settings.primarySelection!==1)throw Error("Update this private Chat app and join a sync group first.");
        if(workspacePaused||!options.canApply())throw Error("Close Chat and finish editing before changing the shared library.");
        return await fn(run);
      }finally{maintenance=false;clearTimeout(timer);if(!stopped&&!suspended()){manualRequested=true;timer=setTimeout(tick,0);}}
    }
    async function setPrimary(){return exclusive(async run=>{
      const local=await readLocal();check(run);
      if(!local.state.approved)throw Error("Complete this device's first sync before making it primary.");
      settings=await call("setPrimary",{},run);remoteCache.clear();approval=null;
      report("checking","Primary changed. Normal edits still sync both ways; competing versions are kept in the Bin.",{settings,preview:null});return settings;
    });}
    async function reviewConflicts(){return exclusive(async run=>{
      if(!host.RolecraftSyncReview||!settings.primaryPreference)throw Error("Choose a primary device before reviewing old conflict copies.");
      const local=await readLocal();check(run);
      return {id:await hash(C.canonical(local.raw)),groups:host.RolecraftSyncReview.groups(local.items).map(g=>({...g,candidates:g.candidates.map(c=>({...c,pictureCount:options.imageIds(g.kind,c.record).length}))}))};
    });}
    async function resolveConflicts(review,choices){return exclusive(async run=>{
      if(!host.RolecraftSyncReview||!settings.primaryPreference)throw Error("Choose a primary device first.");
      const local=await readLocal();check(run);
      if(!local.state.approved)throw Error("Complete this device's first sync before reviewing duplicates.");
      if(!review||review.id!==await hash(C.canonical(local.raw)))throw Error("The library changed since you opened this review. Reload the review to keep the latest edits safe.");
      const snapshot=await C.scan(local.items,local.state.snapshot,settings.device,workHash);
      const result=await host.RolecraftSyncReview.resolve({items:local.items,snapshot,choices,device:settings.device,hash:workHash,core:C});
      await C.validate(result.snapshot,workHash);check(run);if(!options.canApply())throw Error("Finish editing before saving this review.");
      if(result.count){
        await storage.syncCommit({...C.expand(result.items,local.raw),[STATE]:JSON.stringify({...local.state,snapshot:result.snapshot})},{...local.raw,[STATE]:local.stateRaw});
        check(run);await options.onApplied();remoteCache.clear();
      }
      report("saved",result.count+" duplicate group(s) reviewed. Alternate versions are in the Bin; pictures and chat history are retained.",{preview:null});return result.count;
    });}
    async function configure(action,args={}){
      if(maintenance)throw Error("Another sync setting is being saved. Try again in a moment.");
      if(busy&&action!=="leave")throw Error("Wait for the current sync check to finish before changing the group.");
      epoch++;clearWorkCache();approval=null;invalidCache=true;cacheInspectionNeeded=false;pictureRepairs.clear();firstCheck=true;clearTimeout(timer);remoteCache.clear();peerRetries.clear();
      if(action!=="accept-request")await transport.call("pause",{});
      for(let i=0;busy&&i<200;i++)await sleep(50);
      if(busy)throw Error("Sync is still stopping. Try leaving again in a moment.");
      const r=await transport.call("configure",{...args,action,namespace:options.namespace||"library1"});settings=r;
      report(r.enabled?"checking":"off",r.enabled?"Pairing remembered. Preparing the first comparison…":"This device has left the sync group.",{settings:r,preview:null,code:null});
      manualRequested=true;clearTimeout(timer);timer=setTimeout(tick,0);return r;
    }
    async function setManualRefresh(value){
      if(stopped||!ready())throw Error("Open and unlock the vault to change sync mode.");
      await storage.set("ui:sync-manual-refresh",value?"1":"0");
      manualRefresh=value===true;manualModeLoaded=true;manualRequested=false;activityGeneration++;epoch++;wakePending=false;clearTimeout(timer);clearTimeout(pulseTimer);pulseTimer=null;clearWorkCache();
      servingError=false;
      if(manualRefresh){report("manual","Manual refresh is on. Saved chats remain available to paired devices; choose Refresh now to fetch their changes.");}
      else report("checking","Automatic sync resumed. Checking paired devices…");
      wakePending=true;timer=setTimeout(tick,0);pulseTimer=setTimeout(pulse,5000);
    }
    return {supported:!!transport&&!!storage.syncCommit,subscribe(fn){listeners.add(fn);fn(current);return()=>listeners.delete(fn);},start(){if(transport&&!stopped&&!suspended()){bindNativeWake();if(!pulseTimer)pulseTimer=setTimeout(pulse,5000);tick();}},stop(){stopped=true;epoch++;wakePending=false;clearWorkCache();remoteCache.clear();peerRetries.clear();clearTimeout(timer);clearTimeout(pulseTimer);if(nativeWakeOff){nativeWakeOff();nativeWakeOff=null;}if(transport)transport.call("pause",{}).catch(()=>{});},configure,setPrimary,reviewConflicts,resolveConflicts,wakeStories,localStorySaved,localDraftHandoffSaved:localStorySaved,setManualRefresh,
      setWorkspacePaused(value){
        value=value===true;if(stopped||workspacePaused===value)return;workspacePaused=value;activityGeneration++;epoch++;clearWorkCache();storyPublication=null;storyLocal=null;
        wakePending=false;clearTimeout(timer);clearTimeout(pulseTimer);pulseTimer=null;
        if(suspended()){pauseTask=transport?transport.call("pause",{}).catch(()=>{}):Promise.resolve();report("paused",pauseMessage);}
        else{wakePending=true;if(!busy)timer=setTimeout(tick,0);pulseTimer=setTimeout(pulse,5000);}
      },
      async invite(){const run=epoch;check(run);const r=await call("invite",{},run);report(current.phase,current.message,{code:r.code});return r.code;},
      async requestJoin(label){const r=await call("joinRequest",{label,namespace:options.namespace||"library1"});settings=r;report("off","Scan this QR using a device already in your group.",{settings:r});},
      async offerJoin(code){return call("offerJoin",{code});},
      approve(id){approval=id;manualRequested=true;clearTimeout(timer);if(!busy)timer=setTimeout(tick,0);},
      retry(){peerRetries.clear();manualRequested=true;clearTimeout(timer);if(!busy)timer=setTimeout(tick,0);}
    };
  }
  host.RolecraftVaultSync={create,hash};
})(window);
