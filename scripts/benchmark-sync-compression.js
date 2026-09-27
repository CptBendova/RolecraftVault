/* CPU/packet-size probe, not a device/Wi-Fi throughput claim or timing test. */
const fs=require("fs"),path=require("path"),os=require("os"),crypto=require("crypto"),zlib=require("zlib"),assert=require("assert"),vm=require("vm"),{spawnSync}=require("child_process");
const {seal,unseal}=require("../app/vault-sync-transport");
const key=Buffer.alloc(32,7).toString("hex"),random=crypto.randomBytes(144*1024),cases={
  compressedPhotoEntropy:random.toString("base64"),
  compressedMixedEntropy:zlib.deflateSync(Buffer.concat([random.subarray(0,96*1024),Buffer.alloc(96*1024,91)])).toString("base64"),
  writingIndex:JSON.stringify(Array.from({length:160},(_,i)=>({id:"entry-"+i,name:"Character "+i,details:"Saved character writing, background and dialogue. ".repeat(12)})))
};
function forced(level){return vm.runInNewContext("("+seal.toString()+")",{crypto,Buffer,zlib:{gzipSync:bytes=>zlib.gzipSync(bytes,{level})}});}
function timed(fn,text){for(let i=0;i<8;i++)fn(text,key,"blob:fixture");const start=performance.now();let packet;for(let i=0;i<80;i++)packet=fn(text,key,"blob:fixture");assert.equal(unseal(packet,key,"blob:fixture"),text);return {ms:+(performance.now()-start).toFixed(1),packetBytes:Buffer.byteLength(packet)};}
for(const[name,text]of Object.entries(cases))console.log(JSON.stringify({runtime:"Node actual seal with gzip level override",case:name,inputBytes:Buffer.byteLength(text),iterations:80,default6:timed(forced(6),text),fast1:timed(forced(1),text)}));
const javaSource=fs.readFileSync(path.join(__dirname,"../mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/VaultSyncPlugin.java"),"utf8");
function method(name){const start=javaSource.search(new RegExp("    private (?:static )?[^\\n]+ "+name+"\\("));assert(start>=0,name);let depth=0,quote=false,escape=false;for(let i=javaSource.indexOf("{",start);i<javaSource.length;i++){const c=javaSource[i];if(quote){if(escape)escape=false;else if(c==="\\")escape=true;else if(c==='"')quote=false;}else if(c==='"')quote=true;else if(c==="{")depth++;else if(c==="}"&&--depth===0)return javaSource.slice(start,i+1);}throw Error("Unclosed Java method");}
const actual=method("seal"),gzip=/new GZIPOutputStream\(zipped\)(?:\{\{[^{}]*\}\})?/;
assert(gzip.test(actual),"actual Android compression anchor");
const variant=level=>actual.replace("String seal(","String seal"+level+"(").replace(gzip,"new GZIPOutputStream(zipped){{def.setLevel("+level+");}}");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-compression-")),file=path.join(dir,"CompressionCheck.java");
fs.writeFileSync(file,`import java.io.*;import java.util.*;import java.util.zip.*;import java.nio.charset.StandardCharsets;import java.security.*;import javax.crypto.*;import javax.crypto.spec.*;
class CompressionCheck {
 static class Base64 {static final int NO_WRAP=2;static byte[] decode(String s,int flags){return java.util.Base64.getDecoder().decode(s);}static String encodeToString(byte[] b,int flags){return java.util.Base64.getEncoder().encodeToString(b);}}
 ${["bytes","hex","unhex","random"].map(method).join("\n")}
 ${variant(6)}
 ${variant(1)}
 static String measure(String text,String key,int level)throws Exception{for(int i=0;i<16;i++){if(level==6)seal6(text,key,"blob:fixture");else seal1(text,key,"blob:fixture");}long start=System.nanoTime();String packet="";for(int i=0;i<80;i++)packet=level==6?seal6(text,key,"blob:fixture"):seal1(text,key,"blob:fixture");return String.format(Locale.ROOT,"{\\"ms\\":%.1f,\\"packetBytes\\":%d}",(System.nanoTime()-start)/1000000.0,packet.length());}
 public static void main(String[] ignored)throws Exception{Scanner in=new Scanner(System.in,"UTF-8");while(in.hasNextLine()){String[] fields=in.nextLine().split("\\t",3);String text=new String(Base64.decode(fields[2],2),StandardCharsets.UTF_8);System.out.println("{\\"runtime\\":\\"JVM actual seal with gzip level override\\",\\"case\\":\\""+fields[0]+"\\",\\"iterations\\":80,\\"default6\\":"+measure(text,fields[1],6)+",\\"fast1\\":"+measure(text,fields[1],1)+"}");}}
}`);
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,"bin",process.platform==="win32"?"java.exe":"java"):"java";
const output=spawnSync(java,[file],{input:Object.entries(cases).map(([name,text])=>[name,key,Buffer.from(text).toString("base64")].join("\t")).join("\n")+"\n",encoding:"utf8",windowsHide:true,timeout:60000,maxBuffer:1024*1024});
assert.equal(output.status,0,output.stderr||String(output.error));console.log(output.stdout.trim());
