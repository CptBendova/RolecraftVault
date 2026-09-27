// Execute the shipped Android validation and lifecycle without real credentials.
const fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert"), { execFileSync } = require("child_process");
const root = path.join(__dirname, ".."), base = path.join(root, "mobile/android/app/src/main/java/com/cptbendova/rolecraftvault");
const source = fs.readFileSync(path.join(base, "ProviderBalancesPlugin.java"), "utf8");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-balances-java-"));
function block(signature) {
  const start = source.indexOf(signature); assert(start >= 0, signature);
  let end = source.indexOf("{", start) + 1, depth = 1;
  for (; depth && end < source.length; end++) { if (source[end] === "{") depth++; if (source[end] === "}") depth--; }
  assert.equal(depth, 0); return source.slice(start, end).replace(/@PluginMethod |@Override /g, "");
}
const methods = ["private static final class Session", "private void available()", "private JSObject ok()", "private JSObject failed(",
  "@PluginMethod public synchronized void setUnlocked(", "@PluginMethod public synchronized void cancel(", "private synchronized void check(", "private synchronized void stop(",
  "private synchronized void cancelSession(", "private synchronized void finish(", "private synchronized void success(", "@Override protected synchronized void handleOnPause()",
  "@Override protected synchronized void handleOnResume()", "@Override protected synchronized void handleOnDestroy()", "private String readLimited(", "private JSObject summary("].map(block).join("\n");
