#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = rel => fs.readFileSync(path.join(root, rel), "utf8");
const { validatePayload, validateCoordinatorRequest, parseSseData } = require(path.join(root, "app", "openrouter.js"));

const request = JSON.parse(validatePayload({
  model: "openrouter/auto",
  messages: [{ role: "system", content: "rules" }, { role: "user", content: "hello" }],
  temperature: 9,
  max_tokens: 999999,
}).toString("utf8"));
assert.strictEqual(request.stream, true);
assert.deepStrictEqual(request.provider, { zdr: true }, "native requests default to ZDR routing");
for (const requireZdr of [undefined, null, true, false, 0, 'false', {}, []]) {
  const payload = JSON.parse(validatePayload({model:'test/model', messages:[{role:'user',content:'Hi'}], requireZdr, provider:{zdr:false,only:['untrusted']}}));
  assert.deepStrictEqual(payload.provider, {zdr:requireZdr !== false}, 'only a boolean false opts out; renderer provider objects are not forwarded');
}
assert.strictEqual(request.temperature, 2);
assert.strictEqual(request.max_tokens, 131072);
const memoryRequest = JSON.parse(validatePayload({ model: "test/model", purpose: "memory", messages: [{ role: "user", content: "Remember this" }] }));
assert(!Object.hasOwn(memoryRequest, "purpose"), "local timeout purpose must never reach OpenRouter");
const deepseekMemory = JSON.parse(validatePayload({ model: "deepseek/deepseek-v4.1-flash", purpose: "memory", messages: [{ role: "user", content: "Summarize these events" }], max_tokens: 8192, requireZdr: true }));
assert.deepStrictEqual(deepseekMemory.reasoning, { enabled: false }, "DeepSeek V4.1 Flash memory must not spend its summary allowance on default high thinking");
assert.strictEqual(deepseekMemory.max_tokens, 8192, "memory keeps its separate generation allowance");
assert.deepStrictEqual(deepseekMemory.provider, { zdr: true, require_parameters: true }, "memory routing must require non-thinking and schema support without loosening privacy");
assert.strictEqual(deepseekMemory.response_format.type, "json_schema", "DeepSeek memory uses a structured completion rather than a fragile end marker");
assert.deepStrictEqual(deepseekMemory.response_format.json_schema.schema.required, ["history"]);
assert.deepStrictEqual(Object.keys(deepseekMemory.response_format.json_schema.schema.properties), ["history"], "The provider is not asked to guess the number of messages it summarized");
const deepseekReply = JSON.parse(validatePayload({ model: "deepseek/deepseek-v4.1-flash", messages: [{ role: "user", content: "Continue the scene" }] }));
assert(!Object.hasOwn(deepseekReply, "reasoning"), "normal DeepSeek roleplay keeps the model's existing thinking behavior");
assert(!Object.hasOwn(deepseekReply, "response_format"), "normal roleplay never inherits the memory JSON schema");
const datedDeepseekMemory = JSON.parse(validatePayload({ model: "deepseek/deepseek-v4.1-flash-20260910", purpose: "memory", messages: [{ role: "user", content: "Summarize this page" }] }));
assert.strictEqual(datedDeepseekMemory.response_format.type, "json_schema", "the dated DeepSeek V4.1 Flash listing uses the same memory protocol");
assert(!Object.hasOwn(memoryRequest, "reasoning"), "other memory models keep their existing reasoning behavior");
for (const purpose of [null, "reply", "memory-extra", 1, {}]) {
  assert.throws(() => validatePayload({ model: "test/model", purpose, messages: [{ role: "user", content: "Hi" }] }), /purpose is invalid/);
}
const cachedSession = JSON.parse(validatePayload({model:"test/model",sessionId:"12345678-aaaa-4444-bbbb-123456789012",messages:[{role:"user",content:"Hi"}]}));
assert.strictEqual(cachedSession.session_id,"rolecraft-12345678-aaaa-4444-bbbb-123456789012", "conversation routing is stable across replies");
assert(!Object.hasOwn(request,"session_id"), "memory and legacy requests do not gain a shared roleplay session");
assert.throws(() => validatePayload({model:"test/model",sessionId:"bad session",messages:[{role:"user",content:"Hi"}]}), /session is invalid/);
assert.throws(() => validatePayload({ model: "bad model", messages: [{ role: "user", content: "x" }] }), /valid model/);
const latestAlias = "~deepseek/deepseek-pro-latest";
const latestRequest = JSON.parse(validatePayload({ model: latestAlias, messages: [{ role: "user", content: "Continue the scene" }] }));
assert.strictEqual(latestRequest.model, latestAlias, "an OpenRouter latest-model alias must reach the provider unchanged");
for (const invalid of ["deepseek/~deepseek-pro-latest", "~deepseek/deepseek-pro-latest~", "~~deepseek/deepseek-pro-latest", "~deepseek/deepseek pro latest"]) {
  assert.throws(() => validatePayload({ model: invalid, messages: [{ role: "user", content: "Hi" }] }), /valid model/, "a tilde is allowed only as one leading alias prefix");
}
const sync = require(path.join(root, "app", "chat-sync-core.js"));
const memoryAliasChat = { id: "memory-alias", messages: [], memoryModel: latestAlias };
const coordinatorAliasChat = { id: "coordinator-alias", messages: [], participants: [{ characterId: "character" }], activeSpeakerKey: '["character",""]', groupCoordinatorModel: latestAlias };
assert.strictEqual(sync.validate([memoryAliasChat])[0].memoryModel, latestAlias, "paired sync must preserve the alias memory model");
assert.strictEqual(sync.validate([coordinatorAliasChat])[0].groupCoordinatorModel, latestAlias, "paired sync must preserve the alias group coordinator model");
for (const invalid of ["deepseek/~deepseek-pro-latest", "~~deepseek/deepseek-pro-latest"]) {
  assert.throws(() => sync.validate([{ ...memoryAliasChat, memoryModel: invalid }]), /Invalid memory summarizer model/);
  assert.throws(() => sync.validate([{ ...coordinatorAliasChat, groupCoordinatorModel: invalid }]), /Invalid AI group coordinator model/);
}
const coordinatorAliasRequest = {
  optIn: true, model: latestAlias, requireZdr: true,
  state: {
    location: "Hall", scene: "The party reached the hall.", memory: "", manual_notes: "",
    cast: [
      { key: '["a",""]', name: "Ari", presence: "present", knowledge: "Saw the door open" },
      { key: '["b",""]', name: "Bryn", presence: "present", knowledge: "Heard Ari" },
    ],
    recent_turns: [{ role: "assistant", speaker: "Ari", text: "The door is open." }],
  },
};
assert.strictEqual(JSON.parse(validateCoordinatorRequest(coordinatorAliasRequest).body).model, latestAlias, "AI scene coordination must retain the provider alias");
assert.throws(() => validateCoordinatorRequest({ ...coordinatorAliasRequest, model: "deepseek/~deepseek-pro-latest" }), /valid model/);
assert.throws(() => validatePayload({ model: "x/y", messages: [{ role: "tool", content: "x" }] }), /invalid role/);
assert.deepStrictEqual(parseSseData("[DONE]"), { type: "done" });
assert.strictEqual(parseSseData(JSON.stringify({ choices: [{ delta: { content: "two ✓" } }] })).text, "two ✓");

