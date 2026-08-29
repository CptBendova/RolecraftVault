/* Exporting anything has to actually write a file on both editions.

   An <a download> is swallowed by the Android WebView: Capacitor wires no
   DownloadListener — its own Android source has none — so the click did
   nothing at all and every export silently failed while the toast said it had
   worked. Backups, character JSON, CharSnap files, picture zips: all of it.

   Both paths are exercised here by lifting saveFile out of app.js and running
   it with the browser bits stubbed, so what is tested is the shipped code and
   not a description of it. Plain node; no Electron needed. */
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");
const EXPORT_PLUGIN = fs.readFileSync(path.join(__dirname, "..", "mobile", "android", "app", "src", "main", "java",
  "com", "cptbendova", "rolecraftvault", "FileExportPlugin.java"), "utf8");
const MAIN_ACTIVITY = fs.readFileSync(path.join(__dirname, "..", "mobile", "android", "app", "src", "main", "java",
  "com", "cptbendova", "rolecraftvault", "MainActivity.java"), "utf8");

/* lift saveFile, phoneSave, writeSomewhere, SAVE_SPOTS and the notice hook */
function lift(name, kind) {
  const needle = (kind || "function ") + name + (kind === "const " ? "" : "(");
  const start = SRC.indexOf(needle);
  if (start < 0) {
    /* Its absence is the bug, not a broken check: before this existed every
       export went straight to an <a download>, which the Android WebView
       ignores, so nothing was written and the toast said it had been. */
    console.log("  FAIL  app.js has no " + name + ": saving is not aware of the platform,");
    console.log("        so on Android an export writes nothing and still reports success.");
    process.exit(1);
  }
  if (kind === "const ") {
    const end = SRC.indexOf("\n", SRC.indexOf("=", start));
    return SRC.slice(start, end);
  }
  let d = 0, end = start;
  for (let i = SRC.indexOf("{", start); i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (d === 0) { end = i + 1; break; } }
  }
  return SRC.slice(start, end);
}
const lifted = [
  lift("revokeSoon"),        // saveFile calls it on the desktop path
  lift("SAVE_SPOTS", "const "),
  lift("setSaveNotice"),
  lift("downloadExport"),
  lift("writeSomewhere", "async function "),
  lift("phoneSave"),
  lift("appendJsonText"),
  lift("streamJsonSomewhere"),
  lift("appendDownloadText"),
  lift("streamJsonDownload"),
  lift("phoneJsonStream"),
  lift("saveFile"),
].join("\n");
console.log("lifted " + lifted.length + " chars of the real saving code");

const build = env => new Function("window", "document", "URL", "FileReader", "Blob", "setTimeout",
  "let saveNotice = null;\n" + lifted +
  "\nreturn { saveFile, phoneJsonStream, setSaveNotice };")(
  env.window, env.document, env.URL, env.FileReader, env.Blob, env.setTimeout);

/* a Blob and FileReader good enough for the real code to use */
function makeEnv(capacitor) {
  const log = { anchorClicks: [], writes: [], revoked: 0, notices: [] };
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts || [];
      this.size = String(parts && parts[0] || "").length;
      this.type = options && options.type || "";
    }
  }
  class FakeReader {
    readAsDataURL(blob) {
      const text = String((blob.parts && blob.parts[0]) || "");
      this.result = "data:application/json;base64," + Buffer.from(text, "utf8").toString("base64");
      setTimeout(() => this.onload && this.onload(), 0);
    }
  }
  const env = {
    window: { Capacitor: capacitor },
    document: { createElement: () => ({ set href(v) {}, set download(v) { this._d = v; }, click() { log.anchorClicks.push(this._d); } }) },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => { log.revoked++; } },
    FileReader: FakeReader, Blob: FakeBlob, setTimeout,
  };
  return { env, log, FakeBlob };
}

let bad = 0;
const check = (label, ok, detail) => { if (!ok) bad++; console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : "")); };
const wait = () => new Promise(r => setTimeout(r, 30));

