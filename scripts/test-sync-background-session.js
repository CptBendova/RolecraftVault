const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'../app/vault-sync-background.js'),'utf8');
function fixture(){
  let now=0,unlocked=true,service=false,pending=null,heldDelivery=null,hiddenCalls=0,deferred=0;
  const events=new Map(),timers=new Map(),calls=[];let id=0;
  const document={hidden:false,querySelector:()=>unlocked?{}:null};
  const window={Capacitor:{nativePromise:async(plugin,method,{method:operation})=>{assert.equal(plugin,'VaultSync');assert.equal(method,'dispatch');calls.push(operation);if(operation==='backgroundStart'){if(pending)await pending;service=true;if(heldDelivery){const delivery=heldDelivery;heldDelivery=null;await delivery;}return{active:true};}if(operation==='backgroundStop')service=false;return{active:service};}},
    __rcvDeferLock:()=>deferred++,__rcvOnBackground:()=>hiddenCalls++,addEventListener:(n,fn)=>events.set(n,fn),dispatchEvent:e=>events.get(e.type)?.(e)};
  vm.runInNewContext(source,{window,document,CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail;}},Date:{now:()=>now},setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:n=>timers.delete(n)});
  return{api:window.RolecraftSyncBackground,window,document,calls,events,timers,setNow:n=>now=n,setUnlocked:v=>unlocked=v,setPending:p=>pending=p,holdDelivery:p=>heldDelivery=p,service:()=>service,hidden:()=>hiddenCalls,deferred:()=>deferred,expire:()=>service=false};
}
(async()=>{
  const appSource=fs.readFileSync(path.join(__dirname,'../app/app.js'),'utf8'),hideAt=appSource.indexOf('    const hide = () => {',appSource.indexOf('const pickerGate = createFilePickerLockGate()'));
  assert(hideAt>0);const hideBody=appSource.slice(hideAt,appSource.indexOf('    window.__rcvOnBackground = hide;',hideAt));
  let locks=0,rechecks=0,approved=true;const gate={window:{RolecraftSyncBackground:{active:()=>approved}},authRef:{current:{checked:true,locked:false,passwordSet:true}},pickerGate:{remaining:()=>0},retryWhileHidden:()=>rechecks++,lockVaultRef:{current:()=>locks++}};
  vm.runInNewContext(hideBody+';hide();',gate);assert.equal(locks,0);assert.equal(rechecks,1,'approved hidden session keeps checking expiry');approved=false;vm.runInNewContext('{'+hideBody+';hide();}',gate);assert.equal(locks,1,'actual app locks again when session is revoked');
  let f=fixture();assert(!f.api.active());await f.api.start();assert(f.api.active());assert.equal(f.deferred(),1);assert.deepEqual(f.calls,['backgroundStart']);f.document.hidden=true;assert(f.api.active(),'only approved session survives hidden');await f.api.stop();assert(!f.api.active());assert.equal(f.hidden(),1,'stopping hidden resumes background lock without recursion');
  f=fixture();f.document.hidden=true;await assert.rejects(f.api.start());assert.equal(f.calls.length,0);f.document.hidden=false;f.setUnlocked(false);await assert.rejects(f.api.start());assert.equal(f.calls.length,0);
  f=fixture();let release;f.setPending(new Promise(r=>release=r));const starting=f.api.start();assert(!f.api.active());f.events.get('rcv-locking')();release();await assert.rejects(starting,/cancelled/);assert(!f.api.active(),'late start after lock never authorizes hidden access');assert.equal(f.hidden(),0,'manual lock does not recursively invoke itself');
  f=fixture();let deliverOld;f.holdDelivery(new Promise(r=>deliverOld=r));const oldStart=f.api.start();assert(f.service(),'native A started before its queued result reaches JS');await f.api.stop();assert(!f.service());await f.api.start();assert(f.api.active()&&f.service(),'newly consented native B and renderer are active');const stopCount=f.calls.filter(x=>x==='backgroundStop').length;deliverOld();await assert.rejects(oldStart,/cancelled/);assert(f.api.active()&&f.service(),'stale A result cannot stop or deactivate newer B');assert.equal(f.calls.filter(x=>x==='backgroundStop').length,stopCount,'stale result must not send a native stop for the newer session');
  f=fixture();await f.api.start();f.document.hidden=true;f.window.__rcvSyncBackgroundStopped();assert(!f.api.active());assert.equal(f.hidden(),1);assert.equal(f.timers.size,0);
  f=fixture();await f.api.start();f.setNow(15001);assert(!f.api.active(),'missing native confirmations fail closed');
  f=fixture();await f.api.start();f.expire();await [...f.timers.values()][0].fn();assert(!f.api.active(),'native expiry revokes renderer permission');
  console.log('PASS actual background-session controller: explicit consent, no stored authorization, hidden eligibility, late-start lock, native stop/expiry and bounded confirmation');
})().catch(e=>{console.error(e);process.exitCode=1;});
