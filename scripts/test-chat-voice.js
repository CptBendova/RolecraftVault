const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { EventEmitter } = require("events");
const { setupOpenRouterIpc } = require(path.join(__dirname, "..", "app", "openrouter.js"));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rolecraft-voice-test-"));
  const key = "sk-or-test-voice-key-not-a-real-secret";
  fs.writeFileSync(path.join(profile, "openrouter-key.bin"), key);
  const handlers = new Map();
  const original = https.request;
  let captured;
  let responseType = "audio/pcm";
  let responseData = Buffer.alloc(32, 1);
  https.request = (options, onResponse) => {
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.write = body => { captured = { options, body: JSON.parse(body.toString()) }; };
    request.end = () => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = { "content-type": responseType };
      process.nextTick(() => {
        onResponse(response);
        response.emit("data", responseData);
        response.emit("end");
      });
    };
    request.destroy = () => request.emit("error", Error("cancelled"));
    return request;
  };
  try {
    setupOpenRouterIpc({
      ipcMain: { handle(name, handler) { handlers.set(name, handler); } },
      safeStorage: { isEncryptionAvailable: () => true, decryptString: data => data.toString() },
      app: { getPath: () => profile, on() {} },
      isLocked: () => false
    });
    const speech = handlers.get("openrouter-speech");
    const result = await speech(null, { text: "Hello there", voice: "Kore", style: "Warm and calm", requireZdr: true });
    assert.equal(result.ok, true);
    assert(Buffer.from(result.audio, "base64").equals(responseData));
    assert.equal(result.mime, "audio/pcm");
    assert.deepEqual({ sampleRate: result.sampleRate, channels: result.channels, bitsPerSample: result.bitsPerSample }, { sampleRate: 24000, channels: 1, bitsPerSample: 16 });
    assert.equal(result.littleEndian, true);
    assert.equal(captured.options.hostname, "openrouter.ai");
    assert.equal(captured.options.path, "/api/v1/audio/speech");
    assert.equal(captured.options.headers.Authorization, "Bearer " + key);
    assert.equal(captured.options.headers.Accept, "audio/pcm");
    assert.equal(captured.body.model, "google/gemini-3.8-flash-tts");
    assert.equal(captured.body.response_format, "pcm");
    assert.equal(captured.body.provider.zdr, true);
    assert.equal(captured.body.provider.options["google-ai-studio"].speech_metadata.style, "Warm and calm");
    assert(!JSON.stringify(result).includes(key), "protected key never returns to renderer");
    assert.equal((await speech(null, { text: "Hi", voice: "untrusted" })).ok, false);
    assert.equal((await speech(null, { text: "x".repeat(4001), voice: "Kore" })).ok, false);
    const wav = Buffer.alloc(46);
    wav.write("RIFF", 0); wav.writeUInt32LE(38, 4); wav.write("WAVE", 8);
    wav.write("fmt ", 12); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24);
    wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write("data", 36); wav.writeUInt32LE(2, 40);
    responseType = "audio/wav"; responseData = wav;
    const wavResult = await speech(null, { text: "Hello again", voice: "Kore" });
    assert.equal(wavResult.ok, true);
    assert.equal(wavResult.mime, "audio/wav");
    assert(Buffer.from(wavResult.audio, "base64").equals(wav));
    responseType = "audio/pcm";
    assert.equal((await speech(null, { text: "Odd bytes", voice: "Kore" })).mime, "audio/wav", "RIFF payload remains WAV even if labelled PCM");
    responseData = Buffer.from("ID3\0wrong-format");
    assert.equal((await speech(null, { text: "Bad audio", voice: "Kore" })).ok, false);
    responseType = "audio/wav"; responseData = Buffer.alloc(48, 1);
    assert.equal((await speech(null, { text: "Bad WAV", voice: "Kore" })).ok, false);
    console.log("PASS OpenRouter speech uses saved key, fixed model and bounded audio");
  } finally {
    https.request = original;
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
