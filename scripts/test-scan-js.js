const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const source = fs.readFileSync(path.join(__dirname, "scan-js.js"), "utf8");
// Lift the real checker without running its CLI.
const context = { require };
vm.runInNewContext(source.slice(0, source.indexOf("const files = process.argv")) + "\nthis.scan = scan;", context);
const scan = source => context.scan(source, "fixture.js");
assert.strictEqual(scan("function outer(){(async function(){while(true){var n=[1].map(function(x){return x});await save(n);break;}await save([])})()}").length, 0, "inner callbacks cannot end the async scope");
assert.strictEqual(scan("function outer(){const work=async()=>{if(true){await save()}await save()};}").length, 0, "async arrows are valid");
assert(scan("async function outer(){function inner(){await save()}} ").length, "await inside a synchronous child still fails");
assert(scan("function outer(){await save()}").length, "plain synchronous await fails");
assert(scan("const value=1;value=2;").some(f=>f.type==='const-assign'), "runtime const reassignment remains checked");
assert.strictEqual(scan("const value={};value.x=2;").length, 0, "property writes are not const reassignment");
console.log("PASS: parser-accurate async scopes and unchanged const-assignment checks");
