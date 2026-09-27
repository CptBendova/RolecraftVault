// Real shipped Chat UI, disposable local storage, and an offline memory worker.
// No provider account, key, network request, or paid completion is used.
const { app, BrowserWindow } = require("electron");
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const root = path.join(__dirname, ".."), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-memory-rebuild-ui-"));
app.setPath("userData", tmp);
const preload = path.join(tmp, "preload.js");
fs.writeFileSync(preload, `window.Capacitor={isNativePlatform:()=>true};window.__requests=[];window.__mode='success';
window.openRouter={status:async()=>({configured:true}),onEvent:cb=>{window.__emit=cb;return()=>{}},cancel:async id=>{window.__cancelled=id;return{ok:true}},start:async request=>{
  window.__requests.push(request);
  const part=window.__requests.length;
  if(!request.messages[0].content.includes('Produce a concise rolling memory'))throw Error('Rebuild unexpectedly requested a roleplay reply');
  if(window.__mode==='hold-second'&&part===2)return{ok:true};
  if(window.__mode==='error-second'&&part===2){window.__emit({id:request.requestId,type:'error',error:'Fixture second batch failure'});return{ok:true}}
  window.__emit({id:request.requestId,type:'delta',text:'MEMORY_PART_'+part+': The events in this chronological batch remain remembered. [END_MEMORY]'});
  window.__emit({id:request.requestId,type:'finish',reason:'stop'});
  window.__emit({id:request.requestId,type:'done'});
  return{ok:true};
}};`);
let win, lastProbe = "startup";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = async script => {
  lastProbe = script;
  try { return await win.webContents.executeJavaScript(script); }
  catch (error) { console.error("Failed probe: " + script.slice(0, 180)); throw error; }
};
const button = label => `Array.from((${JSON.stringify(label)}==='Chat'?document.querySelector('.rcchat-launch')?.parentElement:(document.querySelector('.rcchat-modal')||document.querySelector('#rcv-chat-root'))).querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent).trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)})`;
const click = label => run(`(()=>{const b=${button(label)};if(!b)throw Error('Missing '+${JSON.stringify(label)});if(b.disabled)throw Error('Disabled '+${JSON.stringify(label)});b.click()})()`);
const input = (selector, value) => run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
async function until(script, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await run(script)) return; await wait(50); }
  throw Error("Timed out waiting for " + label);
}
const readChats = () => run("window.storage.get('chats:all').then(r=>JSON.parse(r.value))");
const messages = Array.from({ length: 40 }, (_, i) => ({ id: "m" + i, parentId: i ? "m" + (i - 1) : null, role: i % 2 ? "assistant" : "user", content: "Turn " + i + ": " + "A long established story event. ".repeat(30), createdAt: i + 1 }));
const fixture = {
  id: "story", title: "Memory rebuild fixture", model: "fixture/model", memoryModel: "fixture/fast", contextTokens: 12000,
  maxTokens: 500, temperature: .8, autoMemory: false, memoryRecent: 5, requireZdr: false,
  memoryPins: "Keep the original promise.", messages, leafId: "m39",
  memories: [{ id: "old-first", throughId: "m12", text: "LEGACY_FIRST_SUMMARY" }, { id: "old-second", throughId: "m25", text: "LEGACY_SECOND_SUMMARY" }]
};
async function reset(seed = fixture, keepProgress = false) {
  if (!keepProgress) await run("window.storage.set('ui:chat-memory-rebuild:story','null')");
  await run(`window.storage.set('chats:all',${JSON.stringify(JSON.stringify([seed]))})`);
  await new Promise(resolve => { win.webContents.once("did-finish-load", resolve); win.webContents.reload(); });
  await until("!!document.querySelector('.rcchat-launch')", "vault launch");
  await click("Chat");
  await until("!!document.querySelector('.rcchat-compose textarea')", "Chat launch");
  await wait(200);
  return (await readChats())[0];
}
async function openRebuild() {
  await click("Conversation settings");
  await until(`!!(${button("Rebuild memory in a copy")})`, "rebuild controls");
  await click("Rebuild memory in a copy");
  await until(`!!(${button("Rebuild copy now")})`, "rebuild confirmation");
}
const timeout = setTimeout(() => { console.error("Memory rebuild UI timeout at: " + lastProbe); app.exit(1); }, 120000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: true, width: 360, height: 850, webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  win.focus();
  await win.loadFile(path.join(root, "web/index.html")); await wait(1200);
  await run("(async()=>{for(const k of ['chars:all','personas:all','lore:all','prompts:all'])await window.storage.set(k,'[]');await window.storage.set('ui:onboarded','1')})()");
  let original = await reset();
  assert.strictEqual(await run("window.__requests.length"), 0, "opening Chat must not rebuild or contact the provider");
  await click("Conversation settings");
  await until(`!!(${button("Rebuild memory in a copy")})`, "rebuild control");
  await input("#rcchat-memory-pins", "Unsaved changed pin");
  assert(await run(`(${button("Rebuild memory in a copy")}).disabled`), "unsaved memory/pin edits must block rebuilding");
  await input("#rcchat-memory-pins", fixture.memoryPins);
  assert(!(await run(`(${button("Rebuild memory in a copy")}).disabled`)), "a saved story permits an explicit rebuild even with automatic memory off");
  for (const width of [360, 1440]) {
    win.setContentSize(width, 850); await wait(120);
    assert(await run("(()=>{const m=document.querySelector('.rcchat-modal'),r=m.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&m.scrollWidth<=m.clientWidth+1})()"), "memory controls fit " + width);
    assert(await run(`(()=>{const b=${button("Rebuild memory in a copy")},r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})()`), "rebuild button fits " + width);
  }
  win.setContentSize(360, 850); await wait(120);
  await click("Rebuild memory in a copy");
  await until(`!!(${button("Rebuild copy now")})`, "rebuild confirmation");
  assert.strictEqual(await run("window.__requests.length"), 0, "opening confirmation must not make a paid request");
  assert(await run("(()=>{const m=document.querySelector('.rcchat-modal'),r=m.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&m.scrollWidth<=m.clientWidth+1})()"), "confirmation fits a phone");
  await click("Rebuild copy now");
  await until("window.storage.get('chats:all').then(r=>JSON.parse(r.value).length===2)", "completed rebuild saved");
  let rows = await readChats(), copy = rows.find(c => c.id !== original.id), requests = await run("window.__requests");
  assert(requests.length >= 2, "fixture must exercise more than one rebuild batch");
  assert(requests.every(r => r.messages[0].content.includes("Produce a concise rolling memory")), "rebuild never generates a roleplay reply");
  assert(requests.every(r => r.model === fixture.memoryModel), "every rebuild batch uses the selected memory model");
  assert(requests.every(r => r.requireZdr === false), "rebuild honors this conversation's explicit provider privacy preference");
  assert.deepStrictEqual(rows.find(c => c.id === original.id), original, "successful rebuild preserves the complete original conversation");
  assert.strictEqual(copy.title, fixture.title);
  assert.strictEqual(copy.autoMemory, false, "explicit rebuild does not silently enable future automatic memory");
  assert.strictEqual(copy.memoryPins, fixture.memoryPins);
  assert.strictEqual(copy.messages.length, messages.length, "all original messages survive in the rebuilt copy");
  assert.deepStrictEqual(copy.messages.map(m => m.content), messages.map(m => m.content));
  assert(copy.messages.every((m, i) => m.id !== messages[i].id && m.parentId === (i ? copy.messages[i - 1].id : null)), "copy remaps the complete message ancestry");
  assert.strictEqual(copy.leafId, copy.messages.at(-1).id);
  assert(copy.memories.every(m => copy.messages.some(row => row.id === m.throughId)), "rebuilt checkpoints anchor only to the copied transcript");
  assert(copy.memories.every(m => m.model === fixture.memoryModel), "rebuilt checkpoints record their actual summarizer model");
  const bodies = requests.map(r => JSON.parse(r.messages[1].content));
  assert.strictEqual(bodies[0].previousMemory, "", "rebuild starts from transcript, not fallible old memory");
  assert(bodies[1].previousMemory.includes("MEMORY_PART_1"), "later rebuild batch receives preceding compacted context");
  assert(requests.every(r => !JSON.stringify(r.messages).includes("LEGACY_")), "old summaries cannot contaminate rebuilding");
  assert.deepStrictEqual(bodies.flatMap(b => b.olderMessages.map(m => Number(m.content.match(/^Turn (\d+):/)[1]))), Array.from({ length: 35 }, (_, i) => i), "every eligible message is compacted once in exact chronological order");
  const memory = await run("window.storage.get('chats:all').then(r=>{const c=JSON.parse(r.value).find(c=>c.id!=='story');return window.__rcvChatInternals.memoryFor(c,window.__rcvChatInternals.activePath(c))})");
  assert.strictEqual(memory.index, 34, "five latest messages remain verbatim");
  for (let i = 1; i <= requests.length; i++) assert(memory.entry.text.includes("MEMORY_PART_" + i + ":"), "cumulative memory retains batch " + i);
  assert.deepStrictEqual((await run("window.storage.get('chats:all').then(r=>{const c=JSON.parse(r.value).find(c=>c.id!=='story');return window.__rcvChatInternals.assemble(c,{chars:[],personas:[],lore:[]},null,[]).messages.slice(1).map(m=>m.content)})")), messages.slice(-5).map(m => m.content), "only drawing/context summaries change, not the retained tail");

  for (const mode of ["error-second", "hold-second"]) {
    original = await reset();
    await run(`window.__mode=${JSON.stringify(mode)}`);
    await openRebuild(); await click("Rebuild copy now");
    await until("window.__requests.length===2", "second rebuild batch");
    if (mode === "hold-second") { assert.strictEqual(await run("window.RolecraftChatSyncIdle()"), false, "incoming sync defers while rebuild is active"); await click("Stop"); await until("!!window.__cancelled", "cancelled native memory worker"); }
    else await until("document.querySelector('.rcchat-messages').textContent.includes('Fixture second batch failure')", "provider error shown");
    await wait(100);
    assert.deepStrictEqual(await readChats(), [original], mode + " keeps original memory/transcript and saves no partial copy");
    assert.strictEqual(await run("window.__requests.length"), 2, mode + " stops without retrying or writing a reply");
    const progress = await run("window.storage.get('ui:chat-memory-rebuild:story').then(r=>JSON.parse(r.value))");
    assert.strictEqual(progress.rebuilt.memories.length, 1, "successful first batch survives independently of the failed second batch");
    await until("window.RolecraftChatSyncIdle()", "failure or Stop releases incoming-sync guard after pending saves settle");
    // until already asserted that the guard released. A second IPC read races
    // with ordinary persistence/render work starting again on the next turn;
    // being briefly busy again is not a failure to release the rebuild guard.
    await reset(original, true);
    assert.strictEqual(await run("window.__requests.length"), 0, "reopening never resumes paid requests without confirmation");
    await openRebuild(); await click("Rebuild copy now");
    await until("window.storage.get('chats:all').then(r=>JSON.parse(r.value).length===2)", "resumed copy saved");
    const resumed = await run("window.__requests.map(r=>JSON.parse(r.messages[1].content))");
    assert.strictEqual(resumed[0].olderMessages[0].content, messages[8].content, "resume starts at the failed batch, not at message one");
    assert(resumed[0].previousMemory.includes('MEMORY_PART_1'), "resume carries successful earlier memory verbatim");
    assert.deepStrictEqual((await readChats()).find(c=>c.id===original.id), original, "resuming preserves the original");
  }

  // Changed source invalidates resumable work, even when the branch leaf ID is unchanged.
  for (const change of ['transcript', 'pins', 'privacy', 'detail', 'model', 'start-over']) {
    original = await reset(); await run("window.__mode='error-second'");
    await openRebuild(); await click('Rebuild copy now');
    await until("document.querySelector('.rcchat-messages').textContent.includes('Fixture second batch failure')", 'checkpoint before change');
    const edited = JSON.parse(JSON.stringify(original));
    if(change==='transcript') edited.messages[0].content += ' An edited event.';
    if(change==='pins') edited.memoryPins += ' Changed pin.';
    if(change==='privacy') edited.requireZdr = true;
    if(change==='detail') edited.memoryBatchTokens = 640;
    if(change==='model') edited.memoryModel = 'fixture/other';
    await reset(edited, true); await openRebuild();
    await click(change==='start-over'?'Start over from first message':'Rebuild copy now');
    await until("window.storage.get('chats:all').then(r=>JSON.parse(r.value).length===2)", 'fresh rebuilt copy');
    const firstBody = await run("JSON.parse(window.__requests[0].messages[1].content)");
    assert.strictEqual(firstBody.previousMemory, '', change + ' must not reuse stale rebuild memory');
    assert.strictEqual(firstBody.olderMessages[0].content, edited.messages[0].content);
  }

  original = await reset();
  await run("window.__realChatCommit=window.storage.syncCommit;window.storage.syncCommit=(values,expected)=>values['chats:all']&&JSON.parse(values['chats:all']).length>1?Promise.reject(new Error('Fixture rebuild disk full')):window.__realChatCommit(values,expected);void 0");
  await openRebuild(); await click("Rebuild copy now");
  await until("document.querySelector('.rcchat-messages').textContent.includes('Fixture rebuild disk full')", "failed rebuild save shown");
  assert.deepStrictEqual(await readChats(), [original], "failed final save retains original and no partial copy");
  await run("window.storage.syncCommit=window.__realChatCommit;void 0");
  await click('Retry save');
  await until("window.RolecraftChatSyncIdle()", "failed save cleared before rebuild retry");
  await openRebuild(); await click('Rebuild copy now');
  const requestCount = await run('window.__requests.length');
  await until("window.storage.get('chats:all').then(r=>JSON.parse(r.value).length===2)", 'retry final save without paid requests');
  assert.strictEqual(await run('window.__requests.length'), requestCount, 'completed journal retries final save without regenerating');

  original = await reset();
  await run("window.__realSet=window.storage.set;window.storage.set=(key,value)=>key.startsWith('ui:chat-memory-rebuild:')?Promise.reject(new Error('Fixture checkpoint disk full')):window.__realSet(key,value);void 0");
  await openRebuild(); await click('Rebuild copy now');
  await until("document.querySelector('.rcchat-messages').textContent.includes('Fixture checkpoint disk full')", 'checkpoint failure shown');
  assert.strictEqual(await run('window.__requests.length'), 1, 'checkpoint disk failure stops before paying for another batch');
  assert.deepStrictEqual(await readChats(), [original], 'checkpoint save failure never changes original chat');
  await run('window.storage.set=window.__realSet;void 0');

  original = await reset();
  await run("window.__mode='hold-second'");
  await openRebuild(); await click("Rebuild copy now");
  await until("window.__requests.length===2", "lock during second batch");
  await run("window.dispatchEvent(new Event('rcv-locking'))");
  await until("!document.querySelector('.rcchat-shell')&&!!window.__cancelled", "locked workspace concealed and cancelled");
  assert.deepStrictEqual(await readChats(), [original], "locking retains the original and never publishes a partial rebuilt conversation");
  console.log("PASS: resumable memory rebuild after failure/Stop/reopen, changed-input invalidation, explicit restart, sync deferral, final-save retry, checkpoint failures, original preservation and lock");
  clearTimeout(timeout); app.exit(0);
}).catch(error => { console.error(error.stack); clearTimeout(timeout); app.exit(1); });
