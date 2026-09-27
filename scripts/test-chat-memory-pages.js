"use strict";

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
vm.runInNewContext(process.env.RCV_CHAT_REGRESSION_BASE ? require('child_process').execFileSync('git',['show',process.env.RCV_CHAT_REGRESSION_BASE+':app/chat.js'],{cwd:root,encoding:'utf8'}) : fs.readFileSync(path.join(root, "app/chat.js"), "utf8"), {
  window,
  document: { createElement: () => ({}), body: { appendChild() {} } }
});
const I = window.__rcvChatInternals;
assert(I && I.memoryPlan && I.extendMemory && I.forkConversation,
  "Exercise the shipped memory planning and incremental checkpoint helpers");
const emptyLibrary = { chars: [], personas: [], lore: [] };
const makeMessages = (count, content = i => "EVENT_" + String(i).padStart(3, "0") + ": event " + i + " was established.") =>
  Array.from({ length: count }, (_, i) => ({ id: "m" + i, parentId: i ? "m" + (i - 1) : null,
    role: i % 2 ? "assistant" : "user", content: content(i) }));
const messages = makeMessages(80);
const chat = { id: "story", title: "Long story", model: "fixture/large-context", modelContext: 1000000,
  contextTokens: 1000000, maxTokens: 2000, autoMemory: true, memoryRecent: 5,
  messages, leafId: messages.at(-1).id, memoryPins: "The copper key must be returned." };

// A million-token model must not turn the entire older transcript into one tiny
// recap. Force uses the same planner as automatic catch-up and a manual rebuild.
const initial = I.memoryPlan(chat, emptyLibrary, [], true);
const historyInstruction = initial.messages[0].content;
assert(initial.summaryTokens >= 128 && initial.summaryTokens <= 384, "Saved summary stays small independently of the million-token window");
assert(initial.maxTokens > initial.summaryTokens && initial.maxTokens <= 8192, "Generation reserves separate room for hidden reasoning and the completion marker");
assert.throws(() => I.completedMemory('unfinished', 'length', initial.summaryTokens), /output limit.*retry this action.*No incomplete summary was saved/, "Token exhaustion has actionable wording for Send and rebuild");
assert.throws(() => I.completedMemory('Long memory. '.repeat(500) + '[END_MEMORY]', 'stop', initial.summaryTokens), /safe maximum/, "Extra generation room cannot bloat saved history");
assert.equal(I.completedMemory('A short event. [END_MEMORY]', 'stop', initial.summaryTokens), 'A short event.');
assert.throws(() => I.completedMemory('A short event. [END_MEMORY]', '', initial.summaryTokens), /finish status: missing/, "A marker without provider completion is not trusted");
assert.throws(() => I.completedMemory('A short event. [END_MEMORY]', 'tool_calls', initial.summaryTokens), /finish status: other/, "Unexpected provider finishes stay distinct from format failures");
assert.throws(() => I.completedMemory('A short event.', 'stop', initial.summaryTokens), /required end marker.*visible characters/, "A normal stop without the marker reports a content-free format diagnosis");
const deepseekPage = I.memoryPlan({ ...chat, memoryModel: 'deepseek/deepseek-v4.1-flash' }, emptyLibrary, [], true);
assert.strictEqual(deepseekPage.outputFormat, 'json', "The separate DeepSeek memory model chooses structured output without changing the roleplay model");
assert(deepseekPage.messages[0].content.includes('history') && !deepseekPage.messages[0].content.includes('processed_messages') && !deepseekPage.messages[0].content.includes('Finish with the exact marker'), "The worker prompt asks for history without a self-reported message count");
const deepseekAddition = '- A short event from the supplied messages.';
assert.strictEqual(I.completedMemory(JSON.stringify({ history: deepseekAddition }), 'stop', deepseekPage.summaryTokens, deepseekPage.outputFormat), deepseekAddition);
assert.strictEqual(I.completedMemory(JSON.stringify({ history: deepseekAddition, processed_messages: 0 }), 'stop', deepseekPage.summaryTokens, deepseekPage.outputFormat), deepseekAddition, "A legacy model-generated count cannot veto a valid completed history");
assert.throws(() => I.completedMemory(JSON.stringify({ history: 8 }), 'stop', deepseekPage.summaryTokens, deepseekPage.outputFormat), /valid structured history/, "Non-text history is not saved");
assert.throws(() => I.completedMemory(JSON.stringify({ processed_messages: deepseekPage.count }), 'stop', deepseekPage.summaryTokens, deepseekPage.outputFormat), /valid structured history/, "A count without history is not saved");
assert.throws(() => I.completedMemory(JSON.stringify({ history: deepseekAddition }), 'length', deepseekPage.summaryTokens, deepseekPage.outputFormat), /output limit/, "Even structured text requires a confirmed normal finish");
assert.throws(() => I.completedMemory('A plain refusal.', 'stop', deepseekPage.summaryTokens, deepseekPage.outputFormat), /valid structured history/, "A provider refusal is not saved as story memory");
for (const cap of [256, 384, 640]) {
  const budgeted = I.memoryPlan({ ...chat, memoryBatchTokens: cap }, emptyLibrary, [], true);
  assert(budgeted.summaryTokens <= cap, "Per-story saved summary ceiling is enforced separately from generation");
}
const longRows = makeMessages(500, i => "EVENT_" + i + " " + "a recorded story development. ".repeat(45));
let longChat = { ...chat, messages: longRows, leafId: longRows.at(-1).id }, maxOutput = 0, spans = 0;
for (;;) {
  const page = I.memoryPlan(longChat, emptyLibrary, [], true);
  if (!page) break;
  maxOutput += page.summaryTokens; spans++;
  longChat = I.withMemory(longChat, I.extendMemory(longChat, page, "Historical event " + spans + "."));
}
assert.equal(I.memoryFor(longChat, I.activePath(longChat)).index + 1, 495, "500-message compaction still covers all older history");
assert(spans <= 62 && maxOutput <= 62 * 384, "500 ordinary turns do not save thousands of summary tokens per batch");
assert(historyInstruction.includes("Record only established story history"),
  "Compaction requests factual history rather than analysis of unfinished plot threads");
