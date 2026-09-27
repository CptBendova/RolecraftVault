// Execute shipped Android sharing/storage methods with fake preferences and JCE keys.
const fs=require("fs"),path=require("path"),os=require("os"),assert=require("assert"),{execFileSync}=require("child_process");
const base=path.join(__dirname,"../mobile/android/app/src/main/java/com/cptbendova/rolecraftvault");
const source=fs.readFileSync(path.join(base,"CredentialShare.java"),"utf8");
function block(text,signature){const at=text.indexOf(signature);assert(at>=0,signature);let end=text.indexOf("{",at)+1,depth=1;for(;depth&&end<text.length;end++){if(text[end]==="{")depth++;if(text[end]==="}")depth--;}assert.equal(depth,0);return text.slice(at,end);}
const methods=["static String provider(","static String keyValue(","private void available(","private SharedPreferences prefs(","private String field(","private Cipher cipher(","synchronized void stop(","synchronized JSONObject metadata(","synchronized JSONObject status(","synchronized JSONObject share(","synchronized JSONObject pull(","synchronized JSONObject receive("].map(s=>block(source,s)).join("\n");
const openrouter=block(fs.readFileSync(path.join(base,"OpenRouterPlugin.java"),"utf8"),"private String readKey()").replace("readKey()","readOpenRouter()").replaceAll("prefs()",'prefs("openrouter")').replaceAll("getOrCreateKey()",'storageKey("openrouter")').replaceAll("SEALED",'"sealed"').replaceAll("IV",'"iv"');
const image=block(fs.readFileSync(path.join(base,"ImageGenerationPlugin.java"),"utf8"),"private String readKey(String provider)").replaceAll("prefs()","prefs(provider)");
const harness=`import java.io.*;import java.nio.charset.*;import java.util.*;import javax.crypto.*;import javax.crypto.spec.*;
public class CredentialCheck {
static final Object WRITE_LOCK=new Object();
private Context context=new Context();private JSONObject offer;private String sealed,iv;
static class Context{String name="com.cptbendova.rolecraftvault.chat";Map<String,SharedPreferences> stores=new HashMap<>();String getPackageName(){return name;}SharedPreferences getSharedPreferences(String n,int ignored){return stores.computeIfAbsent(n,k->new SharedPreferences());}}
static class SharedPreferences{Map<String,String> data=new HashMap<>();boolean fail;boolean contains(String k){return data.containsKey(k);}String getString(String k,String fallback){return data.getOrDefault(k,fallback);}Editor edit(){return new Editor();}class Editor{Map<String,String> pending=new HashMap<>();Editor putString(String k,String v){pending.put(k,v);return this;}boolean commit(){if(fail)return false;data.putAll(pending);return true;}}}
static class JSONObject{static final Object NULL=new Object();static Map<String,Map<String,Object>> copies=new HashMap<>();Map<String,Object> data=new HashMap<>();JSONObject(){}JSONObject(String copy){data.putAll(copies.get(copy));}JSONObject put(String k,Object v){data.put(k,v);return this;}String optString(String k){Object v=data.get(k);return v instanceof String?(String)v:"";}String getString(String k){return optString(k);}long optLong(String k){Object v=data.get(k);return v instanceof Number?((Number)v).longValue():0;}long getLong(String k){return optLong(k);}public String toString(){String id=UUID.randomUUID().toString();copies.put(id,new HashMap<>(data));return id;}}
static class JSONArray{List<Object> data=new ArrayList<>();JSONArray put(Object v){data.add(v);return this;}}
static class Base64{static final int NO_WRAP=2;static byte[] decode(String s,int flags){return java.util.Base64.getDecoder().decode(s);}static String encodeToString(byte[] b,int flags){return java.util.Base64.getEncoder().encodeToString(b);}}
private SecretKey storageKey(String name)throws Exception{byte[] b=new byte[32];Arrays.fill(b,(byte)(name.equals("openrouter")?1:name.equals("openai")?2:3));return new SecretKeySpec(b,"AES");}
${methods}
${openrouter}
${image}
interface Test{void run()throws Exception;}
static void check(boolean v,String message){if(!v)throw new AssertionError(message);}static void fails(Test run){try{run.run();throw new AssertionError("expected rejection");}catch(IOException expected){}catch(Exception other){throw new AssertionError(other);}}
void seed(String name,String key)throws Exception{Cipher c=cipher(name,Cipher.ENCRYPT_MODE,"");prefs(name).edit().putString(field(name,"sealed"),Base64.encodeToString(c.doFinal(key.getBytes(StandardCharsets.UTF_8)),2)).putString(field(name,"iv"),Base64.encodeToString(c.getIV(),2)).commit();}
public static void main(String[] ignored)throws Exception{
 CredentialCheck a=new CredentialCheck(),b=new CredentialCheck();
 check(a.metadata()==null,"no default sharing");
 for(String name:new String[]{"openrouter","openai","xai"}){
  String key="fixture-key-"+name+"-01234567890123456789";a.seed(name,key);
  JSONObject m=a.share(name);check(!m.data.containsKey("key"),"metadata redacted");
  String id=m.getString("id");check(id.matches("[a-f0-9]{32}"),"offer identity");
  JSONObject data=a.pull(id);check(data.getString("key").equals(key),"native payload correct");
  check(!a.metadata().data.containsKey("key"),"pull cannot mutate public metadata");
  fails(()->b.receive(data,id,"invalid"));fails(()->b.receive(data,"bad",name));
  JSONObject result=b.receive(data,id,name);check(!result.data.containsKey("key"),"import result redacted");
  check((name.equals("openrouter")?b.readOpenRouter():b.readKey(name)).equals(key),"existing provider decrypts imported storage");
  fails(()->b.receive(data,id,name));check(!b.prefs(name).getString(b.field(name,"sealed"),"").contains(key),"sealed at rest");
  a.stop();fails(()->a.pull(id));check(a.metadata()==null,"stop clears offer");
 }
 a.share("openai");a.offer.put("expires",System.currentTimeMillis()-1);check(a.metadata()==null,"expired offer cleared");
 fails(()->a.share("../openrouter"));fails(()->keyValue("short","openai"));fails(()->keyValue("abcdefghijklmnop\\n","openai"));
 CredentialCheck empty=new CredentialCheck();fails(()->empty.share("xai"));
 JSONObject m=a.share("xai"),data=a.pull(m.getString("id"));empty.prefs("xai").fail=true;fails(()->empty.receive(data,m.getString("id"),"xai"));check(!empty.prefs("xai").contains("xai.sealed"),"failed persistence cannot succeed");
 a.context.name="com.cptbendova.rolecraftvault";fails(()->a.share("openai"));fails(()->a.metadata());fails(()->a.status());
 System.out.println("PASS Android shipped key sharing: provider storage compatibility, metadata isolation, exact offer binding, existing-key refusal, expiry, cancellation, failed persistence and standard-edition exclusion");
}}
`;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-key-java-"));
try{const file=path.join(temp,"CredentialCheck.java");fs.writeFileSync(file,harness);console.log(execFileSync("java",[file],{encoding:"utf8",windowsHide:true,timeout:60000}).trim());}
finally{fs.rmSync(temp,{recursive:true,force:true});}
