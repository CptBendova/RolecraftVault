/* Local-only orchestration. Network access is exclusively in the native shell. */
(function(host){
  "use strict";
  const C=host.RolecraftSyncCore, STATE="sync:state", LIMIT=64*1024*1024;
  const encoder=new TextEncoder();
  const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(text))),b=>b.toString(16).padStart(2,"0")).join("");
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function create(options){
    const storage=options.storage;
    const transport=host.vaultSync || (host.Capacitor&&typeof host.Capacitor.nativePromise==="function"?{call:(method,args)=>host.Capacitor.nativePromise("VaultSync","dispatch",{method,args:args||{}})}:null);
    let stopped=false,busy=false,timer=null,epoch=0,approval=null,invalidCache=false,settings=null,lastPaint=0,firstCheck=true;
    let current={phase:"off",message:"Choose a primary device or join its group."};
    const remoteCache=new Map();
    const listeners=new Set();
    function report(phase,message,extra={},force=true){if(!force&&Date.now()-lastPaint<750)return;lastPaint=Date.now();current={...current,...extra,phase,message,initial:firstCheck};for(const fn of listeners)fn(current);}
    const get=async key=>{try{const r=await storage.get(key);return r?r.value:null;}catch(e){if(/not found/i.test(e.message))return null;throw e;}};
    const ready=()=>options.ready()&&!(host.Capacitor&&document.hidden);
    const check=run=>{if(run!==epoch||stopped||!ready())throw Error("Sync paused. Open and unlock the app to resume.");};
    const call=async(method,args,run=epoch)=>{check(run);const result=await transport.call(method,args||{});check(run);return result||{};};
    async function stage(text,run){
      const parts=[];
      for(let at=0;at<text.length;){
        let end=Math.min(text.length,at+192*1024);
        if(end<text.length&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff)end--;
        let piece=text.slice(at,end);
        while(encoder.encode(piece).length>256*1024){end=at+Math.floor((end-at)/2);if(text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff)end--;piece=text.slice(at,end);}
        const result=await call("put",{text:piece},run);parts.push(result.hash);at=end;
      }
      return {hash:await hash(text),parts,bytes:encoder.encode(text).length};
    }
    function descriptor(d,max=128*1024*1024){if(!d||!/^[a-f0-9]{64}$/.test(d.hash)||!Array.isArray(d.parts)||d.parts.length>4096||d.parts.some(h=>!/^[a-f0-9]{64}$/.test(h))||!Number.isSafeInteger(d.bytes)||d.bytes<0||d.bytes>max)throw Error("Invalid sync file description");return d;}
    async function download(d,peer,run,max){
      descriptor(d,max);const pieces=[];let length=0;
      for(const id of d.parts){const r=await call("chunk",{peer,hash:id},run);if(typeof r.text!=="string")throw Error("Missing sync chunk");length+=encoder.encode(r.text).length;if(length>d.bytes)throw Error("Sync file exceeded its declared size");pieces.push(r.text);}
      const text=pieces.join("");if(length!==d.bytes||await hash(text)!==d.hash)throw Error("Sync file checksum failed");return text;
    }
    function refs(snapshot){
      const ids=new Set();
      for(const [key,entry]of Object.entries(snapshot.entries))for(const version of entry.versions){if(!version.value||version.hash!==entry.applied)continue;const [kind]=C.parts(key);for(const id of options.imageIds(kind,version.value))if(typeof id==="string"&&id)ids.add(id);}
      return [...ids];
    }
    async function localImages(snapshot,old,run){
      const images=Object.create(null), ids=refs(snapshot);let done=0;
      const keys=ids.flatMap(id=>["img:"+id,"th:"+id]),marks={};
      for(let i=0;i<keys.length;i+=256){
        if(firstCheck)report("preparing","Checking saved pictures… "+Math.min(ids.length,Math.ceil(i/2))+" of "+ids.length,{done:Math.ceil(i/2),total:ids.length},false);
        Object.assign(marks,await storage.fingerprints(keys.slice(i,i+256)));check(run);
        await sleep(0);
      }
      for(const id of ids){
        done++;
        for(const prefix of ["img:","th:"]){
          const key=prefix+id,mark=marks[key],cached=!invalidCache&&old&&old[key];
          if(mark!=null&&cached&&cached.fingerprint===mark){images[key]=cached;continue;}
          report("preparing","Preparing picture "+done+" of "+ids.length,{done,total:ids.length},false);
          const value=await get(key);check(run);
          if(value==null){if(prefix==="img:")throw Error("A referenced picture could not be read. No library changes were made.");continue;}
          if(encoder.encode(value).length>128*1024*1024)throw Error("One picture exceeds the safe sync size. It remains on this device.");
          images[key]={...await stage(value,run),fingerprint:mark};
        }
      }
      return images;
    }
    function portable(images){return Object.fromEntries(Object.entries(images).map(([k,v])=>[k,{hash:v.hash,parts:v.parts,bytes:v.bytes}]));}
    async function publish(snapshot,images,run,established){
      const extended=C.extension, base={format:1,entries:{}}, extra={format:1,entries:{}};
      for(const [key,entry]of Object.entries(snapshot.entries))(extended&&extended.kinds.includes(C.parts(key)[0])?extra:base).entries[key]=entry;
      const baseIds=new Set(refs(base)),extraIds=new Set(refs(extra));
      const select=ids=>Object.fromEntries(Object.entries(images).filter(([key])=>ids.has(key.slice(key.indexOf(":")+1))));
      const baseImages=select(baseIds),extraImages=select(extraIds);
      const text=C.canonical({format:1,group:settings.group,snapshot:base,images:portable(baseImages)});
      if(encoder.encode(text).length>LIMIT)throw Error("The writing index exceeds the safe sync size. All local data is unchanged.");
      const index=await stage(text,run),keep=[...new Set([...index.parts,...Object.values(images).flatMap(d=>d.parts)])];
      const extensions={};let extensionRevision=null;
      if(extended){
        const extraText=C.canonical({format:1,group:settings.group,snapshot:extra,images:portable(extraImages)});
        if(encoder.encode(extraText).length>LIMIT)throw Error("The optional writing index exceeds the safe sync size.");
        const descriptor=await stage(extraText,run);keep.push(...descriptor.parts);
        extensionRevision=await hash(C.canonical(extra));extensions[extended.id]={index:descriptor,revision:extensionRevision};
      }
      await call("beginPublish",{},run);for(let i=0;i<keep.length;i+=1024)await call("retain",{hashes:keep.slice(i,i+1024)},run);
      // Preview encodings can legitimately differ between devices. They are
      // disposable presentation caches, not conflicting original artwork.
      const revision=await hash(C.canonical({snapshot:base,images:Object.fromEntries(Object.entries(baseImages).filter(([key])=>key.startsWith("img:")).map(([key,d])=>[key,d.hash]))}));
      await call("publish",{head:{format:1,index,revision,extensions,established:established===true}},run);invalidCache=false;return {library:revision,extension:extensionRevision};
    }
    async function readLocal(){
      const raw=Object.create(null);for(const [key]of Object.values(C.TABLES))raw[key]=await get(key);
      const stateRaw=await get(STATE);let state=stateRaw?JSON.parse(stateRaw):{};
      if(state.group!==settings.group)state={group:settings.group,approved:false,images:{}};
      return {raw,state,stateRaw,items:C.collect(raw)};
    }
    async function tick(){
      if(stopped||busy||!transport)return;busy=true;const run=epoch;
      try{
        if(!ready()){await transport.call("pause",{}).catch(()=>{});report("paused","Pairing is remembered. Open and unlock the app to resume.");return;}
        settings=await call("status",{},run);
        if(settings.enabled&&options.previousNamespace&&settings.namespace===options.previousNamespace)settings=await call("upgradeNamespace",{from:options.previousNamespace,to:options.namespace||"library1"},run);
        if(!settings.enabled){report("off","Choose the most up-to-date device as primary, or join its remembered group.",{settings,preview:null,peers:[]});return;}
        report("checking","Checking for changes on this local network…",{settings});
        let local=await readLocal();check(run);
        let snapshot=await C.scan(local.items,local.state.snapshot,settings.device,hash);
        await C.validate(snapshot,hash);
        const images=await localImages(snapshot,local.state.images,run);
        const localState={...local.state,group:settings.group,snapshot,images};
        const outgoingState=JSON.stringify(localState);
        /* Publish only revisions already saved in the encrypted vault. A failed
           metadata write cannot be advertised as a successful peer save. */
        if(outgoingState!==local.stateRaw){await storage.syncCommit({[STATE]:outgoingState},{...local.raw,[STATE]:local.stateRaw});local.stateRaw=outgoingState;}
        const revision=await publish(snapshot,images,run,local.state.approved);
        const discovered=await call("discover",{},run), peers=[],sources=[],snapshots=[snapshot];
        for(const peer of discovered.peers||[]){
          try{
            const r=await call("index",{peer:peer.id},run);if(!r.head)continue;
            const cached=remoteCache.get(peer.id);
            const extension=C.extension&&r.head.extensions&&r.head.extensions[C.extension.id];
            const cacheKey=r.head.revision+":"+(extension?extension.revision:"");
            let incoming=cached&&cached.revision===cacheKey?cached.incoming:JSON.parse(await download(r.head.index,peer.id,run,LIMIT));
            if(!(cached&&cached.revision===cacheKey)&&extension){
              const extra=JSON.parse(await download(extension.index,peer.id,run,LIMIT));
              if(extra.format!==1||extra.group!==settings.group||!extra.images||!extra.snapshot||Object.keys(extra.snapshot.entries||{}).some(key=>!C.extension.kinds.includes(C.parts(key)[0])))throw Error("Incompatible optional sync index");
              await C.validate(extra.snapshot,hash);
              for(const key of Object.keys(extra.snapshot.entries))if(Object.prototype.hasOwnProperty.call(incoming.snapshot.entries,key))throw Error("Duplicate optional sync record");
              incoming={...incoming,snapshot:{format:1,entries:{...incoming.snapshot.entries,...extra.snapshot.entries}},images:{...incoming.images,...extra.images}};
            }
            if(incoming.format!==1||incoming.group!==settings.group||!incoming.images||typeof incoming.images!=="object")throw Error("Peer has an incompatible sync index");
            await C.validate(incoming.snapshot,hash);
            for(const [key,d]of Object.entries(incoming.images)){if(!/^(img:|th:)/.test(key))throw Error("Invalid picture key");descriptor(d);}
            remoteCache.set(peer.id,{revision:cacheKey,incoming});
            snapshots.push(incoming.snapshot);sources.push({peer:peer.id,images:incoming.images});peers.push({id:peer.id,label:r.label||"Paired device",revision:r.head.revision,extensionRevision:extension&&extension.revision,established:r.head.established===true,online:true});
          }catch(e){check(run);peers.push({id:peer.id,label:"Paired device",online:false,error:e.message});}
        }
        check(run);
        if(snapshots.length===1){report("waiting","Pairing is remembered. Waiting for another open, unlocked device on this network.",{peers,preview:null});return;}
        if(!local.state.approved&&settings.device!==settings.primary&&!peers.some(p=>p.online&&(p.id===settings.primary||p.established))){report("waiting","Open the starting device or any device that has completed its first sync to compare this library safely.",{peers});return;}
        const merged=await C.merge(snapshots,settings.primary,hash);
        /* Remote deletion is recoverable here even if this replica did not have
           the sender's bin entry yet. No image is ever deleted by sync. */
        for(const [key,value]of Object.entries(local.items))if(!Object.prototype.hasOwnProperty.call(merged.items,key)){
          const [kind,id]=C.parts(key);
          if(["character","persona","lore","prompt"].includes(kind)){
            const tid="sync-"+(await hash(key+C.canonical(value))).slice(0,32),binKey=C.keyOf("trash",tid);
            if(!merged.items[binKey])merged.items[binKey]={tid,type:kind,record:value,deletedAt:Math.max(...merged.snapshot.entries[key].versions.map(v=>v.at)),syncRecovered:true};
          }
        }
        merged.snapshot=await C.scan(merged.items,merged.snapshot,settings.device,hash);
        const diff=C.difference(local.items,merged.items), changed=diff.added+diff.changed+diff.removed;
        const planId=await hash(C.canonical(merged.snapshot));
        if(!local.state.approved&&changed&&approval!==planId){report("preview","Review the initial merge before anything in this library is replaced.",{peers,preview:{...diff,conflicts:merged.conflicts,id:planId}});return;}
        if(!options.canApply()){report("busy","Changes are ready. Finish editing to let sync save them safely.",{peers});return;}
        const needed=refs(merged.snapshot),allImages={...images};let received=0;
        for(const id of needed)for(const prefix of ["img:","th:"]){
          const key=prefix+id,available=sources.filter(s=>s.images[key]);
          if(!available.length){if(prefix==="img:"&&!allImages[key])throw Error("A peer's referenced picture is missing. No records were changed.");continue;}
          const target=available[0].images[key];
          if(prefix==="img:"&&(available.some(s=>s.images[key].hash!==target.hash)||allImages[key]&&allImages[key].hash!==target.hash))throw Error("Two libraries contain different pictures with the same identity. Sync stopped without overwriting either picture.");
          if(allImages[key])continue;
          report("receiving","Receiving pictures safely… "+(++received),{peers,preview:null},false);
          const value=await download(target,available[0].peer,run);
          await storage.syncImage(key,value);check(run);
          allImages[key]={...target,fingerprint:await storage.fingerprint(key)};
        }
        check(run);
        if(!options.canApply()){report("busy","Changes are downloaded. Finish editing to apply them safely.",{peers});return;}
        const nextState={...localState,approved:true,snapshot:merged.snapshot,images:allImages};
        const nextRaw=C.expand(merged.items,local.raw),values={[STATE]:JSON.stringify(nextState)};
        if(changed)for(const [key,text]of Object.entries(nextRaw))if(text!==local.raw[key])values[key]=text;
        if(changed||values[STATE]!==local.stateRaw){
          report("applying","Saving verified changes on this device…",{peers,preview:null});await sleep(50);check(run);
          if(!options.canApply())throw Error("Editing started while sync was preparing. Your work is preserved; sync will retry.");
          await storage.syncCommit(values,{...local.raw,[STATE]:local.stateRaw});check(run);approval=null;
          if(changed)await options.onApplied();
          report("saved","Changes saved here. Waiting for other devices to confirm their copies.",{peers,preview:null});
        }else{
          const online=peers.filter(p=>p.online),synced=online.length&&online.every(p=>p.revision===revision.library&&(!p.extensionRevision||p.extensionRevision===revision.extension));
          report(synced?"synced":"checking",synced?"Up to date with "+online.length+" online device"+(online.length===1?"":"s")+".":"Exchanging changes with paired devices…",{peers,preview:null,lastSynced:synced?Date.now():current.lastSynced});
        }
      }catch(e){if(run===epoch){if(/referenced sync chunk|referenced chunk|checksum/i.test(e.message))invalidCache=true;report("error",e.message+" Local changes are retained; sync retries automatically.");}}
      finally{if(settings&&settings.enabled&&ready())firstCheck=false;busy=false;if(!stopped&&run===epoch)timer=setTimeout(tick,options.intervalMs||5000);}
    }
    async function configure(action,args={}){
      if(busy&&action!=="leave")throw Error("Wait for the current sync check to finish before changing the group.");
      epoch++;approval=null;invalidCache=true;firstCheck=true;clearTimeout(timer);remoteCache.clear();
      if(action!=="accept-request")await transport.call("pause",{});
      for(let i=0;busy&&i<200;i++)await sleep(50);
      if(busy)throw Error("Sync is still stopping. Try leaving again in a moment.");
      const r=await transport.call("configure",{...args,action,namespace:options.namespace||"library1"});settings=r;
      report(r.enabled?"checking":"off",r.enabled?"Pairing remembered. Preparing the first comparison…":"This device has left the sync group.",{settings:r,preview:null,code:null});
      clearTimeout(timer);timer=setTimeout(tick,0);return r;
    }
    return {supported:!!transport&&!!storage.syncCommit,subscribe(fn){listeners.add(fn);fn(current);return()=>listeners.delete(fn);},start(){if(transport&&!stopped)tick();},stop(){stopped=true;epoch++;clearTimeout(timer);if(transport)transport.call("pause",{}).catch(()=>{});},configure,
      async invite(){const run=epoch;check(run);const r=await call("invite",{},run);report(current.phase,current.message,{code:r.code});return r.code;},
      async requestJoin(label){const r=await call("joinRequest",{label,namespace:options.namespace||"library1"});settings=r;report("off","Scan this QR using a device already in your group.",{settings:r});},
      async offerJoin(code){return call("offerJoin",{code});},
      approve(id){approval=id;clearTimeout(timer);if(!busy)timer=setTimeout(tick,0);},
      retry(){clearTimeout(timer);if(!busy)timer=setTimeout(tick,0);}
    };
  }
  host.RolecraftVaultSync={create,hash};
})(window);
