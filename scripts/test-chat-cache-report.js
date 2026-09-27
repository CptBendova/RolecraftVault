#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const window = {
  storage: {}, crypto: { randomUUID: () => "generated-id" },
  React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} },
  ReactDOM: { createRoot: () => ({ render() {} }) },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "app", "chat.js"), "utf8"), {
  window, document: { createElement: () => ({}), body: { appendChild() {} } },
});
const I = window.__rcvChatInternals;
assert(I && I.chatCacheReport, "test calls the shipped cache accounting helper");
const messages = [];
for (let i = 0; i < 7; i++) {
  messages.push({
    id: `a${i}`, parentId: i ? `a${i - 1}` : null, role: "assistant", content: "reply",
    usage: i === 1 ? { prompt_tokens: 100 } : {
      prompt_tokens: 100,
      prompt_tokens_details: { cached_tokens: i < 3 ? 10 : 80, cache_write_tokens: i === 6 ? 5 : undefined },
    },
  });
}
messages.push({ id: "off-path", parentId: "a2", role: "assistant", content: "another branch", usage: { prompt_tokens: 900, prompt_tokens_details: { cached_tokens: 900 } } });
const report = I.chatCacheReport({ leafId: "a6", messages });
assert.strictEqual(report.sampled, 7);
assert.strictEqual(report.reported, 6, "missing cache details are unavailable, not zero");
assert.strictEqual(report.input, 600);
assert.strictEqual(report.read, 340, "inactive branches cannot inflate the cache trend");
assert.strictEqual(report.write, 5);
assert.strictEqual(report.writeReports, 1);
assert(report.recentRate > report.earlierRate, "trend compares recent reported input with earlier reported input");
const none = I.chatCacheReport({ leafId: "a1", messages });
assert.strictEqual(none.sampled, 2);
assert.strictEqual(none.reported, 1);
assert.strictEqual(I.replyUsage({ prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: { cache_write_tokens: 5 } }).details[0], "Cache write: 5 input tokens");
console.log("PASS: provider-reported cache usage and unavailable values stay distinct");
