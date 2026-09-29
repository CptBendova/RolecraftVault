// 1.339: the real Windows ElevenLabs bridge with a stubbed HTTPS layer. No API
// key, network or paid request is used. Proves the fixed host and paths, the
// sealed key never reaching the renderer, bounded/validated audio and voice
// lists, sanitised provider errors, lock and cancellation behaviour.
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path"), https = require("https");
const { EventEmitter } = require("events");
const { setupElevenLabsIpc } = require(path.join(__dirname, "..", "app", "elevenlabs.js"));

const KEY = "sk_test_eleven_key_not_a_real_secret_0001";
const VOICE = "21m00Tcm4TlvDq8ikWAM";
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(300, 7)]);
let reply = null, captured = [], hold = null;

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rolecraft-eleven-test-"));
  const handlers = new Map();
  let locked = false;
  const original = https.request;
  https.request = (options, onResponse) => {
    const request = new EventEmitter(), sent = { options, body: "" };
    captured.push(sent);
    request.setTimeout = () => {};
    request.write = body => { sent.body += body.toString(); };
    request.destroy = () => { sent.destroyed = true; request.emit("error", Error("destroyed")); };
    request.end = () => {
      const deliver = () => {
        if (sent.destroyed) return;
        const response = new EventEmitter();
        response.statusCode = reply.status; response.headers = reply.headers || {}; response.destroy = () => {};
        onResponse(response);
        response.emit("data", reply.body); response.emit("end");
      };
      if (hold) hold.push(deliver); else process.nextTick(deliver);
    };
    return request;
  };
  try {
    const cancel = setupElevenLabsIpc({
      ipcMain: { handle(name, handler) { handlers.set(name, handler); } },
      safeStorage: { isEncryptionAvailable: () => true, encryptString: text => Buffer.from("sealed:" + text), decryptString: data => { const text = data.toString(); assert(text.startsWith("sealed:")); return text.slice(7); } },
      app: { getPath: () => profile },
      isLocked: () => locked
    });
    const call = (name, input) => handlers.get(name)(null, input);

    // Key handling: sealed at rest, reported only as configured.
    assert.equal((await call("elevenlabs-status")).configured, false);
    assert.equal((await call("elevenlabs-set-key", { key: "short" })).ok, false);
    assert.equal((await call("elevenlabs-set-key", { key: KEY })).ok, true);
    const stored = fs.readFileSync(path.join(profile, "elevenlabs-key.bin")).toString();
    assert(stored.startsWith("sealed:"), "the key is written only through safeStorage");
    const status = await call("elevenlabs-status");
    assert.equal(status.configured, true);
    assert(!JSON.stringify(status).includes(KEY), "status never returns the key");

    // Speech: fixed host, path, headers and body; MP3 returned as base64.
    reply = { status: 200, headers: { "content-type": "audio/mpeg" }, body: MP3 };
    captured = [];
    const spoken = await call("elevenlabs-speech", { text: "Hello there.", voiceId: VOICE, model: "eleven_v4_turbo" });
    assert.equal(spoken.ok, true, spoken.error);
    assert.equal(spoken.mime, "audio/mpeg");
    assert(Buffer.from(spoken.audio, "base64").equals(MP3));
    assert(!JSON.stringify(spoken).includes(KEY), "the key never returns to the renderer");
    const sent = captured[0];
    assert.equal(sent.options.hostname, "api.elevenlabs.io");
    assert.equal(sent.options.protocol, "https:");
    assert.equal(sent.options.method, "POST");
    assert.equal(sent.options.path, "/v1/text-to-speech/" + VOICE + "?output_format=mp3_44100_128");
    assert.equal(sent.options.headers["xi-api-key"], KEY);
    assert.equal(sent.options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(sent.body), { text: "Hello there.", model_id: "eleven_v4_turbo" });

    // Default model is Eleven v4; Enterprise zero retention adds enable_logging=false.
    captured = [];
    assert.equal((await call("elevenlabs-speech", { text: "Quietly.", voiceId: VOICE, zeroRetention: true })).ok, true);
    assert.equal(JSON.parse(captured[0].body).model_id, "eleven_v4");
    assert(captured[0].options.path.endsWith("&enable_logging=false"));

    // Validation happens before any request.
    captured = [];
    for (const bad of [
      { text: "Hi", voiceId: "../../v1/user" }, { text: "Hi", voiceId: VOICE, model: "eleven_v3" },
      { text: "x".repeat(4001), voiceId: VOICE }, { text: "   ", voiceId: VOICE }, { text: "Hi", voiceId: VOICE, zeroRetention: "yes" }
    ]) assert.equal((await call("elevenlabs-speech", bad)).ok, false, JSON.stringify(bad).slice(0, 80));
    assert.equal(captured.length, 0, "invalid requests never reach ElevenLabs");

    // Audio that is not MP3 is refused.
    reply = { status: 200, headers: { "content-type": "audio/mpeg" }, body: Buffer.alloc(300, 0) };
    assert.match((await call("elevenlabs-speech", { text: "Hi", voiceId: VOICE })).error, /invalid voice audio/);
    reply = { status: 200, headers: { "content-type": "text/html" }, body: MP3 };
    assert.equal((await call("elevenlabs-speech", { text: "Hi", voiceId: VOICE })).ok, false);

    // Provider errors: sanitised, key and text redacted, 401 bodies never echoed.
    reply = { status: 422, headers: {}, body: Buffer.from(JSON.stringify({ detail: { status: "bad", message: "Bad input for " + KEY + " near Hello secret https://evil.example/x" } })) };
    const rejected = await call("elevenlabs-speech", { text: "Hello secret", voiceId: VOICE });
    assert.equal(rejected.ok, false);
    assert(!rejected.error.includes(KEY) && !rejected.error.includes("Hello secret") && !rejected.error.includes("evil.example"), rejected.error);
    reply = { status: 401, headers: {}, body: Buffer.from(JSON.stringify({ detail: { message: "key " + KEY + " invalid" } })) };
    const unauthorised = await call("elevenlabs-speech", { text: "Hi", voiceId: VOICE });
    assert.match(unauthorised.error, /rejected the API key/);
    assert(!unauthorised.error.includes("invalid"), "401 bodies are never echoed");
    reply = { status: 302, headers: { location: "https://elsewhere.example" }, body: Buffer.from("") };
    assert.match((await call("elevenlabs-speech", { text: "Hi", voiceId: VOICE })).error, /redirect/);

    // Voice list: fixed path, bounded, sanitised rows and a validated page token.
    reply = { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify({
      voices: [
        { voice_id: VOICE, name: "Rachel‮", category: "premade", description: "Calm narrator https://x.example", labels: { accent: "american", use_case: "narration" }, preview_url: "https://cdn.example/p.mp3" },
        { voice_id: "bad id!", name: "Broken" }, { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "" }
      ], has_more: true, next_page_token: "page-2_token" })) };
    captured = [];
    const listed = await call("elevenlabs-voices", { search: "rach" });
    assert.equal(listed.ok, true, listed.error);
    assert.equal(captured[0].options.method, "GET");
    assert.equal(captured[0].options.path, "/v2/voices?page_size=100&search=rach");
    assert.deepEqual(listed.voices, [{ id: VOICE, name: "Rachel", category: "premade", description: "Calm narrator", labels: ["accent: american", "use case: narration"] }]);
    assert.equal(listed.hasMore, true); assert.equal(listed.nextPageToken, "page-2_token");
    assert(!JSON.stringify(listed).includes("cdn.example"), "remote preview URLs never reach the renderer");
    captured = [];
    await call("elevenlabs-voices", { pageToken: "page-2_token" });
    assert.equal(captured[0].options.path, "/v2/voices?page_size=100&next_page_token=page-2_token");
    assert.equal((await call("elevenlabs-voices", { pageToken: "bad token\n" })).ok, false);

    // The newest explicit speech request abandons an earlier one; cancel stops all.
    reply = { status: 200, headers: { "content-type": "audio/mpeg" }, body: MP3 };
    hold = [];
    const first = call("elevenlabs-speech", { text: "First", voiceId: VOICE });
    const second = call("elevenlabs-speech", { text: "Second", voiceId: VOICE });
    await new Promise(r => setImmediate(r));
    const queued = hold; hold = null; queued.forEach(fn => fn());
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.ok, false, "an earlier request is abandoned when a newer one starts");
    assert.equal(b.ok, true, b.error);
    hold = [];
    const cancelled = call("elevenlabs-speech", { text: "Stop me", voiceId: VOICE });
    await new Promise(r => setImmediate(r));
    await call("elevenlabs-cancel");
    hold = null;
    assert.equal((await cancelled).ok, false, "cancel stops an in-flight request");

    // Locked: every entry point refuses, and the shell's lock cancel works.
    locked = true;
    for (const [name, input] of [["elevenlabs-status"], ["elevenlabs-voices", {}], ["elevenlabs-speech", { text: "Hi", voiceId: VOICE }], ["elevenlabs-set-key", { key: KEY }], ["elevenlabs-clear-key"]])
      assert.equal((await call(name, input)).ok, false, name + " refuses while locked");
    locked = false;
    assert.equal(typeof cancel, "function");
    assert.equal((await call("elevenlabs-clear-key")).ok, true);
    assert.equal(fs.existsSync(path.join(profile, "elevenlabs-key.bin")), false);
    assert.match((await call("elevenlabs-speech", { text: "Hi", voiceId: VOICE })).error, /Add your ElevenLabs API key/);
    console.log("PASS ElevenLabs bridge: sealed key, fixed endpoints, validated MP3 and voices, sanitised errors, newest-wins, cancel and lock");
  } finally {
    https.request = original;
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
