const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/chat.js'), 'utf8');
let states = [], cursor = 0, effects = [], reads = [], normalizations = 0;
const h = (type, props, ...children) => ({type, props: props || {}, children});
const React = {createElement:h, useState(value){const i=cursor++;return [i in states?states[i]:typeof value==='function'?value():value,()=>{}]}, useMemo:fn=>fn(), useRef:value=>({current:value}), useEffect:fn=>effects.push(fn), useLayoutEffect(){}};
const window = {React, storage:{get:async key=>{reads.push(key);return {value:key==='blurset'?'{}':key.startsWith('th:')?'data:image/png;base64,fixture':''}}}, ReactDOM:{createRoot:()=>({render(){}})}};
const context = vm.createContext({window,document:{createElement:()=>({}),body:{appendChild(){}},querySelector:()=>null},countNormalize:()=>normalizations++});
vm.runInContext('const originalNormalize=String.prototype.normalize;String.prototype.normalize=function(...args){countNormalize();return originalNormalize.apply(this,args)}',context);
vm.runInContext(source.replace('  var host = document.createElement', '  window.audit={branchLeaf,ChatApp,MemoryControls,ConversationList,NewChatModal,Portrait};\n  var host = document.createElement'), context);
const I=window.__rcvChatInternals,A=window.audit;
function reset(next=[]){states=next;cursor=0;effects=[]}
function nodes(tree){return !tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.children)]}
function chain(n){let visits=0;const messages=Array.from({length:n},(_,i)=>({id:'m'+i,get parentId(){visits++;return i?'m'+(i-1):null},role:i%2?'user':'assistant',content:'A turn '+i}));return {chat:{id:'s',title:'Story',characterId:'c',messages,leafId:'m'+(n-1)},visits:()=>visits}}
const library={chars:[{id:'c',name:'Ari'}],personas:[],lore:[]};
let failed=0;
async function test(name,fn){try{await fn();console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+': '+e.message)}}
(async()=>{
 await test('branch navigation scales linearly and preserves newest-child behavior',()=>{
  const {chat,visits}=chain(3000);assert.equal(A.branchLeaf(chat,'m0'),'m2999');assert(visits()<18000,'parent inspections: '+visits());
  assert.equal(A.branchLeaf({messages:[{id:'a',parentId:'root'},{id:'b',parentId:'root'},{id:'c',parentId:'b'}]},'root'),'c');
  assert(['a','b'].includes(A.branchLeaf({messages:[{id:'a',parentId:'b'},{id:'b',parentId:'a'}]},'a')),'damaged cycle terminates');
 });
 await test('ChatApp renders its launcher and visible messages without missing state or a full-tree scan',()=>{
  // ChatApp state order starts open, side, ready, library, launchTarget, chats, activeId.
  const {chat,visits}=chain(5000);const next=[];next[0]=true;next[2]=true;next[3]=library;next[4]=null;next[5]=[chat];next[6]='s';reset(next);A.ChatApp();assert(visits()<40000,'parent inspections: '+visits());
 });
 await test('memory checkpoint inspection builds ancestry once',()=>{
  const {chat,visits}=chain(2000);chat.memories=Array.from({length:100},(_,i)=>({id:'memory'+i,throughId:'m'+i,text:'Remembered '+i}));reset();A.MemoryControls({chat,onPatch(){}});assert(visits()<12000,'parent inspections: '+visits());
 });
 await test('conversation previews do not walk complete message ancestry',()=>{
  const {chat,visits}=chain(5000);reset();const tree=A.ConversationList({chats:[chat],library,search:'',archived:false});assert(nodes(tree).some(n=>n.children.includes('A turn 4999')));assert.equal(visits(),0,'preview only needs its current leaf');
 });
 await test('lore inspection normalizes recent messages once, not once per trigger',()=>{
  normalizations=0;const lore=Array.from({length:100},(_,i)=>({id:'l'+i,world:'Forest',triggers:['elf','forest','tree'],content:'World reference'}));
  const result=I.assemble({characterId:'c',messages:[{id:'u',role:'user',content:'An elf enters the forest beside a tree.'}],leafId:'u'}, {...library,chars:[{id:'c',lorebooks:['Forest']}],lore});
  assert.equal(result.lore.length,100);assert.equal(result.loreDetails[0].reasons.length,3);assert(normalizations<450,'normalizations: '+normalizations);
 });
 await test('simultaneous miniature portraits share in-flight storage reads without stale caching',async()=>{
  reads=[];for(let i=0;i<40;i++){reset();A.Portrait({id:'same',name:'Ari',mini:true});effects.forEach(fn=>fn())}
  for(let i=0;i<15;i++)await Promise.resolve();assert(reads.length<=2,'storage reads for same avatar: '+reads.length);
  const old=reads.length;reset();A.Portrait({id:'same',name:'Ari'});effects.forEach(fn=>fn());for(let i=0;i<15;i++)await Promise.resolve();assert(reads.length>old,'settled data must not mask later blur/portrait changes');
 });
 await test('character chooser searches the descriptions advertised in its search field',()=>{
  reset([0,'apothecary']);const tree=A.NewChatModal({library:{...library,chars:[{id:'c',name:'Ari',story:'A village apothecary'}]},models:[]});assert(nodes(tree).some(n=>n.props.name==='Ari'),'description-only match must appear');
  reset([1,'cartographer']);const personas=A.NewChatModal({library:{...library,personas:[{id:'p',name:'Robin',description:'A travelling cartographer'}]},models:[]});assert(nodes(personas).some(n=>n.props.name==='Robin'));
 });
 await test('choosing a gallery portrait resets framing only for the changed portrait',async()=>{
  const text=fs.readFileSync(path.join(root,'app/app.js'),'utf8');const start=text.indexOf('onSetProfile: (imgId, variantId) =>');const end=text.indexOf('      onCaption:',start);
  const arrow=text.slice(start+'onSetProfile: '.length,end).trim().replace(/,$/,'');
  let c={id:'c',profileImg:'old',chatPortraitCrop:{zoom:4},gallery:[{imgId:'old'},{imgId:'new'}],variants:[{id:'v',profileImg:'old',chatPortraitCrop:{zoom:3}}]};
  const helpers=text.slice(text.indexOf('function charImgIds('),text.indexOf('function restoreRecordsWithFreshIds('));
  const withGalleryProfile=new Function('const DEFAULT_VID="__default__";'+helpers+';return withGalleryProfile;')();
  const set=new Function('vc','patchChar','toast','withGalleryProfile','return ('+arrow+')')(c,async(id,fn)=>{c=fn(c)},()=>{},withGalleryProfile);
  await set('new',null);assert.equal(c.chatPortraitCrop,null);assert.equal(c.variants[0].chatPortraitCrop.zoom,3);assert.equal(c.gallery.length,2);
  await set('new','v');assert.equal(c.variants[0].chatPortraitCrop,null);assert.equal(c.gallery.length,2);
 });
 process.exitCode=failed?1:0;
})();