const sandbox = {
  window: {},
  document: { createElement: () => ({}), body: { appendChild() {} } },
  Blob: function () {}, URL: { createObjectURL() {}, revokeObjectURL() {} }, setTimeout() {}, clearInterval() {}, setInterval() {},
};
sandbox.window.window = sandbox.window;
sandbox.window.crypto = { randomUUID: () => "id" };
sandbox.window.storage = {};
sandbox.window.React = {
  createElement: () => ({}), Fragment: "fragment",
  useState: () => [null, () => {}], useEffect() {}, useMemo: fn => fn(), useRef: () => ({ current: null })
};
sandbox.window.ReactDOM = { createRoot: () => ({ render() {} }) };
sandbox.React = sandbox.window.React;
sandbox.ReactDOM = sandbox.window.ReactDOM;
vm.runInNewContext(source("app/chat.js"), sandbox, { filename: "chat.js" });
const I = sandbox.window.__rcvChatInternals;
assert(I && I.assemble, "chat prompt helpers should come from the shipped file");
const character = { id: "c", name: "Ari", story: "Base story", personality: "Careful", lorebooks: ["World"], sections: [{ title: "Boundary", content: "No harm" }], variants: [{ id: "v", name: "Night", story: "Variant story" }] };
const chat = { characterId: "c", variantId: "v", personaId: "p", lorebooks: [], contextTokens: 8000, authorNote: "Slow pace", messages: [{ id: "u", parentId: null, role: "user", content: "We enter the moon temple" }], leafId: "u" };
const assembled = I.assemble(chat, { chars: [character], personas: [{ id: "p", name: "Sam", description: "Curious" }], lore: [{ title: "Temple", world: "World", triggers: ["moon"], content: "The doors sing." }, { title: "Sea", world: "World", triggers: ["ocean"], content: "Not active" }] });
assert(assembled.messages[0].content.includes("Variant story"));
assert(!assembled.messages[0].content.includes("Base story"));
assert(assembled.messages[0].content.includes("The doors sing."));
assert(!assembled.messages[0].content.includes("Not active"));
assert(assembled.messages[0].content.includes("Slow pace"));
assert.strictEqual(assembled.messages[assembled.messages.length - 1].content, "We enter the moon temple");
assert.strictEqual(I.assemble(Object.assign({}, chat, { personaId: null }), { chars: [Object.assign({}, character, { lorebooks: [] })], personas: [], lore: [{ world: "Unattached", content: "private unrelated lore", triggers: [] }] }).lore.length, 0, "a character without attached books must not send unrelated lore");
assert.strictEqual(I.resolveCharacter(character, "v").story, "Variant story");
assert.strictEqual(I.resolveCharacter({ variants: [{ id: "v", story: "", profileImg: "version" }], story: "base", profileImg: "base-image" }, "v").story, "", "intentionally blank variant fields must remain blank");
assert.strictEqual(I.resolveCharacter({ variants: [{ id: "v", profileImg: "version" }] }, "v").profileImg, "version");
assert.strictEqual(I.activePath({ messages: [{ id: "a", parentId: "b" }, { id: "b", parentId: "a" }], leafId: "a" }).length, 2, "cycles cannot hang the interface");
const limits = I.contextLimits({ model: "long/model", contextTokens: 1000000, maxTokens: 8192 }, [{ id: "long/model", context_length: 1048576, max_completion_tokens: 4096 }]);
assert.strictEqual(limits.window, 1000000);
assert.strictEqual(limits.reply, 4096);
assert(limits.input < limits.window - limits.reply, "reply and estimation margin are reserved");
assert.strictEqual(I.contextLimits({ model: "small/model", contextTokens: 1000000 }, [{ id: "small/model", context_length: 8192 }]).window, 8192);
const over = I.assemble(Object.assign({}, chat, { contextTokens: 2048, authorNote: "x".repeat(30000) }), { chars: [character], personas: [], lore: [] });
assert(over.error, "oversized pinned context is blocked, not silently sent above the limit");
assert.throws(() => I.parseChats("[null]"), /could not be read/);
assert.throws(() => I.parseChats("broken"));
assert.strictEqual(I.parseChats(JSON.stringify([{ id: "c", messages: [{ id: "m", content: "saved partial", role: "assistant", pending: true }] }]))[0].messages[0].pending, false);
assert(JSON.parse(validatePayload({ model: "long/model", messages: [{ role: "system", content: "x".repeat(3000000) }] })).messages[0].content.length === 3000000, "large context is supported by the shell too");

