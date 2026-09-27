const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const window = {
  storage: {},
  crypto: { randomUUID: crypto.randomUUID },
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) }
};
vm.runInNewContext(fs.readFileSync(path.join(root, "app/chat.js"), "utf8"), {
  window,
  document: { createElement: () => ({}), body: { appendChild() {} } }
});
const I = window.__rcvChatInternals;
const library = { chars: [], personas: [], lore: [] };
const plain = value => JSON.parse(JSON.stringify(value));
assert.strictEqual(typeof I.extendMemory, "function", "Compaction must append using the shipped memory helper, not replace previous facts with a new summary");

function addTurns(chat, count, prefix = "m", start = chat.messages.length) {
  const added = Array.from({ length: count }, (_, i) => ({
    id: prefix + (start + i),
    parentId: i ? prefix + (start + i - 1) : chat.leafId || null,
    role: (start + i) % 2 ? "assistant" : "user",
    content: "UNIQUE_EVENT_" + prefix + (start + i) + ": " + "A new fact happened in this scene. ".repeat(12)
  }));
  return { ...chat, messages: chat.messages.concat(added), leafId: added.at(-1).id };
}

function verifyPlan(chat, plan) {
  const history = I.activePath(chat).filter(m => !m.pending);
  const current = I.memoryFor(chat, history);
  const prior = current.entry ? current.entry.text : "";
  const start = current.index + 1;
  const body = JSON.parse(plan.messages[1].content);
  assert.strictEqual(body.previousMemory, plan.previousText, "The planned excerpt is the only earlier memory sent to the worker");
  assert(body.previousMemory.length <= 1800, "Repeated compaction has a bounded prior-memory input cost");
  assert(prior.endsWith(body.previousMemory.slice(-Math.min(1700, body.previousMemory.length))), "The excerpt comes from the latest prior memory, including edits");
  assert.strictEqual(plan.previousThroughId || null, current.entry ? current.entry.throughId : null);
  assert.strictEqual(plan.fromId, history[start].id, "The new span begins immediately after the previous checkpoint");
  assert.strictEqual(plan.throughId, history[start + plan.count - 1].id);
  assert.deepStrictEqual(body.olderMessages, plain(history.slice(start, start + plan.count).map(({ role, content }) => ({ role, content }))), "Every message in the span is supplied once, in order, without a gap");
  assert(start + plan.count <= I.recentStart(history, 5), "Five messages plus a pending user turn stay unabridged");
  assert.match(plan.messages[0].content, /addition|incremental|append/i, "The worker produces only the new period's addition");
  assert.match(plan.messages[0].content, /(?:do not|never)[^.\n]*(?:rewrite|replace|repeat|summari[sz]e)[^.\n]*(?:previous|existing)|(?:previous|existing)[^.\n]*(?:reference only|read.only)/i, "The worker must not rewrite or repeat old memory");
  const limits = I.contextLimits({ ...chat, maxTokens: plan.maxTokens }, []);
  assert(plan.messages.reduce((sum, m) => sum + I.tokenEstimate(m.content), 0) <= limits.input, "The bounded excerpt and complete new span fit alongside the worker's output reservation");
  return { history, prior, start, ids: history.slice(start, start + plan.count).map(m => m.id) };
}

function append(chat, plan, delta) {
  const original = JSON.stringify(chat);
  const info = verifyPlan(chat, plan);
  const entry = I.extendMemory(chat, plan, delta);
  assert.strictEqual(JSON.stringify(chat), original, "Preparing a checkpoint cannot mutate the original conversation");
  assert.strictEqual(entry.throughId, plan.throughId);
  assert.strictEqual(entry.fromId, plan.fromId);
  assert.strictEqual(entry.previousThroughId || null, plan.previousThroughId || null);
  assert.strictEqual(entry.format, "incremental-v2");
  assert(entry.text.endsWith(delta), "The new stored segment contains the new chronological addition");
  assert(!info.prior || !entry.text.startsWith(info.prior), "The stored segment does not copy all earlier memory");
  const next = I.withMemory(chat, entry);
  const resolved = I.memoryFor(next, I.activePath(next)).entry.text;
  assert.strictEqual(resolved, (info.prior ? info.prior + "\n\n" : "") + entry.text, "Every byte of prior memory survives reconstruction for the reply");
  return { next, entry, resolved, info };
}

