#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const config = JSON.parse(read("mobile/capacitor.config.json"));
const strings = read("mobile/android/app/src/main/res/values/strings.xml");
const manifest = read("mobile/android/app/src/main/AndroidManifest.xml");
const gradle = read("mobile/android/app/build.gradle");
const javaRoot = "mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/";
const java = name => read(javaRoot + name);

// A display-name change must still install over an existing private Chat APK.
assert.strictEqual(config.appName, "Rolecraft");
assert.match(strings, /<string name="app_name">Rolecraft<\/string>/);
assert.match(strings, /<string name="title_activity_main">Rolecraft<\/string>/);
assert.match(manifest, /android:label="@string\/app_name"/);
assert.match(manifest, /android:label="@string\/title_activity_main"/);
assert.strictEqual(config.appId, "com.cptbendova.rolecraftvault.chat");
assert.match(gradle, /applicationId "com\.cptbendova\.rolecraftvault\.chat"/);
assert.match(manifest, /android:taskAffinity="com\.cptbendova\.rolecraftvault\.chat"/);

for (const name of ["VaultSyncService.java", "TransferService.java", "DeviceUnlockPlugin.java", "OpenRouterPlugin.java", "ImageGenerationPlugin.java", "CredentialShare.java"]) {
  assert.doesNotMatch(java(name), /Rolecraft Vault Chat|Rolecraft Chat|Unlock Rolecraft Vault|updated Chat app/, `${name} still shows an old product name`);
}
assert.match(java("VaultSyncService.java"), /setContentTitle\("Rolecraft device sync"\)/);
assert.match(java("TransferService.java"), /setContentTitle\("Rolecraft"\)/);
assert.match(java("DeviceUnlockPlugin.java"), /prompt\(call, cipher, "Unlock Rolecraft"/);
// Do not silently move already-exported user pictures during a visual rebrand.
assert.match(java("FileExportPlugin.java"), /Pictures\/Rolecraft Vault/);

console.log("Android Rolecraft labels and in-place upgrade identity passed");
