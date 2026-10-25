import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {launch,wait}=createRequire(import.meta.url)('../legacy-tests/tests/pos-harness.cjs');
test('A manager private frame must never offer local administrator setup while its parent session is not ready',async()=>{
 let ready=false;
 const app=await launch(undefined,null,{prepareWindow:w=>{w.AESDShopManager=true;w.parent.aesdOwnerAllowed=()=>ready;w.parent.aesdOwnerIdentity=()=>ready?{name:'synthetic-manager@example.test',role:'Yönetici'}:null;}});
 assert.equal(app.dom.window.document.body.textContent.includes('İlk Kurulum'),false);
 assert.equal(await app.store().setupAdminPassword('synthetic-new-password'),false);
 const security=JSON.stringify(app.store().security);ready=true;app.w.dispatchEvent(new app.w.Event('aesd-central-session'));
 await wait(()=>app.store().auth?.name==='synthetic-manager@example.test');assert.equal(JSON.stringify(app.store().security),security);
 ready=false;app.w.dispatchEvent(new app.w.Event('aesd-central-session'));await wait(()=>!app.store().auth);
 assert.equal(app.dom.window.document.body.textContent.includes('İlk Kurulum'),false);
});

test('Delayed manager identity waits before starting cloud synchronization and connects when the session becomes ready',async()=>{
 let ready=false,calls=0;
 const app=await launch(undefined,null,{prepareWindow:w=>{w.AESDShopManager=true;w.parent.aesdOwnerAllowed=()=>ready;w.parent.aesdOwnerIdentity=()=>ready?{name:'synthetic-manager@example.test',role:'Yönetici'}:null;w.parent.aesdPrivateCloud=async({initial})=>{calls++;assert.equal(ready,true);return{read:async()=>initial,poll:async()=>initial,close(){}};};w.eval(fs.readFileSync('web/private-cloud.js','utf8'));}});
 assert.equal(calls,0);ready=true;app.w.dispatchEvent(new app.w.Event('aesd-central-session'));await wait(()=>calls>0);await wait(()=>app.w.AESDPrivateSync);assert.equal(calls,1);assert.equal(app.store().auth.name,'synthetic-manager@example.test');assert.equal(app.dom.window.document.body.textContent.includes('İlk Kurulum'),false);assert.deepEqual(app.errors,[]);
});
