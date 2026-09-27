"use strict";
const assert = require("assert").strict;
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const { EventEmitter } = require("events");
const { execFileSync } = require("child_process");
const { setupOpenRouterIpc, validateCoordinatorRequest, readCoordinatorAnswer } = require(path.join(__dirname, "..", "app", "openrouter.js"));

const cast = [
  { key: '["a",""]', name: "Irethia", presence: "present", knowledge: "Heard the warning" },
  { key: '["b",""]', name: "Selinde", presence: "away", knowledge: "Knows about the bridge" },
];
const request = {
  optIn: true,
  model: "google/gemini-3.8-flash",
  requireZdr: true,
  state: {
    location: "Old bridge", scene: "The bridge collapsed; Irethia was injured.",
    memory: "An earlier battle left the party short of supplies.",
    manual_notes: "Selinde remained at camp during the collapse.",
    cast,
    recent_turns: [
      { role: "user", speaker: "You", text: "I pull Irethia clear." },
      { role: "assistant", speaker: "Irethia", text: "Irethia thanks him and asks for Selinde." },
    ],
  },
};
const { body, castKeys } = validateCoordinatorRequest(request);
const outbound = JSON.parse(body);
assert.equal(outbound.model, request.model);
assert.equal(outbound.stream, false);
assert.equal(outbound.provider.zdr, true);
assert(outbound.messages[0].content.includes("Manual notes are authoritative"));
assert(outbound.messages[0].content.includes("sparse JSON object"));
assert.equal(outbound.max_completion_tokens, 8192);
assert.equal(outbound.max_tokens, undefined, "the deprecated output parameter is not sent twice");
assert.deepEqual(outbound.reasoning, { effort: "low" }, "the auxiliary check reserves output for structured scene JSON");
assert.equal(outbound.response_format, undefined, "without loaded capabilities the original validated JSON request remains available");
assert(!outbound.messages[0].content.includes("API key"));
assert.deepEqual(JSON.parse(outbound.messages[1].content), request.state);
assert.throws(() => validateCoordinatorRequest({ ...request, optIn: false }), /Enable AI group coordination/);
assert.throws(() => validateCoordinatorRequest({ ...request, requireZdr: undefined }), /privacy setting/);
assert.throws(() => validateCoordinatorRequest({ ...request, state: { ...request.state, cast: [cast[0], cast[0]] } }), /duplicated/);
assert.throws(() => validateCoordinatorRequest({ ...request, state: { ...request.state, recent_turns: [{ role: "user", speaker: "You", text: "Hello" }] } }), /completed group reply/);
assert.throws(() => validateCoordinatorRequest({ ...request, state: { ...request.state, memory: "x".repeat(2401) } }), /too large/);
assert.throws(() => validateCoordinatorRequest({ ...request, state: { ...request.state, manual_notes: false } }), /invalid/);

const update = { location: "Old bridge", scene: "Irethia escaped the collapse and called for Selinde.", cast: [
  { key: cast[0].key, presence: "present", knowledge: "Witnessed the collapse" },
  { key: cast[1].key, presence: "away", knowledge: "Knows about the bridge" },
], nextSpeakerKey: cast[1].key };
const reply = { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(update) } }], usage: { cost: 0.0002 } };
assert.deepEqual(readCoordinatorAnswer(reply, castKeys), { update, cost: 0.0002 });
const sparse = { scene: "Irethia is safe but the bridge remains broken.", cast: [update.cast[0]] };
assert.deepEqual(readCoordinatorAnswer({ ...reply, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(sparse) } }] }, castKeys), { update: sparse, cost: 0.0002 }, "a changed cast member need not repeat every unchanged member");
assert.deepEqual(readCoordinatorAnswer({ ...reply, usage: {}, choices: [{ finish_reason: "stop", message: { content: "{}" } }] }, castKeys), { update: {}, cost: null }, "no material change and missing provider cost remain explicit");
assert.deepEqual(readCoordinatorAnswer({ ...reply, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ location: "", scene: "", cast: [], nextSpeakerKey: "" }) } }] }, castKeys).update, {}, "required schema fields with empty values remain a no-op");
assert.equal(readCoordinatorAnswer({ ...reply, usage: { cost: null } }, castKeys).cost, null, "null provider cost must not become a free call");
assert.throws(() => readCoordinatorAnswer({ ...reply, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ...sparse, apiKey: "unsafe" }) } }] }, castKeys), /unknown scene details/);
assert.throws(() => readCoordinatorAnswer({ ...reply, choices: [{ ...reply.choices[0], finish_reason: "length" }] }, castKeys), /provider's output limit/);
assert.throws(() => readCoordinatorAnswer({ ...reply, choices: [{ finish_reason: "stop", message: { content: "```json\n{}\n```" } }] }, castKeys), /valid JSON/);
assert.throws(() => readCoordinatorAnswer({ ...reply, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ...update, nextSpeakerKey: "unknown" }) } }] }, castKeys), /unknown speaker/);
assert.throws(() => readCoordinatorAnswer({ ...reply, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ...update, cast: [update.cast[0], update.cast[0]] }) } }] }, castKeys), /invalid cast/);

