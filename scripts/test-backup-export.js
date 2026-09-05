/* Execute the shipped handler and bridge with disposable in-memory records. */
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");
function fn(name) {
  const start = src.indexOf("function " + name + "(");
  assert(start >= 0, "Missing " + name);
  return src.slice(start, src.indexOf("\n}", start) + 2);
}
const imageStart = src.indexOf("const imageIdsOf =");
assert(imageStart < src.indexOf("function RolecraftVault("), "Backup inspector must be able to reach the image helper outside the component");
const imageCode = src.slice(imageStart, src.indexOf("\n};", imageStart) + 3);
const start = src.indexOf("  const exportAll = async () => {");
const handler = src.slice(start, src.indexOf("  const importAll = async source => {", start));
function fixture(options = {}) {
  const statuses = [], calls = [], writes = [], chunks = [];
  const records = { chars: [], personas: [], lore: [{ images: [null, {imgId:"picture"}] }], prompts: [],
    trash: [{type:"lore",record:{images:[null,{imgId:"bin"}]}}], bucketMeta: {}, pBucketMeta: {}, loreMeta: {}, promptMeta: {}, blurred: {}, imgCache: {} };
  const ctx = { ...records, ...options.records, Date, setTimeout, clearTimeout, console,
    APP_VERSION: "test", backupExportBusy: {current:false}, setBackupExportOpen() {},
    setBackupExport: status => statuses.push(status), toast: msg => statuses.push({toast:msg}),
    recordDiag() {}, setLastBackup: at => writes.push(["state",at]),
    sSet: async (k,v) => { if(options.preferenceFailure) throw Error("locked"); writes.push([k,v]); },
    sGet: async k => {if(options.readFailure) throw Error("Storage read failed"); return k.startsWith("img:") && !options.missing ? "data:image/png;base64,AA==" : null;},
    window: {Capacitor:{nativePromise: async (plugin,method,opts) => {
      calls.push({plugin,method,opts});
      if(options.denied) throw Error("Downloads is unavailable");
      if(method === "begin") { if(options.gate) await options.gate; return {token:"token"}; }
      if(method === "append") { if(options.writeFailure) throw Error("No space left"); chunks.push(opts.data); }
      return {};
    }}}
  };
  vm.createContext(ctx);
  const helpers = ["charImgIds","personaImgIds","backupInspection","appendDownloadText","streamJsonDownload","phoneJsonStream"].map(fn).join("\n");
  vm.runInContext(helpers + "\n" + imageCode + "\n" + handler + "\nglobalThis.run = exportAll;", ctx);
  return {ctx,statuses,calls,writes,chunks,run:ctx.run};
}
(async () => {
  const good = fixture(); await good.run();
  assert.equal(good.statuses.at(-1).phase,"success");
  const data = JSON.parse(good.chunks.join(""));
  assert.equal(data.images.picture,"data:image/png;base64,AA==");
  assert.equal(data.images.bin,"data:image/png;base64,AA==");
  assert.equal(data.lore[0].images[0],null,"Preserve stored records; only ignore empty references while collecting IDs");
  assert.equal(data.manifest.images,2);
  assert.equal(good.statuses.at(-1).location,"Downloads");
  assert(good.statuses.some(x => /Saving picture/.test(x.message)));
  assert(good.writes.some(x => x[0] === "ui:lastbackup"));
  console.log("PASS real export preserves live/bin pictures and records, with progress and public location");
  for(const options of [{denied:true},{writeFailure:true},{readFailure:true},{missing:true},{records:{lore:[{images:{broken:true}}]}},{records:{chars:[null]}}]) {
    const f=fixture(options); await f.run();
    assert.equal(f.statuses.at(-1).phase,"error",JSON.stringify(options));
    assert.equal(f.writes.length,0,"Failed exports cannot advance backup health");
    assert.equal(f.ctx.backupExportBusy.current,false);
    assert(!f.calls.some(x => x.plugin === "Filesystem"),"No hidden-storage fallback");
    if(options.writeFailure || options.readFailure || options.missing) assert(f.calls.some(x=>x.method === "abort"));
  }
  console.log("PASS preparation/read/write/missing-image failures stay visible, clean up and permit retry");
  let release; const gate=new Promise(r=>release=r), busy=fixture({gate});
  const pending=busy.run(); await new Promise(r=>setTimeout(r,10)); await busy.run();
  assert.equal(busy.calls.filter(x=>x.method==="begin").length,1);
  assert.equal(busy.statuses.at(-1).phase,"working");
  release(); await pending;
  assert.equal(busy.statuses.at(-1).phase,"success");
  console.log("PASS slow storage remains in progress and repeated taps cannot start a second export");
  const pref=fixture({preferenceFailure:true}); await pref.run();
  assert.equal(pref.statuses.at(-1).phase,"success");
  assert(/reminder could not/.test(pref.statuses.at(-1).message));
  console.log("PASS a reminder-write failure does not falsely report the completed file as missing");
})().catch(e=>{console.error(e);process.exitCode=1;});
