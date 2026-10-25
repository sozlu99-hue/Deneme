import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

// Run the actual navigation and bridge functions with an isolated parent DOM.
// The store stub checks the captured permission and does not send network calls.
const source=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const part=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function harness(){
 const dom=new JSDOM('<main id="app"></main><section id="private-mount"></section>',{url:'https://aesd.example.test/aesd/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 // JSDOM has no layout observer. Real dimensions are verified in Chromium.
 w.ResizeObserver=class{observe(){}disconnect(){}};
 w.eval(`
 let sessionEpoch=0,ownerPanel='private',sector='market',tab='sales',category='',searchTerm='',privateFrame=null,privateReady=false,privateFrameEpoch=null,privateCloudStore=null,store=null,privateTarget='satis';
 const appearance={apply:()=>{}};
 const names={market:'Market',restaurant:'Restoran',cafe:'Kafe'},info={user:{id:1,role:'OWNER'}},config={publicKey:'test-public-key'},deviceId='navigation-test-device';
 const root=document.querySelector('#app'),privateMount=document.querySelector('#private-mount');
 let downloads=0,opening=null,lastOptions=null;
 const isShopManager=()=>info?.shopAccess?.role==='SHOP_MANAGER',privateUser=()=>isOwner()||isShopManager(),privateScope=()=>isShopManager()?info.shopAccess.scope:'owner:'+info.user.id,privateRole=()=>isShopManager()?'SHOP_MANAGER':info.user.role;
 const isOwner=()=>true,allowed=()=>true,usingPrivate=()=>ownerPanel==='private',now=Date.now;
 const closeMenu=()=>{},resetBasket=()=>{},persistSession=async()=>{},header=()=>'',api=()=>{},chooseMigration=()=>{},syncStatus=()=>{},panelGate=message=>{throw Error(message)},render=()=>{};
 ${part('let privateLayoutObserver=', 'const menu=')}
 ${source.split('\n').find(line=>line.startsWith('function hidePrivate('))}
 const apiPrivate=async()=>{downloads++;return '<p>Isolated private panel</p>';};
 const enter=async()=>{if(usingPrivate())await ownerSales();};
 const openPrivateOfflineStore=async options=>{lastOptions=options;if(opening)await opening;let closed=false;return {initialize:async()=>{},poll:async()=>{if(closed||!options.permission())throw Error('Sahip oturumu gerekli.');},close:()=>{closed=true},isClosed:()=>closed};};
 ${source.split('\n').find(line=>line.startsWith('function disposePrivate('))}
 ${part('async function switchOwnerPanel(', 'async function refreshInfo(')}
 ${source.split('\n').find(line=>line.startsWith('window.aesdPrivateCloud='))}
 ${part('async function ownerSales(', 'async function apiPrivate(')}
 window.testNav={show:ownerSales,switch:switchOwnerPanel,hide:hidePrivate,frame:()=>privateFrame,epoch:()=>sessionEpoch,downloads:()=>downloads,active:()=>privateCloudStore,options:()=>lastOptions,setOpening:value=>{opening=value},newEpoch:()=>sessionEpoch++};
 `);
 return{dom,w,nav:w.testNav,connect:()=>w.aesdPrivateCloud({initial:{},status:()=>{}})};
}
test('Settings and sales keep the same authorized private frame',async()=>{
 const h=harness();try{await h.nav.show();const frame=h.nav.frame(),active=await h.connect();h.nav.hide();await h.nav.show();assert.equal(h.nav.frame(),frame);assert.equal(h.nav.downloads(),1);assert.equal(active.isClosed(),false);await active.poll();await h.nav.switch('private');assert.equal(h.nav.frame(),frame);assert.equal(h.nav.epoch(),0);}finally{h.dom.window.close();}
});
test('A sector round trip opens a new private bridge with the current owner session',async()=>{
 const h=harness();try{await h.nav.show();const oldFrame=h.nav.frame(),oldStore=await h.connect();await h.nav.switch('market');assert.equal(h.nav.frame(),null);assert.equal(oldStore.isClosed(),true);await assert.rejects(oldStore.poll(),/Sahip oturumu/);await h.nav.switch('private');assert.notEqual(h.nav.frame(),oldFrame);assert.equal(h.nav.downloads(),2);const current=await h.connect();await current.poll();assert.equal(current.isClosed(),false);}finally{h.dom.window.close();}
});
test('A delayed old bridge cannot close or replace the current private store',async()=>{
 const h=harness();try{await h.nav.show();let release;h.nav.setOpening(new Promise(resolve=>release=resolve));const old=h.connect();const rejected=assert.rejects(old,/Oturum değişti/);h.nav.newEpoch();h.nav.setOpening(null);await h.nav.show();const current=await h.connect();release();await rejected;assert.equal(h.nav.active(),current);assert.equal(current.isClosed(),false);await current.poll();}finally{h.dom.window.close();}
});

test('A stale private initialization cannot send a request or open migration with a newer account',async()=>{const h=harness();try{await h.nav.show();await h.connect();const options=h.nav.options();h.nav.newEpoch();assert.throws(()=>options.api('/cloud/private'),/Oturum değişti/);assert.throws(()=>options.chooseMigration({module:'private',local:{products:[]}}),/Oturum değişti/);}finally{h.dom.window.close();}});
