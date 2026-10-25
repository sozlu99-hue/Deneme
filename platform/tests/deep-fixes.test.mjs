import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {sqlite} from '../server/sqlite-adapter.mjs';
import {createPlatform} from '../server/platform-core.mjs';
import {privateTransition} from '../server/private-engine.mjs';
import {staffFixture} from './staff-fixture.mjs';
import {createIntegrationGateway} from '../server/integration-gateway.mjs';

test('Password change revokes platform sessions, legacy versions and pending reset codes',async()=>{
 const db=sqlite();try{
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,password_hash TEXT,role TEXT,active INTEGER,session_version INTEGER DEFAULT 0)');
  db.prepare('INSERT INTO users VALUES(1,?,?,?,1,7)').run('synthetic@example.test','hash:old-password','OWNER');
  const platform=createPlatform({db,secret:'isolated-deep-fix-secret-longer-than-32',passwords:{hash:async p=>'hash:'+p,compare:async(p,h)=>h==='hash:'+p},ready:()=>true,persist:async()=>{},clock:Date.now});
  db.prepare('INSERT INTO aesd_password_resets(id,user_id,code_hash,expires,created_at) VALUES(?,?,?,?,?)').run('old-reset',1,'synthetic',Date.now()+600000,Date.now());
  const login=await platform.login({email:'synthetic@example.test',password:'old-password',deviceId:'isolated_fix_device_001'}),p=platform.authenticate(login.token);
  const source=(await fs.readFile(new URL('../../legacy-auth.js',import.meta.url),'utf8')).replace("import jwt from 'jsonwebtoken';","const jwt={};");
  const {currentUser}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  assert.equal(currentUser(db,1,7).id,1);
  await platform.accounts.changePassword(p,{currentPassword:'old-password',newPassword:'new-password-2026'});
  assert.throws(()=>platform.authenticate(login.token));assert.throws(()=>currentUser(db,1,7),e=>e.status===401);
  assert.equal(db.prepare('SELECT used FROM aesd_password_resets').get().used,1);
  const fresh=await platform.login({email:'synthetic@example.test',password:'new-password-2026',deviceId:'isolated_fix_device_001'});
  assert.equal(platform.authenticate(fresh.token).user.id,1);assert.equal(currentUser(db,1,8).role,'OWNER');
 }finally{db.close();}
});

test('Closed register history cannot be edited, removed or reopened',async t=>{
 const f=await staffFixture();t.after(()=>f.close());const before=(await f.cloud.read(f.owner,'private')).state;
 before.registerSessions.push({id:'closed-fix-register',name:'Closed shift',status:'closed',openingBalance:100,closingBalance:100});
 for(const mutate of [r=>r.openingBalance=999,r=>r.closingBalance=999,r=>r.status='open']){
  const next=structuredClone(before);mutate(next.registerSessions.at(-1));assert.throws(()=>privateTransition(before,next),/geçmişi/);
 }
 const removed=structuredClone(before);removed.registerSessions.pop();assert.throws(()=>privateTransition(before,removed),/silinemez/);
 const selected=structuredClone(before);selected.activeRegisterId='closed-fix-register';assert.throws(()=>privateTransition(before,selected),/Etkin kasa/);
 assert.doesNotThrow(()=>privateTransition(before,structuredClone(before)));
});

