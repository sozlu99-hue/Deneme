import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,command,validateState} from '../web/pos.js';
import {cloudCostView} from '../server/cloud-cost-view.mjs';

test('Market cancellation restores the historical cost into the current stock average',()=>{
 let s=command(emptyState('test','market'),{type:'product',product:{name:'Product',priceCents:30000}});
 const id=s.products[0].id;
 s=command(s,{type:'purchase',kind:'products',itemId:id,qty:1,costCents:10000});
 s=command(s,{type:'sale',id:'first',payment:'cash',lines:[{productId:id,qty:1}]});
 const original=structuredClone(s.sales[0]);
 s=command(s,{type:'purchase',kind:'products',itemId:id,qty:1,costCents:20000});
 s=command(s,{type:'cancel',id:'first'});
 assert.equal(s.products[0].stock,2);assert.equal(s.products[0].costCents,15000);
 assert.deepEqual(s.sales[0].lines,original.lines);assert.equal(s.sales[0].costCents,10000);
 const after=command(s,{type:'sale',id:'second',payment:'cash',lines:[{productId:id,qty:2}]});
 assert.equal(after.sales[1].costCents,30000);
 assert.throws(()=>command(s,{type:'cancel',id:'first'}),/zaten/);
 // Existing backups have no new cost fields. Keep them readable and usable.
 const legacy=structuredClone(s);delete legacy.products[0].rawCostCents;delete legacy.sales[0].lines[0].rawUnitCostCents;delete legacy.sales[0].deductions[0].unitCostCents;delete legacy.sales[0].deductions[0].rawUnitCostCents;
 validateState(legacy,'test','market');
 legacy.sales[0].status='completed';delete legacy.sales[0].cancelledAt;legacy.products[0].stock=1;legacy.products[0].costCents=20000;
 const returned=command(legacy,{type:'cancel',id:'first'});assert.equal(returned.products[0].costCents,15000);
});

for(const module of ['restaurant','cafe']){
 test(module+': round the extended recipe cost and return material at its sale cost',()=>{
  let s=command(emptyState('test',module),{type:'material',name:'Ingredient',unit:'kg'});
  const material=s.materials[0].id;
  s=command(s,{type:'purchase',kind:'materials',itemId:material,qty:1,costCents:100});
  s=command(s,{type:'product',product:{name:'Serving',priceCents:100,recipe:[{materialId:material,qty:0.001}]}});
  const product=s.products[0].id;
  s=command(s,{type:'sale',id:'tiny',payment:'cash',lines:[{productId:product,qty:1000}]});
  assert.equal(s.sales[0].costCents,100);assert.equal(s.sales[0].lines[0].rawUnitCostCents,0.1);
  const response={revision:3,state:s};
  assert.equal(cloudCostView(response,'extended-v1'),response);
  const legacyView=cloudCostView(response);
  assert.equal(legacyView.state.sales[0].costCents,0);assert.equal(s.sales[0].costCents,100);
  assert.equal(legacyView.state.sales[0].lines[0].rawUnitCostCents,undefined);
  validateState(legacyView.state,'test',module);
  assert.equal(s.materials[0].stock,0);
  s=command(s,{type:'purchase',kind:'materials',itemId:material,qty:1,costCents:200});
  s=command(s,{type:'cancel',id:'tiny'});
  assert.equal(s.materials[0].stock,2);assert.equal(s.materials[0].costCents,150);
  assert.equal(s.sales[0].costCents,100);
  validateState(s,'test',module);
  for(const value of [-1,Infinity,'0.1']){const bad=structuredClone(s);bad.sales[0].lines[0].rawUnitCostCents=value;assert.throws(()=>validateState(bad,'test',module));}
  const bad=structuredClone(s);bad.sales[0].costCents=0;assert.throws(()=>validateState(bad,'test',module));
 });
}
