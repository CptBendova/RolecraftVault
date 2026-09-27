// Execute the shipped metadata-only Android chunk inspection and real lock guards.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'),{spawnSync}=require('child_process');
const source=fs.readFileSync(path.join(__dirname,'../mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/VaultSyncPlugin.java'),'utf8');
function method(name){const start=source.search(new RegExp('    private (?:static |synchronized )?[^\\n{]+ '+name+'\\('));assert(start>=0,name);let depth=0,quoted=false,escaped=false;for(let i=source.indexOf('{',start);i<source.length;i++){const c=source[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);}throw Error('Unclosed method '+name);}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-sync-cache-inspection-')),file=path.join(temp,'CacheInspectionCheck.java');
const harness=`import java.io.*;import java.nio.file.*;import java.util.*;
class CacheInspectionCheck {
JSONObject cfg=new JSONObject();long lease=Long.MAX_VALUE;int epoch=7;boolean foreground=true;
static class VaultSyncService{static boolean running;static boolean isActive(){return running;}}
static class JSONObject{Map<String,Object> values=new HashMap<>();JSONObject put(String k,Object v){values.put(k,v);return this;}JSONArray optJSONArray(String k){Object v=values.get(k);return v instanceof JSONArray?(JSONArray)v:null;}}
static class JSONArray{List<Object> values=new ArrayList<>();JSONArray put(Object v){values.add(v);return this;}int length(){return values.size();}Object get(int i){return values.get(i);}}
static class File extends java.io.File{static int inspections;static Runnable inspectHook;File(String path){super(path);}File(File parent,String child){super(parent,child);}public boolean exists(){inspections++;boolean result=super.exists();if(inspectHook!=null){Runnable run=inspectHook;inspectHook=null;run.run();}return result;}}
File root;File directory(){return root;}
${['active','check','chunk','missingChunks'].map(method).join('\n')}
interface Checked{void run()throws Exception;}static void expect(boolean ok,String message){if(!ok)throw new AssertionError(message);}static void fails(Checked fn){try{fn.run();throw new AssertionError("expected refusal");}catch(IOException expected){}catch(Exception error){throw new AssertionError(error);}}
static JSONObject args(Object...hashes){JSONArray a=new JSONArray();for(Object h:hashes)a.put(h);return new JSONObject().put("hashes",a);}
public static void main(String[] ignored)throws Exception{
CacheInspectionCheck app=new CacheInspectionCheck();Path dir=Files.createTempDirectory("rcv-inspection-data-");app.root=new File(dir.toString());Path chunks=Files.createDirectory(dir.resolve("chunks"));
String present="a".repeat(64),missing="b".repeat(64),empty="c".repeat(64);Path held=chunks.resolve(present);Files.writeString(held,"immutable encrypted cache fixture");Files.createFile(chunks.resolve(empty));long modified=Files.getLastModifiedTime(held).toMillis();
JSONArray result=app.missingChunks(args(present,missing,empty),7).optJSONArray("missing");expect(result.length()==1&&result.get(0).equals(missing),"only missing chunks are returned, in request order");expect(File.inspections==3,"metadata checks only requested identities");
expect(app.missingChunks(args(),7).optJSONArray("missing").length()==0,"empty inspection succeeds");
JSONArray max=new JSONArray();for(int i=0;i<1024;i++)max.put(present);expect(app.missingChunks(new JSONObject().put("hashes",max),7).optJSONArray("missing").length()==0,"1024 entries allowed");max.put(present);int reads=File.inspections;fails(()->app.missingChunks(new JSONObject().put("hashes",max),7));expect(File.inspections==reads,"oversized request does not inspect files");
for(Object invalid:new Object[]{null,17,true,"A".repeat(64),"a".repeat(63),"a".repeat(65),"../"+present,present+"\\n"}){reads=File.inspections;fails(()->app.missingChunks(args(invalid),7));expect(File.inspections==reads,"strict lower-hex strings only");}
fails(()->app.missingChunks(new JSONObject(),7));fails(()->app.missingChunks(new JSONObject().put("hashes","bad"),7));
reads=File.inspections;app.lease=0;fails(()->app.missingChunks(args(present),7));expect(File.inspections==reads,"locked lease refuses before file access");app.lease=Long.MAX_VALUE;
app.foreground=false;fails(()->app.missingChunks(args(present),7));VaultSyncService.running=true;expect(app.missingChunks(args(present),7).optJSONArray("missing").length()==0,"approved native background session allowed");VaultSyncService.running=false;app.foreground=true;
File.inspectHook=()->app.epoch++;reads=File.inspections;fails(()->app.missingChunks(args(present,missing),7));expect(File.inspections==reads+1,"pause during scan stops before next file");
File.inspectHook=()->app.lease=0;fails(()->app.missingChunks(args(present),app.epoch));expect(app.lease==0,"last-file lock is checked before result delivery");
expect(Files.readString(held).equals("immutable encrypted cache fixture")&&Files.getLastModifiedTime(held).toMillis()==modified,"existing bytes and mtime unchanged");expect(Files.size(chunks.resolve(empty))==0&&!Files.exists(chunks.resolve(missing)),"inspection neither repairs nor creates cache entries");
Files.delete(held);Files.delete(chunks.resolve(empty));Files.delete(chunks);Files.delete(dir);
System.out.println("PASS actual Android cache inspection: bounded strict identities, present/missing metadata only, no cache mutation, foreground/session gating, pause mid-batch and lock before delivery");
}}
`;
fs.writeFileSync(file,harness);
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
const result=spawnSync(java,[file],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stderr||String(result.error));console.log(result.stdout.trim());
assert(method('info').includes('.put("photoCacheInspection",1)'),'native capability advertises metadata-only repair');
const execute=method('execute');assert(execute.indexOf('method.equals("missingChunks")')<execute.indexOf('resume(run);check(run);'),'local cache inspection does not start native network/discovery');
assert(!/\b(?:file|cachedText|request|unseal|seal|storeText|atomic)\(/.test(method('missingChunks')),'cache inspection never reads photo bytes, contacts peers or mutates files');
