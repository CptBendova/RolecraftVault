package com.cptbendova.rolecraftvault;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;
import javax.crypto.*;
import javax.crypto.spec.*;

/** Private, explicitly paired LAN chat transport. Never reads the vault or API key. */
@CapacitorPlugin(name = "ChatLink")
public class ChatLinkPlugin extends Plugin {
    private static final String ALIAS="rolecraft-chat-link-v1";
    private static final int LIMIT=64*1024*1024;
    private static final int SNAPSHOT_LIMIT=48*1024*1024;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile int epoch=0;
    private volatile HttpURLConnection active;
    private volatile DatagramSocket discovery;
    private String hostHash="", hostSnapshot=null, lastPostedHash="";
    private SharedPreferences prefs(){return getContext().getSharedPreferences(ALIAS,0);}
    private static byte[] bytes(String s){return s.getBytes(StandardCharsets.UTF_8);}
    private static String hex(byte[] b){StringBuilder out=new StringBuilder();for(byte n:b)out.append(String.format(Locale.ROOT,"%02x",n&255));return out.toString();}
    private static byte[] unhex(String s){byte[] b=new byte[s.length()/2];for(int i=0;i<b.length;i++)b[i]=(byte)Integer.parseInt(s.substring(i*2,i*2+2),16);return b;}
    private static boolean privateIp(String ip){
        if(!ip.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}"))return false;
        String[] p=ip.split("\\."); for(String n:p)if(Integer.parseInt(n)>255)return false;
        int a=Integer.parseInt(p[0]),b=Integer.parseInt(p[1]);return a==10 || a==192&&b==168 || a==172&&b>=16&&b<=31;
    }
    private SecretKey storageKey() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return (SecretKey)store.getKey(ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private JSONObject config() throws Exception {
        if(!prefs().contains("sealed"))return null;
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,storageKey(),new GCMParameterSpec(128,Base64.decode(prefs().getString("iv",""),Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(prefs().getString("sealed",""),Base64.NO_WRAP)),StandardCharsets.UTF_8));
    }
    private void store(JSONObject config) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,storageKey());
        if(!prefs().edit().putString("sealed",Base64.encodeToString(cipher.doFinal(bytes(config.toString())),Base64.NO_WRAP)).putString("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).commit())throw new IOException("Pairing could not be saved");
    }
    @PluginMethod public void status(PluginCall call){JSObject out=new JSObject();out.put("enabled",prefs().contains("sealed"));out.put("host",false);call.resolve(out);}
    private void pauseWork(){epoch++;if(active!=null)active.disconnect();if(discovery!=null)discovery.close();hostHash="";hostSnapshot=null;lastPostedHash="";}
    private void unlocked(PluginCall call,Runnable action){
        final int run=epoch;
        if(getActivity()==null){call.reject("Chat link paused");return;}
        getActivity().runOnUiThread(()->{
            if(run!=epoch || getBridge()==null || getBridge().getWebView()==null){call.reject("Chat link paused");return;}
            getBridge().getWebView().evaluateJavascript("Boolean(document.querySelector('.rcv[data-rcv-state=\"ready\"]'))",result->{
                if(run!=epoch || !"true".equals(result)){call.reject("Unlock the vault to link chats");return;}action.run();
            });
        });
    }
    @PluginMethod public void pause(PluginCall call){pauseWork();call.resolve();}
    @Override protected void handleOnPause(){pauseWork();}
    @Override protected void handleOnDestroy(){pauseWork();worker.shutdownNow();}
    @PluginMethod public void configure(PluginCall call){
        pauseWork(); final int run=epoch;
        unlocked(call,()->worker.execute(()->{try{
            if(!call.getBoolean("enabled",false)){if(!prefs().edit().clear().commit())throw new IOException("Could not unlink");}
            else {
                String code=call.getString("code","").trim();
                java.util.regex.Matcher match=java.util.regex.Pattern.compile("^RCCHAT1-([0-9.]+):([0-9]+)-([a-f0-9]{64})$").matcher(code);
                if(!match.matches() || !privateIp(match.group(1)) || Integer.parseInt(match.group(2))!=44189)throw new IllegalArgumentException("Paste the pairing code from Windows Chat settings");
                JSONObject cfg=new JSONObject();cfg.put("ip",match.group(1));cfg.put("key",match.group(3));cfg.put("client",UUID.randomUUID().toString());
                if(run!=epoch)throw new IOException("Pairing cancelled");store(cfg);
            }
            JSObject out=new JSObject();out.put("enabled",prefs().contains("sealed"));out.put("host",false);call.resolve(out);
        }catch(Exception e){call.reject(e.getMessage());}}));
    }
    private static byte[] read(InputStream in,int limit) throws Exception {
        try(InputStream source=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[32768];int n,total=0;while((n=source.read(buffer))!=-1){total+=n;if(total>limit)throw new IOException("Chat sync exceeds the safe size limit");out.write(buffer,0,n);}return out.toByteArray();
        }
    }
    private static String encrypt(String text,byte[] key) throws Exception {
        byte[] iv=new byte[12];new SecureRandom().nextBytes(iv);
        ByteArrayOutputStream compressed=new ByteArrayOutputStream();try(GZIPOutputStream zip=new GZIPOutputStream(compressed)){zip.write(bytes(text));}
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));cipher.updateAAD(bytes("RCCHAT1:request"));
        ByteArrayOutputStream result=new ByteArrayOutputStream();result.write(iv);result.write(cipher.doFinal(compressed.toByteArray()));return Base64.encodeToString(result.toByteArray(),Base64.NO_WRAP);
    }
    private static String decrypt(String text,byte[] key) throws Exception {
        byte[] packet=Base64.decode(text,Base64.NO_WRAP);if(packet.length<29)throw new IOException("Invalid sync response");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,Arrays.copyOf(packet,12)));cipher.updateAAD(bytes("RCCHAT1:response"));
        byte[] zipped=cipher.doFinal(packet,12,packet.length-12);return new String(read(new GZIPInputStream(new ByteArrayInputStream(zipped)),LIMIT),StandardCharsets.UTF_8);
    }
    private static String mac(byte[] key,String text) throws Exception {Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key,"HmacSHA256"));return hex(mac.doFinal(bytes(text)));}
    private String discover(byte[] key,int run) throws Exception {
        String nonce=UUID.randomUUID().toString(),request="RCCHAT1|"+nonce+"|"+mac(key,nonce);
        try(DatagramSocket socket=new DatagramSocket()){
            discovery=socket;socket.setBroadcast(true);socket.setSoTimeout(1800);
            byte[] data=bytes(request);
            Set<String> targets=new HashSet<>();targets.add("255.255.255.255");
            Enumeration<NetworkInterface> nets=NetworkInterface.getNetworkInterfaces();while(nets.hasMoreElements())for(InterfaceAddress addr:nets.nextElement().getInterfaceAddresses())if(addr.getBroadcast()!=null)targets.add(addr.getBroadcast().getHostAddress());
            for(String target:targets)socket.send(new DatagramPacket(data,data.length,InetAddress.getByName(target),44190));
            long end=System.currentTimeMillis()+2500;
            while(System.currentTimeMillis()<end && run==epoch){
                DatagramPacket response=new DatagramPacket(new byte[256],256);socket.receive(response);
                String[] parts=new String(response.getData(),0,response.getLength(),StandardCharsets.UTF_8).split("\\|");
                if(parts.length!=4 || !parts[0].equals(nonce) || !privateIp(parts[1]) || !parts[1].equals(response.getAddress().getHostAddress()) || !parts[2].equals("44189"))continue;
                String expected=mac(key,parts[0]+"|"+parts[1]+"|"+parts[2]);
                if(MessageDigest.isEqual(bytes(expected),bytes(parts[3])))return parts[1];
            }
        }finally{discovery=null;}
        throw new IOException("Waiting for Windows on the same Wi-Fi");
    }
    private String request(String ip,String body,int run) throws Exception {
        if(!privateIp(ip) || run!=epoch)throw new IOException("Chat link paused");
        HttpURLConnection connection=(HttpURLConnection)new URL("http",ip,44189,"/chat-sync").openConnection();active=connection;
        try {
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(2500);connection.setReadTimeout(15000);connection.setUseCaches(false);connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","text/plain");
            byte[] data=bytes(body);connection.setFixedLengthStreamingMode(data.length);try(OutputStream out=connection.getOutputStream()){out.write(data);}
            int status=connection.getResponseCode();if(status!=200)throw new ProtocolException(status==423?"Windows Chat is locked, paused or busy":status==429?"Waiting for Windows to save pending chats":"Could not authenticate the chat link. Check pairing on both devices and their clocks.");
            return new String(read(connection.getInputStream(),LIMIT),StandardCharsets.UTF_8);
        }finally{connection.disconnect();if(active==connection)active=null;}
    }
    @PluginMethod public void exchange(PluginCall call){
        final int run=epoch;
        unlocked(call,()->worker.execute(()->{try{
            JSONObject cfg=config();if(cfg==null)throw new IOException("Chat linking is off");
            String snapshot=call.getString("snapshot",null), localHash=call.getString("hash","");
            if(snapshot!=null){if(bytes(snapshot).length>SNAPSHOT_LIMIT)throw new IOException("This one-phone Chat link is too small for the full conversation history. Use Automatic device sync in Settings. Local chats have not changed.");localHash=hex(MessageDigest.getInstance("SHA-256").digest(bytes(snapshot)));}
            else if(!localHash.matches("[a-f0-9]{64}") || !localHash.equals(lastPostedHash)){JSObject retry=new JSObject();retry.put("needSnapshot",true);call.resolve(retry);return;}
            byte[] key=unhex(cfg.getString("key"));String nonce=UUID.randomUUID().toString();
            JSONObject msg=new JSONObject();msg.put("nonce",nonce);msg.put("time",System.currentTimeMillis());msg.put("client",cfg.getString("client"));msg.put("snapshot",snapshot==null || localHash.equals(lastPostedHash)?JSONObject.NULL:snapshot);msg.put("hash",localHash);msg.put("known",hostHash);
            org.json.JSONArray acks=call.getArray("acks");msg.put("ack",acks!=null&&acks.length()>0?acks.optString(acks.length()-1):"");
            String encrypted=encrypt(msg.toString(),key),answer;
            try{answer=request(cfg.getString("ip"),encrypted,run);}catch(IOException first){
                if(run!=epoch || first instanceof ProtocolException)throw first;
                String ip=discover(key,run);answer=request(ip,encrypted,run);
                if(!ip.equals(cfg.getString("ip")) && run==epoch){cfg.put("ip",ip);store(cfg);}
            }
            if(run!=epoch)throw new IOException("Chat link paused");
            JSONObject reply=new JSONObject(decrypt(answer,key));if(!nonce.equals(reply.optString("nonce")))throw new IOException("Unverified sync response");
            lastPostedHash=reply.optBoolean("needSnapshot")?"":localHash;
            if(!reply.isNull("snapshot"))hostSnapshot=reply.getString("snapshot");hostHash=reply.getString("hash");
            if(hostSnapshot==null || !hex(MessageDigest.getInstance("SHA-256").digest(bytes(hostSnapshot))).equals(hostHash))throw new IOException("Incomplete chat sync response");
            org.json.JSONArray incoming=new org.json.JSONArray();
            boolean alreadySaved=false;
            if(acks!=null)for(int i=0;i<acks.length();i++)if(hostHash.equals(acks.optString(i))){alreadySaved=true;break;}
            if(!alreadySaved){JSObject item=new JSObject();item.put("hash",hostHash);item.put("snapshot",hostSnapshot);incoming.put(item);}
            JSObject result=new JSObject();result.put("incoming",incoming);result.put("localHash",localHash);result.put("peerAck",reply.optString("ack"));result.put("lastSeen",System.currentTimeMillis());result.put("needSnapshot",reply.optBoolean("needSnapshot"));call.resolve(result);
        }catch(Exception e){call.reject(e.getMessage()==null?"Waiting for Windows on the same Wi-Fi":e.getMessage());}}));
    }
}
