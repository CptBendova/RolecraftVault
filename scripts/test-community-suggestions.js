/* Regression coverage for the lorebook organisation and workflow pass.
   Behavioral checks execute helpers lifted from the shipped renderer; UI checks
   assert the real wiring remains present in the compiled React source. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app", "app.js"), "utf8");

function liftFunction(source, name) {
  const start = source.indexOf("function " + name + "(");
  if (start < 0) throw new Error("Could not find " + name);
  const open = source.indexOf("{", start);
  let depth = 0, quote = null, escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("Unclosed " + name);
}

let bad = 0;
function check(label, ok) {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label);
}

const toTermList = new Function(liftFunction(app, "toTermList") + "; return toTermList;")();
const firstTermList = new Function("toTermList", liftFunction(app, "firstTermList") + "; return firstTermList;")(toTermList);
let n = 0;
const normalizeLoreImport = new Function("uid", "toTermList", "firstTermList", "asArray",
  liftFunction(app, "normalizeLoreImport") + "; return normalizeLoreImport;"
)(() => "entry-" + ++n, toTermList, firstTermList, value => Array.isArray(value) ? value : [value]);

const standalone = normalizeLoreImport({
  spec: "lorebook_v3",
  data: {
    name: "Aki World",
    entries: [{ comment: "Castle", keys: "keep; fortress", content: "Stone walls." }]
  }
}, "Fallback");
check("standalone lorebook v3 wrappers import their entries",
  standalone.entries.length === 1 && standalone.entries[0].world === "Aki World");
check("string-form lorebook triggers are split and retained",
  standalone.entries[0].triggers.join("|") === "keep|fortress");

const card = normalizeLoreImport({
  data: {
    name: "Character",
    character_book: {
      name: "Embedded Book",
      entries: [{ name: "Rule", key: ["moon"], value: "Never look back." }]
    }
  }
}, "Fallback");
check("character-card embedded lorebooks import",
  card.entries.length === 1 && card.entries[0].world === "Embedded Book");
check("common value aliases are accepted as lore content",
  card.entries[0].content === "Never look back.");

const characterWorkflowStatus = new Function("WORKFLOW_TAGS",
  liftFunction(app, "characterWorkflowStatus") + "; return characterWorkflowStatus;"
)(["Planned", "WIP", "Done"]);
const withCharacterWorkflowStatus = new Function("WORKFLOW_TAGS",
  liftFunction(app, "withCharacterWorkflowStatus") + "; return withCharacterWorkflowStatus;"
)(["Planned", "WIP", "Done"]);
check("workflow status recognises imported tags without case sensitivity",
  characterWorkflowStatus({ tags: ["Fantasy", "wip"] }) === "WIP");
check("changing workflow status preserves unrelated tags and keeps only one status",
  withCharacterWorkflowStatus(["Fantasy", "WIP", "done"], "Planned").join("|") === "Fantasy|Planned");

check("lore entries expose remembered list and grid views",
  /rcv-lore-entry-view/.test(app) && /entryView === "list"/.test(app) && /mode === "grid" \? "Grid" : "List"/.test(app));
check("lorebooks expose World and Personal organisation",
  /Lorebook type/.test(app) && /Filed under Personal lore/.test(app) && /loreScopeFilter/.test(app));
check("a lorebook shows and opens its attached characters and personas",
  /Characters and personas using this lorebook/.test(app) && /linkedRecords: chars\.filter/.test(app) && /onOpenLinked/.test(app));
check("secure Markdown links render as real external links",
  /safe \? "a" : "span"/.test(app) && /noopener noreferrer/.test(app));

if (bad) {
  console.error("\n  " + bad + " community-suggestion regression(s) failed.");
  process.exit(1);
}
console.log("\n  All community-suggestion regressions are covered.");
