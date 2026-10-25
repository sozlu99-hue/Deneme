import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {privateTransition} from '../server/private-engine.mjs';
import {staffFixture} from './staff-fixture.mjs';
const context=vm.createContext({structuredClone});
for(const file of ['cost-engine.js','data-integrity.js','finance-guard.js','private-account-rules.js'])vm.runInContext(fs.readFileSync(new URL('../web/'+file,import.meta.url),'utf8'),context);
const rules=context.AESDPrivateAccounts;
const post=(state,extra={})=>rules.post(state,{customerId:'collection-customer',type:'tahsilat',amount:500,method:'Nakit',note:'Kısmi ödeme',...extra},{transactionId:'collection-txn-1',cashId:'collection-cash-1',date:'2026-10-19T14:00:00Z'});
async function fixture(t){const f=await staffFixture();t.after(()=>f.close());const state=(await f.cloud.read(f.owner,'private')).state;state.customers.push({id:'collection-customer',name:'Synthetic customer',phone:'',alacak:2970,borc:0,txns:[]});return state;}
test('Cash collection reduces the live balance and records one matching register entry',async t=>{
 const before=await fixture(t),next=post(before),saved=privateTransition(before,next),c=saved.customers.find(c=>c.id==='collection-customer');
 assert.equal(c.alacak,2470);assert.equal(c.txns[0].method,'Nakit');assert.equal(c.txns[0].note,'Kısmi ödeme');
 assert.equal(saved.cashMoves[0].kind,'entry');assert.equal(saved.cashMoves[0].amount,500);assert.equal(saved.cashMoves[0].refId,c.txns[0].id);
 assert.equal(before.customers.at(-1).alacak,2970);assert.throws(()=>post(next),/kimliği/);
});
test('Card collection does not enter the cash register and may run without an open register',async t=>{
 const before=await fixture(t);for(const r of before.registerSessions)r.status='closed';const next=post(before,{method:'Kart'});
 assert.equal(next.cashMoves.length,before.cashMoves.length);assert.equal(privateTransition(before,next).customers.at(-1).alacak,2470);
 assert.throws(()=>post(before),/açık kasa/);
});
test('Zero, excess, unsupported method and stale balance fail without changing state',async t=>{
 const before=await fixture(t),original=JSON.stringify(before);
 for(const input of [{amount:0},{amount:-1},{amount:2970.01},{amount:1.001},{method:'Other'}])assert.throws(()=>post(before,input));
 const changed=structuredClone(before);changed.customers.at(-1).alacak=100;assert.throws(()=>post(changed),/aşamaz/);
 assert.equal(JSON.stringify(before),original);
});
test('The server rejects missing, forged, duplicated and card cash receipts',async t=>{
 const before=await fixture(t),cash=post(before);
 for(const mutate of [s=>s.cashMoves.shift(),s=>s.cashMoves[0].amount=501,s=>s.cashMoves[0].customerId='other',s=>s.cashMoves.push({...s.cashMoves[0],id:'duplicate-cash'}),s=>s.customers.at(-1).txns[0].method='Kart']){
  const next=structuredClone(cash);mutate(next);assert.throws(()=>privateTransition(before,next));
 }
});
test('Money text accepts Turkish decimals and rejects ambiguous or excessive precision',()=>{
 for(const [value,expected] of [['500,00',500],['0,01',.01],['2970.00',2970]])assert.equal(rules.parseMoney(value),expected);
 for(const value of ['', '1e2','-1','1.000','1,999','1.000,00','0'])assert.throws(()=>rules.parseMoney(value));
});
