import {approveFixtureAccount} from './approved-account-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {sqlite} from '../server/sqlite-adapter.mjs';
import {sqliteRepository} from '../server/cloud-repository.mjs';
import {createPlatform} from '../server/platform-core.mjs';
import {createCloud} from '../server/cloud-core.mjs';
import {installPlatform} from '../server/install-platform.mjs';
import {emptyState} from '../web/pos.js';

const secret='isolated-cloud-authority-secret-never-for-production';
const passwords={hash:async value=>value,compare:async(a,b)=>a===b};
const operation=(kind,data)=>({operationId:crypto.randomUUID(),kind,data});
async function fixture({serialized=false,installed=false}={}){
 const db=sqlite(),ledger=sqlite();let now=Date.now();
 db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,password_hash TEXT,role TEXT,active INTEGER DEFAULT 1)');
 db.prepare("INSERT INTO users(email,password_hash,role) VALUES('owner@example.test','owner-password','OWNER')").run();
 const options={db,secret,passwords,persist:async()=>{},ready:()=>true,clock:()=>now};
 let platform=createPlatform(options);
 const ownerLogin=await platform.login({email:'owner@example.test',password:'owner-password',deviceId:'authority_owner_device_01'}),owner=platform.authenticate(ownerLogin.token);
 const business=await platform.register({email:'client@example.test',password:'client-password',businessName:'Isolated shop',contactName:'Test person',module:'market'});
 await platform.approve(owner,business.id);
 const grant=await platform.grant(owner,business.id,{module:'market',plan:'monthly',paymentConfirmed:true});
 const login=await platform.login({email:'client@example.test',password:'client-password',deviceId:'authority_client_device_1'}),client=platform.authenticate(login.token);
 await approveFixtureAccount(db,platform,owner,client);await platform.activate(client,{module:'market',code:grant.code});
 const real=sqliteRepository(ledger);
 let pause=null;
 const wait=async phase=>{if(pause?.phase===phase){const p=pause;p.enter();await p.done;}};
 const repository={mode:real.mode,transact:(scope,module,fn)=>real.transact(scope,module,tx=>fn({...tx,receipt:async id=>{const receipt=await tx.receipt(id);await wait('receipt');return receipt;},save:async(...args)=>{await tx.save(...args);await wait('save');}}))};
 const routes=new Map();
 if(installed){const app={get:(path,fn)=>routes.set('get '+path,fn),post:(path,fn)=>routes.set('post '+path,fn)};platform=installPlatform(app,{...options,cloudRepository:repository});}
 const cloud=createCloud({repository,authorize:platform.authorizePanel,clock:()=>now,...(serialized?{runOperation:fn=>platform.controlWrite(fn,()=>false)}:{})});
 await cloud.mutate(client,'market',operation('import',emptyState(business.id,'market')));
 let row=await cloud.mutate(client,'market',operation('command',{type:'product',product:{name:'Test product',priceCents:1000}}));
 const productId=row.state.products[0].id;
 await cloud.mutate(client,'market',operation('command',{type:'purchase',kind:'products',itemId:productId,qty:2,costCents:300}));
 const block=()=>platform.changeLicense(owner,grant.id,{action:'suspend'});
 const body=()=>operation('command',{type:'sale',id:crypto.randomUUID(),lines:[{productId,qty:1}],payment:'cash'});
 const hold=phase=>{let enter,release;const entered=new Promise(resolve=>enter=resolve),done=new Promise(resolve=>release=resolve);pause={phase,enter,done};return{entered,release:()=>{pause=null;release();}};};
 const state=()=>real.transact(business.id,'market',async tx=>tx.row.state);
 const request=async(method,path,{body={},token=login.token}={})=>{let status=200,value;const req={body,params:{module:'market'},query:{},ip:'isolated-test',get:key=>key==='Authorization'?'Bearer '+token:undefined},res={set:()=>res,status:n=>{status=n;return res;},json:v=>{value=v;return res;}};await routes.get(method+' /aesd/v1'+path)(req,res);return{status,value};};
 return{db,ledger,cloud,platform,owner,client,block,body,hold,state,request,real,businessId:business.id,advance:n=>now+=n,close:()=>{db.close();ledger.close();}};
}

