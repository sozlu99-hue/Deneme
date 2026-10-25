import {approveFixtureAccount} from './approved-account-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {sqlite} from '../server/sqlite-adapter.mjs';
import {createPlatform,DAY} from '../server/platform-core.mjs';
import {emptyState,command,validateState} from '../web/pos.js';

const date='2026-10-08T12:00:00Z';
function sold(module='market') {
 let s=emptyState('review-business',module);
 if(module!=='market') {
  s=command(s,{type:'material',name:'Test malzeme'});
  s=command(s,{type:'purchase',kind:'materials',itemId:s.materials[0].id,qty:10,costCents:200},date);
 }
 s=command(s,{type:'product',product:{name:'Test ürün',barcode:'869001',priceCents:1000,recipe:module==='market'?[]:[{materialId:s.materials[0].id,qty:0.5}]}},date);
 if(module==='market')s=command(s,{type:'purchase',kind:'products',itemId:s.products[0].id,qty:10,costCents:200},date);
 return command(s,{type:'sale',id:'review-sale',payment:'cash',lines:[{productId:s.products[0].id,qty:2}]},date);
}
test('A backup cannot inflate stock through a changed cancellation movement',()=>{
 const s=sold();s.sales[0].deductions[0].qty=9;
 assert.throws(()=>validateState(s,s.businessId,s.module),/Stok/);
});
test('A backup cannot omit a sale stock movement',()=>{
 const s=sold();s.sales[0].deductions=[];
 assert.throws(()=>validateState(s,s.businessId,s.module),/Stok/);
});
test('A backup cannot repeat a sale stock movement',()=>{
 const s=sold();s.sales[0].deductions.push({...s.sales[0].deductions[0]});
 assert.throws(()=>validateState(s,s.businessId,s.module),/Stok/);
});
test('A recipe backup cannot change the recorded material use',()=>{
 const s=sold('cafe');s.sales[0].deductions[0].qty=8;
 assert.throws(()=>validateState(s,s.businessId,s.module),/Stok/);
});
test('A backup cannot have duplicate barcodes',()=>{
 const s=sold();s.products.push({...s.products[0],id:'another-product'});
 assert.throws(()=>validateState(s,s.businessId,s.module),/Barkod/);
});
test('A backup rejects markup in record IDs before the UI uses them',()=>{
 const s=sold();s.customers.push({id:'\" onmouseover=\"alert(1)',name:'Test',balanceCents:0});
 assert.throws(()=>validateState(s,s.businessId,s.module),/kimliği/);
});
test('A backup rejects impossible stock balances',()=>{
 const s=sold();s.products[0].stock=200;
 assert.throws(()=>validateState(s,s.businessId,s.module),/Stok/);
});
test('Valid fractional purchases, cancellation and frozen cost still restore',()=>{
 let s=sold('restaurant'),cost=s.sales[0].costCents;
 s=command(s,{type:'purchase',kind:'materials',itemId:s.materials[0].id,qty:0.125,costCents:999},date);
 s=command(s,{type:'cancel',id:'review-sale'},date);
 assert.equal(s.sales[0].costCents,cost);assert.equal(s.materials[0].stock,10.125);
 validateState(structuredClone(s),s.businessId,s.module);
});
test('Registration rejects passwords that bcrypt would truncate',async()=>{
 const db=sqlite();db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,password_hash TEXT,role TEXT,active INTEGER)');
 let hashCalled=false;
 const p=createPlatform({db,secret:'review-test-secret-at-least-32-characters',passwords:{hash:async()=>{hashCalled=true;return 'x';}},persist:async()=>{},ready:()=>true});
 try {for(const password of ['x'.repeat(73),'ş'.repeat(37)])await assert.rejects(p.register({email:'test@example.test',password,businessName:'Test',contactName:'Test',module:'market'}),e=>e.status===400);
 assert.equal(hashCalled,false);assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n,0);
 }finally{db.close();}
});
test('A renewal before first activation retains all purchased days',async()=>{
 const db=sqlite();db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,password_hash TEXT,role TEXT,active INTEGER)');
 db.prepare("INSERT INTO users VALUES(1,'owner@example.test',?,'OWNER',1)").run(await bcrypt.hash('test-password',4));
 const time=Date.parse(date),p=createPlatform({db,secret:'review-test-secret-at-least-32-characters',passwords:{hash:v=>bcrypt.hash(v,4),compare:bcrypt.compare},persist:async()=>{},ready:()=>true,clock:()=>time});
 try {
 const own=p.authenticate((await p.login({email:'owner@example.test',password:'test-password',deviceId:'review_owner_device'})).token);
 const b=await p.register({email:'client@example.test',password:'test-password',businessName:'Test',contactName:'Test',module:'market'});
 const client=p.authenticate((await p.login({email:'client@example.test',password:'test-password',deviceId:'review_client_device'})).token);
 await approveFixtureAccount(db,p,own,client);
 await p.approve(own,b.id);
 const l=await p.grant(own,b.id,{module:'market',plan:'weekly',paymentConfirmed:true});
 await p.changeLicense(own,l.id,{action:'extend',plan:'monthly',paymentConfirmed:true});
 const active=await p.activate(client,{module:'market',code:l.code});
 assert.equal(active.expires,time+37*DAY);
 }finally{db.close();}
});
test('The license migration retains the duration of an existing unactivated license',()=>{
 const db=sqlite();db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,password_hash TEXT,role TEXT,active INTEGER);CREATE TABLE aesd_panel_licenses(id TEXT PRIMARY KEY,business_id TEXT,module TEXT,plan TEXT,active INTEGER,purchased_at INTEGER,activated_at INTEGER,expires INTEGER,device_hash TEXT,activation_hash TEXT,revision INTEGER,last_seen INTEGER)");
 db.prepare("INSERT INTO aesd_panel_licenses VALUES('old-license','old-business','market','yearly',1,100,NULL,NULL,NULL,'test-hash',1,NULL)").run();
 try{
  const options={db,secret:'review-test-secret-at-least-32-characters',passwords:{},persist:async()=>{},ready:()=>true};
  createPlatform(options);assert.equal(db.prepare('SELECT activation_days FROM aesd_panel_licenses').get().activation_days,365);
  db.prepare('UPDATE aesd_panel_licenses SET activation_days=400').run();createPlatform(options);
  assert.equal(db.prepare('SELECT activation_days FROM aesd_panel_licenses').get().activation_days,400);
 }finally{db.close();}
});
