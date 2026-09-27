// Execute the shipped Android register/selection methods, with OS storage stubbed.
const fs=require("fs"),path=require("path"),os=require("os"),assert=require("assert"),{spawnSync}=require("child_process");
const source=fs.readFileSync(path.join(__dirname,"../mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/VaultSyncPlugin.java"),"utf8");
function method(name){const start=source.search(new RegExp("    private (?:static |synchronized )?[^\\n]+ "+name+"\\("));assert(start>=0,name);let depth=0,quote=false,escape=false;for(let i=source.indexOf("{",start);i<source.length;i++){const c=source[i];if(quote){if(escape)escape=false;else if(c==="\\")escape=true;else if(c==='"')quote=false;}else if(c==='"')quote=true;else if(c==="{")depth++;else if(c==="}"&&--depth===0)return source.slice(start,i+1);}throw Error("Unclosed Java method");}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-primary-java-")),file=path.join(temp,"PrimaryCheck.java");
const harness=`import java.io.*;import java.util.*;import java.security.*;import java.nio.charset.StandardCharsets;
class PrimaryCheck {
static final int BATCH=4;static final String PRIMARY_UPDATE="Update every paired app to the latest private Chat version before syncing with a selected primary device.";
JSONObject cfg;long lease=Long.MAX_VALUE;int epoch=7,saves=0;boolean failSave=false,foreground=true;
static class VaultSyncService{static boolean running=false;static boolean isActive(){return running;}}
static class JSONObject {
 static final Object NULL=new Object();static final Map<String,Map<String,Object>> snapshots=new HashMap<>();final Map<String,Object> values=new HashMap<>();
 JSONObject(){}JSONObject(String text){values.putAll(snapshots.get(text));}public String toString(){String token=UUID.randomUUID().toString();snapshots.put(token,new HashMap<>(values));return token;}
 JSONObject put(String k,Object v){values.put(k,v);return this;}Object opt(String k){return values.get(k);}Object get(String k){return values.get(k);}
 boolean has(String k){return values.containsKey(k);}boolean isNull(String k){return opt(k)==null||opt(k)==NULL;}
 String optString(String k){return optString(k,"");}String optString(String k,String fallback){Object v=opt(k);return v instanceof String?(String)v:fallback;}
 String getString(String k){return (String)opt(k);}long getLong(String k){return ((Number)opt(k)).longValue();}
}
JSONObject loadConfig(){return cfg;}
void save(JSONObject value)throws IOException{if(failSave)throw new IOException("persistence failed");cfg=value;saves++;}
${["bytes","hex","digest","primaryPreference","comparePrimary","acceptPrimary","setPrimary","active","check","info"].map(method).join("\n")}
interface Test{void run()throws Exception;}static void expect(boolean ok,String message){if(!ok)throw new AssertionError(message);}static void fails(Test test){try{test.run();throw new AssertionError("expected rejection");}catch(IOException expected){}catch(Exception error){throw new AssertionError(error);}}
static JSONObject preference(String id,long seq)throws Exception{return new JSONObject().put("format",1).put("device",id).put("author",id).put("sequence",seq).put("label","Primary");}
public static void main(String[] ignored)throws Exception{
 String first="00000000-0000-4000-8000-000000000001",second="00000000-0000-4000-8000-000000000002";
 PrimaryCheck app=new PrimaryCheck();app.cfg=new JSONObject().put("device",first).put("primary",second).put("label","Phone").put("key","fixture key").put("namespace","library1");
 expect(primaryPreference(null)==null&&primaryPreference(JSONObject.NULL)==null,"absent compatible");
 JSONObject a=primaryPreference(preference(first,1)),b=primaryPreference(preference(second,1));expect(comparePrimary(a,b)<0&&comparePrimary(b,a)>0,"stable UUID tie");
 for(Object value:new Object[]{0,-1,1.5,"1",9007199254740992L,Double.NaN,Double.POSITIVE_INFINITY})fails(()->primaryPreference(preference(first,1).put("sequence",value)));
 fails(()->primaryPreference(preference(first,1).put("format","1")));fails(()->primaryPreference(preference(first,1).put("author","invalid")));fails(()->primaryPreference(preference(first,1).put("device",7)));fails(()->primaryPreference(preference(first,1).put("label","x".repeat(81))));fails(()->primaryPreference("invalid"));
 JSONObject selected=app.setPrimary(new JSONObject(),7);JSONObject p=(JSONObject)selected.opt("primaryPreference");expect(p.getLong("sequence")==1&&p.getString("device").equals(first),"self selected");expect(selected.getString("primary").equals(second)&&app.cfg.getString("key").equals("fixture key"),"pairing retained");
 fails(()->app.setPrimary(new JSONObject().put("device",second),7));
 app.acceptPrimary(new JSONObject().put("primarySelection",1).put("primaryPreference",b),7);expect(((JSONObject)app.cfg.opt("primaryPreference")).getString("device").equals(second),"concurrent larger choice wins");
 int saved=app.saves;app.acceptPrimary(new JSONObject().put("primarySelection",1).put("primaryPreference",a),7);expect(app.saves==saved,"older choice does not write");
 app.acceptPrimary(new JSONObject().put("primarySelection",1),7);expect(app.saves==saved,"absent preference never clears");
 fails(()->app.acceptPrimary(new JSONObject(),7));fails(()->app.acceptPrimary(new JSONObject().put("primarySelection","1").put("primaryPreference",preference(first,2)),7));
 app.failSave=true;fails(()->app.setPrimary(new JSONObject(),7));fails(()->app.acceptPrimary(new JSONObject().put("primarySelection",1).put("primaryPreference",preference(first,9)),7));expect(app.saves==saved,"failed persistence not advertised");app.failSave=false;
 app.epoch++;fails(()->app.setPrimary(new JSONObject(),7));fails(()->app.acceptPrimary(new JSONObject().put("primarySelection",1).put("primaryPreference",preference(first,9)),7));expect(app.saves==saved,"paused generation cannot write");
 app.lease=0;fails(()->app.setPrimary(new JSONObject(),8));fails(()->app.acceptPrimary(new JSONObject().put("primarySelection",1).put("primaryPreference",preference(first,9)),8));expect(app.saves==saved,"expired/locked lease cannot write");
 app.lease=Long.MAX_VALUE;app.foreground=false;fails(()->app.setPrimary(new JSONObject(),8));expect(app.saves==saved,"hidden without consent cannot write");
 VaultSyncService.running=true;expect(app.active(),"approved background session retains live lease");app.lease=0;expect(!app.active(),"background consent cannot bypass expired lock lease");
 app.lease=Long.MAX_VALUE;VaultSyncService.running=false;app.foreground=true;app.cfg.put("primaryPreference",preference(second,9007199254740991L));fails(()->app.setPrimary(new JSONObject(),8));
 System.out.println("PASS actual Android primary register: strict validation, deterministic ties, protected-save-before-advertise, original pairing retained, self selection, old-peer gate, pause/lease guards and counter bounds");
}
}`;
fs.writeFileSync(file,harness);
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,"bin",process.platform==="win32"?"java.exe":"java"):"java";
const result=spawnSync(java,[file],{encoding:"utf8",windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stderr||String(result.error));console.log(result.stdout.trim());
assert(source.includes('if(action.equals("index")){JSONObject preference=primaryPreference(cfg.opt("primaryPreference"));request.put("primarySelection",1)'),"actual Android request advertises protocol support and preference");
assert(source.includes('if(!peer.getString("id").equals(result.optString("device")))throw new IOException("Peer identity changed");\n            if(result.optString("error")'),"identity checked before incoming preference adoption");
