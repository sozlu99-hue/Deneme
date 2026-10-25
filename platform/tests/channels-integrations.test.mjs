import {createBusinessReset} from '../server/business-reset.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {sqlite} from '../server/sqlite-adapter.mjs';
import {sqliteRepository} from '../server/cloud-repository.mjs';
import {createPlatform} from '../server/platform-core.mjs';
import {createCloud} from '../server/cloud-core.mjs';
import {createOrderChannels} from '../server/order-channels.mjs';
import {createIntegrationGateway} from '../server/integration-gateway.mjs';
import {command,emptyState} from '../web/pos.js';

async function fixture(){
 const db=sqlite(),ledger=sqlite();db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,password_hash TEXT,role TEXT,active INTEGER)');
 db.prepare("INSERT INTO users VALUES(1,'owner@example.test','password-owner','OWNER',1)").run();
 const secret='channels-integration-isolated-test-secret';
 const platform=createPlatform({db,secret,passwords:{hash:async v=>v,compare:async(a,b)=>a===b},ready:()=>true,persist:async()=>{}});
 const login=await platform.login({email:'owner@example.test',password:'password-owner',deviceId:'channel_owner_device_01'}),owner=platform.authenticate(login.token);
 const repository=sqliteRepository(ledger),cloud=createCloud({repository,authorize:platform.authorizePanel});
 let s=command(emptyState('owner:1','cafe'),{type:'material',name:'Gizli malzeme',unit:'gram'});
 s=command(s,{type:'purchase',kind:'materials',itemId:s.materials[0].id,qty:100,costCents:1});
 s=command(s,{type:'product',product:{name:'Kahve',priceCents:1000,recipe:[{materialId:s.materials[0].id,qty:1}]}});
 await cloud.mutate(owner,'cafe',{kind:'import',operationId:crypto.randomUUID(),data:s});
 const channels=createOrderChannels({db,platform,repository,secret,publicOrigin:'https://menu.example.test'});
 const channel=await channels.create(owner,'cafe',{label:'Masa 1',ordering:true});
 const token=decodeURIComponent(new URL(channel.url).hash.slice(1));
 return{db,ledger,repository,platform,cloud,owner,channels,channel,token,s,close(){db.close();ledger.close();}};
}
test('Public menu contains prices but no recipes, cost, credentials, customer data or signing secret',async()=>{
 const f=await fixture();try{const menu=await f.channels.read(f.token);assert.equal(menu.items[0].priceCents,1000);
  const serialized=JSON.stringify(menu);for(const hidden of ['Gizli malzeme','costCents','recipe','password-owner','owner@example.test'])assert.equal(serialized.includes(hidden),false);
  assert.match(f.channel.svg,/<svg/);await assert.rejects(f.channels.read(f.token+'x'),e=>e.status===404);
 }finally{f.close();}
});
test('QR order retry creates one unpaid order and keeps stock unchanged, including after payment',async()=>{
 const f=await fixture();try{const menu=await f.channels.read(f.token),body={clientOrderId:crypto.randomUUID(),quote:menu.quote,lines:[{productId:f.s.products[0].id,qty:2}]};
  const first=await f.channels.submit(f.token,body,'test-ip'),second=await f.channels.submit(f.token,body,'test-ip');
  assert.equal(first.orderId,second.orderId);assert.equal(second.duplicate,true);
  let row=await f.cloud.read(f.owner,'cafe');assert.equal(row.state.orders.length,1);assert.equal(row.state.sales.length,0);assert.equal(row.state.materials[0].stock,100);
  await f.cloud.mutate(f.owner,'cafe',{kind:'command',operationId:crypto.randomUUID(),data:{type:'sale',id:crypto.randomUUID(),payment:'cash',orderId:first.orderId,lines:body.lines}});
  const third=await f.channels.submit(f.token,body,'test-ip');assert.equal(third.status,'paid');row=await f.cloud.read(f.owner,'cafe');assert.equal(row.state.sales.length,1);
  await assert.rejects(f.channels.submit(f.token,{...body,lines:[{productId:f.s.products[0].id,qty:3}]},'test-ip'),e=>e.status===409);
 }finally{f.close();}
});
test('Changed prices, disabled ordering and disabled channel cannot accept an order',async()=>{
 const f=await fixture();try{const menu=await f.channels.read(f.token),body={clientOrderId:crypto.randomUUID(),quote:menu.quote,lines:[{productId:f.s.products[0].id,qty:1}]};
  await f.cloud.mutate(f.owner,'cafe',{kind:'command',operationId:crypto.randomUUID(),data:{type:'product-update',id:f.s.products[0].id,product:{...f.s.products[0],priceCents:2000}}});
  await assert.rejects(f.channels.submit(f.token,body,'test-ip'),e=>e.status===409);
  const readonly=await f.channels.create(f.owner,'cafe',{label:'Yalnız Menü',ordering:false});const token=decodeURIComponent(new URL(readonly.url).hash.slice(1));
  await assert.rejects(f.channels.submit(token,body,'test-ip'),e=>e.status===403);
  await f.channels.change(f.owner,'cafe',f.channel.id,{active:false});await assert.rejects(f.channels.read(f.token),e=>e.status===404);
 }finally{f.close();}
});
test('A menu is revoked when the owning account loses its server role',async()=>{
 const f=await fixture();try{f.db.prepare("UPDATE users SET role='CLIENT' WHERE id=1").run();await assert.rejects(f.channels.read(f.token),e=>e.status===403);}finally{f.close();}
});
test('An absent fiscal provider sends nothing and does not claim an invoice was created',async()=>{
 const f=await fixture();try{const gateway=createIntegrationGateway({...f});
  assert.equal(gateway.status(f.owner,'cafe').providers.find(x=>x.kind==='invoice').state,'Kurulum gerekli');
  await assert.rejects(gateway.request(f.owner,'cafe','invoice',{operationId:crypto.randomUUID(),saleId:'unknown'}),e=>e.status===503);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM aesd_integration_operations').get().n,0);
 }finally{f.close();}
});
test('Lost provider response is unknown; status lookup confirms it without submitting again',async()=>{
 const f=await fixture();try{
  const saleId=crypto.randomUUID();await f.cloud.mutate(f.owner,'cafe',{kind:'command',operationId:crypto.randomUUID(),data:{type:'sale',id:saleId,payment:'card',lines:[{productId:f.s.products[0].id,qty:1}]}});
  let calls=0,lookups=0;
  const gateway=createIntegrationGateway({...f,adapters:{invoice:{submit:async()=>{calls++;throw Error('Isolated lost response');},lookup:async()=>{lookups++;return{state:'confirmed',reference:'TEST-INVOICE-1'};}}}});
  const operationId=crypto.randomUUID(),first=await gateway.request(f.owner,'cafe','invoice',{operationId,saleId});assert.equal(first.state,'unknown');
  await gateway.request(f.owner,'cafe','invoice',{operationId,saleId});assert.equal(calls,1);
  await assert.rejects(gateway.request(f.owner,'cafe','invoice',{operationId:crypto.randomUUID(),saleId}),e=>e.status===409);assert.equal(calls,1);
  const checked=await gateway.receipt(f.owner,'cafe',operationId,true);assert.equal(checked.state,'confirmed');assert.equal(checked.providerReference,'TEST-INVOICE-1');assert.equal(lookups,1);assert.equal(calls,1);
 }finally{f.close();}
});

