import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {authenticateUser,bindLoginDevice} from '../legacy-auth.js';
import {openDatabase} from '../shared-database.js';

const secret='isolated-legacy-auth-regression-secret';
function database(file=':memory:') {
 const db=new Database(file);
 db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,active INTEGER,session_version INTEGER,password_hash TEXT,role TEXT,license_until TEXT,device_key_hash TEXT,google_sub TEXT)");
 db.prepare('INSERT INTO users VALUES(1,?,1,0,?,?,?,?,NULL)').run('local@example.test','original-hash','CLIENT','2099-01-01T00:00:00Z',null);
 return db;
}
test('Old credentials cannot bind a second device or mint a new session',t=>{
 const db=database();t.after(()=>db.close());const a=db.prepare('SELECT * FROM users').get(),b={...a};
 assert.equal(bindLoginDevice(db,a,'device-a','client').device_key_hash,'device-a');
 assert.throws(()=>bindLoginDevice(db,b,'device-b','client'),/başka bir cihaza/);
 db.prepare('UPDATE users SET password_hash=?,session_version=1,device_key_hash=NULL').run('new-hash');
 assert.throws(()=>bindLoginDevice(db,a,'device-b','client'),/Oturum/);
 assert.equal(db.prepare('SELECT device_key_hash FROM users').get().device_key_hash,null);
 assert.throws(()=>authenticateUser(db,jwt.sign({id:1,kind:'user',v:0},secret),secret),/Oturum/);
});
test('Google routes reject stale tokens, mismatched emails and revoked OAuth states',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aesd-google-auth-')),file=path.join(dir,'auth.sqlite'),db=database(file);
 Object.assign(process.env,{DB_PATH:file,JWT_SECRET:secret,GOOGLE_CLIENT_ID:'isolated-client',GOOGLE_CLIENT_SECRET:'isolated-secret'});
 const originalFetch=globalThis.fetch;let info={aud:'isolated-client',sub:'synthetic-sub',email:'local@example.test',email_verified:true},duringToken=()=>{};
 globalThis.fetch=async(url,options)=>String(url).startsWith('https://oauth2.googleapis.com/')?(String(url).includes('/tokeninfo')?Response.json(info):(duringToken(),Response.json({id_token:'isolated-token'}))):originalFetch(url,options);
 await import('../google-oauth-patch.js');
 const app=express(),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{globalThis.fetch=originalFetch;await new Promise(resolve=>server.close(resolve));openDatabase(file).close();db.close();await fs.rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const token=()=>jwt.sign({id:1,kind:'user',v:db.prepare('SELECT session_version FROM users').get().session_version},secret);
 const call=(uri,method='GET',value=token())=>originalFetch(base+uri,{method,headers:{Authorization:'Bearer '+value}});
 const start=async()=>{const r=await call('/oauth/google/start');assert.equal(r.status,200);return new URL((await r.json()).authUrl).searchParams.get('state');};
 const finish=state=>originalFetch(base+'/oauth/google/callback?state='+state+'&code=isolated-code');
 const stale=token(),state=await start();db.prepare('UPDATE users SET session_version=1').run();
 for(const[uri,method]of[['/oauth/google/status','GET'],['/oauth/google/start','GET'],['/oauth/google/refresh','POST'],['/oauth/google','DELETE']])assert.equal((await call(uri,method,stale)).status,401);
 assert.equal((await finish(state)).status,400);
 for(const changed of [{email:'other@example.test'},{email_verified:false}]){info={aud:'isolated-client',sub:'synthetic-sub',email:'local@example.test',email_verified:true,...changed};assert.equal((await finish(await start())).status,400);}
 info={aud:'isolated-client',sub:'synthetic-sub',email:'local@example.test',email_verified:true};
 duringToken=()=>db.prepare('UPDATE users SET session_version=session_version+1').run();
 assert.equal((await finish(await start())).status,400);assert.equal(db.prepare('SELECT google_sub FROM users').get().google_sub,null);
 duringToken=()=>{};assert.equal((await finish(await start())).status,200);assert.equal(db.prepare('SELECT google_sub FROM users').get().google_sub,'synthetic-sub');
});
