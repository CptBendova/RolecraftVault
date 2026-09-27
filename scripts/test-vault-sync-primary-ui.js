// Real SyncPanel and app styles; fake engine records explicit user choices only.
const {app,BrowserWindow}=require("electron"),assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const root=path.join(__dirname,".."),tmp=fs.mkdtempSync(path.join(os.tmpdir(),"rcv-sync-primary-ui-"));app.setPath("userData",tmp);app.commandLine.appendSwitch("force-device-scale-factor","1");
const preload=path.join(tmp,"fixture.js");fs.writeFileSync(preload,"window.vaultSync={call:async()=>({enabled:false})};");
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=s=>win.webContents.executeJavaScript(s);
async function until(s){for(let n=0;n<100;n++){if(await run(s))return;await wait(50);}throw Error("Timeout: "+s);}
async function click(text){await run(`(()=>{const b=[...document.querySelectorAll('#primary-test button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b)throw Error('Missing button: '+${JSON.stringify(text)});b.scrollIntoView({block:'center'});b.click();})()`);await wait(40);}
async function fit(){
  const result=await run(`(()=>{const p=document.querySelector('#primary-test .vault-sync-panel'),r=p.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,panelOverflow:p.scrollWidth>p.clientWidth+1,bad:[...p.querySelectorAll('button,input,summary,pre')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent.slice(0,70),left:r.left,right:r.right,width:r.width}}).filter(r=>r.left<0||r.right>innerWidth+1||r.width<=0)}})()`);
  assert(result.left>=0&&result.right<=result.width+1&&!result.panelOverflow&&!result.bad.length,JSON.stringify(result));
}
const timeout=setTimeout(()=>app.exit(2),60000);
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:true,width:360,height:800,webPreferences:{preload,contextIsolation:false,sandbox:false,backgroundThrottling:false}});win.setContentSize(360,800);win.focus();
  await win.loadFile(path.join(root,"web/index.html"));await until("!!document.querySelector('.rcv[data-rcv-state=ready]')");
  await run("[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&b.textContent.trim()==='Settings').click()");await until("!!document.querySelector('.vault-sync-panel')");
  await run(`(()=>{
    const container=document.querySelector('.vault-sync-panel').parentElement,el=document.createElement('div');el.id='primary-test';container.replaceChildren(el);
    window.__panelRoot=ReactDOM.createRoot(el);window.RolecraftChatSync=window.RolecraftChatSync||{};
    window.__review={id:'fixture-review',groups:[
      {key:'character:irethia',name:'Irethia',candidates:[
        {key:'original',original:true,pictureCount:1,record:{id:'original',name:'Irethia',updatedAt:1000,story:'Original saved writing',gallery:['photo-one']}},
        {key:'updated-copy',original:false,pictureCount:3,record:{id:'updated-copy',name:'Irethia (sync conflict)',updatedAt:2000,story:'Updated writing including the end of the battle and every saved detail.',gallery:['photo-one','photo-two','photo-three'],sections:[{title:'Long detail',content:'Saved detail '.repeat(30)+'END OF FULL DETAILS'}],website:'https://example.invalid/'+('very-long-path-'.repeat(35))}}
      ]},
      {key:'character:queen',name:'Queen',candidates:[{key:'queen-original',original:true,pictureCount:0,record:{id:'queen-original',name:'Queen',story:'Keep this untouched'}},{key:'queen-copy',original:false,pictureCount:0,record:{id:'queen-copy',name:'Queen (sync conflict)',story:'Also untouched'}}]}
    ]};
    window.__generation=0;
    window.__reset=()=>{
      window.__setCalls=0;window.__reviewCalls=0;window.__resolutions=[];window.__generation++;
      window.__status={phase:'synced',message:'Up to date',settings:{enabled:true,device:'phone',primary:'tablet',primarySelection:1,primaryPreference:null},peers:[]};
      window.__engine={supported:true,invite:async()=>{},retry:()=>{},configure:async()=>{},
        setPrimary:async()=>{window.__setCalls++;window.__status={...__status,settings:{...__status.settings,primaryPreference:{device:'phone',author:'phone',sequence:1,label:'Phone'}}};__paint();return __status.settings;},
        reviewConflicts:async()=>{window.__reviewCalls++;return __review;},
        resolveConflicts:async(review,choices)=>{window.__resolutions.push({reviewId:review.id,choices:{...choices}});return Object.keys(choices).length;}
      };
      window.__paint=()=>__panelRoot.render(React.createElement(RolecraftSyncPanel,{key:__generation,engine:__engine,status:__status}));__paint();
    };__reset();
  })()`);
  for(const mode of ["quality","performance"])for(const width of [360,1280]){
    win.setContentSize(width,900);await run(`document.querySelector('.rcv').classList.toggle('perf',${mode==="performance"});__reset()`);await until("!!document.querySelector('#primary-test .sync-primary-settings')");
    assert.equal(await run("__setCalls"),0);await click("Make this device primary");assert.equal(await run("__setCalls"),0,"opening confirmation must not change primary");
    assert(await run("!!document.querySelector('[aria-label=\"Confirm primary change\"]')"));await fit();await click("Cancel");assert.equal(await run("__setCalls"),0);
    await click("Make this device primary");await click("Confirm primary choice");await until("__setCalls===1&&!![...document.querySelectorAll('#primary-test button')].find(b=>b.textContent==='This device is primary'&&b.disabled)");
    await click("Review existing conflict copies");await until("document.querySelectorAll('#primary-test input[type=radio]').length===2");assert.equal(await run("__reviewCalls"),1);
    assert.equal(await run("document.querySelectorAll('#primary-test input[type=radio]:checked').length"),0,"dates/size never silently preselect a winner");
    assert(await run("[...document.querySelectorAll('#primary-test button')].find(b=>b.textContent==='Keep selected versions (0)').disabled"));
    await run("[...document.querySelectorAll('#primary-test details')].forEach(d=>d.open=true)");assert(await run("document.querySelector('#primary-test').textContent.includes('END OF FULL DETAILS')"));assert(await run("document.querySelector('#primary-test').textContent.includes('photo-three')"));await fit();
    await run("document.querySelectorAll('#primary-test input[type=radio]')[1].click()");await until("document.querySelectorAll('#primary-test input[type=radio]:checked').length===1");
    await click("Next group");assert.equal(await run("document.querySelectorAll('#primary-test input[type=radio]:checked').length"),0,"other group remains unselected");await fit();
    await click("Previous group");assert.equal(await run("document.querySelectorAll('#primary-test input[type=radio]')[1].checked"),true,"explicit selection retained across groups");
    await click("Keep selected versions (1)");await until("__resolutions.length===1&&!document.querySelector('#primary-test .sync-conflict-review')");
    assert.deepEqual(await run("__resolutions"),[{reviewId:"fixture-review",choices:{"character:irethia":"updated-copy"}}]);
    assert.equal(await run("__setCalls"),1);await fit();console.log("PASS "+mode+" "+width+"px: explicit primary confirmation, no guessed review choice, full details, exact selected copy and responsive controls");
  }
  await run(`window.__backgroundActive=false;window.__backgroundStarts=0;window.RolecraftSyncBackground={supported:()=>true,active:()=>__backgroundActive,start:async()=>{__backgroundStarts++;__backgroundActive=true;window.dispatchEvent(new CustomEvent('rcv-sync-background'));},stop:async()=>{__backgroundActive=false;window.dispatchEvent(new CustomEvent('rcv-sync-background'));}};void 0;`);
  for(const mode of ["quality","performance"])for(const width of [360,1280]){
    win.setContentSize(width,900);await run(`document.querySelector('.rcv').classList.toggle('perf',${mode==="performance"});__reset()`);await until("!!document.querySelector('#primary-test .sync-background-settings')");
    const starts=await run('__backgroundStarts');await click('Enable background sync');assert.equal(await run('__backgroundStarts'),starts,'opening disclosure cannot authorize an unlocked session');
    assert(await run("document.querySelector('.sync-background-settings').textContent.includes('Your vault stays unlocked in memory')"));await fit();
    await click('Keep unlocked and start sync');await until('__backgroundActive');await click('Stop background sync');await until('!__backgroundActive');await fit();
    console.log('PASS '+mode+' '+width+'px: screen-off consent, disclosure and Stop controls fit without overflow');
  }
  clearTimeout(timeout);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(timeout);app.exit(1);});
