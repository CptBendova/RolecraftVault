/* Regression coverage for the eight defects found after 1.248.
   This deliberately inspects and evaluates the shipped sources. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app", "app.js"), "utf8");
const plugin = fs.readFileSync(path.join(root, "mobile", "android", "app", "src", "main", "java",
  "com", "cptbendova", "rolecraftvault", "FileExportPlugin.java"), "utf8");

let bad = 0;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};

function functionBlock(name) {
  let start = app.indexOf("const " + name + " =");
  if (start < 0) start = app.indexOf("function " + name + "(");
  if (start < 0) return "";
  const brace = app.indexOf("{", start);
  if (brace < 0) return app.slice(start, app.indexOf("\n", start));
  let depth = 0;
  for (let i = brace; i < app.length; i++) {
    if (app[i] === "{") depth++;
    else if (app[i] === "}") {
      depth--;
      if (!depth) return app.slice(start, app.indexOf(";", i) + 1);
    }
  }
  return "";
}

const promptLine = (app.match(/const promptKey =[^\n]+/) || [""])[0];
let promptKey = null;
try {
  promptKey = new Function(promptLine + "; return promptKey;")();
} catch {}
check("prompt duplicate keys keep collection and title boundaries distinct",
  promptKey && promptKey({ collection: "A B", title: "C" }) !== promptKey({ collection: "A", title: "B C" }));

for (const name of ["deleteEmptyBucket", "setBucketCover", "deleteEmptyPersonaBucket"]) {
  const body = functionBlock(name);
  check(name + " spares a cover still owned elsewhere",
    /heldImageIds\(\)\.has\(/.test(body), body ? "guard present=" + /heldImageIds\(\)\.has\(/.test(body) : "function missing");
}

const blobHelper = functionBlock("downloadBlob");
check("downloadBlob returns the real save result", /return\s+saveFile\(/.test(blobHelper));
check("ZIP success messages wait for the save result",
  (app.match(/await downloadBlob\(/g) || []).length === 2 &&
  (app.match(/if \(saved\) toast\(z\.count/g) || []).length === 2);
check("JSON success messages use the checked export helper",
  /const exportJSON = async/.test(app) && (app.match(/exportJSON\(/g) || []).length >= 12);

const preload = app.slice(app.indexOf("/* Previews (thumbs)"), app.indexOf("/* --- one-time thumbnail upgrade"));
const phoneGate = preload.indexOf("if (!onPhone) return");
check("desktop preloads lorebook covers",
  preload.indexOf("Object.values(loreMeta)") >= 0 && preload.indexOf("Object.values(loreMeta)") < phoneGate);
check("desktop preloads prompt collection covers",
  preload.indexOf("Object.values(promptMeta)") >= 0 && preload.indexOf("Object.values(promptMeta)") < phoneGate);

const phoneSave = functionBlock("phoneSave");
check("Android Blob exports are sliced instead of copied whole",
  !/readAsDataURL\(blob\)/.test(phoneSave) && /streamBlobDownload/.test(phoneSave) && /streamBlobSomewhere/.test(phoneSave));

check("Android 8 and 9 exports request legacy public-storage permission",
  /@Permission\([\s\S]*WRITE_EXTERNAL_STORAGE[\s\S]*alias\s*=\s*"storage"/.test(plugin) &&
  /requestPermissionForAlias\("storage"/.test(plugin) && /@PermissionCallback/.test(plugin));

const persistBlur = functionBlock("persistBlur");
const forgetBlur = functionBlock("forgetBlur");
const dropImage = functionBlock("dropImage");
check("blur writes are serialized", /blurWriteRef\.current/.test(persistBlur) && /\.then\(\(\) => sSet/.test(persistBlur));
check("picture deletion waits for blur metadata", /return touched \? persistBlur/.test(forgetBlur) && /await forgetBlur\(\[id\]\)/.test(dropImage));

check("the Android guide names the public picture album",
  app.includes("Individual pictures are saved in Pictures/Rolecraft Vault so Gallery apps can find them."));

console.log("");
console.log(bad ? "  " + bad + " release-audit regression(s) failed."
                : "  All eight post-1.248 findings are covered.");
process.exit(bad ? 1 : 0);
