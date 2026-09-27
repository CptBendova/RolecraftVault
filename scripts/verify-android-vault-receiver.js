/* Native-wire fixture for the complete shipped Android receiver. Not a phone:
   native HTTP and temporary downloads use Node; the Windows server is real. */
const vm=require('vm'),fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto'),assert=require('assert');
module.exports=async function verifyReceiver(code,expected){
  const records=new Map(),downloads=new Map();let sequence=0;
  const get=opts=>new Promise((resolve,reject)=>{const url=new URL(opts.url);const req=http.request(url,{method:opts.method||'GET',headers:opts.headers||{}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,bytes:Buffer.concat(chunks)}));});req.on('error',reject);req.setTimeout(10000,()=>req.destroy(Error('fixture timeout')));if(opts.data)req.write(Buffer.from(opts.data,opts.dataType==='file'?'base64':'utf8'));req.end();});
  const storage={scan:async()=>({keys:[...records.keys()],hashes:{}}),setWithHash:async(k,v)=>{records.set(k,v);},set:async(k,v)=>{records.set(k,v);},setBinary:async(k,v,prefix)=>{records.set(k,prefix+Buffer.from(v).toString('base64'));},delete:async k=>{records.delete(k);}};
  const window={storage,Capacitor:{nativePromise:async(plugin,method,opts)=>{
    if(plugin==='CapacitorHttp'){const r=await get(opts);return{status:r.status,data:r.bytes.toString('base64')};}
    if(plugin==='Filesystem'||plugin==='TransferKeepAlive')return{};
    if(plugin==='TransferTransport'){
      if(method==='freeSpace')return{bytes:1024*1024*1024};
      if(method==='download'){const r=await get(opts);if(r.status!==200)throw Error('status '+r.status);const token=String(++sequence);downloads.set(token,r.bytes);return{token,size:r.bytes.length};}
      if(method==='read')return{data:downloads.get(opts.token).subarray(opts.offset,opts.offset+opts.length).toString('base64')};
      if(method==='remove'){downloads.delete(opts.token);return{};}
    }throw Error('Unexpected native call '+plugin+'/'+method);
  }}};
  const sandbox={window,crypto:crypto.webcrypto,TextEncoder,TextDecoder,Uint8Array,DataView,URL,console,setTimeout,clearTimeout,setInterval,clearInterval,atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64')};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../mobile/src/rc-transfer.js'),'utf8'),sandbox);
  const preview=await window.transfer.preview(code,false);assert(preview.ok,preview.error);assert(preview.added>0);
  const phases=[];window.transfer.onProgress(p=>{if(phases[phases.length-1]!==p.phase){phases.push(p.phase);console.log('Android receiver: '+p.phase);}});
  const result=await window.transfer.receive(code,false);assert(result.ok&&!result.partial,JSON.stringify(result));
  for(const [key,value] of Object.entries(expected))assert.equal(records.get(key),value,'exact transferred '+key);
  assert.equal(downloads.size,0,'native downloads are cleaned');assert(!(await window.transfer.status()).active,'receive lease ends');
  console.log('PASS: complete real Android QR-code receiver against the real Windows shell, including saved binary pictures');
};
