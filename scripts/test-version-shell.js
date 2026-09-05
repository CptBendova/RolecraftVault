const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..'),owner=fs.readFileSync(path.join(__dirname,'set-version.js'),'utf8');
function run(shell){
 const changed=new Map(),original=new Map();
 const fakeFs={readFileSync(file){if(changed.has(file))return changed.get(file);const text=fs.readFileSync(file,'utf8');original.set(file,text);return text;},writeFileSync(file,text){changed.set(file,text);}};
 vm.runInNewContext(owner,{require:name=>name==='fs'?fakeFs:require(name),__dirname,process:{argv:['node','set-version.js','1.999',...(shell?['--shell']:[])],exit:code=>{throw Error('Version owner failed '+code);}},console:{log(){},error(){}}});
 const main=path.join(root,'app/main.js'),before=original.get(main),after=changed.get(main);
 const floor=text=>text.match(/const UPDATE_COMPAT_BUILD = "([^"]+)"/)[1];
 assert.equal(floor(after),shell?'1.999':floor(before));
 assert(after.includes('const FACTORY_BUILD = "1.999"'));
 assert(!/(?<!\r)\n/.test(after),'main.js stays CRLF');
}
run(false);run(true);console.log('PASS version owner advances shell compatibility only when explicitly requested');
