// Execute the actual native Java wire helpers against the shipped Windows helpers.
const fs=require("fs"),path=require("path"),os=require("os"),crypto=require("crypto"),assert=require("assert"),{execFileSync}=require("child_process");
const {seal,unseal}=require("../app/chat-link-server");
const source=fs.readFileSync(path.join(__dirname,"../mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/ChatLinkPlugin.java"),"utf8");
function method(name){const start=source.indexOf(name);if(start<0)throw Error("Missing Java helper "+name);const brace=source.indexOf("{",start);let depth=1,end=brace+1;for(;depth&&end<source.length;end++){if(source[end]==="{")depth++;if(source[end]==="}")depth--;}if(depth)throw Error("Unbalanced Java helper");return source.slice(start,end);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-chat-wire-java-"));
try{
  const helpers=["private static byte[] bytes(","private static byte[] unhex(","private static byte[] read(","private static String encrypt(","private static String decrypt(","private static boolean privateIp("].map(method).join("\n");
  const shim="static class Base64 {static final int NO_WRAP=0;static String encodeToString(byte[] b,int ignored){return java.util.Base64.getEncoder().encodeToString(b);}static byte[] decode(String s,int ignored){return java.util.Base64.getDecoder().decode(s);}}";
  fs.writeFileSync(path.join(tmp,"WireCheck.java"),"import java.io.*;import java.nio.charset.StandardCharsets;import java.security.*;import java.util.*;import java.util.zip.*;import javax.crypto.*;import javax.crypto.spec.*;public class WireCheck {private static final int LIMIT=64*1024*1024;"+shim+helpers+"public static void main(String[] args)throws Exception{String text=new String(java.util.Base64.getDecoder().decode(args[1]),StandardCharsets.UTF_8);if(!decrypt(args[2],unhex(args[0])).equals(text))throw new AssertionError(\"Windows to Android mismatch\");if(privateIp(\"127.0.0.1\")||privateIp(\"8.8.8.8\")||privateIp(\"192.168.1.999\")||!privateIp(\"192.168.1.2\"))throw new AssertionError(\"LAN guard\");System.out.print(encrypt(text,unhex(args[0])));}}", "utf8");
  execFileSync("javac",["-encoding","UTF-8",path.join(tmp,"WireCheck.java")],{stdio:"pipe",windowsHide:true});
  const key=crypto.randomBytes(32).toString("hex"),sample=JSON.stringify({writing:"An elf 🧝 says: café, 中文.\nSafe memories.",history:Array(150).fill("Preserve the whole story.")});
  const packet=execFileSync("java",["-cp",tmp,"WireCheck",key,Buffer.from(sample).toString("base64"),seal(sample,key,"response")],{encoding:"utf8",windowsHide:true}).trim();
  assert.equal(unseal(packet,key,"request"),sample);
  assert(source.includes('setInstanceFollowRedirects(false)')&&source.includes('unlocked(call,')&&source.includes('handleOnPause(){pauseWork();}'));
  assert(source.includes('first instanceof ProtocolException'),'a reachable locked/busy peer must not be misreported as a discovery timeout');
  assert(source.includes('SNAPSHOT_LIMIT=48*1024*1024') && source.includes('call.getString("hash","")') && source.includes('retry.put("needSnapshot",true)'), 'Android accepts bounded larger snapshots and hash-only unchanged polls');
  assert(source.includes('hostHash.equals(acks.optString(i))') && source.includes('if(!alreadySaved)'), 'acknowledged Windows histories must not cross the Android bridge on every poll');
  console.log("PASS: real Android/Windows gzip AES-GCM wire compatibility, Unicode and native LAN restrictions");
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
