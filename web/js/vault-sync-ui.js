(function(host){
  "use strict";
  const h=React.createElement;
  function SyncPanel({engine,status,renderQr}){
    const [label,setLabel]=React.useState(""),[code,setCode]=React.useState(""),[error,setError]=React.useState(""),[working,setWorking]=React.useState(false);
    const [scanning,setScanning]=React.useState(false),video=React.useRef(null),pairCode=React.useRef(null);
    React.useEffect(()=>{
      if(!scanning)return;
      let stopped=false,stream=null,timer=null;
      const stop=()=>{stopped=true;clearTimeout(timer);if(stream)stream.getTracks().forEach(t=>t.stop());};
      (async()=>{
        try{
          if(typeof BarcodeDetector!=="function")throw Error("QR scanning is unavailable here. Paste the pairing code instead.");
          const detector=new BarcodeDetector({formats:["qr_code"]});
          stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
          if(stopped){stop();return;}video.current.srcObject=stream;await video.current.play();
          async function scan(){if(stopped)return;try{const rows=await detector.detect(video.current);const found=rows.find(r=>String(r.rawValue).startsWith("RCVSYNC1."));if(found){setCode(found.rawValue);setScanning(false);return;}}catch(e){}timer=setTimeout(scan,250);}
          scan();
        }catch(e){if(!stopped){setError(e.message||"Camera unavailable. Paste the pairing code instead.");setScanning(false);}}
      })();return stop;
    },[scanning]);
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
        h("label",{style:{display:"block",marginTop:16}},"Or join the primary device",h("textarea",{className:"input",value:code,rows:3,placeholder:"Paste its one-time pairing code",onChange:e=>setCode(e.target.value),style:{width:"100%",boxSizing:"border-box",resize:"vertical",marginTop:6}})),
        h("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},h("button",{className:"btn btn-brass",disabled:working||!code.trim(),onClick:()=>action(async()=>{await engine.configure("join",{label,code:code.trim()});setCode("");setScanning(false);})},"Remember and join group"),h("button",{className:"btn btn-ghost",onClick:()=>setScanning(!scanning)},scanning?"Stop camera":"Scan pairing QR")),
        scanning&&h("video",{ref:video,muted:true,playsInline:true,"aria-label":"Pairing QR camera",style:{width:"100%",maxHeight:240,marginTop:8,borderRadius:8}})
      ):h(React.Fragment,null,
        h("div",{className:"backup-health good",role:"status","aria-live":"polite","data-vault-sync-status":s.phase},h("strong",null,settings.device===settings.primary?"Primary starting library":"Remembered sync group"),h("span",null,s.message||"Checking…")),
        s.preview&&h("div",{className:"backup-summary"},h("strong",null,"First-sync preview"),h("span",null,s.preview.added+" additions · "+s.preview.changed+" updates · "+s.preview.removed+" removals · "+s.preview.conflicts+" preserved conflict copies"),h("span",null,"Conflicting writing is kept as a separate copy. Synced record deletions are recoverable in the bin. No pictures are deleted by sync."),h("button",{className:"btn btn-primary",disabled:working,onClick:()=>engine.approve(s.preview.id)},"Approve merge and start automatic sync")),
        h("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
          h("button",{className:"btn btn-brass",disabled:working,onClick:()=>action(()=>engine.invite())},"Pair another device"),
          h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>engine.retry()},"Check now"),
          h("button",{className:"btn btn-ghost",disabled:working,onClick:()=>action(()=>engine.configure("leave"))},"Leave this group")),
        s.code&&h("div",{style:{marginTop:12}},h("p",null,"Enter this code on the other device within 10 minutes. Treat it like a password. Leaving this group does not revoke other members; create a new group to replace its pairing secret."),renderQr&&renderQr(s.code),h("textarea",{ref:pairCode,className:"input",readOnly:true,value:s.code,rows:4,"aria-label":"Pairing code",style:{width:"100%",boxSizing:"border-box"},onFocus:e=>e.target.select()}),h("button",{className:"btn btn-ghost",onClick:()=>{pairCode.current.focus();pairCode.current.select();if(!document.execCommand("copy"))setError("The code is selected. Use Copy from your device's text menu.");}},"Copy pairing code")),
        (s.peers||[]).length>0&&h("ul",null,s.peers.map(p=>h("li",{key:p.id,style:{overflowWrap:"break-word"}},p.label+": "+(p.online?"connected":"waiting for it to reopen"))))
      ),error&&h("p",{role:"alert",style:{color:"var(--danger)",overflowWrap:"break-word"}},error));
  }
  host.RolecraftSyncPanel=SyncPanel;
})(window);
