package com.cptbendova.rolecraftvault;

import android.content.SharedPreferences;
import android.content.Context;
import android.net.wifi.WifiManager;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;
import javax.crypto.*;
import javax.crypto.spec.*;

/** Paired LAN-only immutable chunk transport. Never reads or writes vault records. */
@CapacitorPlugin(name="VaultSync",permissions={@Permission(strings={android.Manifest.permission.POST_NOTIFICATIONS},alias="syncNotifications")})
public class VaultSyncPlugin extends Plugin {
    private static final String ALIAS="rolecraft-vault-sync-v1";
    private static final int DISCOVERY=44218,MAX=2*1024*1024,CHUNK=256*1024,BATCH=4;
    private static final String PRIMARY_UPDATE="Update every paired app to the latest private Chat version before syncing with a selected primary device.";
    private final ExecutorService worker=Executors.newSingleThreadExecutor(), servers=Executors.newFixedThreadPool(6);
    // Only immutable chunk reads overlap. Configuration, publishing and key
    // sharing retain the original serial worker and their ordering guarantees.
    private final ThreadPoolExecutor chunkWorkers=new ThreadPoolExecutor(2,2,0L,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<Runnable>(2));
    private final Set<HttpURLConnection> chunkConnections=ConcurrentHashMap.newKeySet();
    private List<String> localAddresses=Collections.emptyList();
    private long addressCheckedAt=0;
    private final Map<String,JSONObject> peers=new ConcurrentHashMap<>();
    // Only authenticated index replies establish this capability, never gossip.
    private final Map<String,Integer> chunkBatches=new ConcurrentHashMap<>();
    private final Map<String,Long> nonces=new ConcurrentHashMap<>();
    private final Map<String,Long> wakeNonces=new ConcurrentHashMap<>();
    // Reachability evidence: when a paired device last reached us, and when our
    // last attempt to reach it failed (cleared by any later success).
    private final Map<String,Long> inbound=new ConcurrentHashMap<>(),outFail=new ConcurrentHashMap<>();
    private static final long FRESH=5*60000L,REACH_WINDOW=3*60000L;
    private final Set<Socket> sockets=ConcurrentHashMap.newKeySet();
    private final Set<String> retained=new HashSet<>();
    private volatile JSONObject cfg;
    private volatile ServerSocket server;
    private volatile DatagramSocket udp;
    private WifiManager.MulticastLock discoveryLock;
    private volatile HttpURLConnection outgoing;
    private volatile long lease=0;
    private volatile int epoch=0,port=0;
    private volatile String ip;
    private volatile boolean foreground=true;
    private volatile PluginCall pendingBackground;
    private void cancelBackgroundStart(){pendingBackground=null;}
    private CredentialShare credentials;
    private synchronized CredentialShare credentialStore(){if(credentials==null)credentials=new CredentialShare(getContext());return credentials;}
    private static byte[] bytes(String s){return s.getBytes(StandardCharsets.UTF_8);}
    private static String hex(byte[] data){StringBuilder s=new StringBuilder();for(byte b:data)s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString();}
    private static byte[] unhex(String s){byte[] b=new byte[s.length()/2];for(int i=0;i<b.length;i++)b[i]=(byte)Integer.parseInt(s.substring(i*2,i*2+2),16);return b;}
    private static String digest(String s)throws Exception{return hex(MessageDigest.getInstance("SHA-256").digest(bytes(s)));}
    private static String random(int n){byte[] b=new byte[n];new SecureRandom().nextBytes(b);return hex(b);}
    private static boolean privateIp(String ip){if(ip==null||!ip.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}"))return false;String[] p=ip.split("\\.");for(String n:p)if(Integer.parseInt(n)>255)return false;int a=Integer.parseInt(p[0]),b=Integer.parseInt(p[1]);return a==10||a==192&&b==168||a==172&&b>=16&&b<=31;}
    private static List<String> addresses()throws Exception{List<String> out=new ArrayList<>();Enumeration<NetworkInterface> nets=NetworkInterface.getNetworkInterfaces();while(nets.hasMoreElements()){NetworkInterface net=nets.nextElement();if(!net.isUp()||net.isLoopback()||net.isPointToPoint())continue;for(InterfaceAddress a:net.getInterfaceAddresses()){String ip=a.getAddress().getHostAddress();if(privateIp(ip)){if(net.getName().startsWith("wlan")||net.getName().startsWith("eth"))out.add(0,ip);else out.add(ip);}}}return out;}
    private File directory(){return new File(getContext().getFilesDir(),"vault-sync");}
    private File head(){return new File(directory(),"head.bin");}
    private File chunk(String hash)throws Exception{if(!hash.matches("[a-f0-9]{64}"))throw new IOException("Invalid chunk identity");return new File(new File(directory(),"chunks"),hash);}
    private SharedPreferences prefs(){return getContext().getSharedPreferences(ALIAS,0);}
    private SecretKey storageKey()throws Exception{KeyStore s=KeyStore.getInstance("AndroidKeyStore");s.load(null);if(s.containsAlias(ALIAS))return(SecretKey)s.getKey(ALIAS,null);KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());return g.generateKey();}
    private synchronized JSONObject loadConfig()throws Exception{if(cfg==null&&prefs().contains("sealed")){Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,storageKey(),new GCMParameterSpec(128,Base64.decode(prefs().getString("iv",""),Base64.NO_WRAP)));cfg=new JSONObject(new String(c.doFinal(Base64.decode(prefs().getString("sealed",""),Base64.NO_WRAP)),StandardCharsets.UTF_8));}if(cfg!=null&&(!cfg.optString("key").matches("[a-f0-9]{64}")||!cfg.optString("device").matches("[a-f0-9-]{36}")))throw new IOException("Pairing is damaged. Leave the group and pair again.");if(cfg!=null)primaryPreference(cfg.opt("primaryPreference"));return cfg;}
    private synchronized void save(JSONObject value)throws Exception{Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,storageKey());if(!prefs().edit().putString("iv",Base64.encodeToString(c.getIV(),Base64.NO_WRAP)).putString("sealed",Base64.encodeToString(c.doFinal(bytes(value.toString())),Base64.NO_WRAP)).commit())throw new IOException("Could not remember pairing");cfg=value;}
    private static JSONObject primaryPreference(Object raw)throws Exception{
        if(raw==null||raw==JSONObject.NULL)return null;
        if(!(raw instanceof JSONObject))throw new IOException("Invalid primary device selection");
        JSONObject value=(JSONObject)raw;String uuid="[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
        Object format=value.opt("format"),sequence=value.opt("sequence"),device=value.opt("device"),author=value.opt("author"),label=value.opt("label");
        if(!(format instanceof Number)||((Number)format).doubleValue()!=1||!(device instanceof String)||!((String)device).matches(uuid)||!(author instanceof String)||!((String)author).matches(uuid)||!(sequence instanceof Number)||((Number)sequence).doubleValue()!=((Number)sequence).longValue()||((Number)sequence).longValue()<1||((Number)sequence).longValue()>9007199254740991L||!(label instanceof String)||((String)label).length()>80)throw new IOException("Invalid primary device selection");
        return new JSONObject().put("format",1).put("device",device).put("author",author).put("sequence",((Number)sequence).longValue()).put("label",label);
    }
    private static int comparePrimary(JSONObject a,JSONObject b)throws Exception{
        if(a==null||b==null)return a!=null?1:b!=null?-1:0;
        int order=Long.compare(a.getLong("sequence"),b.getLong("sequence"));if(order!=0)return order;
        for(String key:new String[]{"author","device","label"}){order=a.getString(key).compareTo(b.getString(key));if(order!=0)return order;}return 0;
    }
    private synchronized void acceptPrimary(JSONObject message,int run)throws Exception{
        check(run);JSONObject incoming=primaryPreference(message.opt("primaryPreference")),current=primaryPreference(cfg.opt("primaryPreference"));
        Object support=message.opt("primarySelection");
        if((current!=null||incoming!=null)&&(!(support instanceof Number)||((Number)support).doubleValue()!=1))throw new IOException(PRIMARY_UPDATE);
        if(comparePrimary(incoming,current)>0){check(run);save(new JSONObject(cfg.toString()).put("primaryPreference",incoming));}
    }
    private synchronized JSONObject setPrimary(JSONObject args,int run)throws Exception{
        loadConfig();if(cfg==null)throw new IOException("Choose or join a sync group first");check(run);
        if(args.has("device")&&!args.isNull("device")&&!cfg.getString("device").equals(args.optString("device")))throw new IOException("Choose Make this device primary on the device you want to use.");
        JSONObject prior=primaryPreference(cfg.opt("primaryPreference"));long sequence=(prior==null?0:prior.getLong("sequence"))+1;
        if(sequence>9007199254740991L)throw new IOException("Primary selection counter is exhausted");
        JSONObject preference=primaryPreference(new JSONObject().put("format",1).put("device",cfg.getString("device")).put("author",cfg.getString("device")).put("sequence",sequence).put("label",cfg.optString("label","Paired device")));
        check(run);save(new JSONObject(cfg.toString()).put("primaryPreference",preference));return info();
    }
    private static void atomic(File f,String value)throws Exception{atomicWrite(f,value,true);}
    // Immutable chunks are rebuildable caches, not committed vault data. Avoid a
    // flash flush per tiny part; hashes/authentication detect any interrupted file.
    private static void cacheAtomic(File f,String value)throws Exception{atomicWrite(f,value,false);}
    private static void atomicWrite(File f,String value,boolean durable)throws Exception{File parent=f.getParentFile();if(!parent.exists()&&!parent.mkdirs())throw new IOException("Sync cache storage is unavailable");File temp=new File(parent,f.getName()+".tmp-"+UUID.randomUUID());try{try(FileOutputStream out=new FileOutputStream(temp)){out.write(bytes(value));if(durable)out.getFD().sync();}Files.move(temp.toPath(),f.toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}finally{if(temp.exists())temp.delete();}}
    private static byte[] read(InputStream in,int limit)throws Exception{try(InputStream input=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[32768];int n,total=0;while((n=input.read(b))!=-1){total+=n;if(total>limit)throw new IOException("Sync packet too large");out.write(b,0,n);}return out.toByteArray();}}
    private static String file(File f)throws Exception{return new String(read(new FileInputStream(f),MAX),StandardCharsets.UTF_8);}
    private static String seal(String text,String key,String aad)throws Exception{byte[] iv=unhex(random(12));ByteArrayOutputStream zipped=new ByteArrayOutputStream();try(GZIPOutputStream z=new GZIPOutputStream(zipped)){z.write(bytes(text));}Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(unhex(key),"AES"),new GCMParameterSpec(128,iv));c.updateAAD(bytes("RCVSYNC1:"+aad));ByteArrayOutputStream out=new ByteArrayOutputStream();out.write(iv);out.write(c.doFinal(zipped.toByteArray()));return Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);}
    private static String unseal(String text,String key,String aad)throws Exception{if(text.length()>MAX||!text.matches("[A-Za-z0-9+/=]+"))throw new IOException("Invalid sync packet");byte[] b=Base64.decode(text,Base64.NO_WRAP);if(b.length<29)throw new IOException("Invalid sync packet");Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,new SecretKeySpec(unhex(key),"AES"),new GCMParameterSpec(128,Arrays.copyOf(b,12)));c.updateAAD(bytes("RCVSYNC1:"+aad));return new String(read(new GZIPInputStream(new ByteArrayInputStream(c.doFinal(b,12,b.length-12))),MAX),StandardCharsets.UTF_8);}
    private static String mac(String key,String value)throws Exception{Mac m=Mac.getInstance("HmacSHA256");m.init(new SecretKeySpec(unhex(key),"HmacSHA256"));return hex(m.doFinal(bytes(value)));}
    private static String sealChunkBatch(String body,String key,String nonce)throws Exception{
        if(!nonce.matches("[a-f0-9]{32}"))throw new IOException("Invalid batch nonce");
        String packet="RCVSYNCB1\n"+nonce+"\n"+mac(key,"RCVSYNC1:chunks-response\n"+nonce+"\n"+body)+"\n"+body;
        if(bytes(packet).length>MAX)throw new IOException("Sync packet too large");
        return packet;
    }
    private static String unsealChunkBatch(String packet,String key,String nonce)throws Exception{
        if(bytes(packet).length>MAX||!nonce.matches("[a-f0-9]{32}"))throw new IOException("Invalid sync batch response");
        String[] fields=packet.split("\n",4);
        if(fields.length!=4||!fields[0].equals("RCVSYNCB1")||!fields[1].equals(nonce)||!fields[2].matches("[a-f0-9]{64}")||!MessageDigest.isEqual(bytes(fields[2]),bytes(mac(key,"RCVSYNC1:chunks-response\n"+nonce+"\n"+fields[3]))))throw new IOException("Invalid sync batch response");
        return fields[3];
    }
    private static JSONArray batchHashes(JSONArray hashes)throws Exception{
        if(hashes==null||hashes.length()<1||hashes.length()>BATCH)throw new IOException("Invalid sync chunk batch");
        for(int i=0;i<hashes.length();i++)if(!(hashes.get(i) instanceof String)||!hashes.getString(i).matches("[a-f0-9]{64}"))throw new IOException("Invalid chunk identity");
        return hashes;
    }
    private static String chunkText(String packet,String key,String hash)throws Exception{
        if(!hash.matches("[a-f0-9]{64}"))throw new IOException("Invalid chunk identity");
        String text=unseal(packet,key,"blob:"+hash);
        if(!digest(text).equals(hash)||bytes(text).length>CHUNK)throw new IOException("Sync chunk checksum failed");return text;
    }
    private synchronized String cachedText(String hash)throws Exception{
        File f=chunk(hash);if(!f.exists())return null;
        try{return chunkText(file(f),cfg.getString("key"),hash);}
        catch(Exception damaged){f.delete();return null;}
    }
    private synchronized String storeText(String text)throws Exception{
        if(bytes(text).length>CHUNK)throw new IOException("Sync chunk too large");
        String hash=digest(text);if(cachedText(hash)==null)cacheAtomic(chunk(hash),seal(text,cfg.getString("key"),"blob:"+hash));return hash;
    }
    private boolean active(){return cfg!=null&&System.currentTimeMillis()<lease&&(foreground||VaultSyncService.isActive());}
    private void check(int run)throws Exception{if(run!=epoch||!active())throw new IOException("Sync paused. Open and unlock Rolecraft to resume.");}
    private synchronized void closeNetwork(){
        try{if(server!=null)server.close();}catch(Exception ignored){}
        if(udp!=null)udp.close();
        if(discoveryLock!=null){if(discoveryLock.isHeld())discoveryLock.release();discoveryLock=null;}
        if(outgoing!=null)outgoing.disconnect();
        for(HttpURLConnection c:chunkConnections)c.disconnect();chunkConnections.clear();
        for(Socket s:sockets)try{s.close();}catch(Exception ignored){}sockets.clear();
        server=null;udp=null;outgoing=null;port=0;ip=null;
        // In-memory endpoints are rebuilt from verified, persisted ones on resume.
        peers.clear();chunkBatches.clear();nonces.clear();wakeNonces.clear();inbound.clear();outFail.clear();
    }
    private synchronized void pauseWork(){if(credentials!=null)credentials.stop();epoch++;lease=0;addressCheckedAt=0;localAddresses=Collections.emptyList();closeNetwork();}
    @Override protected synchronized void handleOnPause(){foreground=false;if(credentials!=null)credentials.stop();if(!VaultSyncService.isActive())pauseWork();}
    @Override protected void handleOnResume(){foreground=true;}
    @Override protected void handleOnDestroy(){cancelBackgroundStart();VaultSyncService.stop(getContext());pauseWork();worker.shutdownNow();chunkWorkers.shutdownNow();servers.shutdownNow();}
    private JSONObject info()throws Exception{JSONObject r=new JSONObject();r.put("enabled",cfg!=null).put("chunkBatch",BATCH).put("chunkConcurrency",2).put("primarySelection",1).put("photoCacheInspection",1).put("storyPublishFast",1);JSONObject preference=cfg==null?null:primaryPreference(cfg.opt("primaryPreference"));r.put("primaryPreference",preference==null?JSONObject.NULL:preference);if(cfg!=null){for(String k:new String[]{"device","primary","label","namespace"})r.put(k,cfg.optString(k));r.put("group",digest(cfg.getString("key")).substring(0,24));}return r;}
    private JSONObject missingChunks(JSONObject args,int run)throws Exception{
        check(run);JSONArray hashes=args.optJSONArray("hashes");
        if(hashes==null||hashes.length()>1024)throw new IOException("Invalid sync cache inspection");
        JSONArray missing=new JSONArray();
        for(int i=0;i<hashes.length();i++){
            check(run);Object raw=hashes.get(i);
            if(!(raw instanceof String)||!((String)raw).matches("[a-f0-9]{64}"))throw new IOException("Invalid chunk identity");
            String hash=(String)raw;
            // Match publish's local existence check, without reading/decrypting
            // photo chunks or contacting a peer. Authentication still happens
            // when serving/receiving the bytes; presence is not integrity proof.
            if(!chunk(hash).exists())missing.put(hash);
        }
        check(run);return new JSONObject().put("missing",missing);
    }
    private boolean validPeer(JSONObject p){JSONObject c=cfg;return c!=null&&p!=null&&!p.optString("id").equals(c.optString("device"))&&p.optString("id").matches("[a-f0-9-]{36}")&&privateIp(p.optString("ip"))&&p.optInt("port")>=1024&&p.optInt("port")<=65535;}
    private void remember(JSONObject p)throws Exception{remember(p,"direct");}
    /* direct = authenticated contact now; gossip = another member's aged view;
       known = persisted from an earlier verified contact, or the invitation
       seed. Weaker evidence never replaces a recently verified endpoint. */
    private synchronized void remember(JSONObject p,String how)throws Exception{
        if(!validPeer(p))return;
        long now=System.currentTimeMillis();String id=p.getString("id");JSONObject old=peers.get(id);
        long age=p.opt("age") instanceof Number?Math.max(0L,Math.min(30*60000L,p.optLong("age"))):60000L;
        long seen=how.equals("direct")?now:how.equals("gossip")?now-age:0L;
        if(old!=null&&!how.equals("direct")){long oldSeen=old.optLong("seen");if(oldSeen>=seen||now-oldSeen<FRESH&&(!old.optString("ip").equals(p.optString("ip"))||old.optInt("port")!=p.optInt("port")))return;}
        String label=p.opt("label") instanceof String?p.getString("label"):"";if(label.isEmpty()&&old!=null)label=old.optString("label","");
        peers.put(id,new JSONObject().put("id",id).put("ip",p.getString("ip")).put("port",p.getInt("port")).put("seen",seen).put("label",label.substring(0,Math.min(80,label.length()))).put("known",old!=null&&old.optBoolean("known")||!how.equals("gossip")));
        while(peers.size()>32){String drop=null;long least=Long.MAX_VALUE;for(JSONObject q:peers.values())if(q.optLong("seen")<least){least=q.optLong("seen");drop=q.optString("id");}if(drop==null)break;peers.remove(drop);}
    }
    private synchronized void persistEndpoint(String id,String label){
        try{
            JSONObject p=peers.get(id);if(cfg==null||p==null||!validPeer(p))return;
            JSONObject endpoints=cfg.optJSONObject("endpoints");if(endpoints==null)endpoints=new JSONObject();
            JSONObject old=endpoints.optJSONObject(id);String name=label!=null&&!label.isEmpty()?label:p.optString("label","");if(name.isEmpty()&&old!=null)name=old.optString("label","");
            name=name.substring(0,Math.min(80,name.length()));
            if(old!=null&&old.optString("ip").equals(p.optString("ip"))&&old.optInt("port")==p.optInt("port")&&old.optString("label","").equals(name))return;
            final JSONObject next=new JSONObject(endpoints.toString());next.put(id,new JSONObject().put("ip",p.getString("ip")).put("port",p.getInt("port")).put("label",name).put("at",System.currentTimeMillis()));
            List<String> keys=new ArrayList<>();for(Iterator<String> it=next.keys();it.hasNext();)keys.add(it.next());
            keys.sort((a,b)->Long.compare(next.optJSONObject(b).optLong("at"),next.optJSONObject(a).optLong("at")));
            for(int i=32;i<keys.size();i++)next.remove(keys.get(i));
            save(new JSONObject(cfg.toString()).put("endpoints",next));
        }catch(Exception ignored){/* Best effort; discovery still works. */}
    }
    private synchronized void restoreEndpoints(){
        try{
            if(cfg==null)return;JSONObject endpoints=cfg.optJSONObject("endpoints");
            if(endpoints!=null)for(Iterator<String> it=endpoints.keys();it.hasNext();){String id=it.next();JSONObject e=endpoints.optJSONObject(id);if(e!=null&&!peers.containsKey(id))remember(new JSONObject().put("id",id).put("ip",e.optString("ip")).put("port",e.optInt("port")).put("label",e.optString("label","")),"known");}
            // The invitation address is only a first hint, never over a discovered endpoint.
            if(cfg.has("seed")){JSONObject seed=cfg.getJSONObject("seed");if(!peers.containsKey(seed.optString("id")))remember(seed,"known");}
        }catch(Exception ignored){}
    }
    private int preferredPort(){int value=prefs().getInt("listenPort",0);return value>=1024&&value<=65535?value:0;}
    private void rememberPort(int value){if(value>=1024&&preferredPort()!=value)prefs().edit().putInt("listenPort",value).apply();}
    private String signedPacket(String type,String nonce)throws Exception{String body=type+"|"+digest(cfg.getString("key")).substring(0,24)+"|"+cfg.getString("device")+"|"+nonce+"|"+System.currentTimeMillis()+"|"+port;return body+"|"+mac(cfg.getString("key"),body);}
    private static boolean sameStoryExtension(JSONObject a,JSONObject b){
        if(a==null||b==null)return false;
        JSONObject x=a.optJSONObject("index"),y=b.optJSONObject("index");if(x==null||y==null)return false;
        JSONArray xp=x.optJSONArray("parts"),yp=y.optJSONArray("parts");
        if(xp==null||yp==null||xp.length()!=yp.length()||!a.optString("revision").equals(b.optString("revision"))||!x.optString("hash").equals(y.optString("hash"))||x.optLong("bytes",-1)!=y.optLong("bytes",-1))return false;
        for(int i=0;i<xp.length();i++)if(!xp.optString(i).equals(yp.optString(i)))return false;
        return true;
    }
    private void wakePeers(){
        try{
            DatagramSocket socket=udp;if(!active()||socket==null)return;
            byte[] packet=bytes(signedPacket("RCVSYNC1~",random(16)));
            Set<String> targets=new HashSet<>();long now=System.currentTimeMillis();
            for(JSONObject peer:peers.values())if(now-peer.optLong("seen")<5*60000)targets.add(peer.optString("ip"));
            targets.add("255.255.255.255");
            Enumeration<NetworkInterface> nets=NetworkInterface.getNetworkInterfaces();
            while(nets.hasMoreElements())for(InterfaceAddress address:nets.nextElement().getInterfaceAddresses())if(address.getBroadcast()!=null&&privateIp(address.getAddress().getHostAddress()))targets.add(address.getBroadcast().getHostAddress());
            for(String target:targets)try{if(target.equals("255.255.255.255")||privateIp(target))socket.send(new DatagramPacket(packet,packet.length,InetAddress.getByName(target),DISCOVERY));}catch(Exception ignored){}
        }catch(Exception ignored){}
    }
    private void discoveryLoop(DatagramSocket socket,int run){while(run==epoch&&!socket.isClosed()){try{DatagramPacket p=new DatagramPacket(new byte[512],512);socket.receive(p);if(!active()||!privateIp(p.getAddress().getHostAddress()))continue;String[] a=new String(p.getData(),0,p.getLength(),StandardCharsets.UTF_8).split("\\|");if(a.length!=7||!Arrays.asList("RCVSYNC1?","RCVSYNC1!","RCVSYNC1~").contains(a[0])||!a[1].equals(digest(cfg.getString("key")).substring(0,24))||a[2].equals(cfg.getString("device"))||!a[2].matches("[a-f0-9-]{36}")||Math.abs(System.currentTimeMillis()-Long.parseLong(a[4]))>120000)continue;int sourcePort=Integer.parseInt(a[5]);if(sourcePort<1024||sourcePort>65535)continue;String body=String.join("|",Arrays.copyOf(a,6));if(!MessageDigest.isEqual(bytes(a[6]),bytes(mac(cfg.getString("key"),body))))continue;remember(new JSONObject().put("id",a[2]).put("ip",p.getAddress().getHostAddress()).put("port",sourcePort));if(a[0].equals("RCVSYNC1?")){byte[] reply=bytes(signedPacket("RCVSYNC1!",a[3]));socket.send(new DatagramPacket(reply,reply.length,p.getAddress(),p.getPort()));}else if(a[0].equals("RCVSYNC1~")&&a[3].matches("[a-f0-9]{32}")){String nonce=a[2]+":"+a[3];long now=System.currentTimeMillis();if(wakeNonces.containsKey(nonce))continue;for(Map.Entry<String,Long> entry:wakeNonces.entrySet())if(now-entry.getValue()>120000)wakeNonces.remove(entry.getKey());if(wakeNonces.size()>=4096)continue;wakeNonces.put(nonce,now);if(run==epoch&&active())notifyListeners("vaultSyncWake",new JSObject().put("deviceId",a[2]),false);}}catch(Exception ignored){}}}
    private static String line(InputStream in)throws Exception{ByteArrayOutputStream b=new ByteArrayOutputStream();int n;while((n=in.read())!=-1){if(n==10)break;if(n!=13)b.write(n);if(b.size()>4096)throw new IOException("Invalid HTTP header");}return b.toString("US-ASCII");}
    private void serve(Socket socket,int run){
        try(Socket s=socket){
            sockets.add(s);s.setSoTimeout(12000);InputStream in=new BufferedInputStream(s.getInputStream());OutputStream out=s.getOutputStream();
            String stage="invalid";
            try{
            String first=line(in);int length=-1,total=0;
            for(String h;(h=line(in)).length()>0;){total+=h.length();if(total>8192)throw new IOException("Headers too large");if(h.toLowerCase(Locale.ROOT).startsWith("content-length:"))length=Integer.parseInt(h.substring(15).trim());if(h.toLowerCase(Locale.ROOT).startsWith("transfer-encoding:"))throw new IOException("Chunked HTTP not supported");}
            if(!privateIp(s.getInetAddress().getHostAddress())||!first.equals("POST /sync HTTP/1.1")||length<1||length>MAX)throw new IOException("Invalid sync request");
            stage="auth";check(run);
            byte[] body=new byte[length];new DataInputStream(in).readFully(body);
            JSONObject request=new JSONObject(unseal(new String(body,StandardCharsets.UTF_8),cfg.getString("key"),"request"));
            stage="expired";
            String nonce=request.optString("nonce");long now=System.currentTimeMillis();
            if(!nonce.matches("[a-f0-9]{32}")||Math.abs(now-request.optLong("at"))>120000||nonces.putIfAbsent(nonce,now)!=null)throw new IOException("Expired request");
            stage="busy";
            for(Map.Entry<String,Long> e:nonces.entrySet())if(now-e.getValue()>120000)nonces.remove(e.getKey());
            if(nonces.size()>4096)throw new IOException("Too many requests");
            // Only a fresh, authenticated request is evidence of the sender's endpoint.
            JSONObject sender=new JSONObject().put("id",request.optString("device")).put("ip",s.getInetAddress().getHostAddress()).put("port",request.optInt("port"));
            if(validPeer(sender)){remember(sender,"direct");inbound.put(sender.getString("id"),now);persistEndpoint(sender.getString("id"),null);}
            String action=request.optString("action");JSONObject result=new JSONObject();
            if(action.equals("index")){
                try{acceptPrimary(request,run);}catch(Exception e){if(!PRIMARY_UPDATE.equals(e.getMessage()))throw e;result.put("device",cfg.getString("device")).put("primarySelection",1).put("error","PRIMARY_SELECTION_UPDATE_REQUIRED");}
                if(!result.has("error")){
                    result.put("head",head().exists()?new JSONObject(unseal(file(head()),cfg.getString("key"),"head")):JSONObject.NULL);
                    JSONObject preference=primaryPreference(cfg.opt("primaryPreference"));
                    JSONArray gossip=new JSONArray(),cannotReach=new JSONArray();long at=System.currentTimeMillis();
                    for(JSONObject p:peers.values()){long seen=p.optLong("seen");if(seen>0&&at-seen<30*60000L&&!p.optString("id").equals(request.optString("device")))gossip.put(new JSONObject().put("id",p.optString("id")).put("ip",p.optString("ip")).put("port",p.optInt("port")).put("age",at-seen).put("label",p.optString("label","")));}
                    // Tell the caller when we recently failed to reach it (one-way firewall).
                    for(Map.Entry<String,Long> e:outFail.entrySet())if(at-e.getValue()<REACH_WINDOW&&cannotReach.length()<32)cannotReach.put(e.getKey());
                    result.put("device",cfg.getString("device")).put("label",cfg.optString("label")).put("peers",gossip).put("cannotReach",cannotReach).put("chunkBatch",BATCH).put("primarySelection",1).put("primaryPreference",preference==null?JSONObject.NULL:preference);
                }
            }else if(action.equals("chunk")||action.equals("chunks")){
                JSONArray hashes=action.equals("chunks")?batchHashes(request.optJSONArray("hashes")):new JSONArray().put(request.getString("hash"));
                JSONArray chunks=new JSONArray();
                for(int i=0;i<hashes.length();i++){
                    check(run);String hash=hashes.getString(i);File f=chunk(hash);String packet=file(f);
                    try{chunkText(packet,cfg.getString("key"),hash);}
                    catch(Exception damaged){f.delete();throw new IOException("Cached chunk damaged; rebuilding from the vault");}
                    chunks.put(new JSONObject().put("hash",hash).put("packet",packet));
                }
                if(action.equals("chunks"))result.put("device",cfg.getString("device")).put("chunks",chunks);
                else result.put("packet",chunks.getJSONObject(0).getString("packet"));
            }else if(action.equals("credential-info")){
                if(!foreground)throw new IOException("Open Rolecraft to share keys");
                synchronized(this){check(run);if(!foreground)throw new IOException("Open Rolecraft to share keys");JSONObject offer=credentialStore().metadata();result.put("device",cfg.getString("device")).put("label",cfg.optString("label")).put("offer",offer==null?JSONObject.NULL:offer);}
            }else if(action.equals("credential-pull")){
                if(!foreground)throw new IOException("Open Rolecraft to share keys");
                synchronized(this){check(run);if(!foreground)throw new IOException("Open Rolecraft to share keys");result.put("device",cfg.getString("device")).put("credential",credentialStore().pull(request.optString("hash")));}
            }else throw new IOException("Unknown sync action");
            check(run);
            // The cached blobs are already encrypted. Authenticate the bounded
            // batch and nonce without compressing/encrypting that ciphertext again.
            byte[] reply=bytes(action.equals("chunks")?sealChunkBatch(result.toString(),cfg.getString("key"),nonce):seal(new JSONObject().put("nonce",nonce).put("result",result).toString(),cfg.getString("key"),"response"));
            if(action.startsWith("credential-")&&!foreground)throw new IOException("Open Rolecraft to share keys");
            out.write(bytes("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: "+reply.length+"\r\n\r\n"));out.write(reply);out.flush();
            }catch(Exception refused){
                // Only a reason code and this device's clock: enough to explain
                // locked, re-paired or clock-skewed peers without leaking data.
                String reason=run==epoch&&active()?stage:"paused";int status=reason.equals("paused")?423:reason.equals("invalid")?404:409;
                try{out.write(bytes("HTTP/1.1 "+status+" Refused\r\nX-RCV-Reason: "+reason+"\r\nX-RCV-Time: "+System.currentTimeMillis()+"\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"));out.flush();}catch(Exception ignored){}
            }
        }catch(Exception ignored){}finally{sockets.remove(socket);}
    }
    private synchronized void resume(int run)throws Exception{
        if(loadConfig()==null)throw new IOException("Choose or join a sync group first");
        if(run!=epoch)throw new IOException("Sync paused");
        long now=System.nanoTime();
        if(addressCheckedAt==0||now-addressCheckedAt>1000000000L){localAddresses=addresses();addressCheckedAt=now;}
        List<String> local=localAddresses;
        if(local.isEmpty()){if(server!=null)closeNetwork();lease=0;throw new IOException("Waiting for a private local network");}
        String nextIp=local.get(0);
        if(server!=null&&nextIp.equals(ip)){lease=System.currentTimeMillis()+20000;return;}
        if(server!=null)closeNetwork();
        lease=0;
        // Keep one port for the pairing: peers remember it, and Android pauses
        // this listener on every app switch. Fall back only if it is taken.
        int wanted=preferredPort();ServerSocket bound=null;
        for(int candidate:wanted>0?new int[]{wanted,0}:new int[]{0}){ServerSocket attempt=new ServerSocket();attempt.setReuseAddress(true);try{attempt.bind(new InetSocketAddress(InetAddress.getByName(nextIp),candidate),8);bound=attempt;break;}catch(Exception error){attempt.close();if(candidate==0)throw error;}}
        final ServerSocket s=bound;
        server=s;ip=nextIp;port=s.getLocalPort();rememberPort(port);lease=System.currentTimeMillis()+20000;
        servers.execute(()->{while(run==epoch&&!s.isClosed())try{Socket accepted=s.accept();if(sockets.size()>=8){accepted.close();continue;}sockets.add(accepted);servers.execute(()->serve(accepted,run));}catch(Exception ignored){}});
        try{DatagramSocket u=new DatagramSocket(null);u.setReuseAddress(true);u.setBroadcast(true);u.bind(new InetSocketAddress(DISCOVERY));udp=u;WifiManager wifi=(WifiManager)getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);if(wifi!=null){discoveryLock=wifi.createMulticastLock(ALIAS);discoveryLock.setReferenceCounted(false);discoveryLock.acquire();}servers.execute(()->discoveryLoop(u,run));}catch(Exception ignored){udp=null;}
        restoreEndpoints();
    }
    private JSONObject request(JSONObject peer,String action,String hash,int run)throws Exception{return request(peer,action,hash,null,run);}
    private JSONObject request(JSONObject peer,String action,String hash,JSONArray hashes,int run)throws Exception{
        check(run);String address=peer.getString("ip");if(!privateIp(address))throw new IOException("Sync is local-network only");
        String nonce=random(16);JSONObject request=new JSONObject().put("nonce",nonce).put("at",System.currentTimeMillis()).put("action",action).put("hash",hash).put("device",cfg.getString("device")).put("port",port);
        if(action.equals("index")){JSONObject preference=primaryPreference(cfg.opt("primaryPreference"));request.put("primarySelection",1).put("primaryPreference",preference==null?JSONObject.NULL:preference);}
        if(hashes!=null)request.put("hashes",batchHashes(hashes));
        String body=seal(request.toString(),cfg.getString("key"),"request");
        HttpURLConnection c=(HttpURLConnection)new URL("http",address,peer.getInt("port"),"/sync").openConnection();chunkConnections.add(c);
        String peerId=peer.getString("id");
        try{
            check(run);
            c.setInstanceFollowRedirects(false);c.setConnectTimeout(2500);c.setReadTimeout(12000);c.setUseCaches(false);c.setRequestMethod("POST");c.setRequestProperty("Content-Type","text/plain");c.setRequestProperty("Connection","close");c.setDoOutput(true);
            byte[] packet=bytes(body);c.setFixedLengthStreamingMode(packet.length);int status;
            try{try(OutputStream out=c.getOutputStream()){out.write(packet);}status=c.getResponseCode();}
            catch(IOException network){check(run);outFail.put(peerId,System.currentTimeMillis());throw new IOException(networkError(network));}
            if(status!=200){outFail.remove(peerId);throw new IOException(refusal(status,c.getHeaderField("X-RCV-Reason"),c.getHeaderField("X-RCV-Time")));}
            String response=new String(read(c.getInputStream(),MAX),StandardCharsets.UTF_8);check(run);outFail.remove(peerId);
            if(action.equals("chunks")){
                JSONObject result=new JSONObject(unsealChunkBatch(response,cfg.getString("key"),nonce));
                if(!peer.getString("id").equals(result.optString("device")))throw new IOException("Peer identity changed");return result;
            }
            JSONObject reply=new JSONObject(unseal(response,cfg.getString("key"),"response"));check(run);
            if(!nonce.equals(reply.optString("nonce")))throw new IOException("Invalid sync response");return reply.getJSONObject("result");
        }finally{c.disconnect();chunkConnections.remove(c);}
    }
    static String refusal(int status,String reason,String time){
        try{long stamp=Long.parseLong(time==null?"":time.trim()),skew=Math.abs(System.currentTimeMillis()-stamp);if(skew>90000)return "The clocks on these devices differ by about "+Math.max(2,Math.round(skew/60000.0))+" minutes. Turn on automatic date and time on both devices.";}catch(NumberFormatException ignored){}
        if(status==423||"paused".equals(reason))return "Paired device is locked or in the background. Open and unlock Rolecraft on it.";
        if("auth".equals(reason))return "Paired device did not accept this group's key. If it was re-paired, leave the group there and pair it again.";
        return "Peer is busy or declined this request. Retrying automatically.";
    }
    static String networkError(IOException error){
        String text=String.valueOf(error.getMessage());
        if(error instanceof ConnectException&&text.contains("ECONNREFUSED"))return "Device found, but Rolecraft is not accepting connections on it. Open and unlock Rolecraft there.";
        if(error instanceof SocketTimeoutException||error instanceof ConnectException||error instanceof NoRouteToHostException||text.contains("EHOSTUNREACH")||text.contains("ENETUNREACH"))return "Peer is offline or on another network. Changes remain on this device.";
        return "Connection was interrupted. Retrying automatically.";
    }
    private String receiveChunk(String hash,JSONObject peer,int run)throws Exception{
        check(run);String text=cachedText(hash);if(text!=null)return text;
        JSONObject result=request(peer,"chunk",hash,run);String packet=result.getString("packet");
        text=chunkText(packet,cfg.getString("key"),hash);
        synchronized(this){check(run);cacheAtomic(chunk(hash),packet);}return text;
    }
    private JSONObject receiveChunks(JSONArray hashes,String peerId,int run)throws Exception{
        batchHashes(hashes);String[] texts=new String[hashes.length()];JSONArray missing=new JSONArray();
        for(int i=0;i<hashes.length();i++){check(run);String hash=hashes.getString(i);texts[i]=cachedText(hash);if(texts[i]==null)missing.put(hash);}
        if(missing.length()>0){
            JSONObject peer=peers.get(peerId);if(peer==null)throw new IOException("Waiting for paired device on this network");
            if(chunkBatches.getOrDefault(peerId,0)>=BATCH){
                JSONObject result=request(peer,"chunks","",missing,run);JSONArray chunks=result.optJSONArray("chunks");
                if(chunks==null||chunks.length()!=missing.length())throw new IOException("Invalid sync chunk batch");
                String[] incoming=new String[missing.length()];
                for(int i=0;i<missing.length();i++){
                    JSONObject item=chunks.getJSONObject(i);String hash=missing.getString(i);
                    if(!hash.equals(item.optString("hash")))throw new IOException("Sync chunk order changed");
                    incoming[i]=chunkText(item.getString("packet"),cfg.getString("key"),hash);
                }
                // Validate the whole reply first. A malformed response must not
                // partially populate the cache or trigger a legacy retry.
                for(int i=0,j=0;i<texts.length;i++)if(texts[i]==null){synchronized(this){check(run);cacheAtomic(chunk(missing.getString(j)),chunks.getJSONObject(j).getString("packet"));}texts[i]=incoming[j++];}
            }else{
                // Only absent capability permits fallback, never integrity errors.
                for(int i=0;i<texts.length;i++)if(texts[i]==null)texts[i]=receiveChunk(hashes.getString(i),peer,run);
            }
        }
        JSONArray result=new JSONArray();for(String text:texts)result.put(text);return new JSONObject().put("texts",result);
    }
    private JSONObject offerJoin(String code,int run)throws Exception{
        if(!code.startsWith("RCVJOIN1.")||code.length()>2000)throw new IOException("Scan the computer's join-request QR");
        JSONObject target=new JSONObject(new String(Base64.decode(code.substring(9),Base64.URL_SAFE|Base64.NO_WRAP),StandardCharsets.UTF_8));long now=System.currentTimeMillis();
        if(!privateIp(target.optString("ip"))||target.optInt("port")<1024||target.optInt("port")>65535||!target.optString("key").matches("[a-f0-9]{64}")||!target.optString("id").matches("[a-f0-9-]{36}")||!target.optString("namespace").equals(cfg.optString("namespace"))||target.optLong("expires")<now||target.optLong("expires")>now+15*60000)throw new IOException("Device QR is expired or incompatible");
        String invitation=execute("invite",new JSONObject(),run).getString("code");
        byte[] packet=bytes(seal(new JSONObject().put("request",target.getString("id")).put("code",invitation).put("label",cfg.optString("label")).toString(),target.getString("key"),"pair-offer"));
        HttpURLConnection c=(HttpURLConnection)new URL("http",target.getString("ip"),target.getInt("port"),"/pair").openConnection();outgoing=c;
        try{c.setInstanceFollowRedirects(false);c.setConnectTimeout(2500);c.setReadTimeout(10000);c.setUseCaches(false);c.setRequestMethod("POST");c.setRequestProperty("Content-Type","text/plain");c.setDoOutput(true);c.setFixedLengthStreamingMode(packet.length);try(OutputStream out=c.getOutputStream()){out.write(packet);}if(c.getResponseCode()!=200)throw new IOException("Computer pairing is unavailable or another offer is waiting. Keep its QR open and retry.");JSONObject reply=new JSONObject(unseal(new String(read(c.getInputStream(),16384),StandardCharsets.UTF_8),target.getString("key"),"pair-reply"));check(run);if(!reply.optBoolean("ok")||!reply.optString("request").equals(target.getString("id")))throw new IOException("Invalid pairing reply");return new JSONObject().put("ok",true);}finally{c.disconnect();if(outgoing==c)outgoing=null;}
    }
    private JSONObject execute(String method,JSONObject args,int run)throws Exception{
        if(method.startsWith("key")&&!method.equals("keyStop")&&!foreground)throw new IOException("Open Rolecraft to share keys");
        if(method.equals("status")){loadConfig();return info();}
        if(method.equals("keyStatus"))return credentialStore().status();
        if(method.equals("keyStop")){credentialStore().stop();return new JSONObject().put("ok",true);}
        if(method.equals("upgradeNamespace")){loadConfig();if(cfg==null||!cfg.optString("namespace").equals(args.optString("from"))||!args.optString("to").equals("library1"))throw new IOException("Incompatible group upgrade");if(head().exists()&&!head().delete())throw new IOException("Could not reset sync staging");save(new JSONObject(cfg.toString()).put("namespace","library1"));return info();}
        if(method.equals("configure")){
            if(args.optString("action").equals("leave")){if(!prefs().edit().clear().commit())throw new IOException("Could not leave group");cfg=null;return info();}
            JSONObject next;String namespace=args.optString("namespace","library1");
            if(args.optString("action").equals("create"))next=new JSONObject().put("key",random(32)).put("device",UUID.randomUUID().toString()).put("namespace",namespace);
            else if(args.optString("action").equals("join")){String code=args.optString("code").trim();if(!code.startsWith("RCVSYNC1."))throw new IOException("Invalid pairing code");JSONObject invite=new JSONObject(new String(Base64.decode(code.substring(9),Base64.URL_SAFE|Base64.NO_WRAP),StandardCharsets.UTF_8));long now=System.currentTimeMillis();if(!invite.optString("key").matches("[a-f0-9]{64}")||!invite.optString("primary").matches("[a-f0-9-]{36}")||!namespace.equals(invite.optString("namespace"))||invite.optLong("expires")<now||invite.optLong("expires")>now+15*60000||!privateIp(invite.optString("ip"))||invite.optInt("port")<1024||invite.optInt("port")>65535)throw new IOException("Pairing code is expired or belongs to a different edition");next=new JSONObject().put("key",invite.getString("key")).put("primary",invite.getString("primary")).put("device",UUID.randomUUID().toString()).put("namespace",namespace).put("seed",new JSONObject().put("id",invite.getString("device")).put("ip",invite.getString("ip")).put("port",invite.getInt("port")));JSONObject preference=primaryPreference(invite.opt("primaryPreference"));if(preference!=null)next.put("primaryPreference",preference);}
            else throw new IOException("Unknown setup action");
            String label=args.optString("label").trim();if(label.isEmpty())label=android.os.Build.MODEL;next.put("label",label.substring(0,Math.min(80,label.length())));if(!next.has("primary"))next.put("primary",next.getString("device"));if(head().exists()&&!head().delete())throw new IOException("Could not reset sync staging");save(next);resume(run);return info();
        }
        if(method.equals("setPrimary"))return setPrimary(args,run);
        if(method.equals("missingChunks")){loadConfig();return missingChunks(args,run);}
        resume(run);check(run);
        // Manual-refresh peers still serve their last published encrypted head
        // and chunks. This never discovers, fetches or merges a remote head.
        if(method.equals("serve"))return info();
        if(method.equals("stageImage"))return stageImage(args,run);
        if(method.equals("keyShare")){synchronized(this){check(run);if(!foreground)throw new IOException("Open Rolecraft to share keys");return new JSONObject().put("offer",credentialStore().share(args.optString("provider")));}}
        if(method.equals("keyInfo")||method.equals("keyImport")){
            JSONObject peer=peers.get(args.optString("peer"));if(peer==null)throw new IOException("Open and unlock the paired device on this network first.");
            if(method.equals("keyImport")){CredentialShare.provider(args.optString("provider"));if(!args.optString("id").matches("[a-f0-9]{32}"))throw new IOException("Refresh the shared keys first.");}
            JSONObject result=request(peer,method.equals("keyInfo")?"credential-info":"credential-pull",args.optString("id"),run);
            if(!peer.getString("id").equals(result.optString("device")))throw new IOException("Peer identity changed.");
            if(method.equals("keyInfo")){
                JSONObject offer=result.optJSONObject("offer"),out=new JSONObject().put("device",result.optString("device")).put("label",result.optString("label","Paired device"));
                if(offer!=null&&offer.optString("id").matches("[a-f0-9]{32}")){CredentialShare.provider(offer.optString("provider"));out.put("offer",new JSONObject().put("id",offer.getString("id")).put("provider",offer.getString("provider")).put("expires",offer.optLong("expires")));}
                return out;
            }
            synchronized(this){check(run);if(!foreground)throw new IOException("Open Rolecraft to share keys");return credentialStore().receive(result.getJSONObject("credential"),args.getString("id"),args.getString("provider"));}
        }
        if(method.equals("offerJoin"))return offerJoin(args.optString("code"),run);
        if(method.equals("invite")){JSONObject invite=new JSONObject();for(String k:new String[]{"key","primary","device","namespace"})invite.put(k,cfg.get(k));JSONObject preference=primaryPreference(cfg.opt("primaryPreference"));invite.put("primaryPreference",preference==null?JSONObject.NULL:preference).put("ip",ip).put("port",port).put("expires",System.currentTimeMillis()+10*60000);return new JSONObject().put("code","RCVSYNC1."+Base64.encodeToString(bytes(invite.toString()),Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING));}
        if(method.equals("discover")){restoreEndpoints();if(udp!=null){byte[] message=bytes(signedPacket("RCVSYNC1?",random(8)));Set<String> targets=new HashSet<>();targets.add("255.255.255.255");Enumeration<NetworkInterface> nets=NetworkInterface.getNetworkInterfaces();while(nets.hasMoreElements())for(InterfaceAddress a:nets.nextElement().getInterfaceAddresses())if(a.getBroadcast()!=null)targets.add(a.getBroadcast().getHostAddress());for(String target:targets)try{udp.send(new DatagramPacket(message,message.length,InetAddress.getByName(target),DISCOVERY));}catch(Exception ignored){}}Object waitMs=args.opt("waitMs");if(!(waitMs instanceof Number)||((Number)waitMs).doubleValue()!=0)Thread.sleep(750);check(run);JSONArray list=new JSONArray();long now=System.currentTimeMillis();for(JSONObject p:peers.values())if(now-p.optLong("seen")<FRESH||p.optBoolean("known"))list.put(new JSONObject(p.toString()).put("inboundAt",inbound.getOrDefault(p.optString("id"),0L)));return new JSONObject().put("peers",list);}
        if(method.equals("diagnose")){
            JSONObject r=info();long now=System.currentTimeMillis();JSONArray adapters=new JSONArray(),list=new JSONArray();
            for(String a:localAddresses)adapters.put(new JSONObject().put("address",a));
            for(JSONObject p:peers.values()){String id=p.optString("id");list.put(new JSONObject().put("id",id).put("label",p.optString("label","")).put("ip",p.optString("ip")).put("port",p.optInt("port")).put("lastSeen",p.optLong("seen")).put("inboundAt",inbound.getOrDefault(id,0L)).put("failedAt",outFail.getOrDefault(id,0L)).put("fresh",now-p.optLong("seen")<FRESH));}
            return r.put("address",ip==null?JSONObject.NULL:ip).put("port",port).put("host",ip==null?JSONObject.NULL:ip).put("discovery",udp!=null).put("adapters",adapters).put("peers",list).put("networkProfile",JSONObject.NULL);
        }
        if(method.equals("put"))return new JSONObject().put("hash",storeText(args.getString("text")));
        if(method.equals("putBatch")){
            JSONArray texts=args.optJSONArray("texts");if(texts==null||texts.length()<1||texts.length()>BATCH)throw new IOException("Invalid sync chunk batch");
            for(int i=0;i<texts.length();i++)if(!(texts.get(i) instanceof String)||bytes(texts.getString(i)).length>CHUNK)throw new IOException("Sync chunk too large");
            JSONArray hashes=new JSONArray();for(int i=0;i<texts.length();i++){check(run);hashes.put(storeText(texts.getString(i)));}return new JSONObject().put("hashes",hashes);
        }
        if(method.equals("chunks"))return receiveChunks(args.optJSONArray("hashes"),args.optString("peer"),run);
        if(method.equals("beginPublish")){retained.clear();return new JSONObject();}
        if(method.equals("retain")){JSONArray hashes=args.getJSONArray("hashes");if(hashes.length()>1024)throw new IOException("Too many chunk references");for(int i=0;i<hashes.length();i++){String h=hashes.getString(i);chunk(h);retained.add(h);}return new JSONObject();}
        if(method.equals("publish")){JSONObject next=args.getJSONObject("head");String value=next.toString();if(bytes(value).length>MAX/2)throw new IOException("Invalid index header");for(String h:retained)if(!chunk(h).exists())throw new IOException("A referenced chunk is missing");JSONObject priorStory=null;try{JSONObject previous=new JSONObject(unseal(file(head()),cfg.getString("key"),"head"));JSONObject extensions=previous.optJSONObject("extensions");priorStory=extensions==null?null:extensions.optJSONObject("stories1");}catch(Exception ignored){}atomic(head(),seal(value,cfg.getString("key"),"head"));JSONObject extensions=next.optJSONObject("extensions"),story=extensions==null?null:extensions.optJSONObject("stories1");if(story!=null&&!sameStoryExtension(priorStory,story))wakePeers();File[] files=new File(directory(),"chunks").listFiles();if(files!=null)for(File f:files)if(f.getName().matches("[a-f0-9]{64}")&&!retained.contains(f.getName())&&System.currentTimeMillis()-f.lastModified()>86400000)f.delete();return new JSONObject();}
        if(method.equals("publishStoryExtension")){
            JSONObject extension=args.optJSONObject("extension"),descriptor=extension==null?null:extension.optJSONObject("index");
            if(extension==null||!extension.optString("revision").matches("[a-f0-9]{64}")||descriptor==null||!descriptor.optString("hash").matches("[a-f0-9]{64}"))throw new IOException("Invalid story sync index");
            JSONArray parts=descriptor.optJSONArray("parts");long expectedBytes=descriptor.optLong("bytes",-1);
            if(parts==null||parts.length()<1||parts.length()>4096||expectedBytes<1||expectedBytes>64L*1024*1024||!(descriptor.opt("bytes") instanceof Number)||((Number)descriptor.opt("bytes")).doubleValue()!=expectedBytes)throw new IOException("Invalid story sync index");
            String expectedLibrary=args.optString("expectedLibraryRevision");Object established=args.opt("established");
            if(!expectedLibrary.matches("[a-f0-9]{64}")||!(established instanceof Boolean))throw new IOException("Invalid story sync base");
            JSONObject previous;try{previous=new JSONObject(unseal(file(head()),cfg.getString("key"),"head"));}catch(Exception missing){return new JSONObject().put("published",false);}
            if(previous.optInt("format")!=1||!expectedLibrary.equals(previous.optString("revision"))||!(previous.opt("established") instanceof Boolean)||previous.getBoolean("established")!=((Boolean)established).booleanValue()||previous.optJSONObject("index")==null||previous.optJSONObject("extensions")==null)return new JSONObject().put("published",false);
            MessageDigest hasher=MessageDigest.getInstance("SHA-256");long size=0;java.io.ByteArrayOutputStream manifestBytes=new java.io.ByteArrayOutputStream();
            for(int i=0;i<parts.length();i++){
                Object raw=parts.get(i);if(!(raw instanceof String)||!((String)raw).matches("[a-f0-9]{64}"))throw new IOException("Invalid story sync index");
                byte[] text;try{text=bytes(chunkText(file(chunk((String)raw)),cfg.getString("key"),(String)raw));}catch(Exception damaged){return new JSONObject().put("published",false);}
                size+=text.length;if(size>expectedBytes)return new JSONObject().put("published",false);hasher.update(text);manifestBytes.write(text);
            }
            if(size!=expectedBytes||!hex(hasher.digest()).equals(descriptor.getString("hash")))return new JSONObject().put("published",false);
            JSONObject manifest;try{manifest=new JSONObject(manifestBytes.toString("UTF-8"));}catch(Exception damaged){return new JSONObject().put("published",false);}
            if(manifest.optInt("format")==2){
                JSONObject records=manifest.optJSONObject("records");if(records==null||records.length()>10000)return new JSONObject().put("published",false);
                for(java.util.Iterator<String> keys=records.keys();keys.hasNext();){
                    String key=keys.next();JSONArray identity;try{identity=new JSONArray(key);}catch(Exception damaged){return new JSONObject().put("published",false);}
                    JSONObject record=records.optJSONObject(key);JSONArray recordParts=record==null?null:record.optJSONArray("parts");long recordBytes=record==null?-1:record.optLong("bytes",-1);
                    if(identity.length()!=2||!"conversation".equals(identity.optString(0))||record==null||!record.optString("hash").matches("[a-f0-9]{64}")||recordParts==null||recordParts.length()>4096||recordBytes<0||recordBytes>64L*1024*1024)return new JSONObject().put("published",false);
                    for(int i=0;i<recordParts.length();i++){String part=recordParts.optString(i);if(!part.matches("[a-f0-9]{64}")||!chunk(part).exists())return new JSONObject().put("published",false);}
                }
            }else if(manifest.optInt("format")!=1)return new JSONObject().put("published",false);
            JSONObject cleanIndex=new JSONObject().put("hash",descriptor.getString("hash")).put("parts",parts).put("bytes",expectedBytes);
            JSONObject nextStory=new JSONObject().put("index",cleanIndex).put("revision",extension.getString("revision"));
            JSONObject prior=previous.getJSONObject("extensions").optJSONObject("stories1");
            if(sameStoryExtension(prior,nextStory))return new JSONObject().put("published",true).put("libraryRevision",expectedLibrary).put("changed",false);
            JSONObject next=new JSONObject(previous.toString()),nextExtensions=new JSONObject(previous.getJSONObject("extensions").toString());
            nextExtensions.put("stories1",nextStory);next.put("extensions",nextExtensions);
            atomic(head(),seal(next.toString(),cfg.getString("key"),"head"));wakePeers();
            return new JSONObject().put("published",true).put("libraryRevision",expectedLibrary).put("changed",true);
        }
        if(method.equals("index")||method.equals("chunk")){
            if(method.equals("chunk")){String cached=cachedText(args.getString("hash"));if(cached!=null)return new JSONObject().put("text",cached);}
            JSONObject peer=peers.get(args.optString("peer"));if(peer==null)throw new IOException("Waiting for paired device on this network");
            if(method.equals("chunk"))return new JSONObject().put("text",receiveChunk(args.getString("hash"),peer,run));
            JSONObject result=request(peer,"index","",run);
            if(!peer.getString("id").equals(result.optString("device")))throw new IOException("Peer identity changed");
            if(result.optString("error").equals("PRIMARY_SELECTION_UPDATE_REQUIRED"))throw new IOException(PRIMARY_UPDATE);
            acceptPrimary(result,run);
            chunkBatches.put(peer.getString("id"),result.optInt("chunkBatch")==BATCH?BATCH:0);
            remember(new JSONObject().put("id",peer.getString("id")).put("ip",peer.getString("ip")).put("port",peer.getInt("port")).put("label",result.optString("label","")),"direct");persistEndpoint(peer.getString("id"),result.optString("label",""));
            JSONArray list=result.optJSONArray("peers");if(list!=null)for(int i=0;i<Math.min(32,list.length());i++){JSONObject item=list.optJSONObject(i);if(item!=null)remember(item,"gossip");}
            JSONArray blocked=result.optJSONArray("cannotReach");boolean cannotReachMe=false;if(blocked!=null)for(int i=0;i<blocked.length();i++)if(cfg.optString("device").equals(blocked.optString(i)))cannotReachMe=true;
            return result.put("cannotReachMe",cannotReachMe);
        }
        throw new IOException("Unknown sync operation");
    }
    private JSONObject stageImage(JSONObject args,int run)throws Exception{
        String key=args.getString("key"),pointer=args.getString("pointer"),path,prefix=null;
        if(pointer.length()>4096)throw new IOException("Invalid picture pointer");
        if(pointer.startsWith("bin2:")){JSONObject p=new JSONObject(pointer.substring(5));path=p.getString("path");prefix=p.getString("prefix");}
        else if(pointer.startsWith("bin:"))path=pointer.substring(4);
        else return new JSONObject();
        byte[][] keys=new byte[2][];
        try{
            for(int i=0;i<2;i++){String value=args.optString(i==0?"wrapKey":"masterKey","");if(!value.isEmpty()&&!value.equals("null")){if(!value.matches("[A-Za-z0-9+/]{43}="))throw new IOException("Invalid picture key material");keys[i]=Base64.decode(value,Base64.NO_WRAP);}}
            SyncImageStager.Result result=SyncImageStager.prepare(new File(getContext().getFilesDir(),"vault"),key,path,prefix,keys,new SyncImageStager.Sink(){
                public void check()throws Exception{VaultSyncPlugin.this.check(run);}
                public String put(String text)throws Exception{synchronized(VaultSyncPlugin.this){check();return storeText(text);}}
            });
            check(run);return result==null?new JSONObject():new JSONObject().put("descriptor",new JSONObject().put("hash",result.hash).put("bytes",result.bytes).put("parts",new JSONArray(result.parts)));
        }finally{for(byte[] raw:keys)if(raw!=null)Arrays.fill(raw,(byte)0);args.remove("wrapKey");args.remove("masterKey");}
    }
    @PermissionCallback private void afterSyncNotification(PluginCall call){if(pendingBackground!=call){call.reject("Background sync was cancelled");return;}beginBackground(call);}
    private void beginBackground(PluginCall call){
        final int run=epoch;
        if(pendingBackground!=call){call.reject("Background sync was cancelled");return;}
        if(!(getActivity() instanceof MainActivity)){cancelBackgroundStart();call.reject("Open Rolecraft to start background sync");return;}
        MainActivity activity=(MainActivity)getActivity();
        activity.runOnUiThread(()->{
            if(pendingBackground!=call||!activity.isSyncForeground()||getBridge()==null||getBridge().getWebView()==null){if(pendingBackground==call)cancelBackgroundStart();call.reject("Open Rolecraft to start background sync");return;}
            getBridge().getWebView().evaluateJavascript("Boolean(document.querySelector('.rcv[data-rcv-state=\"ready\"]'))",ready->{
                if(pendingBackground!=call||!"true".equals(ready)||run!=epoch||!activity.isSyncForeground()){if(pendingBackground==call)cancelBackgroundStart();call.reject("Unlock Rolecraft to start background sync");return;}
                try{if(loadConfig()==null)throw new IOException("Pair your devices before enabling background sync");
                    VaultSyncService.start(activity,this::pauseWork,error->{
                        if(error!=null||pendingBackground!=call||run!=epoch||!VaultSyncService.isActive()){if(pendingBackground==call){cancelBackgroundStart();VaultSyncService.stop(getContext());}call.reject(error==null?"Background sync was cancelled":error);return;}
                        cancelBackgroundStart();lease=System.currentTimeMillis()+20000;call.resolve(new JSObject().put("active",true));
                    });
                }catch(Exception e){if(pendingBackground==call)cancelBackgroundStart();call.reject(e.getMessage());}
            });
        });
    }
    @PluginMethod public void dispatch(PluginCall call){String method=call.getString("method","");if(method.equals("backgroundState")){call.resolve(new JSObject().put("active",VaultSyncService.isActive()));return;}if(method.equals("backgroundStop")){cancelBackgroundStart();VaultSyncService.stop(getContext());pauseWork();call.resolve(new JSObject().put("active",false));return;}if(method.equals("backgroundStart")){if(pendingBackground!=null){call.reject("Background sync is already starting");return;}pendingBackground=call;if(android.os.Build.VERSION.SDK_INT>=33&&getPermissionState("syncNotifications")!=PermissionState.GRANTED){requestPermissionForAlias("syncNotifications",call,"afterSyncNotification");return;}beginBackground(call);return;}if(method.equals("pause")){if(!call.getObject("args",new JSObject()).optString("reason").equals("hidden"))cancelBackgroundStart();VaultSyncService.stop(getContext());pauseWork();call.resolve();return;}if(method.equals("configure")||method.equals("upgradeNamespace")){cancelBackgroundStart();VaultSyncService.stop(getContext());pauseWork();}final int run=epoch;if(getActivity()==null){call.reject("Open Rolecraft to sync");return;}getActivity().runOnUiThread(()->{if(getBridge()==null||getBridge().getWebView()==null||run!=epoch||!foreground&&!VaultSyncService.isActive()){call.reject("Sync paused");return;}getBridge().getWebView().evaluateJavascript("Boolean(document.querySelector('.rcv[data-rcv-state=\"ready\"]'))",ready->{if(!"true".equals(ready)||run!=epoch||!foreground&&!VaultSyncService.isActive()){call.reject("Unlock the vault to sync");return;}lease=System.currentTimeMillis()+20000;VaultSyncService.touch();if(method.equals("status")&&cfg!=null){try{call.resolve(JSObject.fromJSONObject(info()));}catch(Exception e){call.reject("Sync status is unavailable");}return;}try{(method.equals("chunks")?chunkWorkers:worker).execute(()->{try{if(run!=epoch||!foreground&&!VaultSyncService.isActive())throw new IOException("Sync paused");JSONObject result=execute(method,call.getObject("args",new JSObject()),run);if(run!=epoch||!foreground&&!VaultSyncService.isActive())throw new IOException("Sync paused");call.resolve(JSObject.fromJSONObject(result));}catch(Exception e){if(method.equals("discover")&&server!=null)pauseWork();call.reject(e.getMessage()==null?"Sync could not complete":e.getMessage());}});}catch(RejectedExecutionException busy){call.reject("Sync chunk queue is busy. Retrying automatically.");}});});}
}
