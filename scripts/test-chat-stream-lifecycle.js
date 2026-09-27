// Execute the shipped Windows bridge with an in-memory HTTPS transport.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events');
const root=path.join(__dirname,'..'),handlers={},events=[];
let callback,req,locked=false,timeoutMs;
const https={request(options,cb){assert.equal(options.hostname,'openrouter.ai');callback=cb;req=new EventEmitter();req.setTimeout=ms=>{timeoutMs=ms;};req.write=()=>{};req.end=()=>{};req.destroy=()=>req.emit('error',new Error('cancelled'));return req;}};
const source=process.env.RCV_CHAT_REGRESSION_BASE?require('child_process').execFileSync('git',['show',process.env.RCV_CHAT_REGRESSION_BASE+':app/openrouter.js'],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,'app/openrouter.js'),'utf8');
const box={module:{exports:{}},Buffer,process,require:name=>name==='https'?https:name==='fs'?{readFileSync:()=>Buffer.from('fixture')}:require(name)};
vm.runInNewContext(source,box);
box.module.exports.setupOpenRouterIpc({ipcMain:{handle:(name,fn)=>handlers[name]=fn},safeStorage:{isEncryptionAvailable:()=>true,decryptString:()=> 'fixture-not-a-real-key-00000000'},app:{getPath:()=>root,on(){}},isLocked:()=>locked});
const sender={isDestroyed:()=>false,send:(_,value)=>events.push(value)},payload={model:'fixture/model',messages:[{role:'user',content:'Hello'}]};
function start(extra={}){events.length=0;const result=handlers['openrouter-start']({sender},{...payload,...extra});assert(result.ok);const res=new EventEmitter();res.statusCode=200;callback(res);return {res,id:result.id};}
let s=start();s.res.emit('data',Buffer.from('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));s.res.emit('end');
assert.equal(timeoutMs,180000,'ordinary reply retains the existing socket idle timeout');
assert.equal(events[0].text,'partial');assert.equal(events.at(-1).type,'error','premature EOF must not commit success');assert(!events.some(e=>e.type==='done'));
s=start();s.res.emit('data',Buffer.from('data: {"choices":[{"delta":{"content":"complete"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));s.res.emit('end');
assert.equal(events.filter(e=>e.type==='done').length,1);assert.equal(events.filter(e=>e.type==='error').length,0);assert.equal(events.find(e=>e.type==='finish').reason,'stop');
s=start({purpose:'memory'});assert.equal(timeoutMs,360000,'memory compaction gets a longer socket idle timeout');s.res.emit('data',Buffer.from('data: [DONE]\n\n'));
assert.equal(handlers['openrouter-start']({sender},{...payload,purpose:'reply'}).ok,false,'unknown local purpose is rejected');
s=start();handlers['openrouter-cancel']({},s.id);s.res.emit('end');assert.equal(events.length,0,'Stop cannot turn into a terminal error');
locked=true;assert.equal(handlers['openrouter-start']({sender},payload).ok,false,'lock guard remains');
console.log('PASS native Windows terminal marker, memory and reply idle timeouts, preserved delta, no false success/duplicate completion, Stop and lock guards');
