/* Compile and execute the actual Android codec on the JVM, against Node's wire. */
const fs=require("fs"),path=require("path"),os=require("os"),assert=require("assert"),crypto=require("crypto"),{spawnSync}=require("child_process");
const {seal,unseal,sealChunkBatch,unsealChunkBatch}=require("../app/vault-sync-transport");
const source=fs.readFileSync(path.join(__dirname,"../mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/VaultSyncPlugin.java"),"utf8");
function method(name){const start=source.search(new RegExp("    private (?:static )?[^\\n]+ "+name+"\\("));assert(start>=0,name);let at=source.indexOf("{",start),depth=0,quote=false,escape=false;for(let i=at;i<source.length;i++){const c=source[i];if(quote){if(escape)escape=false;else if(c==="\\")escape=true;else if(c==='"')quote=false;}else if(c==='"')quote=true;else if(c==="{")depth++;else if(c==="}"&&--depth===0)return source.slice(start,i+1);}throw Error("Unclosed Java method");}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-wire-")),file=path.join(dir,"SyncWire.java");
const harness=`import java.io.*;import java.util.*;import java.util.zip.*;import java.nio.file.*;import java.nio.charset.StandardCharsets;import java.security.*;import javax.crypto.*;import javax.crypto.spec.*;
class SyncWire {
static final int MAX=2*1024*1024,CHUNK=256*1024;
static class Base64 {static final int NO_WRAP=2;static byte[] decode(String s,int flags){return java.util.Base64.getDecoder().decode(s);}static String encodeToString(byte[] b,int flags){return java.util.Base64.getEncoder().encodeToString(b);}}
${["bytes","hex","unhex","digest","random","read","file","seal","unseal","mac","sealChunkBatch","unsealChunkBatch","chunkText","atomic","cacheAtomic","atomicWrite","chunk","cachedText","storeText"].map(method).join("\n")}
static class Config {String key;String getString(String ignored){return key;}}Config cfg=new Config();File root;
File directory(){return root;}
String verifyCache(String key,String path)throws Exception{
 cfg.key=key;root=new File(path);String text="An immutable photo cache fixture",hash=storeText(text);if(!text.equals(cachedText(hash)))throw new IOException("Missing cache");
 String packet=file(chunk(hash));if(packet.contains(text))throw new IOException("Plaintext cache");
 Files.write(chunk(hash).toPath(),bytes("interrupted write"));if(cachedText(hash)!=null||chunk(hash).exists())throw new IOException("Damaged cache was retained");
 if(!storeText(text).equals(hash)||!text.equals(cachedText(hash)))throw new IOException("Cache did not rebuild");
 File head=new File(root,"head.bin");atomic(head,seal("durable head",key,"head"));if(!unseal(file(head),key,"head").equals("durable head"))throw new IOException("Head write failed");
 File[] files=chunk(hash).getParentFile().listFiles();if(files==null||files.length!=1)throw new IOException("Staging leftovers");return "cache recovered";
}
public static void main(String[] args)throws Exception{Scanner in=new Scanner(System.in, "UTF-8");while(in.hasNextLine()){String[] p=in.nextLine().split("\\t",4);try{String value=new String(Base64.decode(p[3],2),StandardCharsets.UTF_8),result;switch(p[0]){case "seal":result=seal(value,p[1],p[2]);break;case "batch-seal":result=sealChunkBatch(value,p[1],p[2]);break;case "batch-unseal":result=unsealChunkBatch(value,p[1],p[2]);break;case "chunk":result=chunkText(value,p[1],p[2]);break;case "cache":result=new SyncWire().verifyCache(p[1],value);break;default:result=unseal(value,p[1],p[2]);}System.out.println(Base64.encodeToString(bytes(result),2));}catch(Exception e){System.out.println("REJECT");}}}
}`;
fs.writeFileSync(file,harness);
const key=crypto.randomBytes(32).toString("hex"),values=["", "Mixed Unicode 😀 雪\n".repeat(9000),crypto.randomBytes(120000).toString("base64")],jobs=[];
for(const value of values)for(const aad of ["request","response","pair-offer","pair-reply","blob:"+crypto.createHash("sha256").update(value).digest("hex")]){jobs.push({action:"seal",aad,value,expected:value});jobs.push({action:"unseal",aad,value:seal(value,key,aad),expected:value});}
jobs.push({action:"unseal",aad:"response",value:seal("secret",key,"request"),reject:true});
const nonce=crypto.randomBytes(16).toString("hex"),digest=value=>crypto.createHash("sha256").update(value).digest("hex");
const chunks=Array.from({length:4},()=>{const text=crypto.randomBytes(144*1024).toString("base64"),hash=digest(text);return {text,hash,packet:seal(text,key,"blob:"+hash)};});
const body=JSON.stringify({device:crypto.randomUUID(),chunks:chunks.map(({hash,packet})=>({hash,packet}))}),batch=sealChunkBatch(body,key,nonce);
jobs.push({action:"batch-seal",aad:nonce,value:body,expected:body},{action:"batch-unseal",aad:nonce,value:batch,expected:body});
for(const chunk of chunks)jobs.push({action:"chunk",aad:chunk.hash,value:chunk.packet,expected:chunk.text});
for(const value of [batch.replace("RCVSYNCB1","RCVSYNCB2"),batch.slice(0,-2)+"x}",batch.replace(nonce,"0".repeat(32)),batch.replace(/\n[a-f0-9]{64}\n/,"\n"+"0".repeat(64)+"\n"),seal(body,key,"response"),"x".repeat(2*1024*1024+1)])jobs.push({action:"batch-unseal",aad:nonce,value,reject:true});
jobs.push({action:"batch-seal",aad:nonce,value:"x".repeat(2*1024*1024),reject:true},{action:"batch-seal",aad:"bad-nonce",value:body,reject:true});
const tooLarge="x".repeat(256*1024+1),largeHash=digest(tooLarge),wrongHash="0".repeat(64);
jobs.push({action:"chunk",aad:largeHash,value:seal(tooLarge,key,"blob:"+largeHash),reject:true});
jobs.push({action:"chunk",aad:wrongHash,value:seal("checksum mismatch",key,"blob:"+wrongHash),reject:true});
jobs.push({action:"chunk",aad:chunks[0].hash,value:chunks[1].packet,reject:true});
jobs.push({action:"chunk",aad:chunks[0].hash,value:chunks[0].packet.slice(0,-4)+"AAAA",reject:true});
jobs.push({action:"cache",aad:"fixture",value:path.join(dir,"cache"),expected:"cache recovered"});
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,"bin",process.platform==="win32"?"java.exe":"java"):"java";
const result=spawnSync(java,[file],{input:jobs.map(j=>[j.action,key,j.aad,Buffer.from(j.value).toString("base64")].join("\t")).join("\n")+"\n",encoding:"utf8",maxBuffer:12*1024*1024,timeout:60000});
assert.equal(result.status,0,result.stderr||String(result.error));const replies=result.stdout.trim().split(/\r?\n/);assert.equal(replies.length,jobs.length);
jobs.forEach((j,i)=>{if(j.reject)return assert.equal(replies[i],"REJECT",j.action+" must reject malformed input");const reply=Buffer.from(replies[i],"base64").toString();assert.equal(j.action==="seal"?unseal(reply,key,j.aad):j.action==="batch-seal"?unsealChunkBatch(reply,key,j.aad):reply,j.expected);});
console.log("PASS actual Android and Windows codecs exchange empty, Unicode and large binary-text chunks; direction substitution fails closed");
console.log("PASS actual Android and Windows batch envelopes interoperate with four encrypted photo chunks, nonce/MAC/header/size validation and authenticated plaintext hash checks");
console.log("PASS actual Android atomic cache files stay encrypted, recover interrupted writes, preserve durable heads and leave no staging files");