assert(historyInstruction.includes('Do not add "Unresolved", "Open threads", "Next steps" or similar sections'),
  "Every batch explicitly forbids repetitive planning/status sections");
assert(!/boundaries, unresolved threads|bullets with any unresolved consequences/.test(historyInstruction),
  "The old positive instructions to produce unresolved consequences must be removed");
assert(historyInstruction.includes("regardless of the format used in previousMemory"),
  "Existing summaries must not teach the next batch to repeat legacy sections");
assert(initial.count <= 8, "A memory page must contain no more than eight new messages even with a million-token model");
assert.strictEqual(I.memoryPlan(chat, emptyLibrary, [], false), null,
  "Paging does not cause automatic compaction below the existing 75% threshold");

// Rebuild a copy whose old second checkpoint only remembered late events. These
// are simulated worker additions, not a claim about a live provider's recall.
const damaged = { ...chat, memories: [
  { id: "old-first", throughId: "m15", text: "A lost early summary." },
  { id: "old-second", throughId: "m60", text: "Only the most recent event survived the old summary." }
] };
const sourceBefore = JSON.stringify(damaged);
let rebuilt = { ...I.forkConversation(damaged, damaged.leafId), memories: [] };
const sent = [];
let pages = 0, priorText = "";
for (;;) {
  const plan = I.memoryPlan(rebuilt, emptyLibrary, [], true);
  if (!plan) break;
  assert(++pages <= 80, "Every page advances the reconstruction boundary");
  assert(plan.count > 0 && plan.count <= 8);
  const body = JSON.parse(plan.messages[1].content);
  assert.strictEqual(body.olderMessages.length, plan.count);
  assert.strictEqual(body.previousMemory, plan.previousText, "Only the planner's prior-memory excerpt is sent to the worker");
  assert(body.previousMemory.length <= 1800, "The summarizer's repeated prior-memory input is bounded");
  assert(priorText.endsWith(body.previousMemory.slice(-Math.min(1700, body.previousMemory.length))), "The excerpt reflects the latest already-saved history");
  assert(!body.previousMemory.includes("Only the most recent event survived"), "Rebuild ignores destructive legacy summaries");
  const events = body.olderMessages.map(row => {
    const match = row.content.match(/EVENT_(\d+)/);
    assert(match, "Every actual transcript turn reaches the worker");
    sent.push(Number(match[1]));
    return "Established event " + match[1] + ".";
  });
  const addition = I.completedMemory(events.join("\n") + "\n[END_MEMORY]", "stop");
  const entry = I.extendMemory(rebuilt, plan, addition);
  assert.strictEqual(entry.format, "incremental-v2", "Each saved checkpoint is an incremental segment");
  assert(!priorText || !entry.text.startsWith(priorText), "Saved checkpoints no longer repeat the complete prior history");
  rebuilt = I.withMemory(rebuilt, entry);
  const resolved = I.memoryFor(rebuilt, I.activePath(rebuilt)).entry.text;
  assert.strictEqual(resolved, (priorText ? priorText + "\n\n" : "") + entry.text, "All earlier additions reconstruct exactly for the next reply");
  priorText = resolved;
  const limits = I.contextLimits({ ...rebuilt, maxTokens: plan.maxTokens }, []);
  assert(plan.messages.reduce((sum, row) => sum + I.tokenEstimate(row.content), 0) <= limits.input,
    "Actual serialized worker input, including previous memory, fits its reserved budget");
}
assert(pages >= 10, "All 75 older messages are processed in small chronological pages");
assert.deepStrictEqual(sent, Array.from({ length: 75 }, (_, i) => i),
  "Early, middle and late transcript messages must each be summarized exactly once and in order");
