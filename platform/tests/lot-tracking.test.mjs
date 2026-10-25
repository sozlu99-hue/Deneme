import test from 'node:test';
import assert from 'node:assert/strict';
import {command,emptyState,validateState} from '../web/pos.js';
import {availableLots,lotAlerts} from '../web/lot-rules.js';
const date='2026-10-18T12:00:00Z';
const run=(s,a)=>command(s,a,date);
function setup(){let s=run(emptyState('lot-test','market'),{type:'product',product:{name:'Süt',priceCents:1000}});
 return run(s,{type:'stock-settings',kind:'products',itemId:s.products[0].id,reorderLevel:2,packSize:1,trackLots:true});}
function receive(s,lotNumber,expiryDate,qty=5){return run(s,{type:'receive',kind:'products',itemId:s.products[0].id,qty,unit:'adet',unitPriceCents:400,lotNumber,expiryDate});}
const sell=(s,qty=1)=>run(s,{type:'sale',id:crypto.randomUUID(),payment:'cash',lines:[{productId:s.products[0].id,qty}]});
test('Tracked stock requires a batch/expiry and consumes FEFO while excluding expired batches',()=>{
 let s=setup();assert.throws(()=>receive(s,'',''),/Parti numarası/);
 s=receive(s,'GEÇMİŞ','2026-10-17');s=receive(s,'SONRA','2026-12-01');s=receive(s,'ÖNCE','2026-10-25');s=sell(s,6);
 const d=s.sales[0].deductions[0];assert.equal(d.lots[0].purchaseId,s.purchases[2].id);assert.equal(d.lots[0].qty,5);assert.equal(d.lots[1].qty,1);
 assert.equal(lotAlerts(s,date).find(x=>x.lotNumber==='GEÇMİŞ').remainingQty,5);
 assert.throws(()=>sell(s,5),/Satılabilir parti/);
});
test('Partial returns restore original batches and cannot create untracked stock',()=>{
 let s=receive(setup(),'PARTI-A','2026-11-01');s=sell(s,2);const sale=s.sales[0];
 s=run(s,{type:'sale-return',id:'lot-return',saleId:sale.id,lines:[{productId:s.products[0].id,qty:1}],restock:true,reason:'Kapalı ambalaj',payments:[{method:'cash',amountCents:1000}]});
 assert.equal(availableLots(s,'products',s.products[0].id)[0].remainingQty,4);
 const corrupt=structuredClone(s);delete corrupt.sales[0].deductions[0].lots;assert.throws(()=>validateState(corrupt,s.businessId,s.module),/eşleşmiyor|parti/i);
});
test('Transfer and count preserve lot identity and disallow a second delivery',()=>{
 let s=receive(setup(),'PARTI-A','2026-11-01');s=run(s,{type:'warehouse',name:'Soğuk depo'});const warehouseId=s.warehouses[0].id;
 s=run(s,{type:'transfer-send',fromWarehouseId:'main',toWarehouseId:warehouseId,lines:[{kind:'products',itemId:s.products[0].id,qty:2}],reason:'Soğuk depoya'});
 assert.equal(availableLots(s,'products',s.products[0].id)[0].remainingQty,3);
 s=run(s,{type:'transfer-receive',id:s.transfers[0].id});assert.equal(availableLots(s,'products',s.products[0].id,warehouseId)[0].remainingQty,2);
 s=run(s,{type:'stock-count',kind:'products',itemId:s.products[0].id,expectedStock:3,countedQty:2,lotPurchaseId:s.purchases[0].id,reason:'Parti sayımı'});
 assert.equal(s.products[0].stock,4);assert.equal(availableLots(s,'products',s.products[0].id)[0].remainingQty,2);
 assert.throws(()=>run(s,{type:'stock-settings',kind:'products',itemId:s.products[0].id,reorderLevel:2,trackLots:false}),/stok sıfırken/);
});
