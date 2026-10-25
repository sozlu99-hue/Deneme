import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {cloudMeta,openCloudStore,updatePending} from '../web/cloud-store.js';

const source=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const part=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const line=start=>source.split('\n').find(value=>value.startsWith(start));
const reply=(status,value)=>({ok:status>=200&&status<300,status,headers:{get:()=> 'application/json'},json:async()=>value});
function deferred(){let resolve;return{promise:new Promise(done=>resolve=done),resolve};}
function harness(){
 globalThis.indexedDB=new IDBFactory();
 const dom=new JSDOM('<main id="app"><p class="shop-record">Private sales</p></main><section id="private-mount"><iframe></iframe></section><dialog id="dialog"></dialog><dialog id="menu"></dialog>',{url:'https://aesd.example.test/aesd/',runScripts:'outside-only'}),w=dom.window;
 w.AbortSignal=AbortSignal;w.cloudMeta=cloudMeta;w.savePreferences=value=>cloudMeta('audit:preferences',value);
 w.fetch=async()=>reply(403,{error:'Access is closed.'});
 w.eval(`
 const root=document.querySelector('#app'),privateMount=document.querySelector('#private-mount'),dialog=document.querySelector('#dialog'),menu=document.querySelector('#menu');
 for(const item of [dialog,menu]){item.open=true;item.close=()=>{item.open=false;};}
 const config={audience:'all',publicKey:'test-key'},apiOrigin='https://aesd.example.test',deviceId='audit-owner-device',sector='market',ownerPanel='market';
 let session={user:{id:1,email:'owner@example.test',role:'OWNER'},token:'audit-session-token',remember:true},info={user:session.user},lease={token:'old-lease',payload:{}},sessionEpoch=0,offlineConnectivity=false,state={records:['Private sales']},dataScope='owner:1:market',privateReady=true,privateFrameEpoch=0,migrationChoice=null,busy=false,renewing=false,notice='';
 let privateFrame=privateMount.querySelector('iframe'),privateClosed=false,storeClosed=false,cameraClosed=false;
 let privateCloudStore={close:()=>{privateClosed=true;}},store={close:()=>{storeClosed=true;}};
 let scanStream={getTracks:()=>[{stop:()=>{cameraClosed=true;}}]};
 const isShopManager=()=>info?.shopAccess?.role==='SHOP_MANAGER',privateUser=()=>isOwner()||isShopManager(),privateScope=()=>isShopManager()?info.shopAccess.scope:'owner:'+info.user.id,privateRole=()=>isShopManager()?'SHOP_MANAGER':info.user.role;
 const isOwner=()=>info?.user?.role==='OWNER',usingPrivate=()=>false,allowed=()=>Boolean(lease),resetBasket=()=>{},anchor=()=>{},now=Date.now,dateKey=()=> '2026-10-09',verifyLease=(...args)=>window.verifyLease(...args),syncSummary=()=>{},syncStatus=()=>{};
 const closeMenu=()=>menu.close(),hidePrivate=()=>{privateMount.hidden=true;},authView=()=>{root.innerHTML='<h1>Login</h1>';},panelGate=message=>{root.innerHTML='<h1>Panel Gate</h1><p></p>';root.querySelector('p').textContent=message;},toast=message=>{window.lastToast=message;};
 ${line('function stopCamera(')}
 ${line('function disposePrivate(')}
 ${part('async function api(', 'function recoveryView(')}
 ${part('async function clearSession(', '// A delayed logout')}
 ${line('async function execute(')}
 ${line('async function exportBackup(')}
 ${part('async function obtainLease(', 'function allowed(')}
 ${part('async function apiPrivate(', 'function ownerSettings(')}
 window.audit={clearSession,setSession:value=>{session=value;},api,apiPrivate,execute,exportBackup,obtainLease,denyMainAccess,epoch:()=>sessionEpoch,lease:()=>lease,state:()=>state,session:()=>session,frame:()=>privateFrame,closed:()=>({privateClosed,storeClosed,cameraClosed}),setStore:value=>store=value};
 `);
 return{dom,w,a:w.audit,close:()=>w.close()};
}

