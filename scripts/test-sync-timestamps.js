const assert=require('assert'),crypto=require('crypto'),C=require('../app/vault-sync-core');
const hash=async s=>crypto.createHash('sha256').update(s).digest('hex');
(async()=>{
  for(const kind of ['character','persona']){
    const key=C.keyOf(kind,'one'),value={id:'one',name:'A',description:'Writing',images:['original'],updatedAt:1};
    const a=await C.scan({[key]:value},null,'tablet',hash),b=await C.scan({[key]:{...value,updatedAt:2}},null,'pc',hash);
    const merged=await C.merge([a,b],'tablet',hash),reverse=await C.merge([b,a],'tablet',hash);
    assert.equal(merged.conflicts,0);assert.equal(Object.keys(merged.items).length,1);assert.equal(C.canonical(merged),C.canonical(reverse));await C.validate(merged.snapshot,hash);
    const saved=await C.scan(merged.items,merged.snapshot,'tablet',hash);
    assert.equal((await C.merge([saved,a,b],'tablet',hash)).conflicts,0);
    for(const changes of [{description:'Different writing'},{images:['other']},{name:'Other name'}]){
      const real=await C.scan({[key]:{...value,...changes}},null,'other',hash);
      assert.equal((await C.merge([a,real],'tablet',hash)).conflicts,1,'Real edits and pictures must be preserved');
    }
    const edited=await C.scan({[key]:{...merged.items[key],description:'New writing'}},saved,'pc',hash);
    assert.equal((await C.merge([edited,a,b],'tablet',hash)).items[key].description,'New writing');
  }
  console.log('PASS timestamp-only character/persona saves converge without conflict copies; real writing and pictures remain protected');
})().catch(e=>{console.error(e);process.exitCode=1;});
