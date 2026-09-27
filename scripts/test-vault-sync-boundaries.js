const assert=require("assert"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const source=fs.readFileSync(path.join(__dirname,"..","app","vault-sync.js"),"utf8");
function shipped(name){
  const start=source.indexOf("    async function "+name+"(");
  assert(start>=0,"Missing shipped sync function "+name);
  let depth=0,quote=null,escape=false;
  for(let at=source.indexOf("{",start);at<source.length;at++){
    const c=source[at];
    if(quote){if(escape)escape=false;else if(c==="\\")escape=true;else if(c===quote)quote=null;continue;}
    if(c==="'"||c==='"'||c==='`'){quote=c;continue;}
    if(c==="{")depth++;else if(c==="}"&&--depth===0)return source.slice(start,at+1);
  }
  throw Error("Unclosed sync function "+name);
}
const digest=text=>crypto.createHash("sha256").update(text).digest("hex"),encoder=new TextEncoder();
const C={canonical:JSON.stringify,parts:JSON.parse};
async function checkManifest(){
  const storyRecords=new Map(),settings={group:"paired-group"},staged=[];
  const stage=async text=>{staged.push(text);const hash=digest(text);return {hash,parts:[hash],bytes:encoder.encode(text).length};};
  const descriptor=d=>{assert(d.bytes<=10000);return d;},portable=()=>({}),check=()=>{};
  const storyIndex=new Function("C","storyRecords","settings","stage","descriptor","portable","check","encoder","hash","STORY_LIMIT","LIMIT","draftLane",shipped("storyIndex")+";return storyIndex;")(C,storyRecords,settings,stage,descriptor,portable,check,encoder,async text=>digest(text),100,10000,null);
  const small=JSON.stringify(["conversation","small"]),large=JSON.stringify(["conversation","large"]);
  const result=await storyIndex({entries:{[small]:{value:"okay"},[large]:{value:"x".repeat(200)}}},{},0);
  const manifest=JSON.parse(staged.at(-1));
  assert.deepEqual(result.omitted,[large]);
  assert.deepEqual(manifest.omitted,[large]);
  assert(manifest.records[small]&&!manifest.records[large],"oversized Chat remains local while ordinary Chat is staged");
  assert(staged.every(text=>!text.includes("x".repeat(100))),"oversized writing never enters a sync chunk");
  assert(storyRecords.has(small)&&!storyRecords.has(large));
  const readStoryIndex=new Function("C","settings","descriptor","download","STORY_LIMIT","LIMIT","draftLane",shipped("readStoryIndex")+";return readStoryIndex;")(C,settings,descriptor,async d=>d===result.index?JSON.stringify(manifest):JSON.stringify({value:"okay"}),100,10000,null);
  const incoming=await readStoryIndex(result.index,"peer",0,null);
  assert(incoming.incoming.snapshot.entries[small]&&!incoming.incoming.snapshot.entries[large]);
  assert.deepEqual(incoming.incoming.omitted,[large],"receivers retain an explicit incomplete-Chat warning");
  manifest.omitted=[small];
  await assert.rejects(()=>readStoryIndex(result.index,"peer",0,null),/Invalid omitted conversations/,"a peer cannot mark one record both sent and omitted");
}
async function checkManualServing(){
  const calls=[],reports=[],scheduled=[];
  let fail=true;
  const api=new Function("transport","report","schedule",`let stopped=false,manualRefresh=true,servingError=false,busy=false,activityGeneration=0,pulseTimer=null,timer=null,settings={enabled:true};
    const ready=()=>true,suspended=()=>false,tick=()=>{};
    const setTimeout=(fn,ms)=>{schedule(fn,ms);return 1;},clearTimeout=()=>{};
    ${shipped("pulse")}
    return {pulse,error:()=>servingError};`)(
      {call:async method=>{calls.push(method);if(fail)throw Error("Wi-Fi unavailable");}},
      (phase,message)=>reports.push({phase,message}),
      (fn,ms)=>scheduled.push(ms)
    );
  await api.pulse();
  assert.equal(calls[0],"serve");
  assert(api.error()&&reports.at(-1).phase==="error"&&/not serving paired chats/.test(reports.at(-1).message),"a failed manual lease renewal must be visible");
  fail=false;await api.pulse();
  assert(!api.error()&&scheduled.includes(0),"a recovered listener must recheck local publication before claiming to share chats");
  assert(reports.every(row=>row.phase!=="manual"),"heartbeat alone cannot claim the latest chats are published");
}
(async()=>{await checkManifest();await checkManualServing();console.log("PASS oversized chats stay local without blocking other manifest records, omitted state is validated, and manual listener failures are visible");})().catch(error=>{console.error(error);process.exitCode=1;});
