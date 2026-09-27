/* Compile the shipped pure-Java image stager and exercise encrypted fixtures. */
const assert=require("assert"),fs=require("fs"),path=require("path"),os=require("os"),crypto=require("crypto"),{spawnSync}=require("child_process");
const shipped=fs.readFileSync(path.join(__dirname,"../mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/SyncImageStager.java"),"utf8");
const imports=shipped.match(/^import .*;$/gm).join("\n"),body=shipped.slice(shipped.indexOf("/** Native-only preparation."));
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-native-stage-")),file=path.join(directory,"NativeStageCheck.java");
const harness=`${imports}
class NativeStageCheck {
 static final byte[] KEY=new byte[32];static final String RECORD="img:fixture !'()~",PREFIX="data:image/png;base64,";static File vault;static byte[] image;
 interface Work{void run()throws Exception;}
 static void expect(boolean value,String reason){if(!value)throw new AssertionError(reason);}
 static void rejects(Work work,String reason)throws Exception{try{work.run();throw new AssertionError("Expected rejection: "+reason);}catch(IOException expected){}}
 static void wiped(byte[][] keys){for(byte[] key:keys)for(byte b:key)expect(b==0,"transient key bytes erased on every exit");}
 static String sha(String text)throws Exception{return SyncImageStager.hex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}
 static String encoded(String record)throws Exception{return URLEncoder.encode(record,"UTF-8").replace("+","%20").replace("%21","!").replace("%27","'").replace("%28","(").replace("%29",")").replace("%7E","~");}
 static byte[] encrypted(byte[] plain)throws Exception{byte[] iv=new byte[12];Arrays.fill(iv,(byte)7);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(KEY,"AES"),new GCMParameterSpec(128,iv));ByteArrayOutputStream out=new ByteArrayOutputStream();out.write("RCVS1".getBytes(StandardCharsets.US_ASCII));out.write(iv);out.write(cipher.doFinal(plain));return out.toByteArray();}
 static String save(String record,String suffix,byte[] plain)throws Exception{File target=new File(vault,encoded(record)+suffix);Files.write(target.toPath(),encrypted(plain));return "vault/"+target.getName();}
 static class Sink implements SyncImageStager.Sink{
  final List<String> pieces=new ArrayList<>();boolean cancel=false;int cancelAfter=Integer.MAX_VALUE;
  public void check()throws Exception{if(cancel)throw new IOException("cancelled fixture");}
  public String put(String text)throws Exception{expect(text.length()<=192*1024,"existing wire piece bound");pieces.add(text);if(pieces.size()==cancelAfter)cancel=true;return sha(text);}
 }
 static SyncImageStager.Result stage(String record,String path,String prefix,byte[][] keys,Sink sink)throws Exception{return SyncImageStager.prepare(vault,record,path,prefix,keys,sink);}
 static void compare(String record,String path,String prefix,String expected)throws Exception{
  byte[][] keys={new byte[32],KEY.clone()};Sink sink=new Sink();SyncImageStager.Result result=stage(record,path,prefix,keys,sink);wiped(keys);
  expect(result!=null,"supported immutable file");expect(String.join("",sink.pieces).equals(expected),"exact original data URL survives staging");
  expect(result.bytes==expected.getBytes(StandardCharsets.UTF_8).length&&result.hash.equals(sha(expected)),"whole image digest and byte count");
  expect(result.parts.size()==sink.pieces.size(),"one returned hash per existing192KiB text piece");
  for(int i=0;i<sink.pieces.size();i++){expect(result.parts.get(i).equals(sha(sink.pieces.get(i))),"chunk identity unchanged");expect(sink.pieces.get(i).equals(expected.substring(i*192*1024,Math.min(expected.length(),(i+1)*192*1024))),"wire slicing exact");}
  System.out.println("DESCRIPTOR "+result.hash+" "+result.bytes+" "+result.parts.size());
 }
 public static void main(String[] args)throws Exception{
  vault=new File(args[0],"vault");expect(vault.mkdirs(),"fixture directory");for(int i=0;i<KEY.length;i++)KEY[i]=(byte)(i+1);
  image=new byte[512*1024+97];for(int i=0;i<image.length;i++)image[i]=(byte)((i*31)^(i>>>8));String expected=PREFIX+Base64.getEncoder().encodeToString(image);
  String binary=save(RECORD,".immutable",image),legacy=save(RECORD,".legacy",expected.getBytes(StandardCharsets.UTF_8));
  compare(RECORD,binary,PREFIX,expected);compare(RECORD,legacy,null,expected);
  String thumb=save("th:small","",new byte[]{0,1,(byte)255});compare("th:small",thumb,"data:image/jpeg;base64,","data:image/jpeg;base64,AAH/");
  compare("th:small",thumb,"DATA:IMAGE/PNG;BASE64,","DATA:IMAGE/PNG;BASE64,AAH/");
  byte[][] corruptKeys={KEY.clone()};Sink corruptSink=new Sink();byte[] corrupt=Files.readAllBytes(new File(vault.getParentFile(),binary).toPath());corrupt[corrupt.length-1]^=1;String broken=save(RECORD,".broken",image);Files.write(new File(vault.getParentFile(),broken).toPath(),corrupt);
  rejects(()->stage(RECORD,broken,PREFIX,corruptKeys,corruptSink),"GCM authentication");expect(corruptSink.pieces.isEmpty(),"authentication completes before any chunk emitted");wiped(corruptKeys);
  byte[][] wrongKeys={new byte[32]};Sink wrongSink=new Sink();rejects(()->stage(RECORD,binary,PREFIX,wrongKeys,wrongSink),"wrong key");expect(wrongSink.pieces.isEmpty(),"wrong key emits no chunks");wiped(wrongKeys);
  File outside=new File(vault.getParentFile(),encoded(RECORD));Files.write(outside.toPath(),encrypted(image));
  for(String target:new String[]{"../"+outside.getName(),outside.getAbsolutePath(),"vault/../"+outside.getName()}){byte[][] keys={KEY.clone()};Sink sink=new Sink();rejects(()->stage(RECORD,target,PREFIX,keys,sink),"outside private vault");wiped(keys);expect(sink.pieces.isEmpty(),"outside path untouched");}
  byte[][] mismatch={KEY.clone()};rejects(()->stage("img:different",binary,PREFIX,mismatch,new Sink()),"wrong record immutable path");wiped(mismatch);
  byte[][] invalid={KEY.clone()};rejects(()->stage("chars:all",binary,PREFIX,invalid,new Sink()),"not a picture record");wiped(invalid);
  byte[][] cancelledKeys={KEY.clone()};Sink cancelled=new Sink();cancelled.cancel=true;rejects(()->stage(RECORD,binary,PREFIX,cancelledKeys,cancelled),"cancel before reading");wiped(cancelledKeys);expect(cancelled.pieces.isEmpty(),"cancelled source not read");
  byte[][] duringKeys={KEY.clone()};Sink during=new Sink();during.cancelAfter=1;rejects(()->stage(RECORD,binary,PREFIX,duringKeys,during),"cancel between chunks");wiped(duringKeys);expect(during.pieces.size()==1,"cancel stops subsequent chunks without a completed descriptor");
  byte[][] unicodeKeys={KEY.clone()};String unicode=save(RECORD,".unicode","data:image/png;note=雪;base64,AA==".getBytes(StandardCharsets.UTF_8));Sink unicodeSink=new Sink();expect(stage(RECORD,unicode,null,unicodeKeys,unicodeSink)==null,"nonASCII legacy falls back without rewriting");expect(unicodeSink.pieces.isEmpty(),"legacy fallback emitted no chunks");wiped(unicodeKeys);
  byte[][] textKeys={KEY.clone()};String text=save(RECORD,".text","not a data URL".getBytes(StandardCharsets.UTF_8));expect(stage(RECORD,text,null,textKeys,new Sink())==null,"unrecognized legacy shape falls back");wiped(textKeys);
  byte[][] prefixKeys={KEY.clone()};Sink prefixSink=new Sink();rejects(()->stage(RECORD,binary,"data:image/png;note=é;base64,",prefixKeys,prefixSink),"nonASCII prefix cannot pass through ASCII wire chunks");wiped(prefixKeys);expect(prefixSink.pieces.isEmpty(),"unsupported binary prefix emits no chunks");
  File huge=new File(vault,encoded(RECORD)+".oversized");try(RandomAccessFile sparse=new RandomAccessFile(huge,"rw")){sparse.setLength(SyncImageStager.LIMIT+34L);}byte[][] hugeKeys={KEY.clone()};Sink hugeSink=new Sink();rejects(()->stage(RECORD,"vault/"+huge.getName(),PREFIX,hugeKeys,hugeSink),"size bound before allocating file");wiped(hugeKeys);expect(hugeSink.pieces.isEmpty(),"oversized source never staged");
  byte[] unchanged=Files.readAllBytes(new File(vault.getParentFile(),binary).toPath());expect(Arrays.equals(unchanged,encrypted(image)),"original encrypted file never rewritten");
  System.out.println("PASS actual native bin/bin2 exact wire slices, AES-GCM authentication, alternate keys, path and record scope, key erasure, cancellation, legacy fallback and file-size bounds");
 }
}
${body}`;
fs.writeFileSync(file,harness);
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,"bin",process.platform==="win32"?"java.exe":"java"):"java";
const result=spawnSync(java,[file,directory],{encoding:"utf8",windowsHide:true,timeout:60000,maxBuffer:1024*1024});
assert.equal(result.status,0,result.stderr||String(result.error));
const image=Buffer.alloc(512*1024+97);for(let i=0;i<image.length;i++)image[i]=(i*31)^(i>>>8);
const text="data:image/png;base64,"+image.toString("base64"),expected=`DESCRIPTOR ${crypto.createHash("sha256").update(text).digest("hex")} ${Buffer.byteLength(text)} ${Math.ceil(text.length/(192*1024))}`;
assert.equal(result.stdout.split(/\r?\n/).filter(line=>line===expected).length,2,"Android exact data URL descriptors match Node for binary and legacy sources");
const mixed="DATA:IMAGE/PNG;BASE64,AAH/";
assert(result.stdout.split(/\r?\n/).includes(`DESCRIPTOR ${crypto.createHash("sha256").update(mixed).digest("hex")} ${Buffer.byteLength(mixed)} 1`),"mixed-case original prefix is preserved byte-exact, not normalized");
console.log(result.stdout.trim());