test('A license closed during receipt lookup cannot commit a cloud sale',async()=>{
 const f=await fixture();try{const gate=f.hold('receipt'),pending=f.cloud.mutate(f.client,'market',f.body()),denied=assert.rejects(pending,e=>e.status===403);await gate.entered;await f.block();gate.release();await denied;const state=await f.state();assert.equal(state.sales.length,0);assert.equal(state.products[0].stock,2);}finally{f.close();}
});
test('A duplicate operation does not expose panel data after its license closes',async()=>{
 const f=await fixture();try{const body=f.body();await f.cloud.mutate(f.client,'market',body);const gate=f.hold('receipt'),pending=f.cloud.mutate(f.client,'market',body),denied=assert.rejects(pending,e=>e.status===403);await gate.entered;await f.block();gate.release();await denied;assert.equal((await f.state()).sales.length,1);}finally{f.close();}
});
test('A cloud receipt response rechecks the license after database lookup',async()=>{
 const f=await fixture();try{const body=f.body();await f.cloud.mutate(f.client,'market',body);const gate=f.hold('receipt'),pending=f.cloud.receipt(f.client,'market',body.operationId),denied=assert.rejects(pending,e=>e.status===403);await gate.entered;await f.block();gate.release();await denied;}finally{f.close();}
});
test('A changed role cannot redirect an in-flight request to an old tenant record',async()=>{
 const f=await fixture();try{const gate=f.hold('receipt'),pending=f.cloud.mutate(f.client,'market',f.body()),denied=assert.rejects(pending,e=>e.status===403);await gate.entered;f.db.prepare("UPDATE users SET role='OWNER' WHERE id=?").run(f.client.user.id);gate.release();await denied;assert.equal((await f.state()).sales.length,0);}finally{f.close();}
});
test('Shared control serialization makes a license closure wait for a sale transaction',async()=>{
 const f=await fixture({serialized:true});try{const gate=f.hold('save'),pending=f.cloud.mutate(f.client,'market',f.body());await gate.entered;let blocked=false;const closure=f.block().then(()=>blocked=true);await new Promise(setImmediate);assert.equal(blocked,false);gate.release();const result=await pending;await closure;assert.equal(result.state.sales.length,1);assert.equal(blocked,true);await assert.rejects(f.cloud.mutate(f.client,'market',f.body()),e=>e.status===403);assert.equal((await f.state()).sales.length,1);}finally{f.close();}
});
test('A sale queued after a license closure cannot use its earlier principal',async()=>{
 const f=await fixture({serialized:true});try{const closure=f.block(),pending=f.cloud.mutate(f.client,'market',f.body()),denied=assert.rejects(pending,e=>e.status===403);await closure;await denied;assert.equal((await f.state()).sales.length,0);}finally{f.close();}
});
test('Session expiry during receipt lookup rejects the sale and retains stock',async()=>{
 const f=await fixture();try{const gate=f.hold('receipt'),pending=f.cloud.mutate(f.client,'market',f.body()),denied=assert.rejects(pending,e=>e.status===401);await gate.entered;f.advance(8*3600000+1);gate.release();await denied;assert.equal((await f.state()).products[0].stock,2);}finally{f.close();}
});
test('A license closed during database save rolls back the sale and stock deduction',async()=>{
 const f=await fixture();try{const gate=f.hold('save'),pending=f.cloud.mutate(f.client,'market',f.body()),denied=assert.rejects(pending,e=>e.status===403);await gate.entered;await f.block();gate.release();await denied;const state=await f.state();assert.equal(state.sales.length,0);assert.equal(state.products[0].stock,2);}finally{f.close();}
});
test('A direct cloud read cannot return records after a pending license closure',async()=>{
 const f=await fixture();try{let enter,release;const entered=new Promise(resolve=>enter=resolve),done=new Promise(resolve=>release=resolve),cloud=createCloud({authorize:f.platform.authorizePanel,repository:{mode:'isolated-read',read:async(scope,module)=>{const row=await f.real.transact(scope,module,async tx=>tx.row);enter();await done;return row;}}});const pending=cloud.read(f.client,'market'),denied=assert.rejects(pending,e=>e.status===403);await entered;await f.block();release();await denied;}finally{f.close();}
});
test('Installed cloud routes serialize sale commits with owner license control',async()=>{
 const f=await fixture({installed:true});try{const gate=f.hold('save'),pending=f.request('post','/cloud/:module',{body:f.body()});await gate.entered;let blocked=false;const closure=f.block().then(()=>blocked=true);await new Promise(setImmediate);assert.equal(blocked,false);gate.release();assert.equal((await pending).status,200);await closure;const denied=await f.request('post','/cloud/:module',{body:f.body()});assert.equal(denied.status,403);assert.equal((await f.state()).sales.length,1);}finally{f.close();}
});