test('An authenticated 403 conceals cached records and closes stores, dialogs and the private frame',async()=>{
 const h=harness();try{
  const pending={operationId:'pending-sale'},offline={queue:[{operationId:'offline-sale'}]};
  await cloudMeta('owner:1:market:pending',pending);await cloudMeta('owner:1:private:offline-v1',offline);
  await assert.rejects(h.a.api('/cloud/market'),e=>e.status===403&&e.accessDenied);
  assert.equal(h.w.document.querySelector('.shop-record'),null);assert.match(h.w.document.body.textContent,/Panel Gate/);
  assert.equal(h.a.frame(),null);assert.equal(h.a.lease(),null);assert.equal(h.a.state(),null);assert.ok(h.a.session());
  assert.deepEqual(JSON.parse(JSON.stringify(h.a.closed())),{privateClosed:true,storeClosed:true,cameraClosed:true});
  assert.equal(h.w.document.querySelector('#dialog').open,false);assert.equal(h.w.document.querySelector('#menu').open,false);
  assert.equal(h.w.aesdOwnerAllowed(),false);assert.ok(h.a.epoch()>0);
  assert.deepEqual(await cloudMeta('owner:1:market:pending'),pending);assert.deepEqual(await cloudMeta('owner:1:private:offline-v1'),offline);
 }finally{h.close();}
});

test('An authenticated 401 clears login state and retains durable sale queues',async()=>{
 const h=harness();try{
  const pending={operationId:'paid-ack-lost'},offline={queue:[{operationId:'offline-sale'}]};
  await cloudMeta('owner:1:market:pending',pending);await cloudMeta('owner:1:private:offline-v1',offline);await cloudMeta('owner:1:private-template','Private source');
  h.w.localStorage.setItem('aesd.session.v2','old-session');h.w.sessionStorage.setItem('aesd.session.v2','old-session');
  h.w.fetch=async()=>reply(401,{error:'Session expired.'});
  await assert.rejects(h.a.api('/me'),e=>e.status===401&&e.accessDenied);
  assert.equal(h.a.session(),null);assert.equal(h.a.lease(),null);assert.equal(h.a.frame(),null);assert.match(h.w.document.body.textContent,/Login/);
  assert.equal(h.w.localStorage.getItem('aesd.session.v2'),null);assert.equal(h.w.sessionStorage.getItem('aesd.session.v2'),null);
  assert.equal((await cloudMeta('audit:preferences')).session,null);assert.equal(await cloudMeta('owner:1:private-template'),null);
  assert.deepEqual(await cloudMeta('owner:1:market:pending'),pending);assert.deepEqual(await cloudMeta('owner:1:private:offline-v1'),offline);
 }finally{h.close();}
});

test('Public login and recovery errors do not revoke an existing session',async()=>{
 const h=harness();try{
  for(const [path,status] of [['/login',401],['/password-reset/request',403],['/password-reset/confirm',400]]){
   h.w.fetch=async()=>reply(status,{error:'Public request rejected.'});
   await assert.rejects(h.a.api(path,{email:'example@example.test'},false),e=>e.status===status&&!e.accessDenied);
   assert.equal(h.a.epoch(),0);assert.ok(h.a.session());assert.ok(h.a.lease());assert.ok(h.w.document.querySelector('.shop-record'));
  }
 }finally{h.close();}
});

test('A wrong owner verification password returns false without revoking access',async()=>{
 const h=harness();try{
  h.w.fetch=async()=>reply(200,{ok:true,valid:false});assert.equal((await h.a.api('/owner/verify-password',{password:'wrong'})).valid,false);
  assert.equal(h.a.epoch(),0);assert.ok(h.a.lease());assert.ok(h.w.document.querySelector('.shop-record'));
 }finally{h.close();}
});

test('Late lease verification cannot restore access after an authoritative denial',async()=>{
 const h=harness(),verification=deferred(),started=deferred();try{
  h.w.verifyLease=()=>{started.resolve();return verification.promise;};
  h.w.fetch=async url=>url.endsWith('/lease')?reply(200,{ok:true,token:'late-lease',serverTime:Date.now()}):reply(403,{error:'Access is closed.'});
  const lease=h.a.obtainLease(),rejected=assert.rejects(lease,e=>e.stale);await started.promise;
  await assert.rejects(h.a.api('/me'),e=>e.accessDenied);verification.resolve({validUntil:Date.now()+60000});await rejected;
  assert.equal(h.a.lease(),null);assert.equal(h.w.localStorage.getItem('aesd.lease.1'),null);assert.equal(h.w.document.querySelector('.shop-record'),null);
 }finally{h.close();}
});

test('A late write completion cannot restore state or report a paid sale after access is denied',async()=>{
 const h=harness(),completion=deferred();try{
  h.a.setStore({command:()=>completion.promise,close:()=>{}});
  const command=h.a.execute({type:'sale'}),rejected=assert.rejects(command,e=>e.stale);
  await assert.rejects(h.a.api('/me'),e=>e.accessDenied);completion.resolve({records:['Late private sales']});await rejected;
  assert.equal(h.a.state(),null);assert.equal(h.a.lease(),null);assert.equal(h.w.document.querySelector('.shop-record'),null);assert.doesNotMatch(h.w.lastToast||'',/kaydedildi/);
 }finally{h.close();}
});