const harness = `package com.cptbendova.rolecraftvault;
import java.io.*;import java.net.*;import java.nio.charset.StandardCharsets;import java.util.*;import java.util.concurrent.*;
class Plugin {protected void handleOnPause(){} protected void handleOnResume(){} protected void handleOnDestroy(){}}
public class BalanceCheck extends Plugin {
  private static final int MAX_RESPONSE=65536;
  private final ExecutorService workers=Executors.newSingleThreadExecutor(),closers=Executors.newSingleThreadExecutor();
  private final ScheduledExecutorService deadlines=Executors.newSingleThreadScheduledExecutor();
  private boolean unlocked,destroyed,foreground=true;private Session active;
  static class Context {String name="com.cptbendova.rolecraftvault.chat";String getPackageName(){return name;}}
  private Context context=new Context();private Context getContext(){return context;}
  static class JSObject extends HashMap<String,Object>{}
  static class JSONObject extends HashMap<String,Object>{
    static final Object NULL=new Object();JSONObject set(String k,Object v){put(k,v);return this;}
    JSONObject optJSONObject(String k){Object v=get(k);return v instanceof JSONObject?(JSONObject)v:null;}
    boolean has(String k){return containsKey(k);}boolean isNull(String k){return get(k)==null||get(k)==NULL;}Object opt(String k){return get(k);}
  }
  static class PluginCall{Map<String,Object> args=new HashMap<>();JSObject result;int resolved;
    PluginCall arg(String key,Object value){args.put(key,value);return this;}
    Boolean getBoolean(String key,boolean fallback){Object v=args.get(key);return v instanceof Boolean?(Boolean)v:fallback;}
    String getString(String key,String fallback){Object v=args.get(key);return v instanceof String?(String)v:fallback;}
    void resolve(JSObject value){result=value;resolved++;}}
  ${methods}
  interface Test{void run()throws Exception;}
  static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
  static void fails(Test fn){try{fn.run();throw new AssertionError("expected rejection");}catch(IOException expected){}catch(Exception error){throw new AssertionError(error);}}
  void unlock(){PluginCall call=new PluginCall().arg("unlocked",true);setUnlocked(call);check(Boolean.TRUE.equals(call.result.get("ok")),"unlock");}
  Session begin(){Session s=new Session("fixture-id",new PluginCall());active=s;s.deadline=deadlines.schedule(()->{},30,TimeUnit.SECONDS);return s;}
  public static void main(String[] args)throws Exception{
    BalanceCheck app=new BalanceCheck();
    check(ProviderBalancesCodec.amount(0,true,false)==0,"zero");check(ProviderBalancesCodec.amount(null,true,false)==null,"nullable");
    check(ProviderBalancesCodec.amount(-0.1,true,true)==-0.1,"negative remaining retained");
    fails(()->ProviderBalancesCodec.amount(null,false,false));fails(()->ProviderBalancesCodec.amount("10",true,false));
    fails(()->ProviderBalancesCodec.amount(Double.NaN,true,false));fails(()->ProviderBalancesCodec.amount(Double.POSITIVE_INFINITY,true,false));
    fails(()->ProviderBalancesCodec.amount(-1,false,false));fails(()->ProviderBalancesCodec.amount(1e20,false,false));
    for(String provider:new String[]{"openrouter","openai","xai"})check(ProviderBalancesCodec.dashboard(provider).startsWith("https:"),"fixed HTTPS billing");
    fails(()->ProviderBalancesCodec.dashboard("https://evil.invalid"));fails(()->ProviderBalancesCodec.dashboard("constructor"));
    JSONObject data=new JSONObject().set("limit",10).set("limit_remaining",2.25).set("usage",17.75).set("limit_reset","monthly").set("label","sk-secret-label");
    JSObject result=app.summary(new JSONObject().set("data",data));
    check(result.get("accountBalance")==JSONObject.NULL&&result.get("remaining").equals(2.25)&&result.get("usage").equals(17.75),"allowance is not balance");
    check(!result.toString().contains("secret")&&!result.containsKey("label"),"only projected fields");
    data.set("limit",JSONObject.NULL).set("limit_remaining",JSONObject.NULL);result=app.summary(new JSONObject().set("data",data));check(result.get("limit")==JSONObject.NULL,"no key cap");
    data.set("limit_remaining",0);fails(()->app.summary(new JSONObject().set("data",data)));
    fails(()->app.summary(new JSONObject().set("data",new JSONObject())));fails(()->app.summary(new JSONObject()));
    fails(app::available);app.unlock();Session s=app.begin();app.success(s,app.ok());check(s.call.resolved==1&&app.active==null&&s.deadline.isCancelled(),"success cleanup");
    s=app.begin();app.cancel(new PluginCall().arg("requestId","wrong"));check(app.active==s,"cancel bound to identity");app.cancel(new PluginCall().arg("requestId",s.id));check(s.cancelled&&s.call.resolved==1&&s.deadline.isCancelled(),"cancel cleanup");
    final Session cancelled=s;fails(()->app.success(cancelled,app.ok()));check(s.call.resolved==1,"late result rejected");
    s=app.begin();app.setUnlocked(new PluginCall().arg("unlocked",false));check(s.cancelled,"lock cancels");fails(app::available);
    app.unlock();s=app.begin();app.handleOnPause();check(s.cancelled,"background cancels");PluginCall hidden=new PluginCall().arg("unlocked",true);app.setUnlocked(hidden);check(Boolean.FALSE.equals(hidden.result.get("ok")),"cannot unlock background");
    app.handleOnResume();fails(app::available);app.unlock();
    final Session reading=app.begin();check(app.readLimited(reading,new ByteArrayInputStream("hello".getBytes())).equals("hello"),"read");
    check(app.readLimited(reading,new ByteArrayInputStream(new byte[65536])).length()==65536,"bounded read exact cap");fails(()->app.readLimited(reading,new ByteArrayInputStream(new byte[65537])));fails(()->app.readLimited(reading,null));
    app.cancelSession(reading,"deadline");fails(()->app.readLimited(reading,new ByteArrayInputStream(new byte[1])));
    app.context.name="com.cptbendova.rolecraftvault";fails(app::available);app.context.name="com.cptbendova.rolecraftvault.chat";
    app.handleOnDestroy();fails(app::available);check(app.workers.isShutdown()&&app.deadlines.isShutdown()&&app.closers.isShutdown(),"shutdown");
    System.out.println("PASS Android balance codec and actual lifecycle: strict numeric/null projection, secret omission, locked/background/private edition, cancellation/late results, response bounds");
  }
}`;
try {
  const dir = path.join(temp, "com/cptbendova/rolecraftvault"); fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(base, "ProviderBalancesCodec.java"), path.join(dir, "ProviderBalancesCodec.java")); fs.writeFileSync(path.join(dir, "BalanceCheck.java"), harness);
  execFileSync("javac", ["-encoding", "UTF-8", "-d", temp, path.join(dir, "ProviderBalancesCodec.java"), path.join(dir, "BalanceCheck.java")], { windowsHide: true });
  console.log(execFileSync("java", ["-cp", temp, "com.cptbendova.rolecraftvault.BalanceCheck"], { encoding: "utf8", windowsHide: true }).trim());
  assert(source.includes('new URL("https://openrouter.ai/api/v1/key")'));
  assert(source.includes('setInstanceFollowRedirects(false)') && source.includes('setRequestMethod("GET")'));
  assert(source.includes('TIMEOUT_MS = 20000') && source.includes('deadlines.schedule('));
  assert(!/getString\("(url|host|endpoint)"/.test(source));
  assert(source.includes('store.getKey("rolecraft-private-chat-openrouter-v1", null)') && source.includes('synchronized (CredentialShare.WRITE_LOCK)'));
  assert(!source.includes("KeyGenerator") && !source.includes("getErrorStream"), "read-only existing credential; provider error bodies never exposed");
  assert(fs.readFileSync(path.join(base, "MainActivity.java"), "utf8").includes("registerPlugin(ProviderBalancesPlugin.class)"));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
