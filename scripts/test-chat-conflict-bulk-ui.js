// Exercise the shipped Chat review with recoverable, all-page conflict cleanup.
const { app, BrowserWindow } = require("electron");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-chat-conflict-bulk-"));
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
  for (let i = 0; i < 200; i++) { if (await run(expression)) return; await wait(50); }
  throw Error("Timed out: " + expression);
}
async function click(label) {
  await run(`(()=>{const button=[...document.querySelectorAll('#rcv-chat-root button')].find(b=>(b.getAttribute('aria-label')||b.textContent).trim()===${JSON.stringify(label)});if(!button)throw Error('Missing '+${JSON.stringify(label)});button.click()})()`);
  await wait(70);
}
async function clickSelector(selector) {
  await run(`(()=>{const button=document.querySelector(${JSON.stringify(selector)});if(!button)throw Error('Missing '+${JSON.stringify(selector)});button.click()})()`);
  await wait(70);
}
async function inspectPhoneAction(selector) {
  const box = await run(`(async()=>{const button=document.querySelector(${JSON.stringify(selector)});if(!button)throw Error('Missing bulk action');button.scrollIntoView({block:'center'});await new Promise(resolve=>requestAnimationFrame(resolve));const r=button.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,hit:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),overflow:document.documentElement.scrollWidth-innerWidth}})()`);
  assert(box.left >= 0 && box.right <= 361 && box.top >= 0 && box.bottom <= 801 && box.height >= 48 && box.hit && box.overflow <= 1, "bulk action is reachable at phone width: " + JSON.stringify(box));
}
async function openReview(count) {
  if (!await run("document.querySelector('.rcchat-shell')?.classList.contains('show-side')")) {
    await click("Show conversations");
    await until("document.querySelector('.rcchat-shell')?.classList.contains('show-side')");
  }
  await click("Review sync conflicts · " + count);
  await until("!!document.querySelector('.rcchat-conflict-review')");
}
async function saved() { return run("storage.get('chats:all').then(r=>JSON.parse(r.value))"); }
async function reloadFixture(rows) {
  await run(`storage.set('chats:all',${JSON.stringify(JSON.stringify(rows))})`);
  await new Promise(resolve => { win.webContents.once("did-finish-load", resolve); win.reload(); });
  await until("!!document.querySelector('.rcchat-launch')");
  await run("document.querySelector('.rcchat-launch').click()");
  await until("!!document.querySelector('.rcchat-shell')");
  await until("window.RolecraftChatSyncIdle && window.RolecraftChatSyncIdle()");
}
function checkTombstones(rows, copies) {
  const byId = new Map(rows.map(row => [row.id, row]));
  assert.strictEqual(byId.get("original")._sync.deleted, false, "the original remains live");
  assert.deepStrictEqual(byId.get("original").messages, original.messages, "the original transcript is untouched");
  assert.strictEqual(byId.get("unrelated")._sync.deleted, false, "an unrelated story remains live");
  assert.deepStrictEqual(byId.get("unrelated").messages, unrelated.messages, "the unrelated transcript is untouched");
  assert(byId.get("already-deleted")._sync.deleted, "an existing tombstone remains deleted");
  assert.deepStrictEqual(byId.get("already-deleted").messages, alreadyDeleted.messages, "an existing tombstone retains its transcript");
  for (const copy of copies) {
    const row = byId.get(copy.id);
    assert(row && row._sync.deleted, copy.id + " is in Recently deleted");
    assert.deepStrictEqual(row.messages, copy.messages, copy.id + " retains its transcript");
    assert(row._sync.ancestors.includes(copy._sync.rev), copy.id + " retains causal ancestry");
  }
}
const shared = { id: "shared", parentId: null, role: "user", content: "The opening scene", createdAt: 1 };
const original = { id: "original", title: "Original", characterId: "ari", updatedAt: 1, messages: [shared, { id: "original-end", parentId: "shared", role: "assistant", content: "Original writing", createdAt: 2 }], leafId: "original-end", _sync: { rev: "original-r1", ancestors: [], deleted: false } };
const unrelated = { id: "unrelated", title: "Unrelated", characterId: "ari", updatedAt: 2, messages: [{ id: "other", parentId: null, role: "user", content: "Independent story", createdAt: 1 }], leafId: "other", _sync: { rev: "other-r1", ancestors: [], deleted: false } };
const alreadyDeleted = { id: "already-deleted", title: "Already deleted", characterId: "ari", updatedAt: 3, messages: [{ id: "old", parentId: null, role: "user", content: "Earlier deletion", createdAt: 1 }], leafId: "old", _sync: { rev: "old-tombstone", ancestors: ["old-live"], deleted: true } };
const copies = Array.from({ length: 18 }, (_, i) => ({
  id: i === 0 ? "original-conflict-" + "a".repeat(24) : "original~conflict-" + i,
  title: "Alternate " + i, conflictOf: i === 0 ? undefined : "original", characterId: "ari", updatedAt: 100 + i,
  messages: [shared, { id: "copy-end-" + i, parentId: "shared", role: "assistant", content: "Copy writing " + i, createdAt: 10 + i }],
  leafId: "copy-end-" + i, _sync: { rev: "copy-r" + i, ancestors: ["original-r1"], deleted: false }
}));
const fixture = [original, unrelated, alreadyDeleted].concat(copies);
const timeout = setTimeout(() => { console.error("Chat bulk conflict review UI timeout"); app.exit(1); }, 160000);

