const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const core = require('../app/chat-sync-core');
const window = { storage: {}, RolecraftChatSync: core, crypto: { randomUUID: () => 'test-' + Math.random() }, React: { createElement() {}, useState() {}, useEffect() {}, useMemo() {}, useRef() {} }, ReactDOM: { createRoot: () => ({ render() {} }) } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/chat.js'), 'utf8'), { window, document: { createElement: () => ({}), body: { appendChild() {} } } });
const I = window.__rcvChatInternals, plain = x => JSON.parse(JSON.stringify(x));
const library = { chars: [
  { id:'a', name:'Ari', tagline:'ARI_REFERENCE_FACT', story:'ARI_STATIC_SECRET', profileImg:'ari-portrait', lorebooks:['Ari lore'], creatorMemo:'NEVER_SEND_MEMO' },
  { id:'b', name:'Béatrice', story:'BASE_BEATRICE', profileImg:'bea-base', lorebooks:['Bea lore'], variants:[{id:'night',name:'Night watch',story:'BEA_NIGHT_PROFILE',profileImg:'bea-night',chatPortraitCrop:{x:.25,y:.5,zoom:2}}] }
], personas:[{id:'p',name:'Robin',description:'ROBIN_PERSONA',creatorMemo:'PRIVATE_PERSONA'}], lore:[{id:'la',world:'Ari lore',content:'ARI_FORCED_LORE',triggers:['bell']},{id:'lb',world:'Bea lore',content:'BEA_MATCHED_LORE',triggers:['bell']}] };
let chat = {id:'story',characterId:'a',personaId:'p',model:'test',contextTokens:32000,maxTokens:500,alwaysActivePrompt:'SUPER_PROMPT',messages:[{id:'m0',role:'assistant',parentId:null,content:'Ari rang the bell.'},{id:'m1',role:'user',parentId:'m0',content:'I heard the bell.'}],leafId:'m1'};
const original = JSON.stringify(chat), originalLibrary = JSON.stringify(library);
assert(I.mentionAt('Hello @bEa',10));
assert.equal(I.mentionAt('email@bea',9),null);
assert.equal(I.mentionAt('Hello @bea later',10).query,'bea');
assert.deepStrictEqual(plain(I.participantChoices(library.chars,I.mentionAt('@BEA',4))).map(p=>p.variantId),['','night']);
assert.equal(I.participantChoices(library.chars,I.mentionAt('@night',6))[0].variantId,'night');
assert.equal(I.participantChoices([{id:'bad',name:'Broken',variants:[null,{},'future']}],I.mentionAt('@bro',4)).length,1,'damaged optional variants never crash autocomplete');
assert.equal(I.participantChoices([{id:'bad',name:'Broken',variants:'future-format'}],I.mentionAt('@bro',4)).length,1);
const bea = {characterId:'b',variantId:'night'};
chat = I.changeParticipants(chat,library,'add',bea);
assert.equal(JSON.stringify(library),originalLibrary);assert.equal(chat.messages[0].content,'Ari rang the bell.');
assert.equal(chat.messages[0].speaker,undefined,'adding preserves immutable legacy messages');
assert.equal(chat.originalSpeaker.name,'Ari');
assert.equal(chat.participants.length,2);assert.equal(chat.activeSpeakerKey,I.participantKey(bea));
assert.equal(chat.groupLoreScope,'speaker','adding a second character starts a speaker-scoped group');
assert.equal(I.parseChats(JSON.stringify([chat]))[0].activeSpeakerKey,I.participantKey(bea),'reopen preserves non-first chosen speaker');
let request=I.assemble(chat,library), system=request.messages[0].content;
for (const fact of ['ARI_REFERENCE_FACT','BEA_NIGHT_PROFILE','ROBIN_PERSONA','SUPER_PROMPT','AI-controlled character: Béatrice','Do not speak, think, feel, decide or act for the user-controlled persona']) assert(system.includes(fact),fact);
assert(!system.includes('ARI_STATIC_SECRET'),'the nonselected character supplies concise reference facts, not a full backstory');
assert(!system.includes('ARI_FORCED_LORE'),'the nonselected character’s triggered lore stays out of the new group request');
assert(!system.includes('BASE_BEATRICE'));assert(!JSON.stringify(request).includes('MEMO'));
assert(system.indexOf('SUPER_PROMPT') < system.indexOf('PRIORITY 2 —'));
assert(request.messages[1].content.startsWith('[Speaker: Ari]'));
assert.equal(request.permanentTokens+request.temporaryTokens,request.estimatedTokens);
assert.equal(request.participantCount,2);
assert.equal(I.participantCharacter(chat,bea,{chars:[],personas:[],lore:[]}).profileImg,'bea-night');
assert.equal(I.participantCharacter(chat,bea,{...library,chars:library.chars.map(c=>({...c,variants:[]}))}).story,'BEA_NIGHT_PROFILE','deleted variant keeps saved selected profile instead of silently becoming Default');
assert(I.assemble(chat,{chars:[],personas:[],lore:[]}).messages[0].content.includes('BEA_NIGHT_PROFILE'),'selected variant survives fallback');
assert(I.assemble(chat,{chars:[],personas:[],lore:[]}).messages[0].content.includes('ROBIN_PERSONA'));
const beforeRemove=chat;
chat = I.changeParticipants(chat,library,'remove',{characterId:'a',variantId:''});
assert.strictEqual(chat.messages,beforeRemove.messages,'removal never rewrites the transcript');
assert.equal(chat.personaId,'p');assert.equal(chat.castSnapshot.character,null);
assert.equal(chat.castSnapshot.participants.length,1);
assert(!JSON.stringify(chat.castSnapshot).includes('ARI_STATIC_SECRET'));
assert(!JSON.stringify(chat.castSnapshot).includes('ARI_FORCED_LORE'));
system=I.assemble(chat,library).messages[0].content;
assert(!system.includes('ARI_STATIC_SECRET'));assert(!system.includes('ARI_FORCED_LORE'));assert(system.includes('BEA_MATCHED_LORE'));
assert(!JSON.stringify(I.memoryProfiles(chat,library)).includes('ARI_STATIC_SECRET'));
assert.equal(I.messageSpeaker(chat,chat.messages[0],library).name,'Ari');
assert.equal(I.messageSpeaker(chat,chat.messages[0],library).profileImg,'ari-portrait');
assert.throws(()=>I.changeParticipants(chat,library,'remove',bea),/at least one/);
chat=I.parseChats(JSON.stringify([chat]))[0];
assert.equal(chat.activeSpeakerKey,I.participantKey(bea));
assert(!I.assemble(chat,{chars:[],personas:[],lore:[]}).messages[0].content.includes('ARI_STATIC_SECRET'));
// Rebuild worker keeps named historical actors, even after their profiles leave.
chat={...chat,messages:Array.from({length:16},(_,i)=>({id:'r'+i,parentId:i?'r'+(i-1):null,role:i%2?'user':'assistant',content:'Event '+i+' bell.',...(i===2?{speaker:{characterId:'b',variantId:'night',name:'Béatrice',activeVariantName:'Night watch',profileImg:'bea-night'}}:{})})),leafId:'r15',sceneVersions:undefined};
let plan=I.memoryPlan(chat,library,[],true), body=JSON.parse(plan.messages[1].content);
assert(body.olderMessages[0].content.includes('[Speaker: Ari]'));
assert(body.olderMessages[2].content.includes('[Speaker: Béatrice (Night watch)]'));
assert(!JSON.stringify(body.knownProfiles).includes('ARI_STATIC_SECRET'));
assert(JSON.stringify(body.knownProfiles).includes('BEA_NIGHT_PROFILE'));
assert(plan.messages[0].content.includes('do not copy static appearance'));
const branch=I.forkConversation(chat,chat.leafId);
assert.deepStrictEqual(plain(branch.messages[2].speaker),plain(chat.messages[2].speaker));
const stamped=core.stamp([plain(chat)],[],()=> 'rev-a');
assert.equal(core.merge([],stamped).chats[0].messages[2].speaker.name,'Béatrice');
assert.equal(core.merge([],stamped).chats[0].participants.length,1);
// Every storage/sync reader rejects malformed cast metadata before replacement.
for(const bad of [
  {...chat,participants:[]}, {...chat,participants:[bea,bea]}, {...chat,activeSpeakerKey:'missing'},
  {...chat,participants:[{...bea,story:'hidden-profile'}]},
  {...chat,castSnapshot:{...chat.castSnapshot,character:library.chars[0]}},
  {...chat,messages:[{id:'bad',role:'assistant',content:'ok',speaker:{characterId:'b',name:'Bea',story:'hidden'}}]},
  ...[{x:Infinity,y:0,zoom:2},{x:0,y:0,zoom:5},{x:0,y:0,zoom:2,hidden:'text'}].map(crop=>({...chat,originalSpeaker:{characterId:'a',name:'Ari',chatPortraitCrop:crop}})),
  {...chat,originalSpeaker:{characterId:'a',name:'Ari',nsfwPicture:{hidden:'text'}}},
  {...chat,originalSpeaker:{characterId:'a',name:'Ari',profileImg:'data:image/png;base64,abc'}},
  {...chat,originalSpeaker:{characterId:'a',name:'Ari',activeVariantName:'x'.repeat(501)}}
]) assert.throws(()=>core.validate([bad]),/Invalid|Inactive/);
const many={chars:Array.from({length:10},(_,i)=>({id:'c'+i,name:'C'+i})),personas:[],lore:[]};
let limited={id:'limit',characterId:'c0',messages:[],leafId:null};
for(let i=1;i<8;i++)limited=I.changeParticipants(limited,many,'add',{characterId:'c'+i,variantId:''});
assert.throws(()=>I.changeParticipants(limited,many,'add',{characterId:'c8',variantId:''}),/up to 8/);
assert.equal(I.changeParticipants(limited,many,'select',{characterId:'c3',variantId:''}).participants.length,8);
const legacy=JSON.parse(original);
assert.equal(I.assemble(legacy,library).messages[1].content,legacy.messages[0].content,'legacy single character transcripts are unchanged');
console.log('PASS: group participant edits, variants, immutable speakers, active profile/lore budgets, persona protection, memory attribution, fallback/sync/validation and bounded local mention search');
// Full backups must reject invalid group metadata before offering replacement.
const appSource = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
const inspectStart = appSource.indexOf('function backupInspection(');
const inspectEnd = appSource.indexOf('\nasync function readBackupPreview', inspectStart);
assert(inspectStart >= 0 && inspectEnd > inspectStart);
const pictureStart = appSource.indexOf('function backupPictureValid(');
assert(pictureStart >= 0 && pictureStart < inspectStart);
const pictureValid = new Function('atob', appSource.slice(pictureStart, inspectStart) + ';return backupPictureValid;')(atob);
const inspectBackup = new Function('window', 'charImgIds', 'personaImgIds', 'imageIdsOf', 'backupPictureValid', appSource.slice(inspectStart, inspectEnd) + ';return backupInspection;')({ RolecraftChatSync: core }, () => [], () => [], () => [], pictureValid);
const backup = { app: 'rolecraft-vault', chars: [], personas: [], lore: [], prompts: [], chats: [plain(chat)], images: {} };
assert(inspectBackup(backup).ok, 'valid group chats remain restorable');
assert(!inspectBackup({ ...backup, chats: [{ ...plain(chat), activeSpeakerKey: 'not-in-cast' }] }).ok, 'invalid cast cannot overwrite a good vault');
assert(!inspectBackup({ ...backup, chats: [{ id: 'broken', messages: [{ role: 'assistant', content: 'missing id' }] }] }).ok, 'invalid messages fail before restore');
assert(inspectBackup({ ...backup, chats: undefined }).ok, 'ordinary older backups remain compatible');
console.log('PASS: private backup preview validates full chat and group metadata before replacement');
