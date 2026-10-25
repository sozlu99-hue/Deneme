import {confirmCheckout} from './checkout-browser-helper.mjs';
import {acceptBrowserPage,acceptBrowserAccount} from './browser-account-fixture.mjs';
import {browserOptions} from './browser-runtime.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
const origin=process.env.AESD_TEST_ORIGIN||'http://127.0.0.1:4173',checks=[],errors=[];
const browser=await chromium.launch(browserOptions);
const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
const call=async(path,body,token)=>{const r=await fetch(origin+'/aesd/v1'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;};
const check=name=>{checks.push(name);console.log('PASS '+name);};
const click=a=>page.locator('[data-action="'+a+'"]').first().click();
try{
 const email='review-'+crypto.randomUUID()+'@example.test',password='review-browser-password';
 const owner=await call('/login',{email:'owner@example.test',password:'browser-owner-test-password',deviceId:'review_owner_browser'});
 const b=await call('/register',{email,password,businessName:'AESD Kontrol',contactName:'Test',module:'market'});
 await call('/owner/businesses/'+b.id+'/approve',{approved:true},owner.token);
 const cafe=await call('/owner/businesses/'+b.id+'/license',{module:'cafe',plan:'monthly',paymentConfirmed:true},owner.token);
 await page.addInitScript(()=>setInterval(()=>document.querySelector('[data-action=cloud-import],[data-action=cloud-server]')?.click(),100));await page.goto(origin+'/aesd/');await page.getByRole('heading',{name:'Hoş geldin'}).waitFor();
 await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(password);await page.locator('[name=remember]').check();await page.locator('[data-form=login] [type=submit]').click();await page.getByRole('heading',{name:'Hesabını Hazırla'}).waitFor();await acceptBrowserPage(page,owner.token);await click('retry');await page.getByText('Bugünkü Net Ciro',{exact:true}).waitFor();
 const seeded=await page.evaluate(async b=>{
  const {openStore}=await import('./cloud-fixture.js');const market=await openStore(b,'market');
  await market.command({type:'customer',name:'Örnek Cari'});
  for(const [name,priceCents,barcode] of [['Ürün A',1000,'8691001'],['Ürün B',1001,'8691002']]){
   const s=await market.command({type:'product',product:{name,priceCents,barcode}});
   await market.command({type:'purchase',kind:'products',itemId:s.products.at(-1).id,qty:10,costCents:300});
  }
  const m=await market.read();market.close();const cafe=await openStore(b,'cafe');
  let s=await cafe.command({type:'material',name:'Malzeme'});const materialId=s.materials[0].id;
  await cafe.command({type:'purchase',kind:'materials',itemId:materialId,qty:10,costCents:0});
  for(const name of ['Ölçülü A','Ölçülü B'])await cafe.command({type:'product',product:{name,priceCents:1,recipe:[{materialId,qty:1}]}});
  s=await cafe.read();await cafe.command({type:'order',label:'Ölçülü masa',lines:s.products.map(p=>({productId:p.id,qty:0.5}))});cafe.close();
  return m;
 },b.id);
 await page.reload();await page.locator('.product').first().waitFor();
 await page.locator('#search').fill('8691001');await page.locator('#search').press('Enter');
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'search');check('The barcode field keeps focus after each scan');
 await page.locator('#payment').selectOption('credit');await page.locator('#customer').selectOption(seeded.customers[0].id);
 await page.locator('#search').fill('8691002');await page.locator('#search').press('Enter');
 assert.equal(await page.locator('#payment').inputValue(),'credit');assert.equal(await page.locator('#customer').inputValue(),seeded.customers[0].id);check('Product additions retain the payment method and credit account');
 await page.locator('#payment').selectOption('card');
 await page.evaluate(()=>{const b=document.querySelector('[data-action=checkout]');b.click();b.click();});await page.locator('#dialog [data-action=checkout-confirm]').waitFor();await page.evaluate(()=>{const button=document.querySelector('#dialog [data-action=checkout-confirm]');button.click();button.click();});
 await page.waitForFunction(()=>document.querySelector('.stat strong')?.textContent.includes('20,01'));
 const read=module=>page.evaluate(async({businessId,module})=>{const {openStore}=await import('./store.js');const db=await openStore(businessId,module);try{return await db.read();}finally{db.close();}},{businessId:b.id,module});
 let data=await read('market');assert.equal(data.sales.length,1);assert.equal(data.sales[0].payment,'card');assert.deepEqual(data.products.map(x=>x.stock),[9,9]);check('Two immediate checkout clicks create one sale and one stock deduction');
 assert.equal(await page.locator('.basket [data-action=checkout]').isDisabled(),true);assert.equal(await page.locator('#payment').count(),0);await page.locator('.product').first().click();assert.equal(await page.locator('#payment').inputValue(),'cash');await page.locator('#payment').selectOption('credit');assert.equal(await page.locator('#customer').inputValue(),'');await click('clear-cart');check('A completed sale empties the basket and the next basket resets payment and credit selection');
 await click('settings');await click('backup');const corrupt=structuredClone(data);corrupt.sales[0].deductions[0].qty=7;
 await page.locator('#backup-file').setInputFiles({name:'corrupt.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))});await page.locator('[name=confirmed]').check();await page.locator('[data-form=restore] [type=submit]').click();await page.getByRole('alert').filter({hasText:'Stok'}).waitFor();assert.deepEqual(await read('market'),data);check('A corrupt stock backup is rejected without changing saved records');
 await click('close');await click('sales');await page.locator('.product').first().click();await click('settings');await click('license');
 await acceptBrowserPage(page,owner.token,'cafe');await page.locator('[data-action=activation][data-sector=cafe]').click();await page.locator('[name=code]').fill(cafe.code);await page.locator('[data-form=activate] [type=submit]').click();await page.getByText('Bugünkü Net Ciro',{exact:true}).waitFor();
 assert.equal(await page.locator('.basket .line').count(),0);assert.match(await page.locator('.basket').innerText(),/Adisyon|Sepet/);check('Changing panels clears the old basket before it renders the new products');
 await click('orders');await page.locator('#dialog [data-action=load-order]').click();assert.match(await page.locator('.basket .total').textContent(),/0,02/);check('The basket total equals the sum of rounded sale lines');
 await click('checkout');await confirmCheckout(page);await page.waitForFunction(()=>document.querySelector('.stat strong')?.textContent.includes('0,02'));data=await read('cafe');assert.equal(data.sales[0].totalCents,2);assert.equal(data.materials[0].stock,9);assert.equal(data.orders.length,0);check('Fractional order checkout keeps the displayed total and material balance');
 const session=JSON.parse(await page.evaluate(()=>localStorage.getItem('aesd.session.v2'))),previousInfo=await call('/me',undefined,session.token);
 let release,started;const began=new Promise(r=>started=r);
 await page.route('**/aesd/v1/me',async route=>{started();await new Promise(r=>release=r);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(previousInfo)});});
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await began;await click('settings');await click('logout');await page.getByRole('heading',{name:'Hoş geldin'}).waitFor();release();await page.waitForTimeout(150);assert.equal(await page.locator('.tabs').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('aesd.session.v2')),null);check('A delayed session refresh cannot restore a logged-out screen');
 await page.unroute('**/aesd/v1/me');
 const config=JSON.parse(await fs.readFile('web/config.json','utf8'));
 const client=await call('/login',{email,password,deviceId:'review_saved_device'});
 for(const [audience,savedSession] of [['customer',owner],['all',client]]){
  const roleContext=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  try{
   const rolePage=await roleContext.newPage();rolePage.on('pageerror',e=>errors.push(e.message));
   await rolePage.route('**/aesd/config.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...config,audience,apiOrigin:origin,publicKey:previousInfo.publicKey})}));
   await rolePage.goto(origin+'/aesd/');await rolePage.getByRole('heading',{name:'Hoş geldin'}).waitFor();
   await rolePage.evaluate(async savedSession=>{const {savePreferences}=await import('./store.js');await savePreferences({sector:'market',deviceId:'review_saved_device',session:{...savedSession,remember:true}});},savedSession);
   const requests=[];rolePage.on('request',r=>{if(r.url().includes('/aesd/v1/'))requests.push(r.url());});
   await rolePage.reload();
   if(audience==='customer'){
    await rolePage.getByRole('heading',{name:'Hoş geldin'}).waitFor();assert.deepEqual(requests,[]);
    assert.equal(await rolePage.evaluate(async()=>{const {readPreferences}=await import('./store.js');return (await readPreferences())?.session??null;}),null);
    check('The retired customer package still rejects an owner session');
   }else{
    await rolePage.getByRole('heading',{name:'Hesabını Hazırla'}).waitFor();assert.ok(requests.some(x=>x.endsWith('/me')));
    assert.equal(await rolePage.locator('[data-action=owner-admin]').count(),0);
    check('The unified package accepts the customer role and requires approval for its new device');
   }
   assert.equal(await rolePage.locator('iframe').count(),0);
  }finally{await roleContext.close();}
 }
 assert.deepEqual(errors,[]);check('The review flows produce no page exceptions');
 await fs.writeFile('evidence/review-browser-results.json',JSON.stringify({status:'passed',checks,checksCount:checks.length,pageErrors:errors,android:false,realEmail:false},null,2));
}finally{await browser.close();}
