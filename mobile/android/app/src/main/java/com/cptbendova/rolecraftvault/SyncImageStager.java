package com.cptbendova.rolecraftvault;

import java.io.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Native-only preparation. No plaintext file, vault write, network or retained key. */
final class SyncImageStager {
    static final int PART = 192 * 1024, LIMIT = 128 * 1024 * 1024;
    interface Sink { void check() throws Exception; String put(String text) throws Exception; }
    static final class Result {
        final String hash; final long bytes; final List<String> parts;
        Result(String hash, long bytes, List<String> parts) { this.hash=hash;this.bytes=bytes;this.parts=parts; }
    }
    static String hex(byte[] bytes) {
        char[] alphabet="0123456789abcdef".toCharArray(),out=new char[bytes.length*2];
        for(int i=0;i<bytes.length;i++){out[2*i]=alphabet[(bytes[i]&255)>>>4];out[2*i+1]=alphabet[bytes[i]&15];}
        return new String(out);
    }
    static Result prepare(File root, String record, String path, String prefix, byte[][] keys, Sink sink) throws Exception {
        byte[] sealed=null,plain=null;
        try {
            sink.check();
            if(record==null||!record.matches("(?:img|th):[^\\r\\n/\\\\]{1,512}"))throw new IOException("Invalid picture key");
            String encoded=URLEncoder.encode(record,"UTF-8").replace("+","%20").replace("%21","!").replace("%27","'").replace("%28","(").replace("%29",")").replace("%7E","~");
            File file=new File(root.getParentFile(),path).getCanonicalFile();
            if(!file.getParentFile().equals(root.getCanonicalFile())||!(file.getName().equals(encoded)||file.getName().startsWith(encoded+".")))throw new IOException("Invalid picture storage path");
            if(file.length()<33||file.length()>LIMIT+33L)throw new IOException("Picture exceeds the safe sync size or is truncated");
            if(prefix!=null&&(!prefix.matches("(?i)data:image/[A-Za-z0-9.+-]+(?:;[^,\\r\\n]*)?;base64,")||!StandardCharsets.US_ASCII.newEncoder().canEncode(prefix)||prefix.length()>1024))throw new IOException("Unsupported picture prefix");
            sealed=Files.readAllBytes(file.toPath());sink.check();
            if(sealed.length<33||sealed.length>LIMIT+33L||sealed[0]!=82||sealed[1]!=67||sealed[2]!=86||sealed[3]!=83||sealed[4]!=49)throw new IOException("Invalid encrypted picture");
            Exception failure=null;
            for(byte[] key:keys){
                if(key==null||key.length!=32)continue;
                try{Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,Arrays.copyOfRange(sealed,5,17)));plain=cipher.doFinal(sealed,17,sealed.length-17);break;}catch(Exception error){failure=error;}
            }
            if(plain==null)throw new IOException("Could not authenticate the saved picture",failure);
            sink.check();
            // Authenticate the entire source before creating any advertised pieces.
            ChunkOutput output=new ChunkOutput(sink);
            if(prefix!=null){
                output.write(prefix.getBytes(StandardCharsets.UTF_8));
                try(OutputStream base64=Base64.getEncoder().wrap(output)){for(int at=0;at<plain.length;at+=PART){sink.check();base64.write(plain,at,Math.min(PART,plain.length-at));}}
            }else{
                // Legacy bin: stores the exact UTF-8 data URL, not the binary photo.
                // Non-ASCII legacy data is handled by the existing JS text splitter.
                for(byte b:plain)if(b<0)return null;
                String start=new String(plain,0,Math.min(1024,plain.length),StandardCharsets.US_ASCII);
                if(!start.startsWith("data:image/"))return null;
                for(int at=0;at<plain.length;at+=PART){sink.check();output.write(plain,at,Math.min(PART,plain.length-at));}
                output.close();
            }
            sink.check();return output.result();
        }finally{
            if(sealed!=null)Arrays.fill(sealed,(byte)0);
            if(plain!=null)Arrays.fill(plain,(byte)0);
            for(byte[] key:keys)if(key!=null)Arrays.fill(key,(byte)0);
        }
    }
    private static final class ChunkOutput extends OutputStream {
        final Sink sink; final MessageDigest digest; final byte[] buffer=new byte[PART]; final List<String> parts=new ArrayList<>();
        int used=0; long length=0; boolean closed=false;
        ChunkOutput(Sink sink)throws Exception{this.sink=sink;digest=MessageDigest.getInstance("SHA-256");}
        public void write(int b)throws IOException{byte[] one={(byte)b};write(one,0,1);}
        public void write(byte[] bytes,int offset,int count)throws IOException{
            if(closed)throw new IOException("Preparation already closed");
            if(length+count>LIMIT)throw new IOException("Picture exceeds the safe sync size");
            digest.update(bytes,offset,count);length+=count;
            while(count>0){int n=Math.min(PART-used,count);System.arraycopy(bytes,offset,buffer,used,n);used+=n;offset+=n;count-=n;if(used==PART)flushPart();}
        }
        private void flushPart()throws IOException{
            if(used==0)return;
            try{sink.check();String text=new String(buffer,0,used,StandardCharsets.US_ASCII),hash=sink.put(text);if(hash==null||!hash.matches("[a-f0-9]{64}"))throw new IOException("Invalid prepared chunk");parts.add(hash);Arrays.fill(buffer,0,used,(byte)0);used=0;}catch(Exception e){throw e instanceof IOException?(IOException)e:new IOException("Picture preparation stopped",e);}
        }
        public void close()throws IOException{if(!closed){flushPart();closed=true;}}
        Result result()throws IOException{if(!closed)throw new IOException("Incomplete picture preparation");return new Result(hex(digest.digest()),length,parts);}
    }
}
