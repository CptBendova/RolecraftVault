#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const native = require(path.join(root, 'app', 'openrouter.js'));
assert.deepStrictEqual(native.catalogPricing({ prompt: '0.000001', completion: '2e-6' }), { prompt: 0.000001, completion: 0.000002 });
assert.deepStrictEqual(native.catalogPricing({ prompt: '0', completion: '0' }), { prompt: 0, completion: 0 }, 'free models retain a real zero price');
for (const pricing of [{ prompt: '', completion: '0.1' }, { prompt: '-1', completion: '0' }, { prompt: '0', completion: 'Infinity' }, { prompt: null, completion: '0' }]) {
  assert.strictEqual(native.catalogPricing(pricing), null, 'incomplete or invalid catalog prices are unknown');
}

const window = {
  storage: {},
  crypto: { randomUUID: () => 'fixture-id' },
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) },
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'app', 'chat.js'), 'utf8'), {
  window, document: { createElement: () => ({}), body: { appendChild() {} } },
});
const I = window.__rcvChatInternals;
assert(I && I.estimateReplyCost && I.estimateQueueCost, 'prices use the shipped Chat helpers');
const models = [{ id: 'fixture/paid', context_length: 32000, max_completion_tokens: 100, pricing: { prompt: 0.000001, completion: 0.000002 } }];
const chat = { model: 'fixture/paid', contextTokens: 32000, maxTokens: 100, messages: [], memories: [], leafId: null, characterId: 'ari', personaId: 'player', participants: [{ characterId: 'ari', variantId: '' }, { characterId: 'bea', variantId: '' }], activeSpeakerKey: JSON.stringify(['ari', '']) };
const one = I.estimateReplyCost(chat, 1000, models);
assert.strictEqual(one.assumedOutputTokens, 50);
assert(Math.abs(one.expectedUsd - 0.0011) < 1e-12);
assert(Math.abs(one.fullCapUsd - 0.0012) < 1e-12);
assert.strictEqual(I.estimateReplyCost(chat, 1000, [{ id: chat.model, pricing: { prompt: 'unknown', completion: '0' } }]), null);
assert.strictEqual(I.estimateReplyCost(Object.assign({}, chat, { model: 'openrouter/auto' }), 1000, models), null, 'dynamic aliases do not borrow another model price');
const library = { chars: [{ id: 'ari', name: 'Ari', story: 'A'.repeat(60) }, { id: 'bea', name: 'Bea', story: 'B'.repeat(600) }], personas: [{ id: 'player', name: 'Robin' }], lore: [] };
const keys = [JSON.stringify(['ari', '']), JSON.stringify(['bea', ''])];
const queue = I.estimateQueueCost(chat, library, 'Robin asks for help.', models, keys);
const noDraft = I.estimateQueueCost(chat, library, '', models, keys);
assert.strictEqual(queue.requests, 2);
assert(queue.expectedUsd > noDraft.expectedUsd, 'draft affects the first and later queued contexts');
assert(queue.fullCapUsd > queue.expectedUsd, 'later replies grow the context and full-cap scenario');
assert.strictEqual(I.estimateQueueCost(chat, library, '', [], keys), null, 'missing catalog price stays unknown');

const javaSource = fs.readFileSync(path.join(root, 'mobile', 'android', 'app', 'src', 'main', 'java', 'com', 'cptbendova', 'rolecraftvault', 'OpenRouterPlugin.java'), 'utf8');
const start = javaSource.indexOf('private static Double catalogTokenPrice(');
assert(start >= 0, 'Android bridge exposes catalog pricing validator');
let cursor = javaSource.indexOf('{', start) + 1, depth = 1;
for (; depth && cursor < javaSource.length; cursor++) { if (javaSource[cursor] === '{') depth++; else if (javaSource[cursor] === '}') depth--; }
assert.strictEqual(depth, 0);
const method = javaSource.slice(start, cursor);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcv-price-java-'));
try {
  fs.writeFileSync(path.join(tmp, 'PriceCheck.java'), `import java.util.*;
public class PriceCheck {
  static class JSONObject { final Map<String,Object> data; JSONObject(Map<String,Object> data) { this.data=data; } Object opt(String key) { return data.get(key); } }
  ${method}
  static void check(boolean good) { if (!good) throw new AssertionError("Android catalog price validation"); }
  public static void main(String[] args) {
    check(catalogTokenPrice(new JSONObject(Map.of("prompt", "0.000001")), "prompt").equals(0.000001));
    check(catalogTokenPrice(new JSONObject(Map.of("prompt", "0")), "prompt").equals(0.0));
    check(catalogTokenPrice(new JSONObject(Map.of("prompt", "-1")), "prompt") == null);
    check(catalogTokenPrice(new JSONObject(Map.of("prompt", "Infinity")), "prompt") == null);
    check(catalogTokenPrice(new JSONObject(Map.of("completion", "0.1")), "prompt") == null);
  }
}`);
  execFileSync('javac', ['-encoding', 'UTF-8', 'PriceCheck.java'], { cwd: tmp, windowsHide: true, timeout: 15000 });
  execFileSync('java', ['-cp', tmp, 'PriceCheck'], { cwd: tmp, windowsHide: true, timeout: 15000 });
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log('PASS native catalog price validation, single and queued estimates, unknown prices, Android parity');