test('A reset after reading a sale but before provider reservation cannot send an old invoice',async()=>{
 const f=await fixture();try{
  const saleId=crypto.randomUUID();await f.cloud.mutate(f.owner,'cafe',{kind:'command',operationId:crypto.randomUUID(),data:{type:'sale',id:saleId,payment:'card',lines:[{productId:f.s.products[0].id,qty:1}]}});
  const reset=createBusinessReset({...f,passwords:{compare:async(a,b)=>a===b}});const ticket=await reset.prepare(f.owner,'cafe');let submitted=0;
  const repository={...f.repository,read:async(scope,module)=>{const snapshot=await f.repository.transact(scope,module,async tx=>structuredClone(tx.row));await reset.confirm(f.owner,'cafe',{token:ticket.token,password:'password-owner',confirmation:'SIFIRLA',backupAcknowledged:true});return snapshot;}};
  const gateway=createIntegrationGateway({...f,repository,adapters:{invoice:{submit:async()=>{submitted++;return{state:'confirmed',reference:'should-not-send'};},lookup:async()=>({state:'unknown'})}}});await assert.rejects(gateway.request(f.owner,'cafe','invoice',{saleId,operationId:crypto.randomUUID()}),/sıfırlandı/);assert.equal(submitted,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM aesd_integration_operations').get().n,0);
 }finally{f.close();}
});
