const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const activity = fs.readFileSync(path.join(root, "mobile", "android", "app", "src", "main", "java", "com", "cptbendova", "rolecraftvault", "MainActivity.java"), "utf8");
const manifest = fs.readFileSync(path.join(root, "mobile", "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
const exporter = fs.readFileSync(path.join(root, "mobile", "android", "app", "src", "main", "java", "com", "cptbendova", "rolecraftvault", "FileExportPlugin.java"), "utf8");

let failures = 0;
function check(label, ok) {
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label);
  if (!ok) failures++;
}

console.log("\nAndroid system UI and export locale\n");
check("Android 15+ does not rely on the removed edge-to-edge opt-out",
  /setDecorFitsSystemWindows\([\s\S]*VERSION_CODES\.VANILLA_ICE_CREAM/.test(activity));
check("system bars and display cutouts are both measured",
  /Type\.systemBars\(\)[\s\S]*Type\.displayCutout\(\)/.test(activity));
check("all four native safe insets protect the WebView container",
  /setPadding\(safe\.left, safe\.top, safe\.right, safe\.bottom\)/.test(activity));
check("handled insets are zeroed before reaching the WebView",
  /new WindowInsetsCompat\.Builder\(windowInsets\)[\s\S]*setInsets\(safeTypes, Insets\.NONE\)/.test(activity));
check("IME updates are not blocked by consuming the whole inset object",
  !/WindowInsetsCompat\.CONSUMED/.test(activity));
check("pre-Android 12 backups remain explicitly disabled",
  /android:allowBackup="false"/.test(manifest) && /android:fullBackupContent="false"/.test(manifest));
check("export extension checks are independent of the device locale",
  /toLowerCase\(Locale\.ROOT\)/.test(exporter));

if (failures) {
  console.error("\n" + failures + " Android operational check(s) failed.");
  process.exit(1);
}
console.log("\nAndroid controls remain outside system UI on current and older supported versions.");
