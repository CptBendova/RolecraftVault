const assert = require("assert"), crypto = require("crypto"), C = require("../app/vault-sync-core");
const hash = async text => crypto.createHash("sha256").update(text).digest("hex");
const key = (id = "shared", kind = "character") => C.keyOf(kind, id);
const record = (name, extra = {}) => ({id:"shared", name, updatedAt:100, profileImg:"portrait", images:["original"], variants:[{id:"variant", profileImg:"variant-portrait"}], ...extra});
const items = (value, kind = "character") => ({[key(value.id, kind)]:value});
const single = (snapshots, device, localSnapshot, primary = "tablet") => C.merge(snapshots, primary, hash, {singleLibrary:true, device, localSnapshot});
const live = result => Object.entries(result.items).filter(([id]) => ["character","persona","lore","prompt"].includes(C.parts(id)[0]));
const bin = result => Object.entries(result.items).filter(([id]) => C.parts(id)[0] === "trash");

(async () => {
  const base = await C.scan(items(record("Original")), null, "tablet", hash);
  const tablet = await C.scan(items(record("Tablet edited")), base, "tablet", hash);
  const phone = await C.scan(items(record("Phone edited", {images:["phone-full-resolution"]})), base, "phone", hash);
  const resolved = await single([phone, tablet], "tablet", tablet);
  assert.equal(live(resolved).length, 1, "concurrent writing must not make another character card");
  assert.equal(resolved.items[key()].name, "Tablet edited");
  assert.equal(bin(resolved).length, 1);
  const [recoveryKey, recovery] = bin(resolved)[0];
  assert.equal(recovery.type, "character");
  assert.equal(recovery.syncConflict, true);
  assert.equal(recovery.syncRecovered, true);
  assert.deepEqual(recovery.record, phone.entries[key()].versions[0].value, "preserve every original field and image identity");
  assert.equal(recovery.record.id, "shared");
  assert.deepEqual(resolved.recoveryDependencies[key()], [recoveryKey]);
  assert.equal(resolved.snapshot.entries[key()].versions.length, 1);
  assert.equal(resolved.snapshot.entries[key()].versions[0].hash, tablet.entries[key()].applied, "resolution preserves the selected payload hash");
  assert.equal(resolved.snapshot.entries[key()].versions[0].author, "tablet");
  await C.validate(resolved.snapshot, hash);
  assert.equal(C.canonical(resolved), C.canonical(await single([tablet, phone], "tablet", tablet)));
  console.log("PASS primary resolves genuine conflicts into one card and preserves original alternate writing/photos in Bin");

  const laterPhone = await C.scan({...resolved.items, [key()]:record("Newer phone edit")}, resolved.snapshot, "phone", hash);
  const updated = await single([resolved.snapshot, laterPhone], "tablet", resolved.snapshot);
  assert.equal(updated.items[key()].name, "Newer phone edit", "ordinary phone descendant must update the primary");
  assert.equal(bin(updated).length, 1);
  const unseen = await single([tablet, phone], "computer", base);
  assert.equal(live(unseen).length, 1);
  assert.equal(unseen.snapshot.entries[key()].versions.length, 2, "secondary must not invent an authoritative resolution");
  assert(!unseen.snapshot.entries[key()].versions.some(v => v.author === "computer"));
  console.log("PASS normal changes remain two-way and an offline primary does not create competing resolutions");

  const pc = await C.scan(items(record("Computer edited")), base, "computer", hash);
  const pc2 = await C.scan(items(record("Other computer edited")), base, "computer2", hash);
  const settled = await single([tablet, phone, pc, pc2], "tablet", tablet);
  const settledReverse = await single([pc2, pc, phone, tablet], "tablet", tablet);
  assert.equal(C.canonical(settled), C.canonical(settledReverse));
  assert.equal(live(settled).length, 1);
  assert.equal(bin(settled).length, 3);
  for (const [device, original] of [["phone", phone],["computer", pc],["computer2", pc2]]) {
    const converged = await single([original, settled.snapshot], device, original);
    assert.equal(C.canonical(converged.items), C.canonical(settled.items));
    assert.equal(C.canonical(converged.snapshot), C.canonical(settled.snapshot));
    assert.deepEqual(converged.recoveryDependencies[key()], settled.recoveryDependencies[key()], "received resolution still waits for every recovery row");
  }
  const selectedPhone = await single([tablet, phone, pc], "phone", phone, "phone");
  assert.equal(selectedPhone.items[key()].name, "Phone edited", "changing primary changes only genuine concurrent preference");
  console.log("PASS four replicas converge in either order and a newly selected primary can resolve its local conflict");

  const deleted = await C.scan({}, base, "tablet", hash);
  const deletionConflict = await single([deleted, phone], "tablet", deleted);
  assert.equal(deletionConflict.items[key()].name, "Phone edited", "concurrent writing survives primary deletion");
  const knownDeletion = await C.scan(Object.fromEntries(Object.entries(resolved.items).filter(([id]) => id !== key())), resolved.snapshot, "phone", hash);
  assert(!((await single([knownDeletion, resolved.snapshot], "tablet", resolved.snapshot)).items[key()]), "causal deletion still applies");
  console.log("PASS deletion cannot erase concurrent writing, but a later intentional deletion still converges");

  const purgedItems = Object.fromEntries(Object.entries(resolved.items).filter(([id]) => id !== recoveryKey));
  const purged = await C.scan(purgedItems, resolved.snapshot, "computer2", hash);
  const retry = await single([purged, phone, tablet], "tablet", purged);
  assert(!retry.items[recoveryKey], "stale peers must not recreate a purged recovery row");
  const lateReplica = JSON.parse(JSON.stringify(phone));
  lateReplica.entries[key()].versions[0].clock.computer = 9;
  const lateArchive = await single([tablet, lateReplica], "computer", base);
  const afterLate = await single([purged, lateArchive.snapshot], "computer2", purged);
  assert(!afterLate.items[recoveryKey], "late-generated archive seed cannot resurrect a purged recovery identity");
  console.log("PASS retries and offline recovery seeds cannot resurrect explicitly purged Bin alternatives");

  const differentTimestamp = JSON.parse(JSON.stringify(phone));
  differentTimestamp.entries[key()].versions[0].at += 1000;
  const archivedLater = await single([tablet, differentTimestamp], "tablet", tablet);
  const bothArchives = await single([resolved.snapshot, archivedLater.snapshot], "computer", resolved.snapshot);
  assert.equal(bin(bothArchives).length, 1, "same discarded payload must not make metadata-only Bin conflicts");
  assert.equal(bothArchives.items[recoveryKey].deletedAt, recovery.deletedAt);
  assert.equal(C.canonical(bothArchives), C.canonical(await single([archivedLater.snapshot,resolved.snapshot], "computer", resolved.snapshot)));
  await C.validate(bothArchives.snapshot, hash);
  const reviewedArchive = {...resolved.items, [recoveryKey]:{...recovery, record:{...recovery.record, name:"Edited saved alternate"}}};
  const review = await C.scan(reviewedArchive, resolved.snapshot, "computer", hash);
  const reviewMerged = await single([review,resolved.snapshot], "tablet", resolved.snapshot);
  assert.equal(reviewMerged.items[recoveryKey].record.name, "Edited saved alternate", "a real archive descendant must survive seed replay");
  console.log("PASS metadata-only archive timestamps coalesce without replacing reviewed Bin writing");

  const untouched = await C.merge([tablet, phone], "tablet", hash);
  assert.equal(live(untouched).length, 2);
  assert(Object.values(untouched.items).some(value => /\(sync conflict\)/.test(value.name)));
  for (const kind of ["persona", "lore", "prompt"]) {
    const a = await C.scan(items(record("A"), kind), null, "tablet", hash);
    const b = await C.scan(items(record("B"), kind), null, "phone", hash);
    const result = await single([a,b], "tablet", a);
    assert.equal(live(result).length, 1);
    assert.equal(bin(result)[0][1].type, kind);
  }
  for (const kind of ["bucket", "trash", "conversation"]) {
    if (kind === "conversation") C.TABLES.conversation = ["chats:all", "id"];
    const value = suffix => kind === "trash" ? {tid:"shared",type:"character",record:record(suffix)} : record(suffix);
    const a = await C.scan({[key("shared",kind)]:value("A")}, null, "tablet", hash);
    const b = await C.scan({[key("shared",kind)]:value("B")}, null, "phone", hash);
    const ordinary = await C.merge([a,b], "tablet", hash), privateMode = await single([a,b], "tablet", a);
    assert.equal(C.canonical(privateMode.items), C.canonical(ordinary.items), kind+" must retain its existing conflict-preservation policy");
    assert.equal(C.canonical(privateMode.snapshot), C.canonical(ordinary.snapshot));
    if (kind === "conversation") delete C.TABLES.conversation;
  }
  const badLocal = JSON.parse(JSON.stringify(tablet));
  badLocal.entries[key()].applied = "not-a-frontier-revision";
  await assert.rejects(single([tablet,phone], "tablet", badLocal), /applied|revision/i);
  const exhausted = JSON.parse(JSON.stringify(tablet));
  exhausted.entries[key()].versions[0].clock.tablet = Number.MAX_SAFE_INTEGER;
  await assert.rejects(single([exhausted,phone], "tablet", exhausted), /counter exhausted/);
  console.log("PASS standard, conversation and metadata policy stay unchanged; all active record types and malformed preferences are covered");
})().catch(error => {console.error(error); process.exitCode = 1;});
