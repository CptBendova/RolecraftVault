/* Execute the shipped Windows inspection without reading or restaging pictures. */
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {createTransport}=require('../app/vault-sync-transport');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-cache-inspection-'));
let unlocked=true;
const t=createTransport({directory,protect:text=>Buffer.from(text),unprotect:data=>data.toString(),unlocked:()=>unlocked,
  network:{addresses:()=>['127.0.0.1'],privateIp:ip=>ip==='127.0.0.1',discoveryPort:0}});
(async()=>{
  assert.equal((await t.call('configure',{action:'create',namespace:'library1'})).photoCacheInspection,1);
  const {hash}=await t.call('put',{text:'Encrypted cache fixture'}),absent='f'.repeat(64),file=path.join(directory,'chunks',hash);
  const bytes=fs.readFileSync(file),stamp=fs.statSync(file).mtimeMs;
  assert.deepEqual(await t.call('missingChunks',{hashes:[hash,absent,hash]}),{missing:[absent]});
  assert.deepEqual(await t.call('missingChunks',{hashes:[]}),{missing:[]});
  assert.deepEqual(await t.call('missingChunks',{hashes:Array(1024).fill(hash)}),{missing:[]});
  assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(fs.statSync(file).mtimeMs,stamp,'inspection never rewrites encrypted cached content');
  for(const hashes of [null,{},['../outside'],['A'.repeat(64)],[42],Array(1025).fill(hash)])await assert.rejects(t.call('missingChunks',{hashes}),/Invalid/);
  unlocked=false;await assert.rejects(t.call('missingChunks',{hashes:[hash]}),/Unlock/);unlocked=true;
  const inspecting=t.call('missingChunks',{hashes:Array(1024).fill(hash)});
  setImmediate(()=>t.pause());await assert.rejects(inspecting,/paused/,'pause during yielded metadata scan cancels the result');
  assert.deepEqual(fs.readFileSync(file),bytes);
  console.log('PASS real Windows cache inspection: bounded metadata-only missing list, exact encrypted bytes retained, validation, lock and mid-scan pause');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{t.pause();fs.rmSync(directory,{recursive:true,force:true});});
