// Compile the shipped Android start method with a rejecting worker queue.
// An unscheduled request must reject its start call and leave no pending reply.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/OpenRouterPlugin.java'), 'utf8');
const start = source.indexOf('private synchronized void startReady(');
assert(start >= 0, 'Android startReady method');
let end = source.indexOf('{', start) + 1;
let depth = 1;
while (depth && end < source.length) {
  if (source[end] === '{') depth++;
  if (source[end] === '}') depth--;
  end++;
}
assert.strictEqual(depth, 0, 'complete Android startReady method');
const method = source.slice(start, end);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcv-chat-native-start-'));
try {
  const java = `import java.util.*;
import java.util.concurrent.*;
import java.nio.charset.StandardCharsets;
class StartCheck {
  private ExecutorService workers = new TestExecutor(true);
  private final Set<String> pending = ConcurrentHashMap.newKeySet();
  private boolean foreground = true;
  private int foregroundEpoch;
  private static final int MAX_BODY = 16 * 1024 * 1024;
  private boolean canRequest(int run) { return foreground && run == foregroundEpoch && !workers.isShutdown(); }
  private void stream(String id, byte[] body, int run, boolean memoryRequest) {}
  private JSONObject memoryResponseFormat() { return new JSONObject(); }
  private String safeMessage(Exception error, String fallback) { return error.getMessage() == null ? fallback : error.getMessage(); }
  ${method}
  static class TestExecutor extends AbstractExecutorService {
    final boolean reject;
    TestExecutor(boolean reject) { this.reject = reject; }
    public void execute(Runnable task) { if (reject) throw new RejectedExecutionException("fixture"); task.run(); }
    public boolean isShutdown() { return false; }
    public boolean isTerminated() { return false; }
    public void shutdown() {}
    public List<Runnable> shutdownNow() { return Collections.emptyList(); }
    public boolean awaitTermination(long timeout, TimeUnit unit) { return false; }
  }
  static class JSONObject {
    final Map<String, Object> values = new HashMap<>();
    JSONObject put(String key, Object value) { values.put(key, value); return this; }
    String getString(String key, String fallback) { Object value = values.get(key); return value instanceof String ? (String)value : fallback; }
    String optString(String key, String fallback) { return getString(key, fallback); }
    String optString(String key) { return getString(key, ""); }
    Object opt(String key) { return values.get(key); }
    boolean has(String key) { return values.containsKey(key); }
    boolean isNull(String key) { return values.get(key) == null; }
    JSONArray optJSONArray(String key) { Object value = values.get(key); return value instanceof JSONArray ? (JSONArray)value : null; }
    double optDouble(String key, double fallback) { Object value = values.get(key); return value instanceof Number ? ((Number)value).doubleValue() : fallback; }
    int optInt(String key, int fallback) { Object value = values.get(key); return value instanceof Number ? ((Number)value).intValue() : fallback; }
    public String toString() { return "{}"; }
  }
  static class JSONArray {
    final List<JSONObject> values = new ArrayList<>();
    JSONArray put(JSONObject value) { values.add(value); return this; }
    int length() { return values.size(); }
    JSONObject getJSONObject(int index) { return values.get(index); }
  }
  static class JSObject extends JSONObject {}
  static class PluginCall {
    final JSObject request;
    boolean resolved;
    String error;
    PluginCall(JSObject request) { this.request = request; }
    JSObject getObject(String key) { return request; }
    void resolve(JSObject value) { resolved = true; }
    void reject(String value) { error = value; }
  }
  static void check(boolean value, String label) { if (!value) throw new AssertionError(label); }
  public static void main(String[] args) {
    StartCheck check = new StartCheck();
    JSObject request = new JSObject();
    request.put("model", "test/model");
    request.put("messages", new JSONArray().put(new JSONObject().put("role", "user").put("content", "hello")));
    PluginCall failed = new PluginCall(request);
    check.startReady(failed, 0);
    check(!failed.resolved && failed.error != null, "worker rejection must reject start");
    check(check.pending.isEmpty(), "worker rejection must clear pending request");
    check.workers = new TestExecutor(false);
    PluginCall accepted = new PluginCall(request);
    check.startReady(accepted, 0);
    check(accepted.resolved && accepted.error == null, "accepted worker starts normally");
    check.pending.clear(); // The harness stream stub does not finish a scheduled reply.
    request.put("model", "~deepseek/deepseek-pro-latest");
    PluginCall latestAlias = new PluginCall(request);
    check.startReady(latestAlias, 0);
    check(latestAlias.resolved && latestAlias.error == null, "OpenRouter latest-model alias must be accepted unchanged");
    check.pending.clear();
    for (String invalid : new String[] { "deepseek/~deepseek-pro-latest", "~deepseek/deepseek-pro-latest~", "~~deepseek/deepseek-pro-latest" }) {
      request.put("model", invalid);
      PluginCall rejected = new PluginCall(request);
      check.startReady(rejected, 0);
      check(!rejected.resolved && rejected.error != null, "a tilde is allowed only as one leading alias prefix: " + invalid);
    }
    System.out.println("PASS Android start rejects unscheduled reply without leaving pending state");
  }
}`;
  const file = path.join(tmp, 'StartCheck.java');
  fs.writeFileSync(file, java);
  execFileSync('javac', ['-encoding', 'UTF-8', '-d', tmp, file], { windowsHide: true, timeout: 15000 });
  console.log(execFileSync('java', ['-cp', tmp, 'StartCheck'], { encoding: 'utf8', windowsHide: true, timeout: 15000 }).trim());
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
