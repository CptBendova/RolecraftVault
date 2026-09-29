// 1.339: the shipped Chat voice rules, lifted from app/chat.js. Which provider a
// reply uses, when a zero-retention story may use ElevenLabs, per-device
// preference defaults, variant overrides and ElevenLabs MP3 playback.
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const source = fs.readFileSync(path.join(__dirname, "..", "app", "chat.js"), "utf8");
const sandbox = { window: { storage: {}, crypto: { randomUUID: () => "test" } }, document: { createElement: () => ({}), body: { appendChild() {} } }, Blob, atob, setTimeout, clearInterval, setInterval };
sandbox.window.React = { createElement: () => ({}), Fragment: "fragment", useState: () => [null, () => {}], useEffect() {}, useMemo: fn => fn(), useRef: () => ({ current: null }) };
sandbox.window.ReactDOM = { createRoot: () => ({ render() {} }) };
vm.runInNewContext(source, sandbox, { filename: "chat.js" });
const I = sandbox.window.__rcvChatInternals;
const VOICE = "21m00Tcm4TlvDq8ikWAM";

(async () => {
  // Preferences: safe defaults, only known values survive.
  assert.deepEqual({ ...I.voicePrefs("") }, { model: "eleven_v4", playback: "tap", zeroRetention: false, allowRetention: false });
  assert.deepEqual({ ...I.voicePrefs("not json") }, { model: "eleven_v4", playback: "tap", zeroRetention: false, allowRetention: false });
  assert.deepEqual({ ...I.voicePrefs(JSON.stringify({ model: "eleven_v4_turbo", playback: "auto", zeroRetention: true, allowRetention: true })) }, { model: "eleven_v4_turbo", playback: "auto", zeroRetention: true, allowRetention: true });
  assert.equal(I.voicePrefs(JSON.stringify({ model: "eleven_v3", playback: "always", allowRetention: "yes" })).model, "eleven_v4");
  assert.equal(I.voicePrefs(JSON.stringify({ playback: "always", allowRetention: "yes" })).allowRetention, false, "only literal true opts in");

  const prefs = patch => ({ ...I.voicePrefs("{}"), ...patch });
  const eleven = { name: "Ari", ttsProvider: "elevenlabs", elevenVoiceId: VOICE };
  const strict = { requireZdr: true }, relaxed = { requireZdr: false }, legacy = {};

  // OpenRouter characters keep the existing request, including story privacy.
  assert.deepEqual(JSON.parse(JSON.stringify(I.voicePlan(strict, { ttsVoice: "Puck", ttsStyle: "Warm" }, prefs({})))), { provider: "openrouter", request: { voice: "Puck", style: "Warm", requireZdr: true } });
  assert.equal(I.voicePlan(relaxed, { ttsProvider: "openrouter" }, prefs({})).request.requireZdr, false);
  assert.equal(I.voicePlan(legacy, {}, prefs({})).request.voice, "Kore");

  // ElevenLabs in a zero-retention story needs an explicit device choice.
  for (const chat of [strict, legacy]) assert.throws(() => I.voicePlan(chat, eleven, prefs({})), /requires zero data retention/, "absent requireZdr stays strict");
  const allowed = I.voicePlan(strict, eleven, prefs({ allowRetention: true }));
  assert.deepEqual(JSON.parse(JSON.stringify(allowed)), { provider: "elevenlabs", request: { voiceId: VOICE, model: "eleven_v4", zeroRetention: false } });
  const enterprise = I.voicePlan(strict, eleven, prefs({ zeroRetention: true, model: "eleven_v4_turbo" }));
  assert.deepEqual(JSON.parse(JSON.stringify(enterprise.request)), { voiceId: VOICE, model: "eleven_v4_turbo", zeroRetention: true });
  assert.equal(I.voicePlan(relaxed, eleven, prefs({})).provider, "elevenlabs", "a story that allows retention needs no extra choice");
  assert.throws(() => I.voicePlan(relaxed, { ...eleven, elevenVoiceId: "" }, prefs({})), /Choose an ElevenLabs voice for Ari/);
  assert.throws(() => I.voicePlan(relaxed, { ...eleven, elevenVoiceId: "../v1/user" }, prefs({})), /Choose an ElevenLabs voice/);
  assert.throws(() => I.voicePlan(relaxed, null, prefs({})), /no character voice/);

  // Variants override the provider and voice only when they set one.
  const base = { id: "c", name: "Ari", ttsProvider: "elevenlabs", elevenVoiceId: VOICE, elevenVoiceName: "Rachel", variants: [
    { id: "inherit", name: "Morning", ttsProvider: "", elevenVoiceId: "" },
    { id: "gemini", name: "Night", ttsProvider: "openrouter", ttsVoice: "Puck" },
    { id: "other", name: "Storm", elevenVoiceId: "AZnzlk1XvdvUeBnXmlld", elevenVoiceName: "Domi" }] };
  assert.equal(I.resolveCharacter(base, "inherit").ttsProvider, "elevenlabs");
  assert.equal(I.resolveCharacter(base, "inherit").elevenVoiceId, VOICE);
  assert.equal(I.resolveCharacter(base, "gemini").ttsProvider, "openrouter");
  assert.equal(I.voicePlan(relaxed, I.resolveCharacter(base, "gemini"), prefs({})).request.voice, "Puck");
  assert.equal(I.resolveCharacter(base, "other").elevenVoiceId, "AZnzlk1XvdvUeBnXmlld");
  assert.equal(I.resolveCharacter(base, "other").elevenVoiceName, "Domi");

  // ElevenLabs MP3 plays as-is; anything that is not MP3 is refused.
  const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(300, 5)]);
  const blob = I.voiceAudioBlob({ mime: "audio/mpeg", audio: mp3.toString("base64") });
  assert.equal(blob.type, "audio/mpeg");
  assert(Buffer.from(await blob.arrayBuffer()).equals(mp3));
  const frame = Buffer.alloc(300, 1); frame[0] = 0xff; frame[1] = 0xfb;
  assert.equal(I.voiceAudioBlob({ mime: "audio/mpeg", audio: frame.toString("base64") }).type, "audio/mpeg");
  assert.throws(() => I.voiceAudioBlob({ mime: "audio/mpeg", audio: Buffer.alloc(300).toString("base64") }), /invalid voice audio/);
  assert.throws(() => I.voiceAudioBlob({ mime: "audio/mpeg", audio: "not base64!" }), /invalid voice audio/);
  console.log("PASS voice plans respect story zero retention unless explicitly allowed, variants override voices, and ElevenLabs MP3 plays");
})().catch(error => { console.error(error); process.exitCode = 1; });
