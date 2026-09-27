"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app/image-generation.js"), "utf8");
const timers = new Map(), files = new Map(), handlers = {}, requests = [];
let locked = false, encryption = true, nextTimer = 0;
const nativeFs = {
  existsSync: file => files.has(file), mkdirSync() {},
  readFileSync(file) { if (!files.has(file)) throw new Error("missing"); return files.get(file); },
  writeFileSync(file, value) { files.set(file, value); },
  renameSync(from, to) { files.set(to, files.get(from)); files.delete(from); },
  unlinkSync(file) { files.delete(file); },
};
const fakeHttps = {
  request(options, callback) {
    const req = new EventEmitter();
    req.end = body => { req.body = body; };
    req.destroy = () => { req.destroyed = true; req.emit("close"); };
    req.respond = (value, code = 200, extra = {}) => {
      const res = new EventEmitter();
      Object.assign(res, { statusCode: code, headers: {}, destroy() { this.destroyed = true; this.emit("close"); } }, extra);
      req.response = res; callback(res);
      if (value !== undefined && !res.destroyed) { res.emit("data", Buffer.from(typeof value === "string" ? value : JSON.stringify(value))); res.emit("end"); res.emit("close"); }
      return res;
    };
    req.options = options; requests.push(req); return req;
  },
};
const box = {
  module: { exports: {} }, Buffer, Error,
  require(name) { return name === "fs" ? nativeFs : name === "https" ? fakeHttps : require(name); },
  setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
  clearTimeout(id) { timers.delete(id); },
};
vm.runInNewContext(source, box, { filename: "app/image-generation.js" });
const native = box.module.exports;
const app = new EventEmitter(); app.getPath = () => path.join(root, "unused-image-fixture");
const cancelAll = native.setupImageGenerationIpc({
  ipcMain: { handle(name, fn) { handlers[name] = fn; } }, app,
  isLocked: () => locked,
  safeStorage: {
    isEncryptionAvailable: () => encryption,
    encryptString: key => Buffer.from("sealed:" + Buffer.from(key).toString("base64")),
    decryptString: value => Buffer.from(value.toString().slice(7), "base64").toString(),
  },
});
const sender = new EventEmitter();
const invoke = (name, value) => handlers["image-generation-" + name]({ sender }, value);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const reference = "data:image/png;base64," + png.toString("base64");
const request = { requestId: "fixture-1", provider: "openai", model: "gpt-image-2.5-sunburst", prompt: "A woodland character", shape: "portrait", quality: "medium", references: [] };
const generated = { data: [{ b64_json: png.toString("base64") }] };
const plain = value => JSON.parse(JSON.stringify(value));
const last = () => requests[requests.length - 1];
function rejects(input, pattern) { assert.throws(() => native.requestBody({ ...request, ...input }), pattern); }

