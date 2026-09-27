"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

// Exercise the shipped planner and completion validator with no provider calls.
const window = {
  storage: {},
  crypto: { randomUUID: crypto.randomUUID },
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "app", "chat.js"), "utf8"), {
  window,
  document: { createElement: () => ({}), body: { appendChild() {} } }
});
const I = window.__rcvChatInternals;
assert(I && I.memoryPlan && I.completedMemory && I.withMemory && I.extendMemory);

const library = { chars: [], personas: [], lore: [] };
const messages = Array.from({ length: 8 }, (_, i) => ({
  id: "m" + i,
  parentId: i ? "m" + (i - 1) : null,
  role: i % 2 ? "assistant" : "user",
  content: i < 3 ? "Established scene event " + i + ": the sentinels withdrew and the key changed hands."
    : "The watchtower remained under observation. ".repeat(500)
}));
const chat = {
  id: "budget-regression",
  title: "Long scene with a short eligible page",
  model: "fixture/64k",
  modelContext: 64000,
  contextTokens: 64000,
  maxTokens: 8192,
  autoMemory: true,
  memoryRecent: 5,
  memoryBatchTokens: 384,
  memoryTriggerTokens: 0,
  messages,
  leafId: messages.at(-1).id,
  memories: [{ id: "earlier", throughId: "m0", text: "Earlier events remained saved. ".repeat(500) }]
};

// Exactly two short turns are eligible, while existing memory and five recent
// long turns carry the 64k request over its 75% automatic-memory threshold.
const assembled = I.assemble(chat, library, null, []);
assert.strictEqual(assembled.limits.window, 64000);
assert.strictEqual(assembled.trimmed, 0, "The fixture must not depend on context truncation");
assert(assembled.untrimmedTokens >= assembled.limits.input * .75,
  "The fixture must reach the selected 75% trigger");
const plan = I.memoryPlan(chat, library, [], false);
assert(plan && plan.count === 2, "Automatic compaction chooses only the two eligible short messages");
assert.strictEqual(plan.summaryTargetTokens, 128,
  "The prompt can ask for a concise short-page summary");
assert.strictEqual(plan.summaryTokens, 384,
  "A short page keeps the selected Balanced saved-history allowance");

const summary = [
  "- Mira recovered Rowan's brass map beside Aster's abandoned observatory; the sentinels retreated toward a rain-darkened causeway beyond the valley.",
  "- Aster witnessed Nessa's warning: Rowan must postpone the expedition until the scouts confirmed their captain's departure from the southern watchtower.",
  "- Rowan accepted Mira's refusal and remained behind the barricade."
].join("\n");
const estimate = I.tokenEstimate(summary);
assert(plan.messages[0].content.includes("characters including spaces and punctuation"),
  "The prompt gives the model both word and character guidance for the short-page target");
assert(estimate > plan.summaryTargetTokens && estimate < plan.summaryTokens,
  "The mock answer modestly exceeds the prompt target but fits Balanced's saved allowance");
const sourceBefore = JSON.stringify(chat);
const accepted = I.completedMemory(summary + "\n[END_MEMORY]", "stop", plan.summaryTokens);
assert.strictEqual(accepted, summary);
let boundedOverage = summary;
for (let i = 0; I.tokenEstimate(boundedOverage) <= plan.summaryTokens; i++) {
  boundedOverage += "\n- Witness " + i + " confirmed the patrol's departure and the key's custody.";
}
assert(I.tokenEstimate(boundedOverage) <= 576, "The secondary mock stays inside bounded tolerance");
assert.strictEqual(I.completedMemory(boundedOverage + "\n[END_MEMORY]", "stop", plan.summaryTokens), boundedOverage,
  "A complete response slightly above the selected allowance is still usable");
const checkpoint = I.extendMemory(chat, plan, accepted);
const next = I.withMemory(chat, checkpoint);
assert.strictEqual(next.memories.length, 2);
assert.strictEqual(JSON.stringify(chat), sourceBefore, "Validation and checkpoint creation do not mutate the source chat");

const oversized = "A very long unsupported summary. ".repeat(100) + "[END_MEMORY]";
assert(I.tokenEstimate(oversized) > 576, "The large mock exceeds the hard bounded tolerance");
assert.throws(() => I.completedMemory(oversized, "stop", plan.summaryTokens), /safe maximum|history budget/,
  "A large overrun still fails closed without creating a checkpoint");
assert.strictEqual(chat.memories.length, 1);
assert.strictEqual(next.memories.length, 2);
console.log("PASS: 64k/75% short-page compaction retains Balanced allowance, accepts a modest complete overage and rejects an extreme one");
