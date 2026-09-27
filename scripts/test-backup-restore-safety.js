/* Execute the shipped backup inspector and restore handler with disposable
   in-memory storage. A rejected restore must never touch the current vault. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");
function fn(name) {
  const start = source.indexOf("function " + name + "(");
  assert(start >= 0, "Missing " + name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}
const imageStart = source.indexOf("const imageIdsOf =");
const imageCode = source.slice(imageStart, source.indexOf("\n};", imageStart) + 3);
const start = source.indexOf("  const importAll = async source => {");
const restoreCode = source.slice(start, source.indexOf("  /* --- derived --- */", start));
assert(start >= 0 && restoreCode.includes("await sReplace(values"), "Missing real backup restore handler");

const picture = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6Z5k8AAAAASUVORK5CYII=";
const backup = () => ({ app: "rolecraft-vault", chars: [{ id: "character", name: "Restored", profileImg: "portrait" }],
  personas: [], lore: [], prompts: [], images: { portrait: picture }, thumbs: {},
  buckets: {}, personaBuckets: {}, loreBooks: {}, promptBooks: {}, trash: [], blurred: [] });

function fixture(pairing) {
  const disk = new Map([["chars:all", '[{"id":"original"}]'], ["ui:lastbackup", "12345"],
    ["sync:state", '{"group":"old-group","approved":true}'], ["img:old", picture]]);
  const notices = [], replacements = [], backupDates = [];
  const noop = () => {};
  const ctx = {
    window: { vaultSync: { call: async method => {
      assert.equal(method, "status");
      if (pairing instanceof Error) throw pairing;
      return { enabled: pairing };
    } }, RolecraftChatSync: { validate: chats => chats } },
    backupRestoreBusy: { current: false }, readTextFile: async file => file.text(),
    sReplace: async (values, spec) => {
      replacements.push({ values, spec });
      for (const key of [...disk.keys()]) if (spec.exact.includes(key) || spec.prefixes.some(prefix => key.startsWith(prefix))) disk.delete(key);
      for (const [key, value] of Object.entries(values)) disk.set(key, value);
    },
    dataUrlSize: value => value.length,
    charsRef: { current: [] }, personasRef: { current: [] }, loreRef: { current: [] }, promptsRef: { current: [] }, trashRef: { current: [] }, blurredRef: { current: {} },
    ON_PHONE: false, imgLoading: { current: new Set() }, imgBuf: { current: {} }, fullLoading: { current: new Set() }, fullOrder: { current: [] },
    setChars: noop, setPersonas: noop, setLore: noop, setPrompts: noop, setImgCache: noop, setFullCache: noop,
    setBlurred: noop, setBucketMeta: noop, setPBucketMeta: noop, setLoreMeta: noop, setPromptMeta: noop,
    setTrash: noop, setDrafts: noop, setLastBackup: value => backupDates.push(value), setShowSettings: noop, setRestoreFile: noop,
    toast: value => notices.push(value), recordDiag: noop, Date, JSON, Set, Object, Array, atob
  };
  vm.createContext(ctx);
  vm.runInContext([fn("charImgIds"), fn("personaImgIds"), imageCode, fn("backupPictureValid"), fn("backupInspection"), fn("backupRestoreSyncState"), restoreCode,
    "globalThis.inspect = backupInspection; globalThis.restore = importAll;"].join("\n"), ctx);
  return { ctx, disk, notices, replacements, backupDates, inspect: ctx.inspect, restore: ctx.restore };
}

(async () => {
  const valid = fixture(false);
  assert(valid.inspect(backup()).ok);
  assert(valid.inspect({ ...backup(), images: { portrait: picture.replace("data:image/png;base64,", "DATA:image/PNG;name=portrait;BASE64,") } }).ok,
    "Legacy image data URL parameters remain restorable");
  for (const damaged of [
    { ...backup(), images: {} },
    { ...backup(), images: { portrait: true } },
    { ...backup(), images: { portrait: "data:image/png;base64,AA==" } },
    { ...backup(), chars: [{ name: "No identity" }] },
    { ...backup(), chars: [{ id: "duplicate" }, { id: "duplicate" }] },
    { ...backup(), buckets: { World: { cover: "missing-cover" } } },
    { ...backup(), trash: [{ tid: "bin", type: "character", record: { id: "old", profileImg: "missing-bin-picture" } }] }
  ]) {
    assert(!valid.inspect(damaged).ok, "Incomplete backup must fail inspection");
    await valid.restore(damaged);
    assert.equal(valid.replacements.length, 0, "Damaged backup must not replace storage");
  }
  console.log("PASS missing live, cover and Bin pictures, malformed IDs and payloads block replacement");

  const paired = fixture(true);
  await paired.restore(backup());
  assert.equal(paired.replacements.length, 0);
  assert.equal(paired.disk.get("sync:state"), '{"group":"old-group","approved":true}');
  assert(paired.notices.some(message => /Leave your paired group/.test(message)));
  assert.equal(paired.ctx.backupRestoreBusy.current, false);
  const unavailable = fixture(new Error("status unavailable"));
  await unavailable.restore(backup());
  assert.equal(unavailable.replacements.length, 0, "Unverifiable pairing state must fail closed");
  console.log("PASS paired or unverifiable sync refuses restore without changing the vault");

  await valid.restore(backup());
  assert.equal(valid.replacements.length, 1);
  assert.equal(valid.disk.get("chars:all"), JSON.stringify(backup().chars));
  assert.equal(valid.disk.get("img:portrait"), picture);
  assert(!valid.disk.has("ui:lastbackup"), "Restore must not claim a new export");
  assert(!valid.disk.has("sync:state"), "Restore must clear stale sync ancestry");
  assert.equal(valid.backupDates.at(-1), 0);
  assert.equal(valid.ctx.backupRestoreBusy.current, false);
  console.log("PASS standalone restore replaces data atomically and clears backup health and sync ancestry");
})().catch(error => { console.error(error); process.exitCode = 1; });
