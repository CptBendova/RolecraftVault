const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const window = { storage: {}, React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} }, ReactDOM: { createRoot: () => ({ render() {} }) } };
vm.runInNewContext(fs.readFileSync(path.join(root, "app/chat.js"), "utf8"), { window, document: { createElement: () => ({}), body: { appendChild() {} } } });
const I = window.__rcvChatInternals;
const { validateDirectorRequest, readDirectorAnswer } = require(path.join(root, "app/openrouter.js"));
const library = { chars: [{ id: "c", name: "Ari", systemPrompt: "Stay curious", creatorMemo: "NEVER_SEND_CREATOR_MEMO" }], personas: [], lore: [] };
const messages = [
  { id: "u1", role: "user", content: "Where are we?" },
  { id: "a1", parentId: "u1", role: "assistant", content: "A forest." },
  { id: "u2", parentId: "a1", role: "user", content: "Look around." },
  { id: "a2", parentId: "u2", role: "assistant", content: "There is a path." },
  { id: "u3", parentId: "a2", role: "user", content: "Follow it." },
  { id: "a3", parentId: "u3", role: "assistant", content: "We reach a clearing." },
];
const chat = { id: "chat", characterId: "c", messages, leafId: "a3", directorMode: "coach", requireZdr: false, alwaysActivePrompt: "Prioritize the mystery", contextTokens: 8000 };
const scores = { a1: { tone: 1, continuity: 1, agency: .9 }, a2: { tone: 1, continuity: 1, agency: .9 }, a3: { tone: 3, continuity: 3, agency: 0 } };
const state = I.directorState(chat, library, "a3");
assert.strictEqual(state.latest_turn, "We reach a clearing.");
assert.strictEqual(state.player_message, "Follow it.");
assert(!JSON.stringify(state).includes("NEVER_SEND_CREATOR_MEMO"));
assert(I.directorNudge(chat, scores).includes("intended tone"));
const assembled = I.assemble(chat, library, null, [], scores);
assert(assembled.directorNudge);
assert(assembled.messages[0].content.indexOf("PRIORITY 3") < assembled.messages[0].content.indexOf("TEMPORARY STORY DIRECTOR NOTE"));
assert(!I.assemble({ ...chat, directorMode: "observe" }, library, null, [], scores).directorNudge);
assert(!I.assemble({ ...chat, requireZdr: true }, library, null, [], scores).directorNudge);
const withUnscored = { ...chat, messages: messages.concat([{ id: "u4", parentId: "a3", role: "user", content: "Continue" }, { id: "a4", parentId: "u4", role: "assistant", content: "A door." }]), leafId: "a4" };
assert(!I.directorNudge(withUnscored, scores), "older scored turns must not cross an unscored latest-three window");
assert(!I.directorNudge({ ...chat, leafId: "a3" }, { a1: scores.a1, a2: scores.a2 }), "the latest unscored queued reply must not trigger old coaching");
const input = { requireZdr: false, state };
const payload = JSON.parse(validateDirectorRequest(input));
assert.strictEqual(payload.model, "typesafe/jev-1.13");
assert.deepStrictEqual(Object.keys(payload.questions), ["tone", "continuity", "agency"]);
assert.throws(() => validateDirectorRequest({ ...input, requireZdr: true }), /zero data retention/);
assert.throws(() => validateDirectorRequest({ ...input, state: { ...state, latest_turn: "x".repeat(12001) } }), /too large/);
const reply = { answers: { tone: { type: "score", score: 3 }, continuity: { type: "score", score: 2 }, agency: { type: "noul", noul: .8 } }, usage: { cost: .001 } };
assert.strictEqual(readDirectorAnswer(reply).agency, .8);
assert.strictEqual(readDirectorAnswer({ ...reply, usage: { cost: null } }).cost, null, "missing Jev cost must not become zero");
assert.throws(() => readDirectorAnswer({ ...reply, answers: { ...reply.answers, tone: { type: "score", score: 5 } } }), /invalid/);
assert.throws(() => readDirectorAnswer({ ...reply, answers: { ...reply.answers, agency: { type: "score", score: 1 } } }), /invalid/);
console.log("PASS: optional private Story Director request, scores, ZDR boundary, and latest-three coaching");
