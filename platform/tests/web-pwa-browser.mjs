import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {browserOptions} from './browser-runtime.mjs';

const origin=process.env.AESD_TEST_ORIGIN;
assert.match(origin||'',/^http:\/\/127\.0\.0\.1:\d+$/);
const checks=[],errors=[],check=name=>{checks.push(name);console.log('PASS '+name);};

// Chrome treats a temporary Playwright context as Incognito. Use a normal profile for installability.
{
 const profile='/tmp/aesd-web-pwa-profile-'+crypto.randomUUID();
 const installContext=await chromium.launchPersistentContext(profile,{...browserOptions,viewport:{width:390,height:844}});
 try{
  const installPage=await installContext.newPage();
  await installPage.goto(origin+'/aesd/');await installPage.getByRole('heading',{name:'Hoş geldin'}).waitFor();
  await installPage.evaluate(()=>navigator.serviceWorker.ready);await installPage.reload();await installPage.getByRole('heading',{name:'Hoş geldin'}).waitFor();
  const client=await installContext.newCDPSession(installPage);await client.send('Page.enable');
  const parsed=await client.send('Page.getAppManifest');
  assert.deepEqual(parsed.errors,[]);assert.ok(parsed.url.endsWith('/aesd/manifest.webmanifest'));
  const installability=await client.send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors,[],'Chrome reports: '+JSON.stringify(installability.installabilityErrors));
  check('Chrome reports no reason against installation');
 }finally{await installContext.close();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});}
}

const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles'}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
try{
 const manifestResponse=await fetch(origin+'/aesd/manifest.webmanifest');assert.equal(manifestResponse.status,200);
 assert.match(manifestResponse.headers.get('Content-Type'),/manifest\+json/);
 const manifest=await manifestResponse.json();assert.equal(manifest.name,'AESD');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
 for(const size of ['192x192','512x512'])assert.ok(manifest.icons.some(i=>i.sizes===size&&i.purpose==='any'),'missing any icon '+size);
 assert.ok(manifest.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'),'missing maskable icon');
 for(const icon of manifest.icons){const answer=await fetch(new URL(icon.src,origin+'/aesd/'));assert.equal(answer.status,200,icon.src);assert.match(answer.headers.get('Content-Type'),/image\/png/);}
 check('The web manifest and installation icons are served by the existing service');
 await page.goto(origin+'/aesd/');await page.getByRole('heading',{name:'Hoş geldin'}).waitFor();
 assert.equal(await page.title(),'AESD · İşyeri Yönetimi');assert.equal(await page.locator('link[rel=manifest]').count(),1);
 check('The browser entry opens the existing account login');
 await page.evaluate(async()=>{
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
 });
 check('The web service worker installs and controls the page');
 await page.evaluate(()=>{
  window.__installCalls=0;
  const event=new Event('beforeinstallprompt',{cancelable:true});
  event.prompt=async()=>{window.__installCalls++;};event.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(event);
 });
 await page.locator('#web-install-button').click();await page.waitForFunction(()=>window.__installCalls===1&&!document.querySelector('#web-install-button').disabled);
 await page.locator('#web-install-button').click();await page.getByRole('heading',{name:'AESD’yi Ekle'}).waitFor();
 assert.match(await page.locator('.web-install-help').textContent(),/Safari/);assert.match(await page.locator('.web-install-help').textContent(),/internet gerekir/);
 await page.getByRole('button',{name:'Kurulum yardımını kapat'}).click();
 check('A simulated dismissed install offer falls back to clear browser instructions');
 for(const width of [320,390,768,1366]){
  await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if([390,1366].includes(width))await page.screenshot({path:'evidence/web154-login-'+width+'.png',fullPage:true});
  check('Login and installation tools fit '+width+' pixels');
 }
 await page.evaluate(async()=>{const {savePreferences}=await import('./store.js');await savePreferences({sector:'market',ownerPanel:'market',session:null});});
 await page.reload();await page.locator('[name=email]').fill('owner@example.test');await page.locator('[name=password]').fill('browser-owner-test-password');await page.locator('[name=remember]').check();await page.locator('[data-form=login] [type=submit]').click();
 await page.getByRole('heading',{name:'Market Satış',exact:true}).waitFor();assert.equal(await page.locator('iframe').count(),0);
 assert.equal(await page.locator('.stat strong').first().textContent(),'₺0,00');
 check('The existing owner opens the empty market panel with no sample financial records');
 await page.screenshot({path:'evidence/web154-market-desktop.png',fullPage:true});
 await page.locator('[data-action=settings]').first().click();await page.locator('.oc-nav [data-owner-action=settings]').click();await page.locator('[data-owner-action=install]').click();await page.getByRole('heading',{name:'AESD’yi Ekle'}).waitFor();await page.getByRole('button',{name:'Kurulum yardımını kapat'}).click();check('Owner settings open installation help without a repeated header');await page.locator('[data-owner-action=logout]').click();await page.getByRole('heading',{name:'Hoş geldin'}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('aesd.session.v2')),null);
 check('Logout clears the remembered account');
 const cached=await page.evaluate(async()=>{const names=await caches.keys();const urls=[];for(const name of names.filter(n=>n.startsWith('aesd-shell-')))for(const request of await(await caches.open(name)).keys())urls.push(request.url);return urls;});
 assert.ok(cached.some(url=>url.endsWith('/manifest.webmanifest')));assert.equal(cached.some(url=>url.includes('/v1/')),false);
 check('Public shell caching contains no account API or private financial response');
 await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'Hoş geldin'}).waitFor();
 const blocked=await page.evaluate(async()=>{try{await fetch('./v1/me');return false;}catch{return true;}});assert.equal(blocked,true);
 check('Offline reload opens the cached shell and does not invent an account API response');
 await context.setOffline(false);await page.reload();await page.getByRole('heading',{name:'Hoş geldin'}).waitFor();
 await page.getByRole('link',{name:/Personel girişi/}).click();await page.getByRole('heading',{name:'Personel Girişi',exact:true}).waitFor();
 check('The same web entry retains the separate staff login');
 assert.deepEqual(errors,[]);check('The tested browser flows produce no page exceptions');
 await fs.writeFile('evidence/web154-browser-results.json',JSON.stringify({status:'passed',checks,checksCount:checks.length,pageErrors:errors,fixtureData:true,simulatedInstallOffer:true,realInstallationTested:false,realAndroid:false,realIPhone:false},null,2));
}finally{await browser.close();}