test('A real cloud store retains a lost payment ACK when receipt lookup needs a new login',async()=>{
 const h=harness(),navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});let store;try{
  const pending={operationId:'paid-ack-lost',kind:'command',data:{type:'sale'}};await updatePending('owner:1:market:pending',pending);
  store=await openCloudStore({businessId:'owner:1',module:'market',api:h.a.api,chooseMigration:()=>{},onStatus:()=>{}});h.a.setStore(store);
  h.w.fetch=async()=>reply(401,{error:'Session expired.'});await assert.rejects(store.poll(),e=>e.status===401);
  assert.deepEqual(await cloudMeta('owner:1:market:pending'),pending);assert.equal(h.a.session(),null);assert.match(h.w.document.body.textContent,/Login/);
  await assert.rejects(store.command({type:'sale'}),/bekleyen işlemin/);
 }finally{store?.close();h.close();if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;}
});

test('The protected private page enforces the same 403 view fencing',async()=>{
 const h=harness();try{
  await cloudMeta('owner:1:private-template','Cached private source');h.w.fetch=async()=>reply(403,{error:'Private access is closed.'});
  await assert.rejects(h.a.apiPrivate(),e=>e.status===403&&e.accessDenied);
  assert.equal(h.a.frame(),null);assert.equal(h.a.lease(),null);assert.equal(h.w.document.querySelector('.shop-record'),null);assert.match(h.w.document.body.textContent,/Panel Gate/);
  assert.equal(await cloudMeta('owner:1:private-template'),'Cached private source');
 }finally{h.close();}
});

test('A non-JSON authentication failure remains uncertain and does not revoke access',async()=>{
 for(const status of [401,403]){
  const h=harness();try{
   h.w.fetch=async()=>({ok:false,status,headers:{get:()=> 'text/html'}});
   await assert.rejects(h.a.api('/me'),e=>e.status===status&&e.uncertain&&!e.accessDenied);
   assert.ok(h.a.lease());assert.ok(h.a.frame());assert.ok(h.w.document.querySelector('.shop-record'));
   assert.equal(h.a.epoch(),0);
  }finally{h.close();}
 }
});

test('A late network failure remains stale after access has already been denied',async()=>{
 const h=harness();let reject;try{
  const response=new Promise((resolve,fail)=>reject=fail);h.w.fetch=async url=>url.endsWith('/owner/businesses')?response:reply(403,{error:'Access is closed.'});
  const old=h.a.api('/owner/businesses'),rejected=assert.rejects(old,e=>e.stale&&!e.network);
  await assert.rejects(h.a.api('/me'),e=>e.accessDenied);reject(Error('Late network failure'));await rejected;
  assert.equal(h.a.lease(),null);assert.equal(h.w.document.querySelector('.shop-record'),null);assert.match(h.w.document.body.textContent,/Panel Gate/);
 }finally{h.close();}
});

test('A late backup read cannot export shop records after access is denied',async()=>{
 const h=harness(),read=deferred();let exported=0;try{
  h.a.setStore({read:()=>read.promise,close:()=>{}});h.w.Capacitor={isNativePlatform:()=>true,nativePromise:async()=>{exported++;return{uri:'test-file'};}};
  const backup=h.a.exportBackup(),rejected=assert.rejects(backup,e=>e.stale);await assert.rejects(h.a.api('/me'),e=>e.accessDenied);
  read.resolve({records:['Private sales']});await rejected;assert.equal(exported,0);assert.equal(h.a.state(),null);assert.equal(h.w.document.querySelector('.shop-record'),null);
 }finally{h.close();}
});

test('A delayed preferences clear cannot erase a newly assigned session',async()=>{const h=harness(),d=deferred();try{h.w.savePreferences=()=>d.promise;const clearing=h.a.clearSession();h.a.setSession({token:'new-synthetic-session',user:{id:2,role:'CLIENT'}});d.resolve();assert.equal(await clearing,false);assert.equal(h.a.session().token,'new-synthetic-session');assert.equal(h.a.closed().storeClosed,false);}finally{h.close();}});
test('A delayed private-template cache cleanup cannot clear a new login or its mirror',async()=>{const h=harness(),d=deferred(),began=deferred();try{h.w.cloudMeta=async()=>{began.resolve();return d.promise;};const clearing=h.a.clearSession();await began.promise;h.a.setSession({token:'new-synthetic-session',user:{id:2,role:'CLIENT'}});h.w.localStorage.setItem('aesd.session.v2','new-synthetic-session');d.resolve();assert.equal(await clearing,false);assert.equal(h.a.session().token,'new-synthetic-session');assert.equal(h.w.localStorage.getItem('aesd.session.v2'),'new-synthetic-session');assert.equal(h.a.closed().storeClosed,false);}finally{h.close();}});
