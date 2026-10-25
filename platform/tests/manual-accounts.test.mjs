import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {privateTransition} from '../server/private-engine.mjs';
import {staffFixture} from './staff-fixture.mjs';
const context=vm.createContext({structuredClone});
for(const name of ['cost-engine.js','data-integrity.js','finance-guard.js','private-account-rules.js'])vm.runInContext(fs.readFileSync(new URL('../web/'+name,import.meta.url),'utf8'),context);
const post=(state,input,id)=>context.AESDPrivateAccounts.post(state,input,{transactionId:'manual-'+id,cashId:'cash-'+id,date:'2026-10-24T12:00:00.000Z'});
test('Manual receivable and cash settlement retain both ledgers atomically',async t=>{
 const f=await staffFixture();t.after(()=>f.close());let s=structuredClone((await f.cloud.read(f.owner,'private')).state);
 s.settings.debtPermission=true;s.customers.push({id:'manual',name:'Synthetic',phone:'',alacak:0,borc:0,txns:[]});
 const input={customerId:'manual',type:'alacak',amount:12.34,note:'Opening receivable'};
 const next=post(s,input,'a');privateTransition(s,next);assert.equal(next.customers.at(-1).alacak,12.34);assert.deepEqual(s.customers.at(-1).txns,[]);
 assert.throws(()=>post(next,input,'a'),/kimliği/);assert.throws(()=>post(s,{...input,note:''},'invalid'),/açıklama/);
 const paid=post(next,{customerId:'manual',type:'tahsilat',amount:12.34,method:'Nakit',note:'Cash receipt'},'b');privateTransition(next,paid);assert.equal(paid.customers.at(-1).alacak,0);assert.equal(paid.cashMoves[0].kind,'entry');
 const tampered=structuredClone(paid);tampered.cashMoves[0].amount=1;assert.throws(()=>privateTransition(next,tampered),/eşleşen/);
});
test('Manual payable and cash payment use the opposite cash direction',async t=>{
 const f=await staffFixture();t.after(()=>f.close());let s=structuredClone((await f.cloud.read(f.owner,'private')).state);s.settings.debtPermission=true;s.registerSessions.find(r=>r.status==='open').openingBalance=100;
 s.customers.push({id:'manual',name:'Synthetic',phone:'',alacak:0,borc:0,txns:[]});
 const owed=post(s,{customerId:'manual',type:'borc',amount:20,note:'Customer overpayment'},'c');privateTransition(s,owed);
 const paid=post(owed,{customerId:'manual',type:'odeme',amount:20,method:'Nakit',note:'Cash settlement'},'d');privateTransition(owed,paid);assert.equal(paid.customers.at(-1).borc,0);assert.equal(paid.cashMoves[0].kind,'exit');
 assert.throws(()=>post(owed,{customerId:'manual',type:'odeme',amount:20.01,method:'Nakit'},'over'),/aşamaz/);
 const forged=structuredClone(paid);forged.cashMoves[0].kind='entry';assert.throws(()=>privateTransition(owed,forged),/eşleşen/);
});
test('Manual reversal retains the original row and cannot be repeated or applied to a sale receivable',async t=>{
 const f=await staffFixture();t.after(()=>f.close());let s=structuredClone((await f.cloud.read(f.owner,'private')).state);s.settings.debtPermission=true;
 s.customers.push({id:'manual',name:'Synthetic',phone:'',alacak:0,borc:0,txns:[]});
 const next=post(s,{customerId:'manual',type:'alacak',amount:12.34,note:'Manual opening'},'reverse-source');privateTransition(s,next);
 const input={customerId:'manual',type:'duzeltme',amount:12.34,reverseOf:'manual-reverse-source',note:'Correct duplicate entry'};
 const reversed=post(next,input,'reverse');privateTransition(next,reversed);assert.equal(reversed.customers.at(-1).alacak,0);assert.equal(reversed.customers.at(-1).txns.length,2);
 assert.deepEqual(reversed.customers.at(-1).txns[1],next.customers.at(-1).txns[0]);assert.throws(()=>post(reversed,input,'second'),/düzeltilemez/);
 const forged=structuredClone(reversed);forged.customers.at(-1).txns[0].refId='missing';assert.throws(()=>privateTransition(next,forged),/doğrulanamadı/);
});
test('Cash collection reversal creates an opposite receipt and preserves historical collection',async t=>{
 const f=await staffFixture();t.after(()=>f.close());const s=structuredClone((await f.cloud.read(f.owner,'private')).state);s.settings.debtPermission=true;s.customers.push({id:'manual',name:'Synthetic',phone:'',alacak:30,borc:0,txns:[]});
 const collected=post(s,{customerId:'manual',type:'tahsilat',amount:10,method:'Nakit',note:'Collection'},'col');privateTransition(s,collected);
 const reversed=post(collected,{customerId:'manual',type:'duzeltme',amount:10,reverseOf:'manual-col',note:'Correction'},'uncol');privateTransition(collected,reversed);assert.equal(reversed.customers.at(-1).alacak,30);assert.equal(reversed.cashMoves[0].kind,'exit');assert.equal(reversed.cashMoves[1].kind,'entry');
});
