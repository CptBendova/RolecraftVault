/* Real shipped UI: Chat is a fifth navigation destination on desktop and
   Android, while Prompt Vault lives on Dashboard. Disposable profile. */
const { app, BrowserWindow } = require("electron");
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const root = path.join(__dirname, ".."), site = path.join(root, "web"), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-chat-launcher-"));
const version = fs.readFileSync(path.join(site, "js/rolecraft-app.web.js"), "utf8").match(/const APP_VERSION = "([^"]+)"/)[1];
app.setPath("userData", path.join(tmp, "profile"));
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.on("window-all-closed", () => {});
const preload = path.join(tmp, "launcher-fixture.js");
fs.writeFileSync(preload, `
const nativeWidth=Number((process.argv.find(x=>x.startsWith('--launcher-native-width='))||'').split('=')[1]);
if(nativeWidth){window.Capacitor={isNativePlatform:()=>true};Object.defineProperty(window.screen,'width',{value:nativeWidth});Object.defineProperty(window.screen,'height',{value:1100});}
window.__launcherRequests=[];window.openRouter={status:async()=>({configured:true}),models:async()=>({ok:true,models:[]}),onEvent:()=>()=>{},start:async request=>{window.__launcherRequests.push(request);return{ok:false,error:'No provider calls belong in this launcher test'}},cancel:async()=>({ok:true})};
// Hold the real auth status during one startup, rather than rewriting DOM flags.
let auth;window.__launcherAuthWaiters=[];
Object.defineProperty(window,'auth',{configurable:true,get:()=>auth,set:value=>{auth=value;const original=value.status.bind(value);value.status=function(){if(location.search.includes('holdAuth=1')&&!window.__launcherAuthReleased)return new Promise(resolve=>window.__launcherAuthWaiters.push(()=>original().then(resolve)));return original();};}});
window.__releaseLauncherAuth=()=>{window.__launcherAuthReleased=true;window.__launcherAuthWaiters.splice(0).forEach(release=>release());};
// Capture the actual main-vault subscriber, so a fixture status updates both
// its React overlay/slot state and the event consumed by the Chat workspace.
let vaultSync;
Object.defineProperty(window,'RolecraftVaultSync',{configurable:true,get:()=>vaultSync,set:value=>{vaultSync=value;const original=value.create;value.create=function(options){const engine=original(options),subscribe=engine.subscribe.bind(engine);engine.subscribe=function(fn){if(!window.__launcherSyncStatus)window.__launcherSyncStatus=fn;const off=subscribe(fn);return()=>{off();if(window.__launcherSyncStatus===fn)delete window.__launcherSyncStatus;};};return engine;};}});
`);
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZQAAAABJRU5ErkJggg==";
const character = { id: "launcher-character", name: "Launcher Character", story: "A careful traveller.", personality: "Patient.", firstMessage: "Welcome to the story.", profileImg: "launcher-picture", sections: [], variants: [], gallery: [], tags: [], lorebooks: [], createdAt: 2, updatedAt: 2 };
const persona = { id: "launcher-persona", name: "Launcher Persona", description: "A visiting writer.", sections: [], gallery: [], createdAt: 1, updatedAt: 1 };
let win, lastProbe = "startup";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = script => { lastProbe = script; return win.webContents.executeJavaScript(script); };
async function until(script, label = script) {
  const end = Date.now() + 12000;
  while (Date.now() < end) { if (await run(script)) return; await wait(50); }
  throw Error("Timed out: " + label);
}
async function click(label, scope = "body") {
  await run(`(()=>{const e=[...document.querySelector(${JSON.stringify(scope)}).querySelectorAll('button,summary')].find(e=>(e.getAttribute('aria-label')||e.textContent).trim().replace(/^✦\\s*/,'')===${JSON.stringify(label)}&&e.getClientRects().length);if(!e||e.disabled)throw Error('Missing enabled visible '+${JSON.stringify(label)});e.click()})()`);
  await wait(70);
}
async function reload(query) { await win.loadFile(path.join(site, "index.html"), query ? { query } : undefined); }
async function absent(label) {
  await until("!document.querySelector('.rcchat-launch')", label + " hides Chat");
  assert.equal(await run("document.querySelectorAll('.rcchat-launch').length"), 0, label + " must not leave a floating or hidden duplicate");
}
async function launcher(native, retry = false) {
  const slot = native ? "rcv-mobile-chat" : "rcv-sidebar-chat", placement = native ? "mobile" : "sidebar";
  await until(`document.querySelectorAll('.rcchat-launch').length===1&&!!document.querySelector('#${slot} .rcchat-launch')`, placement + " launcher");
  const geometry = await run(`(()=>{const b=document.querySelector('.rcchat-launch'),slot=document.getElementById(${JSON.stringify(slot)}),r=b.getBoundingClientRect(),p=slot.getBoundingClientRect(),s=getComputedStyle(b),root=document.querySelector('.rcv'),lore=document.querySelector('.primary-nav[data-nav-id=lorebooks]'),prompt=document.querySelector('.primary-nav[data-nav-id=prompts]'),bar=document.querySelector('.sidebar');return{count:document.querySelectorAll('.rcchat-launch').length,label:(b.getAttribute('aria-label')||b.textContent).trim().replace(/^✦\\s*/,''),className:b.className,position:s.position,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,slotLeft:p.left,slotRight:p.right,windowWidth:innerWidth,rootOverflow:root.scrollWidth-root.clientWidth,allowed:root.getAttribute('data-rcv-chat-launch'),sidebar:!!b.closest('.sidebar'),afterLore:!!lore&&!!(lore.compareDocumentPosition(slot)&Node.DOCUMENT_POSITION_FOLLOWING),loreBottom:lore&&lore.getBoundingClientRect().bottom,loreHeight:lore&&lore.getBoundingClientRect().height,navCount:document.querySelectorAll('.primary-nav').length,promptTab:!!prompt,barBottom:bar.getBoundingClientRect().bottom,barTop:bar.getBoundingClientRect().top}})()`);
  assert.equal(geometry.count, 1);
  assert.equal(geometry.allowed, placement, JSON.stringify(geometry));
  assert(!["fixed", "absolute", "sticky"].includes(geometry.position), "Chat is a normal layout control: " + JSON.stringify(geometry));
  assert(geometry.left >= -1 && geometry.right <= geometry.windowWidth + 1 && geometry.width > 0 && geometry.rootOverflow <= 1, "Launcher fits viewport: " + JSON.stringify(geometry));
  assert(geometry.left >= geometry.slotLeft - 1 && geometry.right <= geometry.slotRight + 1, "Launcher stays inside its slot");
  assert(geometry.height >= (native && geometry.windowWidth <= 760 ? 48 : geometry.loreHeight - 1), "Launcher keeps the existing responsive button target: " + JSON.stringify(geometry));
  if (retry) assert.equal(geometry.label, "Chat unavailable. Tap for details and retry.", "Failed Chat offers an accessible reason and retry");
  else { assert.equal(geometry.label, "Chat"); assert(/\bnavitem\b/.test(geometry.className), "Launcher uses its normal navigation button style"); }
  assert(geometry.sidebar && geometry.afterLore && !geometry.promptTab && geometry.navCount === 5, "Chat is the fifth navigation destination after Lorebooks: " + JSON.stringify(geometry));
  if (native) assert(geometry.top >= geometry.barTop - 1 && geometry.bottom <= geometry.barBottom + 1, "Android Chat fits its navigation area: " + JSON.stringify(geometry));
  else assert(geometry.top >= geometry.loreBottom - 1, "Desktop Chat follows Lorebooks: " + JSON.stringify(geometry));
  return geometry;
}
async function navigate(id) {
  await run(`(()=>{const b=document.querySelector('.primary-nav[data-nav-id=${id}]');if(!b)throw Error('Missing navigation ${id}');b.click()})()`);
  await until(`!!document.querySelector('.primary-nav.active[data-nav-id=${id}]')`);
}
async function closeLayer() {
  if (await run("!!document.querySelector('[role=dialog][aria-label=Settings]')")) await click("Close", '[role=dialog][aria-label=Settings]');
  else await run("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  await until("!document.querySelector('.modal-back,.scrollbody.sheet')");
}
async function seed() {
  await run(`(async()=>{await storage.set('ui:onboarded','1');await storage.set('ui:lastseenversion',${JSON.stringify(version)});await storage.set('chars:all',JSON.stringify([${JSON.stringify(character)}]));await storage.set('personas:all',JSON.stringify([${JSON.stringify(persona)}]));await storage.set('lore:all',JSON.stringify([{id:'launcher-lore',world:'Fixture world',title:'Fixture lore',content:'Local lore.',createdAt:1,updatedAt:1}]));await storage.set('prompts:all',JSON.stringify([{id:'launcher-prompt',collection:'Fixture prompts',title:'Fixture prompt',content:'Local prompt.',createdAt:1,updatedAt:1}]));await storage.set('img:launcher-picture',${JSON.stringify(pixel)});await storage.set('th:launcher-picture',${JSON.stringify(pixel)});await storage.set('chats:all','[]');})()`);
}
const timeout = setTimeout(() => { console.error("Chat launcher UI timeout; last probe: " + lastProbe); app.exit(1); }, 150000);
app.whenReady().then(async () => {
  for (const spec of [{ width: 360, native: true }, { width: 800, native: true }, { width: 1440, native: false }]) {
    const { width, native } = spec;
    win = new BrowserWindow({ show: true, width, height: 900, useContentSize: true, webPreferences: { preload, contextIsolation: false, sandbox: false, backgroundThrottling: false, additionalArguments: native ? ["--launcher-native-width=" + width] : [] } });
    win.setContentSize(width, 900); win.focus();
    // Exercise the actual loading branch before any data or Chat UI mounts.
    await reload({ holdAuth: "1" });
    await until("!!document.querySelector('.rcv[data-rcv-state=loading]')");
    await absent(width + "px loading screen");
    await run("window.__releaseLauncherAuth()");
    await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
    await seed(); await reload();
    await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
    await launcher(native);
    await until("!!document.querySelector('[data-dashboard-section=recent]')", "complete Dashboard layout");
    assert.equal(await run("[...document.querySelectorAll('.dashboard-header button')].some(b=>b.textContent.includes('Prompt Vault'))"), true, "Dashboard exposes Prompt Vault");
    if (process.env.RCV_CAPTURE_CHAT && width !== 800) {
      const dir = path.join(root, "dist", "maintenance"); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "chat-launcher-" + (native ? "phone" : "desktop") + ".png"), (await win.webContents.capturePage()).toPNG());
    }
    await click("Chat");
    await until("!!document.querySelector('.rcchat-modal .rcchat-cast')", "first-use cast chooser");
    await absent("open Chat workspace");
    await run("document.querySelector('.rcchat-modal .rcchat-cast').click()");
    await click("Continue", ".rcchat-modal"); await click("Continue", ".rcchat-modal");
    await click("Create roleplay", ".rcchat-modal");
    await until("!!document.querySelector('.rcchat-compose')");
    assert.equal(await run("window.__launcherRequests.length"), 0, "First-use Chat setup never sends a paid request");
    if (width <= 760) { await click("Chat options", "#rcv-chat-root"); await click("Return to vault", "#rcv-chat-root"); }
    else await click("Close chat", "#rcv-chat-root");
    await until("!document.querySelector('.rcchat-shell')"); await launcher(native);
    for (const id of ["characters", "personas", "lorebooks"]) {
      await navigate(id);
      await launcher(native);
    }
    await navigate("dashboard"); await launcher(native);
    await click("Prompt Vault", ".dashboard-header");
    await until("!!document.querySelector('.scrollbody') && document.querySelector('.scrollbody').textContent.includes('Prompt Vault')", "Prompt Vault dashboard shortcut");
    await launcher(native);
    await navigate("dashboard");
    await click("Settings"); await until("!!document.querySelector('.modal-back')"); await absent("Settings overlay");
    await click("Guide", ".modal-back"); await until("!!document.querySelector('[role=dialog][aria-label=Guide]')"); await absent("Guide overlay");
    await closeLayer(); await launcher(native);
    // Reading a record from Dashboard must suppress its launcher as well.
    await click("Open character", ".dashboard-spotlight"); await until("!!document.querySelector('.scrollbody.sheet')"); await absent("Dashboard character sheet");
    await closeLayer(); await launcher(native);
    await run("(()=>{const toggle=document.querySelector('[data-dashboard-collapse=recent]');if(toggle&&toggle.getAttribute('aria-expanded')==='false')toggle.click()})()");
    await run("(()=>{const card=[...document.querySelectorAll('[data-dashboard-section=recent] .card')].find(e=>e.textContent.includes('Launcher Persona'));if(!card)throw Error('Missing recent persona');card.click()})()");
    await until("!!document.querySelector('.scrollbody.sheet')"); await absent("Dashboard persona sheet");
    await closeLayer(); await launcher(native);
    if (!native) {
      await click("Stats", ".sidebar"); await until("!!document.querySelector('.modal-back [role=dialog]')"); await absent("desktop Stats overlay");
      await click("Close", ".modal-back"); await until("!document.querySelector('.modal-back')"); await launcher(false);
    }
    await run("(()=>{const staleButton=document.querySelector('.rcchat-launch');window.__launcherSyncStatus({phase:'applying',settings:{enabled:false}});staleButton.click()})()");
    await absent("device sync applying");
    assert.equal(await run("!!document.querySelector('.rcchat-shell,.rcchat-modal')"), false, "A retained launcher cannot open Chat in the same turn that sync starts applying");
    assert.equal(await run("window.__launcherRequests.length"), 0, "A stale sync-time click never starts a provider request");
    await run("window.__launcherSyncStatus({phase:'synced',settings:{enabled:false}})");
    await launcher(native);
    // A corrupt Chat list must not fall back to an everywhere-floating retry.
    const savedChats = await run("storage.get('chats:all').then(r=>r.value)");
    await run("storage.set('chats:all','{not valid JSON')"); await reload();
    await until("!!document.querySelector('.rcv[data-rcv-state=ready]')"); await launcher(native, true);
    await navigate("characters");
    await launcher(native, true);
    await navigate("dashboard"); await launcher(native, true);
    await click("Settings"); await until("!!document.querySelector('[role=dialog][aria-label=Settings]')"); await absent("retry under Settings"); await closeLayer(); await launcher(native, true);
    await run("window.__launcherSyncStatus({phase:'applying',settings:{enabled:false}})");
    await absent("retry during device sync applying");
    await run("window.__launcherSyncStatus({phase:'synced',settings:{enabled:false}})");
    await launcher(native, true);
    await run(`storage.set('chats:all',${JSON.stringify(savedChats)})`);
    await click("Chat unavailable. Tap for details and retry.");
    await until("!!document.querySelector('[role=dialog][aria-label=\"Chat could not open\"]')", "Chat read failure explains itself");
    assert.match(await run("document.querySelector('[role=dialog][aria-label=\"Chat could not open\"]').textContent"), /read failed without changing your saved Chat/);
    await click("Retry opening Chat", '[role=dialog][aria-label="Chat could not open"]');
    await until("!!document.querySelector('.rcchat-shell')", "Retry opens Chat, not just the Chat navigation button");
    await absent("retry opened Chat workspace");
    assert.equal(await run("window.__launcherRequests.length"), 0, "Local retry never sends a provider request");
    if (width <= 760) { await click("Chat options", "#rcv-chat-root"); await click("Return to vault", "#rcv-chat-root"); }
    else await click("Close chat", "#rcv-chat-root");
    await until("!document.querySelector('.rcchat-shell')"); await launcher(native);
    // Vault failure is distinct from Chat-only failure: it exposes no launcher.
    await run("storage.set('chars:all','{not valid JSON')"); await reload();
    await until("!!document.querySelector('.rcv[data-rcv-state=error]')"); await absent("vault error screen");
    await run(`storage.set('chars:all',JSON.stringify([${JSON.stringify(character)}]))`); await reload();
    await until("!!document.querySelector('.rcv[data-rcv-state=ready]')"); await launcher(native);
    if (!native) {
      win.setContentSize(800, 900);
      await until("innerWidth===800"); await launcher(false);
      for (const id of ["characters", "personas", "lorebooks", "dashboard"]) { await navigate(id); await launcher(false); }
      assert.equal(await run("document.querySelector('.rcchat-launch').getAttribute('aria-label')"), "Chat", "Compact sidebar keeps its accessible icon label");
      win.setContentSize(1440, 900); await until("innerWidth===1440"); await launcher(false);
      console.log("PASS: compact 800px desktop sidebar geometry and accessible navigation");
    }
    console.log("PASS: " + width + "px " + (native ? "Android navigation" : "desktop sidebar") + " Chat placement, flow, navigation, overlays, first-use, retry and non-ready gates");
    if (width === 1440) {
      assert((await run("auth.setPassword('launcher-fixture-password-only')")).ok, "Disposable test password is configured");
      await reload(); await until("!!document.querySelector('.rcv[data-rcv-state=locked]')"); await absent("real password-locked vault");
      console.log("PASS: locked vault exposes neither Chat nor retry");
    }
    win.destroy();
  }
  clearTimeout(timeout); app.exit(0);
}).catch(error => { console.error(error.stack || error); console.error("Last probe: " + lastProbe); clearTimeout(timeout); app.exit(1); });
