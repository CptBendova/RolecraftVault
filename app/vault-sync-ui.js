(function(host){
  "use strict";
  const h=React.createElement;
  const keyNames={openrouter:"OpenRouter (chat)",openai:"OpenAI (images)",xai:"xAI / Grok (images)"};
  function BackgroundSync(){
    const api=host.RolecraftSyncBackground,[active,setActive]=React.useState(()=>!!api?.active()),[confirm,setConfirm]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState("");
    React.useEffect(()=>{const update=()=>setActive(!!api?.active());host.addEventListener("rcv-sync-background",update);return()=>host.removeEventListener("rcv-sync-background",update);},[api]);
    if(!api?.supported())return h("p",{className:"modal-intro"},"Windows keeps paired sync running while minimized and unlocked. Keep the computer awake; closing the app or locking the vault stops sync.");
    async function change(on){setBusy(true);setError("");try{await(on?api.start():api.stop());setActive(api.active());setConfirm(false);}catch(e){setError(e.message||"Background sync could not start.");}finally{setBusy(false);}}
    return h("div",{className:"sync-background-settings"},
      h("strong",null,"Sync with screen off"),
      h("p",null,active?"This unlocked session can prepare pictures and sync while minimized or with the screen off. Use Stop here or in the Android notification to end it.":"Keep preparing pictures and syncing on this Wi-Fi when you switch apps or turn off the screen."),
      h("button",{className:"btn btn-brass",disabled:busy,onClick:()=>active?change(false):setConfirm(!confirm)},busy?"Please wait…":active?"Stop background sync":"Enable background sync"),
      confirm&&h("div",null,h("p",null,"Your vault stays unlocked in memory for this session, including while your screen is off. Anyone who opens this app can see it until you lock it. Android shows a persistent notification with Stop. Battery use increases. Android may stop the session at its time limit; force-closing the app, restarting the phone or locking the vault also stops it. This permission is not saved across app restarts. Provider requests and API key sharing still stop in the background."),h("button",{className:"btn btn-primary",disabled:busy,onClick:()=>change(true)},"Keep unlocked and start sync"),h("button",{className:"btn btn-ghost",disabled:busy,onClick:()=>setConfirm(false)},"Cancel")),
      error&&h("p",{role:"alert",style:{color:"var(--danger)"}},error));
  }
  function KeySharePanel(){
    const [open,setOpen]=React.useState(false),[local,setLocal]=React.useState(null),[provider,setProvider]=React.useState("openrouter"),[offers,setOffers]=React.useState([]),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState("");
    const alive=React.useRef(true);
    async function call(method,args={}){return host.vaultSync?host.vaultSync.call(method,args):host.Capacitor.nativePromise("VaultSync","dispatch",{method,args});}
    React.useEffect(()=>{alive.current=true;const stop=()=>{call("keyStop").catch(()=>{});if(alive.current){setLocal(null);setOffers([]);setOpen(false);}};const hidden=()=>{if(document.hidden)stop();};host.addEventListener("rcv-locking",stop);document.addEventListener("visibilitychange",hidden);return()=>{alive.current=false;host.removeEventListener("rcv-locking",stop);document.removeEventListener("visibilitychange",hidden);call("keyStop").catch(()=>{});};},[]);
    async function action(fn){setBusy(true);setMessage("");try{await fn();}catch(_){if(alive.current)setMessage("Could not complete key sharing. Keep both updated Chat apps open and unlocked on the same Wi-Fi. Existing keys cannot be replaced here.");}finally{if(alive.current)setBusy(false);}}
    async function refresh(){
      const settings=await call("keyStatus");if(!alive.current)return;setLocal(settings);
      const found=await call("discover"),rows=[];
      for(const peer of found.peers||[]){if(!alive.current)return;try{const result=await call("keyInfo",{peer:peer.id});if(result.offer&&keyNames[result.offer.provider]&&result.offer.expires>Date.now())rows.push({...result.offer,peer:peer.id,label:result.label||"Paired device"});}catch(_){/* Older, standard and unavailable peers cannot share credentials. */}}
      if(alive.current){setOffers(rows);setMessage(rows.length?"Select Import on this device to save a shared key.":"No shared keys found. On the source device choose a saved provider, then Share for 5 minutes.");}
    }
    if(!host.RolecraftChatSync)return null;
    return h("div",{className:"credential-share"},
      h("button",{className:"btn btn-ghost",disabled:busy,"aria-expanded":open,onClick:()=>action(async()=>{if(open){await call("keyStop");setOpen(false);setLocal(null);}else{setOpen(true);await refresh();}})},open?"Close API key sharing":"Share API keys between devices"),
      open&&h("div",null,
        h("p",null,"Share a saved key with your trusted, paired Chat apps on this Wi-Fi. Anyone in this paired group can import the selected key during the sharing window and use your provider account or credits. No key is included in vault sync, backups or chat history."),
        h("label",null,"Provider",h("select",{className:"input","aria-label":"API key provider",value:provider,disabled:busy,onChange:e=>setProvider(e.target.value),style:{display:"block",width:"100%",minWidth:0,margin:"6px 0"}},Object.entries(keyNames).map(([id,name])=>h("option",{key:id,value:id},name)))),
        h("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
          h("button",{className:"btn btn-brass",disabled:busy||!local?.configured?.includes(provider),onClick:()=>action(async()=>{const result=await call("keyShare",{provider});if(alive.current){setLocal({...local,offer:result.offer});setMessage("Sharing "+keyNames[provider]+" for up to 5 minutes. On the receiving device open API key sharing and press Find shared keys.");}})},"Share for 5 minutes"),
          h("button",{className:"btn btn-ghost",disabled:busy,onClick:()=>action(async()=>{await call("keyStop");setLocal(await call("keyStatus"));setMessage("Key sharing stopped.");})},"Stop sharing"),
          h("button",{className:"btn btn-ghost",disabled:busy,onClick:()=>action(refresh)},busy?"Checking…":"Find shared keys")),
        local?.offer&&h("p",{role:"status"},"Sharing window ends at "+new Date(local.offer.expires).toLocaleTimeString()+". Locking, closing this panel or backgrounding Android stops sharing earlier."),
        h("p",null,"Existing keys are never replaced. To replace one, first remove it in that provider's settings. Keep both apps open until import is confirmed."),
        h("p",null,"Saved here: "+((local?.configured||[]).map(id=>keyNames[id]).filter(Boolean).join(", ")||"none. Add a key in Chat settings or Generate image first.")),
        offers.map(row=>h("div",{key:row.peer+row.id,style:{marginTop:8,padding:10,border:"1px solid var(--line2)",borderRadius:8,overflowWrap:"break-word"}},h("p",null,keyNames[row.provider]+" from "+row.label),h("button",{className:"btn btn-brass",disabled:busy||local?.configured?.includes(row.provider),onClick:()=>action(async()=>{await call("keyImport",{peer:row.peer,id:row.id,provider:row.provider});const settings=await call("keyStatus");if(alive.current){setLocal(settings);setMessage(keyNames[row.provider]+" key saved securely on this device. Reopen provider settings to refresh its status.");}})},local?.configured?.includes(row.provider)?"Key already saved":"Import on this device"))),
        message&&h("p",{role:"status",style:{overflowWrap:"break-word"}},message)));
  }
  function pairingValue(value){return typeof value==="string"&&/^RCV(?:SYNC|JOIN)1\.[A-Za-z0-9_-]{20,2000}$/.test(value.trim())?value.trim():null;}
  async function qrReader(){
    let detector=null;
    try{if(typeof host.BarcodeDetector==="function")detector=new host.BarcodeDetector({formats:["qr_code"]});}catch(_){}
    const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
    return async source=>{
      if(detector)try{const rows=await detector.detect(source),found=rows.map(r=>pairingValue(r.rawValue)).find(Boolean);if(found)return found;}catch(_){detector=null;}
      if(typeof host.jsQR!=="function")throw Error("The offline QR reader is missing. Reinstall the full app or paste the pairing code.");
      const width=source.videoWidth||source.naturalWidth||source.width,height=source.videoHeight||source.naturalHeight||source.height;
      if(!width||!height)return null;
      const scale=Math.min(1,1280/Math.max(width,height));canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
      ctx.drawImage(source,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
      const result=host.jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:"dontInvert"});return pairingValue(result&&result.data);
    };
  }
  /* ---- 1.333 status language -------------------------------------------
     The engine reports a phase plus a precise sentence. The panel turns that
     into a tone, a short title and the sentence, and strips the Electron IPC
     wrapper ("Error invoking remote method 'vault-sync': Error: ...") that
     used to lead every Windows error. */
  const IPC_PREFIX=/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/;
  function cleanError(message){return String(message||"").replace(IPC_PREFIX,"").replace(/^Error:\s*/,"").trim();}
  function ago(at,now){
    const s=Math.max(0,Math.round((now-at)/1000));if(s<15)return "just now";if(s<60)return s+" seconds ago";
    const m=Math.round(s/60);if(m<60)return m===1?"1 minute ago":m+" minutes ago";
    const hours=Math.round(m/60);if(hours<24)return hours===1?"1 hour ago":hours+" hours ago";
    return new Date(at).toLocaleString();
  }
  function countdown(ms){const s=Math.max(0,Math.ceil(ms/1000));return s>=60?Math.floor(s/60)+":"+String(s%60).padStart(2,"0"):s+"s";}
  const PHASES={
    synced:["good","Up to date"],saved:["busy","Saved on this device"],checking:["busy","Checking your devices…"],preparing:["busy","Preparing pictures…"],
    receiving:["busy","Receiving changes…"],applying:["busy","Saving incoming changes…"],waiting:["wait","Waiting for your other devices"],
    busy:["wait","Waiting for you to finish editing"],manual:["wait","Refresh when you choose"],paused:["off","Paused"],off:["off","Not paired"],
    preview:["warn","Review the first sync"],error:["bad","Sync needs attention"]
  };
  function friendlyStatus(s){
    const [tone,title]=PHASES[s.phase]||["busy","Syncing…"],peers=s.peers||[];
    const blocked=peers.some(p=>p.reachWarning)||/firewall|clocks on these devices/i.test(s.message||"");
    return {tone:blocked&&tone!=="bad"?"warn":tone,title:blocked&&tone!=="bad"?"Connection needs attention":title,detail:cleanError(s.message)};
  }
  function peerState(p,now){
    if(p.online&&p.reachWarning)return {tone:"warn",text:"Connected one way: it cannot connect back to this device. See the fix above."};
    if(p.online)return {tone:"good",text:p.error?cleanError(p.error):"Connected"};
    const error=cleanError(p.error);
    if(/update .*private Chat|update every paired/i.test(error))return {tone:"warn",text:error};
    const retry=p.retryAt&&p.retryAt>now?" Trying again in "+countdown(p.retryAt-now)+".":"";
    return {tone:"off",text:(error||"Not reachable right now. It reconnects when Rolecraft is open and unlocked on it.")+retry};
  }
  function inviteExpiry(code){
    try{const body=String(code).slice(9).replace(/-/g,"+").replace(/_/g,"/");const data=JSON.parse(atob(body+"===".slice((body.length+3)%4)));return Number.isSafeInteger(data.expires)?data.expires:null;}catch(_){return null;}
  }
  async function nativeCall(method,args={}){
    if(host.vaultSync)return host.vaultSync.call(method,args);
    if(host.Capacitor&&host.Capacitor.nativePromise)return host.Capacitor.nativePromise("VaultSync","dispatch",{method,args});
    throw Error("Network checks need the Windows or Android app.");
  }
  function Dot({tone}){return h("span",{className:"sync-dot sync-dot-"+tone,"aria-hidden":true});}
  function NetworkCheck(){
    const [result,setResult]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState("");const alive=React.useRef(true);
    React.useEffect(()=>()=>{alive.current=false;},[]);
    async function run(){setBusy(true);setError("");try{const r=await nativeCall("diagnose");if(alive.current)setResult(r);}catch(e){if(alive.current)setError(cleanError(e.message)||"The network check could not run.");}finally{if(alive.current)setBusy(false);}}
    const now=Date.now(),profile=result&&result.networkProfile;
    return h("div",{className:"sync-network-check"},
      h("button",{className:"btn btn-ghost",disabled:busy,onClick:run},busy?"Checking this device…":"Run network check"),
      error&&h("p",{role:"alert",className:"sync-alert"},error),
      result&&h("ul",{className:"sync-check-list",role:"status"},
        h("li",null,h(Dot,{tone:result.address?"good":"bad"}),h("span",null,result.address?"This device is reachable at "+result.address+(result.port?" port "+result.port:"")+"."+(result.host==="0.0.0.0"?" It listens on every local network adapter.":""):"This device has no private Wi-Fi or Ethernet address. Connect it to the same local network as your other devices.")),
        h("li",null,h(Dot,{tone:result.discovery?"good":"warn"}),h("span",null,result.discovery?"Automatic discovery is running.":"Automatic discovery is blocked here. Devices you have synced before still reconnect by their saved address.")),
        profile&&h("li",null,h(Dot,{tone:profile.category==="Public"?"bad":"good"}),h("span",null,profile.category==="Public"?"Windows treats "+(profile.name||profile.alias||"this network")+" as a Public network, which blocks your other devices. Open Windows Settings > Network & internet > "+(/wi-?fi|wlan|wireless/i.test(profile.alias||"")?"Wi-Fi":"Ethernet")+" > "+(profile.name||"this network")+" and choose Private network.":"Windows treats "+(profile.name||profile.alias||"this network")+" as a "+profile.category+" network.")),
        (result.peers||[]).map(p=>h("li",{key:p.id},h(Dot,{tone:p.failedAt&&(!p.lastSeen||p.failedAt>p.lastSeen)?"warn":p.fresh?"good":"off"}),h("span",null,(p.label||"Paired device")+" ("+p.ip+"): "+
          [p.inboundAt?"reached this device "+ago(p.inboundAt,now):"",p.lastSeen?"last seen "+ago(p.lastSeen,now):"not seen since this app started",p.failedAt?"last connection attempt failed "+ago(p.failedAt,now):""].filter(Boolean).join("; ")+"."))),
        !(result.peers||[]).length&&h("li",null,h(Dot,{tone:"off"}),h("span",null,"No paired device has been seen on this network since Rolecraft started here."))));
  }
  function Troubleshoot({paired}){
    return h("details",{className:"sync-help"},
      h("summary",null,paired?"Can't see a device?":"Pairing not working?"),
      h("ol",null,
        h("li",null,"Put both devices on the same Wi-Fi. Guest networks and mobile data keep them apart."),
        h("li",null,"Open and unlock Rolecraft on both. Android pauses sync in the background unless Sync with screen off is on."),
        h("li",null,"On Windows, allow Rolecraft Vault through Windows Defender Firewall and set this Wi-Fi to a Private network."),
        h("li",null,"Turn on automatic date and time on every device. Clocks more than two minutes apart are refused."),
        h("li",null,"Some routers isolate devices from each other (AP or client isolation). Turn that off, or use a different network."),
        h("li",null,"Update every device to the same Rolecraft version.")),
      paired&&h(NetworkCheck));
  }
  function SyncPanel({engine,status,renderQr}){
    const [label,setLabel]=React.useState(""),[code,setCode]=React.useState(""),[error,setError]=React.useState(""),[working,setWorking]=React.useState(false);
    const [scanning,setScanning]=React.useState(false),video=React.useRef(null),pairCode=React.useRef(null),imageInput=React.useRef(null);
    const [camera,setCamera]=React.useState(""),[cameras,setCameras]=React.useState([]),[scanMessage,setScanMessage]=React.useState(""),fileRun=React.useRef(0);
    const [primaryConfirm,setPrimaryConfirm]=React.useState(false),[review,setReview]=React.useState(null),[choices,setChoices]=React.useState({}),[reviewAt,setReviewAt]=React.useState(0);
    const [leaveConfirm,setLeaveConfirm]=React.useState(false),[hiddenCode,setHiddenCode]=React.useState(null),[kicked,setKicked]=React.useState(0),[approving,setApproving]=React.useState(null),[now,setNow]=React.useState(()=>Date.now()),[advanced,setAdvanced]=React.useState(false);
    React.useEffect(()=>{const clear=()=>{setReview(null);setChoices({});setPrimaryConfirm(false);setLeaveConfirm(false);};host.addEventListener("rcv-locking",clear);return()=>host.removeEventListener("rcv-locking",clear);},[]);
    React.useEffect(()=>{const stop=()=>{fileRun.current++;setScanning(false);};const hidden=()=>{if(document.hidden)stop();};host.addEventListener("rcv-locking",stop);document.addEventListener("visibilitychange",hidden);return()=>{fileRun.current++;host.removeEventListener("rcv-locking",stop);document.removeEventListener("visibilitychange",hidden);};},[]);
    const s=status||{},settings=s.settings||{};
    const liveCode=s.code&&s.code!==hiddenCode?s.code:null,codeExpires=liveCode?inviteExpiry(liveCode):null;
    const ticking=!!liveCode||(s.peers||[]).some(p=>p.retryAt&&p.retryAt>now)||!!kicked;
    React.useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),ticking?1000:30000);return()=>clearInterval(timer);},[ticking]);
    React.useEffect(()=>{if(!kicked)return;const timer=setTimeout(()=>setKicked(0),2500);return()=>clearTimeout(timer);},[kicked]);
    React.useEffect(()=>{if(approving&&(!s.preview||s.preview.id!==approving))setApproving(null);},[s.preview,approving]);
    function accept(value){setCode(value);setScanning(false);setError("");setScanMessage(value.startsWith("RCVJOIN1.")?"Device QR scanned. Choose Add scanned computer to this group to invite it.":"QR scanned. Choose Remember and join group to pair securely.");}
    async function imageFile(file){
      if(!file)return;setScanning(false);setError("");setScanMessage("Reading QR image…");const run=++fileRun.current;
      let url;
      try{
        if(file.size>20*1024*1024)throw Error("Choose a QR image smaller than 20 MB.");
        url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();
        if(run!==fileRun.current)return;const read=await qrReader(),value=await read(image);if(run!==fileRun.current)return;
        if(!value)throw Error("No Rolecraft pairing QR found. Choose a clear image of the whole QR, including its white border.");accept(value);
      }catch(e){if(run===fileRun.current){setScanMessage("");setError(e.message||"Could not read the QR image.");}}finally{if(url)URL.revokeObjectURL(url);}
    }
    React.useEffect(()=>{
      if(!scanning)return;
      let stopped=false,stream=null,timer=null;
      const stop=()=>{stopped=true;clearTimeout(timer);if(stream)stream.getTracks().forEach(t=>t.stop());};
      (async()=>{
        try{
          const read=await qrReader();
          if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw Error("Camera access is unavailable. Use Scan QR image, or show a QR on this computer for your phone to scan.");
          stream=await navigator.mediaDevices.getUserMedia({video:camera?{deviceId:{exact:camera}}:{facingMode:{ideal:"environment"},width:{ideal:1280}},audio:false});
          if(stopped){stop();return;}if(!video.current){stop();return;}video.current.srcObject=stream;video.current.scrollIntoView({block:"center"});await video.current.play();
          if(stopped)return;
          navigator.mediaDevices.enumerateDevices().then(rows=>{if(!stopped)setCameras(rows.filter(d=>d.kind==="videoinput"));}).catch(()=>{});
          setScanMessage("Point the camera at the other device's pairing QR. Keep its whole white border in view.");
          async function scan(){if(stopped)return;try{const found=await read(video.current);if(stopped)return;if(found){stop();accept(found);return;}}catch(e){if(!stopped){stop();setError(e.message);setScanning(false);}return;}timer=setTimeout(scan,350);}
          scan();
        }catch(e){if(!stopped){stop();setScanMessage("");setError(e.name==="NotAllowedError"?"Camera permission was denied. Allow camera access in device settings, or use Scan QR image.":e.name==="NotFoundError"?"No camera found. Use Scan QR image, or let your phone scan a QR displayed on this computer.":e.message||"Camera unavailable. Use Scan QR image or paste the pairing code.");setScanning(false);}}
      })();return stop;
    },[scanning,camera]);
    if(!engine||!engine.supported)return null;
    const preference=settings.primaryPreference,group=review?.groups[reviewAt];
    async function action(fn){setWorking(true);setError("");try{await fn();}catch(e){setError(cleanError(e.message)||"That did not work. Try again.");}finally{setWorking(false);}}
    const scanControls=h("div",{className:"sync-actions"},
      h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>{fileRun.current++;setError("");setScanMessage("");setScanning(!scanning);}},scanning?"Stop camera":"Scan pairing QR"),
      h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>imageInput.current.click()},"Scan QR image"));
    const scanArea=h(React.Fragment,null,
      h("input",{ref:imageInput,type:"file",accept:"image/*",hidden:true,"aria-label":"Pairing QR image",onChange:e=>{const file=e.target.files[0];e.target.value="";imageFile(file);}}),
      scanning&&h(React.Fragment,null,h("video",{ref:video,muted:true,playsInline:true,"aria-label":"Pairing QR camera",className:"sync-camera",style:{display:"block",width:"100%",maxHeight:300,objectFit:"contain",background:"#000"}}),cameras.length>1&&h("label",{className:"sync-field"},"Camera",h("select",{className:"input","aria-label":"Pairing camera",style:{display:"block",width:"100%",minWidth:0,boxSizing:"border-box"},value:camera,onChange:e=>setCamera(e.target.value)},h("option",{value:""},"Automatic camera"),cameras.map((c,i)=>h("option",{key:c.deviceId,value:c.deviceId},c.label||"Camera "+(i+1)))))),
      scanMessage&&h("p",{role:"status",className:"sync-note"},scanMessage));
    const errorLine=error&&h("p",{role:"alert",className:"sync-alert"},error);
    if(!settings.enabled)return h("section",{className:"vault-sync-panel","aria-label":"Sync between devices"},
      h("p",{className:"sync-lede"},"Keep your library and chats the same on your computer, phone and tablet. Devices talk directly over your own Wi-Fi, encrypted with a key only your devices share. Nothing goes through the internet, and sync is not a backup."),
      h("div",{className:"sync-step"},
        h("div",{className:"sync-step-head"},h("span",{className:"sync-step-no","aria-hidden":true},"1"),h("strong",null,"First device: start a group")),
        h("p",{className:"sync-note"},"Start on the device with your most complete library. Its versions win the first comparison; unique items and conflicting writing from other devices are kept."),
        h("label",{className:"sync-field"},"Name for this device",h("input",{className:"input",value:label,maxLength:80,placeholder:"For example: Desk PC, Pixel phone",onChange:e=>setLabel(e.target.value),style:{width:"100%",boxSizing:"border-box"}})),
        h("button",{className:"btn btn-primary",disabled:working,onClick:()=>action(()=>engine.configure("create",{label}))},working?"Starting…":"Start syncing from this device")),
      h("div",{className:"sync-step"},
        h("div",{className:"sync-step-head"},h("span",{className:"sync-step-no","aria-hidden":true},"2"),h("strong",null,"Other devices: join the group")),
        h("p",{className:"sync-note"},"On the first device choose Add a device to show a QR. Then scan it here, or paste its code."),
        scanControls,scanArea,
        h("label",{className:"sync-field"},"Pairing code",h("textarea",{className:"input",value:code,rows:3,placeholder:"Paste the one-time pairing code",onChange:e=>setCode(e.target.value),style:{width:"100%",boxSizing:"border-box"}})),
        h("button",{className:"btn btn-brass",disabled:working||!code.trim().startsWith("RCVSYNC1."),onClick:()=>action(async()=>{await engine.configure("join",{label,code:code.trim()});setCode("");setScanning(false);setScanMessage("");})},"Remember and join group"),
        settings.canShowJoinRequest&&h("div",{className:"sync-subtle-block"},
          h("p",{className:"sync-note"},"No camera on this computer? Show a QR here and scan it with a device that is already paired."),
          h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>action(()=>engine.requestJoin(label))},"Show QR to join an existing group"),
          settings.joinRequest&&h(React.Fragment,null,h("p",{className:"sync-note"},"On the paired device choose Scan pairing QR, then Add scanned computer to this group. This QR expires in 10 minutes."),h("div",{className:"sync-qr","aria-label":"Computer join QR"},renderQr&&renderQr(settings.joinRequest.code)),settings.joinRequest.pendingLabel&&h("div",{role:"status",className:"sync-callout"},h("p",null,"Invitation received from "+settings.joinRequest.pendingLabel+". Your library stays unchanged until you review its first merge."),h("button",{className:"btn btn-brass",disabled:working,onClick:()=>action(()=>engine.configure("accept-request"))},"Accept group invitation"))))),
      h(Troubleshoot,{paired:false}),errorLine);
    const view=friendlyStatus(s),manual=!!s.manualRefresh,syncing=!!kicked||["checking","preparing","receiving","applying"].includes(s.phase);
    const peers=s.peers||[];
    return h("section",{className:"vault-sync-panel","aria-label":"Sync between devices"},
      h("div",{className:"sync-status sync-tone-"+view.tone,role:"status","aria-live":"polite","data-vault-sync-status":s.phase},
        h("div",{className:"sync-status-main"},h(Dot,{tone:view.tone}),h("div",{className:"sync-status-text"},h("strong",null,view.title),view.detail&&h("span",null,view.detail),s.lastSynced&&h("small",null,"Last synced "+ago(s.lastSynced,now)))),
        h("button",{className:"btn btn-brass",disabled:working||!!kicked,onClick:()=>{setKicked(Date.now());engine.retry();}},kicked?"Checking…":manual?"Refresh now":"Sync now")),
      s.preview&&h("div",{className:"sync-callout sync-preview"},h("strong",null,"First-sync preview"),h("span",null,s.preview.added+" additions · "+s.preview.changed+" updates · "+s.preview.removed+" removals · "+s.preview.conflicts+(preference?" alternatives preserved in Bin":" preserved conflict copies")),h("span",null,preference?"Competing versions and synced deletions are recoverable in the Bin. No pictures are deleted by sync.":"Conflicting writing is kept as a separate copy. Synced record deletions are recoverable in the bin. No pictures are deleted by sync."),h("button",{className:"btn btn-primary",disabled:working||approving===s.preview.id,onClick:()=>{setApproving(s.preview.id);engine.approve(s.preview.id);}},approving===s.preview.id?"Starting sync…":"Approve merge and start automatic sync")),
      h("div",{className:"sync-devices"},
        h("div",{className:"sync-subhead"},"Devices in this group"),
        h("ul",null,
          h("li",{className:"sync-device"},h(Dot,{tone:"good"}),h("div",null,h("strong",null,(settings.label||"This device")+" (this device)"+(preference&&preference.device===settings.device?" · primary":"")),h("span",null,"Changes you make here are shared with the group."))),
          peers.map(p=>{const state=peerState(p,now);return h("li",{key:p.id,className:"sync-device"},h(Dot,{tone:state.tone}),h("div",null,h("strong",null,(p.label||"Paired device")+(p.id===preference?.device?" · primary":"")),h("span",{className:"sync-vh"},": "),h("span",null,state.text)));}),
          !peers.length&&h("li",{className:"sync-device"},h(Dot,{tone:"off"}),h("div",null,h("strong",null,"No other device found yet"),h("span",null,"Open and unlock Rolecraft on your other devices on this Wi-Fi."))))),
      h("div",{className:"sync-actions"},
        h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>action(async()=>{setHiddenCode(null);await engine.invite();})},liveCode?"Make a new QR":"Add a device")),
      liveCode&&h("div",{className:"sync-invite"},
        codeExpires&&codeExpires<=now?h("p",{className:"sync-note"},"This pairing QR has expired. Choose Make a new QR to add another device. Your group is unaffected."):h(React.Fragment,null,
          h("p",{className:"sync-note"},"On the new phone, tablet or computer open Settings > Sync, choose Scan pairing QR and scan this square. Treat it like a password."+(codeExpires?" Expires in "+countdown(codeExpires-now)+".":"")),
          h("div",{className:"sync-qr","aria-label":"Device pairing QR"},renderQr&&renderQr(liveCode)),
          h("details",null,h("summary",null,"Show the code instead"),h("textarea",{ref:pairCode,className:"input",readOnly:true,value:liveCode,rows:4,"aria-label":"Pairing code",onFocus:e=>e.target.select()}),h("button",{className:"btn btn-ghost",onClick:()=>{pairCode.current.focus();pairCode.current.select();if(!document.execCommand("copy"))setError("The code is selected. Use Copy from your device's text menu.");}},"Copy pairing code"))),
        h("button",{className:"btn btn-ghost",onClick:()=>setHiddenCode(liveCode)},"Done")),
      h("div",{className:"sync-options"},
        h("div",{className:"sync-subhead"},"Options"),
        h("label",{className:"sync-toggle"},h("input",{type:"checkbox",checked:manual,disabled:working,onChange:e=>action(()=>engine.setManualRefresh(e.target.checked))}),h("span",null,"Refresh only when I choose",h("small",null,"On by default. Nothing is fetched or reloaded until you choose Sync now, so sync never interrupts what you are doing. Chats you save here stay available to your other devices while Rolecraft is open and unlocked. Turn it off for automatic sync. Set separately on each device."))),
        host.RolecraftChatSync&&h(BackgroundSync),
        host.RolecraftChatSync&&h(KeySharePanel)),
      h(Troubleshoot,{paired:true}),
      h("details",{className:"sync-help sync-advanced",open:advanced||scanning||code.startsWith("RCVJOIN1."),onToggle:e=>setAdvanced(e.currentTarget.open)},
        h("summary",null,"Advanced"),
        h("p",{className:"sync-note"},"Add a computer that cannot scan: on that computer choose Show QR to join an existing group, then scan it here."),
        scanControls,scanArea,
        code.startsWith("RCVJOIN1.")&&h("button",{className:"btn btn-brass",disabled:working,onClick:()=>action(async()=>{await engine.offerJoin(code);setCode("");setScanning(false);setScanMessage("Invitation sent securely. Confirm on the computer, then review its first library merge. Your group and primary are unchanged.");})},"Add scanned computer to this group"),
        code.startsWith("RCVSYNC1.")&&h("p",{className:"sync-note"},"This device already belongs to a group. To add a computer, scan the QR from its Show QR to join an existing group screen."),
        host.RolecraftChatSync&&settings.primarySelection===1&&h("div",{className:"sync-primary-settings"},
          h("strong",null,preference?"Primary: "+(preference.device===settings.device?"this device":preference.label||"Paired device"):"Choose how clashes are handled"),
          h("p",{className:"sync-note"},"Edits still sync both ways. When two devices change the same item at the same time, the primary's version stays in the library and the other goes to the Bin, not a duplicate card."),
          h("p",{className:"sync-note"},"Update every paired app first. Older apps pause sync with this group once a primary is chosen."),
          h("button",{className:"btn btn-brass",disabled:working||preference?.device===settings.device,onClick:()=>setPrimaryConfirm(!primaryConfirm)},preference?.device===settings.device?"This device is primary":"Make this device primary"),
          primaryConfirm&&h("div",{role:"group","aria-label":"Confirm primary change",className:"sync-callout"},h("p",null,"Use this device to settle future clashes? Pairing is kept. Finish its first sync before confirming."),h("div",{className:"sync-actions"},h("button",{className:"btn btn-primary",disabled:working,onClick:()=>action(async()=>{await engine.setPrimary();setPrimaryConfirm(false);})},"Confirm primary choice"),h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>setPrimaryConfirm(false)},"Cancel"))),
          preference&&h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>action(async()=>{setReview(await engine.reviewConflicts());setChoices({});setReviewAt(0);})},review?"Reload duplicate review":"Review existing conflict copies"),
          review&&h("div",{className:"sync-conflict-review"},
            h("strong",null,review.groups.length?"Choose the version to keep in the library":"No old conflict copies found"),
            h("p",{className:"sync-note"},"Select a version for each group you want to combine. Unselected groups stay unchanged. Other versions go to the Bin with their pictures. Dates are only a guide; compare the writing before choosing."),
            group&&h(React.Fragment,null,
              h("p",null,(reviewAt+1)+" of "+review.groups.length+" · "+group.name),
              group.candidates.map(candidate=>h("div",{key:candidate.key,className:"sync-candidate"},
                h("label",{className:"sync-toggle"},h("input",{type:"radio",name:"sync-review-choice",checked:choices[group.key]===candidate.key,disabled:working,onChange:()=>setChoices({...choices,[group.key]:candidate.key})}),h("span",null,candidate.record.name||candidate.record.title||"Unnamed",candidate.original?" (current main card)":" (conflict copy)")),
                h("p",{className:"sync-note"},candidate.pictureCount+" picture(s) · "+(Number.isFinite(candidate.record.updatedAt)&&candidate.record.updatedAt>0?"Updated "+new Date(candidate.record.updatedAt).toLocaleString():"No saved edit date")),
                h("details",null,h("summary",null,"Compare saved details"),h("pre",null,JSON.stringify(candidate.record,null,2))))),
              h("div",{className:"sync-actions"},h("button",{className:"btn btn-ghost",disabled:working||reviewAt===0,onClick:()=>setReviewAt(reviewAt-1)},"Previous group"),h("button",{className:"btn btn-ghost",disabled:working||reviewAt===review.groups.length-1,onClick:()=>setReviewAt(reviewAt+1)},"Next group"),h("button",{className:"btn btn-ghost",disabled:working||!choices[group.key],onClick:()=>{const next={...choices};delete next[group.key];setChoices(next);}},"Leave this group unchanged"))),
            h("div",{className:"sync-actions"},h("button",{className:"btn btn-primary",disabled:working||!Object.keys(choices).length,onClick:()=>action(async()=>{await engine.resolveConflicts(review,choices);setReview(null);setChoices({});})},"Keep selected versions ("+Object.keys(choices).length+")"),h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>{setReview(null);setChoices({});}},"Close review")))),
        h("div",{className:"sync-leave"},
          h("p",{className:"sync-note"},"Leaving stops sync on this device only. Your library stays here, and other devices keep their group. To replace the group's secret, leave on every device and start a new group."),
          leaveConfirm?h("div",{role:"group","aria-label":"Confirm leaving the group",className:"sync-callout"},h("p",null,"Stop syncing this device with the group?"),h("div",{className:"sync-actions"},h("button",{className:"btn btn-danger",disabled:working,onClick:()=>action(async()=>{await engine.configure("leave");setLeaveConfirm(false);})},"Leave group"),h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>setLeaveConfirm(false)},"Cancel"))):h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>setLeaveConfirm(true)},"Leave this group…"))),
      errorLine);
  }
  const PILL={checking:"Syncing…",preparing:"Preparing sync…",receiving:"Syncing…",applying:"Syncing…",preview:"Review first sync",error:"Sync needs attention"};
  function SyncProgress({status,onDetails,onSync}){
    if(!status||!status.settings?.enabled)return null;
    // 1.338: on-demand devices keep one quiet Sync now control in place, so
    // syncing is a single tap and the row never jumps in and out.
    const idle=!PILL[status.phase]||status.phase==="checking"&&status.initial===false&&!status.manualRefresh;
    if(status.manualRefresh&&idle&&onSync&&!["off","paused"].includes(status.phase))return h("div",{className:"sync-progress sync-progress-manual"},
      h("button",{className:"btn btn-ghost",onClick:onSync,"aria-label":"Sync now with paired devices",title:cleanError(status.message)},
        h("span",{className:"sync-dot sync-dot-"+(status.phase==="synced"?"good":"wait"),"aria-hidden":true}),h("span",null,"Sync now")));
    if(!PILL[status.phase])return null;
    if(status.phase==="checking"&&status.initial===false&&!status.manualRefresh)return null;
    const busy=!["preview","error"].includes(status.phase);
    return h("div",{className:"sync-progress"+(busy?"":" sync-progress-alert")},
      h("button",{className:"btn btn-ghost",onClick:onDetails,"aria-label":"Device sync details",title:cleanError(status.message)},
        busy?h("span",{className:"spin","aria-hidden":true}):h("span",{className:"sync-dot sync-dot-"+(status.phase==="error"?"bad":"warn"),"aria-hidden":true}),
        h("span",null,PILL[status.phase])));
  }
  host.RolecraftSyncProgress=SyncProgress;
  host.RolecraftSyncPanel=SyncPanel;
  host.RolecraftPairingQr={reader:qrReader,value:pairingValue};
})(window);
