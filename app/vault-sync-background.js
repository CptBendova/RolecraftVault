/* Explicit Android unlocked-session consent. No network, secrets or persisted consent. */
(function(host){
  "use strict";
  let enabled=false,expires=0,generation=0,timer=null;
  const supported=()=>!!host.Capacitor&&typeof host.Capacitor.nativePromise==="function";
  const call=method=>host.Capacitor.nativePromise("VaultSync","dispatch",{method,args:{}});
  const ready=()=>!!document.querySelector('.rcv[data-rcv-state="ready"]');
  const notify=()=>host.dispatchEvent(new CustomEvent("rcv-sync-background",{detail:enabled}));
  function deactivate(lockHidden=true){const was=enabled;enabled=false;expires=0;generation++;clearTimeout(timer);timer=null;if(was)notify();if(was&&lockHidden&&document.hidden&&host.__rcvOnBackground)host.__rcvOnBackground();}
  async function poll(run){
    if(run!==generation||!enabled)return;
    try{const result=await call("backgroundState");if(run!==generation)return;if(!result.active||!ready()){await stop();return;}expires=Date.now()+15000;}
    catch(_){if(run===generation){deactivate();call("backgroundStop").catch(()=>{});}return;}
    if(run===generation&&enabled)timer=setTimeout(()=>poll(run),5000);
  }
  async function start(){
    if(!supported()||document.hidden||!ready())throw Error("Open and unlock the Android Chat app first.");
    if(host.__rcvDeferLock)host.__rcvDeferLock();
    const run=++generation,result=await call("backgroundStart");
    if(run!==generation)throw Error("Background sync was cancelled.");
    if(!result.active||!ready()){await call("backgroundStop").catch(()=>{});throw Error("Background sync was cancelled.");}
    enabled=true;expires=Date.now()+15000;notify();clearTimeout(timer);timer=setTimeout(()=>poll(run),5000);
  }
  async function stop(){deactivate();if(supported())await call("backgroundStop");}
  host.__rcvSyncBackgroundStopped=deactivate;
  host.addEventListener("rcv-locking",()=>{deactivate(false);if(supported())call("backgroundStop").catch(()=>{});});
  host.RolecraftSyncBackground={supported,active:()=>enabled&&Date.now()<expires&&ready(),start,stop};
})(window);
