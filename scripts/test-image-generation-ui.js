// Real private gallery UI and disposable IndexedDB storage. The privileged image
// provider is an offline fixture: this test never uses keys, a network or billing.
const { app, BrowserWindow } = require("electron");
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const root = path.join(__dirname, ".."), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-image-studio-ui-"));
const GENERATE = "Generate 1 image and save to gallery";
app.setPath("userData", tmp);
app.commandLine.appendSwitch("force-device-scale-factor", "1");
const preload = path.join(tmp, "image-provider.js");
fs.writeFileSync(preload, `
if(process.argv.includes('--image-test-phone')){window.Capacitor={isNativePlatform:()=>true};Object.defineProperty(window.screen,'width',{value:360});Object.defineProperty(window.screen,'height',{value:850});}
window.__imageRequests=[];window.__imageCancelled=[];window.__imageKeys=[];window.__imageUnlocked=[];window.__imageMode='hold';window.__imageConfigured={openai:true,xai:true};
window.imageGeneration={
 status:async()=>({ok:true,secure:true,...window.__imageConfigured}),
 setUnlocked:async x=>{window.__imageUnlocked.push(x);return{ok:true}},
 setKey:async x=>{window.__imageKeys.push({provider:x.provider,key:x.key});window.__imageConfigured[x.provider]=true;return{ok:true}},
 clearKey:async x=>{window.__imageKeys.push({provider:x.provider,removed:true});window.__imageConfigured[x.provider]=false;return{ok:true}},
 cancel:async x=>{window.__imageCancelled.push(x);return{ok:true}},
 generate:async x=>{window.__imageRequests.push(JSON.parse(JSON.stringify(x)));if(window.__imageMode==='fail')return{ok:false,error:window.__imageFailure||'Fixture provider unavailable'};return new Promise(resolve=>{window.__finishImage=()=>resolve({ok:true,dataUrl:window.__generatedImage,provider:x.provider,model:x.model});});}
};
`);
let win, lastProbe = "startup";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = script => { lastProbe = script; return win.webContents.executeJavaScript(script); };
const button = (label, scope = ".image-studio") => `Array.from((document.querySelector(${JSON.stringify(scope)})||document).querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent).trim()===${JSON.stringify(label)}&&b.getClientRects().length)`;
async function click(label, scope) {
  await run(`(()=>{const b=${button(label, scope)};if(!b||b.disabled)throw Error('Missing or disabled '+${JSON.stringify(label)});b.click()})()`);
  await wait(65);
}
async function input(selector, value) {
  await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input '+${JSON.stringify(selector)});const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);
  await wait(65);
}
async function until(script, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await run(script)) return; await wait(60); }
  throw Error("Timed out waiting for " + label + ": " + script);
}
const readCharacters = () => run("window.storage.get('chars:all').then(r=>JSON.parse(r.value))");
const readCharacter = async () => (await readCharacters()).find(c => c.id === "image-char");
async function saveImageLockGuards() {
  const source = fs.readFileSync(path.join(root, "app/app.js"), "utf8");
  const marker = "const saveImage = useCallback(", start = source.indexOf(marker);
  assert(start >= 0, "real saveImage implementation exists");
  const bodyStart = start + marker.length, end = source.indexOf("\n  }, [markShow]);", bodyStart);
  assert(end > bodyStart, "real saveImage callback can be lifted without copying it");
  const build = new Function("sSet", "sDel", "dataUrlSize", "fullMem", "fullOrder", "markShow", "setImgCache", "setFullCache", "return (" + source.slice(bodyStart, end + 4) + ");");
  for (const lockAfterWrite of [0, 1, 2, 3, null]) {
    let active = lockAfterWrite !== 0;
    const writes = [], deleted = [], displays = [], fullMem = { current: {} }, fullOrder = { current: [] };
    const imageCache = {}, fullCache = {};
    const save = build(async (key, value) => { writes.push({ key, value }); if (writes.length === lockAfterWrite) active = false; },
      async key => { deleted.push(key); }, () => 9, fullMem, fullOrder, id => displays.push(id),
      fn => Object.assign(imageCache, fn(imageCache)), fn => Object.assign(fullCache, fn(fullCache)));
    const guard = () => { if (!active) throw Error("Fixture vault locked"); };
    if (lockAfterWrite === null) {
      await save("generated", "data:image/png;base64,b3JpZ2luYWw=", "data:image/png;base64,dGh1bWI=");
      assert.strictEqual(writes.length, 3, "legacy saveImage callers remain compatible without a guard");
      assert.deepStrictEqual(displays, ["generated"]); assert.strictEqual(Object.keys(imageCache).length, 1); assert.strictEqual(Object.keys(fullCache).length, 1);
    } else {
      await assert.rejects(save("generated", "data:image/png;base64,b3JpZ2luYWw=", "data:image/png;base64,dGh1bWI=", guard), /vault locked/);
      assert.strictEqual(writes.length, lockAfterWrite, "no further storage writes after lock at boundary " + lockAfterWrite);
      assert.deepStrictEqual(fullMem.current, {}, "late storage completion cannot repopulate full-image memory after lock");
      assert.deepStrictEqual(fullOrder.current, [], "late storage completion cannot repopulate the full-image order after lock");
      assert.deepStrictEqual(displays, [], "late storage completion cannot reveal a locked image");
      assert.deepStrictEqual(imageCache, {}, "late storage completion cannot repopulate preview cache after lock");
      assert.deepStrictEqual(fullCache, {}, "late storage completion cannot repopulate full cache after lock");
      assert.deepStrictEqual(deleted, [], "a lock assertion does not trigger cleanup writes while locked");
    }
  }
  console.log("PASS real saveImage guard: lock before or after each storage await leaves all image caches empty; existing callers still work");
}
async function openStudio() {
  await run(`(()=>{const b=${button("Generate image", "body")};if(b)b.focus()})()`);
  await click("Generate image", "body");
  await until("!!document.querySelector('.image-studio #image-prompt')", "image studio");
  await until(`!!(${button(GENERATE)})`, "generation controls");
}
async function preview(prompt, saved = true, beforeReply) {
  await input("#image-prompt", prompt);
  const count = await run("window.__imageRequests.length");
  await click(GENERATE);
  await until(`window.__imageRequests.length===${count + 1}`, "native image request");
  if (beforeReply) await beforeReply();
  await run("window.__finishImage()");
  await until(saved ? `!!(${button("Saved to character gallery")})` : `!!(${button("Save to character gallery")})&&!(${button("Save to character gallery")}).disabled`, "generated preview with save outcome");
}
async function promptIdeaChecks(phone) {
  const selectedReferences = () => run("[...document.querySelectorAll('.image-studio button[aria-label^=\"Use reference \"][aria-pressed=true]')].map(e=>e.getAttribute('aria-label'))");
  const readPrompt = () => run("document.querySelector('#image-prompt').value");
  const requestCount = await run("window.__imageRequests.length");
  assert(await run("(()=>{const ideas=document.querySelector('details.image-prompt-ideas'),prompt=document.querySelector('#image-prompt');return !!ideas&&!!(ideas.compareDocumentPosition(prompt)&Node.DOCUMENT_POSITION_FOLLOWING)})()"), "Reference-photo prompt ideas appear before the editable prompt");
  assert.strictEqual(await run("document.querySelector('#image-prompt-preset').value"), "", "A prompt idea is never silently preselected");
  assert.strictEqual(await run("document.querySelector('#image-prompt').maxLength"), 8000, "The prompt keeps the native 8000-character limit");
  assert.strictEqual(await readPrompt(), ""); assert.deepStrictEqual(await selectedReferences(), []);
  await run("document.querySelector('.image-prompt-ideas').open=true");
  const presets = await run("[...document.querySelector('#image-prompt-preset').options].filter(o=>o.value).map(o=>({value:o.value,label:o.textContent}))");
  assert(presets.length >= 12, "Reference ideas provide at least twelve authored choices");
  assert.equal(new Set(presets.map(p => p.value)).size, presets.length, "Each preset has a distinct selectable identity");
  const previews = [];
  for (const preset of presets) {
    await input("#image-prompt-preset", preset.value);
    const text = await run("document.querySelector('.image-prompt-idea-text').textContent");
    assert(text.trim().length > 40 && /reference/i.test(text) && /identit|same character|recogniz|consistent/i.test(text), "Preset offers an authored identity-preserving reference prompt: " + preset.label);
    previews.push(text);
    assert.strictEqual(await readPrompt(), "", "Selecting a preset only previews it");
    assert.deepStrictEqual(await selectedReferences(), [], "Selecting a preset never chooses a reference photo");
  }
  assert.equal(new Set(previews).size, presets.length, "Preset choices preview distinct prompts");
  assert.strictEqual(await run("window.__imageRequests.length"), requestCount, "Browsing all prompt ideas never sends a provider request");
  assert(await run(`(${button("Use prompt")}).disabled`), "Using a reference prompt requires an explicitly selected photo");
  assert(await run("/select[^.]*reference|reference[^.]*select/i.test(document.querySelector('.image-prompt-ideas').textContent)"), "The panel explains why a reference photo is required");

  const existing = "  Keep my exact words.\nAnd punctuation!  ";
  await input("#image-prompt", existing); await input("#image-prompt-preset", presets[0].value);
  const idea = await run("document.querySelector('.image-prompt-idea-text').textContent");
  assert.strictEqual(await readPrompt(), existing, "Choosing an idea never overwrites an existing prompt");
  assert(await run(`(${button("Add to prompt")}).disabled&&(${button("Replace prompt")}).disabled`), "Both explicit application choices require a selected reference");
  await click("Use reference 1");
  const references = await selectedReferences(); assert.deepStrictEqual(references, ["Use reference 1"]);
  await input("#image-prompt-preset", presets[1].value); await input("#image-prompt-preset", presets[0].value);
  assert.deepStrictEqual(await selectedReferences(), references, "Changing ideas preserves the exact selected reference set");
  assert.strictEqual(await readPrompt(), existing);
  await click("Add to prompt");
  assert.strictEqual(await readPrompt(), existing + "\n\n" + idea, "Add preserves exact user text and appends two newlines plus the previewed idea");
  await click("Replace prompt"); assert.strictEqual(await readPrompt(), idea, "Only explicit Replace overwrites an existing prompt");
  await input("#image-prompt", ""); await click("Use prompt"); assert.strictEqual(await readPrompt(), idea, "Use fills an empty prompt with the previewed idea");
  const edited = idea + "\nMy editable lighting direction.";
  await input("#image-prompt", edited); assert.strictEqual(await readPrompt(), edited, "Applied ideas remain ordinary editable prompt text");

  const fits = "Z".repeat(8000 - idea.length - 2);
  await input("#image-prompt", fits);
  assert(!(await run(`(${button("Add to prompt")}).disabled`)), "An append that reaches exactly 8000 characters remains available");
  await click("Add to prompt"); assert.strictEqual(await readPrompt(), fits + "\n\n" + idea); assert.equal((await readPrompt()).length, 8000);
  const full = "Keep".repeat(2000); await input("#image-prompt", full);
  assert(await run(`(${button("Add to prompt")}).disabled`), "An append exceeding 8000 characters is disabled");
  await run(`(${button("Add to prompt")}).click()`);
  assert.strictEqual(await readPrompt(), full, "An over-limit append never silently truncates or replaces existing text");
  assert(!(await run(`(${button("Replace prompt")}).disabled`)), "Explicit replacement remains available when the chosen idea fits");
  await click("Replace prompt"); assert.strictEqual(await readPrompt(), idea);

  for (const width of [360, 768, 1440]) {
    win.setContentSize(width, 850); await wait(100);
    assert(await run("(()=>{const e=document.querySelector('.image-prompt-ideas'),p=document.querySelector('.image-prompt-idea-text'),r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&e.scrollWidth<=e.clientWidth+1&&p.scrollWidth<=p.clientWidth+1&&[...e.querySelectorAll('select,button')].every(x=>{const b=x.getBoundingClientRect();return b.left>=-1&&b.right<=innerWidth+1})})()"), "Expanded prompt ideas and actions fit " + width + "px without horizontal overflow");
  }
  win.setContentSize(phone ? 360 : 1440, 850);
  if (process.env.RCV_CAPTURE_IMAGES) {
    await run("document.querySelector('.image-prompt-ideas').scrollIntoView({block:'center'})");
    win.focus(); await wait(100);
    const dir = path.join(root, "dist", "maintenance"); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "image-prompt-ideas-" + (phone ? "phone" : "desktop") + ".png"), (await win.webContents.capturePage()).toPNG());
  }
  assert.strictEqual(await run("window.__imageRequests.length"), requestCount, "Applying and editing ideas stays offline until Generate is explicitly clicked");
  assert.deepStrictEqual(await selectedReferences(), references, "Applying ideas never changes the selected pictures");
  await click("Use reference 1"); await input("#image-prompt", ""); await input("#image-prompt-preset", "");
  await run("document.querySelector('.image-prompt-ideas').open=false");
  assert.strictEqual(await readPrompt(), ""); assert.deepStrictEqual(await selectedReferences(), []);
}
async function assertPromptIdeasDisabled(label) {
  assert(await run("document.querySelector('#image-prompt-preset').disabled"), label + ": preset selection is disabled");
  assert(await run("(()=>{const buttons=[...document.querySelector('.image-prompt-ideas').querySelectorAll('button')];return buttons.length>0&&buttons.every(b=>b.disabled)})()"), label + ": preset application controls are disabled");
}
async function viewerChecks() {
  await until("!!document.querySelector('.lb-root')", "full screen viewer");
  assert(await run("(()=>{const e=document.querySelector('.lb-root'),r=e.getBoundingClientRect();return r.x===0&&r.y===0&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1})()"), "Viewer fills the viewport");
  assert(await run("!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)"), "Opening viewer never opens the mobile text keyboard");
  await click("Hide controls", ".lb-root");
  assert(await run("(()=>{const e=document.querySelector('.lb-root'),s=getComputedStyle(e.querySelector('.lb-reveal'));return [...e.querySelectorAll('.lb-chrome,.lb-side')].every(x=>!x.getClientRects().length)&&s.pointerEvents==='none'&&s.clipPath==='inset(50%)'})()"), "Hidden tools neither cover the image nor intercept taps; reveal is initially only available to assistive technology and keyboard");
  if (process.env.RCV_CAPTURE_IMAGES) {
    const dir = path.join(root, "dist", "maintenance"); fs.mkdirSync(dir, { recursive: true });
    await until("!document.querySelector('.toast')", "temporary save notification cleared before capture");
    win.focus(); await wait(100);
    const prefix = await run("document.querySelector('.image-studio .lb-root') ? 'image-preview-hidden-' : 'image-viewer-hidden-'");
    fs.writeFileSync(path.join(dir, prefix + (await run("innerWidth")) + ".png"), (await win.webContents.capturePage()).toPNG());
  }
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" }); win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" }); await wait(60);
  assert(await run("document.activeElement===document.querySelector('.lb-reveal')"), "Tab does not reach hidden controls or content behind viewer");
  await run("(()=>{const e=document.querySelector('.lb-stage');e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,clientX:120,clientY:180}));e.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,clientX:120,clientY:180}))})()");
  await until("!document.querySelector('.lb-reveal')", "single tap restores controls");
  await run("(()=>{const e=document.querySelector('.lb-stage');for(let i=0;i<2;i++){e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:2,clientX:120,clientY:180}));e.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:2,clientX:120,clientY:180}))}})()");
  await wait(330);
  assert(await run("document.querySelector('.lb-stage img').style.transform.includes('2.5')&&!document.querySelector('.lb-reveal')"), "Double tap zoom is preserved without hiding controls");
  await run("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  await until("!document.querySelector('.lb-root')", "Escape closes only viewer");
}
async function closeStudio() {
  if (await run("!!document.querySelector('.image-studio')")) await click("Close image generator");
  await until("!document.querySelector('.image-studio')", "closed generator");
}
async function captureStudio(label, preview = false) {
  if (!process.env.RCV_CAPTURE_IMAGES) return;
  await run(`(()=>{const p=document.querySelector('.image-studio-panel');p.scrollTop=${preview ? "p.scrollHeight" : "0"}})()`);
  win.focus(); await wait(100);
  const dir = path.join(root, "dist", "maintenance"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "image-studio-batch-" + (preview ? "preview-" : "") + label + ".png"), (await win.webContents.capturePage()).toPNG());
}
const timer = setTimeout(() => { console.error("Image generation UI timeout at " + lastProbe); app.exit(1); }, 150000);
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  await saveImageLockGuards();
  for (const phone of [true, false]) {
    win = new BrowserWindow({ show: true, width: phone ? 360 : 1440, height: 850,
      webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false,
        partition: "image-test-" + (phone ? "phone" : "desktop"), additionalArguments: phone ? ["--image-test-phone"] : [] } });
    win.setContentSize(phone ? 360 : 1440, 850); win.focus();
    await win.loadFile(path.join(root, "web/index.html"));
    await until("!!document.querySelector('.rcv[data-rcv-state=ready]')", "ready library");
    await run(`(async()=>{
      const picture=(colour,w=24,h=32)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=colour;x.fillRect(0,0,w,h);return c.toDataURL('image/png')};
      window.__fixtureImages={'old-portrait':picture('#ce935f'),'old-banner':picture('#173544'),'old-gallery':picture('#579156'),'variant-portrait':picture('#9863bd')};
      for(const [id,value]of Object.entries(window.__fixtureImages)){await window.storage.set('img:'+id,value);await window.storage.set('th:'+id,value)}
      await window.storage.set('chars:all',JSON.stringify([{id:'image-char',name:'Image fixture',story:'PRIVATE_STORY_NOT_FOR_IMAGE_PROVIDER',personality:'PRIVATE_PERSONALITY_NOT_FOR_IMAGE_PROVIDER',creatorMemo:'PRIVATE_MEMO_NOT_FOR_IMAGE_PROVIDER',profileImg:'old-portrait',banner:'old-banner',gallery:[{imgId:'old-gallery',caption:'Original caption',album:'Original album',variantId:''}],albums:['Original album'],imgMeta:{},variants:[{id:'evening',name:'Evening variant',profileImg:'variant-portrait',story:'PRIVATE_VARIANT_NOT_FOR_IMAGE_PROVIDER'}],tags:[],searchables:[],sections:[],history:[],createdAt:1,updatedAt:1}]));
      for(const k of ['personas:all','lore:all','prompts:all'])await window.storage.set(k,'[]');
      await window.storage.set('blurset',JSON.stringify(['old-portrait']));await window.storage.set('ui:onboarded','1');
    })()`);
    await new Promise(resolve => { win.webContents.once("did-finish-load", resolve); win.webContents.reload(); });
    await until("!!document.querySelector('.rcv[data-rcv-state=ready]')", "seeded library");
    await run(`(()=>{const c=document.createElement('canvas');c.width=1536;c.height=1024;const g=c.getContext('2d');g.fillStyle='#b49462';g.fillRect(0,0,c.width,c.height);g.fillStyle='#123343';g.fillRect(0,0,800,500);window.__generatedImage=c.toDataURL('image/png')})()`);
    const original = await readCharacter();
    const originalBytes = await run("(async()=>{const out={};for(const id of ['old-portrait','old-banner','old-gallery','variant-portrait'])out[id]=(await window.storage.get('img:'+id)).value;return out})()");
    await click("Characters", "body");
    await until("!!document.querySelector('.char-card')", "character card");
    await run("document.querySelector('.char-card').click()");
    await until(`!!(${button("Generate image", "body")})`, "character image action");
    await openStudio();
    assert.strictEqual(await run("window.__imageRequests.length"), 0, "opening the image studio must not make a paid request");
    assert(await run("!!document.querySelector('.image-studio [role=dialog]')||document.querySelector('.image-studio').getAttribute('role')==='dialog'"), "generator has dialog semantics");
    assert(await run("(()=>{const c=getComputedStyle(document.querySelector('.image-studio-panel')).backgroundColor;return c!=='transparent'&&/^rgb\\(/.test(c)})()"), "generator uses an opaque theme surface so underlying character writing cannot bleed through its controls");
    await until("document.querySelector('.image-studio-panel').contains(document.activeElement)", "focus moves into generator");
    await run("(()=>{const p=document.querySelector('.image-studio-panel'),f=[...p.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex=\"-1\"])')].filter(e=>e.offsetParent!==null);window.__studioFirst=f[0];window.__studioLast=f[f.length-1];window.__studioLast.focus()})()");
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" }); win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" }); await wait(80);
    assert(await run("document.activeElement===window.__studioFirst"), "Tab wraps from the last generator control to the first");
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab", modifiers: ["shift"] }); win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab", modifiers: ["shift"] }); await wait(80);
    assert(await run("document.activeElement===window.__studioLast"), "Shift+Tab wraps from the first generator control to the last");
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" }); win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    await until("!document.querySelector('.image-studio')", "Escape closes generator only");
    assert(await run(`document.activeElement===(${button("Generate image", "body")})`), "closing restores focus to the character's generator action");
    assert(await run("!!document.querySelector('.scrollbody.sheet')"), "Escape does not close the character behind the generator");
    await openStudio();
    for (const width of [360, 768, 1440]) {
      win.setContentSize(width, 850); await wait(100);
      const bounds = await run("(()=>{const p=document.querySelector('.image-studio-panel'),r=p.getBoundingClientRect();return{left:r.left,right:r.right,sw:p.scrollWidth,cw:p.clientWidth,vw:innerWidth,controls:[...p.querySelectorAll('input,select,textarea,button')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return{left:b.left,right:b.right}})}})()");
      assert(bounds.left >= -1 && bounds.right <= bounds.vw + 1 && bounds.sw <= bounds.cw + 1, "generator fits " + width + ": " + JSON.stringify(bounds));
      assert(bounds.controls.every(r => r.left >= -1 && r.right <= bounds.vw + 1), "controls remain inside viewport at " + width);
    }
    win.setContentSize(phone ? 360 : 1440, 850);
    await captureStudio(phone ? "phone" : "desktop");
    assert.strictEqual(await run("document.querySelectorAll('.image-studio button[aria-label^=\"Use reference \"]').length"), 4, "reference picker includes portrait, banner, gallery and variant portrait");
    assert.strictEqual(await run("document.querySelectorAll('.image-studio button[aria-pressed=true]').length"), 0, "reference images are not silently preselected");
    assert(await run("(()=>{const b=document.querySelector('.image-studio button[aria-label=\"Use reference 1\"]'),images=b?b.querySelectorAll('img'):[];return [...images].some(e=>{for(let x=e;x&&x!==b.parentElement;x=x.parentElement)if(/blur\\(/.test(getComputedStyle(x).filter))return true;return false})})()"), "reference thumbnails respect the saved blur choice");
    await promptIdeaChecks(phone);

    await run("document.querySelector('.image-studio details').open=true");
    await click("Remove saved key");
    assert.strictEqual(await run("window.__imageConfigured.openai"), false, "removing a key reaches the native credential store");
    await input("#image-api-key", "fixture-key-not-a-real-secret"); await click("Save API key");
    await until("window.__imageConfigured.openai===true", "saved provider key");
    assert.deepStrictEqual(await run("window.__imageKeys[window.__imageKeys.length-1]"), { provider: "openai", key: "fixture-key-not-a-real-secret" });
    assert.strictEqual(await run("document.querySelector('#image-api-key').value"), "", "successful key saving clears the credential input");
    assert(!(await run("(async()=>{const keys=(await window.storage.list()).keys||[];for(const key of keys.filter(k=>!/^img:|^th:/.test(k))){const row=await window.storage.get(key);if(String(row.value).includes('fixture-key-not-a-real-secret'))return true}return false})()")), "provider API keys never enter library records or synced preferences");
    await run("document.querySelector('.image-studio details').open=false");

    const prompt = "Paint a lantern beside a quiet mountain lake.";
    await input("#image-provider", "openai");
    const model = await run("document.querySelector('#image-model').value");
    const shape = "portrait";
    await input("#image-shape", shape);
    assert(await run("document.querySelector('#image-shape').selectedOptions[0].textContent.includes('2:3')"), "portrait identifies its 2:3 aspect ratio");
    await input("#image-resolution", "max");
    assert(await run("/2,?336\\s*[×x]\\s*3,?504/.test(document.querySelector('.image-studio').textContent)"), "OpenAI max 2:3 describes the supported exact dimensions rather than promising 4K on its long edge");
    const quality = await run("[...document.querySelector('#image-quality').options].filter(o=>!o.disabled).slice(-1)[0].value");
    await input("#image-quality", quality); await input("#image-prompt", prompt);
    await input("#image-caption", "Moonlit lake illustration"); await input("#image-variant", "evening");
    await run(`(()=>{const b=${button(GENERATE)};b.click();b.click()})()`);
    await until("window.__imageRequests.length===1", "single request after double click"); await wait(120);
    assert.strictEqual(await run("window.__imageRequests.length"), 1, "rapid double click cannot bill two generations");
    let request = await run("window.__imageRequests[0]");
    assert.strictEqual(request.provider, "openai"); assert.strictEqual(request.model, model); assert.strictEqual(request.prompt, prompt);
    assert.deepStrictEqual(request.references || [], [], "text-only generation sends no photos");
    assert(Object.values(request).includes(shape), "selected image shape reaches the native request");
    assert.strictEqual(request.resolution, "max", "OpenAI maximum resolution reaches the native request");
    assert(Object.values(request).includes(quality), "selected quality reaches the native request");
    assert(!JSON.stringify(request).includes("PRIVATE_"), "character writing and creator memo never enter the image request automatically");
    await run("window.__finishImage()");
    await until(`!!(${button("Saved to character gallery")})`, "first image auto-saved preview");
    assert(await run("/1,?536\\s*[×x]\\s*1,?024/.test(document.querySelector('.image-studio').textContent)"), "preview reports actual returned image dimensions, not the requested dimensions");
    await captureStudio(phone ? "phone" : "desktop", true);
    await until("window.storage.get('chars:all').then(r=>JSON.parse(r.value)[0].gallery.length===2)", "image saved to gallery");
    await click("View full screen"); await viewerChecks();
    assert(await run("!!document.querySelector('.image-studio')"), "Closing preview leaves image studio open");
    let saved = await readCharacter(), entry = saved.gallery[1];
    assert.strictEqual(entry.caption, "Moonlit lake illustration"); assert.strictEqual(entry.variantId, "evening");
    assert(!Object.keys(originalBytes).includes(entry.imgId), "generated artwork receives a fresh identity");
    assert.strictEqual(await run(`window.storage.get('img:'+${JSON.stringify(entry.imgId)}).then(r=>r.value)`), await run("window.__generatedImage"), "generated original is saved losslessly");
    assert(await run(`window.storage.get('th:'+${JSON.stringify(entry.imgId)}).then(r=>/^data:image\\//.test(r.value)).catch(()=>false)`), "large generated artwork gets a stored thumbnail");
    assert.strictEqual(saved.profileImg, original.profileImg); assert.strictEqual(saved.banner, original.banner); assert.deepStrictEqual(saved.variants, original.variants); assert.deepStrictEqual(saved.gallery[0], original.gallery[0]);
    assert.deepStrictEqual(await run("(async()=>{const out={};for(const id of ['old-portrait','old-banner','old-gallery','variant-portrait'])out[id]=(await window.storage.get('img:'+id)).value;return out})()"), originalBytes, "original and variant pictures are never overwritten");
    const savedButton = await run(`(()=>{const b=${button("Saved to character gallery")};return !!b&&b.disabled})()`);
    assert(savedButton, "saved preview cannot be added again by an accidental second click");
    await closeStudio();

    await openStudio(); await input("#image-resolution", "max");
    assert.strictEqual(await run("document.querySelector('#image-resolution').value"), "max");
    await input("#image-provider", "xai");
    assert.strictEqual(await run("document.querySelector('#image-resolution').value"), "standard", "changing to xAI clears an unsupported OpenAI maximum resolution");
    assert(!(await run("[...document.querySelector('#image-resolution').options].some(o=>o.value==='max')")), "xAI does not offer a nonexistent 4K/max endpoint");
    await input("#image-resolution", "2k");
    const xaiModel = await run("document.querySelector('#image-model').value");
    await click("Use reference 1");
    const lastReference = await run("[...document.querySelectorAll('.image-studio button[aria-label^=\"Use reference \"]')].slice(-1)[0].getAttribute('aria-label')");
    await click(lastReference);
    assert.strictEqual(await run("document.querySelectorAll('.image-studio button[aria-pressed=true]').length"), 2);
    await input("#image-caption", "Reference output"); await input("#image-variant", "");
    await run("document.querySelector('.image-prompt-ideas').open=true");
    const chosenIdea = await run("[...document.querySelector('#image-prompt-preset').options].find(o=>o.value).value");
    await input("#image-prompt-preset", chosenIdea); await click("Use prompt");
    const referencePrompt = await run("document.querySelector('#image-prompt').value") + "\nMy own moonlit forest direction.";
    await preview(referencePrompt, true, async () => {
      await assertPromptIdeasDisabled("While a paid request is pending");
      await run("(async()=>{const rows=JSON.parse((await window.storage.get('chars:all')).value);rows[0].name='Concurrent rename';rows[0].story='Concurrent writing preserved';rows[0].gallery[0].caption='Concurrent original caption';await window.storage.set('chars:all',JSON.stringify(rows))})()");
    });
    await assertPromptIdeasDisabled("While a generated result is displayed");
    request = await run("window.__imageRequests[window.__imageRequests.length-1]");
    assert.strictEqual(request.provider, "xai"); assert.strictEqual(request.model, xaiModel);
    assert.strictEqual(request.prompt, referencePrompt, "An applied and edited reference idea reaches the provider verbatim only on explicit Generate");
    assert.strictEqual(request.resolution, "2k", "xAI's supported 2K choice reaches the native request");
    assert.strictEqual(request.references.length, 2, "only explicitly selected references are submitted");
    assert(request.references.includes(originalBytes["old-portrait"]), "selected original photo, not a blurred thumbnail, is used as the reference");
    assert(request.references.includes(originalBytes["variant-portrait"]), "variant-owned portraits are selectable references too");
    assert(!request.references.includes(originalBytes["old-gallery"]) && !request.references.includes(originalBytes["old-banner"]), "unselected originals are never sent");
    assert(!JSON.stringify(request).includes("PRIVATE_"), "reference generation does not send profile or creator text");
    await until("window.storage.get('chars:all').then(r=>JSON.parse(r.value)[0].gallery.length===3)", "save following a concurrent edit");
    saved = await readCharacter(); assert.strictEqual(saved.name, "Concurrent rename"); assert.strictEqual(saved.story, "Concurrent writing preserved"); assert.strictEqual(saved.gallery[0].caption, "Concurrent original caption"); assert.strictEqual(saved.gallery[2].variantId, "");
    await closeStudio();

    await openStudio();
    await run("window.__realImageCommit=window.storage.syncCommit;window.storage.syncCommit=async(values,expected)=>{const rows=JSON.parse((await window.storage.get('chars:all')).value);rows[0].name='Edit racing the atomic commit';await window.storage.set('chars:all',JSON.stringify(rows));return window.__realImageCommit(values,expected)};void 0");
    await preview("A retryable output.", false);
    await until("document.querySelector('.image-studio').textContent.includes('Library changed during sync')", "conditional commit rejects racing edit");
    saved = await readCharacter();
    assert.strictEqual(saved.name, "Edit racing the atomic commit", "conditional saving cannot overwrite an edit made after its read");
    assert.strictEqual(saved.gallery.length, 3, "failed conditional save does not attach a picture");
    await run("window.storage.syncCommit=window.__realImageCommit;void 0");
    await run("(async()=>{window.__beforeDeletedTarget=(await window.storage.get('chars:all')).value;await window.storage.set('chars:all','[]')})()");
    await click("Save to character gallery");
    await until("document.querySelector('.image-studio').textContent.includes('removed on another device')", "deleted target is refused");
    assert.deepStrictEqual(await readCharacters(), [], "a retained preview cannot resurrect a deleted character");
    await run("window.storage.set('chars:all',window.__beforeDeletedTarget)");
    await run("window.storage.syncCommit=async()=>{throw Error('Fixture disk full')};void 0");
    await click("Save to character gallery");
    await until("document.querySelector('.image-studio').textContent.includes('Fixture disk full')", "visible save failure");
    assert.strictEqual((await readCharacter()).gallery.length, 3, "failed persistence never attaches a fake saved image");
    await run("window.storage.syncCommit=window.__realImageCommit;void 0");
    await click("Save to character gallery");
    await until("window.storage.get('chars:all').then(r=>JSON.parse(r.value)[0].gallery.length===4)", "retry saving retained preview");
    await closeStudio();

    await openStudio(); await run("window.__imageMode='fail'"); await input("#image-prompt", "An intentionally unavailable provider.");
    await run(`window.__imageFailure=${JSON.stringify("Fixture provider unavailable (HTTP 400)\nInvalid size 2336x3504.\nCode: invalid_value\nParameter: size\nRequest ID: req_" + "a".repeat(60) + "\n<script>window.__unsafeImageError=true</script>")}`);
    await click(GENERATE);
    await until("document.querySelector('.image-studio').textContent.includes('Fixture provider unavailable')", "visible provider failure");
    assert(await run("(()=>{const e=document.querySelector('.image-studio [role=alert]');return e.textContent.includes('Parameter: size')&&e.textContent.includes('Request ID: req_')&&getComputedStyle(e).whiteSpace==='pre-wrap'&&e.scrollWidth<=e.clientWidth+1&&!e.querySelector('script')&&!window.__unsafeImageError})()"), "provider diagnostics wrap on phone/desktop and render as plain text");
    assert.strictEqual((await readCharacter()).gallery.length, 4, "failed generation cannot add an image");
    assert(!(await run(`!!(${button("Save to character gallery")})&&!(${button("Save to character gallery")}).disabled`)), "provider failure has no saveable result");
    await run("window.__imageMode='hold'"); await closeStudio();

    await openStudio(); await input("#image-prompt", "Cancel this generation.");
    let count = await run("window.__imageRequests.length"); await click(GENERATE);
    await until(`window.__imageRequests.length===${count + 1}`, "cancellable request");
    await click("Cancel generation"); await run("window.__finishImage()"); await wait(180);
    assert((await run("window.__imageCancelled.length")) > 0, "cancel reaches the privileged provider");
    assert(!(await run(`!!(${button("Save to character gallery")})&&!(${button("Save to character gallery")}).disabled`)), "a late cancelled response cannot become a saveable preview");
    await closeStudio();

    await openStudio(); await input("#image-count", "3"); await input("#image-prompt", "Three gallery pictures.");
    let baseline = (await readCharacter()).gallery.length;
    count = await run("window.__imageRequests.length"); await click("Generate 3 images and save to gallery");
    for (let n = 1; n <= 3; n++) {
      await until(`window.__imageRequests.length===${count + n}`, "sequential request " + n);
      assert.strictEqual((await readCharacter()).gallery.length, baseline + n - 1, "Previous image is durably attached before the next paid request");
      await run("window.__finishImage()");
    }
    await until("document.querySelector('.image-batch-status').textContent.includes('3 of 3 images saved to gallery. Complete.')", "complete batch");
    saved = await readCharacter(); assert.strictEqual(saved.gallery.length, baseline + 3);
    assert.strictEqual(new Set(saved.gallery.map(g => g.imgId)).size, saved.gallery.length, "All generated entries have unique identities");
    await closeStudio();

    await openStudio(); await input("#image-count", "3"); await input("#image-prompt", "Stop after a provider failure.");
    baseline = (await readCharacter()).gallery.length; count = await run("window.__imageRequests.length");
    await click("Generate 3 images and save to gallery"); await until(`window.__imageRequests.length===${count + 1}`, "first partial request");
    await run("window.__imageMode='fail';window.__finishImage()");
    await until("document.querySelector('.image-batch-status').textContent.includes('1 of 3 images saved to gallery. Stopped after an error')", "partial provider failure");
    assert.strictEqual((await readCharacter()).gallery.length, baseline + 1); assert.strictEqual(await run("window.__imageRequests.length"), count + 2);
    assert(await run(`!!(${button("Saved to character gallery")})`), "Successful previous preview stays saved when a later provider request fails");
    await run("window.__imageMode='hold'"); await closeStudio();

    await openStudio(); await input("#image-count", "3"); await input("#image-prompt", "Cancel during a gallery save.");
    baseline = (await readCharacter()).gallery.length; count = await run("window.__imageRequests.length");
    await run("window.__realImageCommit=window.storage.syncCommit;window.storage.syncCommit=(values,expected)=>new Promise((resolve,reject)=>{window.__finishGalleryCommit=()=>window.__realImageCommit(values,expected).then(resolve,reject)});void 0");
    await click("Generate 3 images and save to gallery"); await until(`window.__imageRequests.length===${count + 1}`, "request before paused save");
    await run("window.__finishImage()"); await until("typeof window.__finishGalleryCommit==='function'", "pending gallery save");
    await click("Cancel generation");
    assert(await run("document.querySelector('.image-studio').textContent.includes('Finishing the current gallery save')"), "Cancel does not misreport an in-flight durable save");
    await run("window.__finishGalleryCommit();window.storage.syncCommit=window.__realImageCommit;void 0");
    await until("document.querySelector('.image-batch-status').textContent.includes('1 of 3 images saved to gallery. Stopped')", "cancelled batch preserves current save");
    assert.strictEqual((await readCharacter()).gallery.length, baseline + 1); assert.strictEqual(await run("window.__imageRequests.length"), count + 1, "Cancellation during a save does not start another paid request");
    await closeStudio();

    await openStudio(); await input("#image-prompt", "Lock during generation.");
    baseline = (await readCharacter()).gallery.length;
    count = await run("window.__imageRequests.length"); await click(GENERATE);
    await until(`window.__imageRequests.length===${count + 1}`, "request before lock");
    const cancellations = await run("window.__imageCancelled.length");
    await run("window.dispatchEvent(new Event('rcv-locking'));window.__finishImage()");
    await until(`window.__imageCancelled.length>${cancellations}`, "cancel on vault lock"); await wait(180);
    assert.strictEqual((await readCharacter()).gallery.length, baseline, "a late response after lock never touches the gallery");
    assert(!(await run(`!!(${button("Save to character gallery")})&&!(${button("Save to character gallery")}).disabled`)), "locking clears any late image preview");
    await click("Grid", "body"); await run("document.querySelector('.image-grid-view [data-imgid=old-gallery]').click()"); await viewerChecks();
    assert(await run("!!document.querySelector('.image-grid-view')"), "Closing distraction-free viewer returns to the grid");
    if (phone) {
      await run("document.querySelector('.image-grid-view [data-imgid=old-gallery]').click()"); await click("Hide controls", ".lb-root");
      await run("window.__rcvAndroidBack()"); await until("!document.querySelector('.lb-root')", "Android Back closes the hidden-controls viewer only");
      assert(await run("!!document.querySelector('.image-grid-view')"));
    }
    console.log("PASS " + (phone ? "Android-sized" : "Windows-sized") + ": private sequential image batches, partial failures, auto-save/full-screen preview, distraction-free grid viewing, original artwork, concurrent edits, save retry, cancellation, lock and responsive bounds");
    win.destroy();
  }
  clearTimeout(timer); app.exit(0);
}).catch(error => { console.error(error.stack); console.error("Last probe: " + lastProbe); clearTimeout(timer); app.exit(1); });
