import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'aesd-mail-'));
const mock=join(dir,'mock.mjs'),out=join(dir,'mail.json');
writeFileSync(mock,`import {writeFileSync} from 'node:fs';globalThis.fetch=async(url,options)=>{if(url!=='https://api.resend.com/emails')throw Error('External network blocked in test');writeFileSync(process.env.TEST_MAIL,options.body);return new Response('{"id":"test"}',{status:200});};`);
const secret=crypto.randomBytes(32).toString('hex'),password=crypto.randomBytes(20).toString('hex');
const env={...process.env,DB_PATH:join(dir,'test.db'),PORT:'18948',OWNER_EMAIL:'owner@example.test',OWNER_PASSWORD:password,JWT_SECRET:secret,RESEND_API_KEY:'test',SECURITY_FROM_EMAIL:'test@example.test',TEST_MAIL:out};
const server=spawn(process.execPath,['--import',mock,'server.js'],{cwd:new URL('..',import.meta.url),env,stdio:['ignore','pipe','pipe']});
let logs='';server.stderr.on('data',b=>logs+=b);server.stdout.on('data',b=>logs+=b);
async function req(path,body,token){let r=await fetch('http://127.0.0.1:18948'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
try {
 for(let n=0;n<100;n++){try{await req('/health');break;}catch{} await new Promise(r=>setTimeout(r,50));}
 const login=await req('/login',{email:env.OWNER_EMAIL,password,deviceKey:'device',buildVariant:'owner'});assert.equal(login.status,200);
 const request=await req('/password-reset/request',{email:env.OWNER_EMAIL,channel:'email'});assert.equal(request.status,200);
 let code=JSON.parse(readFileSync(out)).text.match(/\b\d{6}\b/)[0];
 assert.equal((await req('/password-reset/confirm',{email:env.OWNER_EMAIL,code:'000000',newPassword:'changed-pass'})).status,400);
 assert.equal((await req('/password-reset/confirm',{email:env.OWNER_EMAIL,code,newPassword:'changed-pass'})).status,200);
 assert.equal((await req('/password-reset/confirm',{email:env.OWNER_EMAIL,code,newPassword:'again-pass'})).status,400);
 assert.equal((await req('/me',undefined,login.data.token)).status,401);
 assert.equal((await req('/login',{email:env.OWNER_EMAIL,password,deviceKey:'device'})).status,401);
 assert.equal((await req('/login',{email:env.OWNER_EMAIL,password:'changed-pass',deviceKey:'device'})).status,200);
 assert.equal((await req('/email-login/request',{email:env.OWNER_EMAIL})).status,200);
 code=JSON.parse(readFileSync(out)).text.match(/\b\d{6}\b/)[0];
 const entered=await req('/email-login/verify',{email:env.OWNER_EMAIL,code,deviceKey:'device',buildVariant:'owner'});assert.equal(entered.status,200);
 assert.equal((await req('/me',undefined,entered.data.token)).status,200);
 assert.equal((await req('/email-login/verify',{email:env.OWNER_EMAIL,code,deviceKey:'device'})).status,400);
 console.log('PASS: fresh DB migrations, email reset, wrong/reused codes, old-session revocation, changed password, email OTP login. No real email sent.');
}catch(e){console.error(logs);throw e;}finally{server.kill();await new Promise(r=>server.once('exit',r));rmSync(dir,{recursive:true,force:true});}
