/* Run the shipped Android passive-serve branch in a disposable JVM harness. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { spawnSync } = require('child_process');

const source = fs.readFileSync(path.join(__dirname, '../mobile/android/app/src/main/java/com/cptbendova/rolecraftvault/VaultSyncPlugin.java'), 'utf8');
const begin = source.indexOf('        resume(run);check(run);', source.indexOf('private JSONObject execute('));
const end = source.indexOf('        if(method.equals("stageImage"))', begin);
assert(begin >= 0 && end > begin, 'Android native serve branch must follow the common resume and lock checks');
const branch = source.slice(begin, end);
assert(branch.includes('if(method.equals("serve"))return info();'), 'serve must return before peer fetches, staging and merging');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcv-passive-serve-'));
const file = path.join(temp, 'PassiveServeCheck.java');
try {
  fs.writeFileSync(file, `import java.io.*;
class PassiveServeCheck {
  int epoch=1,starts=0,peerRequests=0;boolean paired=true,unlocked=true,foreground=true;long lease=0;
  static class Info {boolean enabled=true;}
  void resume(int run)throws Exception {if(!paired)throw new IOException("Pair first");if(run!=epoch)throw new IOException("Sync paused");starts++;lease=System.currentTimeMillis()+20000;}
  void check(int run)throws Exception {if(run!=epoch||!unlocked||!foreground||System.currentTimeMillis()>=lease)throw new IOException("Sync paused");}
  Info info(){return new Info();}
  Info execute(String method,int run)throws Exception {
${branch}
    peerRequests++;throw new IOException("Unknown method");
  }
  static void yes(boolean value,String message){if(!value)throw new AssertionError(message);}
  public static void main(String[] args)throws Exception {
    PassiveServeCheck p=new PassiveServeCheck();
    yes(p.execute("serve",1).enabled&&p.starts==1&&p.peerRequests==0,"serving starts without a peer fetch");
    p.lease=0;yes(p.execute("serve",1).enabled&&p.lease>System.currentTimeMillis(),"serve renews the native lease");
    p.unlocked=false;try{p.execute("serve",1);throw new AssertionError("locked serve accepted");}catch(IOException expected){}
    p.unlocked=true;p.foreground=false;try{p.execute("serve",1);throw new AssertionError("background serve accepted");}catch(IOException expected){}
    p.foreground=true;p.epoch++;try{p.execute("serve",1);throw new AssertionError("stale serve accepted");}catch(IOException expected){}
    p.paired=false;try{p.execute("serve",p.epoch);throw new AssertionError("unpaired serve accepted");}catch(IOException expected){}
    yes(p.peerRequests==0,"passive serving never requests a peer");
    System.out.println("PASS Android passive serve starts and renews the paired listener while unlocked, without fetching; lock, background and stale epochs fail closed");
  }
}`);
  const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  const result = spawnSync(java, [file], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.strictEqual(result.status, 0, result.stderr || String(result.error));
  console.log(result.stdout.trim());
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
