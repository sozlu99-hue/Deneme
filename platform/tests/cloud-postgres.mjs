import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import {createRequire} from 'node:module';import {postgresRepository} from '../server/cloud-repository.mjs';import {createCloud} from '../server/cloud-core.mjs';import {emptyState} from '../web/pos.js';
const require=createRequire(new URL('../../package.json',import.meta.url)),{Pool}=require('pg');
const pool=new Pool({connectionString:'postgres://postgres:isolated-sync-test-only@127.0.0.1:55432/aesd_test',max:4});
const id='pg-test-'+crypto.randomUUID(),authorize=()=>id,p={},op=(kind,data,extra={})=>({operationId:crypto.randomUUID(),kind,data,...extra});
const a=createCloud({repository:postgresRepository(pool),authorize}),b=createCloud({repository:postgresRepository(pool),authorize});
test('Postgres row locks serialize two services competing for the last stock',async()=>{await a.mutate(p,'market',op('import',emptyState(id,'market')));let r=await a.mutate(p,'market',op('command',{type:'product',product:{name:'Test Product',priceCents:1000}}));const productId=r.state.products[0].id;await a.mutate(p,'market',op('command',{type:'purchase',kind:'products',itemId:productId,qty:1,costCents:200}));const results=await Promise.allSettled([a,b].map(c=>c.mutate(p,'market',op('command',{type:'sale',id:crypto.randomUUID(),lines:[{productId,qty:1}],payment:'card'}))));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);r=await b.read(p,'market');assert.equal(r.state.products[0].stock,0);assert.equal(r.state.sales.length,1);});
test('Postgres keeps one receipt for concurrent retries from separate services',async()=>{const body=op('command',{type:'customer',name:'Test Account'});const rows=await Promise.all([a.mutate(p,'market',body),b.mutate(p,'market',body)]);assert.equal(rows.filter(r=>r.duplicate).length,1);assert.equal((await b.read(p,'market')).state.customers.length,1);assert.equal((await a.receipt(p,'market',body.operationId)).found,true);});
test('Postgres rolls back an invalid operation and retains the revision',async()=>{const before=await a.read(p,'market');await assert.rejects(b.mutate(p,'market',op('command',{type:'purchase',kind:'products',itemId:'missing',qty:1,costCents:1})));const after=await b.read(p,'market');assert.deepEqual(after.state,before.state);assert.equal(after.revision,before.revision);});
test('A new repository reads durable Postgres records and respects scope isolation',async()=>{const reopen=createCloud({repository:postgresRepository(pool),authorize}),r=await reopen.read(p,'market');assert.equal(r.state.sales.length,1);const unchanged=await reopen.read(p,'market',r.revision);assert.equal(unchanged.initialized,true);assert.equal('state' in unchanged,false);const foreign=createCloud({repository:postgresRepository(pool),authorize:()=>id+'-other'});assert.equal((await foreign.read(p,'market')).initialized,false);});
const {launch,base,wait,add,get}=createRequire(import.meta.url)('../legacy-tests/tests/pos-harness.cjs');
async function privateDevice(cloud=a){
 const prepareWindow=w=>{w.eval(fs.readFileSync('web/private-cloud.js','utf8'));w.parent.aesdPrivateCloud=async({initial,status})=>{
  let current=await cloud.read(p,'private');if(!current.initialized)current=await cloud.mutate(p,'private',op('import',initial));
  return{read:async()=>current.state,commitPrivate:async data=>{current=await cloud.mutate(p,'private',op('private-state',data,{expectedRevision:current.revision}));status('synced',current.updatedAt);return current.state;},poll:async()=>{const next=await cloud.read(p,'private',current.revision);if(next.state)current=next;return current.state;},close(){}};
 };};
 const app=await launch(undefined,base(),{prepareWindow});await wait(()=>app.w.AESDPrivateSync);
 const expected=await cloud.read(p,'private');await wait(()=>app.store().sales.length===expected.state.sales.length);return app;
}
async function threeProducts(app){for(let qty=1;qty<=3;qty++){await add(app,'p1');await wait(()=>app.store().cart[0]?.qty===qty);}}
test('Postgres private checkout accepts consecutive 150 TL payments across JSONB and device reload',async()=>{
 const first=await privateDevice();await threeProducts(first);const cash=await first.store().checkout([{method:'Nakit',amount:150}]);assert(cash,JSON.stringify(first.store().toasts));await wait(()=>first.store().sales.length===1);
 const persisted=await a.read(p,'private');assert.notEqual(JSON.stringify(first.w.AESDPrivateSync.get().sales[0]),JSON.stringify(persisted.state.sales[0]),'JSONB must reproduce a different field order');
 await threeProducts(first);const card=await first.store().checkout([{method:'Kart',amount:150}]);assert(card,JSON.stringify(first.store().toasts));await wait(()=>first.store().sales.length===2);
 const reopened=await privateDevice(b);assert.equal(reopened.store().sales.length,2);await threeProducts(reopened);const split=await reopened.store().checkout([{method:'Nakit',amount:50},{method:'Kart',amount:100}]);assert(split,JSON.stringify(reopened.store().toasts));await wait(()=>reopened.store().sales.length===3);
 const final=await b.read(p,'private');assert.equal(final.state.sales.length,3);assert.deepEqual(final.state.sales.map(s=>s.total),[150,150,150]);assert.equal(final.state.stock.find(s=>s.id==='s1').gram,4100);assert.equal(final.state.stock.find(s=>s.id==='s4').gram,1000);assert.equal(final.state.sales.find(s=>s.id===cash.id).cost,cash.cost);assert.deepEqual(final.state.sales.find(s=>s.id===split.id).payments,[{method:'Nakit',amount:50},{method:'Kart',amount:100}]);assert.deepEqual(first.errors,[]);assert.deepEqual(reopened.errors,[]);
});
test('Postgres rejects changes to past sale amounts, costs and payment details without a receipt',async()=>{
 const original=await a.read(p,'private');assert.equal(original.state.sales.length,3);
 for(const edit of [s=>{s.total+=1;s.subtotal+=1;s.payments[0].amount+=1;},s=>{s.cost+=1;},s=>{s.items[0].name='Changed past product';},s=>{s.payments[0].method='Diğer';},s=>{s.costDetails[0].qty+=1;}]){
  const next=structuredClone(original.state);edit(next.sales[0]);const body=op('private-state',next,{expectedRevision:original.revision});
  await assert.rejects(a.mutate(p,'private',body),/Geçmiş satışın tutarı veya maliyeti değiştirilemez/);assert.equal((await a.receipt(p,'private',body.operationId)).found,false);
  const after=await b.read(p,'private');assert.equal(after.revision,original.revision);assert.deepEqual(after.state,original.state);
 }
});
test('Postgres recognizes the same private ledger after field reorder without replacing records',async()=>{
 const before=await a.read(p,'private'),reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reorder(x)])):v;
 const result=await b.mutate(p,'private',op('import',reorder(before.state)));assert.equal(result.alreadyImported,true);assert.equal(result.revision,before.revision);assert.deepEqual(result.state,before.state);
});
test.after(async()=>{await pool.query('DELETE FROM aesd_cloud_operations WHERE scope=$1',[id]);await pool.query('DELETE FROM aesd_cloud_panels WHERE scope=$1 OR scope=$2',[id,id+'-other']);await pool.end();});
