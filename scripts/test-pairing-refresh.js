const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const C=require('../app/vault-sync-core');
(async()=>{
 let release,entered,invites=0;const waiting=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);
 const settings={enabled:true,group:'same',primary:'primary',device:'secondary'};
 const window={RolecraftSyncCore:C,vaultSync:{call:async method=>{if(method==='status')return settings;if(method==='invite')return {code:'fresh-'+(++invites)};return {};}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/vault-sync.js'),'utf8'),{window,crypto:crypto.webcrypto,TextEncoder,setTimeout,clearTimeout});
 const engine=window.RolecraftVaultSync.create({ready:()=>true,storage:{syncCommit:async()=>{},get:async()=>{entered();await blocked;return null;}},imageIds:()=>[],canApply:()=>true});
 engine.start();await waiting;
 assert.equal(await engine.invite(),'fresh-1');assert.equal(await engine.invite(),'fresh-2');assert.equal(settings.group,'same');
 engine.stop();release();await assert.rejects(engine.invite(),/paused/);
 console.log('PASS invitations can be refreshed while library preparation is busy without leaving the group; stopped engines fail closed');
})().catch(e=>{console.error(e);process.exitCode=1;});
