// Execute the shipped Android foreground service against disposable JVM OS doubles.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'),{spawnSync}=require('child_process');
const dir=path.join(__dirname,'../mobile/android/app/src/main/java/com/cptbendova/rolecraftvault');
const source=fs.readFileSync(path.join(dir,'VaultSyncService.java'),'utf8');
const activity=fs.readFileSync(path.join(dir,'MainActivity.java'),'utf8');
const manifest=fs.readFileSync(path.join(__dirname,'../mobile/android/app/src/main/AndroidManifest.xml'),'utf8');
const main=`
    static void expect(boolean value,String message){if(!value)throw new AssertionError(message);}
    public static void main(String[] ignored){
        MainActivity a=new MainActivity();int[] started={0},ended={0};List<String> errors=new ArrayList<>();
        Runnable onStop=()->{expect(!isActive(),"native authority must revoke before callback");ended[0]++;};
        Consumer<String> onReady=error->{if(error==null)started[0]++;else errors.add(error);};
        a.foreground=false;start(a,onStop,onReady);expect(a.launch==null&&!errors.isEmpty(),"background cannot start service");
        a.foreground=true;a.packageName="com.cptbendova.rolecraftvault";start(a,onStop,onReady);expect(a.launch==null,"standard app cannot start private session");a.packageName+=".chat";
        NotificationManagerCompat.enabled=false;start(a,onStop,onReady);expect(a.launch==null,"notification refusal fails closed");NotificationManagerCompat.enabled=true;
        ContextCompat.permission=1;start(a,onStop,onReady);expect(a.launch==null,"Android13 notification permission required");ContextCompat.permission=0;
        start(a,onStop,onReady);Intent first=a.launch;expect(!isActive()&&started[0]==0,"request is not active before foreground notification");
        VaultSyncService s=new VaultSyncService();s.onCreate();s.onStartCommand(first,0,1);
        expect(isActive()&&started[0]==1&&s.foregrounds==1,"actual startForeground precedes readiness");
        expect(s.wakeLock.isHeld()&&s.wifiLock.isHeld()&&s.wakeLock.duration<=LEASE_MS,"bounded power lease");
        a.foreground=false;SystemClock.now+=20_000;touch();s.watchdog.run();expect(isActive(),"approved session continues when screen/activity hidden");
        long deadline=sessionUntil;for(int i=0;i<3;i++){SystemClock.now+=20_000;touch();}expect(sessionUntil==deadline&&leaseUntil<=deadline,"touch never extends session limit");
        stop(a);expect(!isActive()&&ended[0]==1&&a.stopEvents==1,"stop revokes native access and publishes UI stop");s.onDestroy();expect(s.wakeLock==null&&s.wifiLock==null,"destroy releases both power locks");
        a.foreground=true;start(a,onStop,onReady);Intent second=a.launch;s=new VaultSyncService();s.onCreate();s.onStartCommand(first,0,2);expect(ready!=null&&!isActive(),"stale launch cannot cancel newer pending session");s.onStartCommand(second,0,3);expect(isActive()&&started[0]==2,"new generation still starts");
        SystemClock.now=leaseUntil+1;touch();expect(!isActive(),"expired lease cannot revive itself");s.watchdog.run();expect(ended[0]==2&&s.stops>0,"watchdog stops expired service without renderer");s.onDestroy();
        start(a,onStop,onReady);s=new VaultSyncService();s.onCreate();s.onStartCommand(a.launch,0,4);expect(isActive(),"third session active");s.onTimeout(4,1);expect(!isActive()&&ended[0]==3&&s.stops>0&&s.foregroundStops>0,"Android15 timeout immediately stops foreground/service");s.onDestroy();
        start(a,onStop,onReady);s=new VaultSyncService();s.onCreate();s.onStartCommand(a.launch,0,5);s.onTaskRemoved(null);expect(!isActive()&&ended[0]==4,"closing task revokes session; no sticky restart");s.onDestroy();
        start(a,onStop,onReady);s=new VaultSyncService();s.onCreate();Service.failForeground=true;s.onStartCommand(a.launch,0,6);expect(!isActive()&&ended[0]==5&&started[0]==4,"foreground failure never reports ready");Service.failForeground=false;s.onDestroy();
        System.out.println("PASS actual Android foreground service: visible/private/notification gating; actual-ready handshake; background continuation; bounded leases; stale launches; native Stop, expiry, timeout and task-close revocation; power release; failed startup");
    }
`;
const stubs=`
class SystemClock{static long now=1000;static long elapsedRealtime(){return now;}}
class Looper{static final Looper MAIN=new Looper();static Looper myLooper(){return MAIN;}static Looper getMainLooper(){return MAIN;}}
class Handler{Handler(Looper l){}void post(Runnable r){r.run();}void postDelayed(Runnable r,long ms){}void removeCallbacks(Runnable r){}}
class Manifest{static class permission{static final String POST_NOTIFICATIONS="notifications";}}
class PackageManager{static final int PERMISSION_GRANTED=0;}
class Build{static class VERSION{static final int SDK_INT=36;}}
class ServiceInfo{static final int FOREGROUND_SERVICE_TYPE_DATA_SYNC=1;}
class ContextCompat{static int permission;static int checkSelfPermission(Context c,String p){return permission;}}
class Context{
 static final String POWER_SERVICE="power",WIFI_SERVICE="wifi";String packageName="com.cptbendova.rolecraftvault.chat";Intent launch;int serviceStops;
 String getPackageName(){return packageName;}void startForegroundService(Intent i){launch=i;}boolean stopService(Intent i){serviceStops++;return true;}
 <T>T getSystemService(Class<T> type){return type.cast(new NotificationManager());}Object getSystemService(String kind){return kind.equals(POWER_SERVICE)?new PowerManager():new WifiManager();}Context getApplicationContext(){return this;}
}
class MainActivity extends Context{boolean foreground=true;int stopEvents;boolean isSyncForeground(){return foreground;}boolean isFinishing(){return false;}boolean isDestroyed(){return false;}void runOnUiThread(Runnable r){r.run();}void onSyncBackgroundStopped(){stopEvents++;}}
class Service extends Context{
 static final int START_NOT_STICKY=2,STOP_FOREGROUND_REMOVE=1;static boolean failForeground;int foregrounds,stops,foregroundStops;
 void onCreate(){}int onStartCommand(Intent i,int f,int s){return 0;}void onDestroy(){}void onTimeout(int start,int kind){}void onTaskRemoved(Intent i){}IBinder onBind(Intent i){return null;}
 void startForeground(int id,Notification n){if(failForeground)throw new IllegalStateException("fixture rejection");foregrounds++;}void startForeground(int id,Notification n,int t){startForeground(id,n);}void stopForeground(int f){foregroundStops++;}void stopSelf(){stops++;}
}
interface IBinder{}
class Intent{static final int FLAG_ACTIVITY_SINGLE_TOP=1;String action;Map<String,Long> values=new HashMap<>();Intent(Context c,Class<?> t){}Intent setAction(String a){action=a;return this;}String getAction(){return action;}Intent putExtra(String k,long v){values.put(k,v);return this;}long getLongExtra(String k,long d){return values.getOrDefault(k,d);}Intent setFlags(int f){return this;}}
class Notification{}
class NotificationChannel{NotificationChannel(String id,String name,int i){}void setDescription(String s){}void setShowBadge(boolean b){}int getImportance(){return 2;}}
class NotificationManager{static final int IMPORTANCE_NONE=0,IMPORTANCE_LOW=2;NotificationChannel getNotificationChannel(String id){return null;}void createNotificationChannel(NotificationChannel c){}}
class NotificationManagerCompat{static boolean enabled=true;static NotificationManagerCompat from(Context c){return new NotificationManagerCompat();}boolean areNotificationsEnabled(){return enabled;}}
class PendingIntent{static final int FLAG_UPDATE_CURRENT=1,FLAG_IMMUTABLE=2;static PendingIntent getActivity(Context c,int id,Intent i,int f){return new PendingIntent();}static PendingIntent getService(Context c,int id,Intent i,int f){return new PendingIntent();}}
class NotificationCompat{static final int VISIBILITY_PRIVATE=0;static class Builder{Builder(Context c,String id){}Builder setContentTitle(String s){return this;}Builder setContentText(String s){return this;}Builder setSmallIcon(int i){return this;}Builder setContentIntent(PendingIntent p){return this;}Builder setOngoing(boolean b){return this;}Builder setOnlyAlertOnce(boolean b){return this;}Builder setVisibility(int v){return this;}Builder addAction(int i,String s,PendingIntent p){return this;}Notification build(){return new Notification();}}}
class PowerManager{static final int PARTIAL_WAKE_LOCK=1;WakeLock newWakeLock(int f,String name){return new WakeLock();}static class WakeLock{boolean held;long duration;void setReferenceCounted(boolean b){}void acquire(long d){held=true;duration=d;}boolean isHeld(){return held;}void release(){held=false;}}}
class WifiManager{static final int WIFI_MODE_FULL_HIGH_PERF=1;WifiLock createWifiLock(int f,String name){return new WifiLock();}static class WifiLock{boolean held;void setReferenceCounted(boolean b){}void acquire(){held=true;}boolean isHeld(){return held;}void release(){held=false;}}}
`;
// Only package/import names and Android resource IDs are adapted; service methods are exact shipped code.
let harness=source.replace(/^package [^;]+;\s*/m,'').replace(/^import (?:android|androidx)\.[^;]+;\r?\n/gm,'').replace(/android\.R\.drawable\.[a-z_]+/g,'0');
harness='import java.util.*;\n'+harness.slice(0,harness.lastIndexOf('}'))+main+'}\n'+stubs;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-sync-service-')),file=path.join(temp,'VaultSyncService.java');fs.writeFileSync(file,harness);
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
const result=spawnSync(java,[file],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stderr||String(result.error));console.log(result.stdout.trim());
assert(/public void onPause\(\)\s*\{[\s\S]*?super\.onPause\(\);[\s\S]*?pingBackground\(\);[\s\S]*?keepSyncWebViewRunning\(\);/.test(activity),'all ordinary background/plugin events remain');
assert(/public void onStop\(\)\s*\{\s*super\.onStop\(\);\s*keepSyncWebViewRunning\(\);/.test(activity),'Capacitor App background event remains');
assert(activity.includes('if (!VaultSyncService.isActive()')&&activity.includes('VaultSyncService.stop(this)'),'only active session keeps WebView alive and destroy revokes it');
assert(manifest.includes('android:name=".VaultSyncService"')&&/android:name=".VaultSyncService"\s+android:exported="false"\s+android:foregroundServiceType="dataSync"/.test(manifest),'private dataSync service is not externally startable');
assert(!source.includes('START_STICKY')&&!manifest.includes('BOOT_COMPLETED'),'no service restart or boot auto-unlock');
