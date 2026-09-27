/* Responsive smoke test for the real private Chat workspace. */
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-chat-layout-"));
app.setPath("userData", tmp);
const preload = path.join(tmp, "phone.js");
fs.writeFileSync(preload, 'window.Capacitor={isNativePlatform:()=>true,Plugins:{}}');
let done = false;
const finish = (code, message) => { if (done) return; done = true; if (message) console.log(message); app.exit(code); };
setTimeout(() => finish(2, "  timed out"), 90000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 360, height: 780, webPreferences: { preload, contextIsolation: false } });
  win.focus();
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await new Promise(r => setTimeout(r, 1800));
  if (!await win.webContents.executeJavaScript("!!document.querySelector('[data-chat-library-setup]')")) throw new Error("A fresh Android Chat library must explain the separate storage and import path");
  await win.webContents.executeJavaScript(`(async()=>{
    await storage.set("chars:all",JSON.stringify([{id:"c",name:"Ari",story:"A careful wanderer.",personality:"Quiet but curious.",firstMessage:"The lantern flares to life.",sections:[],variants:[],lorebooks:[],gallery:[],createdAt:1,updatedAt:1}]));
    await storage.set("personas:all","[]");await storage.set("lore:all","[]");await storage.set("prompts:all","[]");await storage.set("ui:onboarded","1");
  })()`);
  await win.webContents.reload();
  await new Promise(r => setTimeout(r, 2200));
  const result = await win.webContents.executeJavaScript(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const bounds=e=>{const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}};
    const overflow=()=>Math.max(document.documentElement.scrollWidth-window.innerWidth,document.body.scrollWidth-window.innerWidth);
    const launcher=document.querySelector("#rcv-mobile-chat .rcchat-launch"), nav=document.querySelector(".sidebar");
    const viewport={w:document.documentElement.clientWidth,h:document.documentElement.clientHeight};
    const before={launcher:bounds(launcher),label:launcher.textContent.trim().replace(/^✦\\s*/,''),inNavigation:!!launcher.closest('.sidebar')&&!!launcher.closest('#rcv-mobile-chat'),nav:nav?bounds(nav):null,overflow:overflow()};
    launcher.click();await wait(400);
    const modal=document.querySelector(".rcchat-modal");
    if (!modal) throw new Error("The guided cast dialog did not open: " + document.querySelector('#rcv-chat-root').textContent + ' / ' + document.querySelector('.rcchat-launch')?.title);
    viewport.w=document.documentElement.clientWidth;viewport.h=document.documentElement.clientHeight;
    const open={shell:bounds(document.querySelector(".rcchat-shell")),modal:bounds(modal),overflow:overflow()};
    modal.querySelector('.rcchat-cast').click();await wait(50);
    for(let step=0;step<2;step++){[...modal.querySelectorAll('button')].find(b=>b.textContent==='Continue').click();await wait(50);}
    [...modal.querySelectorAll("button")].find(b=>/Create roleplay/.test(b.textContent)).click();await wait(300);
    const composer=document.querySelector(".rcchat-compose"), head=document.querySelector(".rcchat-head");
    const controls=[...document.querySelectorAll(".rcchat-shell button")].filter(b=>{const s=getComputedStyle(b),r=b.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&r.width&&r.height&&r.right>0&&r.left<viewport.w&&r.bottom>0&&r.top<viewport.h;}).map(bounds);
    return {viewport,before,open,workspace:{composer:bounds(composer),head:bounds(head),overflow:overflow(),controls}};
  })()`);
  let bad = 0;
  const check = (name, ok, detail) => { if (!ok) bad++; console.log("  " + (ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  " + detail : "")); };
  check("the Chat tab fits Android navigation", !!result.before.nav && result.before.launcher.t >= result.before.nav.t - 1 && result.before.launcher.b <= result.before.nav.b + 1, Math.round(result.before.launcher.t) + "-" + Math.round(result.before.launcher.b));
  check("Android keeps Chat as a normal tab", result.before.inNavigation && result.before.label === "Chat");
  check("the closed app has no sideways overflow", result.before.overflow <= 1);
  check("the Chat shell fills the phone viewport", Math.abs(result.open.shell.w - result.viewport.w) <= 1 && Math.abs(result.open.shell.l) <= 1, Math.round(result.open.shell.l) + "/" + Math.round(result.open.shell.w) + " in " + result.viewport.w);
  check("the cast dialog fits the phone", result.open.modal.l >= 0 && result.open.modal.r <= result.viewport.w && result.open.modal.b <= result.viewport.h);
  check("the open Chat workspace has no sideways overflow", result.workspace.overflow <= 1, result.workspace.overflow + "px");
  check("the composer remains fully reachable", result.workspace.composer.b <= result.viewport.h + 1 && result.workspace.composer.t < result.workspace.composer.b, Math.round(result.workspace.composer.t) + "-" + Math.round(result.workspace.composer.b) + " in " + result.viewport.h);
  check("the header remains fully reachable", result.workspace.head.l >= 0 && result.workspace.head.r <= result.viewport.w);
  check("visible phone Chat buttons meet the 48px target", result.workspace.controls.every(r => r.w >= 48 && r.h >= 48), "smallest " + Math.round(Math.min(...result.workspace.controls.map(r => Math.min(r.w,r.h)))) + "px");
  finish(bad ? 1 : 0, bad ? "Chat does not fit every phone control." : "Private Chat fits the Android phone viewport.");
}).catch(error => finish(1, error.stack || String(error)));
