// Execute shipped Android byte helpers and lifecycle guards without provider calls.
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), {execFileSync} = require('child_process');
const root = path.join(__dirname, '..');
const base = path.join(root, 'mobile/android/app/src/main/java/com/cptbendova/rolecraftvault');
const source = fs.readFileSync(path.join(base, 'ImageGenerationPlugin.java'), 'utf8');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcv-image-java-'));
function block(signature) {
  const start = source.indexOf(signature); assert(start >= 0, signature);
  let end = source.indexOf('{', start) + 1, depth = 1;
  for (; depth && end < source.length; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
  assert.equal(depth, 0); return source.slice(start, end).replace(/@PluginMethod |@Override /g, '');
}
const methods = [
  'private static final class Session', 'private void available()', 'private JSObject ok()', 'private JSObject failed(',
  '@PluginMethod public synchronized void setUnlocked(', '@PluginMethod public synchronized void cancel(',
  'private synchronized void check(', 'private synchronized void stop(', 'private synchronized void cancelSession(',
  'private synchronized void finish(', 'private synchronized void success(', '@Override protected synchronized void handleOnPause()',
  '@Override protected synchronized void handleOnResume()', '@Override protected synchronized void handleOnDestroy()',
  'private String readLimited(', 'private static String httpError('
].map(block).join('\n');
const harness = `package com.cptbendova.rolecraftvault;
import java.io.*;import java.net.*;import java.nio.charset.StandardCharsets;import java.util.*;import java.util.concurrent.*;
class Plugin {protected void handleOnPause(){} protected void handleOnResume(){} protected void handleOnDestroy(){}}
public class ImageCheck extends Plugin {
  private final ExecutorService workers = Executors.newSingleThreadExecutor(), closers = Executors.newSingleThreadExecutor();
  private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
  private boolean unlocked, foreground=true, destroyed; private Session active;
  private Context context=new Context(); private Context getContext(){return context;}
  static class Context {String name="com.cptbendova.rolecraftvault.chat";String getPackageName(){return name;}}
  static class JSObject extends HashMap<String,Object> {}
  static class PluginCall {Map<String,Object> args=new HashMap<>();JSObject result;int resolved;
    PluginCall arg(String key,Object value){args.put(key,value);return this;}
    Boolean getBoolean(String key,boolean fallback){Object v=args.get(key);return v instanceof Boolean?(Boolean)v:fallback;}
    String getString(String key,String fallback){Object v=args.get(key);return v instanceof String?(String)v:fallback;}
    void resolve(JSObject value){result=value;resolved++;}}
  ${methods}
  interface Test {void run()throws Exception;}
  static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
  static void fails(Test fn){try{fn.run();throw new AssertionError("expected rejection");}catch(IOException expected){}catch(Exception other){throw new AssertionError(other);}}
  static String b64(byte[] bytes){return Base64.getEncoder().encodeToString(bytes);}
  static byte[] png(int length){byte[] bytes=new byte[length];byte[] magic={(byte)137,80,78,71,13,10,26,10};System.arraycopy(magic,0,bytes,0,8);byte[] ihdr={73,72,68,82};System.arraycopy(ihdr,0,bytes,12,4);return bytes;}
  Session begin(){Session session=new Session("fixture-id",new PluginCall());active=session;session.deadline=deadlines.schedule(()->{},5,TimeUnit.MINUTES);return session;}
  void unlock(){PluginCall call=new PluginCall().arg("unlocked",true);setUnlocked(call);check(Boolean.TRUE.equals(call.result.get("ok")),"unlock failed");}
  public static void main(String[] ignored)throws Exception{
    byte[] png=png(24);String reference="data:image/png;base64,"+b64(png);
    ImageGenerationCodec.Picture picture=ImageGenerationCodec.reference(reference);
    check(Arrays.equals(picture.bytes,png)&&picture.mime.equals("image/png")&&picture.dataUrl().equals(reference),"PNG roundtrip");
    check(ImageGenerationCodec.result(b64(new byte[]{(byte)255,(byte)216,(byte)255,1})).mime.equals("image/jpeg"),"JPEG sniff");
    byte[] webp="RIFF0000WEBPVP8 ".getBytes(StandardCharsets.US_ASCII);check(ImageGenerationCodec.result(b64(webp)).mime.equals("image/webp"),"WebP sniff");
    fails(()->ImageGenerationCodec.reference("https://example.invalid/image.png"));
    fails(()->ImageGenerationCodec.reference(reference.replace("image/png","image/jpeg")));
    fails(()->ImageGenerationCodec.reference("data:image/svg+xml;base64,"+b64("<svg/>".getBytes())));
    fails(()->ImageGenerationCodec.result(b64("<html>bad</html>".getBytes())));
    fails(()->ImageGenerationCodec.result(b64(png)+" "));
    fails(()->ImageGenerationCodec.decode("AAA=AAAA",100));
    fails(()->ImageGenerationCodec.decode("AAA!",100));
    fails(()->ImageGenerationCodec.decode("AAAA",2));
    fails(()->ImageGenerationCodec.decode("A",100));
    check(ImageGenerationCodec.reference("data:image/png;base64,"+b64(png(ImageGenerationCodec.MAX_REFERENCE))).bytes.length==ImageGenerationCodec.MAX_REFERENCE,"reference boundary");
    fails(()->ImageGenerationCodec.reference("data:image/png;base64,"+b64(png(ImageGenerationCodec.MAX_REFERENCE+1))));
    fails(()->ImageGenerationCodec.result(b64(png(ImageGenerationCodec.MAX_RESULT+1))));
    check(ImageGenerationCodec.prompt("  a portrait  ").equals("a portrait"),"prompt trim");
    fails(()->ImageGenerationCodec.prompt(" "));fails(()->ImageGenerationCodec.prompt("a".repeat(8001)));
    ImageGenerationCodec.model("openai","gpt-image-2.5-sunburst");ImageGenerationCodec.model("openai","gpt-image-2.5-flare");ImageGenerationCodec.model("openai","gpt-image-2");
    ImageGenerationCodec.model("xai","grok-imagine-image-2.0");
    fails(()->ImageGenerationCodec.provider("https://evil.invalid"));fails(()->ImageGenerationCodec.model("xai","gpt-image-2"));
    fails(()->ImageGenerationCodec.model("openai","unlisted-image-model"));
    check(ImageGenerationCodec.shape("portrait","standard",true).equals("1024x1536")&&ImageGenerationCodec.shape("landscape","standard",false).equals("3:2"),"shapes");
    fails(()->ImageGenerationCodec.shape("8k","standard",true));fails(()->ImageGenerationCodec.quality("high",false,"grok-imagine-image-2.0"));
    check(ImageGenerationCodec.quality("high",true,"gpt-image-2").equals("high"),"OpenAI high supported");
    for(String model:new String[]{"gpt-image-2.5-sunburst","gpt-image-2.5-flare"})for(String quality:new String[]{"xhigh","max"})check(ImageGenerationCodec.quality(quality,true,model).equals(quality),"2.5 quality");
    fails(()->ImageGenerationCodec.quality("xhigh",true,"gpt-image-2"));fails(()->ImageGenerationCodec.quality("max",true,"gpt-image-2"));fails(()->ImageGenerationCodec.quality("max",false,"grok-imagine-image-2.0"));
    String[] shapes={"square","portrait","landscape","wide","tall"},ratios={"1:1","2:3","3:2","16:9","9:16"};
    String[][] expected={{"1024x1024","1024x1536","1536x1024","1536x864","864x1536"},{"2048x2048","1344x2016","2016x1344","2048x1152","1152x2048"},{"2880x2880","2336x3504","3504x2336","3840x2160","2160x3840"}};
    String[] resolutions={"standard","2k","max"};
    for(int r=0;r<resolutions.length;r++)for(int s=0;s<shapes.length;s++){
      String dimensions=ImageGenerationCodec.shape(shapes[s],resolutions[r],true);check(dimensions.equals(expected[r][s]),"exact resolution");
      String[] parts=dimensions.split("x");int w=Integer.parseInt(parts[0]),h=Integer.parseInt(parts[1]);
      check(w%16==0&&h%16==0&&Math.max(w,h)<=3840&&w*h>=655360&&w*h<=8294400&&Math.max(w,h)<=3*Math.min(w,h),"provider size constraints");
      String[] ratio=ratios[s].split(":");check(w*Integer.parseInt(ratio[1])==h*Integer.parseInt(ratio[0]),"exact requested aspect ratio");
      if(r<2)check(ImageGenerationCodec.shape(shapes[s],resolutions[r],false).equals(ratios[s]),"xAI aspect ratio");
    }
    check(ImageGenerationCodec.resolution("standard",false).equals("1k")&&ImageGenerationCodec.resolution("2k",false).equals("2k"),"xAI resolution");
    fails(()->ImageGenerationCodec.shape("portrait","max",false));fails(()->ImageGenerationCodec.shape("portrait","4k",true));fails(()->ImageGenerationCodec.resolution("custom",true));
    String form=new String(ImageGenerationCodec.multipart("boundary","gpt-image-2.5-sunburst","café 🦊",ImageGenerationCodec.shape("portrait","max",true),"xhigh",new ImageGenerationCodec.Picture[]{picture,picture}),StandardCharsets.UTF_8);
    check(form.split(java.util.regex.Pattern.quote("name=\\\"image[]\\\""),-1).length-1==2,"OpenAI multi-image field");
    check(form.contains("café 🦊")&&form.contains("name=\\\"n\\\"\\r\\n\\r\\n1")&&form.endsWith("--boundary--\\r\\n"),"multipart Unicode/n/terminator");
    check(form.contains("name=\\\"size\\\"\\r\\n\\r\\n2336x3504")&&form.contains("name=\\\"quality\\\"\\r\\n\\r\\nxhigh"),"max size/quality forwarded in edits");
    ImageCheck app=new ImageCheck();fails(app::available);app.unlock();
    Session completed=app.begin();app.success(completed,app.ok());check(completed.call.resolved==1&&app.active==null&&completed.deadline.isCancelled(),"success cleanup");
    Session wrong=app.begin();app.cancel(new PluginCall().arg("requestId","other-id"));check(app.active==wrong,"cancel cannot affect another identity");
    app.cancel(new PluginCall().arg("requestId",wrong.id));check(wrong.cancelled&&wrong.call.resolved==1&&wrong.deadline.isCancelled(),"cancel cleanup");
    fails(()->app.success(wrong,app.ok()));check(wrong.call.resolved==1,"late response cannot resolve twice");
    Session locked=app.begin();app.setUnlocked(new PluginCall().arg("unlocked",false));fails(app::available);check(locked.cancelled&&!Boolean.TRUE.equals(locked.call.result.get("ok")),"lock cancels");
    app.unlock();Session paused=app.begin();app.handleOnPause();check(paused.cancelled&&app.active==null,"background cancels");
    PluginCall hidden=new PluginCall().arg("unlocked",true);app.setUnlocked(hidden);check(Boolean.FALSE.equals(hidden.result.get("ok")),"background cannot unlock");
    app.handleOnResume();fails(app::available);app.unlock();
    Session reading=app.begin();check(app.readLimited(reading,new ByteArrayInputStream("hello".getBytes()),ImageGenerationCodec.MAX_RESPONSE).equals("hello"),"bounded response read");
    fails(()->app.readLimited(reading,new ByteArrayInputStream(new byte[ImageGenerationCodec.MAX_RESPONSE+1]),ImageGenerationCodec.MAX_RESPONSE));
    check(app.readLimited(reading,null,65536).equals(""),"missing error body");
    check(app.readLimited(reading,new ByteArrayInputStream(new byte[65536]),65536).length()==65536,"error body at cap");
    fails(()->app.readLimited(reading,new ByteArrayInputStream(new byte[65537]),65536));
    app.cancelSession(reading,"timeout");check(reading.call.resolved==1&&reading.cancelled,"deadline cancels");
    fails(()->app.readLimited(reading,new ByteArrayInputStream(new byte[]{1}),65536));
    String failure=ImageGenerationCodec.providerFailure(400,"openai",httpError(400),"Invalid size '2336x3504': choose a supported size.","invalid_value","invalid_request_error","size","req_fixture");
    for(String detail:new String[]{"HTTP 400","2336x3504","Code: invalid_value","Type: invalid_request_error","Parameter: size","Request ID: req_fixture"})check(failure.contains(detail),"preserved error field "+detail);
    String secret="fixture-private-key-do-not-use",prompt="A secret character prompt",sensitive=secret+" "+prompt+" "+reference+" https://private.invalid/path Bearer hidden-key sk-masked***suffix "+"A".repeat(120);
    failure=ImageGenerationCodec.providerFailure(400,"openai",httpError(400),sensitive,secret,secret,secret,secret,secret,prompt);
    for(String value:new String[]{secret,prompt,reference,"private.invalid","hidden-key","masked","A".repeat(80)})check(!failure.contains(value),"redacted "+value);
    for(String code:new String[]{"moderation_blocked","content_policy_violation","safety_violation"}){
      failure=ImageGenerationCodec.providerFailure(400,"openai",httpError(400),"unnecessary moderation content",code,"","","");
      check(failure.contains("image safety policy")&&failure.contains(code)&&!failure.contains("unnecessary"),"policy distinction");
    }
    failure=ImageGenerationCodec.providerFailure(401,"openai",httpError(401),"unknown partly masked credential","","","","");
    check(!failure.contains("partly masked"),"no raw auth explanation");
    failure=ImageGenerationCodec.providerFailure(422,"xai",httpError(422),"Choose a smaller size. ".repeat(100),"","","","");
    check(failure.startsWith("xAI (HTTP 422)")&&failure.length()<1300,"bounded provider message");
    failure=ImageGenerationCodec.providerFailure(400,"openai",httpError(400),null,"bad code","", "<image>","https://private.invalid");
    check(failure.contains("No safe provider explanation")&&!failure.contains("bad code")&&!failure.contains("<image>")&&!failure.contains("private.invalid"),"malformed fields safe");
    app.context.name="com.cptbendova.rolecraftvault";fails(app::available);PluginCall standard=new PluginCall().arg("unlocked",true);app.setUnlocked(standard);check(Boolean.FALSE.equals(standard.result.get("ok")),"standard package cannot enable API");
    check(httpError(302).contains("blocked")&&httpError(401).contains("key")&&httpError(429).contains("credit"),"actionable failures");
    app.handleOnDestroy();fails(app::available);
    System.out.println("PASS Android real image codec, formats/limits, multi-image multipart, model allowlists, lock/background/cancel/deadline guards and bounded response reads");
  }
}`;
try {
  const dir = path.join(temp, 'com/cptbendova/rolecraftvault'); fs.mkdirSync(dir, {recursive: true});
  fs.copyFileSync(path.join(base, 'ImageGenerationCodec.java'), path.join(dir, 'ImageGenerationCodec.java'));
  fs.writeFileSync(path.join(dir, 'ImageCheck.java'), harness);
  execFileSync('javac', ['-encoding', 'UTF-8', '-d', temp, path.join(dir, 'ImageGenerationCodec.java'), path.join(dir, 'ImageCheck.java')], {windowsHide: true});
  console.log(execFileSync('java', ['-cp', temp, 'com.cptbendova.rolecraftvault.ImageCheck'], {encoding: 'utf8', windowsHide: true}).trim());
  assert(source.includes('setInstanceFollowRedirects(false)'));
  assert(source.includes('readLimited(session, connection.getErrorStream(), 65536)'));
  assert(source.includes('ImageGenerationCodec.providerFailure(code, provider, httpError(code)'));
  assert(source.includes('return value instanceof String ? (String) value : "";'));
  assert(source.includes('private static final int TIMEOUT_MS = 300000;'));
  assert(source.includes('outbound.put("response_format", "b64_json")'));
  assert(source.includes('outbound.put("image", refs.getJSONObject(0))') && source.includes('outbound.put("images", refs)'));
  assert(source.includes('Boolean.FALSE.equals(result.opt("respect_moderation"))') && source.includes('Boolean.FALSE.equals(image.opt("respect_moderation"))'));
  assert(source.includes('if (count > 4)') && source.includes('total > ImageGenerationCodec.MAX_REFERENCES'));
  assert(!/getString\("(url|host|endpoint)"/.test(source), 'renderer cannot choose a destination');
  assert(source.includes('"https://api.openai.com/v1/images/"') && source.includes('"https://api.x.ai/v1/images/"'));
} finally { fs.rmSync(temp, {recursive: true, force: true}); }