const assembled = I.assemble(rebuilt, emptyLibrary, null, []);
assert.strictEqual(assembled.compacted, 75);
for (const event of ["000", "037", "074"]) assert(assembled.messages[0].content.includes("Established event " + event + "."),
  "Early, middle and late facts all survive into the next roleplay request");
assert.deepStrictEqual(Array.from(assembled.messages.slice(1), row => row.content), messages.slice(-5).map(row => row.content),
  "The latest five messages stay verbatim after a complete reconstruction");
assert.deepStrictEqual(Array.from(rebuilt.messages, row => row.content), messages.map(row => row.content));
assert.strictEqual(JSON.stringify(damaged), sourceBefore, "Reconstruction never mutates the original conversation or its old checkpoints");

// New transcript pages have a separate soft token cap independent of a large
// model window. An indivisible first message may exceed that cap but is not cut.
const verboseMessages = makeMessages(20, i => "EVENT_" + i + " " + "recorded event detail ".repeat(220));
const verboseChat = { ...chat, messages: verboseMessages, leafId: verboseMessages.at(-1).id };
const verbosePlan = I.memoryPlan(verboseChat, emptyLibrary, [], true);
const verboseBody = JSON.parse(verbosePlan.messages[1].content);
assert(verbosePlan.count < 8, "New transcript token cap can end a page before its message-count cap");
assert(verboseBody.olderMessages.reduce((sum, row) => sum + I.tokenEstimate(row.content), 0) <= 6000,
  "A normal page sends at most 6000 estimated tokens of new transcript");
const hugeText = "HUGE_EVENT " + "z".repeat(26000);
const hugeMessages = makeMessages(12, i => i ? "Following event " + i : hugeText);
const hugeChat = { ...chat, messages: hugeMessages, leafId: hugeMessages.at(-1).id };
const hugeBefore = JSON.stringify(hugeChat);
const hugePlan = I.memoryPlan(hugeChat, emptyLibrary, [], true);
assert.strictEqual(hugePlan.count, 1, "A single oversoft-limit message gets its own page");
assert.strictEqual(JSON.parse(hugePlan.messages[1].content).olderMessages[0].content, hugeText,
  "Never truncate or skip an indivisible message that fits the native/model budget");