(async () => {
  check("the Android shell registers its public export bridge",
    /registerPlugin\(FileExportPlugin\.class\)/.test(MAIN_ACTIVITY));
  check("current Android exports use the public Downloads collection",
    /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/.test(EXPORT_PLUGIN) &&
    /Environment\.DIRECTORY_DOWNLOADS/.test(EXPORT_PLUGIN) && /IS_PENDING/.test(EXPORT_PLUGIN));
  check("individual Android pictures use a public Gallery-visible collection",
    /MediaStore\.Images\.Media\.EXTERNAL_CONTENT_URI/.test(EXPORT_PLUGIN) &&
    /Environment\.DIRECTORY_PICTURES/.test(EXPORT_PLUGIN) &&
    /Pictures\/Rolecraft Vault/.test(EXPORT_PLUGIN) &&
    /MediaScannerConnection\.scanFile/.test(EXPORT_PLUGIN));
  check("picture downloads offer files or a ZIP instead of forcing an archive",
    /const askImageExport =/.test(SRC) &&
    /Save individual files/.test(SRC) && /Create ZIP/.test(SRC) &&
    /collection: "pictures", quiet: true/.test(SRC));
  check("Android's picker accepts JSON files as labelled by common Downloads apps",
    /const JSON_FILE_ACCEPT = "\.json,application\/json,text\/json,text\/plain,application\/octet-stream"/.test(SRC) &&
    (SRC.match(/accept: JSON_FILE_ACCEPT/g) || []).length >= 4);

  /* ---- the desktop edition: no Capacitor, so the anchor is used ---- */
  {
    const { env, log, FakeBlob } = makeEnv(undefined);
    const api = build(env);
    api.saveFile(new FakeBlob(["hello"]), "backup.json");
    await wait();
    check("desktop still saves through the download link", log.anchorClicks.length === 1, "clicks=" + log.anchorClicks.length);
    check("and with the right filename", log.anchorClicks[0] === "backup.json", String(log.anchorClicks[0]));
  }

  /* ---- a picture on the phone: public Pictures, not a zip in Downloads ---- */
  {
    const written = [];
    const cap = { nativePromise: async (plugin, method, opts) => {
      written.push({ plugin, method, opts });
      if (method === "begin") return { token: "picture-1", location: "Pictures/Rolecraft Vault" };
      if (method === "finish") return { location: "Pictures/Rolecraft Vault" };
      return {};
    } };
    const { env, log, FakeBlob } = makeEnv(cap);
    const api = build(env);
    const notices = [];
    api.setSaveNotice(m => notices.push(m));
    const where = await api.saveFile(new FakeBlob(["jpeg"], { type: "image/jpeg" }), "portrait.jpg", {
      collection: "pictures"
    });
    const begin = written.find(x => x.method === "begin");
    check("phone picture saves request the Pictures collection",
      begin && begin.opts.collection === "pictures" && begin.opts.mime === "image/jpeg",
      begin && JSON.stringify(begin.opts));
    check("the picture does not fall back to a swallowed download link", log.anchorClicks.length === 0);
    check("the result names the Gallery-visible album",
      where === "Pictures/Rolecraft Vault" && notices.length === 1 && /Pictures\/Rolecraft Vault/.test(notices[0]),
      notices[0] || "(silent)");
  }

  /* ---- the phone: the plugin is used and the link is never touched ---- */
  {
    const written = [];
    const cap = { nativePromise: async (plugin, method, opts) => {
      written.push({ plugin, method, opts });
      if (method === "begin") return { token: "export-1", location: "Downloads" };
      if (method === "finish") return { location: "Downloads" };
      return {};
    } };
    const { env, log, FakeBlob } = makeEnv(cap);
    const api = build(env);
    const notices = [];
    api.setSaveNotice(m => notices.push(m));
    api.saveFile(new FakeBlob(["hello"]), "backup.json");
    await wait();
    check("the phone does not use the download link", log.anchorClicks.length === 0, "clicks=" + log.anchorClicks.length);
    check("it writes through the public Downloads bridge", written.length === 3 && written.every(x => x.plugin === "FileExport"),
      written.map(x => x.plugin + "." + x.method).join(", "));
    const begin = written.find(x => x.method === "begin");
    const append = written.find(x => x.method === "append");
    check("with the filename it was given", begin && begin.opts.filename === "backup.json", begin && String(begin.opts.filename));
    check("and the bytes, base64 encoded", append && Buffer.from(append.opts.data, "base64").toString("utf8") === "hello", append && JSON.stringify(append.opts.data));
    check("somewhere a person can find it", written.some(x => x.method === "finish"));
    check("and it says where it went", notices.length === 1 && /backup\.json.*Downloads/.test(notices[0]), notices[0] || "(silent)");
  }

  /* ---- the phone, when the public folder is refused ---- */
  {
    const tried = [];
    const cap = { nativePromise: async (p, m, o) => {
      if (p === "FileExport") throw new Error("old APK");
      tried.push(o.directory);
      if (o.directory !== "DATA") throw new Error("denied");
      return {};
    } };
    const { env, FakeBlob } = makeEnv(cap);
    const api = build(env);
    const notices = [];
    api.setSaveNotice(m => notices.push(m));
    api.saveFile(new FakeBlob(["hello"]), "backup.json");
    await wait();
    check("a refused folder is not the end of it", tried.length > 1, "tried " + tried.join(" then "));
    check("and the message names where it really landed", notices.length === 1 && /private/.test(notices[0]), notices[0] || "(silent)");
  }

  /* ---- the phone, when nothing can be written ---- */
  {
    const cap = { nativePromise: async () => { throw new Error("no room"); } };
    const { env, FakeBlob } = makeEnv(cap);
    const api = build(env);
    const notices = [];
    api.setSaveNotice(m => notices.push(m));
    api.saveFile(new FakeBlob(["hello"]), "backup.json");
    await wait();
    check("a failure is said out loud, not swallowed", notices.length === 1 && /Couldn't save/.test(notices[0]), notices[0] || "(silent)");
  }

  /* ---- a large Android backup: bounded UTF-8 bridge calls ---- */
  {
    const written = [];
    const cap = { nativePromise: async (plugin, method, opts) => {
      written.push({ plugin, method, opts });
      if (method === "begin") return { token: "large-1", location: "Downloads" };
      if (method === "finish") return { location: "Downloads" };
      return {};
    } };
    const { env } = makeEnv(cap);
    const api = build(env);
    const huge = "x".repeat(700000);
    const where = await api.phoneJsonStream("large.json", async append => {
      await append("{\"images\":\"");
      await append(huge);
      await append("\"}");
    });
    const writes = written.filter(x => x.plugin === "FileExport" && x.method === "append");
    check("large phone backups are streamed instead of passed as one bridge value", writes.length >= 4,
      "calls=" + writes.length);
    check("one public download is opened and finished", written[0].method === "begin" && written[written.length - 1].method === "finish");
    check("every bridge value stays bounded", writes.every(x => String(x.opts.data).length <= 256 * 1024));
    check("streamed JSON is written as UTF-8", writes.every(x => x.opts.encoding === "utf8") && where === "Downloads");
  }

  console.log("");
  console.log(bad ? "  " + bad + " problem(s): an export can claim to have worked without writing anything."
                  : "  Exports write a file on both editions, and say so when they cannot.");
  process.exit(bad ? 1 : 0);
})();
