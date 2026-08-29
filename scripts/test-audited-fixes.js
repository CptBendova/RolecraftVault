/* Regression contracts for the cross-edition failure audit that led to 1.240.
   These checks read the shipped implementations, so a copied test substitute
   cannot keep passing after the real safety path regresses. Plain node. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const app = read("app/app.js");
const main = read("app/main.js");
const preload = read("app/preload.js");
const platform = read("web/js/rolecraft-web-platform.js");
const transfer = read("mobile/src/rc-transfer.js");
const signer = read("scripts/sign-update.js");

let bad = 0;
function check(label, ok) {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label);
}

check("Windows security metadata is written atomically",
  /function saveSecurity\(s\)[\s\S]{0,180}writeFileAtomic\(securityFile/.test(main));
check("update shell routing is carried inside the signed hashes",
  /"meta:needsShell"\s*:\s*legacyNeedsShell/.test(signer) &&
  /"meta:minShellBuild"\s*:\s*minShellBuild/.test(signer) &&
  /pkg\.hashes\["meta:needsShell"\]/.test(main) &&
  /pkg\.hashes\["meta:minShellBuild"\]/.test(main));
check("tamperable top-level routing cannot override signed routing",
  /hasSignedRouting \? signedNeedsShell === "1" : pkg\.needsShell === true/.test(main));

check("desktop restore stages values and swaps only at commit",
  /function beginVaultRestore/.test(main) && /function commitVaultRestore/.test(main) &&
  /vault-restore-begin/.test(preload) && /vault-restore-commit/.test(preload));
check("web and Android restore commit all pointers in one IDB transaction",
  /function commitStorageReplacement/.test(platform) && /replace:\s*function \(values, spec\)/.test(platform));
check("Android password changes commit records, security and wrap key together",
  /function commitAuthReplacement/.test(platform) &&
  /os\.put\(JSON\.stringify\(newSecurity\), SEC_KEY\)/.test(platform) &&
  /os\.put\(wrappedKey, WRAP_KEY_ID\)/.test(platform));

check("Android reports an active receive while lifecycle locking is suspended",
  /let receiveActive = false/.test(transfer) &&
  /active: receiveActive/.test(transfer) &&
  /finally[\s\S]{0,180}receiveActive = false/.test(transfer));
check("large Android backups use the streaming writer",
  /phoneJsonStream\(filename/.test(app) && /"appendFile"/.test(app) && /encoding: "utf8"/.test(app));

check("picture deletion waits for all three persistent records",
  /const dropImage = useCallback\(async id =>[\s\S]{0,220}await Promise\.all\(\["img:", "th:", "sz:"\]/.test(app));
check("whole-lore and whole-prompt exports carry pictures and thumbnails",
  /type: "prompts"[\s\S]{0,180}images,[\s\S]{0,80}thumbs/.test(app) &&
  /type: "lore"[\s\S]{0,180}images,[\s\S]{0,80}thumbs/.test(app));

console.log("");
console.log(bad ? "  " + bad + " audited fix contract(s) regressed."
                : "  All audited cross-edition fixes are present.");
process.exit(bad ? 1 : 0);
