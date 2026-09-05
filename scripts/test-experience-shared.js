const assert = require("assert");
const fs = require("fs"), path = require("path"), vm = require("vm");
const source = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
const scope = {};
for (const name of ["toTermList", "activates", "matchesLibrarySearch"]) {
  const start = source.indexOf("function " + name + "(");
  const end = source.indexOf("\n}", start) + 2;
  assert(start >= 0 && end > start);
  vm.runInNewContext(source.slice(start, end), scope);
}
assert(scope.matchesLibrarySearch({ name: "Ari", tags: ["Explorer"] }, "  EXPLORER  "));
assert(scope.matchesLibrarySearch({ name: "Ari", searchables: "quiet, scholar" }, "scholar"));
assert(!scope.matchesLibrarySearch({ name: "Ari" }, "other"));
assert(scope.matchesLibrarySearch({}, "  "));
let prevented = false;
const card = {};
assert(scope.activates({ key: " ", target: card, currentTarget: card, preventDefault() { prevented = true; } }));
assert(prevented);
assert(!scope.activates({ key: "Enter", target: {}, currentTarget: card, preventDefault() { throw new Error("nested button was hijacked"); } }));
const comparator = source.match(/const byName = ([^\n]+);/)[1];
const byName = vm.runInNewContext(comparator);
assert.deepStrictEqual(["Chapter 10", "chapter 2", "Chapter 1"].sort(byName), ["Chapter 1", "chapter 2", "Chapter 10"]);
assert(source.includes('onKeyDown: e => activates(e) && (pSelMode'));
assert(source.includes('onKeyDown: e => activates(e) && setLb(i)'));
assert(source.includes('window.__rcvSaveFile = saveFile'));
assert(source.includes('window.dispatchEvent(new Event("rcv-locking"))'));
console.log("PASS: shared search, natural sorting, nested-keyboard safety, persona/gallery activation and local workspace adapters");
