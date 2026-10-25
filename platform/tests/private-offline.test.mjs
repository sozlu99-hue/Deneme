import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import {IDBFactory} from 'fake-indexeddb';
import {createRequire} from 'node:module';
import {sqlite} from '../server/sqlite-adapter.mjs';
import {sqliteRepository} from '../server/cloud-repository.mjs';
import {createPlatform} from '../server/platform-core.mjs';
import {createCloud} from '../server/cloud-core.mjs';
import {privateProjection,privateMenu,menuRelease,privateTransition} from '../server/private-engine.mjs';
import {openPrivateOfflineStore,verifyOfflinePermit} from '../web/private-offline-store.js';
import {cloudMeta} from '../web/cloud-store.js';
const {launch,base,wait,add}=createRequire(import.meta.url)('../legacy-tests/tests/pos-harness.cjs');
const c=vm.createContext({structuredClone});vm.runInContext(fs.readFileSync('web/private-menu.js','utf8'),c);
const op=(kind,data,more={})=>({operationId:crypto.randomUUID(),kind,data,...more});
let original;
async function fixture({grams=5000,migrate=true}={}){
 globalThis.indexedDB=new IDBFactory();
 if(!original){const app=await launch(undefined,base());original=privateProjection(app.store());}
 const db=sqlite();db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,password_hash TEXT,role TEXT,active INTEGER)');db.exec("INSERT INTO users VALUES(1,'offline@example.test','isolated-owner-password','OWNER',1)");
 let now=Date.now(),offline=false,lost=false;
 const platform=createPlatform({db,secret:'isolated-offline-permit-test-secret-only',passwords:{hash:async x=>x,compare:async(a,b)=>a===b},persist:async()=>{},ready:()=>true,clock:()=>now});
 const login=await platform.login({email:'offline@example.test',password:'isolated-owner-password',deviceId:'offline_test_device_001',remember:true});let principal=platform.authenticate(login.token);
 const cloud=createCloud({repository:sqliteRepository(db),authorize:platform.authorizePanel,signOffline:platform.signOffline,verifyOffline:platform.verifyOffline,catalogMigration:migrate,clock:()=>now});
 const seed=structuredClone(original);seed.stock.find(p=>p.id==='s1').gram=grams;await cloud.mutate(principal,'private',op('import',seed));
 const api=async(path,body)=>{if(offline)throw Object.assign(Error('Test network loss'),{network:true});let r;if(body)r=await cloud.mutate(principal,'private',body);else if(path.includes('/operations/'))r=await cloud.receipt(principal,'private',path.split('/').at(-1));else r=await cloud.read(principal,'private');if(lost&&body){lost=false;throw Object.assign(Error('Test response loss'),{network:true});}return r;};
 const open=(customApi=api)=>openPrivateOfflineStore({businessId:'owner:1',deviceId:principal.deviceId,publicKey:platform.publicKey,api:customApi,chooseMigration:async()=> 'server',clock:()=>now});
 const initialize=async(customApi=api)=>{const s=await open(customApi);await s.initialize(seed);return s;};
 return{db,platform,cloud,api,initialize,clock:()=>now,get principal(){return principal;},set offline(v){offline=v;},set lost(v){lost=v;},advance:ms=>now+=ms,relogin:async()=>{principal=platform.authenticate((await platform.login({email:'offline@example.test',password:'isolated-owner-password',deviceId:'offline_test_device_001',remember:true})).token);}};
}
function sale(state,qty=1,method='Nakit'){
 const product=state.products.find(p=>p.id==='p1'),items=[{productId:product.id,name:product.name,price:product.price,qty}],total=qty*product.price;
 return{id:crypto.randomUUID(),date:new Date().toISOString(),receiptNo:'OFFLINE-'+crypto.randomUUID().slice(0,8),cashier:'Test Owner',registerId:state.activeRegisterId,items,subtotal:total,discount:0,total,payments:[{method,amount:total}],status:'completed',stockUsageRecorded:true,stockUsage:globalThis.OSESFinance.doughUsage(items,state.products,state.stock),...globalThis.OSESCost.sale(items,state.products,state.stock,total)};
}
const nextSale=(state,s)=>({...structuredClone(state),sales:[s,...state.sales]});
test('The menu has all eight prices, including 680 TL family and 180 TL Doritos mega',async()=>{
 const f=await fixture(),r=await f.cloud.read(f.principal,'private');for(const row of c.AESDPrivateMenu.rows){const p=r.state.products.find(p=>p.name===row.name);assert.equal(p.price,row.price);assert.equal(p.gramUsage,row.grams);assert.equal(p.aesdPhoto,row.photo);}
 assert.equal(r.state.products.find(p=>p.id==='aesd_doritos_150').costRecipe.find(l=>l.stockId==='aesd_doritos_portion').amount,1);assert.equal(r.state.stock.find(p=>p.id==='aesd_doritos_portion').costing,undefined);f.db.close();
});
test('The menu migration preserves history, passwords and stock and runs once',async()=>{
 const app=await launch(undefined,base());await add(app,'p1');await app.store().checkout([{method:'Nakit',amount:50}]);await wait(()=>app.store().sales.length===1);const before=JSON.parse(JSON.stringify(app.store())),after=c.AESDPrivateMenu.apply(before);
 assert.deepEqual(after.sales,before.sales);assert.deepEqual(after.security,before.security);assert.equal(after.stock[0].gram,before.stock[0].gram);after.products.find(p=>p.id==='p1').price=111;assert.equal(c.AESDPrivateMenu.apply(after).products.find(p=>p.id==='p1').price,111);
});
test('The private panel loads the actual migrated menu with no render exception',async()=>{
 const app=await launch(undefined,base(),{menu:true});assert.equal(app.store().products.find(p=>p.id==='p5').price,680);assert.equal(app.store().products.find(p=>p.id==='aesd_doritos_150').price,180);assert.deepEqual(app.errors,[]);
});
test('A signed offline permit rejects changed data, another owner, another device and expiry',async()=>{
 const f=await fixture(),r=await f.cloud.read(f.principal,'private'),options={businessId:'owner:1',deviceId:f.principal.deviceId,now:f.clock()};assert(await verifyOfflinePermit(r.offlinePermit,r.state,f.platform.publicKey,options));const modified=structuredClone(r.state);modified.products[0].price++;
 for(const [base,opts]of [[modified,options],[r.state,{...options,businessId:'owner:2'}],[r.state,{...options,deviceId:'foreign_device_001'}],[r.state,{...options,now:f.clock()+86400001}]])assert.equal(await verifyOfflinePermit(r.offlinePermit,base,f.platform.publicKey,opts),false);f.db.close();
});
test('An offline cash sale is durable before confirmation and survives store reopen',async()=>{
 const f=await fixture(),s=await f.initialize(),before=await s.read();f.offline=true;const paid=sale(before),saved=await s.commitPrivateSale(before,nextSale(before,paid));assert.equal(saved.sales[0].syncStatus,'queued');assert.equal(s.details().count,1);s.close();const reopened=await f.initialize();assert.equal((await reopened.read()).sales[0].id,paid.id);assert.equal(reopened.details().count,1);assert.equal((await f.cloud.read(f.principal,'private')).state.sales.length,0);reopened.close();f.db.close();
});
test('Two offline sales synchronize once each, retain totals and deduct only dough',async()=>{
 const f=await fixture(),s=await f.initialize();f.offline=true;let state=await s.read();const a=sale(state);await s.commitPrivateSale(state,nextSale(state,a));state=await s.read();const b=sale(state,1,'Kart');await s.commitPrivateSale(state,nextSale(state,b));assert.equal(s.details().count,2);f.offline=false;await s.poll();const remote=await f.cloud.read(f.principal,'private');assert.equal(remote.state.sales.length,2);assert.equal(remote.state.stock.find(p=>p.id==='s1').gram,4800);assert.equal(remote.state.stock.find(p=>p.id==='s4').gram,1000);assert.deepEqual(remote.state.sales.map(s=>s.total),[100,100]);assert.equal(s.details().count,0);s.close();f.db.close();
});
test('A lost success response retries the same operation without a second charge record',async()=>{
 const f=await fixture(),s=await f.initialize(),before=await s.read();f.offline=true;const paid=sale(before);await s.commitPrivateSale(before,nextSale(before,paid));f.offline=false;f.lost=true;await assert.rejects(s.poll(),/response loss/);assert.equal(s.details().count,1);await s.poll();const r=await f.cloud.read(f.principal,'private');assert.equal(r.state.sales.length,1);assert.equal(r.state.cashMoves.filter(m=>m.refId===paid.id).length,1);assert.equal(r.state.stock[0].gram,4900);s.close();f.db.close();
});
test('A stale browser tab cannot replace or duplicate a durable queued sale',async()=>{
 const f=await fixture(),a=await f.initialize(),b=await f.initialize(),before=await a.read();f.offline=true;const paid=sale(before);await a.commitPrivateSale(before,nextSale(before,paid));const other=sale(before);await assert.rejects(b.commitPrivateSale(before,nextSale(before,other)),/Başka sekme/);assert.equal((await a.pendingBackup()).queue.length,1);a.close();b.close();f.db.close();
});
test('A new purchase cannot revise the cost of an earlier queued sale',async()=>{
 const f=await fixture(),s=await f.initialize(),before=await s.read();f.offline=true;const paid=sale(before);await s.commitPrivateSale(before,nextSale(before,paid));let current=(await f.cloud.read(f.principal,'private')).state;current=structuredClone(current);current.stock[0].costing={unit:'gr',totalBaseQty:1000,totalPurchasePrice:999,unitCost:.999,entries:[]};current.stock[0].gram+=1000;await f.cloud.mutate(f.principal,'private',op('private-state',current,{expectedRevision:1}));f.offline=false;await s.poll();const remote=await f.cloud.read(f.principal,'private');assert.equal(remote.state.sales[0].cost,paid.cost);assert.deepEqual(remote.state.sales[0].costDetails,paid.costDetails);s.close();f.db.close();
});
test('Two devices can keep paid sales of the last stock and show the stock shortfall',async()=>{
 const f=await fixture({grams:100}),r=await f.cloud.read(f.principal,'private'),a=sale(r.state),b=sale(r.state);
 const bodies=[a,b].map(s=>op('offline-private-sale',{base:r.state,permit:r.offlinePermit,event:{sale:s,orderId:null}}));await Promise.all(bodies.map(body=>f.cloud.mutate(f.principal,'private',body)));const remote=await f.cloud.read(f.principal,'private');assert.equal(remote.state.sales.length,2);assert.equal(remote.state.stock[0].gram,0);assert.equal(remote.state.stock[0].offlineDeficit,100);assert.equal(remote.state.sales.filter(s=>s.syncWarning?.some(w=>w.kind==='stock-shortage')).length,1);f.db.close();
});
test('A stock receipt pays off the offline deficit before exposing available stock',async()=>{
 const f=await fixture({grams:100}),r=await f.cloud.read(f.principal,'private');for(let i=0;i<2;i++)await f.cloud.mutate(f.principal,'private',op('offline-private-sale',{base:r.state,permit:r.offlinePermit,event:{sale:sale(r.state),orderId:null}}));const current=(await f.cloud.read(f.principal,'private')).state,next=structuredClone(current);next.stock[0].gram=150;const settled=privateTransition(current,next);assert.equal(settled.stock[0].gram,50);assert.equal(settled.stock[0].offlineDeficit,0);next.stock[0].offlineDeficit=0;assert.throws(()=>privateTransition(current,next),/Stok farkı/);f.db.close();
});
test('A forged old price or changed signed base cannot enter the server ledger',async()=>{
 const f=await fixture(),r=await f.cloud.read(f.principal,'private'),paid=sale(r.state);paid.items[0].price--;paid.subtotal--;paid.total--;paid.payments[0].amount--;await assert.rejects(f.cloud.mutate(f.principal,'private',op('offline-private-sale',{base:r.state,permit:r.offlinePermit,event:{sale:paid}})),/fiyatı/);
 const altered=structuredClone(r.state);altered.products[0].price++;await assert.rejects(f.cloud.mutate(f.principal,'private',op('offline-private-sale',{base:altered,permit:r.offlinePermit,event:{sale:sale(altered)}})),/izni/);assert.equal((await f.cloud.read(f.principal,'private')).state.sales.length,0);f.db.close();
});
test('Expiry stops new offline payments while preserving already paid queue records',async()=>{
 const f=await fixture(),s=await f.initialize();f.offline=true;const before=await s.read(),paid=sale(before);await s.commitPrivateSale(before,nextSale(before,paid));f.advance(86400001);const current=await s.read();await assert.rejects(s.commitPrivateSale(current,nextSale(current,sale(current))),/izin süresi/);assert.equal(s.details().count,1);f.offline=false;await f.relogin();await s.poll();assert.equal((await f.cloud.read(f.principal,'private')).state.sales.length,1);s.close();f.db.close();
});
test('Administrative writes wait for queued payments and preserve the queue backup',async()=>{
 const f=await fixture(),s=await f.initialize();f.offline=true;const before=await s.read();await s.commitPrivateSale(before,nextSale(before,sale(before)));await assert.rejects(s.commitPrivate(await s.read()),/Önce bekleyen/);const backup=await s.pendingBackup();assert.equal(backup.queue.length,1);assert.equal(backup.contexts[backup.queue[0].contextId].permit.startsWith('aesd-offline1.'),true);s.close();f.db.close();
});
test('The real private checkout clears its basket only after durable offline storage',async()=>{
 const f=await fixture(),s=await f.initialize();const prepareWindow=w=>{w.eval(fs.readFileSync('web/private-cloud.js','utf8'));w.parent.aesdPrivateCloud=async()=>s;};
 const app=await launch(undefined,base(),{menu:true,prepareWindow});await wait(()=>app.w.AESDPrivateSync);f.offline=true;await add(app,'p1');const paid=await app.store().checkout([{method:'Nakit',amount:100}]);assert(paid);await wait(()=>app.store().sales.length===1&&app.store().cart.length===0);assert.equal(s.details().count,1);assert.equal(app.store().sales[0].syncStatus,'queued');assert.equal(app.store().stock[0].gram,4900);assert.deepEqual(app.errors,[]);f.offline=false;await app.w.AESDPrivateSync.poll();assert.equal((await f.cloud.read(f.principal,'private')).state.sales.length,1);s.close();f.db.close();
});
test('Device storage failure cannot confirm payment or send it to the server',async()=>{
 const f=await fixture(),s=await f.initialize(),before=await s.read(),savedFactory=globalThis.indexedDB;f.offline=true;
 globalThis.indexedDB={open(...args){const request=savedFactory.open(...args);request.addEventListener('success',()=>{const db=request.result,transaction=db.transaction.bind(db);db.transaction=(...args)=>{const tx=transaction(...args);if(args[1]==='readwrite')queueMicrotask(()=>tx.abort());return tx;};});return request;}};
 try{await assert.rejects(s.commitPrivateSale(before,nextSale(before,sale(before))),/Cihaz kaydı/);}finally{globalThis.indexedDB=savedFactory;}
 assert.equal((await s.pendingBackup()).queue.length,0);assert.equal((await f.cloud.read(f.principal,'private')).state.sales.length,0);s.close();f.db.close();
});
test('A sale captured before permit expiry can synchronize after a new login',async()=>{
 const f=await fixture(),r=await f.cloud.read(f.principal,'private'),paid=sale(r.state),body=op('offline-private-sale',{base:r.state,permit:r.offlinePermit,event:{sale:paid,orderId:null}});f.advance(15*86400000);await f.relogin();await f.cloud.mutate(f.principal,'private',body);const result=await f.cloud.read(f.principal,'private');assert.equal(result.state.sales.length,1);assert.equal(result.state.sales[0].total,100);f.db.close();
});
test('An offline sale linked to a closed register keeps its original cash record and flags it',async()=>{
 const f=await fixture(),r=await f.cloud.read(f.principal,'private'),paid=sale(r.state),closed=structuredClone(r.state);closed.registerSessions.find(r=>r.id===paid.registerId).status='closed';await f.cloud.mutate(f.principal,'private',op('private-state',closed,{expectedRevision:r.revision}));const result=await f.cloud.mutate(f.principal,'private',op('offline-private-sale',{base:r.state,permit:r.offlinePermit,event:{sale:paid,orderId:null}}));assert.equal(result.state.sales[0].syncWarning[0].kind,'closed-register');assert.equal(result.state.cashMoves[0].registerId,paid.registerId);assert.equal(result.state.registerSessions.find(r=>r.id===paid.registerId).status,'closed');f.db.close();
});
test('A delayed server ACK keeps a second sale written during synchronization',async()=>{
 const f=await fixture();let release,started,paused=false;const gate=new Promise(r=>release=r),begin=new Promise(r=>started=r);const api=async(...args)=>{const result=await f.api(...args);if(!paused&&args[1]?.kind==='offline-private-sale'){paused=true;started();await gate;}return result;};
 const s=await f.initialize(api);f.offline=true;let before=await s.read();await s.commitPrivateSale(before,nextSale(before,sale(before)));f.offline=false;const flush=s.poll();await begin;before=await s.read();await s.commitPrivateSale(before,nextSale(before,sale(before)));assert.equal(s.details().count,2);release();await flush;assert.equal(s.details().count,0);assert.equal((await f.cloud.read(f.principal,'private')).state.sales.length,2);s.close();f.db.close();
});
test('Cancellation settles a stock shortfall and restores the original sale cost',async()=>{
 const f=await fixture({grams:100}),r=await f.cloud.read(f.principal,'private');for(let i=0;i<2;i++)await f.cloud.mutate(f.principal,'private',op('offline-private-sale',{base:r.state,permit:r.offlinePermit,event:{sale:sale(r.state),orderId:null}}));const current=(await f.cloud.read(f.principal,'private')).state,next=structuredClone(current);next.sales[0].status='cancelled';next.sales[0].cancelledAt=new Date().toISOString();next.stock[0].gram=100;assert.throws(()=>privateTransition(current,next),/kasa iade hareketi/);const refunded=next.sales[0],cash=refunded.payments.filter(p=>p.method==='Nakit').reduce((n,p)=>n+p.amount,0);next.cashMoves.unshift({id:'audit-cancel-refund',kind:'refund',amount:cash,registerId:current.registerSessions.find(r=>r.status==='open').id,refId:refunded.id,date:new Date().toISOString()});const result=privateTransition(current,next);assert.equal(result.stock[0].gram,0);assert.equal(result.stock[0].offlineDeficit,0);assert.equal(result.sales[0].cost,current.sales[0].cost);f.db.close();
});
test('A changed table order remains open when an earlier offline payment synchronizes',async()=>{
 const f=await fixture(),first=await f.cloud.read(f.principal,'private'),withOrder=structuredClone(first.state),id=crypto.randomUUID();withOrder.orders.push({id,label:'Test Table',items:[{productId:'p1',qty:1,price:100}],discount:0});await f.cloud.mutate(f.principal,'private',op('private-state',withOrder,{expectedRevision:first.revision}));const signed=await f.cloud.read(f.principal,'private'),changed=structuredClone(signed.state);changed.orders[0].items[0].qty=2;await f.cloud.mutate(f.principal,'private',op('private-state',changed,{expectedRevision:signed.revision}));const r=await f.cloud.mutate(f.principal,'private',op('offline-private-sale',{base:signed.state,permit:signed.offlinePermit,event:{sale:sale(signed.state),orderId:id}}));assert.equal(r.state.orders[0].items[0].qty,2);assert.equal(r.state.sales[0].syncWarning[0].kind,'order-changed');f.db.close();
});
test('An unreadable 403 retains a saved private edit and recovers it after store reopen',async()=>{
 const f=await fixture();let lost=false;const api=async(...args)=>{const result=await f.api(...args);if(lost&&args[1]?.kind==='private-state'){lost=false;throw Object.assign(Error('Unreadable response'),{status:403,uncertain:true});}return result;};let store,reopened;
 try{store=await f.initialize(api);const before=await store.read(),next=structuredClone(before);next.products[0].price+=1;lost=true;await assert.rejects(store.commitPrivate(next,before),e=>e.status===403&&e.uncertain);const pending=await cloudMeta('owner:1:private:pending');assert.ok(pending.operationId);assert.equal((await f.cloud.read(f.principal,'private')).state.products[0].price,next.products[0].price);store.close();reopened=await f.initialize(api);assert.equal(await cloudMeta('owner:1:private:pending'),null);assert.equal((await reopened.read()).products[0].price,next.products[0].price);assert.equal((await f.cloud.receipt(f.principal,'private',pending.operationId)).found,true);}finally{store?.close();reopened?.close();f.db.close();}
});
test('An unreadable 403 retains a paid offline sale and retries the same record once',async()=>{
 const f=await fixture();let lost=false;const api=async(...args)=>{const result=await f.api(...args);if(lost&&args[1]?.kind==='offline-private-sale'){lost=false;throw Object.assign(Error('Unreadable response'),{status:403,uncertain:true});}return result;};let store;
 try{store=await f.initialize(api);f.offline=true;const before=await store.read(),paid=sale(before);await store.commitPrivateSale(before,nextSale(before,paid));f.offline=false;lost=true;await assert.rejects(store.poll(),e=>e.status===403&&e.uncertain);assert.equal(store.details().count,1);await store.poll();const remote=await f.cloud.read(f.principal,'private');assert.equal(store.details().count,0);assert.equal(remote.state.sales.length,1);assert.equal(remote.state.sales[0].id,paid.id);assert.equal(remote.state.stock[0].gram,4900);assert.equal(remote.state.cashMoves.filter(row=>row.refId===paid.id).length,1);}finally{store?.close();f.db.close();}
});
