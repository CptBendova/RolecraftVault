const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { migrateStandardVault, importedProfile, prepareChatEncryption } = require("../app/chat-migration");

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-chat-migration-"));
  const source = path.join(root, "standard"), destination = path.join(root, "chat");
  fs.mkdirSync(path.join(source, "vault"), { recursive: true });
  fs.mkdirSync(path.join(destination, "vault"), { recursive: true });
  fs.writeFileSync(path.join(source, "vault", "chars%3Aall.dat"), "enc:sealed characters");
  fs.writeFileSync(path.join(source, "vault", "img%3Aportrait.dat"), "enc:sealed picture");
  fs.writeFileSync(path.join(source, "security.json"), '{"salt":"fixture","pinBlob":"fixture"}');
  fs.writeFileSync(path.join(destination, "vault", "thumbver.dat"), "starter metadata");
  const result = await migrateStandardVault({ source, destination });
  assert(result.migrated);
  for (const name of ["vault/chars%3Aall.dat", "vault/img%3Aportrait.dat", "security.json"]) {
    assert.deepStrictEqual(fs.readFileSync(path.join(result.profile, name)), fs.readFileSync(path.join(source, name)));
  }
  assert.strictEqual(importedProfile(destination), result.profile);
  assert.strictEqual(fs.readFileSync(path.join(destination, "vault", "thumbver.dat"), "utf8"), "starter metadata");
  fs.writeFileSync(path.join(result.profile, "vault", "chats%3Aall.dat"), "new conversation");
  assert.strictEqual((await migrateStandardVault({ source, destination })).profile, result.profile);
  assert.strictEqual(fs.readFileSync(path.join(result.profile, "vault", "chats%3Aall.dat"), "utf8"), "new conversation");
  console.log("PASS: encrypted records, pictures and unlock metadata migrate once; later Chat data survives");

  const occupied = path.join(root, "occupied");
  fs.mkdirSync(path.join(occupied, "vault"), { recursive: true });
  fs.writeFileSync(path.join(occupied, "vault", "chars%3Aall.dat"), "existing character");
  assert.strictEqual((await migrateStandardVault({ source, destination: occupied })).migrated, false);
  assert.strictEqual(fs.readFileSync(path.join(occupied, "vault", "chars%3Aall.dat"), "utf8"), "existing character");
  console.log("PASS: an existing Chat library is never overwritten");

  const changing = path.join(root, "changing");
  await assert.rejects(migrateStandardVault({ source, destination: changing, onProgress() {
    fs.writeFileSync(path.join(source, "vault", "new.dat"), "changed during copy");
  } }), /changed during copying/);
  assert.strictEqual(importedProfile(changing), null);
  fs.writeFileSync(path.join(source, "rewrap.json"), "pending");
  await assert.rejects(migrateStandardVault({ source, destination: path.join(root, "pending") }), /pending library operation/);
  console.log("PASS: changing sources and interrupted password changes cannot publish a partial vault");

  const protectedProfile = path.join(root, "protected");
  fs.mkdirSync(protectedProfile);
  fs.writeFileSync(path.join(protectedProfile, "security.json"), "existing password metadata");
  assert.strictEqual((await migrateStandardVault({ source, destination: protectedProfile })).migrated, false);
  console.log("PASS: a protected Chat profile is never replaced, even if its vault is empty");
  fs.writeFileSync(path.join(source, "Local State"), JSON.stringify({ os_crypt: { encrypted_key: "protected fixture key" }, unrelated: "must not copy" }));
  const runtime = prepareChatEncryption(source, destination);
  assert.strictEqual(runtime, path.join(destination, "standard-encryption"));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(runtime, "Local State"))), { os_crypt: { encrypted_key: "protected fixture key" } });
  assert.strictEqual(prepareChatEncryption(source, occupied), occupied);
  assert.strictEqual(prepareChatEncryption(source, protectedProfile), protectedProfile);
  const fresh = path.join(root, "fresh");
  const freshRuntime = prepareChatEncryption(source, fresh);
  fs.mkdirSync(path.join(fresh, "vault"));
  fs.writeFileSync(path.join(fresh, "vault", "chars%3Aall.dat"), "new Chat data");
  assert.strictEqual(prepareChatEncryption(path.join(root, "source-no-longer-present"), fresh), freshRuntime);
  assert.strictEqual(prepareChatEncryption(path.join(root, "source-no-longer-present"), destination), runtime);
  fs.writeFileSync(path.join(freshRuntime, "Local State"), "{}");
  assert.throws(() => prepareChatEncryption(source, fresh), /encryption context is missing/);
  console.log("PASS: copied encryption context survives restarts and new Chat data; unrelated settings and existing libraries remain separate");
  fs.rmSync(root, { recursive: true, force: true });
})().catch(error => { console.error(error); process.exitCode = 1; });
