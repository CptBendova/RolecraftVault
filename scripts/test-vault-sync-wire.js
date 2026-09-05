/* Compile and execute the actual Android codec on the JVM, against Node's wire. */
const fs=require("fs"),path=require("path"),os=require("os"),assert=require("assert"),crypto=require("crypto"),{spawnSync}=require("child_process");
const {seal,unseal}=require("../app/vault-sync-transport");
const source=fs.readFileSync(path.join(__dirname,"../mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/VaultSyncPlugin.java"),"utf8");
function method(name){const start=source.search(new RegExp("    private static [^\\n]+ "+name+"\\("));assert(start>=0,name);let at=source.indexOf("{",start),depth=0,quote=false,escape=false;for(let i=at;i<source.length;i++){const c=source[i];if(quote){if(escape)escape=false;else if(c==="\\")escape=true;else if(c==='"')quote=false;}else if(c==='"')quote=true;else if(c==="{")depth++;else if(c==="}"&&--depth===0)return source.slice(start,i+1);}throw Error("Unclosed Java method");}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-wire-")),file=path.join(dir,"SyncWire.java");
const harness=`import java.io.*;import java.util.*;import java.util.zip.*;import java.nio.charset.StandardCharsets;import java.security.*;import javax.crypto.*;import javax.crypto.spec.*;
class SyncWire {
static final int MAX=2*1024*1024;
static class Base64 {static final int NO_WRAP=2;static byte[] decode(String s,int flags){return java.util.Base64.getDecoder().decode(s);}static String encodeToString(byte[] b,int flags){return java.util.Base64.getEncoder().encodeToString(b);}}
${["bytes","hex","unhex","random","read","seal","unseal"].map(method).join("\n")}
public static void main(String[] args)throws Exception{Scanner in=new Scanner(System.in, "UTF-8");while(in.hasNextLine()){String[] p=in.nextLine().split("\\t",4);try{String value=new String(Base64.decode(p[3],2),StandardCharsets.UTF_8);String result=p[0].equals("seal")?seal(value,p[1],p[2]):unseal(value,p[1],p[2]);System.out.println(Base64.encodeToString(bytes(result),2));}catch(Exception e){System.out.println("REJECT");}}}
}`;
fs.writeFileSync(file,harness);
const key=crypto.randomBytes(32).toString("hex"),values=["", "Mixed Unicode 😀 雪\n".repeat(9000),crypto.randomBytes(120000).toString("base64")],jobs=[];
for(const value of values)for(const aad of ["request","response","blob:"+crypto.createHash("sha256").update(value).digest("hex")]){jobs.push({action:"seal",aad,value,expected:value});jobs.push({action:"unseal",aad,value:seal(value,key,aad),expected:value});}
jobs.push({action:"unseal",aad:"response",value:seal("secret",key,"request"),reject:true});
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,"bin",process.platform==="win32"?"java.exe":"java"):"java";
const result=spawnSync(java,[file],{input:jobs.map(j=>[j.action,key,j.aad,Buffer.from(j.value).toString("base64")].join("\t")).join("\n")+"\n",encoding:"utf8",maxBuffer:12*1024*1024,timeout:60000});
assert.equal(result.status,0,result.stderr||String(result.error));const replies=result.stdout.trim().split(/\r?\n/);assert.equal(replies.length,jobs.length);
jobs.forEach((j,i)=>{if(j.reject)return assert.equal(replies[i],"REJECT");const reply=Buffer.from(replies[i],"base64").toString();assert.equal(j.action==="seal"?unseal(reply,key,j.aad):reply,j.expected);});
console.log("PASS actual Android and Windows codecs exchange empty, Unicode and large binary-text chunks; direction substitution fails closed");
