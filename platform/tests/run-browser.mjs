import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const available=['tests/simple-ingredients-browser.mjs','tests/simple-reset-browser.mjs','tests/shop-manager-readiness-browser.mjs','tests/shop-manager-browser.mjs','tests/simple-stock-browser.mjs','tests/stock-workspace-browser.mjs','tests/workflow-browser.mjs','tests/workspace-browser.mjs','tests/unified-browser.mjs','tests/owner-console-browser.mjs','tests/browser.mjs','tests/auth-browser.mjs','tests/webview-origin.mjs','tests/review-browser.mjs','tests/panels-browser.mjs','tests/cloud-browser.mjs','tests/web-pwa-browser.mjs','tests/audit-browser.mjs'];
const selected=process.argv.slice(2),groups=selected.length?selected:available;
if(groups.some(name=>!available.includes(name)))throw Error('Unknown browser test group.');
await fs.mkdir('evidence',{recursive:true});
for(const name of groups){
 const port=10000+crypto.randomInt(20000),origin='http://127.0.0.1:'+port;
 const file='/tmp/aesd-browser-'+crypto.randomUUID()+'.sqlite';
 const server=spawn(process.execPath,['server/dev-server.mjs'],{env:{...process.env,AESD_TEST_DB:file,AESD_TEST_OWNER_PASSWORD:'browser-owner-test-password',AESD_TEST_STATIC:'1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let output='';for(const stream of [server.stdout,server.stderr])stream.on('data',v=>output=(output+v).slice(-16000));
 const stopped=new Promise(resolve=>server.once('close',resolve));server.on('error',error=>output+='\n'+error.message);
 try{
  let ready=false;
  for(let i=0;i<100;i++){
   if(server.exitCode!==null||server.signalCode!==null)throw Error('The test server stopped: '+output);
   try{const response=await fetch(origin+'/aesd/v1/health',{signal:AbortSignal.timeout(1000)});ready=response.ok&&(await response.json()).ok===true;}catch{}
   if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready)throw Error('The test server is not ready: '+output);
  console.log('GROUP '+name);
  await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[name],{stdio:'inherit',env:{...process.env,AESD_TEST_ORIGIN:origin}});
   child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(name+' failed: '+code)));
  });
 }finally{
  if(server.exitCode===null&&server.signalCode===null)server.kill('SIGTERM');
  await stopped;
  for(const suffix of ['', '-wal','-shm','.cloud','.cloud-wal','.cloud-shm'])await fs.rm(file+suffix,{force:true});
 }
}
