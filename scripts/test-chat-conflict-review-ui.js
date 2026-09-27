// The real private Chat UI must review either generation of saved sync copy
// and move only the explicitly selected copy to recoverable Recently deleted.
const { app, BrowserWindow } = require("electron");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-chat-conflict-review-"));
const site = path.join(tmp, "web");
fs.cpSync(path.join(root, "web"), site, { recursive: true });
for (const [source, target] of [
  ["app/chat.js", "js/rolecraft-chat.js"],
  ["app/chat-sync-core.js", "js/chat-sync-core.js"],
  ["app/chat.css", "css/chat.css"]
]) fs.copyFileSync(path.join(root, source), path.join(site, target));
app.setPath("userData", path.join(tmp, "profile"));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("force-device-scale-factor", "1");

let win;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = expression => win.webContents.executeJavaScript(expression);
async function until(expression) {
  for (let i = 0; i < 160; i++) { if (await run(expression)) return; await wait(50); }
  throw Error("Timed out: " + expression);
}
async function click(label) {
  await run(`(()=>{const button=[...document.querySelectorAll('#rcv-chat-root button')].find(b=>(b.getAttribute('aria-label')||b.textContent).trim()===${JSON.stringify(label)});if(!button)throw Error('Missing '+${JSON.stringify(label)});button.click()})()`);
  await wait(70);
}
async function clickCard(id, label) {
  await run(`(()=>{const card=[...document.querySelectorAll('.rcchat-conflict-card')].find(c=>c.dataset.conflictId===${JSON.stringify(id)});if(!card)throw Error('Missing conflict '+${JSON.stringify(id)});const button=[...card.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.textContent).trim()===${JSON.stringify(label)});if(!button)throw Error('Missing action '+${JSON.stringify(label)});button.click()})()`);
  await wait(70);
}
async function openReview(count) {
  if (!await run("document.querySelector('.rcchat-shell')?.classList.contains('show-side')")) {
    await click("Show conversations");
    await until("document.querySelector('.rcchat-shell')?.classList.contains('show-side')");
  }
  await click("Review sync conflicts · " + count);
  await until("!!document.querySelector('.rcchat-conflict-review')");
}
async function inspectLayout(id, width) {
  const result = await run(`(async()=>{const modal=document.querySelector('.rcchat-modal[aria-label="Sync conflict copies"]'),card=[...document.querySelectorAll('.rcchat-conflict-card')].find(c=>c.dataset.conflictId===${JSON.stringify(id)}),bounds=modal.getBoundingClientRect(),actions=[...card.querySelectorAll('.rcchat-conflict-actions button')],targets=[];for(const button of actions){button.scrollIntoView({block:'center'});await new Promise(resolve=>requestAnimationFrame(resolve));const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);targets.push({left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,hit:button.contains(hit)})}return{innerWidth,innerHeight,documentOverflow:document.documentElement.scrollWidth-innerWidth,modalOverflow:modal.scrollWidth-modal.clientWidth,modalLeft:bounds.left,modalRight:bounds.right,targets}})()`);
  assert.strictEqual(result.innerWidth, width);
  assert(result.documentOverflow <= 1 && result.modalOverflow <= 1 && result.modalLeft >= 0 && result.modalRight <= width + 1, "conflict review has no horizontal overflow: " + JSON.stringify(result));
  assert(result.targets.length === 3 && result.targets.every(item => item.left >= 0 && item.right <= width + 1 && item.top >= 0 && item.bottom <= result.innerHeight + 1 && item.height >= (width <= 360 ? 48 : 40) && item.hit), "every review action is reachable: " + JSON.stringify(result));
}
async function inspectConfirmation() {
  const result = await run("(async()=>{const button=document.querySelector('.rcchat-conflict-confirm button.danger');button.scrollIntoView({block:'center'});await new Promise(resolve=>requestAnimationFrame(resolve));const r=button.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,hit:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()");
  assert(result.left >= 0 && result.right <= await run("innerWidth") + 1 && result.top >= 0 && result.bottom <= await run("innerHeight") + 1 && result.hit, "confirmation remains visibly tappable: " + JSON.stringify(result));
}
async function inspectPaging() {
  const result = await run("(async()=>{const buttons=[...document.querySelectorAll('.rcchat-conflict-pages button')],targets=[];for(const button of buttons){button.scrollIntoView({block:'center'});await new Promise(resolve=>requestAnimationFrame(resolve));const r=button.getBoundingClientRect();targets.push({left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,hit:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})}return{width:innerWidth,height:innerHeight,targets}})()");
  assert(result.targets.length === 2 && result.targets.every(button => button.left >= 0 && button.right <= result.width + 1 && button.top >= 0 && button.bottom <= result.height + 1 && button.height >= 48 && button.hit), "both paging buttons remain reachable on a phone: " + JSON.stringify(result));
}
const originalId = "story";
const currentId = "story~conflict-revision-2";
const legacyId = "story-conflict-" + "a".repeat(24);
const shared = { id: "turn-shared", parentId: null, role: "user", content: "Saved opening turn", createdAt: 100 };
const text = label => [shared, { id: "turn-" + label, parentId: shared.id, role: "user", content: "Saved turn for " + label, createdAt: 101 }];
const fixture = [
  { id: originalId, title: "Original story", characterId: "ari", messages: text("original"), leafId: "turn-original", _sync: { rev: "revision-1", ancestors: [], deleted: false } },
  { id: currentId, title: "Renamed current alternate", conflictOf: originalId, characterId: "ari", messages: text("current"), leafId: "turn-current", _sync: { rev: "revision-2", ancestors: ["revision-1"], deleted: false } },
  { id: legacyId, title: "Renamed older alternate", characterId: "ari", messages: text("legacy"), leafId: "turn-legacy", _sync: { rev: "revision-3", ancestors: ["revision-1"], deleted: false } }
];
const timeout = setTimeout(() => { console.error("Chat conflict review UI timeout"); app.exit(1); }, 100000);