function checkAndroidSchema() {
  const source = fs.readFileSync(path.join(__dirname, "..", "mobile", "android", "app", "src", "main", "java", "com", "cptbendova", "rolecraftvault", "OpenRouterPlugin.java"), "utf8");
  function method(anchor) {
    const start = source.indexOf(anchor);
    assert(start >= 0, "Android coordinator method " + anchor);
    let end = source.indexOf("{", start) + 1, depth = 1;
    for (; depth && end < source.length; end++) {
      if (source[end] === "{") depth++;
      if (source[end] === "}") depth--;
    }
    assert.equal(depth, 0, "complete Android coordinator method " + anchor);
    return source.slice(start, end);
  }
  assert(source.includes('provider.put("require_parameters", true)'), "Android route must require schema-capable endpoints");
  assert(source.includes('outbound.put("response_format", coordinatorResponseFormat(keys))'), "Android sends the schema for supported models");
  assert(source.includes('Boolean.TRUE.equals(coordinatorSchemaSupport.get(model))'), "Android uses catalog capability rather than guessing from a model name");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-coordinator-schema-java-"));
  const java = `import java.util.*;
public class CoordinatorSchemaCheck {
  static class JSONObject {
    final Map<String,Object> fields = new LinkedHashMap<>();
    JSONObject put(String key, Object value) { fields.put(key, value); return this; }
    Object get(String key) { return fields.get(key); }
    JSONArray optJSONArray(String key) { Object value = get(key); return value instanceof JSONArray ? (JSONArray) value : null; }
  }
  static class JSONArray {
    final List<Object> items = new ArrayList<>();
    JSONArray put(Object value) { items.add(value); return this; }
    int length() { return items.size(); }
    String optString(int index) { return index >= 0 && index < length() ? String.valueOf(items.get(index)) : ""; }
    boolean contains(Object value) { return items.contains(value); }
  }
  ${method("private static boolean supportsCoordinatorSchema(")}
  ${method("private static JSONObject coordinatorResponseFormat(")}
  static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
  static JSONObject obj(Object value) { return (JSONObject) value; }
  static JSONArray arr(Object value) { return (JSONArray) value; }
  public static void main(String[] args) throws Exception {
    JSONObject supported = new JSONObject().put("supported_parameters", new JSONArray().put("response_format").put("structured_outputs"));
    JSONObject unsupported = new JSONObject().put("supported_parameters", new JSONArray().put("response_format"));
    check(supportsCoordinatorSchema(supported) && !supportsCoordinatorSchema(unsupported), "catalog requires structured_outputs");
    Set<String> keys = new LinkedHashSet<>(Arrays.asList("cast-a", "cast-b"));
    JSONObject format = coordinatorResponseFormat(keys);
    check("json_schema".equals(format.get("type")), "schema format");
    JSONObject wrapper = obj(format.get("json_schema"));
    check(Boolean.TRUE.equals(wrapper.get("strict")), "strict schema");
    JSONObject schema = obj(wrapper.get("schema"));
    check(Boolean.FALSE.equals(schema.get("additionalProperties")), "no unknown top-level fields");
    check(arr(schema.get("required")).length() == 4, "strict schema requires all fields");
    JSONObject properties = obj(schema.get("properties"));
    JSONObject cast = obj(properties.get("cast"));
    JSONObject castItem = obj(cast.get("items"));
    check(Boolean.FALSE.equals(castItem.get("additionalProperties")), "no unknown cast fields");
    check(arr(castItem.get("required")).length() == 3, "complete cast row");
    JSONObject castFields = obj(castItem.get("properties"));
    check(arr(obj(castFields.get("key")).get("enum")).contains("cast-a"), "known cast key");
    check(!arr(obj(castFields.get("key")).get("enum")).contains("unknown"), "unknown cast key excluded");
    JSONArray next = arr(obj(properties.get("nextSpeakerKey")).get("enum"));
    check(next.contains("") && next.contains("cast-b") && !next.contains("unknown"), "next speaker is bounded or omitted");
  }
}`;
  try {
    const file = path.join(directory, "CoordinatorSchemaCheck.java");
    fs.writeFileSync(file, java);
    execFileSync("javac", ["-encoding", "UTF-8", "-d", directory, file]);
    execFileSync("java", ["-cp", directory, "CoordinatorSchemaCheck"]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
checkAndroidSchema();

async function ipcCheck() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-group-coordinator-"));
  const handlers = new Map();
  const originalRequest = https.request;
  let locked = false, count = 0, catalogCount = 0, defer = false, pending, rejectNext = false;
  const outboundCalls = [];
  const shutdown = setupOpenRouterIpc({
    ipcMain: { handle(name, fn) { handlers.set(name, fn); } },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() },
    app: { getPath: () => directory, on() {} },
    isLocked: () => locked,
  });
  try {
    assert.deepEqual(handlers.get("openrouter-set-key")({}, "sk-or-v1-" + "x".repeat(40)), { ok: true });
    https.request = (options, callback) => {
      assert.equal(options.hostname, "openrouter.ai");
      const catalog = options.path === "/api/v1/models";
      assert(catalog || options.path === "/api/v1/chat/completions");
      if (catalog) catalogCount++; else { count++; assert.equal(options.headers.Accept, "application/json"); }
      const req = new EventEmitter();
      req.setTimeout = () => {};
      req.write = bytes => { outboundCalls.push(JSON.parse(bytes)); };
      req.end = () => {
        if (defer) { pending = req; return; }
        const res = new EventEmitter(); res.statusCode = rejectNext ? 400 : 200;
        callback(res);
        const result = catalog ? { data: [
          { id: request.model, supported_parameters: ["response_format", "structured_outputs"] },
          { id: "unsupported/model", supported_parameters: ["response_format"] },
        ] } : rejectNext ? { error: { message: "No compatible endpoint" } } : reply;
        rejectNext = false;
        queueMicrotask(() => { res.emit("data", Buffer.from(JSON.stringify(result))); res.emit("end"); });
      };
      req.destroy = error => { if (error) queueMicrotask(() => req.emit("error", error)); };
      return req;
    };
    assert.match((await handlers.get("openrouter-coordinator")({}, { ...request, optIn: false })).error, /Enable AI/);
    assert.equal(count, 0, "no paid call without an explicit per-chat opt-in");
    assert.deepEqual(await handlers.get("openrouter-coordinator")({}, request), { ok: true, update, cost: 0.0002 });
    assert.equal(outboundCalls[0].provider.zdr, true);
    assert.equal(outboundCalls[0].response_format, undefined, "unknown model capability uses the original request");
    assert.equal(count, 1, "one provider request and no automatic retry");
    assert.equal((await handlers.get("openrouter-models")({})).ok, true);
    assert.equal(catalogCount, 1, "read-only catalog capability lookup is separate from paid scene checks");
    assert.deepEqual(await handlers.get("openrouter-coordinator")({}, request), { ok: true, update, cost: 0.0002 });
    const structured = outboundCalls[1];
    assert.equal(structured.model, request.model);
    assert.equal(structured.provider.zdr, true);
    assert.equal(structured.provider.require_parameters, true, "OpenRouter must route only to schema-capable endpoints");
    assert.equal(structured.response_format.type, "json_schema");
    assert.equal(structured.response_format.json_schema.strict, true);
    assert(structured.messages[0].content.includes("Include every field") && !structured.messages[0].content.includes("Return {}"), "structured instructions match the required schema");
    const schema = structured.response_format.json_schema.schema;
    assert.deepEqual(schema.required, ["location", "scene", "cast", "nextSpeakerKey"]);
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.cast.items.additionalProperties, false);
    assert.deepEqual(schema.properties.cast.items.properties.key.enum, cast.map(member => member.key));
    assert.deepEqual(schema.properties.nextSpeakerKey.enum, ["", ...cast.map(member => member.key)]);
    assert.deepEqual(await handlers.get("openrouter-coordinator")({}, { ...request, model: "unsupported/model", requireZdr: false }), { ok: true, update, cost: 0.0002 });
    assert.equal(outboundCalls[2].model, "unsupported/model", "unsupported model is not silently changed");
    assert.equal(outboundCalls[2].provider.zdr, false, "fallback preserves the conversation privacy setting");
    assert.equal(outboundCalls[2].provider.require_parameters, undefined);
    assert.equal(outboundCalls[2].response_format, undefined, "unsupported model uses prompt-only validated JSON");
    rejectNext = true;
    assert.match((await handlers.get("openrouter-coordinator")({}, request)).error, /No compatible endpoint/);
    assert.equal(count, 4, "endpoint rejection never triggers an automatic paid fallback retry");
    defer = true;
    const interrupted = handlers.get("openrouter-coordinator")({}, request);
    assert(pending, "second request is in flight");
    assert.deepEqual(handlers.get("openrouter-coordinator-cancel")(), { ok: true });
    assert.match((await interrupted).error, /cancelled/);
    locked = true;
    assert.match((await handlers.get("openrouter-coordinator")({}, request)).error, /Unlock the vault/);
    assert.equal(count, 5);
  } finally {
    shutdown();
    https.request = originalRequest;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
ipcCheck().then(() => console.log("PASS: protected AI group coordinator request, bounded state, lock and cancellation"), error => { console.error(error); process.exitCode = 1; });
