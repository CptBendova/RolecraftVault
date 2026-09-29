// Real image decoding/canvas/export UI with disposable storage and intercepted file saves.
const { app, BrowserWindow } = require("electron");
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const root = path.join(__dirname, ".."), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-photo-info-"));
app.setPath("userData", tmp); app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.on("window-all-closed", () => {});
const preload = path.join(tmp, "phone.js");
fs.writeFileSync(preload, "if(process.argv.includes('--photo-phone')){window.Capacitor={isNativePlatform:()=>true};Object.defineProperty(screen,'width',{value:360});Object.defineProperty(screen,'height',{value:800});}");
const src = fs.readFileSync(path.join(root, "app/app.js"), "utf8");
const helpers = src.slice(src.indexOf("function photoSourceInfo("), src.indexOf("function PhotoInfoModal("));
assert(helpers.includes("function photoJpegCopy("), "Production photo helpers must exist");
let win, probe = "startup";
const wait = ms => new Promise(r => setTimeout(r, ms));
const run = s => { probe = s; return win.webContents.executeJavaScript(s); };
async function until(s) { for (let i = 0; i < 200; i++) { if (await run(s)) return; await wait(40); } throw Error("Timed out: " + s); }
async function click(label) {
  const query = `[...(document.querySelector('.photo-info')||document.querySelector('.lb-root')||document).querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||e.textContent).trim()===${JSON.stringify(label)}&&e.getClientRects().length&&!e.disabled)`;
  await until(`!!(${query})`); await run(`(${query}).click()`); await wait(50);
}
async function tick(id) { await run(`document.querySelector('.image-grid-view [data-imgid="${id}"] .gridsel').click()`); await wait(50); }
async function openInfo() { await click("Photo info"); await until("!!document.querySelector('.photo-info dl')"); }
const timeout = setTimeout(() => { console.error("Photo info timeout: " + probe); app.exit(1); }, 120000);
app.whenReady().then(async () => {
  for (const phone of [true, false]) {
    win = new BrowserWindow({ show: true, width: phone ? 360 : 1280, height: 800, webPreferences: { preload, additionalArguments: phone ? ["--photo-phone"] : [], contextIsolation: false, sandbox: false, backgroundThrottling: false } });
    win.setContentSize(phone ? 360 : 1280, 800); win.focus();
    await win.loadFile(path.join(root, "web/index.html")); await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
    await run(`(async()=>{
      const c=document.createElement('canvas');c.width=320;c.height=480;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(100,100,100,100);
      await window.storage.set('img:png',c.toDataURL('image/png'));await window.storage.set('img:jpg',c.toDataURL('image/jpeg'));await window.storage.set('img:webp',c.toDataURL('image/webp'));
      c.width=c.height=16;for(const id of ['png','jpg','webp','missing'])await window.storage.set('th:'+id,c.toDataURL());
      await window.storage.set('ui:onboarded','1');await window.storage.set('chars:all',JSON.stringify([{id:'c',name:'Ari',tags:[],sections:[],variants:[],gallery:['png','jpg','webp','missing'].map(imgId=>({imgId,caption:imgId+' picture'}))}]));
      for(const k of ['personas:all','lore:all','prompts:all','chats:all'])await window.storage.set(k,'[]');
    })()`);
    await win.loadFile(path.join(root, "web/index.html")); await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
    await run(`window.__photo=(()=>{${helpers};return {photoSourceInfo,decodePhotoOriginal,photoJpegCopy}})();window.__exports=[];window.__urls=new Map();`);
    const hooks = `(()=>{
      const create=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{const u=create(b);window.__urls.set(u,b);return u};
      HTMLAnchorElement.prototype.click=function(){window.__exports.push({name:this.download,blob:window.__urls.get(this.href)})};
      if(window.Capacitor)window.Capacitor.nativePromise=async(plugin,method,args)=>{
        if(plugin!=='FileExport')throw Error('Unexpected native request '+plugin);
        if(method==='begin'){window.__pendingFile={name:args.filename,mime:args.mime,collection:args.collection,chunks:[]};return{token:'fixture'}}
        if(method==='append'){window.__pendingFile.chunks.push(Uint8Array.from(atob(args.data),x=>x.charCodeAt(0)));return{}}
        if(method==='finish'){const f=window.__pendingFile;window.__exports.push({...f,blob:new Blob(f.chunks,{type:f.mime})});return{location:'Pictures/Rolecraft Vault'}}
        throw Error('Unexpected export method '+method);
      };
    })()`;
    await run(hooks);
    const originals = await run("Promise.all(['img:png','img:jpg','img:webp','chars:all'].map(k=>window.storage.get(k).then(r=>r.value)))");
    await click("Characters"); await until("!!document.querySelector('.char-card')"); await run("document.querySelector('.char-card').click()"); await click("Grid");
    assert(await run("[...document.querySelectorAll('.image-grid-view button')].find(e=>e.textContent==='Photo info').disabled"), "Exactly one picture must be selected");
    await tick("png"); await openInfo();
    const info = await run("document.querySelector('.photo-info dl').textContent");
    assert(info.includes("PNG") && info.includes("320 × 480"), "Info reads full original, not 16px thumbnail: " + info);
    assert(info.includes(Buffer.from(originals[0].split(",")[1], "base64").length.toLocaleString("en-US") + " bytes"), "Exact byte count excludes base64 padding");
    assert(await run("(()=>{const e=document.querySelector('.photo-info .modal'),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&e.scrollWidth<=e.clientWidth+1})()"), "Info fits phone/desktop");
    await click("Save JPG copy"); await until("window.__exports.length===1");
    const output = await run("(async()=>{const f=window.__exports[0],data=new Uint8Array(await f.blob.arrayBuffer()),im=await createImageBitmap(f.blob),c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);return{name:f.name,type:f.blob.type,width:im.width,height:im.height,magic:[...data.slice(0,3)],pixel:[...x.getImageData(5,5,1,1).data],collection:f.collection}})()");
    assert(output.name.endsWith(".jpg")); assert.equal(output.type, "image/jpeg"); assert.deepEqual(output.magic, [255,216,255]);
    assert.equal(output.width, 320); assert.equal(output.height, 480); assert(output.pixel.every(v => v > 250), "Transparency becomes white, not black");
    if (phone) assert.equal(output.collection, "pictures", "Android copy uses the public picture collection");
    assert(await run("document.querySelector('.photo-info [role=status]').textContent.includes('original in your vault is unchanged')"));
    await run("window.__toBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb){cb(null)};void 0");
    await click("Save JPG copy"); await until("!!document.querySelector('.photo-info [role=alert]')"); assert.equal(await run("window.__exports.length"), 1);
    await run("HTMLCanvasElement.prototype.toBlob=window.__toBlob;void 0"); await click("Close Photo info");
    await tick("png"); await tick("jpg"); await openInfo();
    assert(await run("document.querySelector('.photo-info').textContent.includes('already JPG')"));
    assert(!(await run("[...document.querySelectorAll('.photo-info button')].some(e=>e.textContent==='Save JPG copy')")));
    // 1.340: a JPG original is saved byte for byte instead of offering nothing.
    await click("Save JPG"); await until("window.__exports.length===2");
    const jpgSaved = await run("(async()=>{const f=window.__exports[1],b=new Uint8Array(await f.blob.arrayBuffer());let s='';for(const x of b)s+=String.fromCharCode(x);return{name:f.name,type:f.blob.type,b64:btoa(s)}})()");
    assert(jpgSaved.name.endsWith(".jpg") && jpgSaved.type === "image/jpeg", JSON.stringify(jpgSaved.name));
    assert.equal(jpgSaved.b64, originals[1].split(",")[1], "a JPG original is saved unchanged");
    await click("Close Photo info"); await tick("jpg"); await tick("webp"); await openInfo(); await click("Save JPG copy"); await until("window.__exports.length===3");
    // Closing/locking after encoding begins must not start an export afterwards.
    await run("HTMLCanvasElement.prototype.toBlob=function(cb){window.__finishPhoto=()=>window.__toBlob.call(this,cb,'image/jpeg',.92)};void 0");
    await click("Save JPG copy"); await run("window.dispatchEvent(new Event('rcv-locking'))"); await until("!document.querySelector('.photo-info')");
    await run("window.__finishPhoto();HTMLCanvasElement.prototype.toBlob=window.__toBlob;void 0"); await wait(100); assert.equal(await run("window.__exports.length"), 3);
    await tick("webp"); await tick("missing"); await click("Photo info"); await until("!!document.querySelector('.photo-info [role=alert]')");
    assert(!(await run("!!document.querySelector('.photo-info dl')")), "Missing original never presents thumbnail details"); await click("Close Photo info");
    await run("document.querySelector('.image-grid-view [data-imgid=png]').click()"); await openInfo();
    await run("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await until("!document.querySelector('.photo-info')");
    assert(await run("!!document.querySelector('.lb-root')&&!!document.querySelector('.image-grid-view')"), "Escape dismisses only photo info");
    assert.deepEqual(await run("Promise.all(['img:png','img:jpg','img:webp','chars:all'].map(k=>window.storage.get(k).then(r=>r.value)))"), originals, "Inspection/conversion never change original bytes or gallery records");
    assert(await run("(()=>{for(const value of ['data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,/9j/AA==','not an image']){try{window.__photo.photoSourceInfo(value);return false}catch(_){}}return true})()"));
    assert(await run("window.__photo.photoJpegCopy({width:50000,height:50000,image:{}},.92).then(()=>false,()=>true)"), "Oversized canvas fails safely");
    assert(await run("window.__photo.photoJpegCopy({width:1,height:1,image:{}},.2).then(()=>false,()=>true)"), "Unsupported quality fails safely");
    assert(await run("(async()=>{const c=new AbortController();c.abort();const raw=(await window.storage.get('img:png')).value;return window.__photo.decodePhotoOriginal(raw,c.signal).then(()=>false,()=>true)})()"), "Cancelled decoding cannot reveal a late picture");
    if (!phone) {
      // 1.340: every character portrait, including each variant's own, as JPG.
      await run(`(async()=>{await window.storage.set('img:png2',(await window.storage.get('img:png')).value);await window.storage.set('th:png2',(await window.storage.get('th:png')).value);
        await window.storage.set('chars:all',JSON.stringify([{id:'c',name:'Ari',profileImg:'png',tags:[],sections:[],gallery:[],variants:[{id:'v',name:'Night',profileImg:'jpg'}]},{id:'b',name:'Bo',profileImg:'webp',tags:[],sections:[],gallery:[],variants:[]},{id:'d',name:'Ari',profileImg:'png2',tags:[],sections:[],gallery:[],variants:[]},{id:'e',name:'No portrait',tags:[],sections:[],gallery:[],variants:[]}]))})()`);
      await win.loadFile(path.join(root, "web/index.html")); await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
      await run("window.__exports=[];window.__urls=new Map();void 0"); await run(hooks);
      await run("[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='Settings').click()");
      await until("[...document.querySelectorAll('button')].some(b=>(b.textContent||'').trim()==='Character portraits as JPG')");
      await run("[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='Character portraits as JPG').click()");
      await until("[...document.querySelectorAll('button')].some(b=>b.textContent==='Create ZIP')");
      await run("[...document.querySelectorAll('button')].find(b=>b.textContent==='Create ZIP').click()");
      await until("window.__exports.length===1");
      const zip = await run(`(async()=>{const f=window.__exports[0],b=new Uint8Array(await f.blob.arrayBuffer()),v=new DataView(b.buffer),out=[];
        for(let at=0;at+30<=b.length&&v.getUint32(at,true)===0x04034b50;){const size=v.getUint32(at+18,true),nl=v.getUint16(at+26,true),xl=v.getUint16(at+28,true),name=new TextDecoder().decode(b.slice(at+30,at+30+nl)),data=b.slice(at+30+nl+xl,at+30+nl+xl+size);
          let s='';for(const x of data)s+=String.fromCharCode(x);out.push({name,magic:[...data.slice(0,3)],b64:btoa(s)});at+=30+nl+xl+size;}
        return{zipName:f.name,entries:out}})()`);
      assert.equal(zip.zipName, "rolecraft-portraits-jpg.zip");
      assert.deepEqual(zip.entries.map(e => e.name).sort(), ["Ari-Night.jpg", "Ari-2.jpg", "Ari.jpg", "Bo.jpg"].sort(), JSON.stringify(zip.entries.map(e => e.name)));
      assert(zip.entries.every(e => e.magic.join() === "255,216,255"), "every portrait is a real JPEG, including PNG and WebP originals");
      assert.equal(zip.entries.find(e => e.name === "Ari-Night.jpg").b64, originals[1].split(",")[1], "a JPG variant portrait is exported unchanged");
      assert.deepEqual(await run("Promise.all(['img:png','img:jpg','img:webp'].map(k=>window.storage.get(k).then(r=>r.value)))"), originals.slice(0, 3), "exporting never changes originals");
    }
    console.log("PASS " + (phone ? "Android 360px" : "Windows 1280px") + ": original photo details, PNG/WebP to JPEG, JPG originals saved unchanged, quality export, white alpha, failures, lock, modal layers and unchanged library" + (phone ? "" : "; every character and variant portrait exports as JPG"));
    win.destroy();
  }
  clearTimeout(timeout); app.exit(0);
}).catch(error => { console.error(error.stack); console.error("Probe: " + probe); clearTimeout(timeout); app.exit(1); });
