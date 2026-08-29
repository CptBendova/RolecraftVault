/* The things a bug hunt turned up, so they cannot come back.

   Two of them could lose you work or lock you out:

   - A bin entry whose record had gone threw while drawing, and with no error
     boundary anywhere React unmounted the whole tree. The app went blank, and
     because it was blank there was no way to reach Settings and clear the thing
     causing it. A vault would have needed wiping.
   - Grouping the bin by kind in 1.225 meant an entry of any other kind matched
     no group, so it was invisible while still being counted in Settings and
     still taking up room. It could be neither restored nor removed.

   The rest are smaller but were all real: a shared picture being deleted out
   from under a live record, a countdown that ran past thirty days, a search
   that failed on pasted text, and a name with no spaces running off the screen.

   Needs Electron: npx electron scripts/test-robustness.js */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "rcv-robust-")));
app.on("window-all-closed", () => {});
const bail = setTimeout(() => { console.log("\n  timed out"); app.exit(2); }, 150000);

let bad = 0;
const check = (label, ok, detail) => {
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + (detail ? "  " + detail : ""));
};
const PIX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const LONG = "Aethelgardhrafnsdottir" + "verylongunbrokenname".repeat(4);

app.whenReady().then(async () => {
 try {
  const win = new BrowserWindow({ show: false, width: 1400, height: 1000 });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errors = [];
  win.webContents.on("console-message", details => {
    const lvl = details && details.level;
    const m = details && details.message;
    if ((lvl === "warning" || lvl === "error") && !/Content-Security/.test(String(m))) errors.push(String(m).slice(0, 140));
  });
  await win.loadFile(path.join(ROOT, "web", "index.html"));
  await wait(2600);
  await win.webContents.executeJavaScript(`(async () => { const s = window.storage;
    await s.set("img:shared", ${JSON.stringify(PIX)});
    await s.set("img:lore-only", ${JSON.stringify(PIX)});
    await s.set("chars:all", JSON.stringify([{ id:"c1", name:${JSON.stringify(LONG)},
      tags:[], searchables:[], profileImg:"", banner:"", variants:[], gallery:[], albums:[],
      imgMeta:{}, history:[], story:"x", personality:"y", sections:[], createdAt:1, updatedAt:1 }]));
    await s.set("personas:all","[]");
    /* two lore entries holding the same picture, which a restored backup can
       produce because it writes images under the ids carried in the file */
    await s.set("lore:all", JSON.stringify([
      { id:"l1", title:"First", content:"c", triggers:["t"], book:"Book",
        images:[{ imgId:"shared" }, { imgId:"lore-only" }] },
      { id:"l2", title:"Second", content:"c", triggers:["t"], book:"Book",
        images:[{ imgId:"shared" }] }
    ]));
    await s.set("prompts:all","[]");
    await s.set("trash:all", JSON.stringify([
      { tid:"fine", type:"character", deletedAt: Date.now() - 86400000,
        record:{ id:"a", name:"Ordinary", sections:[], gallery:[], variants:[] } },
      // a kind no group knows
      { tid:"odd", type:"characters", deletedAt: Date.now() - 86400000,
        record:{ id:"b", name:"Odd Kind", sections:[], gallery:[], variants:[] } },
      // nothing left of the record at all
      { tid:"broken", type:"character", deletedAt: Date.now() - 86400000 },
      // dated ahead of now, as a wrong clock or a vault moved between devices leaves it
      { tid:"ahead", type:"character", deletedAt: Date.now() + 5 * 86400000,
        record:{ id:"c", name:"Dated Ahead", sections:[], gallery:[], variants:[] } }
    ])); })()`);
  await win.webContents.reload();
  await wait(3200);
  const js = s => win.webContents.executeJavaScript(s);

  const openBin = `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    btn(/^Settings$/).click(); await sleep(1300);
    const row = [...document.querySelectorAll(".filerow")].find(x => /Recently deleted/.test(x.textContent));
    if (!row) return { noRow: true };
    row.click(); await sleep(1100);
    const d = [...document.querySelectorAll('[role="dialog"]')].find(x => x.getAttribute("aria-label") === "Recently deleted");
    if (!d) return { noDialog: true, aliveAfter: !!document.querySelector(".rcv") };
    for (const h of [...d.querySelectorAll("button[aria-expanded]")])
      if (!h.disabled && h.getAttribute("aria-expanded") !== "true") { h.click(); await sleep(250); }
    const text = d.innerText;
    return { alive: !!document.querySelector(".rcv"), text,
      rows: [...d.querySelectorAll("button")].filter(b => /^Restore$/.test(b.textContent.trim())).length };
  })()`;

  const bin = await js(openBin);
  console.log("\nthe bin, with a damaged entry in it");
  check("the interface is still standing", !bin.noDialog && bin.alive === true,
    bin.noDialog ? "the window did not even open" : "");
  check("nothing threw while drawing it", errors.length === 0, errors.slice(0, 2).join(" | "));
  check("the damaged entry is listed so it can be removed", bin.rows === 4,
    bin.rows + " of 4 listed");
  check("an entry of a kind no group knows is listed too", /Odd Kind/.test(bin.text || ""));
  /* Everything in the bin has to be reachable, or Settings counts things the
     window cannot show and they can be neither restored nor removed. */
  check("what Settings counts and what the window lists agree", bin.rows === 4);

  console.log("\nthe countdown");
  const ahead = (() => {
    const lines = (bin.text || "").split("\n").map(x => x.trim());
    const i = lines.indexOf("Dated Ahead");
    return i >= 0 ? lines[i + 1] : "(absent)";
  })();
  check("an entry dated in the future never says more than thirty days",
    /^(30 days left|goes today|\d+ days? left)$/.test(ahead) && !/3[1-9]|[4-9]\d/.test(ahead), ahead);

  console.log("\na name with nothing to break on");
  const wrap = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    const cl = btn(/^Close$/); if (cl) { cl.click(); await sleep(700); }
    btn(/^Characters$/).click(); await sleep(1000);
    document.querySelector(".char-card").click(); await sleep(1200);
    const e = btn(/^Edit character$/); if (e) { e.click(); await sleep(1500); }
    /* The heading has to be the editor's and has to actually be drawn: reading
       a rect off something that is not on screen returns zeros, which would
       sail past a "stays inside the window" check without testing anything. */
    const h1 = [...document.querySelectorAll("h1.serif")]
      .find(x => x.getBoundingClientRect().width > 0);
    if (!h1) return { noHeading: true, inEditor: !!btn(/^Cancel$/) };
    const r = h1.getBoundingClientRect();
    return { inEditor: !!btn(/^Cancel$/), width: Math.round(r.width), right: Math.round(r.right),
             vw: document.documentElement.clientWidth, wrap: getComputedStyle(h1).overflowWrap,
             showsName: /Aethelgard/.test(h1.textContent || "") };
  })()`);
  check("the editor is actually open with the long name in its heading",
    !wrap.noHeading && wrap.inEditor && wrap.showsName && wrap.width > 0,
    wrap.noHeading ? "no drawn heading found" : wrap.width + "px wide");
  check("and the heading stays inside the window", !wrap.noHeading && wrap.right <= wrap.vw + 1,
    wrap.noHeading ? "" : wrap.right + "px vs a " + wrap.vw + "px window, overflow-wrap: " + wrap.wrap);

  console.log("\nsearching with space around what was typed");
  const search = await js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = re => [...document.querySelectorAll("button")].find(b => re.test((b.textContent||"").trim()));
    const c = btn(/^Cancel$/); if (c) { c.click(); await sleep(800); }
    const x = [...document.querySelectorAll("button")].find(b => /^\\u00d7$/.test(b.textContent.trim()));
    if (x) { x.click(); await sleep(600); }
    btn(/^Characters$/).click(); await sleep(900);
    const box = [...document.querySelectorAll("input")].find(i => /search/i.test((i.placeholder||"") + (i.getAttribute("aria-label")||"")));
    if (!box) return { noBox: true };
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    const type = async v => { set.call(box, v); box.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(550); return document.querySelectorAll(".char-card").length; };
    return { tight: await type("Aethelgard"), padded: await type("   Aethelgard   ") };
  })()`);
  check("pasted text with spaces around it still finds the character",
    !search.noBox && search.padded === search.tight && search.tight === 1,
    "tight=" + search.tight + " padded=" + search.padded);

  clearTimeout(bail);
  console.log("");
  console.log(bad ? "  " + bad + " thing(s) still wrong."
                  : "  A damaged vault no longer takes the app down with it.");
  app.exit(bad ? 1 : 0);
 } catch (e) {
  console.log("\n  the interface did not do what this expects: " + (e && e.message ? e.message : e));
  app.exit(1);
 }
});
