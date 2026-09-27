const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const window = { storage: {}, React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} }, ReactDOM: { createRoot: () => ({ render() {} }) } };
vm.runInNewContext(fs.readFileSync(path.join(root, "app/chat.js"), "utf8"), { window, document: { createElement: () => ({}), body: { appendChild() {} } } });
const loreFor = window.__rcvChatInternals.loreFor;
const library = { chars: [{ id: "c", lorebooks: ["Forest"] }], personas: [], lore: [] };
function matches(trigger, text, role = "user") {
  library.lore = [{ world: "Forest", triggers: [trigger] }];
  return loreFor({ characterId: "c" }, library, [{ role, content: text }]).length === 1;
}
for (const text of ["herself", "yourself", "shelf", "elfish", "elf2", "2elf", "elf_name", "éelf", "elfé", "elf\u0301", "𐐀elf"]) {
  assert(!matches("elf", text), "elf must not match inside " + text);
}
for (const role of ["user", "assistant"]) {
  for (const text of ["elf", "An ELF!", "(elf)", "The elf's cloak.", "half-elf", "herself and an elf"]) {
    assert(matches(" elf ", text, role), role + " whole-word trigger: " + text);
  }
}
assert(matches("dark elf", "A DARK\n  ELF arrives."), "whole phrases accept whitespace within one message");
assert(!matches("dark elf", "dark elfish"));
assert(matches("café", "a cafe\u0301!"), "equivalent Unicode forms match");
assert(!matches("café", "caféteria"));
assert(matches("C++", "Use C++ today."), "regex punctuation is literal");
assert(!matches("C++", "Use CCC today."));
assert(matches("[elf]", "The [elf] arrives."));
assert(!matches("[elf]", "e"));
assert(!matches(" ", "anything"), "blank trigger must not match everything");
library.lore = [{ world: "Forest", triggers: ["dark elf"] }];
assert.strictEqual(loreFor({ characterId: "c" }, library, [{ content: "dark" }, { content: "elf" }]).length, 0, "phrases cannot span speakers");
library.lore = [{ world: "Forest", triggers: ["elf"] }];
const history = [{ role: "assistant", content: "An elf." }, ...Array.from({ length: 7 }, () => ({ role: "user", content: "Hello." }))];
assert.strictEqual(loreFor({ characterId: "c" }, library, history).length, 1);
history.push({ role: "assistant", content: "Hello." });
assert.strictEqual(loreFor({ characterId: "c" }, library, history).length, 0, "trigger expires outside eight messages");
assert.strictEqual(loreFor({}, library, [{ content: "elf" }]).length, 0, "unattached books never trigger");
library.lore = [{ world: "Forest", triggers: [] }];
assert.strictEqual(loreFor({ characterId: "c" }, library, [{ role: "user", content: "elf" }]).length, 0, "entries without triggers cannot become permanently active");
library.lore = [{ world: "Forest", triggers: "" }];
assert.strictEqual(loreFor({ characterId: "c" }, library, [{ role: "assistant", content: "elf" }]).length, 0, "empty text-form triggers stay inactive");
library.lore = [{ world: "Forest", triggers: ["   "] }];
assert.strictEqual(loreFor({ characterId: "c" }, library, [{ role: "user", content: "elf" }]).length, 0, "blank trigger values stay inactive");
console.log("Whole-word lore triggers: boundaries, phrases, Unicode, both speakers, eight-message window and trigger-free exclusion passed.");
