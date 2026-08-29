/* Regression coverage for the twenty-defect cross-edition audit after 1.242.
   Behavioral checks lift the shipped functions; lifecycle/UI ordering that is
   impractical under plain Node is checked in its real source path. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const app = read("app/app.js");
const main = read("app/main.js");
const transfer = read("mobile/src/rc-transfer.js");

function liftFunction(source, name) {
  let start = source.indexOf("function " + name + "(");
  if (start < 0) throw new Error("Could not find " + name);
  if (source.slice(Math.max(0, start - 6), start) === "async ") start -= 6;
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

async function run() {
  check("1 early edits wake draft protection after the initial read",
    /const \[loaded, setLoaded\] = useState\(false\)/.test(app) &&
    /finally\(\(\) => \{ if \(alive\) setLoaded\(true\)/.test(app) &&
    /\[changed, value, found, key, loaded\]/.test(app));

  const draftValues = new Map();
  const removedDrafts = [];
  for (let i = 0; i < 30; i++) draftValues.set("draft:k" + i, "payload");
  draftValues.set("draft:index", JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ key: "draft:k" + i }))));
  const updateDraftIndex = new Function("sGet", "sSet", "sDel", "DRAFT_INDEX_KEY",
    liftFunction(app, "updateDraftIndex") + "; return updateDraftIndex;"
  )(k => Promise.resolve(draftValues.get(k)), (k, v) => { draftValues.set(k, v); return Promise.resolve(); },
    k => { removedDrafts.push(k); draftValues.delete(k); return Promise.resolve(); }, "draft:index");
  await updateDraftIndex({ key: "draft:new" }, false);
  check("2 evicted draft payloads are deleted with their index entries",
    removedDrafts.includes("draft:k29") && JSON.parse(draftValues.get("draft:index")).length === 30);

  const characterSave = app.slice(app.indexOf("const doSave = async", app.indexOf("function CharacterEditor")), app.indexOf("const setPortraitFor", app.indexOf("function CharacterEditor")));
  const recordSave = app.slice(app.indexOf("const saveRecord = () =>", app.indexOf("function RecordModal")), app.indexOf("useEffect(() =>", app.indexOf("const saveRecord = () =>", app.indexOf("function RecordModal"))));
  check("3 every editor clears its draft only after persistence resolves",
    characterSave.indexOf("await onSave(out)") < characterSave.indexOf("await draft.clear()") &&
    recordSave.indexOf("onSave({") < recordSave.indexOf("then(() => draft.clear())"));
  check("4 editor Save actions are gated while a write is in flight",
    (app.match(/disabled: saving/g) || []).length >= 3 && /if \(saving\) return/.test(characterSave) && /if \(saving\) return/.test(recordSave));

  const imageWriter = app.slice(app.indexOf("const saveImage = useCallback"), app.indexOf("const dropImage", app.indexOf("const saveImage = useCallback")));
  check("5 a failed thumbnail write rolls back its unattached original",
    /sDel\("img:" \+ imgId\)/.test(imageWriter) && /throw e/.test(imageWriter));
  const uploads = app.slice(app.indexOf("const uploadProfile"), app.indexOf("const liveVid", app.indexOf("const uploadProfile")));
  check("6 portrait and gallery storage failures are reported and skipped",
    /Couldn't save that image/.test(uploads) && /let unsaved = 0/.test(uploads) && /catch \(e\) \{ unsaved\+\+; continue; \}/.test(uploads));
  check("7 legacy characters can add their first custom section",
    /set\("sections", \[\.\.\.\(c\.sections \|\| \[\]\), \{/.test(app));

  const historySnapshotChanged = new Function(liftFunction(app, "historySnapshotChanged") + "; return historySnapshotChanged;")();
  const baseSnap = { id: "a", at: 1, label: "a", fields: {}, tags: [], searchables: [], bucket: "", nsfw: false, nsfwPicture: false, lorebooks: [], sections: [], sectionOrder: null, variants: [] };
  check("8 history notices fields outside tags, words, sections and variants",
    historySnapshotChanged(baseSnap, { ...baseSnap, id: "b", at: 2, label: "b", lorebooks: ["World"] }));

  const nextVariantName = new Function(liftFunction(app, "nextVariantName") + "; return nextVariantName;")();
  check("9 imported variants cannot reuse a surviving default name",
    nextVariantName([{ name: "Variant 2" }, { name: "Variant 4" }]) === "Variant 3");

  let uidN = 0;
  const applySnapshot = new Function("uid", liftFunction(app, "applySnapshot") + "; return applySnapshot;")(() => "uid-" + ++uidN);
  const liveChar = { variants: [
    { id: "old-id", name: "Night", story: "now", profileImg: "portrait-night" },
    { id: "new-id", name: "Future", story: "keep", profileImg: "portrait-future" }
  ], gallery: [], sections: [] };
  const restored = applySnapshot(liveChar, { fields: {}, variants: [{ id: "stale-id", name: "Night", story: "then" }], sections: [] });
  check("10 history restore preserves legacy and later variant portraits",
    restored.variants.length === 2 && restored.variants[0].id === "old-id" && restored.variants[0].profileImg === "portrait-night" && restored.variants[1].profileImg === "portrait-future");

  const appSaveRecord = app.slice(app.indexOf("const saveRecord = async (type, r)"), app.indexOf("const persistLore", app.indexOf("const saveRecord = async (type, r)")));
  check("11 persona, lore and prompt image removal cleans bytes after record commit",
    appSaveRecord.indexOf("await sSet(col.key") < appSaveRecord.indexOf("removed.map(dropImage)") && /imageIdsOf\(type, before\)/.test(appSaveRecord));

  const restoreRecordsWithFreshIds = new Function("uid", liftFunction(app, "restoreRecordsWithFreshIds") + "; return restoreRecordsWithFreshIds;")((() => { let n = 0; return () => "fresh-" + ++n; })());
  const batch = restoreRecordsWithFreshIds([{ id: "same" }], [{ id: "same", name: "Recovered" }, { id: "other" }]);
  const restoreBulk = app.slice(app.indexOf("const restoreTrashEntries"), app.indexOf("const emptyFromTrash", app.indexOf("const restoreTrashEntries")));
  check("12 bulk Undo restores colliding ids and keeps unknown kinds in the bin",
    batch.length === 3 && batch[1].id !== "same" && /known\.has\(e\.type\)/.test(restoreBulk) && /restorable\.map\(e => e\.tid\)/.test(restoreBulk));

  const deleteRecord = app.slice(app.indexOf("const deleteRecord = async"), app.indexOf("\/\* --- backup", app.indexOf("const deleteRecord = async")));
  check("13 deletion uses the current collection after its awaited bin write",
    deleteRecord.indexOf("await sendManyToTrash") < deleteRecord.indexOf("ref.current.filter"));
  check("14 valid JSON with invalid collection or metadata shapes is refused",
    /const parseCollection/.test(app) && /value\.some\(x => !x \|\| typeof x !== "object"/.test(app) && /const parseMap/.test(app) && /const parseStringList/.test(app));

  const atomic = main.slice(main.indexOf("function writeFileAtomic"), main.indexOf("function writeValue", main.indexOf("function writeFileAtomic")));
  check("15 concurrent atomic writes use unique sibling files and clean failures",
    /process\.pid/.test(atomic) && /crypto\.randomBytes\(6\)/.test(atomic) && /finally/.test(atomic));

  const hashOfRecord = new Function("keyToFile", "fs", "loadHashCache", "path", "readValue", "rememberHash",
    liftFunction(main, "hashOfRecord") + "; return hashOfRecord;"
  )(k => k, { statSync: () => ({ size: 1, mtimeMs: 1 }) }, () => ({}), path,
    () => { throw new Error("corrupt"); }, () => "hash");
  let manifestReadFailed = false;
  try { hashOfRecord("chars:all"); } catch (e) { manifestReadFailed = /Couldn't read vault record/.test(e.message); }
  check("16 an unreadable record aborts a transfer manifest instead of disappearing", manifestReadFailed);

  const recordBuilder = liftFunction(main, "buildRecordFile");
  const legacyBuilder = liftFunction(main, "buildTransferFile");
  check("17 current and legacy transfer packs fail on unreadable records",
    !/catch \(e\) \{ v = null; \}/.test(recordBuilder) && !/catch \(e\) \{ continue; \}/.test(legacyBuilder) && /record disappeared while packing/.test(recordBuilder + legacyBuilder));

  const estimateKeyBytes = new Function("readValue", "Buffer", liftFunction(main, "estimateKeyBytes") + "; return estimateKeyBytes;")(
    key => key === "sz:pic" ? String(40 * 1024 * 1024) : key === "th:pic" ? "abc" : "😀", Buffer);
  check("18 batch estimates use UTF-8 bytes and a thumbnail's own size",
    estimateKeyBytes("note") === 4 && estimateKeyBytes("th:pic") === 3);

  let written = Buffer.alloc(0);
  const writeAllSync = new Function("fs", "Buffer", liftFunction(main, "writeAllSync") + "; return writeAllSync;")({
    writeSync(_fd, buf, at, len) {
      const n = Math.min(2, len);
      written = Buffer.concat([written, buf.subarray(at, at + n)]);
      return n;
    }
  }, Buffer);
  writeAllSync(1, Buffer.from("abcdef"));
  check("19 encrypted transfer writers retry short filesystem writes", written.toString() === "abcdef" && !/fs\.writeSync/.test(recordBuilder));

  let securitySaved = false, journalRemoved = false;
  const finishPendingRewrap = new Function("fs", "rewrapFile", "dataDir", "path", "saveSecurity",
    liftFunction(main, "finishPendingRewrap") + "; return finishPendingRewrap;"
  )({
    readFileSync: () => JSON.stringify({ security: { salt: "new" } }),
    readdirSync: () => ["chars.dat.rewrap"],
    renameSync: () => { throw new Error("busy"); },
    unlinkSync: file => { if (file === "journal") journalRemoved = true; }
  }, "journal", "vault", path, () => { securitySaved = true; });
  let rewrapFailedClosed = false;
  try { finishPendingRewrap(); } catch (e) { rewrapFailedClosed = true; }
  check("20 interrupted re-encryption keeps its journal and old security metadata",
    rewrapFailedClosed && !securitySaved && !journalRemoved && /finishPendingRewrap\(\)/.test(main.slice(main.indexOf("function rewrapAll"), main.indexOf("function finishPendingRewrap"))));

  check("Android confirmation rescans after a potentially stale preview",
    /async function localManifest\(report, force\)/.test(transfer) && /localManifest\([^;]+, !preview\)/s.test(transfer));

  if (bad) {
    console.log("\n  " + bad + " audited regression(s) failed.");
    process.exit(1);
  }
  console.log("\n  All twenty audited defects and the Android stale-preview guard are covered.");
}

run().catch(err => {
  console.error(err && err.stack || err);
  process.exit(1);
});
