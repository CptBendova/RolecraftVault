const {spawnSync}=require("child_process"),path=require("path");
const result=spawnSync(process.execPath,[path.join(__dirname,"test-vault-sync-loop.js"),"--stories"],{stdio:"inherit",timeout:90000});
process.exit(result.status===0?0:1);
