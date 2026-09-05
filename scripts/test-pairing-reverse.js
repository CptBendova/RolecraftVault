const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {createTransport,seal,unseal}=require('../app/vault-sync-transport');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rcv-reverse-pair-')),all=[];let locked=false;
function make(name){const t=createTransport({directory:path.join(root,name),unlocked:()=>!locked,protect:s=>Buffer.from(s),unprotect:b=>b.toString(),network:{addresses:()=>['127.0.0.1'],privateIp:ip=>ip==='127.0.0.1',discoveryPort:45108}});all.push(t);return t;}
(async()=>{
  const phone=make('phone'),before=await phone.call('configure',{action:'create',label:'My phone'}),pc=make('pc');
  const request=await pc.call('joinRequest',{label:'New PC',namespace:'library1'});assert(!request.enabled&&request.joinRequest.code.startsWith('RCVJOIN1.'));
  await phone.call('offerJoin',{code:request.joinRequest.code});const waiting=await pc.call('status');
  assert(!waiting.enabled,'Receiving an offer does not silently join');assert.equal(waiting.joinRequest.pendingLabel,'My phone');
  const paired=await pc.call('configure',{action:'accept-request'});assert.equal(paired.group,before.group);assert.equal(paired.primary,before.primary);assert.equal(paired.label,'New PC');assert.equal((await phone.call('status')).device,before.device);assert.equal((await phone.call('status')).group,before.group);
  assert(!paired.joinRequest);await assert.rejects(pc.call('configure',{action:'accept-request'}),/No current/);
  const originalNow=Date.now,oldInvite=(await phone.call('invite')).code;
  try{
    const later=originalNow()+15*60000;Date.now=()=>later;
    const fresh=(await phone.call('invite')).code,late=make('late');
    await assert.rejects(late.call('configure',{action:'join',code:oldInvite}),/expired/);
    assert.equal((await late.call('configure',{action:'join',code:fresh})).group,before.group);
    assert.equal((await phone.call('status')).primary,before.primary);
  }finally{Date.now=originalNow;}
  const legacy=make('legacy'),legacyBefore=await legacy.call('configure',{action:'create',namespace:'previous-format'});
  await legacy.call('upgradeNamespace',{from:'previous-format',to:'library1'});
  const upgraded=await legacy.call('status');assert.equal(upgraded.group,legacyBefore.group);assert.equal(upgraded.device,legacyBefore.device);assert.equal(upgraded.primary,legacyBefore.primary);assert.equal(upgraded.namespace,'library1');
  const other=make('other'),code=(await other.call('joinRequest',{})).joinRequest.code,payload=JSON.parse(Buffer.from(code.slice(9),'base64url'));
  for(const change of [{ip:'8.8.8.8'},{expires:1},{namespace:'unrelated'},{key:'bad'}])await assert.rejects(phone.call('offerJoin',{code:'RCVJOIN1.'+Buffer.from(JSON.stringify({...payload,...change})).toString('base64url')}),/expired|incompatible/);
  locked=true;await assert.rejects(phone.call('offerJoin',{code}),/Unlock/);locked=false;
  await other.call('pause');assert(!(await other.call('status')).joinRequest);await assert.rejects(phone.call('offerJoin',{code}));
  assert.throws(()=>unseal(seal('secret',payload.key,'pair-offer'),payload.key,'pair-reply'));
  console.log('PASS PC QR joins the existing phone group only after local confirmation; primary and phone identity stay unchanged; expired/public/cross-group/locked/cancelled offers fail closed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>all.forEach(t=>t.pause()));
