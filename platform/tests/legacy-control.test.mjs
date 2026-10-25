import {approveFixtureAccount} from './approved-account-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {sqlite} from '../server/sqlite-adapter.mjs';
import {createPlatform} from '../server/platform-core.mjs';
import {sqliteRepository} from '../server/cloud-repository.mjs';
import {createCloud} from '../server/cloud-core.mjs';
import {emptyState} from '../web/pos.js';
import {legacyControlMiddleware,needsLegacyControl} from '../server/legacy-control.mjs';

const operation=(kind,data)=>({operationId:crypto.randomUUID(),kind,data});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function fixture(persist=async()=>{}){
 const db=sqlite(),ledger=sqlite();
 db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,password_hash TEXT,role TEXT,active INTEGER DEFAULT 1,session_version INTEGER DEFAULT 0)');
 db.prepare("INSERT INTO users(email,password_hash,role) VALUES('owner@example.test','owner-password','OWNER')").run();
 const platform=createPlatform({db,secret:'isolated-legacy-control-secret-never-for-production',passwords:{hash:async value=>value,compare:async(a,b)=>a===b},persist,ready:()=>true});
 const ownerLogin=await platform.login({email:'owner@example.test',password:'owner-password',deviceId:'legacy_owner_device_0001'}),owner=platform.authenticate(ownerLogin.token);
 const business=await platform.register({email:'client@example.test',password:'client-password',businessName:'Isolated shop',contactName:'Test person',module:'market'});
 await platform.approve(owner,business.id);
 const login=await platform.login({email:'client@example.test',password:'client-password',deviceId:'legacy_client_device_001'}),client=platform.authenticate(login.token);
 await approveFixtureAccount(db,platform,owner,client);await platform.lease(client,'market');
 const real=sqliteRepository(ledger);let saveGate;
 const repository={mode:real.mode,transact:(scope,module,fn)=>real.transact(scope,module,tx=>fn({...tx,save:async(...args)=>{await tx.save(...args);if(saveGate){saveGate.entered.resolve();await saveGate.done.promise;}}}))};
 const cloud=createCloud({repository,authorize:platform.authorizePanel,runOperation:fn=>platform.controlWrite(fn,()=>false)});
 await cloud.mutate(client,'market',operation('import',emptyState(business.id,'market')));
 let row=await cloud.mutate(client,'market',operation('command',{type:'product',product:{name:'Test product',priceCents:1000}}));
 const productId=row.state.products[0].id;
 await cloud.mutate(client,'market',operation('command',{type:'purchase',kind:'products',itemId:productId,qty:2,costCents:300}));
 const body=()=>operation('command',{type:'sale',id:crypto.randomUUID(),lines:[{productId,qty:1}],payment:'cash'});
 const holdSale=()=>{saveGate={entered:deferred(),done:deferred()};const g=saveGate;return{entered:g.entered.promise,release:()=>{saveGate=null;g.done.resolve();}};};
 const state=()=>real.transact(business.id,'market',async tx=>tx.row.state);
 return{db,ledger,platform,cloud,client,body,holdSale,state,close:()=>{db.close();ledger.close();}};
}
function response(){const writes=[];const res={statusCode:200,headersSent:false,status:n=>{res.statusCode=n;return res;},json:body=>{writes.push({method:'json',status:res.statusCode,body});return res;},send:body=>{writes.push({method:'send',status:res.statusCode,body});return res;},end:(...args)=>{writes.push({method:'end',status:res.statusCode,args});if(typeof args.at(-1)==='function')args.at(-1)();return res;}};return{res,writes};}

