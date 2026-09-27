const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const window={storage:{},React:{createElement(){},useState(){},useEffect(){},useMemo(){},useRef(){}},ReactDOM:{createRoot:()=>({render(){}})}};
vm.runInNewContext(fs.readFileSync(path.join(root,'app/chat.js'),'utf8'),{window,document:{createElement:()=>({}),body:{appendChild(){}}}});
const I=window.__rcvChatInternals,validate=require('../app/openrouter').validatePayload;
let failed=0;
function test(name,fn){try{fn();console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+': '+e.message)}}
test('fractional reply budgets retain a bounded integer limit in native requests',()=>{
  for(const maxTokens of [512.5,'900.7',1600]){
    const limits=I.contextLimits({maxTokens,contextTokens:8192.8});
    assert(Number.isInteger(limits.window)&&Number.isInteger(limits.reply)&&Number.isInteger(limits.input));
    const payload=JSON.parse(validate({model:'fixture',messages:[{role:'user',content:'Hello'}],max_tokens:limits.reply}));
    assert.equal(payload.max_tokens,Math.floor(Number(maxTokens)));
  }
  const limits=I.contextLimits({maxTokens:1000,modelContext:8192.7,modelReplyLimit:500.9,contextTokens:0});
  assert.equal(limits.reply,500);assert.equal(limits.window,8192);
});
test('text-form lore triggers use whole words and never crash context inspection',()=>{
  const library={chars:[{id:'c',lorebooks:['Forest']}],personas:[],lore:[{id:'l',world:'Forest',content:'Elves live here.',triggers:'elf'}]};
  function assemble(text){return I.assemble({characterId:'c',messages:[{id:'u',role:'user',content:text}],leafId:'u'},library)}
  assert.equal(assemble('The elf arrives.').lore.length,1);
  assert.equal(assemble('She looks at herself.').lore.length,0);
  library.lore[0].triggers=[];
  assert.equal(assemble('Hello').lore.length,0,'trigger-free entries stay out of every request');
});
test('opening settings before the delayed token estimate is ready does not crash',()=>{
  const source=fs.readFileSync(path.join(root,'app/chat.js'),'utf8');
  const fn=source.slice(source.indexOf('  function TokenBreakdown('),source.indexOf('  function CostBreakdown('));
  const component=vm.runInNewContext('('+fn+')',{h:(...args)=>args,React:{Fragment:'fragment'}});
  assert.doesNotThrow(()=>component({budget:null}));
});
test('portrait crops stay bounded and out of model context',()=>{
  for(const ratio of [.2,1,5])for(const crop of [{x:0,y:0,zoom:1},{x:1,y:1,zoom:4},{x:-90,y:Infinity,zoom:80}]){
    const s=I.portraitCropStyle(crop,ratio),w=parseFloat(s.width),h=parseFloat(s.height),x=parseFloat(s.left),y=parseFloat(s.top);
    assert(w>=100&&h>=100&&x<=0&&y<=0&&x+w>=99.999&&y+h>=99.999,'crop cannot expose empty edges');
  }
  const crop={x:.2,y:.7,zoom:2};
  const character={id:'c',name:'Ari',profileImg:'secret-image-id',chatPortraitCrop:crop,variants:[{id:'v',profileImg:'variant-image',chatPortraitCrop:{x:.8,y:.3,zoom:3}},{id:'inherits'}]};
  assert.deepStrictEqual(I.resolveCharacter(character,'v').chatPortraitCrop,character.variants[0].chatPortraitCrop);
  assert.deepStrictEqual(I.resolveCharacter(character,'inherits').chatPortraitCrop,crop);
  const library={chars:[character],personas:[],lore:[]},chat=I.captureCast({characterId:'c',messages:[]},library);
  assert.deepStrictEqual(chat.castSnapshot.character.chatPortraitCrop,crop);
  const request=JSON.stringify(I.assemble(chat,library).messages);
  assert(!request.includes('chatPortraitCrop')&&!request.includes('secret-image-id'),'images and crop coordinates are display data, never model instructions');
});
process.exitCode=failed?1:0;