app.whenReady().then(async () => {
  win = new BrowserWindow({ show: true, width: 360, height: 800, webPreferences: { contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  win.setContentSize(360, 800); win.focus();
  await win.loadFile(path.join(site, "index.html"));
  await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run(`(async()=>{await storage.set('ui:onboarded','1');await storage.set('chars:all',JSON.stringify([{id:'ari',name:'Ari'}]));for(const key of ['personas:all','lore:all','prompts:all'])await storage.set(key,'[]');await storage.set('chats:all',${JSON.stringify(JSON.stringify(fixture))})})()`);
  await new Promise(resolve => { win.webContents.once("did-finish-load", resolve); win.reload(); });
  await until("!!document.querySelector('.rcchat-launch')");
  await run("document.querySelector('.rcchat-launch').click()");
  await until("!!document.querySelector('.rcchat-shell')");
  await openReview(2);
  assert.strictEqual(await run("document.querySelector('.rcchat-modal[aria-label=\"Sync conflict copies\"] h2')?.textContent"), "Sync conflict copies");
  assert.deepStrictEqual(await run("[...document.querySelectorAll('.rcchat-conflict-card')].map(c=>c.dataset.conflictId).sort()"), [currentId, legacyId].sort(), "renamed current and legacy copies both appear, but not the original");
  assert(await run("[...document.querySelectorAll('.rcchat-conflict-card')].every(c=>c.querySelector('.rcchat-conflict-original')?.textContent.includes('Original')&&c.querySelector('.rcchat-conflict-copy')?.textContent.includes('Conflict copy'))"), "each review card compares source and copy");
  await inspectLayout(currentId, 360);

  await clickCard(currentId, "Open original");
  await until("!!document.querySelector('.rcchat-title')");
  assert(await run("document.querySelector('.rcchat-title').textContent.includes('Original story')"), "Open original selects the source story");
  await openReview(2);
  await clickCard(legacyId, "Open copy");
  await until("document.querySelector('.rcchat-title')?.textContent.includes('Renamed older alternate')");
  await openReview(2);

  // The draft timer can have a write in flight when the user confirms a move.
  // Hold that unrelated write so the deletion must wait and recheck the copy.
  await run(`(()=>{const write=storage.set.bind(storage);storage.set=function(key,value){if(key!=='ui:chat-drafts')return write(key,value);storage.set=write;return new Promise((resolve,reject)=>{window.__releaseDraftSave=()=>write(key,value).then(resolve,reject);window.__draftSavePending=true})}})()`);
  await clickCard(currentId, "Open copy");
  await until("document.querySelector('.rcchat-title')?.textContent.includes('Renamed current alternate')");
  await openReview(2);
  await until("window.__draftSavePending===true");
  await run("(()=>{const original=RolecraftChatSync.canonical;window.__reviewCompareCount=0;RolecraftChatSync.canonical=function(value){if(value&&value.id==='turn-shared')window.__reviewCompareCount++;return original(value)}})()");

  await clickCard(currentId, "Move copy to Recently deleted");
  assert.strictEqual(await run("window.__reviewCompareCount"), 0, "opening confirmation does not rescan every saved shared turn");
  await inspectConfirmation();
  await click("Confirm move to Recently deleted");
  assert.strictEqual(await run("!!document.querySelector('.rcchat-conflict-confirm button.danger')"), true, "confirmation stays active while a prior draft save finishes");
  await run("window.__releaseDraftSave()");
  await until(`storage.get('chats:all').then(r=>JSON.parse(r.value).find(c=>c.id===${JSON.stringify(currentId)})?._sync?.deleted===true)`);
  let saved = await run("storage.get('chats:all').then(r=>JSON.parse(r.value))");
  assert(saved.find(chat => chat.id === originalId && !chat._sync.deleted), "original remains live");
  assert(saved.find(chat => chat.id === legacyId && !chat._sync.deleted), "unselected legacy copy remains live");
  assert.deepStrictEqual(saved.find(chat => chat.id === currentId).messages, fixture[1].messages, "deleted copy retains its complete transcript");
  assert(saved.find(chat => chat.id === currentId)._sync.ancestors.includes(fixture[1]._sync.rev), "deleted copy retains causal ancestry");

  if (!await run("!!document.querySelector('.rcchat-conflict-review')")) await openReview(1);
  await until("document.querySelectorAll('.rcchat-conflict-card').length===1");
  win.setContentSize(1440, 900);
  await until("innerWidth===1440");
  await inspectLayout(legacyId, 1440);
  await clickCard(legacyId, "Move copy to Recently deleted");
  await inspectConfirmation();
  await click("Confirm move to Recently deleted");
  await until(`storage.get('chats:all').then(r=>JSON.parse(r.value).find(c=>c.id===${JSON.stringify(legacyId)})?._sync?.deleted===true)`);
  saved = await run("storage.get('chats:all').then(r=>JSON.parse(r.value))");
  assert(saved.find(chat => chat.id === originalId && !chat._sync.deleted), "source remains live after both copy removals");
  assert.strictEqual(saved.filter(chat => chat._sync.deleted).length, 2, "both exact copies are recoverable tombstones");
  await click("Close dialog");
  win.setContentSize(360, 800);
  await until("innerWidth===360");
  await click("Show conversations");
  await click("Recently deleted · 2");
  await until("[...document.querySelectorAll('.rcchat-story-card strong')].map(x=>x.textContent).sort().join('|')==='Renamed current alternate|Renamed older alternate'");
  await run("[...document.querySelectorAll('.rcchat-story-card')].find(c=>c.querySelector('strong').textContent==='Renamed current alternate').querySelector('.rcchat-convo').click()");
  await until(`storage.get('chats:all').then(r=>JSON.parse(r.value).find(c=>c.id===${JSON.stringify(currentId)})?._sync?.deleted===false)`);
  saved = await run("storage.get('chats:all').then(r=>JSON.parse(r.value))");
  assert.deepStrictEqual(saved.find(chat => chat.id === currentId).messages, fixture[1].messages, "Recently deleted restores the chosen copy with all messages");
  assert(saved.find(chat => chat.id === legacyId)._sync.deleted, "restoring one copy leaves the other deleted");

  const longShared = Array.from({ length: 120 }, (_, i) => ({ id: "long-shared-" + i, parentId: i ? "long-shared-" + (i - 1) : null, role: i % 2 ? "assistant" : "user", content: "Saved scene detail. ".repeat(45), createdAt: i + 1 }));
  const longOriginalId = "long-story";
  const longOriginal = { id: longOriginalId, title: "Long original", characterId: "ari", messages: longShared.concat([{ id: "long-original-end", parentId: "long-shared-119", role: "user", content: "Original ending", createdAt: 2000 }]), leafId: "long-original-end", _sync: { rev: "long-original-rev", ancestors: [], deleted: false } };
  const longCopies = Array.from({ length: 18 }, (_, i) => ({ id: longOriginalId + "~conflict-long-" + i, title: "Long alternate " + i, conflictOf: longOriginalId, characterId: "ari", messages: longShared.concat([{ id: "long-copy-end-" + i, parentId: "long-shared-119", role: "user", content: "Alternate ending " + i, createdAt: 1000 + i }]), leafId: "long-copy-end-" + i, _sync: { rev: "long-copy-rev-" + i, ancestors: ["long-original-rev"], deleted: false } }));
  await run(`storage.set('chats:all',${JSON.stringify(JSON.stringify([longOriginal].concat(longCopies)))})`);
  await new Promise(resolve => { win.webContents.once("did-finish-load", resolve); win.reload(); });
  await until("!!document.querySelector('.rcchat-launch')");
  await run("document.querySelector('.rcchat-launch').click()");
  await until("!!document.querySelector('.rcchat-shell')");
  await run("(()=>{const original=RolecraftChatSync.canonical;window.__longReviewComparisons=0;RolecraftChatSync.canonical=function(value){if(value&&typeof value.id==='string'&&value.id.startsWith('long-shared-'))window.__longReviewComparisons++;return original(value)}})()");
  await openReview(18);
  assert.strictEqual(await run("document.querySelectorAll('.rcchat-conflict-card').length"), 8, "a large conflict list initially renders only eight copies");
  assert.strictEqual(await run("window.__longReviewComparisons"), 8 * longShared.length * 2, "only the visible copies' shared paths are compared");
  await inspectPaging();
  const seen = new Set(await run("[...document.querySelectorAll('.rcchat-conflict-card')].map(c=>c.dataset.conflictId)"));
  await click("Next conflict copies");
  await until("document.querySelector('.rcchat-conflict-pages')?.textContent.includes('Showing 9')");
  assert.strictEqual(await run("document.querySelectorAll('.rcchat-conflict-card').length"), 8, "the second page replaces rather than accumulates cards");
  (await run("[...document.querySelectorAll('.rcchat-conflict-card')].map(c=>c.dataset.conflictId)")).forEach(id => { assert(!seen.has(id), "pages contain different conflict copies"); seen.add(id); });
  await click("Next conflict copies");
  await until("document.querySelector('.rcchat-conflict-pages')?.textContent.includes('Showing 17')");
  assert.strictEqual(await run("document.querySelectorAll('.rcchat-conflict-card').length"), 2, "the last page renders only its two remaining copies");
  const lastPageIds = await run("[...document.querySelectorAll('.rcchat-conflict-card')].map(c=>c.dataset.conflictId)");
  lastPageIds.forEach(id => { assert(!seen.has(id), "last page has unseen copies"); seen.add(id); });
  assert.strictEqual(seen.size, longCopies.length, "all copies remain reachable across pages");
  await clickCard(lastPageIds[0], "Move copy to Recently deleted");
  await click("Confirm move to Recently deleted");
  await until(`storage.get('chats:all').then(r=>JSON.parse(r.value).find(c=>c.id===${JSON.stringify(lastPageIds[0])})?._sync?.deleted===true)`);
  saved = await run("storage.get('chats:all').then(r=>JSON.parse(r.value))");
  assert(saved.find(chat => chat.id === longOriginalId && !chat._sync.deleted), "paging and deletion keep the long original live");
  assert.strictEqual(saved.filter(chat => chat._sync.deleted).length, 1, "a later-page deletion moves only the selected copy");
  clearTimeout(timeout);
  console.log("PASS: Chat review moves only chosen copies, waits for draft saves, and pages large conflict lists without comparing hidden stories");
  app.exit(0);
}).catch(error => { console.error(error.stack); clearTimeout(timeout); app.exit(1); });
