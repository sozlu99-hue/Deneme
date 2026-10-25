import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,command,cents,validateState} from '../web/pos.js';
import {privateTransition} from '../server/private-engine.mjs';
import {staffFixture} from './staff-fixture.mjs';

test('A collected cancelled credit sale supports a bounded, traceable customer refund',()=>{
 let s=command(emptyState('test','market'),{type:'product',product:{name:'Test',priceCents:1000,costCents:0}});
 s=command(s,{type:'purchase',kind:'products',itemId:s.products[0].id,qty:1,costCents:0});s=command(s,{type:'customer',name:'Test'});
 const cid=s.customers[0].id;s=command(s,{type:'sale',id:'sale-a',payment:'credit',customerId:cid,lines:[{productId:s.products[0].id,qty:1}]});
 s=command(s,{type:'collect',customerId:cid,amountCents:1000});s=command(s,{type:'cancel',id:'sale-a'});
 const r={type:'refund',id:'refund-a',customerId:cid,amountCents:1000,payment:'cash',reason:'Cancelled sale refund'};
 assert.throws(()=>command(s,{...r,amountCents:1001}),/aşamaz/);
 const refunded=command(s,r);assert.equal(refunded.customers[0].balanceCents,0);assert.equal(refunded.collections.length,1);assert.equal(refunded.refunds[0].reason,r.reason);validateState(refunded,'test','market');
 assert.throws(()=>command(refunded,r),/daha önce/);const old=emptyState('legacy','market');delete old.refunds;validateState(old,'legacy','market');
});
test('Money input rejects empty and excess precision without banning free products',()=>{
 for(const v of ['',null,'10,999','1e2','-1','0x10'])assert.throws(()=>cents(v));
 assert.equal(cents('10,99'),1099);assert.equal(cents('0'),0);
});
test('Private transitions retain historical balances and require matching new transactions',async t=>{
 const f=await staffFixture();t.after(()=>f.close());const current=(await f.cloud.read(f.owner,'private')).state;
 const wrong=structuredClone(current);wrong.customers.push({id:'audit-customer',name:'Audit',phone:'',alacak:1234,borc:0,txns:[]});assert.throws(()=>privateTransition(current,wrong),/Cari bakiyesi/);
 const before=structuredClone(current);before.customers.push({id:'audit-customer',name:'Audit',phone:'',alacak:50,borc:20,txns:[]});
 const next=structuredClone(before),c=next.customers.at(-1);c.alacak=40;c.txns=[{id:'new-txn',type:'tahsilat',amount:10}];assert.equal(privateTransition(before,next).customers.at(-1).alacak,40);
 const altered=structuredClone(next);altered.customers.at(-1).txns[0].amount=11;assert.throws(()=>privateTransition(next,altered),/geçmişi/);
 const removed=structuredClone(next);removed.customers=[];assert.throws(()=>privateTransition(next,removed),/silinemez/);
});
