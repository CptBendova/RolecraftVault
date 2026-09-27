// Compile real Android lease + lifted native stream/control methods with OS/JSON
// test doubles. No API key, Android device or provider request is used.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'),{execFileSync}=require('child_process');
const root=path.join(__dirname,'..'),base=path.join(root,'mobile/android/app/src/main/java/com/cptbendova/rolecraftvault'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-chat-stream-java-'));
const source=fs.readFileSync(path.join(base,'OpenRouterPlugin.java'),'utf8');
const privacy=source.match(/provider\.put\("zdr", (.+?)\); outbound/);assert(privacy,'native privacy policy expression');
function method(name){const start=source.indexOf(name);assert(start>=0,name);let end=source.indexOf('{',start)+1,depth=1;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}assert.equal(depth,0);return source.slice(start,end);}
const files={
 'android/content/Context.java':`package android.content;public class Context {public static final String POWER_SERVICE="power",WIFI_SERVICE="wifi";public Object getSystemService(String s){return s.equals("power")?new android.os.PowerManager():new android.net.wifi.WifiManager();}public Context getApplicationContext(){return this;}}`,
 'android/os/Looper.java':`package android.os;public class Looper {public static Looper getMainLooper(){return new Looper();}}`,
 'android/os/Handler.java':`package android.os;public class Handler {public static java.util.List<Runnable> jobs=new java.util.ArrayList<>();public Handler(Looper l){}public boolean postDelayed(Runnable r,long n){if(n!=600000)throw new AssertionError("bounded duration");jobs.add(r);return true;}public void removeCallbacks(Runnable r){jobs.remove(r);}public static void fire(){for(Runnable r:new java.util.ArrayList<>(jobs))r.run();}}`,
 'android/os/PowerManager.java':`package android.os;public class PowerManager {public static final int PARTIAL_WAKE_LOCK=1;public static int held=0;public static boolean denied=false;public WakeLock newWakeLock(int n,String tag){if(n!=1)throw new AssertionError("screen must not be forced on");return new WakeLock();}public static class WakeLock {boolean heldHere;public void setReferenceCounted(boolean b){}public void acquire(long n){if(denied)throw new SecurityException();if(n!=600000)throw new AssertionError();held++;heldHere=true;}public boolean isHeld(){return heldHere;}public void release(){if(!heldHere)throw new AssertionError("double release");held--;heldHere=false;}}}`,
 'android/net/wifi/WifiManager.java':`package android.net.wifi;public class WifiManager {public static final int WIFI_MODE_FULL_HIGH_PERF=3;public static int held=0;public WifiLock createWifiLock(int n,String tag){return new WifiLock();}public static class WifiLock {boolean heldHere;public void setReferenceCounted(boolean b){}public void acquire(){held++;heldHere=true;}public boolean isHeld(){return heldHere;}public void release(){if(!heldHere)throw new AssertionError("double release");held--;heldHere=false;}}}`,
 'com/cptbendova/rolecraftvault/ChatStreamLease.java':fs.readFileSync(path.join(base,'ChatStreamLease.java'),'utf8'),
 'com/cptbendova/rolecraftvault/StreamCheck.java':`package com.cptbendova.rolecraftvault;
 import java.io.*;import java.net.*;import java.nio.charset.StandardCharsets;import java.util.*;import java.util.concurrent.*;
 class BasePlugin {protected void handleOnPause(){}protected void handleOnResume(){}protected void handleOnDestroy(){}}
 public class StreamCheck extends BasePlugin {
 private static final String CHAT_PATH="/unused",MODELS_PATH="/models",INTERRUPTED="Connection interrupted",BACKGROUNDED="Background interrupted";
 private final ExecutorService workers=Executors.newSingleThreadExecutor();
 private final ConcurrentHashMap<String,HttpURLConnection> active=new ConcurrentHashMap<>();
 private final ConcurrentHashMap<String,ChatStreamLease> leases=new ConcurrentHashMap<>();
 private final Set<HttpURLConnection> modelConnections=ConcurrentHashMap.newKeySet();
 private volatile Map<String,Boolean> coordinatorSchemaSupport=Collections.emptyMap();
 private final Set<String> pending=ConcurrentHashMap.newKeySet();
 private final Set<HttpURLConnection> coordinatorConnections=ConcurrentHashMap.newKeySet();
 private int coordinatorEpoch;
 private final List<String> events=new ArrayList<>();private String wire="";private boolean broken=false,foreground=true;private int foregroundEpoch;
 private boolean pauseInOpen,pauseBeforeBody,pauseAfterDelta,blockModels;private int opens,bodyWrites,disconnects,lastReadTimeout;
 private CountDownLatch modelEntered=new CountDownLatch(1),modelReleased=new CountDownLatch(1);
 private android.content.Context getContext(){return new android.content.Context();}
 private String readKey(){return "fixture";}
 private HttpURLConnection open(String p,String m,String k)throws Exception{opens++;if(pauseInOpen){pauseInOpen=false;handleOnPause();}return new HttpURLConnection(new URL("https://example.invalid")){{setReadTimeout(180000);}public void setReadTimeout(int n){super.setReadTimeout(n);lastReadTimeout=n;}public void connect(){}public void disconnect(){disconnects++;if(p.equals(MODELS_PATH))modelReleased.countDown();}public boolean usingProxy(){return false;}public int getResponseCode()throws IOException{if(blockModels&&p.equals(MODELS_PATH)){modelEntered.countDown();try{if(!modelReleased.await(2,TimeUnit.SECONDS))throw new IOException("model fixture timeout");}catch(InterruptedException e){throw new IOException(e);}}return 200;}public OutputStream getOutputStream(){if(pauseBeforeBody){pauseBeforeBody=false;handleOnPause();}return new ByteArrayOutputStream(){public void write(byte[] b,int off,int len){bodyWrites++;super.write(b,off,len);}};}public InputStream getInputStream()throws IOException{if(broken)throw new java.net.SocketException("Software caused connection abort");return new ByteArrayInputStream(wire.getBytes(StandardCharsets.UTF_8));}};}
 private void event(String id,String type,String key,String value){events.add(type+":"+value);if(pauseAfterDelta&&type.equals("delta")){pauseAfterDelta=false;handleOnPause();}}
 private JSObject baseEvent(String id,String type){return new JSObject();}private void notifyListeners(String s,JSObject e,boolean keep){}
 private String apiError(JSONObject body,String fallback){return fallback;}private String safeMessage(Exception e,String fallback){return e.getMessage();}private String readLimited(InputStream i,int max){return "";}
 static class JSONObject {String value;JSONObject(String v){value=v;}boolean has(String k){return false;}boolean isNull(String k){return !value.equals("finish");}JSONArray optJSONArray(String k){return k.equals("choices")?new JSONArray(value):null;}JSONObject optJSONObject(String k){return k.equals("delta")?new JSONObject(value):null;}String optString(String k,String fallback){return value.equals("delta")?"partial":fallback;}String optString(String k){return "stop";}Object opt(String k){return null;}int optInt(String k,int fallback){return fallback;}}
 static class JSONArray {String value;JSONArray(String v){value=v;}int length(){return 1;}String optString(int i){return value;}JSONObject optJSONObject(int i){return new JSONObject(value);}}
 static class JSObject {void put(String k,Object v){}static JSObject fromJSONObject(JSONObject v){return new JSObject();}}
 static class JSArray{void put(Object v){}}
 static class PluginCall{final CountDownLatch done=new CountDownLatch(1);boolean resolved;String error;void resolve(JSObject v){resolved=true;done.countDown();}void reject(String e){error=e;done.countDown();}}
 boolean unlocked=true,delayReady;java.util.function.Consumer<String> pendingReady;
 class Activity{void runOnUiThread(Runnable r){r.run();}}class WebView{void evaluateJavascript(String text,java.util.function.Consumer<String> callback){if(delayReady)pendingReady=callback;else callback.accept(unlocked?"true":"false");}}class Bridge{WebView getWebView(){return new WebView();}}
 Activity getActivity(){return new Activity();}Bridge getBridge(){return new Bridge();}
 ${method('private boolean canRequest(')}
 ${method('private void requireForeground(')}
 ${method('private synchronized void streamEvent(')}
 ${method('private void whenReady(')}
 ${method('public void models(')}
 ${method('private static Double catalogTokenPrice(')}
 ${method('private static boolean supportsCoordinatorSchema(')}
 ${method('private void loadModels(')}
 ${method('private synchronized void cancelRequest(')}
 ${method('protected synchronized void handleOnPause(')}
 ${method('protected synchronized void handleOnResume(')}
 ${method('private void stream(').replaceAll('OpenRouterPlugin.this','StreamCheck.this')}
 static void check(boolean b,String m){if(!b)throw new AssertionError(m);}
 static void released(){check(android.os.PowerManager.held==0&&android.net.wifi.WifiManager.held==0&&android.os.Handler.jobs.isEmpty(),"leaked power lease");}
 void run(String data){run(data,false);}
 void run(String data,boolean memoryRequest){events.clear();wire=data;pending.add("id");stream("id",new byte[0],foregroundEpoch,memoryRequest);released();check(pending.isEmpty()&&active.isEmpty()&&leases.isEmpty(),"request cleanup");}
 static class PrivacyRequest {Object value;PrivacyRequest(Object v){value=v;}Object opt(String key){if(!key.equals("requireZdr"))throw new AssertionError();return value;}}
 public static void main(String[] args)throws Exception{StreamCheck t=new StreamCheck();try{
 Object[] privacyValues={null,Boolean.TRUE,Boolean.FALSE,"false",0,new Object()};
 for(int i=0;i<privacyValues.length;i++){PrivacyRequest request=new PrivacyRequest(privacyValues[i]);boolean strict=${privacy[1]};if(strict!=(i!=2))throw new AssertionError("Privacy must require explicit boolean false");}
 t.run("data: delta\\n\\n");check(t.events.equals(Arrays.asList("delta:partial","error:Connection interrupted")),"EOF cannot be success: "+t.events);
 check(t.lastReadTimeout==180000,"ordinary reply retains the existing read timeout");
 t.run("data: [DONE]\\n",true);check(t.lastReadTimeout==360000,"memory compaction has a longer read timeout");
 t.run("data: delta\\ndata: finish\\ndata: [DONE]\\n");check(t.events.equals(Arrays.asList("delta:partial","finish:stop","done:null")),"terminal and finish reason: "+t.events);
 t.broken=true;t.run("");check(t.events.equals(Arrays.asList("error:Connection interrupted")),"friendly transport error");t.broken=false;
 t.events.clear();t.stream("cancelled",new byte[0],t.foregroundEpoch,false);released();check(t.events.isEmpty(),"cancelled request cannot acquire or emit");
 t.unlocked=false;PluginCall locked=new PluginCall();t.models(locked);check(locked.error!=null,"locked models fail before native request");t.unlocked=true;
 final int[] allowed={0};t.delayReady=true;PluginCall staleReady=new PluginCall();t.whenReady(staleReady,run->allowed[0]++);t.handleOnPause();t.handleOnResume();t.pendingReady.accept("true");check(staleReady.error!=null&&allowed[0]==0,"late ready result cannot cross background epoch");t.delayReady=false;
 t.handleOnPause();int before=t.opens;PluginCall hiddenModels=new PluginCall();t.models(hiddenModels);check(hiddenModels.error!=null&&t.opens==before,"no model traffic while hidden even if vault remains unlocked");t.handleOnResume();
 t.pauseInOpen=true;int writes=t.bodyWrites;t.run("data: delta\\ndata: [DONE]\\n");check(t.bodyWrites==writes&&t.events.equals(Arrays.asList("error:Background interrupted")),"pause during connection construction sends no paid request/body and closes late registration");t.handleOnResume();
 t.pauseBeforeBody=true;writes=t.bodyWrites;t.run("data: delta\\ndata: [DONE]\\n");check(t.bodyWrites==writes,"pause while opening output cannot write request body afterward");t.handleOnResume();
 t.pauseAfterDelta=true;t.run("data: delta\\ndata: delta\\ndata: [DONE]\\n");check(t.events.equals(Arrays.asList("delta:partial","error:Background interrupted")),"received partial text retained, subsequent chunks and terminal success cancelled on background");t.handleOnResume();
 PluginCall visibleModels=new PluginCall();t.models(visibleModels);check(visibleModels.done.await(2,TimeUnit.SECONDS)&&visibleModels.resolved,"visible model listing still works");
 t.blockModels=true;t.modelReleased=new CountDownLatch(1);PluginCall cancelledModels=new PluginCall();t.models(cancelledModels);check(t.modelEntered.await(2,TimeUnit.SECONDS),"model network request in flight");int closed=t.disconnects;t.handleOnPause();t.handleOnResume();check(cancelledModels.done.await(2,TimeUnit.SECONDS)&&cancelledModels.error!=null&&!cancelledModels.resolved&&t.disconnects>closed&&t.modelConnections.isEmpty(),"background cancels tracked model request; late response cannot resolve after resume");
 ChatStreamLease lease=new ChatStreamLease(t.getContext(),()->{throw new AssertionError("closed lease expired");});t.leases.put("id",lease);t.pending.add("id");t.cancelRequest("id");released();lease.close();released();
 final int[] expired={0};new ChatStreamLease(t.getContext(),()->expired[0]++);android.os.Handler.fire();released();check(expired[0]==1,"deadline stops request");
 android.os.PowerManager.denied=true;lease=new ChatStreamLease(t.getContext(),()->{});lease.close();released();
 System.out.println("PASS real Android stream EOF/terminal handling, memory and reply read timeouts, manual interruption, bounded power leases, native unlocked/foreground gates, stale readiness rejection, connection-registration/body-write cancellation, retained partial text, and model cancellation without automatic paid retry");}finally{t.workers.shutdownNow();}}
 }`
};
try{for(const [name,text]of Object.entries(files)){const target=path.join(tmp,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);}execFileSync('javac',['-encoding','UTF-8','-d',tmp,...Object.keys(files).map(n=>path.join(tmp,n))],{stdio:'pipe',windowsHide:true,timeout:15000});console.log(execFileSync('java',['-cp',tmp,'com.cptbendova.rolecraftvault.StreamCheck'],{encoding:'utf8',windowsHide:true,timeout:15000}).trim());}
finally{fs.rmSync(tmp,{recursive:true,force:true});}
