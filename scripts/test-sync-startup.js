const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'../app/main.js'),'utf8');
const handlers={},writes=[];let locked=false,stamp=1,restore=false,yields=0,reads=0;
const context={ipcMain:{handle:(name,fn)=>handlers[name]=fn},isLocked:()=>locked,activeRestore:null,
  keyToFile:key=>key,fs:{statSync:()=>({ino:1,size:100,mtimeMs:stamp,ctimeMs:stamp})},
  readValue:key=>{reads++;return key==='sync:state'?'old':'writing';},writeValue:(k,v)=>writes.push([k,v]),
  hashOfRecord:()=>{throw Error('A startup cache check decrypted a picture');},
  beginVaultRestore:()=>{restore=true;return 'token';},setVaultRestoreValue:()=>{},commitVaultRestore:()=>{},abortVaultRestore:()=>{},
  setImmediate:fn=>setImmediate(()=>{yields++;fn();}),Date};
vm.createContext(context);
const helper=source.indexOf('function syncFingerprint(');
if(helper>=0)vm.runInContext(source.slice(helper,source.indexOf('function restoreTargets(',helper)),context);
const start=source.indexOf('  ipcMain.handle("vault-sync-fingerprint"'),end=source.indexOf('  ipcMain.handle("vault-set"',start);
vm.runInContext(source.slice(start,end),context);
(async()=>{
 const keys=Array.from({length:1024},(_,i)=>'img:'+i),result=await handlers['vault-sync-fingerprints'](null,keys);
 assert.equal(Object.keys(result).length,1024);assert(yields>0,'Large metadata checks must yield');assert.equal(reads,0);
 const before=handlers['vault-sync-fingerprint'](null,'img:0');stamp++;
 assert.notEqual(handlers['vault-sync-fingerprint'](null,'img:0'),before);
 handlers['vault-sync-commit'](null,{'sync:state':'new'},{'sync:state':'old'});
 assert(!restore,'Bookkeeping must not rebuild the entire vault');assert.equal(writes.length,1);
 assert.throws(()=>handlers['vault-sync-commit'](null,{'sync:state':'stale'},{'sync:state':'wrong'}),/changed/);
 context.activeRestore={};assert.throws(()=>handlers['vault-sync-commit'](null,{'sync:state':'bad'},{'sync:state':'old'}),/restore/);context.activeRestore=null;
 handlers['vault-sync-commit'](null,{'sync:state':'new','lore:all':'new'},{'sync:state':'old'});assert(restore,'Multi-record updates stay atomic');
 const pending=handlers['vault-sync-fingerprints'](null,keys);locked=true;await assert.rejects(pending,/locked/);
 assert.throws(()=>handlers['vault-sync-commit'](null,{'sync:state':'bad'},{}),/locked/);
 console.log('PASS 1,024 picture checks use metadata only and yield; bookkeeping avoids full-vault rebuild; stale/locked/restoring writes fail closed');
})().catch(e=>{console.error(e);process.exitCode=1;});
