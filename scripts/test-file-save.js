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
  lift("writeSomewhere", "async function "),
  lift("phoneSave"),
  lift("saveFile"),
].join("\n");
console.log("lifted " + lifted.length + " chars of the real saving code");

const build = env => new Function("window", "document", "URL", "FileReader", "Blob", "setTimeout",
  "let saveNotice = null;\n" + lifted +
  "\nreturn { saveFile, setSaveNotice };")(
  env.window, env.document, env.URL, env.FileReader, env.Blob, env.setTimeout);

/* a Blob and FileReader good enough for the real code to use */
function makeEnv(capacitor) {
  const log = { anchorClicks: [], writes: [], revoked: 0, notices: [] };
  class FakeBlob {
    constructor(parts) { this.parts = parts || []; this.size = String(parts && parts[0] || "").length; }
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
  /* ---- the desktop edition: no Capacitor, so the anchor is used ---- */
  {
    const { env, log, FakeBlob } = makeEnv(undefined);
    const api = build(env);
    api.saveFile(new FakeBlob(["hello"]), "backup.json");
    await wait();
    check("desktop still saves through the download link", log.anchorClicks.length === 1, "clicks=" + log.anchorClicks.length);
    check("and with the right filename", log.anchorClicks[0] === "backup.json", String(log.anchorClicks[0]));
  }

  /* ---- the phone: the plugin is used and the link is never touched ---- */
  {
    const written = [];
    const cap = { nativePromise: async (plugin, method, opts) => { written.push({ plugin, method, opts }); return {}; } };
    const { env, log, FakeBlob } = makeEnv(cap);
    const api = build(env);
    const notices = [];
    api.setSaveNotice(m => notices.push(m));
    api.saveFile(new FakeBlob(["hello"]), "backup.json");
    await wait();
    check("the phone does not use the download link", log.anchorClicks.length === 0, "clicks=" + log.anchorClicks.length);
    check("it writes through the Filesystem plugin", written.length === 1 && written[0].plugin === "Filesystem" && written[0].method === "writeFile",
      written.length ? written[0].plugin + "." + written[0].method : "no call");
    if (written.length) {
      const o = written[0].opts;
      check("with the filename it was given", o.path === "backup.json", String(o.path));
      check("and the bytes, base64 encoded", Buffer.from(o.data, "base64").toString("utf8") === "hello", JSON.stringify(o.data));
      check("somewhere a person can find it", o.directory === "DOCUMENTS", String(o.directory));
    }
    check("and it says where it went", notices.length === 1 && /backup\.json/.test(notices[0]), notices[0] || "(silent)");
  }

  /* ---- the phone, when the public folder is refused ---- */
  {
    const tried = [];
    const cap = { nativePromise: async (p, m, o) => { tried.push(o.directory); if (o.directory !== "DATA") throw new Error("denied"); return {}; } };
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

  console.log("");
  console.log(bad ? "  " + bad + " problem(s): an export can claim to have worked without writing anything."
                  : "  Exports write a file on both editions, and say so when they cannot.");
  process.exit(bad ? 1 : 0);
})();
