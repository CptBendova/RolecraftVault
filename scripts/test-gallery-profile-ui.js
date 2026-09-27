// Real shipped gallery + persistence, with disposable storage and no provider calls.
const { app, BrowserWindow } = require("electron");
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const root = path.join(__dirname, ".."), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-gallery-profile-"));
app.setPath("userData", tmp); app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.on("window-all-closed", () => {});
const preload = path.join(tmp, "phone.js");
fs.writeFileSync(preload, "if(process.argv.includes('--profile-phone')){window.Capacitor={isNativePlatform:()=>true};Object.defineProperty(screen,'width',{value:360});Object.defineProperty(screen,'height',{value:800});}");
let win, probe = "startup";
const wait = ms => new Promise(r => setTimeout(r, ms));
const run = s => { probe = s; return win.webContents.executeJavaScript(s); };
async function until(s) { for (let i = 0; i < 200; i++) { if (await run(s)) return; await wait(50); } throw Error("Timed out: " + s); }
async function click(label) {
  await until(`[...document.querySelectorAll('button')].some(e=>(e.getAttribute('aria-label')||e.textContent).trim()===${JSON.stringify(label)}&&e.getClientRects().length&&!e.disabled)`);
  await run(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||e.textContent).trim()===${JSON.stringify(label)}&&e.getClientRects().length);if(!b||b.disabled)throw Error('Missing enabled button '+${JSON.stringify(label)});b.click()})()`); await wait(80);
}
async function tick(id) { await run(`document.querySelector('.image-grid-view [data-imgid="${id}"] .gridsel').click()`); await wait(80); }
async function reload() { await win.loadFile(path.join(root, "web/index.html")); await until("!!document.querySelector('.rcv[data-rcv-state=ready]')"); }
async function openCharacter() { await click("Characters"); await until("!!document.querySelector('.char-card')"); await run("document.querySelector('.char-card').click()"); await click("Grid"); }
const rows = key => run(`window.storage.get('${key}:all').then(r=>JSON.parse(r.value))`);
const timeout = setTimeout(() => { console.error("Gallery profile timeout: " + probe); app.exit(1); }, 120000);
app.whenReady().then(async () => {
  for (const phone of [true, false]) {
    win = new BrowserWindow({ show: true, width: phone ? 360 : 1280, height: 800, webPreferences: { preload, additionalArguments: phone ? ["--profile-phone"] : [], contextIsolation: false, sandbox: false, backgroundThrottling: false } });
    win.setContentSize(phone ? 360 : 1280, 800); win.focus(); await reload();
    await run(`(async()=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d');
      for(const [id,color]of [['old','#cc6655'],['new','#4477aa'],['variant','#44aa77']]){ctx.fillStyle=color;ctx.fillRect(0,0,32,32);for(const p of ['img:','th:'])await window.storage.set(p+id,canvas.toDataURL());}
      await window.storage.set('ui:onboarded','1');
      await window.storage.set('chars:all',JSON.stringify([{id:'c',name:'Ari',profileImg:'old',chatPortraitCrop:{zoom:2},tags:[],sections:[],variants:[],gallery:[{imgId:'new',caption:'New portrait',variantId:'__default__'}]}]));
      await window.storage.set('personas:all',JSON.stringify([{id:'p',name:'Robin',avatar:'old',tags:[],sections:[],gallery:[{imgId:'new',caption:'New persona portrait'}]}]));
      for(const k of ['lore:all','prompts:all','chats:all'])await window.storage.set(k,'[]');
    })()`);
    await reload(); await openCharacter();
    assert(await run("!!document.querySelector('.image-grid-profile-row')"), "No-variant character has profile controls");
    assert(await run("document.querySelector('.image-grid-profile-row button').disabled"), "No selection cannot change a portrait");
    await tick("new"); await tick("old");
    assert(await run("document.querySelector('.image-grid-profile-row button').disabled"), "Multiple pictures cannot become one portrait");
    await tick("old"); await click("Set as profile picture");
    await until("window.storage.get('chars:all').then(r=>JSON.parse(r.value)[0].profileImg==='new')");
    let char = (await rows("chars"))[0];
    assert.equal(char.chatPortraitCrop, null); assert(char.gallery.some(g => g.imgId === "old"), "Previous portrait remains in the gallery");
    assert.equal(char.gallery.find(g => g.imgId === "new").caption, "New portrait");
    assert(await run("(()=>{const row=document.querySelector('.image-grid-profile-row'),r=row.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&row.scrollWidth<=row.clientWidth+1})()"), "Profile controls fit phone and desktop");
    await click("Close image grid"); await reload(); await openCharacter();
    assert.equal((await rows("chars"))[0].profileImg, "new", "Profile survives reopening");
    await run("(async()=>{const rows=JSON.parse((await window.storage.get('chars:all')).value);rows[0].variants=[{id:'v',name:'Evening',profileImg:'variant',chatPortraitCrop:{zoom:3}}];await window.storage.set('chars:all',JSON.stringify(rows))})()");
    await reload(); await openCharacter(); await tick("new");
    await run("(()=>{const e=document.querySelector('select[aria-label=\"Set selected picture as profile for\"]');e.value='v';e.dispatchEvent(new Event('change',{bubbles:true}))})()");
    await until("window.storage.get('chars:all').then(r=>JSON.parse(r.value)[0].variants[0].profileImg==='new')");
    char = (await rows("chars"))[0]; assert.equal(char.profileImg, "new"); assert.equal(char.variants[0].chatPortraitCrop, null);
    assert(char.gallery.some(g => g.imgId === "variant" && g.variantId === "v"), "Replaced variant portrait is preserved");
    await run("document.querySelector('.image-grid-view [data-imgid=old]').click()"); await click("Set as profile");
    await until("window.storage.get('chars:all').then(r=>JSON.parse(r.value)[0].profileImg==='old')");
    assert.equal((await rows("chars"))[0].variants[0].profileImg, "new", "Default-only viewer action cannot overwrite a variant");
    await reload(); await click("Personas"); await until("!!document.querySelector('.char-card')");
    await run("document.querySelector('.char-card').click()"); await click("Grid"); await tick("new"); await click("Set as profile picture");
    await until("window.storage.get('personas:all').then(r=>JSON.parse(r.value)[0].avatar==='new')");
    assert((await rows("personas"))[0].gallery.some(g => g.imgId === "old"), "Persona's previous portrait stays reachable");
    for (const id of ["old", "new", "variant"]) assert(await run(`window.storage.get('img:${id}').then(r=>!!r.value)`), "Original bytes retained: " + id);
    console.log("PASS " + (phone ? "360px Android" : "1280px Windows") + ": gallery profile actions, selection guards, Default and variants, personas, framing, originals and persistence");
    win.destroy();
  }
  clearTimeout(timeout); app.exit(0);
}).catch(error => { console.error(error.stack); console.error("Probe: " + probe); clearTimeout(timeout); app.exit(1); });
