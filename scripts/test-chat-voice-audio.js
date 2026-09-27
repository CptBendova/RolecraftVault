const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app", "chat.js"), "utf8");
const sandbox = {
  window: { storage: {}, crypto: { randomUUID: () => "test" } },
  document: { createElement: () => ({}), body: { appendChild() {} } },
  Blob, atob, setTimeout, clearInterval, setInterval
};
sandbox.window.React = { createElement: () => ({}), Fragment: "fragment", useState: () => [null, () => {}], useEffect() {}, useMemo: fn => fn(), useRef: () => ({ current: null }) };
sandbox.window.ReactDOM = { createRoot: () => ({ render() {} }) };
vm.runInNewContext(source, sandbox, { filename: "chat.js" });
const make = sandbox.window.__rcvChatInternals.voiceAudioBlob;
assert.equal(typeof make, "function");

(async () => {
  const raw = Buffer.alloc(32);
  const result = { mime: "audio/pcm", audio: raw.toString("base64"), sampleRate: 24000, channels: 1, bitsPerSample: 16, littleEndian: true };
  const blob = make(result), wav = Buffer.from(await blob.arrayBuffer());
  assert.equal(blob.type, "audio/wav");
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt32LE(4), 36 + raw.length);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), raw.length);
  assert.deepEqual(wav.subarray(44), raw);
  const alreadyWav = make({ mime: "audio/wav", audio: wav.toString("base64") });
  assert.deepEqual(Buffer.from(await alreadyWav.arrayBuffer()), wav, "a RIFF response must not get a second header");
  assert.throws(() => make({ ...result, mime: "audio/mpeg" }), /invalid voice audio/);
  assert.throws(() => make({ ...result, sampleRate: 16000 }), /unsupported PCM/);
  assert.throws(() => make({ ...result, audio: Buffer.alloc(17).toString("base64") }), /unsupported PCM/);
  console.log("PASS Gemini raw PCM is wrapped as 24 kHz mono WAV and existing WAV is preserved");
})().catch(error => { console.error(error); process.exitCode = 1; });