for(const lateResult of [{state:'rejected'},{state:'confirmed',reference:'different-reference'},{state:'confirmed',reference:'provider-fix-123'}])test(`Concurrent final results preserve the first receipt: ${JSON.stringify(lateResult)}`,async()=>{
 const db=sqlite();try{
  let releaseLookup,lookupStarted;const beganLookup=new Promise(r=>lookupStarted=r);
  const platform={authorizePanel:()=> 'owner:1',controlWrite:async fn=>fn(),controlLog:()=>{}};
  let releaseSubmit,submitStarted;const beganSubmit=new Promise(r=>submitStarted=r);
  const gateway=createIntegrationGateway({db,platform,repository:{read:async()=>({state:{sales:[{id:'sale-fix',status:'completed',totalCents:1000}]}}),transact:async(scope,module,fn)=>fn({row:{state:{sales:[{id:'sale-fix',status:'completed',totalCents:1000}]}}})},adapters:{payment:{submit:()=>{submitStarted();return new Promise(r=>releaseSubmit=r);},lookup:()=>{lookupStarted();return new Promise(r=>releaseLookup=r);}}}});
  const p={user:{id:1}},id='fix_conflict_20261019';
  const sending=gateway.request(p,'market','payment',{operationId:id,saleId:'sale-fix'});await beganSubmit;
  const checking=gateway.receipt(p,'market',id,true);await beganLookup;
  releaseSubmit({state:'confirmed',reference:'provider-fix-123'});await sending;releaseLookup(lateResult);
  if(lateResult.reference==='provider-fix-123')await checking;
  else await assert.rejects(checking,e=>e.status===409);
  const result=await gateway.receipt(p,'market',id);assert.equal(result.state,'confirmed');assert.equal(result.providerReference,'provider-fix-123');
 }finally{db.close();}
});

test('A register can close and roll over without rewriting its opening data',async t=>{
 const f=await staffFixture();t.after(()=>f.close());const before=(await f.cloud.read(f.owner,'private')).state;
 const old=before.registerSessions.find(r=>r.id===before.activeRegisterId);assert.equal(old.status,'open');
 const next=structuredClone(before),row=next.registerSessions.find(r=>r.id===old.id);
 Object.assign(row,{status:'closed',closedAt:'2026-10-19T12:00:00Z',closingBalance:0,saleTotal:0,saleCount:0,cashSales:0,cardSales:0,creditSales:0,otherSales:0,cashIn:0,cashOut:0,cashRefunds:0,closedBy:'Synthetic'});
 next.registerSessions.unshift({id:'rollover-fix-register',name:old.name,status:'open',openingBalance:0,openedAt:row.closedAt});next.activeRegisterId='rollover-fix-register';
 assert.equal(privateTransition(before,next).activeRegisterId,next.activeRegisterId);
 const tampered=structuredClone(next);tampered.registerSessions.find(r=>r.id===old.id).openingBalance=900;assert.throws(()=>privateTransition(before,tampered),/açılış/);
});

for(const late of ['lookup','submit'])test(`A late uncertain ${late} preserves a confirmed provider receipt`,async()=>{
 const db=sqlite();try{
  let releaseSubmit,releaseLookup,submitStarted,lookupStarted;
  const beganSubmit=new Promise(r=>submitStarted=r),beganLookup=new Promise(r=>lookupStarted=r);
  const platform={authorizePanel:()=> 'owner:1',controlWrite:async fn=>fn(),controlLog:()=>{}};
  const gateway=createIntegrationGateway({db,platform,repository:{read:async()=>({state:{sales:[{id:'sale-fix',status:'completed',totalCents:1000}]}}),transact:async(scope,module,fn)=>fn({row:{state:{sales:[{id:'sale-fix',status:'completed',totalCents:1000}]}}})},adapters:{payment:{submit:()=>{submitStarted();return new Promise(r=>releaseSubmit=r);},lookup:()=>{lookupStarted();return new Promise(r=>releaseLookup=r);}}}});
  const p={user:{id:1}},id='fix_operation_20261019';
  const sending=gateway.request(p,'market','payment',{operationId:id,saleId:'sale-fix'});await beganSubmit;
  const checking=gateway.receipt(p,'market',id,true);await beganLookup;
  const confirmed={state:'confirmed',reference:'provider-fix-123'};
  if(late==='lookup'){releaseSubmit(confirmed);await sending;releaseLookup({state:'unknown'});await checking;}
  else{releaseLookup(confirmed);await checking;releaseSubmit({state:'unknown'});await sending;}
  const result=await gateway.receipt(p,'market',id);assert.equal(result.state,'confirmed');assert.equal(result.providerReference,confirmed.reference);
 }finally{db.close();}
});