app.whenReady().then(async () => {
  win = new BrowserWindow({ show: true, width: 360, height: 800, webPreferences: { contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  win.setContentSize(360, 800); win.focus();
  await win.loadFile(path.join(site, "index.html"));
  await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run(`(async()=>{await storage.set('ui:onboarded','1');await storage.set('chars:all',JSON.stringify([{id:'ari',name:'Ari'}]));for(const key of ['personas:all','lore:all','prompts:all'])await storage.set(key,'[]')})()`);

  // A held draft write must finish before the one durable Chat batch starts.
  await reloadFixture(fixture);
  await openReview(copies.length);
  assert.strictEqual(await run("document.querySelectorAll('.rcchat-conflict-card').length"), 8, "the bulk action covers more copies than the visible first page");
  await run("(()=>{const write=storage.set.bind(storage);storage.set=function(key,value){if(key!=='ui:chat-drafts')return write(key,value);storage.set=write;return new Promise((resolve,reject)=>{window.__releaseDraftSave=()=>write(key,value).then(resolve,reject);window.__draftSavePending=true})}})()");
  await run("document.querySelector('.rcchat-conflict-card .rcchat-conflict-actions button:nth-child(2)').click()");
  await until("!document.querySelector('.rcchat-conflict-review')");
  await openReview(copies.length);
  await until("window.__draftSavePending===true");
  await run("(()=>{const commit=storage.syncCommit.bind(storage);window.__chatCommitCalls=0;storage.syncCommit=function(values,expected){if(Object.prototype.hasOwnProperty.call(values,'chats:all'))window.__chatCommitCalls++;return commit(values,expected)}})()");
  await inspectPhoneAction(".rcchat-conflict-bulk button");
  await click("Move all conflict copies to Recently deleted");
  assert(await run("document.querySelector('.rcchat-conflict-bulk-confirm')?.textContent.includes('18')"), "confirmation names the number of copies across pages");
  await inspectPhoneAction(".rcchat-conflict-bulk-confirm button.danger");
  await clickSelector(".rcchat-conflict-bulk-confirm button.danger");
  assert.strictEqual(await run("window.__chatCommitCalls"), 0, "bulk cleanup waits for the queued draft write");
  assert.strictEqual((await saved()).filter(row => row._sync.deleted).length, 1, "no copy is deleted before the draft write completes");
  await run("window.__releaseDraftSave()");
  await until("storage.get('chats:all').then(r=>JSON.parse(r.value).filter(c=>c._sync?.deleted).length===19)");
  assert.strictEqual(await run("window.__chatCommitCalls"), 1, "all copies use one conditional durable Chat save");
  checkTombstones(await saved(), copies);

  // A newer copy revision invalidates the whole reviewed batch.
  await reloadFixture(fixture);
  await openReview(copies.length);
  await click("Move all conflict copies to Recently deleted");
  await until("window.RolecraftChatSyncIdle && window.RolecraftChatSyncIdle()");
  await run(`(async()=>{const rows=JSON.parse((await storage.get('chats:all')).value);const copy=rows.find(c=>c.id===${JSON.stringify(copies[0].id)});copy.messages=copy.messages.concat({id:'new-peer-turn',parentId:copy.leafId,role:'user',content:'Newer writing',createdAt:1000});copy.leafId='new-peer-turn';copy._sync={rev:'new-peer-rev',ancestors:[copy._sync.rev],deleted:false};await storage.set('chats:all',JSON.stringify(rows));await window.RolecraftChatReloadAfterSync()})()`);
  await until("document.querySelector('.rcchat-conflict-bulk-confirm')?.textContent.includes('18')");
  await clickSelector(".rcchat-conflict-bulk-confirm button.danger");
  await until("!!document.querySelector('.rcchat-conflict-review .rcchat-error')");
  const stale = await saved();
  assert.strictEqual(stale.filter(row => row._sync.deleted).length, 1, "a stale review does not delete a subset");
  assert.strictEqual(stale.find(row => row.id === copies[0].id)._sync.rev, "new-peer-rev", "newer writing remains durable");

  // A failed conditional write keeps the pending tombstones for explicit Retry.
  await reloadFixture(fixture);
  await openReview(copies.length);
  await run("(()=>{const commit=storage.syncCommit.bind(storage);window.__chatCommitCalls=0;window.__failFirstChatCommit=true;storage.syncCommit=function(values,expected){if(Object.prototype.hasOwnProperty.call(values,'chats:all')){window.__chatCommitCalls++;if(window.__failFirstChatCommit){window.__failFirstChatCommit=false;return Promise.reject(new Error('Fixture storage failure'))}}return commit(values,expected)}})()");
  await click("Move all conflict copies to Recently deleted");
  await clickSelector(".rcchat-conflict-bulk-confirm button.danger");
  await until("[...document.querySelectorAll('.rcchat-conflict-review button')].some(b=>b.textContent.trim()==='Retry save')");
  assert.strictEqual((await saved()).filter(row => row._sync.deleted).length, 1, "a failed save leaves durable copies live");
  await run("[...document.querySelectorAll('.rcchat-conflict-review button')].find(b=>b.textContent.trim()==='Retry save').click()");
  await until("storage.get('chats:all').then(r=>JSON.parse(r.value).filter(c=>c._sync?.deleted).length===19)");
  assert.strictEqual(await run("window.__chatCommitCalls"), 2, "Retry repeats one batch save after the failed attempt");
  checkTombstones(await saved(), copies);

  clearTimeout(timeout);
  console.log("PASS: bulk conflict review moves every live copy across pages in one save, waits for drafts, rejects stale revisions, and retries failed saves");
  app.exit(0);
}).catch(error => { console.error(error.stack); clearTimeout(timeout); app.exit(1); });
