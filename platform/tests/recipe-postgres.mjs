import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {staffFixture} from './staff-fixture.mjs';import {privateStaffSale} from '../server/private-engine.mjs';import {postgresRepository} from '../server/cloud-repository.mjs';import {createCloud} from '../server/cloud-core.mjs';
const require=createRequire(import.meta.url),{Pool}=require('pg'),url=process.env.TEST_PG_URL;
if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('An explicit isolated loopback PostgreSQL URL is required.');
test('PostgreSQL recipe sale serializes the last two lettuce parts and deduplicates its receipt after reopen',async t=>{
 const pool=new Pool({connectionString:url,max:4});t.after(()=>pool.end());const fixture=await staffFixture();t.after(()=>fixture.close());const seed=structuredClone((await fixture.cloud.read(fixture.owner,'private')).state);
 seed.stock.find(m=>m.id==='s1').gram=10000;seed.stock.find(m=>m.id==='s1').costing={unit:'gr',totalBaseQty:10000,totalPurchasePrice:1200,unitCost:.12,entries:[]};seed.stock.push({id:'pg-lettuce',name:'PG synthetic lettuce',unit:'parca',gram:2,critical:0,costing:{unit:'parca',totalBaseQty:2,totalPurchasePrice:20,unitCost:10,entries:[]}});
 const p=seed.products[0];Object.assign(p,{recipeStock:true,costMode:'recipe',gramUsage:1000,costExtra:0,costRecipe:[{stockId:'s1',amount:1000,unit:'gr'},{stockId:'pg-lettuce',amount:2,unit:'parca'}]});
 const scope='recipe-pg-'+crypto.randomUUID(),authorize=()=>scope,a=createCloud({repository:postgresRepository(pool),authorize}),b=createCloud({repository:postgresRepository(pool),authorize}),principal={};
 const imported=await a.mutate(principal,'private',{kind:'import',operationId:crypto.randomUUID(),data:seed});
 const requests=['A','B'].map(suffix=>({kind:'private-state',operationId:crypto.randomUUID(),expectedRevision:imported.revision,data:privateStaffSale(seed,{items:[{productId:p.id,qty:1,price:p.price}],payments:[{method:'Kart',amount:p.price}]},{saleId:'recipe-'+suffix,cashier:'Synthetic',date:new Date().toISOString(),deviceId:'synthetic-device',grantId:'synthetic-grant'})}));
 const results=await Promise.allSettled([a.mutate(principal,'private',requests[0]),b.mutate(principal,'private',requests[1])]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const won=results.findIndex(r=>r.status==='fulfilled'),reopen=createCloud({repository:postgresRepository(pool),authorize}),current=await reopen.read(principal,'private');assert.equal(current.state.stock.find(m=>m.id==='pg-lettuce').gram,0);assert.equal(current.state.stock.find(m=>m.id==='s1').gram,9000);assert.equal(current.state.sales.length,1);assert.equal(current.state.sales[0].cost,140);
 const retry=await reopen.mutate(principal,'private',requests[won]);assert.equal(retry.duplicate,true);assert.equal((await reopen.read(principal,'private')).state.sales.length,1);
});