assert(source("app/preload.js").includes("openrouter-start"));
assert(!source("app/preload.js").includes("readKey"), "renderer bridge must not expose the saved credential");
assert(source("app/main.js").includes('path.join(app.getPath("appData"), "Rolecraft Vault Chat")'));
assert(source("app/main.js").includes("standard Vault .rcvup files are incompatible"), "Private Rolecraft must refuse standard renderer patches");
assert(source("app/main.js").includes('RolecraftVault/releases"'), "Chat downloads must show both editions");
assert(source("mobile/capacitor.config.json").includes("com.cptbendova.rolecraftvault.chat"));
const android = source("mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/OpenRouterPlugin.java");
assert(android.includes('provider.put("zdr", !Boolean.FALSE.equals(request.opt("requireZdr")))'), 'Android also requires an explicit boolean opt-out');
assert(android.includes('HOST = "https://openrouter.ai"'));
assert(android.includes('model.matches('), "Android must validate the model identifier");
assert(android.includes('JSONObject outbound = new JSONObject()'), "Android must whitelist outbound request fields");
assert(android.includes('outbound.put("session_id", "rolecraft-" + sessionId)'), "Android uses the same opaque conversation routing hint");
assert(android.includes('memoryRequest && !"memory".equals(request.opt("purpose"))'), "Android validates the local memory purpose");
assert(android.includes('memoryRequest && ("deepseek/deepseek-v4.1-flash".equals(model) || "deepseek/deepseek-v4.1-flash-20260910".equals(model))'), "Android scopes disabled thinking to both DeepSeek V4.1 Flash listings");
assert(android.includes('outbound.put("reasoning", new JSONObject().put("enabled", false))'), "Android disables DeepSeek memory thinking in the native request");
assert(android.includes('outbound.put("response_format", memoryResponseFormat())'), "Android requests structured DeepSeek memory");
assert(android.includes('provider.put("require_parameters", true)'), "Android requires compatible routing for structured memory");
assert(!android.includes('outbound.put("purpose"'), "Android does not forward the local purpose to OpenRouter");
assert(!android.includes("Log."), "API keys and prompt bodies must never be logged");

console.log("private chat isolation, prompt assembly, ZDR routing and bridge checks passed");
