"use strict";

// Execute the shipped renderer functions and Windows bridge. Timers and HTTPS
// are fake: these checks never send a paid request or need a saved API key.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");

const root = path.join(__dirname, "..");
const chatSource = fs.readFileSync(path.join(root, "app", "chat.js"), "utf8");

function shippedFunction(source, name) {
  const start = source.indexOf("function " + name + "(");
  assert(start >= 0, "missing shipped function " + name);
  const open = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let at = open; at < source.length; at++) {
    const ch = source[at], next = source[at + 1];
    if (lineComment) { if (ch === "\n") lineComment = false; continue; }
    if (blockComment) { if (ch === "*" && next === "/") { blockComment = false; at++; } continue; }
    if (quote) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === quote) quote = ""; continue; }
    if (ch === "/" && next === "/") { lineComment = true; at++; continue; }
    if (ch === "/" && next === "*") { blockComment = true; at++; continue; }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return source.slice(start, at + 1);
  }
  throw Error("Unbalanced shipped function " + name);
}

async function rendererMemoryDeadline() {
  const timers = new Map(), starts = [], cancels = [];
  const requestRef = { current: null };
  let nextTimer = 0;
  const context = {
    uid: () => "memory-request",
    requestRef,
    memoryModelOf: chat => chat.memoryModel,
    native: {
      start: async request => { starts.push(request); return { ok: true }; },
      cancel: async id => { cancels.push(id); return { ok: true }; }
    },
    setTimeout: (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    Promise, Error
  };
  vm.runInNewContext(shippedFunction(chatSource, "requestMemory") + "\nthis.run = requestMemory;", context);
  const chat = { id: "story", memoryModel: "fixture/memory", requireZdr: true,
    messages: [{ id: "old", content: "Saved turn" }], memories: [{ id: "earlier", text: "Saved memory" }] };
  const original = JSON.stringify(chat);
  const plan = { messages: [{ role: "system", content: "Produce a concise rolling memory" }], maxTokens: 8192, summaryTokens: 384 };
  const pending = context.run(chat, plan);
  await Promise.resolve();
  assert.strictEqual(starts.length, 1, "one explicit memory request starts");
  assert.strictEqual(starts[0].purpose, "memory", "native bridges receive the memory purpose");
  assert.strictEqual(starts[0].model, "fixture/memory", "the selected memory model remains in use");
  assert.strictEqual(starts[0].requireZdr, true, "memory keeps the chat privacy choice");
  assert.strictEqual(timers.size, 1);
  const timer = [...timers.values()][0];
  assert.strictEqual(timer.ms, 540000, "memory gets a bounded nine-minute overall deadline");
  assert.strictEqual(cancels.length, 0, "the old three-minute point does not cancel memory");
  timer.callback();
  await assert.rejects(pending, /Memory compaction.*nine minutes/);
  assert.deepStrictEqual(cancels, ["memory-request"], "deadline cancels only its own native request");
  assert.strictEqual(requestRef.current, null);
  assert.strictEqual(timers.size, 0);
  assert.strictEqual(JSON.stringify(chat), original, "timeout keeps prior transcript and memory unchanged");
}

async function interruptedRound(index, draft) {
  const firstKey = JSON.stringify(["ari", ""]), secondKey = JSON.stringify(["bea", ""]);
  const keys = [firstKey, secondKey], anchorLeafId = index ? "ari-reply" : "previous-reply";
  const chat = { id: "story", leafId: anchorLeafId, messages: [{ id: anchorLeafId, role: "assistant", content: "Saved reply" }],
    participants: [{ characterId: "ari", variantId: "" }, { characterId: "bea", variantId: "" }] };
  const originalMessages = JSON.stringify(chat.messages);
  const plan = { version: 1, chatId: chat.id, keys, index, anchorLeafId, expectMessageId: null };
  const chatsRef = { current: [chat] }, roundPlansRef = { current: { story: plan } }, groupRoundRef = { current: null };
  const draftRef = { current: { story: draft } }, sent = [], statuses = [], errors = [];
  const context = {
    activeId: chat.id, chatsRef, roundPlansRef, groupRoundRef, draftRef,
    roundReview: true, native: {}, status: { configured: true }, open: true,
    document: { hidden: false }, window: { RolecraftChatOpen: true, RolecraftChatSyncApplying: false },
    busyRef: { current: false }, saveFailed: { current: false }, epoch: { current: 1 }, activeIdRef: { current: chat.id },
    extraCostRef: { current: {} }, libraryRef: { current: {} },
    participantKey: p => JSON.stringify([p.characterId, p.variantId || ""]),
    participantsOf: c => c.participants,
    participantCharacter: (_c, p) => ({ name: p.characterId }),
    speakerName: p => p.name,
    groupSpendGate: () => ({ needsApproval: false }),
    changeParticipants: (c, _library, _action, p) => ({ ...c, activeSpeakerKey: JSON.stringify([p.characterId, p.variantId || ""]) }),
    save: async rows => { chatsRef.current = rows; },
    sendRef: { current: (...args) => sent.push(args) },
    setRoundReview() {}, setBusy() {}, setPhase() {}, setQueueStatus: status => statuses.push(status), setError: error => errors.push(error),
    clearGroupRound: () => { groupRoundRef.current = null; },
    Promise, Error, Set
  };
  vm.runInNewContext([
    shippedFunction(chatSource, "validRoundPlan"),
    shippedFunction(chatSource, "inspectRoundPlan"),
    shippedFunction(chatSource, "resumeInterruptedRound"),
    "this.run = resumeInterruptedRound;"
  ].join("\n"), context);
  context.run();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepStrictEqual(errors, [], "a valid paused round resumes");
  assert.strictEqual(groupRoundRef.current.currentIndex, index + 1, "the resumed paid-reply index stays numeric and one-based");
  assert.strictEqual(statuses.at(-1).current, index + 1, "queue progress uses the resumed numeric index");
  assert.strictEqual(sent.length, 1, "explicit confirmation starts exactly one reply");
  assert.strictEqual(JSON.stringify(chatsRef.current[0].messages), originalMessages, "review does not edit saved turns");
  assert.strictEqual(draftRef.current.story, draft, "review does not discard the unsent draft");
  if (index === 0 && draft.trim()) assert.strictEqual(sent[0].length, 0, "first paused reply sends the waiting draft");
  else assert.deepStrictEqual(sent[0], [anchorLeafId], "a later reply continues after the saved assistant turn");
}

function windowsNativeTimeouts() {
  const handlers = {}, requests = [];
  const https = { request(options) {
    assert.strictEqual(options.hostname, "openrouter.ai");
    const req = new EventEmitter();
    req.setTimeout = ms => { req.timeout = ms; };
    req.write = body => { req.body = JSON.parse(body); };
    req.end = () => {};
    req.destroy = () => {};
    requests.push(req);
    return req;
  } };
  const box = { module: { exports: {} }, Buffer, process,
    require: name => name === "https" ? https : name === "fs" ? { readFileSync: () => Buffer.from("fixture") } : require(name) };
  vm.runInNewContext(fs.readFileSync(path.join(root, "app", "openrouter.js"), "utf8"), box);
  box.module.exports.setupOpenRouterIpc({
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    safeStorage: { isEncryptionAvailable: () => true, decryptString: () => "fixture-not-a-real-key-00000000" },
    app: { getPath: () => root, on() {} }, isLocked: () => false
  });
  const sender = { isDestroyed: () => false, send() {} };
  const base = { model: "fixture/model", messages: [{ role: "user", content: "An eligible old page" }] };
  const memory = handlers["openrouter-start"]({ sender }, { ...base, purpose: "memory" });
  assert(memory.ok);
  assert.strictEqual(requests[0].timeout, 360000, "memory receives six minutes of socket inactivity allowance");
  assert.strictEqual(requests[0].body.purpose, undefined, "purpose stays in the local bridge, outside provider content");
  handlers["openrouter-cancel"]({}, memory.id);
  const reply = handlers["openrouter-start"]({ sender }, base);
  assert(reply.ok);
  assert.strictEqual(requests[1].timeout, 180000, "ordinary roleplay replies retain their three-minute idle allowance");
  handlers["openrouter-cancel"]({}, reply.id);
}

(async () => {
  await rendererMemoryDeadline();
  await interruptedRound(0, "Keep my unsent scene prompt");
  await interruptedRound(1, "A different future draft");
  windowsNativeTimeouts();
  console.log("PASS memory deadline and native timeout, privacy, unchanged transcript, explicit round resume indexes and unsent drafts");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