test('Legacy control paths include patched password routes and exclude AESD queued routes',()=>{
 for(const path of ['/login','/password-reset/confirm','/password-reset/v2/confirm','/password-reset/google/confirm','/account/password/confirm','/account/password-code/confirm','/admin/suspend/2','/admin/resume/2','/admin/extend/2','/admin/phone-licenses/2/suspend','/admin/licenses/2/suspend'])assert.equal(needsLegacyControl({method:'POST',path}),true,path);
 for(const path of ['/aesd/v1/cloud/market','/aesd/v1/password-reset/confirm','/aesd/v1/owner/staff','/admin/audit','/password-reset/request','/administer'])assert.equal(needsLegacyControl({method:'POST',path}),false,path);
 assert.equal(needsLegacyControl({method:'GET',path:'/admin/suspend/2'}),false);
});
test('Legacy account suspension cannot report success before an earlier sale commits',async()=>{
 const f=await fixture();try{const gate=f.holdSale(),sale=f.cloud.mutate(f.client,'market',f.body());await gate.entered;const{res,writes}=response(),middleware=legacyControlMiddleware(()=>f.platform),control=middleware({method:'POST',path:'/admin/suspend/'+f.client.user.id},res,()=>{f.db.prepare('UPDATE users SET active=0 WHERE id=?').run(f.client.user.id);res.json({ok:true});});await new Promise(setImmediate);assert.equal(writes.length,0);assert.equal(f.db.prepare('SELECT active FROM users WHERE id=?').get(f.client.user.id).active,1);gate.release();assert.equal((await sale).state.sales.length,1);await control;assert.equal(writes[0].status,200);await assert.rejects(f.cloud.mutate(f.client,'market',f.body()),e=>e.status===401);assert.equal((await f.state()).sales.length,1);}finally{f.close();}
});
test('A legacy password change invalidates a cloud sale queued during password hashing',async()=>{
 const f=await fixture();try{const hashing=deferred(),entered=deferred(),{res,writes}=response(),middleware=legacyControlMiddleware(()=>f.platform);let handler;
 const control=middleware({method:'POST',path:'/password-reset/v2/confirm'},res,()=>{handler=(async()=>{entered.resolve();await hashing.promise;f.db.prepare('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?').run('changed-password',f.client.user.id);res.json({ok:true});})();});
 await entered.promise;const pending=f.cloud.mutate(f.client,'market',f.body()),denied=assert.rejects(pending,e=>e.status===401);hashing.resolve();await handler;await control;await denied;assert.equal(writes[0].status,200);assert.equal((await f.state()).sales.length,0);}finally{f.close();}
});
test('A legacy response waits for the shared durable snapshot',async()=>{
 let hold=false;const entered=deferred(),done=deferred(),f=await fixture(async()=>{if(hold){entered.resolve();await done.promise;}});try{hold=true;const{res,writes}=response(),control=legacyControlMiddleware(()=>f.platform)({method:'POST',path:'/admin/resume/2'},res,()=>res.json({ok:true}));await entered.promise;assert.equal(writes.length,0);done.resolve();await control;assert.equal(writes[0].status,200);}finally{f.close();}
});
test('A failed legacy snapshot does not return success and fences later operations',async()=>{
 let failure=false;const f=await fixture(async()=>{if(failure)throw Error('Isolated snapshot failure');});try{failure=true;const{res,writes}=response();await legacyControlMiddleware(()=>f.platform)({method:'POST',path:'/admin/resume/2'},res,()=>res.json({ok:true}));assert.equal(writes[0].status,503);assert.equal(f.platform.ready(),false);await assert.rejects(f.cloud.mutate(f.client,'market',f.body()),e=>e.status===503);}finally{f.close();}
});
test('The legacy Google password route keeps its HTML response',async()=>{
 const f=await fixture();try{const{res,writes}=response();await legacyControlMiddleware(()=>f.platform)({method:'POST',path:'/password-reset/google/confirm'},res,()=>res.send('<p>Password saved.</p>'));assert.deepEqual(writes,[{method:'send',status:200,body:'<p>Password saved.</p>'}]);}finally{f.close();}
});
test('A legacy default error response can finish with end and keeps its arguments',async()=>{
 const f=await fixture();try{const{res,writes}=response();let ended=false;const callback=()=>ended=true;await legacyControlMiddleware(()=>f.platform)({method:'POST',path:'/admin/resume/2'},res,()=>{res.status(500).end('<p>Error</p>','utf8',callback);assert.equal(ended,false);});assert.equal(writes.length,1);assert.equal(writes[0].status,500);assert.deepEqual(writes[0].args,['<p>Error</p>','utf8',callback]);assert.equal(ended,true);assert.equal((await f.cloud.mutate(f.client,'market',f.body())).state.sales.length,1);}finally{f.close();}
});
test('A failed snapshot replaces an end-only success response with an error',async()=>{
 let failure=false;const f=await fixture(async()=>{if(failure)throw Error('Isolated snapshot failure');});try{failure=true;const{res,writes}=response();await legacyControlMiddleware(()=>f.platform)({method:'POST',path:'/admin/resume/2'},res,()=>res.end('Success','utf8'));assert.equal(writes.length,1);assert.equal(writes[0].method,'json');assert.equal(writes[0].status,503);}finally{f.close();}
});
test('A closed connection does not release control while its handler can still write',async()=>{
 const f=await fixture();try{const hashing=deferred(),entered=deferred(),{res,writes}=response();let handler;const control=legacyControlMiddleware(()=>f.platform)({method:'POST',path:'/password-reset/v2/confirm'},res,()=>{handler=(async()=>{entered.resolve();await hashing.promise;f.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run('changed-password',f.client.user.id);res.end();})();});await entered.promise;res.destroyed=true;let settled=false;const pending=f.cloud.mutate(f.client,'market',f.body()).then(()=>settled=true,error=>{settled=true;assert.equal(error.status,401);});await new Promise(setImmediate);assert.equal(settled,false);hashing.resolve();await handler;await control;await pending;assert.equal(writes.length,0);assert.equal((await f.state()).sales.length,0);}finally{f.close();}
});
test('AESD financial routes can use their queue without a nested legacy lock',async()=>{
 const f=await fixture();try{const{res}=response();let pending;await legacyControlMiddleware(()=>f.platform)({method:'POST',path:'/aesd/v1/cloud/market'},res,()=>{pending=f.cloud.mutate(f.client,'market',f.body());});assert.equal((await pending).state.sales.length,1);}finally{f.close();}
});
test('Legacy control errors do not expose the internal exception',async()=>{
 const f=await fixture();try{const{res,writes}=response();await legacyControlMiddleware(()=>f.platform)({method:'POST',path:'/admin/resume/2'},res,()=>{throw Error('Internal SQL details');});assert.equal(writes[0].status,500);assert.equal(JSON.stringify(writes).includes('Internal SQL details'),false);}finally{f.close();}
});
