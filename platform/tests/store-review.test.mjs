import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {openStore} from '../web/store.js';

test('Concurrent sales serialize stock checks and reject the second oversale',async()=>{
 const previous=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();
 const store=await openStore('store-review','market');
 try{
  let s=await store.command({type:'product',product:{name:'Test',priceCents:100}});const productId=s.products[0].id;
  await store.command({type:'purchase',kind:'products',itemId:productId,qty:1,costCents:20});
  const sale=id=>store.command({type:'sale',id,payment:'cash',lines:[{productId,qty:1}]});
  const results=await Promise.allSettled([sale('concurrent-1'),sale('concurrent-2')]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  s=await store.read();assert.equal(s.sales.length,1);assert.equal(s.products[0].stock,0);
 }finally{store.close();globalThis.indexedDB=previous;}
});
test('A stale restore and a corrupt restore both leave the saved state intact',async()=>{
 const previous=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();
 const store=await openStore('restore-review','market');
 try{
  let s=await store.command({type:'product',product:{name:'Test',priceCents:100}});const backup=structuredClone(s),revision=s.revision;
  s=await store.command({type:'purchase',kind:'products',itemId:s.products[0].id,qty:1,costCents:20});
  await assert.rejects(store.restore(backup,revision),/değişti/);assert.deepEqual(await store.read(),s);
  const corrupt=structuredClone(s);corrupt.products[0].stock=99;
  await assert.rejects(store.restore(corrupt,s.revision),/Stok/);assert.deepEqual(await store.read(),s);
 }finally{store.close();globalThis.indexedDB=previous;}
});

test('Optional product photos reject executable or remote URLs and keep old backups valid',async()=>{const previous=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();const store=await openStore('photo-review','market');try{let s=await store.command({type:'product',product:{name:'Test',priceCents:100,category:'Gıda',photo:'data:image/jpeg;base64,/9j/AA=='}});assert.equal(s.products[0].category,'Gıda');const before=await store.read();for(const photo of ['https://example.test/pixel.jpg','data:image/svg+xml,<svg onload=alert(1)>','javascript:alert(1)', 'data:image/jpeg;base64,'+'A'.repeat(120001)])await assert.rejects(store.command({type:'product',product:{name:'Bad',priceCents:100,photo}}),/fotoğraf/);assert.deepEqual(await store.read(),before);delete s.products[0].photo;delete s.products[0].category;await store.restore(s,s.revision);assert.equal((await store.read()).products.length,1);}finally{store.close();globalThis.indexedDB=previous;}});

test('A command rejects a record saved under the wrong business key',async()=>{const previous=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();const store=await openStore('expected','market');try{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('AESD_PANELS_V2',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});await new Promise((resolve,reject)=>{const tx=db.transaction('panels','readwrite');tx.objectStore('panels').put({schema:2,businessId:'other',module:'market',revision:0,products:[],materials:[],sales:[],customers:[],purchases:[],collections:[],orders:[]},'expected:market');tx.oncomplete=resolve;tx.onabort=reject;});db.close();await assert.rejects(store.command({type:'product',product:{name:'Test',priceCents:100}}),/bu işyeri/);assert.equal((await store.read()).products.length,0);}finally{store.close();globalThis.indexedDB=previous;}});