let story = addTurns({ id: "incremental", title: "Memory fixture", model: "fixture/model", contextTokens: 12000, maxTokens: 500, messages: [], memoryPins: "Keep the promise." }, 20);
const seen = [];
const snapshots = [];
let requests = 0;
for (let cycle = 1; cycle <= 3; cycle++) {
  if (cycle > 1) story = addTurns(story, 10);
  const transcript = JSON.stringify(story.messages);
  let plan;
  while ((plan = I.memoryPlan(story, library, [], true))) {
    assert(++requests < 30, "Sequential memory work always advances");
    const result = append(story, plan, "ADDITION_" + requests + ": Events " + plan.fromId + " through " + plan.throughId + ".");
    seen.push(...result.info.ids);
    for (const snapshot of snapshots) assert(result.resolved.startsWith(snapshot), "Third and later compactions retain every prior addition, not just the latest summary");
    story = result.next;
  }
  const history = I.activePath(story);
  assert.deepStrictEqual(seen, plain(history.slice(0, I.recentStart(history, 5)).map(m => m.id)), "Repeated compactions neither duplicate nor omit any compacted message");
  assert.strictEqual(new Set(seen).size, seen.length);
  assert.strictEqual(JSON.stringify(story.messages), transcript, "Compaction never hides or replaces the stored full transcript");
  const latest = I.memoryFor(story, history).entry;
  snapshots.push(latest.text);
  const assembled = I.assemble(story, library, null, []);
  assert(assembled.messages[0].content.includes(latest.text), "The entire accumulated memory is sent on the next roleplay request");
  assert.deepStrictEqual(plain(assembled.messages.slice(1).map(m => m.content)), plain(history.slice(I.recentStart(history, 5)).map(m => m.content)));
}
assert(requests >= 3, "The regression must exercise at least three compactions");

// A first compaction can require several provider-sized batches. Their boundaries
// must move forward exactly once too, even as the cumulative memory grows.
let catchup = addTurns({ id: "catchup", title: "Long history", model: "fixture/model", contextTokens: 4096, maxTokens: 256, messages: [] }, 30);
catchup = { ...catchup, messages: catchup.messages.map(m => ({ ...m, content: m.content.repeat(3) })) };
const catchupTranscript = JSON.stringify(catchup.messages);
const batchedIds = [];
let batches = 0;
let batch;
while ((batch = I.memoryPlan(catchup, library, [], true))) {
  assert(++batches < 30, "Bounded catch-up batches cannot loop on the same span");
  const result = append(catchup, batch, "BATCH_" + batches + ": Important new events.");
  batchedIds.push(...result.info.ids);
  catchup = result.next;
}
assert(batches > 1, "This fixture must exercise actual provider-sized split batches");
assert.deepStrictEqual(batchedIds, catchup.messages.slice(0, 25).map(m => m.id));
assert.strictEqual(JSON.stringify(catchup.messages), catchupTranscript);

// Old installed copies have cumulative checkpoints without any new provenance fields.
const legacyText = "  Original legacy memory.\nThe character promised to return.\n  ";
let legacy = addTurns({ id: "legacy", title: "Old story", model: "fixture/model", contextTokens: 12000, maxTokens: 500, messages: [], memories: [{ id: "legacy-checkpoint", throughId: "m7", text: legacyText }] }, 22);
legacy = plain(I.parseChats(JSON.stringify([legacy]))[0]);
let plan = I.memoryPlan(legacy, library, [], true);
assert.strictEqual(plan.fromId, "m8", "Legacy summaries do not cause old transcript messages to be compacted twice");
assert.strictEqual(plan.previousText, legacyText, "Legacy checkpoint whitespace is preserved verbatim");
let result = append(legacy, plan, "LEGACY_ADDITION: They met again.");
assert(result.resolved.startsWith(legacyText));

// Manual edits to the selected checkpoint are authoritative, not stale older checkpoints.
const editedText = "My corrected facts:\nThey are allies, never siblings.\n" + result.resolved;
let edited = I.replaceMemoryText(result.next, result.entry, editedText);
edited = addTurns(edited, 10);
plan = I.memoryPlan(edited, library, [], true);
assert.strictEqual(I.memoryFor(edited, I.activePath(edited)).entry.text, editedText);
result = append(edited, plan, "EDITED_ADDITION: A new journey began.");
assert(result.resolved.startsWith(editedText));

// Reusing the immutable tree for another branch cannot import the original future.
const originalStory = JSON.stringify(story);
const sibling = addTurns({ ...story, leafId: "m20" }, 12, "alternate", 0);
plan = I.memoryPlan(sibling, library, [], true);
assert(snapshots[0].endsWith(plan.previousText.slice(-Math.min(1700, plan.previousText.length))), "A sibling can use the shared ancestor's checkpoint, not later compactions on the original branch");
result = append(sibling, plan, "SIBLING_ADDITION: A different future.");
assert(!result.resolved.includes("ADDITION_3"), "The original branch's future must not leak into the sibling");
assert.strictEqual(JSON.stringify(story), originalStory);

const fork = I.forkConversation(story, story.leafId);
const forkIds = new Set(fork.messages.map(m => m.id));
for (const memory of fork.memories) {
  assert(forkIds.has(memory.throughId));
  if (memory.fromId) assert(forkIds.has(memory.fromId), "A fork remaps the new span start to its own transcript");
  if (memory.previousThroughId) assert(forkIds.has(memory.previousThroughId), "A fork remaps prior span provenance to its own transcript");
}
assert.strictEqual(I.memoryFor(fork, I.activePath(fork)).entry.text, snapshots.at(-1), "Forking preserves complete accumulated memory");
console.log("PASS: additive memory across three cycles, exact message spans, legacy and edited checkpoints, branch isolation and fork provenance");
