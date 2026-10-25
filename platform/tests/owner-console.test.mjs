import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {businessStatus,filterBusinesses,licensePreview,summaryPeriods,createOwnerConsole} from '../web/owner-console.js';

const time=Date.parse('2026-10-18T12:00:00Z');
const sample={id:'business-one',name:'Örnek Market',email:'example@example.test',contactName:'Örnek',state:'approved',requestedModule:'market',trialStarted:null,licenses:[{id:'license-one',module:'market',plan:'monthly',active:1,activated_at:time-1000,expires:time+86400000,revision:1,deviceBound:true}],panels:[{module:'market',mode:'licensed'}]};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(check){for(let i=0;i<40;i++){if(check())return;await tick();}throw Error('Expected UI state did not arrive.');}
function fixture(handler){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://aesd.example.test/aesd/'}),w=dom.window,root=w.document.querySelector('#app'),calls=[];let epoch=1,role='OWNER',sales=0;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const api=async(path,body)=>{calls.push({path,body});if(handler)return handler(path,body);if(path==='/owner/staff')return{grants:[]};if(path==='/owner/audit')return{audit:[]};return{businesses:[structuredClone(sample)]};};
 const console=createOwnerConsole({root,api,isOwner:()=>role==='OWNER',getEpoch:()=>epoch,getIdentity:()=>({id:1,email:'owner@example.test'}),onEnter:()=>root.className='owner-console',onSales:()=>{sales++;root.className='sales';},onPanel:()=>{},onLogout:()=>{},onRecovery:()=>{},staffUrl:()=> 'https://aesd.example.test/aesd/staff.html',clock:()=>time,win:w,storage:w.sessionStorage});
 const click=(action)=>root.querySelector(`[data-owner-action="${action}"]`).click();
 return{w,root,calls,console,click,get sales(){return sales;},revoke:()=>{role='CLIENT';epoch++;root.className='';root.textContent='Login';w.dispatchEvent(new w.Event('aesd-owner-invalidated'));},close:()=>w.close()};
}
test('Customer filters respect server panel states, unstarted trials, closed access and Turkish search',()=>{
 const rows=[sample,{...sample,id:'2',state:'pending'},{...sample,id:'3',state:'suspended'},{...sample,id:'4',panels:[{mode:'expired'}]},{...sample,id:'5',panels:[{mode:'trial_ready'}]}];
 assert.equal(businessStatus(rows[3],time).key,'expired');assert.equal(businessStatus(rows[4],time).label,'Deneme hazır');
 assert.equal(filterBusinesses(rows,'örnek','pending',time).length,1);assert.equal(filterBusinesses(rows,'none','all',time).length,0);assert.equal(filterBusinesses(rows,'','suspended',time).length,1);
});
test('License preview keeps permanent licenses and activation timing distinct from extensions',()=>{
 assert.match(licensePreview(null,'monthly',time),/aktivasyonda 30/);assert.equal(licensePreview(sample.licenses[0],'permanent',time),'Süresiz');
 assert.equal(licensePreview({...sample.licenses[0],plan:'permanent'},'monthly',time),'Süresiz lisans süreli pakete çevrilemez.');
 assert.equal(licensePreview({...sample.licenses[0],expires:time-86400000},'weekly',time),new Date(time+7*86400000).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}));
});
test('Shared revenue uses the Turkish business day, includes seven days and excludes future reports',()=>{
 const result=summaryPeriods({days:[{date:'2026-09-30',netCents:1000},{date:'2026-10-01',netCents:2000},{date:'2026-10-02',netCents:3000},{date:'2026-10-07',netCents:4000},{date:'2026-10-08',netCents:5000}]},Date.parse('2026-10-06T21:30:00Z'));
 assert.equal(result.day.netCents,4000);assert.equal(result.weeklyCents,9000);assert.equal(result.monthlyCents,9000);
 assert.deepEqual(summaryPeriods({},time),{day:undefined,weeklyCents:0,monthlyCents:0});
});
test('Customer names and email values are escaped instead of becoming markup',async()=>{
 const f=fixture(async()=>({businesses:[{...sample,name:'<img src=x onerror=alert(1)>',email:'<svg onload=alert(1)>'}]}));try{await f.console.open();assert.equal(f.root.querySelector('img'),null);assert.match(f.root.textContent,/<img src=x/);f.click('detail');await tick();assert.equal(f.root.querySelector('svg[onload]'),null);}finally{f.close();}
});
test('A delayed owner read cannot replace a sign-out or role-denied screen',async()=>{
 let resolve;const f=fixture(()=>new Promise(done=>resolve=done));try{const opening=f.console.open();f.revoke();resolve({businesses:[sample]});await opening;assert.equal(f.root.textContent,'Login');assert.equal(f.w.document.querySelector('.oc-sheet').open,false);}finally{f.close();}
});
test('Unsaved license choices remain when leaving is cancelled; navigation never writes',async()=>{
 const f=fixture();try{await f.console.open();f.click('detail');f.click('license');const box=f.root.querySelector('[name=payment]');box.checked=true;box.dispatchEvent(new f.w.Event('change',{bubbles:true}));f.click('sales');await until(()=>f.w.document.querySelector('.oc-sheet').open);f.w.document.querySelector('[data-choice=no]').click();await tick();assert.equal(f.sales,0);assert.equal(f.root.querySelector('[name=payment]').checked,true);assert.equal(f.calls.filter(c=>c.body).length,0);}finally{f.close();}
});
test('Unknown license writes remain locked after refresh and reopening, without an automatic retry',async()=>{
 const storageCalls=[];const f=fixture(async(path,body)=>{if(body){storageCalls.push(body);throw Object.assign(Error('Network timeout'),{network:true});}return{businesses:[structuredClone(sample)]};});
 try{await f.console.open();f.click('detail');f.click('license');const box=f.root.querySelector('[name=payment]');box.checked=true;box.dispatchEvent(new f.w.Event('change',{bubbles:true}));f.root.querySelector('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>f.w.document.querySelector('.oc-sheet').open);f.w.document.querySelector('[data-choice=yes]').click();await until(()=>f.root.textContent.includes('Sonuç doğrulanamadı'));assert.equal(storageCalls.length,1);assert.ok(f.w.sessionStorage.getItem('aesd.owner-write.v1:1'));f.click('refresh');await until(()=>f.root.textContent.includes('Yönetim kayıtları güncel')||f.root.textContent.includes('İşlem sonucu doğrulanmalı'));await f.console.open();assert.match(f.root.textContent,/Sonuç doğrulanmalı/);assert.equal(storageCalls.length,1);assert.ok([...f.root.querySelectorAll('[data-owner-write]')].every(b=>b.disabled));}finally{f.close();}
});
test('Offline navigation shows the last read state and blocks administrative writes',async()=>{
 const f=fixture();try{await f.console.open();Object.defineProperty(f.w.navigator,'onLine',{value:false,configurable:true});f.w.dispatchEvent(new f.w.Event('offline'));assert.match(f.root.querySelector('.oc-status').textContent,/Bağlantı yok/);f.click('detail');assert.ok([...f.root.querySelectorAll('[data-owner-write]')].every(b=>b.disabled));assert.equal(f.calls.filter(c=>c.body).length,0);}finally{f.close();}
});
