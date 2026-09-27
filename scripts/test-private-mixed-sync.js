const {spawnSync}=require('child_process'),path=require('path');
const r=spawnSync(process.execPath,[path.join(__dirname,'test-vault-sync-loop.js'),'--stories','--mixed'],{stdio:'inherit',timeout:90000});
process.exit(r.status===0?0:1);
