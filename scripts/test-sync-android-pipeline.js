/* Execute the actual Android dispatch/pause methods with a disposable JVM shell. */
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'),{spawnSync}=require('child_process');
const source=fs.readFileSync(path.join(__dirname,'../mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/VaultSyncPlugin.java'),'utf8');
function method(name){const start=source.search(new RegExp('    (?:@[^\\s]+ )?(?:private|protected|public) [^{\\n]*?\\b'+name+'\\('));assert(start>=0,name);let depth=0,quote=false,escape=false;for(let i=source.indexOf('{',start);i<source.length;i++){const c=source[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;}else if(c==='"')quote=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1).replace(/@(PluginMethod|PermissionCallback|Override) /g,'');}throw Error('Unclosed Java method '+name);}
const dispatch=method('dispatch').replaceAll('android.os.Build.VERSION.SDK_INT','Build.VERSION.SDK_INT'),pause=method('pauseWork');
const pool=source.match(/    private final ThreadPoolExecutor chunkWorkers=[^\r\n]+/)[0];
const share=source.match(/        if\(method\.equals\("keyShare"\)\)[^\r\n]+/)[0];
const receive=source.match(/            synchronized\(this\)\{[^\r\n]*return credentialStore\(\)\.receive[^\r\n]+/)[0];
const info=source.match(/                synchronized\(this\)\{[^\r\n]*credentialStore\(\)\.metadata\(\)[^\r\n]+/)[0];
const pull=source.match(/                synchronized\(this\)\{[^\r\n]*credentialStore\(\)\.pull\([^\r\n]+/)[0];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-sync-pipeline-')),file=path.join(temp,'PipelineCheck.java');
const harness=`import java.io.*;import java.net.*;import java.util.*;import java.util.concurrent.*;import java.util.concurrent.atomic.*;import java.util.function.*;
class PipelineCheck {
${pool}
${source.match(/    private volatile PluginCall pendingBackground[^\r\n]+/)[0]}
final ExecutorService worker=Executors.newSingleThreadExecutor();final Set<HttpURLConnection> chunkConnections=ConcurrentHashMap.newKeySet();
final Set<Socket> sockets=ConcurrentHashMap.newKeySet();final Map<String,Object> peers=new HashMap<>(),chunkBatches=new HashMap<>(),nonces=new HashMap<>(),wakeNonces=new HashMap<>(),inbound=new HashMap<>(),outFail=new HashMap<>();
int epoch=0,port=1;long lease=0,addressCheckedAt=7;List<String> localAddresses=new ArrayList<>();String ip="192.168.1.2";ServerSocket server;DatagramSocket udp;HttpURLConnection outgoing;Credentials credentials;Lock discoveryLock;boolean foreground=true;JSONObject cfg=new JSONObject();
static class Credentials{int stops,reads,writes;void stop(){stops++;}JSONObject share(String p){writes++;return new JSONObject();}JSONObject receive(JSONObject r,String id,String p){writes++;return new JSONObject();}JSONObject metadata(){reads++;return new JSONObject();}JSONObject pull(String h){reads++;return new JSONObject();}}Credentials credentialStore(){return credentials;}static class Lock{boolean isHeld(){return false;}void release(){}}
static class JSONObject{static final Object NULL=new Object();Map<String,Object> map=new HashMap<>();JSONObject put(String key,Object value){map.put(key,value);return this;}String optString(String key){return String.valueOf(map.getOrDefault(key,""));}String getString(String key){return optString(key);}JSONObject getJSONObject(String key){return new JSONObject();}}static class JSObject extends JSONObject{static JSObject fromJSONObject(JSONObject o){return new JSObject();}JSObject put(String key,Object value){super.put(key,value);return this;}}
static class PluginCall{
final String method;final JSObject args=new JSObject();final CountDownLatch done=new CountDownLatch(1);volatile String error;volatile boolean resolved;
PluginCall(String m){method=m;}String getString(String k,String d){return method;}JSObject getObject(String k,JSObject d){return args;}
void resolve(){resolved=true;done.countDown();}void resolve(JSObject d){resolve();}void reject(String e){error=e;done.countDown();}}
class Activity{void runOnUiThread(Runnable work){work.run();}}class MainActivity extends Activity{boolean visible=true;boolean isSyncForeground(){return visible;}}
class WebView{void evaluateJavascript(String text,Consumer<String> callback){if(delayReady)pendingReady=callback;else callback.accept(unlocked?"true":"false");}}class Bridge{WebView getWebView(){return new WebView();}}
final MainActivity activity=new MainActivity();Activity getActivity(){return activity;}Bridge getBridge(){return new Bridge();}Object getContext(){return this;}boolean unlocked=true,paired=true,delayReady=false;Consumer<String> pendingReady;
JSONObject loadConfig(){return paired?new JSONObject():null;}
JSONObject info(){return new JSONObject().put("enabled",true);}
static class Build{static class VERSION{static final int SDK_INT=36;}}
enum PermissionState{GRANTED,DENIED}PermissionState permission=PermissionState.GRANTED;PluginCall pendingPermission;PermissionState getPermissionState(String alias){return permission;}void requestPermissionForAlias(String alias,PluginCall call,String callback){pendingPermission=call;}
static class VaultSyncService{static boolean enabled,delayStart;static Runnable onStopped;static Consumer<String> onReady;static int touches,starts;
static boolean isActive(){return enabled;}static void touch(){if(enabled)touches++;}static void stop(Object ignored){enabled=false;Runnable done=onStopped;onStopped=null;if(done!=null)done.run();}
static void start(MainActivity activity,Runnable stop,Consumer<String> ready){starts++;onStopped=stop;onReady=ready;if(!delayStart){enabled=true;ready.accept(null);}}}
final CountDownLatch release=new CountDownLatch(1),stageStarted=new CountDownLatch(1);final AtomicInteger active=new AtomicInteger(),peak=new AtomicInteger(),executed=new AtomicInteger();
JSONObject execute(String method,JSONObject args,int run)throws Exception{if(method.equals("stageImage")){stageStarted.countDown();release.await(3,TimeUnit.SECONDS);}if(method.equals("chunks")){executed.incrementAndGet();int count=active.incrementAndGet();peak.accumulateAndGet(count,Math::max);try{release.await(3,TimeUnit.SECONDS);}finally{active.decrementAndGet();}}return new JSONObject();}
${dispatch}
${method('closeNetwork')}
${pause}
${method('cancelBackgroundStart')}
${method('beginBackground')}
${method('afterSyncNotification')}
${method('handleOnPause')}
${method('handleOnResume')}
${method('active')}
${method('check')}
JSONObject credentialShare(int run)throws Exception{String method="keyShare";JSONObject args=new JSONObject();${share}throw new AssertionError();}
JSONObject credentialReceive(int run)throws Exception{JSONObject result=new JSONObject(),args=new JSONObject();${receive}}
JSONObject credentialInfo(int run)throws Exception{JSONObject result=new JSONObject();${info}return result;}
JSONObject credentialPull(int run)throws Exception{JSONObject result=new JSONObject(),request=new JSONObject();${pull}return result;}
static class Connection extends HttpURLConnection{boolean closed;Connection()throws Exception{super(new URL("http://192.168.1.2"));}public void disconnect(){closed=true;}public void connect(){}public boolean usingProxy(){return false;}}
static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
public static void main(String[] args)throws Exception{
PipelineCheck p=new PipelineCheck();try{
PluginCall a=new PluginCall("chunks"),b=new PluginCall("chunks");p.dispatch(a);p.dispatch(b);
long end=System.currentTimeMillis()+2000;while(p.active.get()<2&&System.currentTimeMillis()<end)Thread.sleep(5);check(p.active.get()==2,"two native batch requests must overlap");
PluginCall queuedA=new PluginCall("chunks"),queuedB=new PluginCall("chunks"),overflow=new PluginCall("chunks");p.dispatch(queuedA);p.dispatch(queuedB);p.dispatch(overflow);check(overflow.done.await(1,TimeUnit.SECONDS)&&overflow.error.contains("queue"),"bounded queue refuses overload");
PluginCall stage=new PluginCall("stageImage");p.dispatch(stage);check(p.stageStarted.await(1,TimeUnit.SECONDS),"photo preparation holds serial worker");long oldLease=p.lease;p.lease=0;PluginCall status=new PluginCall("status");p.dispatch(status);check(status.done.await(1,TimeUnit.SECONDS)&&status.resolved&&stage.done.getCount()==1&&p.lease>0,"status renews native lease without waiting behind photo preparation or chunk transfers");
Connection x=new Connection(),y=new Connection();p.chunkConnections.add(x);p.chunkConnections.add(y);p.pauseWork();check(x.closed&&y.closed&&p.chunkConnections.isEmpty(),"pause disconnects both active HTTP requests");check(p.addressCheckedAt==0&&p.localAddresses.isEmpty(),"pause invalidates network address cache");p.release.countDown();
for(PluginCall c:new PluginCall[]{a,b,queuedA,queuedB})check(c.done.await(2,TimeUnit.SECONDS)&&!c.resolved&&c.error.contains("paused"),"old active and queued replies fail closed");check(p.executed.get()==2,"old queued tasks cannot start after pause");check(p.peak.get()==2,"worker count stays bounded");
check(stage.done.await(2,TimeUnit.SECONDS)&&!stage.resolved,"old photo staging reply is discarded after pause");
p.unlocked=false;PluginCall locked=new PluginCall("chunks");p.dispatch(locked);check(locked.done.await(1,TimeUnit.SECONDS)&&locked.error.contains("Unlock"),"each request still checks the WebView unlock state");
PluginCall lockedStart=new PluginCall("backgroundStart");p.dispatch(lockedStart);check(lockedStart.error!=null&&!VaultSyncService.isActive(),"locked start rejected");p.unlocked=true;
p.paired=false;PluginCall unpaired=new PluginCall("backgroundStart");p.dispatch(unpaired);check(unpaired.error!=null&&!VaultSyncService.isActive(),"unpaired start rejected");p.paired=true;
p.activity.visible=false;PluginCall hiddenStart=new PluginCall("backgroundStart");p.dispatch(hiddenStart);check(hiddenStart.error!=null&&!VaultSyncService.isActive(),"background cannot start a session");p.activity.visible=true;
p.credentials=new Credentials();int beforePause=p.epoch;p.handleOnPause();check(!p.foreground&&p.epoch>beforePause&&p.credentials.stops>0,"ordinary pause still cancels all work and credentials");p.handleOnResume();
p.permission=PermissionState.DENIED;PluginCall cancelledPermission=new PluginCall("backgroundStart");p.dispatch(cancelledPermission);check(p.pendingPermission==cancelledPermission&&!cancelledPermission.resolved,"permission must finish before service starts");p.dispatch(new PluginCall("pause"));p.handleOnResume();p.permission=PermissionState.GRANTED;p.afterSyncNotification(cancelledPermission);check(cancelledPermission.error!=null&&!VaultSyncService.isActive(),"permission result after explicit lock must not resurrect consent");
p.permission=PermissionState.DENIED;PluginCall permitted=new PluginCall("backgroundStart");p.dispatch(permitted);p.handleOnPause();PluginCall permissionHidden=new PluginCall("pause");permissionHidden.args.put("reason","hidden");p.dispatch(permissionHidden);p.handleOnResume();p.permission=PermissionState.GRANTED;p.afterSyncNotification(permitted);check(permitted.resolved&&VaultSyncService.isActive(),"ordinary permission sheet and hidden-engine pause can resume consent in visible unlocked session");
beforePause=p.epoch;int credentialStops=p.credentials.stops;p.activity.visible=false;p.handleOnPause();check(p.epoch==beforePause&&p.credentials.stops>credentialStops,"active background service keeps sync but cancels credential offers");
PluginCall hiddenStatus=new PluginCall("status");p.dispatch(hiddenStatus);check(hiddenStatus.done.await(1,TimeUnit.SECONDS)&&hiddenStatus.resolved&&VaultSyncService.touches>0,"approved hidden session keeps normal dispatch and native heartbeat");
int secretReads=p.credentials.reads,secretWrites=p.credentials.writes;for(int branch=0;branch<4;branch++){try{if(branch==0)p.credentialShare(p.epoch);if(branch==1)p.credentialReceive(p.epoch);if(branch==2)p.credentialInfo(p.epoch);if(branch==3)p.credentialPull(p.epoch);throw new AssertionError("credential operation must reject after background despite live sync service");}catch(IOException expected){}}check(p.credentials.reads==secretReads&&p.credentials.writes==secretWrites,"late credential operations cannot read/share/import key material");
p.delayReady=true;PluginCall expiredDuringReady=new PluginCall("status");p.dispatch(expiredDuringReady);check(p.pendingReady!=null,"delayed readiness callback queued");VaultSyncService.enabled=false;check(p.lease>System.currentTimeMillis()&&!p.active(),"expired service invalidates hidden native lease immediately");try{p.check(p.epoch);throw new AssertionError("hidden native writes must stop even before watchdog");}catch(IOException expected){}p.pendingReady.accept("true");check(expiredDuringReady.error!=null&&!expiredDuringReady.resolved,"expired service is rechecked after delayed WebView reply");p.delayReady=false;
PluginCall stop=new PluginCall("backgroundStop");p.dispatch(stop);check(stop.resolved&&!VaultSyncService.isActive()&&p.epoch>beforePause,"explicit stop revokes native work immediately");
PluginCall forbiddenHidden=new PluginCall("status");p.dispatch(forbiddenHidden);check(forbiddenHidden.error!=null,"hidden dispatch fails without service");p.activity.visible=true;p.handleOnResume();
// A delayed old JS readiness callback must not cancel a newer explicit start.
p.delayReady=true;PluginCall oldStart=new PluginCall("backgroundStart");p.dispatch(oldStart);Consumer<String> stale=p.pendingReady;p.dispatch(new PluginCall("pause"));PluginCall newStart=new PluginCall("backgroundStart");p.dispatch(newStart);Consumer<String> current=p.pendingReady;stale.accept("true");check(oldStart.error!=null&&p.pendingBackground==newStart,"stale readiness must not cancel replacement consent");current.accept("true");check(newStart.resolved&&VaultSyncService.isActive(),"replacement request still succeeds");p.delayReady=false;p.dispatch(new PluginCall("backgroundStop"));
VaultSyncService.delayStart=true;PluginCall racedStart=new PluginCall("backgroundStart");p.dispatch(racedStart);Consumer<String> lateReady=VaultSyncService.onReady;p.dispatch(new PluginCall("pause"));lateReady.accept(null);check(racedStart.error!=null&&!racedStart.resolved&&!VaultSyncService.isActive(),"late service readiness after lock is cancelled instead of resurrected");VaultSyncService.delayStart=false;
System.out.println("PASS actual Android dispatch/lifecycle: two bounded reads overlap; control tasks remain serial; overload/lock/stop cancel; notification consent cannot survive explicit lock; hidden requests require active service; credentials stop on background; late readiness cannot revive a revoked session");
}finally{p.release.countDown();p.worker.shutdownNow();p.chunkWorkers.shutdownNow();}}
}`;
fs.writeFileSync(file,harness);
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
const result=spawnSync(java,[file],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stderr||String(result.error));console.log(result.stdout.trim());
assert(source.includes('chunkConnections.add(c)')&&source.includes('chunkConnections.remove(c)'),'all network requests register for cancellation');
assert(source.includes('private synchronized void resume')&&source.includes('synchronized(this){check(run);cacheAtomic'),'server startup and cache publication remain epoch guarded');
