/* The recovery/onboarding/backup/search/accessibility release is one connected
   experience. Keep the safety-critical backup preview executable, and assert
   that every edition still contains the entry points users depend on. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appPath = path.join(root, "app", "app.js");
const app = fs.readFileSync(appPath, "utf8");
const main = fs.readFileSync(path.join(root, "app", "main.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "app", "preload.js"), "utf8");

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

const backupInspection = new Function("charImgIds", "personaImgIds",
  liftFunction(app, "backupInspection") + "; return backupInspection;"
)(c => c.profileImg ? [c.profileImg] : [], p => p.avatar ? [p.avatar] : []);

let bad = 0;
function check(label, ok) {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label);
}

const sound = backupInspection({
  app: "rolecraft-vault",
  chars: [{ profileImg: "portrait" }], personas: [], lore: [], prompts: [],
  images: { portrait: "data:image/png;base64,AA==" },
  manifest: { appVersion: "9.999" }, exportedAt: "2026-01-01T00:00:00.000Z"
});
const missing = backupInspection({
  app: "rolecraft-vault",
  chars: [{ profileImg: "gone" }], personas: [], lore: [], prompts: [], images: {}
});
const wrong = backupInspection({ app: "some-other-app", chars: {} });

check("a complete backup passes its real preview validator", sound.ok && !sound.warnings.length && sound.counts.chars === 1);
check("missing pictures are reported before restore", missing.ok && missing.warnings.length === 1);
check("the wrong format and damaged arrays fail closed", !wrong.ok && wrong.fatal.length >= 2);
check("all four editors use encrypted recoverable drafts", /useRecoverableDraft\("character"/.test(app) && /draftType: "persona"/.test(app) && /draftType: "lore"/.test(app) && /draftType: "prompt"/.test(app));
check("first-run, What's New, transfer and command surfaces ship together", ["OnboardingModal", "WhatsNewModal", "TransferWizard", "CommandPalette"].every(n => app.includes("function " + n)));
check("Ctrl+K and favourites are persisted", app.includes('e.key.toLowerCase() === "k"') && app.includes('sSet("ui:favorites"'));
check("large text and high contrast support ship", app.includes('textSize === "maximum" ? "29px"') && app.includes("@media (forced-colors: active)"));
check("phone controls use the 48px target", /\.rcv \.btn,[^\n]+min-height: 48px; min-width: 48px;/.test(app));
check("the renderer still delegates official downloads to the shell", app.includes("window.releasePage.open()") && preload.includes('ipcRenderer.invoke("release-page-open")'));
check("first-run guidance is limited to installed Windows and real Android", preload.includes('exposeInMainWorld("rcvInstalledApp", true)') && app.includes("window.rcvInstalledApp === true"));
check("the shell opens only the fixed official release path", main.includes('shell.openExternal("https:" + "//github.com/CptBendova/RolecraftVault/releases/latest")'));

if (bad) {
  console.log("\n  The joined-up experience is incomplete.");
  process.exit(1);
}
console.log("\n  Recovery, guidance, transfer, backup and accessibility contracts are present.");
