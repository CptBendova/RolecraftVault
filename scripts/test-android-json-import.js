/* Android Downloads hands WebView content-provider backed files. Exercise the
   shipped reader and verify every JSON import route uses it. */
const fs = require("fs");
const path = require("path");

const app = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");
const activity = fs.readFileSync(path.join(__dirname, "..", "mobile", "android", "app", "src", "main",
  "java", "com", "cptbendova", "rolecraftvault", "MainActivity.java"), "utf8");

function lift(name) {
  const start = app.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing " + name);
  const open = app.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < app.length; i++) {
    if (app[i] === "{") depth++;
    else if (app[i] === "}" && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error("unclosed " + name);
}

let bad = 0;
function check(label, ok) {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label);
}

class ContentReader {
  readAsText(file, encoding) {
    this.encoding = encoding;
    this.result = file.providerText;
    setImmediate(() => this.onload({ target: this }));
  }
}

(async () => {
  const readTextFile = new Function("FileReader", lift("readTextFile") + "; return readTextFile;")(ContentReader);
  const file = {
    providerText: '{"name":"From Downloads"}',
    text() { throw new Error("vendor File.text failed"); }
  };
  const text = await readTextFile(file);
  check("a content-provider JSON file is read through FileReader", JSON.parse(text).name === "From Downloads");
  check("the reader requests UTF-8", /readAsText\(file, "utf-8"\)/.test(lift("readTextFile")));
  check("Update character from JSON uses the content-provider reader",
    /const loadJsonUpdate = async[\s\S]{0,220}JSON\.parse\(await readTextFile\(f\)\)/.test(app));
  check("backup preview and whole-library imports use the same reader",
    /function readBackupPreview[\s\S]{0,140}readTextFile\(file\)/.test(app) &&
    /const handleJsonImportFile[\s\S]{0,260}readTextFile\(file\)/.test(app));
  check("the Android picker accepts common JSON MIME aliases",
    /const JSON_FILE_ACCEPT = "\.json,application\/json,text\/json,text\/plain,application\/octet-stream"/.test(app) &&
    (app.match(/accept: JSON_FILE_ACCEPT/g) || []).length >= 4);

  let clock = 1000;
  const createFilePickerLockGate = new Function(
    lift("createFilePickerLockGate") + "; return createFilePickerLockGate;"
  )();
  const pickerGate = createFilePickerLockGate(() => clock);
  pickerGate.begin();
  clock += 3000;
  check("a real Android file choice is not mistaken for leaving after 2.5 seconds",
    pickerGate.remaining() > 9 * 60 * 1000);
  pickerGate.returned();
  check("returning from Downloads narrows the exception to a short processing grace",
    pickerGate.remaining() === 2500);
  clock += 2501;
  check("normal background locking is restored after the picker has returned",
    pickerGate.remaining() === 0);
  check("the Android lifecycle gate begins on file input and settles on resume",
    /closest\('input\[type="file"\]'\)\) defer\(\)/.test(app) &&
    /if \(!document\.hidden\) \{\s*pickerGate\.returned\(\)/.test(app) &&
    /window\.__rcvOnForeground = \(\) => pickerGate\.returned\(\)/.test(app) &&
    /public void onResume\(\)[\s\S]{0,450}window\.__rcvOnForeground/.test(activity));

  console.log("");
  console.log(bad ? "  " + bad + " Android JSON import regression(s) failed."
                  : "  Android can select and read JSON from Downloads across file-provider variants.");
  process.exit(bad ? 1 : 0);
})().catch(err => {
  console.error(err && err.stack || err);
  process.exit(1);
});
