// Actual standalone React account panel, offline native fixture and disposable profile.
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert"), { pathToFileURL } = require("url");
const root = path.join(__dirname, ".."), temp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-balances-ui-"));
app.setPath("userData", temp); app.commandLine.appendSwitch("force-device-scale-factor", "1");
const html = path.join(temp, "test.html");
fs.writeFileSync(html, `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#121a30;color:#e7ebf7;font-family:Arial;--line:rgba(150,166,214,.14);--panel:#121a30;--dim:#8088a2}#root{margin:12px;max-width:600px}</style><div id="root"></div>
<script src="${pathToFileURL(path.join(root, "app/vendor/react.production.min.js"))}"></script><script src="${pathToFileURL(path.join(root, "app/vendor/react-dom.production.min.js"))}"></script>
<script>window.requests=[];window.cancels=[];window.opened=[];window.providerBalances={status:async()=>({ok:true,configured:{openrouter:true}}),setUnlocked:async()=>({ok:true}),refresh:async options=>{window.requests.push(options);return new Promise(resolve=>window.complete=resolve)},cancel:async options=>{window.cancels.push(options);return{ok:true}},openDashboard:async options=>{window.opened.push(options);return{ok:true}}};</script>
<script src="${pathToFileURL(path.join(root, "app/provider-balances-ui.js"))}"></script><script>window.renderRoot=ReactDOM.createRoot(document.getElementById('root'));window.mount=props=>renderRoot.render(React.createElement(RolecraftProviderBalances,props));mount({});</script>`);
let win;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = value => win.webContents.executeJavaScript(value);
async function click(text) { await run(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Missing or disabled '+${JSON.stringify(text)});b.click()})()`); await wait(60); }
const timer = setTimeout(() => { console.error("Balance UI timeout"); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1000, height: 850, show: true, webPreferences: { contextIsolation: false, nodeIntegration: false, backgroundThrottling: false } });
  await win.loadFile(html); win.focus(); await wait(100);
  assert.equal(await run("requests.length"), 0, "no automatic provider calls");
  assert.equal(await run("document.querySelectorAll('[data-provider]').length"), 3);
  assert((await run("document.body.textContent")).includes("Account credit balance: view in provider billing"));
  for (const width of [1000, 360]) {
    win.setContentSize(width, 850); await wait(100);
    const layout = await run(`(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('button')].map(b=>({left:b.getBoundingClientRect().left,right:b.getBoundingClientRect().right,width:b.getBoundingClientRect().width,overflow:b.scrollWidth>b.clientWidth+1}))}))()`);
    assert(layout.scroll <= layout.width, "no horizontal page overflow at " + width);
    assert(layout.buttons.every(b => b.left >= 0 && b.right <= width && b.width > 0 && !b.overflow), "visible whole buttons at " + width);
    assert(await run("[...document.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=48&&r.height>=48})"), "billing actions retain accessible touch targets at " + width);
    if (process.env.RCV_CAPTURE_BALANCES) {
      const out = path.join(root, "dist", "maintenance"); fs.mkdirSync(out, { recursive: true }); win.focus(); await wait(100);
      fs.writeFileSync(path.join(out, "provider-balances-" + width + ".png"), (await win.webContents.capturePage()).toPNG());
    }
  }
  await click("Open OpenAI billing"); await click("Open xAI billing"); assert.deepEqual(await run("opened.map(x=>x.provider)"), ["openai", "xai"]);
  await click("Refresh allowance"); assert.equal(await run("requests.length"), 1);
  await run("complete({ok:true,provider:'openrouter',status:'key_allowance',accountBalance:null,limit:100,remaining:0,usage:123.4567,limitReset:'monthly',checkedAt:Date.now()})"); await wait(80);
  let text = await run("document.body.textContent"); assert(text.includes("Key allowance remaining: $0.00 USD")); assert(text.includes("Key usage (all time): $123.4567 USD")); assert(text.includes("not your account credit balance"));
  await click("Refresh allowance"); await run("complete({ok:true,limit:null,remaining:null,usage:2,checkedAt:Date.now()})"); await wait(80);
  text = await run("document.body.textContent"); assert(text.includes("no cap set")); assert(!text.includes("$0.00 USD"), "null allowance is never fake zero");
  await click("Refresh allowance"); await run("complete({ok:false,error:'Permission denied by fixture provider'})"); await wait(80); assert((await run("document.querySelector('[role=alert]').textContent")).includes("Permission denied")); assert(!(await run("document.body.textContent")).includes("Key usage (all time)"), "failed refresh clears stale amount");
  await click("Refresh allowance"); await click("Cancel"); await run("complete({ok:true,limit:99,remaining:99,usage:0,checkedAt:Date.now()})"); await wait(80); assert(!(await run("document.body.textContent")).includes("$99"));
  await click("Refresh allowance"); await run("window.dispatchEvent(new Event('rcv-locking'));complete({ok:true,limit:88,remaining:88,usage:0,checkedAt:Date.now()})"); await wait(80); assert(!(await run("document.body.textContent")).includes("$88"));
  await click("Refresh allowance"); await run("mount({disabled:true})"); await wait(80); await run("complete({ok:true,limit:77,remaining:77,usage:0,checkedAt:Date.now()})"); await wait(80); assert(!(await run("document.body.textContent")).includes("$77")); assert(await run("[...document.querySelectorAll('button')].every(b=>b.disabled)"));
  await run("mount({providers:['openai']})"); await wait(80); assert.equal(await run("document.querySelectorAll('[data-provider]').length"), 1); assert.equal(await run("document.querySelector('[data-provider]').dataset.provider"), "openai");
  await run("mount({providers:['openrouter']})"); await wait(80); await click("Refresh allowance"); const count = await run("cancels.length"); await run("renderRoot.unmount()"); await wait(80); assert.equal(await run("cancels.length"), count + 1);
  // Android bridge uses Capacitor's actual nativePromise contract.
  const bridge = await run("(()=>{delete window.providerBalances;let seen=[];window.Capacitor={nativePromise:(...args)=>{seen.push(args);return Promise.resolve({ok:true})}};let b=rolecraftProviderBalancesBridge();b.refresh({provider:'openrouter',requestId:'fixture'});b.openDashboard({provider:'xai'});b.setUnlocked({unlocked:false});return seen})()");
  assert.deepEqual(bridge, [["ProviderBalances", "refresh", { provider: "openrouter", requestId: "fixture" }], ["ProviderBalances", "openDashboard", { provider: "xai" }], ["ProviderBalances", "setUnlocked", { unlocked: false }]]);
  const appSource = fs.readFileSync(path.join(root, "app/app.js"), "utf8"); assert(appSource.includes("rolecraftProviderBalancesBridge") && appSource.includes('"rcv-locking"'));
  assert(fs.readFileSync(path.join(root, "app/chat.js"), "utf8").includes("RolecraftProviderBalances"));
  console.log("PASS balance React UI at desktop/360px: no automatic queries, whole buttons, real zero vs missing/unlimited, explicit provider billing, refresh errors, cancel/lock/disabled/unmount stale-result guards, Android bridge and root mounts");
  clearTimeout(timer); win.destroy(); app.exit(0);
}).catch(error => { clearTimeout(timer); console.error(error); if (win) win.destroy(); app.exit(1); });
