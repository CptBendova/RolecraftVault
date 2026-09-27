"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const source=fs.readFileSync(path.join(__dirname,"..","app","main.js"),"utf8");
const start=source.indexOf('  ipcMain.handle("vault-sync-fingerprint"');
const end=source.indexOf('  ipcMain.handle("vault-set"',start);
assert(start>=0&&end>start,"The real Windows sync commit handler must be present");
const disk=new Map(),handlers={},writes=[],restores=[];
let locked=false,activeRestore=null;
const context={
  ipcMain:{handle:(name,handler)=>{handlers[name]=handler;}},
  isLocked:()=>locked,readValue:key=>disk.get(key)??null,
  writeValue:(key,value)=>{writes.push(key);disk.set(key,value);},
  beginVaultRestore:spec=>{const transaction={spec,values:new Map()};restores.push(transaction);return transaction;},
  setVaultRestoreValue:(transaction,key,value)=>{transaction.values.set(key,value);},
  commitVaultRestore:transaction=>{for(const [key,value]of transaction.values)disk.set(key,value);},
  abortVaultRestore:()=>{},
  get activeRestore(){return activeRestore;}
};
vm.createContext(context);
vm.runInContext(source.slice(start,end),context);
const commit=handlers["vault-sync-commit"],key="chats:draft-handoffs";
assert.equal(typeof commit,"function");
const initial=JSON.stringify({format:1,offers:[{text:"Explicit draft"}],receipts:[]});
const next=JSON.stringify({format:1,offers:[{text:"Explicit draft"}],receipts:[{revision:"receipt"}]});
assert.equal(commit(null,{[key]:initial},{[key]:null}),true);
assert.equal(disk.get(key),initial);
assert.deepEqual(writes,[key],"one draft key writes through the atomic single-file path");
assert.equal(restores.length,0,"draft-only CAS must not rebuild the whole vault");
assert.throws(()=>commit(null,{[key]:"stale"},{[key]:null}),/changed/);
assert.equal(disk.get(key),initial,"stale writer must not replace the saved offer");
assert.throws(()=>commit(null,{[key]:"unchecked"},{}),/expected value/);
assert.equal(disk.get(key),initial,"draft handoff writes must always supply an exact compare value");
assert.equal(commit(null,{[key]:next},{[key]:initial}),true);
assert.equal(disk.get(key),next,"matching CAS stores the next receipt state");
activeRestore={};
assert.throws(()=>commit(null,{[key]:"blocked"},{[key]:next}),/restore/);
assert.equal(disk.get(key),next,"an active restore must prevent the fast write");
activeRestore=null;locked=true;
assert.throws(()=>commit(null,{[key]:"blocked"},{[key]:next}),/locked/);
assert.equal(disk.get(key),next,"locked vault must never write draft data");
locked=false;
assert.equal(commit(null,{[key]:"combined","chats:all":"[]"},{[key]:next,"chats:all":null}),true);
assert.equal(restores.length,1,"multi-record writes retain the atomic restore path");
assert.equal(disk.get(key),"combined");
assert.equal(commit(null,{"lore:all":"[1]"},{"lore:all":null}),true);
assert.equal(restores.length,2,"other single keys still use the existing restore path");
assert.equal(commit(null,{"sync:state":"checkpoint"},{"sync:state":null}),true);
assert.equal(restores.length,2,"sync state keeps its existing single-file path");
assert.equal(writes.at(-1),"sync:state");
console.log("PASS Windows draft-only CAS is atomic and cheap; stale, locked and restoring writes fail closed; multi-record commits remain atomic");
