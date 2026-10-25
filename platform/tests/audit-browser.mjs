import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {browserOptions} from './browser-runtime.mjs';
import {emptyState} from '../web/pos.js';

const origin=process.env.AESD_TEST_ORIGIN;
assert.match(origin||'',/^http:\/\/127\.0\.0\.1:\d+$/);
const deviceId='audit_browser_device_001';
const login=await fetch(origin+'/aesd/v1/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'browser-owner-test-password',deviceId,remember:true})}).then(r=>r.json());assert.ok(login.token);
const call=async(body)=>{const r=await fetch(origin+'/aesd/v1/cloud/market',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+login.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200);return r.json();};
const mutate=(kind,data)=>call({operationId:crypto.randomUUID(),kind,data});
await mutate('import',emptyState('owner:'+login.user.id,'market'));
let row=await mutate('command',{type:'product',product:{name:'Synthetic refund item',priceCents:1000}});
await mutate('command',{type:'purchase',kind:'products',itemId:row.state.products[0].id,qty:1,costCents:100});
row=await mutate('command',{type:'customer',name:'Synthetic customer with a long name for the narrow screen'});const customerId=row.state.customers[0].id;
await mutate('command',{type:'sale',id:'audit-credit-sale',lines:[{productId:row.state.products[0].id,qty:1}],payment:'credit',customerId});
await mutate('command',{type:'collect',customerId,amountCents:1000});await mutate('command',{type:'cancel',id:'audit-credit-sale'});
const browser=await chromium.launch(browserOptions),page=await browser.newPage({viewport:{width:320,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin+'/aesd/');await page.getByRole('heading',{name:'Hoş geldin'}).waitFor();await page.evaluate(async data=>{const{savePreferences}=await import('./store.js');await savePreferences({deviceId:data.deviceId,sector:'market',ownerPanel:'market',session:{...data.login,remember:true}});},{deviceId,login});await page.reload();await page.getByRole('heading',{name:'Market Satış',exact:true}).waitFor();
 await page.locator('.menu-trigger').click();await page.locator('[data-action=customers]').click();
 assert.equal(await page.locator('#dialog .table-wrap').count(),1);assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));
 await page.locator('[data-action=customer-refund]').click();await page.locator('[data-form=customer-refund] [name=amount]').fill('10.00');await page.locator('[data-form=customer-refund] [name=reason]').fill('Synthetic cancelled sale refund');await page.locator('[data-form=customer-refund] [type=submit]').click();
 await page.locator('[data-form=customer]').waitFor();const saved=await call();assert.equal(saved.state.customers[0].balanceCents,0);assert.equal(saved.state.refunds.length,1);console.log('PASS Customer refund UI posts one bounded refund and preserves collection history');
 const manifest=await fetch(origin+'/aesd/staff.webmanifest').then(r=>r.json());assert.equal(manifest.start_url,'./staff.html');assert.equal(manifest.display,'standalone');console.log('PASS Staff installation manifest is served');
 assert.deepEqual(errors,[]);console.log('PASS Narrow customer dialog is reachable and has no page exceptions');
}catch(error){console.error(await page.locator('body').innerText());throw error;}finally{await browser.close();}
