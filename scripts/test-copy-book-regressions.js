const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
let serial = 0;
const scope = {uid: () => 'fresh-' + (++serial), JSON};
function fn(name) {
  const start = source.indexOf('function ' + name + '('), brace = source.indexOf('{', start);
  assert(start >= 0, name);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw Error('Unterminated ' + name);
}
const copy = vm.runInNewContext('(' + fn('textOnlyCopy') + ')', scope);
let failures = 0;
async function test(name, run) {
  try { await run(); console.log('PASS ' + name); }
  catch (e) { failures++; console.error('FAIL ' + name + ': ' + e.message); }
}
(async () => {
  await test('duplicate/template section order follows fresh IDs for characters, personas and variants', () => {
    for (const type of ['character', 'persona']) for (const prefix of [true, false]) {
      const original = {id:'record',name:'A',sections:[{id:'a',content:'A'},{id:'b',content:'B'}],sectionOrder:['sec:b','story','sec:a','sec:missing'],profileImg:'original',avatar:'avatar',variants:[{id:'v',profileImg:'variant-picture',sections:[{id:'v-a',content:'V'}],sectionOrder:['personality','sec:v-a']}]};
      const before = JSON.stringify(original), result = copy(type, original, prefix);
      assert.deepEqual(Array.from(result.sectionOrder), ['sec:' + result.sections[1].id, 'story', 'sec:' + result.sections[0].id]);
      assert.notEqual(result.sections[0].id, 'a');
      if (type === 'character') {
        const v = result.variants[0];
        assert.notEqual(v.sections[0].id, 'v-a');
        assert.deepEqual(Array.from(v.sectionOrder), ['personality', 'sec:' + v.sections[0].id]);
        assert.equal(v.profileImg, null);
      }
      assert.equal(JSON.stringify(original), before, 'source is untouched');
      assert.equal(result[type === 'character' ? 'profileImg' : 'avatar'], null);
    }
  });
  for (const kind of ['Lore', 'Prompt']) await test('unchanged ' + kind + ' rename preserves cover/metadata without writes', async () => {
    const start = source.indexOf('      onRename: async name => {', source.indexOf('      sampleName: "rolecraft-' + (kind === 'Lore' ? 'lorebook' : 'prompt') + '-template.json"'));
    assert(start >= 0);
    const arrow = source.slice(start + '      onRename: '.length, source.indexOf('      onDeleteBook:', start)).trim().replace(/,$/, '');
    let writes = 0, meta = {Book:{cover:'picture',description:'Notes',group:'Worlds'}}, moved = 0;
    const context = {viewLoreBook:'Book',viewPromptBook:'Book',lore:[],prompts:[],loreMeta:meta,promptMeta:meta,toast(){},persistLore:async()=>{writes++},persistPrompts:async()=>{writes++},persistLoreMeta:async v=>{writes++;meta=v},persistPromptMeta:async v=>{writes++;meta=v},renameAttachedBook:async()=>{moved++;return 1},setViewLoreBook(){},setViewPromptBook(){}};
    const rename = vm.runInNewContext('(' + arrow + ')', context);
    await rename('Book'); await rename(' Book '); await rename('  ');
    assert.equal(writes, 0); assert.equal(meta.Book.cover, 'picture');
    await rename('Renamed');
    assert.equal(meta.Renamed.cover, 'picture'); assert.equal(meta.Renamed.group, 'Worlds'); assert(!Object.hasOwn(meta, 'Book'));
    assert.equal(moved, kind === 'Lore' ? 1 : 0);
  });
  for (const name of ['asArray', 'toTermList', 'firstTermList']) vm.runInNewContext(fn(name), scope);
  for (const [name, key] of [['normalizeLoreImport','lore'], ['normalizePromptImport','prompts']]) await test(key + ' native imports retain empty writing and image-only entries', () => {
    const normalize = vm.runInNewContext('(' + fn(name) + ')', scope);
    const data = {app:'rolecraft-vault', [key]:[{id:'a',title:'Planned entry',content:'',images:[]},{id:'b',title:'Picture reference',content:'',images:[{imgId:'photo'}]}], images:{photo:'data:image/png;base64,AA=='},thumbs:{photo:'preview'},blurred:['photo']};
    const before = JSON.stringify(data), result = normalize(data, 'Book');
    assert.equal(result.entries.length, 2);
    assert.equal(result.entries[0].title, 'Planned entry');
    const image = result.entries[1].images[0].imgId;
    assert.notEqual(image, 'photo'); assert.equal(result.images[image], data.images.photo);
    assert.equal(result.thumbs[image], 'preview'); assert(result.blurred.includes(image));
    assert.equal(JSON.stringify(data), before);
    assert.equal(normalize({unrelated:true}, 'Book').entries.length, 0, 'unrelated third-party files still rejected');
  });
  process.exitCode = failures ? 1 : 0;
})();