async function main() {
  assert.deepStrictEqual(plain(invoke("status")), { ok: true, secure: true, openai: false, xai: false });
  locked = true;
  for (const [name, value] of [["status"], ["set-key", { provider: "openai", key: "fixture-api-key-do-not-use" }], ["clear-key", { provider: "openai" }], ["generate", request]]) assert.strictEqual((await invoke(name, value)).ok, false, name + " fails closed when locked");
  assert.strictEqual(invoke("set-unlocked", { unlocked: true }).ok, true);
  assert.strictEqual((await invoke("generate", request)).ok, false, "renderer cannot unlock Windows");
  locked = false;
  assert.strictEqual((await invoke("generate", request)).ok, false, "no key, no request");
  assert.strictEqual(requests.length, 0);
  encryption = false;
  assert.strictEqual(invoke("set-key", { provider: "openai", key: "fixture-api-key-do-not-use" }).ok, false);
  encryption = true;
  for (const provider of ["openai", "xai"]) assert.strictEqual(invoke("set-key", { provider, key: "fixture-" + provider + "-key-do-not-use" }).ok, true);
  assert.strictEqual(files.size, 2);
  assert([...files.values()].every(value => !value.toString().includes("key-do-not-use")), "only sealed credentials saved");
  assert(!JSON.stringify(invoke("status")).includes("key-do-not-use"), "status never returns a key");

  rejects({ provider: "https://attacker.invalid" }, /Choose OpenAI/);
  rejects({ provider: "xai", model: request.model }, /supported image model/);
  rejects({ requestId: "bad\r\nid" }, /request ID/);
  rejects({ prompt: " " }, /prompt/);
  rejects({ prompt: "x".repeat(8001) }, /prompt/);
  rejects({ shape: "huge" }, /shape/);
  rejects({ quality: "ultra" }, /quality/);
  rejects({ resolution: "4k" }, /resolution/);
  rejects({ resolution: "__proto__" }, /resolution/);
  rejects({ shape: "__proto__" }, /shape/);
  rejects({ model: "gpt-image-2", quality: "max" }, /up to High/);
  rejects({ model: "gpt-image-2", quality: "xhigh" }, /up to High/);
  rejects({ references: Array(5).fill(reference) }, /four/);
  rejects({ references: ["https://attacker.invalid/private"] }, /local PNG/);
  rejects({ references: [reference.replace("image/png", "image/jpeg")] }, /declared/);
  rejects({ references: ["data:image/png;base64,PHN2Zy8+"] }, /supported PNG/);
  rejects({ references: [reference + "\n"] }, /local PNG/);
  const big = Buffer.alloc(native.MAX_REFERENCE); png.copy(big);
  const bigReference = "data:image/png;base64," + big.toString("base64");
  rejects({ references: Array(4).fill(bigReference) }, /12 MiB/);
  rejects({ references: ["data:image/png;base64," + Buffer.concat([big, Buffer.from([0])]).toString("base64")] }, /size limit|4 MiB/);

  const edit = native.requestBody({ ...request, references: [reference, reference] });
  assert.strictEqual(edit.host, "api.openai.com");
  assert.strictEqual(edit.apiPath, "/v1/images/edits");
  assert(edit.contentType.startsWith("multipart/form-data; boundary="));
  assert.strictEqual((edit.body.toString().match(/name="image\[\]"/g) || []).length, 2);
  assert(edit.body.includes(png));
  assert(edit.body.toString().includes("1024x1536"));
  const dimensions = {
    standard: { square: "1024x1024", portrait: "1024x1536", landscape: "1536x1024", wide: "1536x864", tall: "864x1536" },
    "2k": { square: "2048x2048", portrait: "1344x2016", landscape: "2016x1344", wide: "2048x1152", tall: "1152x2048" },
    max: { square: "2880x2880", portrait: "2336x3504", landscape: "3504x2336", wide: "3840x2160", tall: "2160x3840" },
  };
  const aspect = { square: "1:1", portrait: "2:3", landscape: "3:2", wide: "16:9", tall: "9:16" };
  for (const model of ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2"]) {
    for (const [resolution, shapes] of Object.entries(dimensions)) {
      for (const [shape, size] of Object.entries(shapes)) {
        const body = JSON.parse(native.requestBody({ ...request, model, resolution, shape, size: "99999x99999" }).body);
        assert.strictEqual(body.size, size, model + ": " + resolution + ": " + shape);
        const [width, height] = size.split("x").map(Number), [a, b] = aspect[shape].split(":").map(Number);
        assert.strictEqual(width % 16, 0); assert.strictEqual(height % 16, 0);
        assert(Math.max(width, height) <= 3840); assert(width * height >= 655360 && width * height <= 8294400);
        assert.strictEqual(width * b, height * a, "preset preserves exact requested aspect ratio");
        const multipart = native.requestBody({ ...request, model, resolution, shape, references: [reference] });
        assert(multipart.body.toString().includes('name="size"\r\n\r\n' + size + '\r\n'), "edits receive same exact dimensions");
      }
    }
    for (const quality of model === "gpt-image-2" ? ["auto", "low", "medium", "high"] : ["auto", "low", "medium", "high", "xhigh", "max"]) {
      assert.strictEqual(JSON.parse(native.requestBody({ ...request, model, quality }).body).quality, quality);
    }
  }
  const grok = { ...request, provider: "xai", model: "grok-imagine-image-2.0" };
  const grokOne = native.requestBody({ ...grok, references: [reference] });
  assert.strictEqual(grokOne.host, "api.x.ai");
  assert.deepStrictEqual(JSON.parse(grokOne.body).image, { type: "image_url", url: reference });
  const grokMany = JSON.parse(native.requestBody({ ...grok, references: [reference, reference] }).body);
  assert.strictEqual(grokMany.images.length, 2); assert.strictEqual(grokMany.response_format, "b64_json");
  assert.strictEqual(grokMany.n, 1); assert.strictEqual(grokMany.aspect_ratio, "2:3");
  assert.strictEqual(grokMany.resolution, "1k");
  assert.strictEqual(grokMany.quality, "medium", "selected Grok quality forwarded");
  for (const quality of ["auto", "low", "medium"]) assert.strictEqual(JSON.parse(native.requestBody({ ...grok, quality }).body).quality, quality);
  rejects({ ...grok, quality: "high" }, /Auto, Low or Medium/);
  rejects({ ...grok, quality: "xhigh" }, /Auto, Low or Medium/);
  rejects({ ...grok, quality: "max" }, /Auto, Low or Medium/);
  rejects({ ...grok, resolution: "max" }, /Standard \(1K\) or 2K/);
  for (const resolution of ["standard", "2k"]) for (const [shape, ratio] of Object.entries(aspect)) {
    for (const references of [[], [reference]]) {
      const body = JSON.parse(native.requestBody({ ...grok, resolution, shape, references }).body);
      assert.strictEqual(body.resolution, resolution === "standard" ? "1k" : "2k");
      assert.strictEqual(body.aspect_ratio, ratio);
    }
  }
  assert.throws(() => native.responseImage({ data: [{ url: "https://untrusted.invalid/image.png" }] }), /complete image/);
  assert.throws(() => native.responseImage({ data: [generated.data[0], generated.data[0]] }), /complete image/);
  assert.throws(() => native.responseImage({ data: [{ ...generated.data[0], respect_moderation: false }] }), /filtered/);
  assert.throws(() => native.responseImage({ data: [{ b64_json: "A".repeat(Math.ceil(native.MAX_OUTPUT / 3) * 4 + 4) }] }), /size limit/);

  const result = invoke("generate", { ...request, endpoint: "http://attacker.invalid", headers: { Authorization: "stolen" }, n: 100 });
  assert.strictEqual((await invoke("generate", request)).ok, false, "only one image request at a time");
  assert.strictEqual(last().options.protocol, "https:"); assert.strictEqual(last().options.hostname, "api.openai.com");
  assert.strictEqual(last().options.servername, "api.openai.com"); assert.strictEqual(last().options.port, 443);
  assert.strictEqual(last().options.path, "/v1/images/generations");
  const payload = JSON.parse(last().body);
  assert.strictEqual(payload.n, 1); assert.strictEqual(payload.output_format, "png");
  assert.strictEqual(payload.size, "1024x1536"); assert.strictEqual(payload.quality, "medium");
  assert.strictEqual(payload.endpoint, undefined); assert.strictEqual(payload.references, undefined);
  assert.strictEqual([...timers.values()][0].ms, 300000, "absolute five-minute deadline");
  last().respond(generated);
  assert.deepStrictEqual(plain(await result), { ok: true, dataUrl: reference, provider: "openai", model: request.model });
  assert.strictEqual(timers.size, 0);
  assert.strictEqual(sender.listenerCount("destroyed"), 0);

  let pending = invoke("generate", request); invoke("cancel", { requestId: "another-request" });
  assert.strictEqual(last().destroyed, undefined); invoke("cancel", { requestId: request.requestId });
  assert.match((await pending).error, /stopped/); assert(last().destroyed);
  pending = invoke("generate", request); locked = true; last().respond(generated);
  assert.match((await pending).error, /Unlock/); locked = false;
  pending = invoke("generate", request); cancelAll(); assert.strictEqual((await pending).ok, false);
  pending = invoke("generate", request); sender.emit("destroyed"); assert.match((await pending).error, /workspace was closed/);
  pending = invoke("generate", request); const deadline = [...timers.values()][0]; last().respond(undefined); deadline.fn();
  assert.match((await pending).error, /five minutes/); assert(last().destroyed); assert(last().response.destroyed);

  for (const event of ["error", "aborted", "close"]) {
    pending = invoke("generate", request); const response = last().respond(undefined); response.emit(event, new Error("secret-key-do-not-expose"));
    const error = await pending; assert.strictEqual(error.ok, false); assert(!error.error.includes("secret"));
  }
  pending = invoke("generate", request); last().emit("error", new Error("secret-key-do-not-expose"));
  assert(!JSON.stringify(await pending).includes("secret"));
  pending = invoke("generate", request); last().emit("close"); assert.match((await pending).error, /closed before/);
  pending = invoke("generate", request); last().respond({ error: { message: "echoed-secret-key-do-not-expose" } }, 401);
  const authError = (await pending).error; assert.match(authError, /rejected the API key/); assert(!authError.includes("echoed-secret"));
  pending = invoke("generate", request);
  last().respond({ error: { message: "Invalid size '2336x3504': choose a supported size.", code: "invalid_value", type: "invalid_request_error", param: "size" } }, 400, { headers: { "x-request-id": "req_fixture_400" } });
  const sizeError = await pending;
  assert.strictEqual(sizeError.ok, false);
  for (const detail of ["HTTP 400", "Invalid size '2336x3504'", "Code: invalid_value", "Type: invalid_request_error", "Parameter: size", "Request ID: req_fixture_400"]) assert(sizeError.error.includes(detail), detail);
  for (const code of ["moderation_blocked", "content_policy_violation", "safety_violation"]) {
    pending = invoke("generate", request); last().respond({ error: { code, message: "unnecessary moderation content" } }, 400);
    const error = (await pending).error; assert(error.includes("image safety policy")); assert(error.includes(code)); assert(!error.includes("unnecessary"));
  }
  pending = invoke("generate", request);
  const sensitive = "fixture-openai-key-do-not-use";
  last().respond({ error: { message: `Invalid request: ${sensitive}; ${request.prompt}; ${reference}; https://private.invalid/path?key=secret; Bearer hidden-credential; sk-masked***suffix; ${"A".repeat(120)}`, code: sensitive, param: sensitive } }, 400, { headers: { "x-request-id": sensitive } });
  const redacted = (await pending).error;
  for (const secret of [sensitive, request.prompt, reference, "private.invalid", "hidden-credential", "masked", "A".repeat(80)]) assert(!redacted.includes(secret), "removed " + secret.slice(0, 24));
  for (const response of ["<html>private upstream error</html>", "broken JSON", { error: [] }, { error: { message: { secret: "nested-secret" }, code: 42, param: ["hidden"] } }]) {
    pending = invoke("generate", request); last().respond(response, 400);
    const message = (await pending).error; assert(message.includes("HTTP 400")); assert(message.includes("No safe provider explanation")); assert(!message.includes("nested-secret")); assert(!message.includes("upstream"));
  }
  pending = invoke("generate", { ...request, provider: "xai", model: "grok-imagine-image-2.0" });
  last().respond({ error: "Unsupported resolution: 4k" }, 400);
  assert.match((await pending).error, /xAI.*HTTP 400[\s\S]*Unsupported resolution/);
  pending = invoke("generate", request); last().respond({ error: { message: "Choose a smaller size. ".repeat(100) } }, 422);
  assert((await pending).error.length < 1300, "bounded readable message");
  pending = invoke("generate", request); const largeError = last().respond(undefined, 400);
  largeError.emit("data", Buffer.alloc(65537)); assert.match((await pending).error, /HTTP 400/); assert(largeError.destroyed);
  pending = invoke("generate", request); last().respond(undefined, 400, { headers: { "content-length": 65537, "x-request-id": "req_large" } });
  assert.match((await pending).error, /HTTP 400[\s\S]*req_large/);
  pending = invoke("generate", request); const beforeRedirect = requests.length; last().respond("redirect-secret", 302, { headers: { location: "https://untrusted.invalid" } });
  assert.match((await pending).error, /HTTP 302/); assert.strictEqual(requests.length, beforeRedirect);
  pending = invoke("generate", request); last().respond("not-json"); assert.match((await pending).error, /incomplete image response/);
  pending = invoke("generate", request); last().respond(undefined, 200, { headers: { "content-length": native.MAX_RESPONSE + 1 } }); assert.match((await pending).error, /size limit/);
  pending = invoke("generate", request); const oversized = last().respond(undefined); oversized.emit("data", Buffer.alloc(native.MAX_RESPONSE + 1)); assert.match((await pending).error, /size limit/);
  pending = invoke("generate", request); invoke("clear-key", { provider: "openai" }); assert.strictEqual((await pending).ok, false);
  assert.strictEqual(invoke("status").openai, false); assert.strictEqual(invoke("status").xai, true);
  assert.strictEqual(timers.size, 0); assert.strictEqual(sender.listenerCount("destroyed"), 0);
  const preload = fs.readFileSync(path.join(root, "app/preload.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "app/main.js"), "utf8");
  assert(preload.includes('exposeInMainWorld("imageGeneration"'));
  assert(main.includes('require("./image-generation").setupImageGenerationIpc'));
  assert(/cancelChatRequests\s*=\s*\(\)\s*=>\s*\{[^}]*cancelImages\(\)/.test(main), "lock cancels generation");
  assert(!/(?<!\r)\n/.test(main), "main.js remains all-CRLF");
  console.log("Image generation native checks passed: providers, references, sealed keys, lock, bounds, timeout, cancellation and interruption.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
