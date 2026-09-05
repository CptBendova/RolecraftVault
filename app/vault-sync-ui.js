(function(host){
  "use strict";
  const h=React.createElement;
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
  function SyncPanel({engine,status,renderQr}){
    const [label,setLabel]=React.useState(""),[code,setCode]=React.useState(""),[error,setError]=React.useState(""),[working,setWorking]=React.useState(false);
    const [scanning,setScanning]=React.useState(false),video=React.useRef(null),pairCode=React.useRef(null),imageInput=React.useRef(null);
    const [camera,setCamera]=React.useState(""),[cameras,setCameras]=React.useState([]),[scanMessage,setScanMessage]=React.useState(""),fileRun=React.useRef(0);
    React.useEffect(()=>{const stop=()=>{fileRun.current++;setScanning(false);};const hidden=()=>{if(document.hidden)stop();};host.addEventListener("rcv-locking",stop);document.addEventListener("visibilitychange",hidden);return()=>{fileRun.current++;host.removeEventListener("rcv-locking",stop);document.removeEventListener("visibilitychange",hidden);};},[]);
    function accept(value){setCode(value);setScanning(false);setError("");setScanMessage(value.startsWith("RCVJOIN1.")?"Device QR scanned. On an already-paired device, choose Add scanned computer to this group.":"QR scanned. Choose Remember and join group to pair securely.");}
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
    const s=status||{},settings=s.settings||{};
    async function action(fn){setWorking(true);setError("");try{await fn();}catch(e){setError(e.message);}finally{setWorking(false);}}
    return h("section",{className:"vault-sync-panel",style:{margin:"16px 0",padding:16,border:"1px solid var(--line2)",borderRadius:12,minWidth:0}},
      h("h3",{style:{margin:"0 0 8px"}},"Automatic device sync"),
      h("p",{className:"modal-intro"},"Pair once. Devices reconnect on the same local network without entering codes again. Sync pauses while locked or when Android suspends the app; it resumes when open and unlocked. Sync is not a backup."),
      !settings.enabled?h(React.Fragment,null,
        h("label",null,"Device name",h("input",{className:"input",value:label,maxLength:80,placeholder:"Tablet, phone or computer",onChange:e=>setLabel(e.target.value),style:{width:"100%",boxSizing:"border-box",margin:"6px 0 12px"}})),
        h("p",{className:"modal-intro"},"Start on the device with your most up-to-date library. Its versions are preferred in the first comparison; unique items and conflicting writing from other devices are preserved."),
        h("button",{className:"btn btn-primary",disabled:working,onClick:()=>action(()=>engine.configure("create",{label}))},"Use this device as primary"),
        settings.canShowJoinRequest&&h("div",{style:{marginTop:12}},h("button",{className:"btn btn-brass",disabled:working,onClick:()=>action(()=>engine.requestJoin(label))},"Show QR to join an existing group"),settings.joinRequest&&h(React.Fragment,null,h("p",null,"On your already-paired phone, tablet or computer, choose Scan pairing QR. Add this computer to its existing group, then confirm here. Keep this QR open; it expires in 10 minutes."),h("div",{"aria-label":"Computer join QR",style:{maxWidth:360,width:"100%",margin:"12px auto"}},renderQr&&renderQr(settings.joinRequest.code)),settings.joinRequest.pendingLabel&&h("div",{role:"status"},h("p",null,"Invitation received from "+settings.joinRequest.pendingLabel+". Your library stays unchanged until you review its first merge."),h("button",{className:"btn btn-brass",disabled:working,onClick:()=>action(()=>engine.configure("accept-request"))},"Accept group invitation")))),
        h("label",{style:{display:"block",marginTop:16}},"Or join the primary device",h("textarea",{className:"input",value:code,rows:3,placeholder:"Paste its one-time pairing code",onChange:e=>setCode(e.target.value),style:{width:"100%",boxSizing:"border-box",resize:"vertical",marginTop:6}})),
        h("button",{className:"btn btn-brass",disabled:working||!code.trim().startsWith("RCVSYNC1."),onClick:()=>action(async()=>{await engine.configure("join",{label,code:code.trim()});setCode("");setScanning(false);setScanMessage("");})},"Remember and join group")
      ):h(React.Fragment,null,
        h("div",{className:"backup-health good",role:"status","aria-live":"polite","data-vault-sync-status":s.phase},h("strong",null,"Remembered sync group"),h("span",null,s.message||"Checking…")),
        h("p",null,"After the first sync, devices are equal peers. Any synced computer, phone or tablet can share updates and pair another device; the original starting device can be offline."),
        s.preview&&h("div",{className:"backup-summary"},h("strong",null,"First-sync preview"),h("span",null,s.preview.added+" additions · "+s.preview.changed+" updates · "+s.preview.removed+" removals · "+s.preview.conflicts+" preserved conflict copies"),h("span",null,"Conflicting writing is kept as a separate copy. Synced record deletions are recoverable in the bin. No pictures are deleted by sync."),h("button",{className:"btn btn-primary",disabled:working,onClick:()=>engine.approve(s.preview.id)},"Approve merge and start automatic sync")),
        h("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
          h("button",{className:"btn btn-brass",disabled:working,onClick:()=>action(()=>engine.invite())},"Pair another device"),
          s.code&&h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>action(()=>engine.invite())},"Refresh pairing QR"),
          h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>engine.retry()},"Check now"),
          h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>action(()=>engine.configure("leave"))},"Leave this group")),
        s.code&&h("div",{style:{marginTop:12}},h("p",null,"On the other phone, tablet or computer, choose Scan pairing QR and scan this square. Only this invitation expires after 10 minutes, not your group. Use Refresh pairing QR to add devices later without leaving. Treat the QR like a password; only scan trusted devices."),h("div",{"aria-label":"Device pairing QR",style:{width:"100%",maxWidth:360,margin:"12px auto"}},renderQr&&renderQr(s.code)),h("details",null,h("summary",null,"Manual pairing code (if needed)"),h("textarea",{ref:pairCode,className:"input",readOnly:true,value:s.code,rows:4,"aria-label":"Pairing code",style:{width:"100%",boxSizing:"border-box"},onFocus:e=>e.target.select()}),h("button",{className:"btn btn-ghost",onClick:()=>{pairCode.current.focus();pairCode.current.select();if(!document.execCommand("copy"))setError("The code is selected. Use Copy from your device's text menu.");}},"Copy pairing code")),h("p",null,"Leaving this group does not revoke other members. Create a new group to replace its pairing secret.")),
        (s.peers||[]).length>0&&h("ul",null,s.peers.map(p=>h("li",{key:p.id,style:{overflowWrap:"break-word"}},p.label+": "+(p.online?"connected":"waiting for it to reopen"))))
      ),h("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}},h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>{fileRun.current++;setError("");setScanMessage("");setScanning(!scanning);}},scanning?"Stop camera":"Scan pairing QR"),h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>imageInput.current.click()},"Scan QR image")),
      h("input",{ref:imageInput,type:"file",accept:"image/*",hidden:true,"aria-label":"Pairing QR image",onChange:e=>{const file=e.target.files[0];e.target.value="";imageFile(file);}}),
      scanMessage&&h("p",{role:"status"},scanMessage),
      settings.enabled&&code.startsWith("RCVJOIN1.")&&h("button",{className:"btn btn-brass",disabled:working,onClick:()=>action(async()=>{await engine.offerJoin(code);setCode("");setScanning(false);setScanMessage("Invitation sent securely. Confirm on the computer, then review its first library merge. Your group and primary are unchanged.");})},"Add scanned computer to this group"),
      settings.enabled&&code.startsWith("RCVSYNC1.")&&h("p",null,"This device already belongs to a group. To add a computer, scan its Show QR to join an existing group screen."),
      scanning&&h(React.Fragment,null,h("video",{ref:video,muted:true,playsInline:true,"aria-label":"Pairing QR camera",style:{display:"block",width:"100%",maxHeight:300,marginTop:8,borderRadius:8,objectFit:"contain",background:"#000"}}),cameras.length>1&&h("label",null,"Camera",h("select",{"aria-label":"Pairing camera",value:camera,onChange:e=>setCamera(e.target.value),style:{display:"block",width:"100%",minWidth:0}},h("option",{value:""},"Automatic camera"),cameras.map((c,i)=>h("option",{key:c.deviceId,value:c.deviceId},c.label||"Camera "+(i+1)))))),
      error&&h("p",{role:"alert",style:{color:"var(--danger)",overflowWrap:"break-word"}},error));
  }
  function SyncProgress({status,onDetails}){
    if(!status||!status.settings?.enabled||!["checking","preparing","receiving"].includes(status.phase))return null;
    if(status.phase==="checking"&&status.initial===false)return null;
    return h("div",{className:"sync-progress",role:"status","aria-live":"polite",style:{padding:"12px 14px",marginBottom:16,border:"1px solid var(--line2)",borderRadius:12,background:"var(--panel)",color:"var(--mut)",fontSize:13,minWidth:0}},
      h("strong",{style:{color:"var(--text)"}},"Device sync"),
      h("div",{style:{marginTop:4,overflowWrap:"break-word"}},status.message),
      h("div",{style:{marginTop:4}},"You can keep using your library while devices catch up."),
      status.phase==="preparing"&&status.total>0&&h("progress",{"aria-label":"Picture preparation",value:Math.min(status.done||0,status.total),max:status.total,style:{width:"100%",height:6,display:"block",marginTop:8}}),
      onDetails&&h("button",{className:"btn btn-ghost",style:{marginTop:8},onClick:onDetails},"Sync details"));
  }
  host.RolecraftSyncProgress=SyncProgress;
  host.RolecraftSyncPanel=SyncPanel;
  host.RolecraftPairingQr={reader:qrReader,value:pairingValue};
})(window);
