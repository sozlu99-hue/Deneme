import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {randomBytes} from 'node:crypto';

test('The real legacy host uses shared storage and never ACKs a missing admin record',{skip:!process.env.TEST_PG_URL},async t=>{
 const url=new URL(process.env.TEST_PG_URL);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));const admin=new pg.Pool({connectionString:url.href}),name='legacy_http_'+randomBytes(8).toString('hex');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'aesd-legacy-http-')),probe=http.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,DB_PATH:path.join(directory,'test.sqlite'),DATABASE_URL:url.href,PERSISTENCE_REQUIRED:'1',RENDER_GIT_COMMIT:'local-release-check',PORT:String(port),JWT_SECRET:'isolated-legacy-http-secret-never-production',OWNER_EMAIL:'owner@example.test',OWNER_PASSWORD:'isolated-legacy-owner-password'},stdio:['ignore','pipe','pipe']});
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',value=>output=(output+value).slice(-4000));const stopped=new Promise(resolve=>child.once('close',resolve));
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await stopped;await fs.rm(directory,{recursive:true,force:true});await admin.query('DROP DATABASE '+name);await admin.end();});
 const base='http://127.0.0.1:'+port;let ready=false;
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(output);try{ready=(await fetch(base+'/health')).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,30));}assert.equal(ready,true,output);
 const logged=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'isolated-legacy-owner-password',deviceKey:'legacy-http-owner-device',buildVariant:'owner'})});assert.equal(logged.status,200);const {token}=await logged.json();
 for(const prefix of ['/admin/phone-licenses/999999/','/admin/licenses/999999/'])for(const action of ['reset-device','suspend','resume'])assert.equal((await fetch(base+prefix+action,{method:'POST',headers:{Authorization:'Bearer '+token}})).status,404);
 for(const action of ['reset-device','suspend','resume'])assert.equal((await fetch(base+'/admin/'+action+'/999999',{method:'POST',headers:{Authorization:'Bearer '+token}})).status,404);
 for(let i=0;i<50&&!output.includes('\"event\":\"release_verification\",\"ok\":true');i++)await new Promise(resolve=>setTimeout(resolve,20));
 assert.match(output,/\"event\":\"release_verification\",\"ok\":true/);
});
