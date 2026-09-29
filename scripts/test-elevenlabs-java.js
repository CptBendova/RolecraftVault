// 1.339: compile and run the shipped Android ElevenLabsCodec, and hold its
// limits and wording in step with app/elevenlabs.js. No device or provider call.
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), {execFileSync} = require('child_process');
const root = path.join(__dirname, '..');
const base = path.join(root, 'mobile/android/app/src/main/java/com/cptbendova/rolecraftvault');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcv-eleven-java-'));
const dir = path.join(temp, 'com/cptbendova/rolecraftvault');
fs.mkdirSync(dir, {recursive: true});
fs.copyFileSync(path.join(base, 'ElevenLabsCodec.java'), path.join(dir, 'ElevenLabsCodec.java'));
fs.writeFileSync(path.join(dir, 'ElevenCheck.java'), `package com.cptbendova.rolecraftvault;
public class ElevenCheck {
  static void check(boolean ok, String label) { if (!ok) throw new AssertionError(label); }
  static boolean rejects(java.util.concurrent.Callable<?> task) { try { task.call(); return false; } catch (java.io.IOException expected) { return true; } catch (Exception other) { throw new AssertionError(other); } }
  public static void main(String[] args) throws Exception {
    check(ElevenLabsCodec.model(null).equals("eleven_v4") && ElevenLabsCodec.model("").equals("eleven_v4"), "default model");
    check(ElevenLabsCodec.model("eleven_v4_turbo").equals("eleven_v4_turbo"), "turbo model");
    check(rejects(() -> ElevenLabsCodec.model("eleven_v3")), "unknown model");
    check(ElevenLabsCodec.voiceId("21m00Tcm4TlvDq8ikWAM").equals("21m00Tcm4TlvDq8ikWAM"), "voice id");
    check(rejects(() -> ElevenLabsCodec.voiceId("../v1/user")) && rejects(() -> ElevenLabsCodec.voiceId("short")), "path-like or short voice ids");
    check(rejects(() -> ElevenLabsCodec.text(new String(new char[4001]).replace('\\0', 'x'))) && rejects(() -> ElevenLabsCodec.text("   ")), "text bounds");
    check(ElevenLabsCodec.text(new String(new char[4000]).replace('\\0', 'x')).length() == 4000, "4000 characters allowed");
    check(rejects(() -> ElevenLabsCodec.key("short")) && ElevenLabsCodec.key("  sk_abcdefghijklmnop  ").equals("sk_abcdefghijklmnop"), "key");
    check(rejects(() -> ElevenLabsCodec.pageToken("bad token\\n")) && ElevenLabsCodec.pageToken("page-2_token").equals("page-2_token"), "page token");
    check(ElevenLabsCodec.responseToken("x y").isEmpty(), "response token sanitised");
    check(ElevenLabsCodec.category("premade").equals("premade") && ElevenLabsCodec.category("Evil<b>").isEmpty(), "category");
    byte[] id3 = new byte[300]; id3[0] = 'I'; id3[1] = 'D'; id3[2] = '3';
    byte[] frame = new byte[300]; frame[0] = (byte) 0xff; frame[1] = (byte) 0xfb;
    check(ElevenLabsCodec.isMp3(id3, "audio/mpeg") && ElevenLabsCodec.isMp3(frame, "audio/mpeg; charset=binary"), "mp3 accepted");
    check(!ElevenLabsCodec.isMp3(new byte[300], "audio/mpeg") && !ElevenLabsCodec.isMp3(id3, "text/html") && !ElevenLabsCodec.isMp3(new byte[3], "audio/mpeg"), "non-mp3 refused");
    check(ElevenLabsCodec.plain("Rachel\\u202e https://x.example/a  calm", 100).equals("Rachel calm"), "plain text");
    String failure = ElevenLabsCodec.providerFailure(422, "Bad input for sk_secret_key near Hello secret", "sk_secret_key", "Hello secret");
    check(!failure.contains("sk_secret_key") && !failure.contains("Hello secret") && failure.startsWith("ElevenLabs rejected the request (HTTP 422)."), failure);
    check(!ElevenLabsCodec.providerFailure(401, "key sk_abc invalid").contains("invalid"), "401 bodies never echoed");
    check(ElevenLabsCodec.providerFailure(302, "moved").contains("redirect") && !ElevenLabsCodec.providerFailure(302, "moved").contains("moved"), "redirect");
    System.out.println(ElevenLabsCodec.MAX_TEXT + "|" + ElevenLabsCodec.MAX_AUDIO + "|" + ElevenLabsCodec.OUTPUT_FORMAT + "|" + ElevenLabsCodec.HOST + "|" + ElevenLabsCodec.httpFailure(429));
  }
}
`);
try {
  execFileSync('javac', ['-encoding', 'UTF-8', '-d', temp, path.join(dir, 'ElevenLabsCodec.java'), path.join(dir, 'ElevenCheck.java')], {windowsHide: true});
  const out = execFileSync('java', ['-cp', temp, 'com.cptbendova.rolecraftvault.ElevenCheck'], {encoding: 'utf8', windowsHide: true}).trim().split('|');
  // Android and Windows must agree on limits, format, host and wording.
  const windows = fs.readFileSync(path.join(root, 'app/elevenlabs.js'), 'utf8');
  assert.equal(out[0], windows.match(/const MAX_TEXT = (\d+);/)[1], 'text limit parity');
  assert.equal(Number(out[1]), 16 * 1024 * 1024); assert(/const MAX_AUDIO = 16 \* 1024 \* 1024;/.test(windows), 'audio limit parity');
  assert.equal(out[2], windows.match(/const OUTPUT_FORMAT = "([^"]+)";/)[1], 'output format parity');
  assert.equal(out[3], 'https://' + windows.match(/const HOST = "([^"]+)";/)[1], 'host parity');
  assert(windows.includes(JSON.stringify(out[4])), 'rate-limit wording parity');
  const plugin = fs.readFileSync(path.join(base, 'ElevenLabsPlugin.java'), 'utf8');
  assert(/setInstanceFollowRedirects\(false\)/.test(plugin), 'Android never follows redirects');
  assert(/getPackageName\(\)\.equals\("com\.cptbendova\.rolecraftvault\.chat"\)/.test(plugin), 'only the Rolecraft app package may use it');
  assert(/handleOnPause\(\) \{ foreground = false; unlocked = false; stopAll\(\);/.test(plugin), 'backgrounding locks and cancels');
  assert(/registerPlugin\(ElevenLabsPlugin\.class\)/.test(fs.readFileSync(path.join(base, 'MainActivity.java'), 'utf8')), 'plugin registered');
  console.log('PASS Android ElevenLabs codec validates requests, MP3 and errors in step with Windows; plugin never follows redirects and stops in the background');
} finally { fs.rmSync(temp, {recursive: true, force: true}); }
