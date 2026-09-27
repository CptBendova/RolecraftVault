// Exercise real encrypted native LAN transport and the shipped foreground lane.
const {spawnSync}=require('child_process'),path=require('path');
const result=spawnSync(process.execPath,[path.join(__dirname,'test-vault-sync-loop.js'),'--stories','--chat-focus'],{stdio:'inherit'});
process.exit(result.status==null?1:result.status);
