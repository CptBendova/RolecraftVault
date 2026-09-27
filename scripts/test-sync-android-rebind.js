/* Execute the shipped Android listener lifecycle with deterministic network changes. */
const fs=require("fs"),path=require("path"),os=require("os"),assert=require("assert"),{spawnSync}=require("child_process");
const source=fs.readFileSync(path.join(__dirname,"..","mobile","android","app","src","main","java","com","cptbendova","rolecraftvault","VaultSyncPlugin.java"),"utf8");
function method(name){
  const start=source.search(new RegExp("    private synchronized void "+name+"\\("));
  assert(start>=0,"Missing shipped Android method "+name);
  let depth=0,quote=false,escape=false;
  for(let at=source.indexOf("{",start);at<source.length;at++){
    const c=source[at];
    if(quote){if(escape)escape=false;else if(c==="\\")escape=true;else if(c==='"')quote=false;}
    else if(c==='"')quote=true;else if(c==="{")depth++;else if(c==="}"&&--depth===0)return source.slice(start,at+1);
  }
  throw Error("Unclosed Android method "+name);
}
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-rebind-")),file=path.join(directory,"RebindCheck.java");
try{
  fs.writeFileSync(file,`import java.io.*;import java.net.*;import java.util.*;import java.util.concurrent.*;
class RebindCheck {
  static final int DISCOVERY=44218;static final String ALIAS="sync-test";
  int epoch=1,port=0;long lease=0,addressCheckedAt=0;String ip;
  List<String> nextAddresses=List.of("10.10.1.2"),localAddresses=Collections.emptyList();
  Map<String,Object> peers=new HashMap<>(),chunkBatches=new HashMap<>(),nonces=new HashMap<>(),wakeNonces=new HashMap<>(),inbound=new HashMap<>(),outFail=new HashMap<>();
  int storedPort=0,restored=0;int preferredPort(){return storedPort;}void rememberPort(int value){storedPort=value;}void restoreEndpoints(){restored++;peers.put("persisted",new Object());}
  Set<Socket> sockets=new HashSet<>();Set<HttpURLConnection> chunkConnections=new HashSet<>();
  ServerSocket server;DatagramSocket udp;HttpURLConnection outgoing;WifiManager.MulticastLock discoveryLock;
  JSONObject cfg=new JSONObject();Executor servers=command->{};
  static class JSONObject{boolean has(String key){return false;}JSONObject getJSONObject(String key){return this;}}
  static class InetAddress{static String getByName(String value){return value;}}
  static class InetSocketAddress{String address;int port;InetSocketAddress(String value,int port){address=value;this.port=port;}InetSocketAddress(int port){address="*";}}
  static class ServerSocket{static int nextPort=30000;boolean closed;String bound;int localPort=nextPort++;void setReuseAddress(boolean value){}void bind(InetSocketAddress address,int backlog){bound=address.address;if(address.port!=0)localPort=address.port;}int getLocalPort(){return localPort;}boolean isClosed(){return closed;}void close(){closed=true;}Socket accept()throws Exception{throw new IOException("unused");}}
  static class DatagramSocket{boolean closed;DatagramSocket(Object ignored){}void setReuseAddress(boolean value){}void setBroadcast(boolean value){}void bind(InetSocketAddress address){}void close(){closed=true;}}
  static class WifiManager{MulticastLock createMulticastLock(String name){return new MulticastLock();}static class MulticastLock{void setReferenceCounted(boolean value){}void acquire(){}boolean isHeld(){return false;}void release(){}}}
  static class Context{static final String WIFI_SERVICE="wifi";}
  class AppContext{AppContext getApplicationContext(){return this;}Object getSystemService(String key){return null;}}
  AppContext getContext(){return new AppContext();}
  JSONObject loadConfig(){return cfg;}
  List<String> addresses(){return nextAddresses;}
  void serve(Socket socket,int run){}void discoveryLoop(DatagramSocket socket,int run){}void remember(JSONObject seed){}
${method("closeNetwork")}
${method("resume")}
  static void yes(boolean value,String message){if(!value)throw new AssertionError(message);}
  public static void main(String[] ignored)throws Exception{
    RebindCheck test=new RebindCheck();
    test.resume(1);ServerSocket old=test.server;Socket connected=new Socket();test.sockets.add(connected);test.peers.put("old subnet",new Object());
    yes("10.10.1.2".equals(test.ip)&&old!=null,"initial private address binds");
    test.nextAddresses=List.of("192.168.12.4");test.addressCheckedAt=0;test.resume(1);
    yes(old.closed&&connected.isClosed(),"old listener and connections close on IP change");
    yes("192.168.12.4".equals(test.ip)&&test.server!=old&&!test.server.closed,"new private address binds without leaving the group");
    yes(test.server.getLocalPort()==old.getLocalPort()&&test.storedPort==old.getLocalPort(),"the listening port stays the same across a rebind so peers can still reach it");
    yes(!test.peers.containsKey("old subnet")&&test.peers.containsKey("persisted")&&test.restored==2&&test.epoch==1,"unverified endpoints clear and verified ones are restored without changing the paired session");
    ServerSocket second=test.server;test.nextAddresses=Collections.emptyList();test.addressCheckedAt=0;
    try{test.resume(1);throw new AssertionError("missing private network accepted");}catch(IOException expected){}
    yes(second.closed&&test.server==null,"network loss stops advertising the stale address");
    test.nextAddresses=List.of("192.168.12.4");test.addressCheckedAt=0;test.resume(1);
    yes(test.server!=null&&!test.server.closed,"the next heartbeat reopens a listener after network returns");
    yes(test.server.getLocalPort()==old.getLocalPort(),"the port also survives Wi-Fi loss");
    System.out.println("PASS Android listener rebinds on private IP change on the same port, restores verified peers, and recovers after Wi-Fi returns");
  }
}`);
  const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,"bin",process.platform==="win32"?"java.exe":"java"):"java";
  const result=spawnSync(java,[file],{encoding:"utf8",windowsHide:true,timeout:30000});
  assert.strictEqual(result.status,0,result.stderr||String(result.error));console.log(result.stdout.trim());
}finally{fs.rmSync(directory,{recursive:true,force:true});}
