/* Execute the shipped Android endpoint memory and failure wording on the JVM.
   1.333: verified endpoints persist across the listener pauses Android makes
   on every app switch; the invitation seed and gossip never replace a
   recently verified endpoint; refusals name the actual problem. */
const fs=require("fs"),path=require("path"),os=require("os"),assert=require("assert"),{spawnSync}=require("child_process");
const source=fs.readFileSync(path.join(__dirname,"..","mobile","android","app","src","main","java","com","cptbendova","rolecraftvault","VaultSyncPlugin.java"),"utf8");
function lift(signature){
  const start=source.indexOf("    "+signature);assert(start>=0,"Missing shipped Android method "+signature);
  let depth=0,quote=false,escape=false;
  for(let at=source.indexOf("{",start);at<source.length;at++){
    const c=source[at];
    if(quote){if(escape)escape=false;else if(c==="\\")escape=true;else if(c==='"')quote=false;}
    else if(c==='"')quote=true;else if(c==="{")depth++;else if(c==="}"&&--depth===0)return source.slice(start,at+1);
  }
  throw Error("Unclosed Android method "+signature);
}
const methods=["private boolean validPeer(","private void remember(JSONObject p)","private synchronized void remember(JSONObject p,String how)","private synchronized void persistEndpoint(","private synchronized void restoreEndpoints(","static String refusal(","static String networkError("].map(lift).join("\n");
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-reach-java-")),file=path.join(directory,"ReachCheck.java");
try{
  fs.writeFileSync(file,`import java.io.*;import java.net.*;import java.util.*;import java.util.concurrent.*;
class ReachCheck {
  static final long FRESH=5*60000L,REACH_WINDOW=3*60000L;
  static final String A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",SELF="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  static final Map<String,Map<String,Object>> snapshots=new HashMap<>();
  static class JSONObject {
    static final Object NULL=new Object();final Map<String,Object> values=new LinkedHashMap<>();
    JSONObject(){}JSONObject(String text){values.putAll(snapshots.get(text));}
    public String toString(){String token=UUID.randomUUID().toString();snapshots.put(token,new LinkedHashMap<>(values));return token;}
    JSONObject put(String k,Object v){values.put(k,v);return this;}Object opt(String k){return values.get(k);}boolean has(String k){return values.containsKey(k);}
    String optString(String k){return optString(k,"");}String optString(String k,String d){Object v=values.get(k);return v==null?d:String.valueOf(v);}
    String getString(String k){return (String)values.get(k);}int getInt(String k){return ((Number)values.get(k)).intValue();}
    int optInt(String k){Object v=values.get(k);return v instanceof Number?((Number)v).intValue():0;}long optLong(String k){Object v=values.get(k);return v instanceof Number?((Number)v).longValue():0L;}
    boolean optBoolean(String k){return Boolean.TRUE.equals(values.get(k));}JSONObject optJSONObject(String k){Object v=values.get(k);return v instanceof JSONObject?(JSONObject)v:null;}
    JSONObject getJSONObject(String k){return (JSONObject)values.get(k);}Iterator<String> keys(){return new ArrayList<>(values.keySet()).iterator();}Object remove(String k){return values.remove(k);}int length(){return values.size();}
  }
  volatile JSONObject cfg;final Map<String,JSONObject> peers=new ConcurrentHashMap<>();int saves=0;
  void save(JSONObject value){saves++;cfg=value;}
  static boolean privateIp(String ip){return ip!=null&&ip.startsWith("192.168.");}
${methods}
  static void yes(boolean value,String message){if(!value)throw new AssertionError(message);}
  static JSONObject peer(String id,String ip,int port){return new JSONObject().put("id",id).put("ip",ip).put("port",port);}
  public static void main(String[] ignored)throws Exception{
    ReachCheck t=new ReachCheck();
    JSONObject endpoints=new JSONObject().put(A,new JSONObject().put("ip","192.168.1.5").put("port",40000).put("label","Desk PC").put("at",1L));
    t.cfg=new JSONObject().put("device",SELF).put("endpoints",endpoints).put("seed",peer(A,"192.168.1.9",30000));
    t.restoreEndpoints();
    yes(t.peers.get(A).optInt("port")==40000&&"Desk PC".equals(t.peers.get(A).optString("label")),"a persisted, verified endpoint wins over the invitation seed");
    yes(t.peers.get(A).optBoolean("known")&&t.peers.get(A).optLong("seen")==0,"restored endpoints are candidates, not proof of a live device");
    t.cfg.put("seed",peer(B,"192.168.1.20",31000));t.restoreEndpoints();
    yes(t.peers.get(B).optInt("port")==31000,"the seed is still a first hint for a device never reached");
    t.remember(peer(A,"192.168.1.6",40001));yes(t.peers.get(A).optInt("port")==40001&&System.currentTimeMillis()-t.peers.get(A).optLong("seen")<1000,"authenticated contact replaces the endpoint");
    t.persistEndpoint(A,"Desk PC");yes(t.saves==1&&t.cfg.optJSONObject("endpoints").optJSONObject(A).optInt("port")==40001,"a changed verified endpoint is persisted");
    t.persistEndpoint(A,"Desk PC");yes(t.saves==1,"an unchanged endpoint is not rewritten");
    t.remember(peer(A,"192.168.1.7",45000).put("age",0L),"gossip");yes(t.peers.get(A).optInt("port")==40001,"gossip never replaces a recently verified endpoint");
    t.remember(peer(A,"192.168.1.9",30000),"known");yes(t.peers.get(A).optInt("port")==40001,"the seed never replaces a discovered endpoint");
    String C="dddddddd-dddd-4ddd-8ddd-dddddddddddd";t.remember(peer(C,"192.168.1.30",42000).put("age",1000L).put("label","Tablet"),"gossip");
    yes(t.peers.containsKey(C)&&!t.peers.get(C).optBoolean("known")&&System.currentTimeMillis()-t.peers.get(C).optLong("seen")>=1000,"gossip keeps its age and is not treated as known");
    t.remember(peer(SELF,"192.168.1.40",42000));t.remember(peer("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","8.8.8.8",42000));
    yes(!t.peers.containsKey(SELF)&&t.peers.size()==3,"self and public addresses are ignored");
    for(int i=0;i<40;i++)t.remember(peer(String.format("%08d-0000-4000-8000-000000000000",i),"192.168.2."+(i+1),42000));
    yes(t.peers.size()==32&&t.peers.containsKey("00000039-0000-4000-8000-000000000000"),"the endpoint map is bounded and keeps the newest");
    long now=System.currentTimeMillis();
    yes(refusal(409,"expired",String.valueOf(now-11*60000)).contains("differ by about 11 minutes"),"clock skew is named");
    yes(refusal(423,null,null).contains("locked or in the background"),"a locked peer is named");
    yes(refusal(409,"auth",String.valueOf(now)).contains("did not accept this group's key"),"a re-paired peer is named");
    yes(refusal(409,"busy",String.valueOf(now)).startsWith("Peer is busy"),"other refusals stay retryable");
    yes(networkError(new ConnectException("failed to connect to /192.168.1.5 (port 40000): connect failed: ECONNREFUSED (Connection refused)")).contains("not accepting connections"),"a closed app is named");
    yes(networkError(new SocketTimeoutException("failed to connect after 2500ms")).contains("offline or on another network"),"an absent device is named");
    yes(networkError(new ConnectException("connect failed: EHOSTUNREACH (No route to host)")).contains("offline or on another network"),"an unreachable device is named");
    System.out.println("PASS Android endpoints persist and outrank seed/gossip, and refusals name the cause");
  }
}`);
  const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,"bin",process.platform==="win32"?"java.exe":"java"):"java";
  const result=spawnSync(java,[file],{encoding:"utf8",windowsHide:true,timeout:60000});
  assert.strictEqual(result.status,0,result.stderr||String(result.error));console.log(result.stdout.trim());
}finally{fs.rmSync(directory,{recursive:true,force:true});}