assert.throws(() => I.memoryPlan({ ...hugeChat, contextTokens: 2048 }, emptyLibrary, [], true), /too large|do not fit|cannot fit/i,
  "A message exceeding the actual input budget fails visibly rather than advancing past it");
assert.strictEqual(JSON.stringify(hugeChat), hugeBefore);

// The factual worker needs allowlisted profile references so static descriptions
// are not wastefully copied into story memory. Resolve the active variant first.
const character = { id: "character", name: "Aria", tagline: "CHAR_TAGLINE", age: "CHAR_AGE", gender: "CHAR_GENDER",
  pronouns: "CHAR_PRONOUNS", story: "BASE_STORY_NOT_SELECTED", personality: "BASE_PERSONALITY_NOT_SELECTED",
  sections: [{ title: "Base section", content: "BASE_SECTION_NOT_SELECTED" }],
  creatorMemo: "SECRET_CREATOR_MEMO", profileImg: "SECRET_IMAGE_ID", apiKey: "SECRET_API_KEY",
  systemPrompt: "EXCLUDED_SYSTEM_PROMPT", alwaysActiveSystemPrompt: "EXCLUDED_ALWAYS_PROMPT",
  scenario: "EXCLUDED_OPENING_SCENARIO", exampleMessage: "EXCLUDED_EXAMPLE_DIALOGUE",
  variants: [{ id: "variant", name: "Winter", story: "VARIANT_STORY {{char}} meets {{user}}",
    personality: "VARIANT_PERSONALITY", age: "VARIANT_AGE", gender: "VARIANT_GENDER", pronouns: "VARIANT_PRONOUNS",
    sections: [{ title: "Variant facts", content: "VARIANT_SECTION" }],
    creatorMemo: "SECRET_VARIANT_MEMO", profileImg: "SECRET_VARIANT_IMAGE" }] };
const persona = { id: "persona", name: "Rowan", tagline: "PERSONA_TAGLINE", role: "PERSONA_ROLE", pronouns: "PERSONA_PRONOUNS",
  description: "PERSONA_DESCRIPTION", sections: [{ title: "Persona facts", content: "PERSONA_SECTION" }],
  creatorMemo: "SECRET_PERSONA_MEMO", profileImg: "SECRET_PERSONA_IMAGE", apiKey: "SECRET_PERSONA_API_KEY",
  systemPrompt: "EXCLUDED_PERSONA_SYSTEM", scenario: "EXCLUDED_PERSONA_SCENARIO", exampleMessage: "EXCLUDED_PERSONA_EXAMPLE" };
const profileLibrary = { chars: [character], personas: [persona], lore: [] };
const profileChat = { ...chat, characterId: character.id, variantId: "variant", personaId: persona.id,
  alwaysActivePrompt: "EXCLUDED_CHAT_SUPER_PROMPT", apiKey: "SECRET_CHAT_API_KEY" };
const profileBefore = JSON.stringify({ profileChat, profileLibrary });
const profilePlan = I.memoryPlan(profileChat, profileLibrary, [], true);
const profileBody = JSON.parse(profilePlan.messages[1].content);
assert(profileBody.knownProfiles != null, "Memory input must distinguish already-known static profiles from story events");
const profiles = JSON.stringify(profileBody.knownProfiles);
for (const fact of ["Aria", "Rowan", "VARIANT_STORY", "VARIANT_PERSONALITY", "VARIANT_AGE", "VARIANT_GENDER", "VARIANT_PRONOUNS",
  "VARIANT_SECTION", "PERSONA_DESCRIPTION", "PERSONA_SECTION", "CHAR_TAGLINE", "PERSONA_TAGLINE", "PERSONA_ROLE", "PERSONA_PRONOUNS"])
  assert(profiles.includes(fact), "Known profiles include the selected factual field: " + fact);
