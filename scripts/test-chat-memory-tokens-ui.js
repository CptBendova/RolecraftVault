// Real shipped Chat UI and disposable storage; all provider responses are local fixtures.
const { app, BrowserWindow } = require("electron");
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const root = path.join(__dirname, ".."), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-memory-tokens-ui-"));
app.setPath("userData", tmp);
const preload = path.join(tmp, "preload.js");
fs.writeFileSync(preload, `window.Capacitor={isNativePlatform:()=>true};window.__requests=[];window.__usageMode='actual';
window.__completeMemory=request=>{
  const part=window.__requests.indexOf(request)+1;
  window.__emit({id:request.requestId,type:'delta',text:'MEMORY_ADDITION_'+part+': A distinct event from this chronological span is remembered. [END_MEMORY]'});
  if(window.__usageMode==='actual')window.__emit({id:request.requestId,type:'usage',usage:{prompt_tokens:1234,completion_tokens:321,total_tokens:1555}});
  window.__emit({id:request.requestId,type:'finish',reason:'stop'});
  window.__emit({id:request.requestId,type:'done'});
};
window.openRouter={status:async()=>({configured:true}),onEvent:cb=>{window.__emit=cb;return()=>{}},cancel:async id=>({ok:true}),start:async request=>{
  if(!request.messages[0].content.includes('Produce a concise rolling memory'))throw Error('Unexpected roleplay request');
  window.__requests.push(request);
  if(window.__requests.length>1)window.__completeMemory(request);
  return{ok:true};
}};`);
let win, lastProbe = "startup";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = async script => { lastProbe = script; return win.webContents.executeJavaScript(script); };
const button = label => `Array.from((${JSON.stringify(label)}==='Chat'?document.querySelector('.rcchat-launch')?.parentElement:(document.querySelector('.rcchat-modal')||document.querySelector('#rcv-chat-root'))).querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent).trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)})`;
const click = label => run(`(()=>{const b=${button(label)};if(!b||b.disabled)throw Error('Missing or disabled '+${JSON.stringify(label)});b.click()})()`);
async function until(script, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await run(script)) return; await wait(50); }
  throw Error("Timed out waiting for " + label);
}
const readChats = () => run("window.storage.get('chats:all').then(r=>JSON.parse(r.value))");
const messages = Array.from({ length: 32 }, (_, i) => ({
  id: "m" + i, parentId: i ? "m" + (i - 1) : null, role: i % 2 ? "assistant" : "user",
  content: "Turn " + i + ": " + "The traveller made a different decision in this scene. ".repeat(20), createdAt: i + 1
}));
const fixture = {
  id: "story", title: "Memory token fixture", model: "fixture/model", contextTokens: 1000000,
  maxTokens: 500, autoMemory: false, memoryRecent: 5, messages, leafId: "m31",
  memories: [{ id: "old", throughId: "m12", text: "An old incomplete summary." }]
};
async function reset(mode, cap) {
  await run(`window.storage.set('chats:all',${JSON.stringify(JSON.stringify([{...fixture,memoryBatchTokens:cap}]))})`);
  await new Promise(resolve => { win.webContents.once("did-finish-load", resolve); win.webContents.reload(); });
  await until("!!document.querySelector('.rcchat-launch')", "vault launch");
  await click("Chat");
  await until("!!document.querySelector('.rcchat-compose textarea')", "Chat launch");
  await run(`window.__usageMode=${JSON.stringify(mode)}`);
  return (await readChats())[0];
}
const timeout = setTimeout(() => { console.error("Memory token UI timeout at: " + lastProbe); app.exit(1); }, 120000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ show: true, width: 360, height: 850, webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  win.focus();
  await win.loadFile(path.join(root, "web/index.html")); await wait(1200);
  await run("(async()=>{for(const k of ['chars:all','personas:all','lore:all','prompts:all'])await window.storage.set(k,'[]');await window.storage.set('ui:onboarded','1')})()");
  for (const [mode, cap, expectedCap] of [["actual",undefined,384],["missing",256,256],["actual",640,640]]) {
    const original = await reset(mode, cap);
    assert.strictEqual(await run("window.__requests.length"), 0, "opening Chat does not contact the provider");
    await click("Conversation settings");
    await click("Memory");
    await until("!!document.querySelector('[data-memory-tokens]')", "memory token estimate");
    assert.match(await run("document.querySelector('[data-memory-tokens]').textContent"), /estimat|about/i, "memory size is labelled an estimate");
    assert.strictEqual(await run("window.__requests.length"), 0, "viewing token counts does not contact the provider");
    await click("Rebuild memory in a copy");
    const confirmation = await run("document.querySelector('.rcchat-memory [role=alert]').textContent");
    assert(confirmation.includes('targets approximately ' + expectedCap + ' saved summary tokens'), "Rebuild confirmation uses the same selected/default summary target as the worker");
    assert(!/4,?096/.test(confirmation), "Retired 4096-token allowance must not appear in the confirmation");
    await click("Rebuild copy now");
    await until("window.__requests.length===1", "first held rebuild request");
    const request = await run("window.__requests[0]");
    const phase = await run("document.querySelector('#rcv-chat-root').textContent");
    assert.match(phase, /~[\d,]+\s+input/i, "running memory work displays its estimated input budget");
    assert.match(phase, /up to\s*[\d,]+\s+output/i, "running memory work distinguishes an output limit from actual usage");
    assert(phase.replace(/,/g, "").includes(String(request.max_tokens)), "phase shows the actual native request output ceiling");
    assert(request.max_tokens > expectedCap && request.max_tokens <= 8192, "native generation has a separate bounded allowance for reasoning");
    assert(confirmation.includes('including reasoning') && phase.includes('summary target'), "UI distinguishes billed generation from saved memory");
    await run("window.__completeMemory(window.__requests[0]);void 0");
    await until("window.storage.get('chats:all').then(r=>JSON.parse(r.value).length===2)", "rebuilt conversation persisted");
    await until("!Array.from(document.querySelector('#rcv-chat-root').querySelectorAll('button')).some(b=>b.textContent.trim()==='Stop')", "rebuild completed");
    const rows = await readChats(), copy = rows.find(c => c.id !== original.id), requests = await run("window.__requests");
    assert.deepStrictEqual(rows.find(c => c.id === original.id), original, "token accounting does not change the original conversation");
    assert(requests.length > 1 && copy.memories.length === requests.length, "all chronological rebuild batches save their own token metadata");
    for (let i = 0; i < copy.memories.length; i++) {
      const memory = copy.memories[i];
      const inputEstimate = await run(`window.__requests[${i}].messages.reduce((total,m)=>total+window.__rcvChatInternals.tokenEstimate(m.content),0)`);
      assert.strictEqual(memory.inputTokensEstimated, inputEstimate, "saved input estimate counts all actual request messages, including old memory");
      assert(memory.outputTokensEstimated > 0 && Number.isInteger(memory.outputTokensEstimated), "saved output has an explicit integer estimate");
      assert.strictEqual(memory.maxTokens, requests[i].max_tokens, "checkpoint records the worker output limit");
      assert(memory.outputTokensEstimated <= memory.summaryTokens && memory.summaryTokens <= expectedCap, "saved summary never exceeds its estimated history cap");
      if (mode === "actual") assert.deepStrictEqual(memory.usage, { prompt_tokens: 1234, completion_tokens: 321, total_tokens: 1555 }, "memory worker retains provider-reported usage");
      else assert(!memory.usage, "missing provider usage is not fabricated from estimates");
    }
    await click("Conversation settings");
    await click("Memory");
    await until("!!document.querySelector('[data-memory-usage]')", "last memory usage report");
    const usageText = (await run("document.querySelector('[data-memory-usage]').textContent")).replace(/,/g, "");
    if (mode === "actual") {
      assert.match(usageText, /1234/, "provider input usage is shown");
      assert.match(usageText, /321/, "provider output usage is shown");
      assert.match(usageText, /actual|provider.reported/i, "actual provider usage is explicitly distinguished from estimates");
    } else {
      assert.match(usageText, /estimat/i, "providers without usage report an estimated fallback");
      assert(!/actual\s*(?:usage|tokens|input|output)|provider.reported\s*(?:usage|tokens|input|output)/i.test(usageText), "estimated fallback must not be presented as actual usage");
    }
    const totals = await run("window.storage.get('chats:all').then(r=>{const c=JSON.parse(r.value).find(c=>c.id!=='story'),I=window.__rcvChatInternals,m=I.memoryFor(c,I.activePath(c)).entry,a=I.assemble(c,{chars:[],personas:[],lore:[]},null,[]);return{text:m.text,estimate:I.tokenEstimate(m.text),context:a.messages[0].content}})");
    assert(totals.context.includes(totals.text), "the entire accumulated memory enters roleplay context, not only the last batch");
    for (let i = 1; i <= requests.length; i++) assert(totals.text.includes("MEMORY_ADDITION_" + i + ":"), "batch " + i + " survives cumulative memory");
    const tokenText = (await run("document.querySelector('[data-memory-tokens]').textContent")).replace(/,/g, "");
    assert(tokenText.includes(String(totals.estimate)), "visible memory estimate measures the entire cumulative memory");
    for (const width of [360, 1440]) {
      win.setContentSize(width, 850); await wait(120);
      assert(await run("(()=>{const modal=document.querySelector('.rcchat-modal'),r=modal.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&modal.scrollWidth<=modal.clientWidth+1})()"), "memory modal fits " + width);
      for (const selector of ["[data-memory-tokens]", "[data-memory-usage]"]) assert(await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+1&&e.scrollWidth<=e.clientWidth+1})()`), selector + " fits " + width);
    }
    assert.strictEqual(await run("window.__requests.length"), requests.length, "reading estimates after rebuild starts no further provider requests");
  }
  console.log("PASS: memory request budgets, saved provider usage, honest estimated fallback, cumulative token/context accounting, responsive UI and no provider calls on open");
  clearTimeout(timeout); app.exit(0);
}).catch(error => { console.error(error.stack); clearTimeout(timeout); app.exit(1); });
