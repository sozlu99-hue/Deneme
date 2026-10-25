const {test}=require('node:test'),assert=require('node:assert/strict');
const {launch,base,wait}=require('./pos-harness.cjs');
const initial=()=>({...base(),settings:{debtPermission:true},customers:[{id:'ui-collection-customer',name:'Collection UI',phone:'',alacak:2970,borc:0,txns:[]}]});
const navigate=(app,page)=>app.w.dispatchEvent(new app.w.MessageEvent('message',{source:app.w.parent,origin:app.w.location.origin,data:{type:'AESD_PRIVATE_NAVIGATE',page}}));
const clickText=(app,text)=>{const b=[...app.w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===text&&!b.disabled);assert.ok(b,'Button missing: '+text);b.click();};
test('The actual private customer detail exposes collection and follows the live balance',async()=>{
 const app=await launch(undefined,initial());navigate(app,'cari');await wait(()=>app.w.document.querySelector('.aesd-account-list'));
 app.w.document.querySelector('[data-customer-id="ui-collection-customer"] .aesd-account-open').click();await wait(()=>app.w.document.querySelector('.aesd-account-detail'));
 assert.match(app.w.document.querySelector('.aesd-account-detail').textContent,/2.970,00/);
 const original=app.store().customers[0].id;
 assert.equal(await app.store().addCustomerTxn(original,'tahsilat',500,'Detail update','Kart'),true);
 await wait(()=>app.w.document.querySelector('.aesd-account-detail')?.textContent.includes('2.470,00'));
 const buttons=app.w.document.querySelector('.aesd-account-detail').querySelectorAll('button');assert.equal(buttons[0].textContent,'Tahsilat al');buttons[0].click();
 await wait(()=>app.w.document.querySelector('.aesd-collection'));
 assert.match(app.w.document.querySelector('.aesd-collection').textContent,/NakitKart/);
 assert.equal(app.w.document.querySelector('.aesd-collection input').inputMode,'decimal');
 assert.equal(app.errors.length,0);
});
test('The actual stock view retains units, movements and edit actions in the compact layout',async()=>{
 const app=await launch(undefined,initial());navigate(app,'stok');await wait(()=>app.w.document.querySelector('.aesd-stock-card'));
 const card=app.w.document.querySelector('[data-stock-id="s1"]');assert.match(card.textContent,/Çiğköfte Hamuru/);assert.match(card.textContent,/5 kg/);
 assert.match(card.textContent,/Giriş/);assert.match(card.textContent,/Sayım/);assert.match(card.textContent,/Fire/);assert.match(card.textContent,/Alış maliyeti eksik/);assert.equal(card.querySelector('button.aesd-stock-cost'),null);
 assert.equal(card.querySelector('details summary').getAttribute('aria-label'),'Çiğköfte Hamuru ürün işlemleri');
 card.querySelector('.aesd-account-actions button').click();await wait(()=>app.w.document.querySelector('.aesd-stock-form'));
 assert.match(app.w.document.querySelector('.aesd-stock-form').textContent,/Gelen miktar/);assert.match(app.w.document.querySelector('.aesd-stock-form').textContent,/Alış maliyeti/);assert.ok(app.w.document.querySelector('input[aria-label="Toplam alış tutarı (TL)"]'));assert.equal(app.errors.length,0);
});
