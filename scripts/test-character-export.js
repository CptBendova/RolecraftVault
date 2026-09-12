const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
const start = src.indexOf('  const exportCharsJson = async () => {');
const handler = src.slice(start, src.indexOf('  /* Text-only exports:', start));
const helperStart = src.indexOf('function charImgIds(');
const helper = src.slice(helperStart, src.indexOf('\n}', helperStart) + 2);
function fixture(options = {}) {
  const states = [], reads = [], files = [];
  const ctx = { Blob, Date, setTimeout, chars: [{id:'c',name:'Test 🐉',profileImg:'shared',gallery:[{imgId:'shared'}],variants:[{id:'v',profileImg:'variant'}]}], blurred:{shared:true,unrelated:true}, imgCache:{},
    backupExportBusy:{current:false}, setBackupExportOpen(){}, setBackupExport(s){states.push(s);},
    sGet:async key=>{reads.push(key); if(options.gate) await options.gate; if(options.fail) throw Error('Storage read failed'); return options.missing ? null : 'data:image/png;base64,AA==';},
    phoneJsonStream:()=>null,
    saveFile:async(blob,name)=>{if(options.saveFail) throw Error('Download denied'); files.push({blob,name}); return 'Downloads';}
  };
  // Catch regressions that stringify the full image collection or record list.
  ctx.JSON = {stringify(value){ if(value && typeof value === 'object' && (value.images || value === ctx.chars)) throw Error('Whole-library serialization'); return JSON.stringify(value); }};
  const collectStart=src.indexOf('  const collectImagesFor =');
  const collect=src.slice(collectStart,src.indexOf('  const scopeLabel =',collectStart));
  const exportStart=src.indexOf('  const exportJSON =');
  const exportHelper=src.slice(exportStart,src.indexOf('  const exportCharSnap =',exportStart));
  const downloadStart=src.indexOf('function downloadJSON(');
  const download=src.slice(downloadStart,src.indexOf('\n}',downloadStart)+2);
  vm.createContext(ctx); vm.runInContext(helper + '\n' + collect + '\n' + exportHelper + '\n' + download + '\n' + handler + '\nglobalThis.run=exportCharsJson;',ctx);
  return {ctx,states,reads,files,run:ctx.run};
}
(async()=>{
  const good=fixture(); await good.run();
  assert.equal(good.states.at(-1).phase,'success');
  const output=JSON.parse(await good.files[0].blob.text());
  assert.equal(output.chars[0].name,'Test 🐉');
  assert.deepEqual(Object.keys(output.images),['shared','variant']);
  assert.deepEqual(output.blurred,['shared']);
  assert.equal(good.reads.filter(x=>x==='img:shared').length,1);
  assert(good.states.some(x=>x.phase==='working'));
  for(const options of [{fail:true},{missing:true},{saveFail:true}]) {
    const f=fixture(options); assert.equal(await f.run(),false);
    assert.equal(f.states.at(-1).phase,'error'); assert.equal(f.ctx.backupExportBusy.current,false);
    assert.equal(f.files.length,0); assert.match(f.states.at(-1).message,/library has not been changed/);
  }
  let release; const gate=new Promise(r=>release=r), f=fixture({gate});
  const running=f.run(); await new Promise(r=>setTimeout(r,20)); await f.run();
  release(); await running; assert.equal(f.files.length,1);
  const phone=fixture(),chunks=[];
  phone.ctx.phoneJsonStream=(_name,write)=>write(async text=>chunks.push(text)).then(()=> 'Downloads');
  await phone.run(); assert.equal(phone.states.at(-1).phase,'success');
  assert.equal(JSON.parse(chunks.join('')).images.variant,'data:image/png;base64,AA==');
  assert.equal(phone.files.length,0,'Android must not fall back to a Blob download');
  const empty=fixture(); empty.ctx.chars=[]; await empty.run();
  assert.equal(JSON.parse(await empty.files[0].blob.text()).chars.length,0);
  const large=fixture(); large.ctx.chars=Array.from({length:1000},(_,i)=>({id:String(i),profileImg:'image'+i}));
  await large.run(); assert.equal(Object.keys(JSON.parse(await large.files[0].blob.text()).images).length,1000);
  console.log('PASS character export: fragmented JSON, unique variant pictures, visible failures, duplicate-click guard, 1000-character library');
})().catch(e=>{console.error(e);process.exitCode=1;});