assert(profiles.includes("Aria meets Rowan"), "Authored reference placeholders use the selected cast");
assert(!/BASE_STORY_NOT_SELECTED|BASE_PERSONALITY_NOT_SELECTED|BASE_SECTION_NOT_SELECTED/.test(profiles),
  "A selected variant must not be summarized as its base character instead");
assert(!/SECRET_|EXCLUDED_/.test(profilePlan.messages.map(row => row.content).join("\n")),
  "Only named factual writing fields enter the worker: no private metadata, images, credentials, prompts or opening/examples");
const instruction = profilePlan.messages[0].content;
assert(/knownProfiles/i.test(instruction) && /previousMemory/i.test(instruction) && /pinned/i.test(instruction));
assert(/(?:do not|don't|never)[^.\n]*(?:repeat|copy|restate|duplicate)/i.test(instruction),
  "Worker explicitly avoids duplicating existing reference material");
assert(/change/i.test(instruction) && /(?:event|develop|happen)/i.test(instruction),
  "Static-profile deduplication must still preserve real events and state changes");
const fallbackChat = { ...profileChat, castSnapshot: { character, persona, lore: [] } };
const fallback = JSON.parse(I.memoryPlan(fallbackChat, emptyLibrary, [], true).messages[1].content);
assert.strictEqual(JSON.stringify(fallback.knownProfiles), profiles,
  "Missing local cast uses saved cast and still selects the correct variant with the same allowlist");
assert.strictEqual(JSON.stringify({ profileChat, profileLibrary }), profileBefore);

// Reference material is part of the actual input budget, not a free side channel.
const budgetMessages = makeMessages(20, i => "Budget event " + i + " " + "x".repeat(2000));
const budgetChat = { ...chat, characterId: "budget-character", contextTokens: 12000, maxTokens: 500,
  messages: budgetMessages, leafId: budgetMessages.at(-1).id };
const noReferences = I.memoryPlan(budgetChat, emptyLibrary, [], true);
const largeReferenceLibrary = { chars: [{ id: "budget-character", name: "Budget character", story: "R".repeat(18000) }], personas: [], lore: [] };
const budgetPlan = I.memoryPlan(budgetChat, largeReferenceLibrary, [], true);
assert(budgetPlan.count < noReferences.count, "Large known profiles reduce available transcript capacity");
const budgetLimits = I.contextLimits({ ...budgetChat, maxTokens: budgetPlan.maxTokens }, []);
assert(budgetPlan.messages.reduce((sum, row) => sum + I.tokenEstimate(row.content), 0) <= budgetLimits.input,
  "Profiles, pins, previous memory, instructions and transcript together fit the worker input budget");
assert.throws(() => I.memoryPlan(budgetChat, { ...largeReferenceLibrary,
  chars: [{ ...largeReferenceLibrary.chars[0], story: "R".repeat(90000) }] }, [], true), /too large|do not fit|cannot fit/i,
  "Oversized factual references fail closed instead of silently truncating them or skipping story messages");

for (const broken of [
  { ...chat, leafId: 'missing-leaf' },
  { ...chat, messages: chat.messages.map((m,i)=>i===10?{...m,parentId:'missing-parent'}:m) },
  { ...chat, messages: chat.messages.map((m,i)=>i===0?{...m,parentId:chat.leafId}:m) },
  { ...chat, messages: chat.messages.concat([{...chat.messages[0]}]) }
]) {
  assert.throws(()=>I.memoryHistory(broken),/missing earlier messages|broken message link/,
    'A disconnected suffix, cycle or ambiguous ID cannot masquerade as a complete transcript');
}
assert.strictEqual(I.memoryHistory(chat).length,chat.messages.length);
console.log("PASS: bounded chronological memory pages, complete rebuild coverage, reconstructed early events, static profile references, safe budgets and broken-ancestry guards");
