// Execute the production queue and conditional gallery save without a provider,
// account, real profile or a duplicated implementation.
const assert = require("assert"), fs = require("fs"), path = require("path");
const source = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");
const start = source.indexOf("async function runStudioBatch("), end = source.indexOf("\nfunction CharacterImageStudio(", start);
assert(start >= 0 && end > start, "Production sequential batch runner exists");
const runBatch = new Function(source.slice(start, end) + "; return runStudioBatch;")();
function fixture(overrides = {}) {
  let id = 0, active = true;
  const events = [], values = [];
  const opts = {
    count: 3, request: { provider: "openai", model: "fixture", prompt: "Chosen prompt", references: ["chosen-reference"] },
    newId: () => "fresh-" + ++id, active: () => active,
    generate: async request => { events.push(["generate", request]); return { ok: true, dataUrl: "fixture-result" }; },
    decode: async () => ({ naturalWidth: 100, naturalHeight: 200 }),
    save: async image => { events.push(["save", image.imgId]); values.push(image); },
    progress: (...args) => events.push(["progress", ...args]), preview: image => events.push(["preview", image.imgId]), saved: (...args) => events.push(["saved", ...args]),
    ...overrides
  };
  return { opts, events, values, stop: () => { active = false; } };
}
async function queueChecks() {
  const good = fixture();
  assert.deepStrictEqual(await runBatch(good.opts), { completed: 3, total: 3, state: "complete" });
  assert.deepStrictEqual(good.events.filter(x => x[0] === "generate" || x[0] === "save").map(x => x[0]), ["generate", "save", "generate", "save", "generate", "save"]);
  assert.equal(new Set(good.values.map(x => x.imgId)).size, 3, "Each result receives a fresh stable image identity");
  assert(good.events.filter(x => x[0] === "generate").every(x => x[1].references.length === 1 && !Object.hasOwn(x[1], "count")), "Native calls remain one image each with only selected references");
  for (const count of [0, 9, 2.5, NaN, "2"]) await assert.rejects(runBatch(fixture({ count }).opts), /1 and 8/);
  const maximum = fixture({ count: 8 }); assert.equal((await runBatch(maximum.opts)).completed, 8);
  let calls = 0;
  const failed = fixture({ generate: async () => ++calls === 2 ? { ok: false, error: "Provider refused" } : { ok: true, dataUrl: "ok" } });
  const failure = await runBatch(failed.opts);
  assert.equal(calls, 2); assert.equal(failure.completed, 1); assert.equal(failure.error, "Provider refused"); assert.equal(failure.state, "failed");
  assert.equal(failed.values.length, 1, "Earlier durable pictures survive a provider failure; paid requests are not retried");
  calls = 0;
  const disk = fixture({ generate: async () => { calls++; return { ok: true, dataUrl: "ok" }; }, save: async image => { if (calls === 2) throw Error("Disk full"); disk.values.push(image); } });
  const diskFailure = await runBatch(disk.opts);
  assert.equal(calls, 2); assert.equal(diskFailure.completed, 1); assert.equal(diskFailure.pending.imgId, "fresh-4");
  assert.equal(diskFailure.pending.dataUrl, "ok", "Unsaved paid result remains available for retry");
  for (const where of ["before", "generate", "decode", "save"]) {
    const stopped = fixture();
    if (where === "before") stopped.stop();
    else {
      const original = stopped.opts[where]; stopped.opts[where] = async (...args) => { const result = await original(...args); stopped.stop(); return result; };
    }
    const outcome = await runBatch(stopped.opts);
    assert.equal(outcome.state, "stopped");
    assert.equal(outcome.completed, where === "save" ? 1 : 0, "Only durably completed saves count after cancellation at " + where);
    assert.equal(stopped.values.length, where === "save" ? 1 : 0);
    assert(stopped.events.filter(x => x[0] === "generate").length <= 1, "Cancellation never starts another paid request");
  }
}
async function saveChecks() {
  const at = source.indexOf("const saveGeneratedImage = async ("), until = source.indexOf("\n  const saveChar = async", at);
  assert(at > 0 && until > at);
  const code = source.slice(at, until);
  const build = new Function("imageStudioEpoch", "document", "charsRef", "window", "decodeStudioImage", "makeThumb", "saveImage", "sGet", "DEFAULT_VID", "heldImageIds", "dropImage", "charImgIds", "setChars", "toast", "let pendingVaultWrites=0;" + code + "; return {save:saveGeneratedImage,pending:()=>pendingVaultWrites};");
  const image = { imgId: "generated", dataUrl: "fixture", provider: "openai", model: "model" };
  for (const mode of ["normal", "race", "ambiguous", "hidden", "inactive", "variant", "deleted"]) {
    const original = { id: "char", name: "Concurrent name", profileImg: "old", variants: [{ id: "v", profileImg: "variant-original" }], gallery: [{ imgId: "old-gallery", caption: "Old" }], future: { kept: true } };
    let raw = JSON.stringify(mode === "deleted" ? [] : [original]), writes = 0;
    const dropped = [], ref = { current: [original] }, epoch = { current: 0 }, document = { hidden: mode === "hidden", querySelector: () => ({}) };
    const storage = { syncCommit: async (values, expected) => {
      if (mode === "race") { raw = JSON.stringify([{ ...original, name: "New edit" }]); throw Error("Library changed during sync"); }
      assert.equal(expected["chars:all"], raw); raw = values["chars:all"];
      if (mode === "ambiguous") throw Error("Lost save acknowledgement");
    } };
    const imgIds = c => [c.profileImg, ...(c.variants || []).map(v => v.profileImg), ...(c.gallery || []).map(g => g.imgId)].filter(Boolean);
    const saver = build(epoch, document, ref, { storage }, async () => ({}), async () => "thumb", async (_id, _data, _thumb, guard) => { guard(); writes++; }, async () => raw, "__default__", () => new Set(), async id => dropped.push(id), imgIds, next => { ref.current = next; }, () => {});
    const operationGuard = () => { if (mode === "inactive") throw Error("Closed"); };
    const saving = saver.save("char", image, " Caption ", mode === "variant" ? "removed" : "v", operationGuard);
    if (mode === "normal") {
      await saving; await saver.save("char", image, " Caption ", "v", operationGuard);
      const stored = JSON.parse(raw)[0]; assert.equal(stored.gallery.length, 2, "Save retries cannot duplicate a gallery entry");
      assert.deepStrictEqual(stored.gallery[0], original.gallery[0]); assert.deepStrictEqual(stored.variants, original.variants); assert.deepStrictEqual(stored.future, original.future);
      assert.equal(stored.gallery[1].caption, "Caption"); assert.equal(stored.gallery[1].variantId, "v"); assert.equal(stored.name, "Concurrent name");
    } else await assert.rejects(saving);
    if (mode === "hidden" || mode === "inactive") assert.equal(writes, 0, "No image write after background/operation cancellation");
    if (mode === "ambiguous") { assert.equal(JSON.parse(raw)[0].gallery.length, 2); assert.deepStrictEqual(dropped, [], "Lost acknowledgement cannot delete a durably attached original"); }
    if (mode === "race") assert.equal(JSON.parse(raw)[0].name, "New edit");
    if (mode === "deleted") assert.deepStrictEqual(JSON.parse(raw), []);
    assert.equal(saver.pending(), 0, "The pending write hold is always released");
  }
}
(async () => { await queueChecks(); await saveChecks(); console.log("PASS image batch: bounded sequential paid calls, per-image saves, partial failures, no paid retries, late-result cancellation, idempotent conditional persistence, variants and original preservation"); })().catch(error => { console.error(error); process.exitCode = 1; });
