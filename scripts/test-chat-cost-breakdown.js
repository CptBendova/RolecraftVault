#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const window = {
  storage: {},
  crypto: { randomUUID: () => "generated-id" },
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "app", "chat.js"), "utf8"), {
  window, document: { createElement: () => ({}), body: { appendChild() {} } },
});
const I = window.__rcvChatInternals;
assert(I && I.chatCostBreakdown, "cost calculations use the shipped Chat implementation");
const chat = {
  leafId: "a2",
  messages: [
    { id: "u1", parentId: null, role: "user", content: "Hello" },
    { id: "a1", parentId: "u1", role: "assistant", content: "Hi", usage: { cost: 0.01 } },
    { id: "u2", parentId: "a1", role: "user", content: "Continue" },
    { id: "a2", parentId: "u2", role: "assistant", content: "Now", usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.02 } },
  ],
  memories: [
    { id: "memory", throughId: "a1", text: "History", forReplyId: "a2", usage: { prompt_tokens: 300, completion_tokens: 30, cost: 0.001 } },
    { id: "old", throughId: "u1", text: "Earlier", usage: { prompt_tokens: 20, completion_tokens: 5 } },
  ],
};
const extras = {
  a2: {
    director: { requests: 2, knownCost: 0.0004, unknownCostRequests: 1 },
    coordinator: { requests: 1, knownCost: null, unknownCostRequests: 1 },
  },
};
const costs = I.chatCostBreakdown(chat, extras);
assert.strictEqual(costs.groups.roleplay.knownCost, 0.03);
assert.strictEqual(costs.groups.memory.knownCost, 0.001);
assert.strictEqual(costs.groups.memory.unknownCostRequests, 1);
assert.strictEqual(costs.groups.director.requests, 2, "repeat checks cannot disappear from the cost ledger");
assert.strictEqual(costs.groups.coordinator.unknownCostRequests, 1, "an unavailable provider price is not zero");
assert.strictEqual(costs.last.roleplay.knownCost, 0.02);
assert.strictEqual(costs.last.memory.knownCost, 0.001, "summary work is attributed to its generating reply");
assert.strictEqual(costs.last.director.knownCost, 0.0004);
assert.strictEqual(I.chatCostBreakdown(chat, {}).groups.coordinator.requests, 0);
assert.strictEqual(I.groupSpendGate(chat, extras, 0.01).enabled, false, "spending warnings are opt-in");
const warned = I.groupSpendGate({ ...chat, groupSpendLimitUsd: 0.05 }, extras, 0.02);
assert.strictEqual(warned.enabled, true);
assert(warned.known >= 0.0314 && warned.known < 0.032, "reported charges form a lower bound");
assert.strictEqual(warned.needsApproval, true, "a queued estimate that crosses the warning requires confirmation");
assert.strictEqual(I.groupSpendGate({ ...chat, groupSpendLimitUsd: 0.25 }, {}, 0.001).needsApproval, true, "unknown historical charges must not be mistaken for zero");
assert.strictEqual(I.groupSpendGate({ ...chat, groupSpendLimitUsd: 0.25, memories: [] }, {}, 0.001).needsApproval, false, "known spending below the threshold does not interrupt ordinary use");
const withLanes = { ...chat, knowledgeLaneMemories: { '["a",""]': [{ id: "lane-a", forReplyId: "a2", usage: { cost: 0.004 } }], '["b",""]': [{ id: "lane-b", usage: { prompt_tokens: 10 } }] } };
assert.strictEqual(I.chatCostBreakdown(withLanes, {}).groups.memory.knownCost, 0.005, "per-speaker memory calls count toward group spending");
assert.strictEqual(I.chatCostBreakdown(withLanes, {}).groups.memory.unknownCostRequests, 2, "unpriced lane summaries remain unknown");
const saved = I.extendMemory({ model: "test/model" }, { throughId: "u2", fromId: "u1", previousThroughId: null, previousText: "", start: 0, count: 1, estimatedInputTokens: 50, summaryTokens: 100, maxTokens: 200, usage: { prompt_tokens: 30, completion_tokens: 8, prompt_tokens_details: { cached_tokens: 20 }, cost: 0.0002 } }, "Event [END_MEMORY]", "a2");
assert.strictEqual(saved.usage.cost, 0.0002, "provider-reported memory price survives the checkpoint");
assert.strictEqual(saved.usage.prompt_tokens_details.cached_tokens, 20);
assert.strictEqual(saved.forReplyId, "a2");
console.log("PASS: per-feature provider cost, unavailable prices, and linked memory attribution");
