import {cents} from './pos.js';
import {normalizePayments} from './payment-rules.js';
import {isQuantity,isMoney} from './numeric-rules.js';

export function quoteCheckout({state,lines,method,parts={},customerId=''}) {
 if(!state||!Array.isArray(lines)||!lines.length)throw Error('Sepet boş.');
 const seen=new Set();
 const items=lines.map(line=>{
  const product=state.products.find(p=>p.id===line.productId);
  if(!product||seen.has(line.productId)||!isQuantity(line.qty))throw Error('Sepet güncellendi. Ürün ve miktarı kontrol et.');
  seen.add(line.productId);const amount=Math.round(product.priceCents*line.qty);
  if(!isMoney(amount))throw Error('Satış tutarı geçersiz.');
  return{productId:product.id,name:product.name,qty:line.qty,totalCents:amount,priceCents:product.priceCents};
 });
 const totalCents=items.reduce((n,line)=>n+line.totalCents,0);
 const rows=method==='split'?Object.entries(parts).map(([key,value])=>({method:key,amountCents:cents(value||'0')})):[{method,amountCents:totalCents}];
 const payments=normalizePayments(rows,totalCents,method);
 const credit=payments.some(p=>p.method==='credit'&&p.amountCents>0);
 const customer=customerId?state.customers.find(c=>c.id===customerId):null;
 if(credit&&!customer)throw Error('Veresiye tutarı için cari hesabı seç.');
 return{items,totalCents,payments,cashCents:payments.find(p=>p.method==='cash')?.amountCents||0,customerName:credit?customer.name:'',fingerprint:JSON.stringify(items)};
}
export function createCheckoutReview({context,modal,dialog,button,escape,money,commit}) {
 let prepared=null,writing=false;
 const labels={cash:'Nakit',card:'Kart kaydı',credit:'Veresiye',other:'Diğer'};
 function current(){const value=context();if(!value.allowed)throw Error('Lisans veya oturum kontrolü gerekli.');if(value.syncMode==='offline')throw Error('Bağlantı yok. Ortak satış için sunucu onayı gerekir.');if(['pending','saving'].includes(value.syncMode))throw Error('Önce bağlantıyı ve bekleyen işlem sonucunu kontrol et.');return value;}
 function open(){
  const value=current(),quote=quoteCheckout(value);
  prepared={quote,value:structuredClone({lines:value.lines,method:value.method,parts:value.parts,customerId:value.customerId,warehouseId:value.warehouseId,dueDate:value.dueDate,orderId:value.orderId,orderLabel:value.orderLabel}),scope:value.scope,epoch:value.epoch,id:crypto.randomUUID()};
  modal('Ödeme özeti',`<section class="checkout-summary">${quote.items.map(x=>`<div><span>${x.qty} × ${escape(x.name)}</span><strong>${money(x.totalCents)}</strong></div>`).join('')}<div class="checkout-review-total"><span>Toplam</span><strong>${money(quote.totalCents)}</strong></div>${quote.payments.map(x=>`<div><span>${labels[x.method]}</span><strong>${money(x.amountCents)}</strong></div>`).join('')}${quote.customerName?`<div><span>Cari hesap</span><strong>${escape(quote.customerName)}</strong></div>`:''}</section>${quote.cashCents?`<label for="checkout-received">Alınan nakit (TL)</label><input id="checkout-received" data-cash-cents="${quote.cashCents}" name="received" inputmode="decimal" autocomplete="off" placeholder="0,00" aria-describedby="checkout-change"><div class="checkout-change" id="checkout-change" role="status"><span>Para üstü</span><strong>—</strong></div>`:''}<p class="account-info">Kart seçimi bir ödeme kaydıdır; karttan para çekmez. Stok ve cari kaydı yalnız sunucu işlemi onaylayınca tamamlanır.</p><p class="checkout-error" data-checkout-error role="alert"></p><footer class="checkout-controls">${button('Geri dön','checkout-edit')}${button('Ödemeyi onayla','checkout-confirm','','primary')}</footer>`);
 }
 function received(){if(!prepared?.quote.cashCents)return 0;const value=dialog.querySelector('#checkout-received')?.value||'';if(!/^\d+(?:[.,]\d{1,2})?$/.test(value))throw Error('Alınan nakdi en fazla iki ondalıkla gir.');const amount=cents(value.replace(',','.'));if(amount<prepared.quote.cashCents)throw Error('Alınan nakit, nakit ödeme tutarından az olamaz.');return amount;}
 function change(){const target=dialog.querySelector('#checkout-change strong');if(!target||!prepared)return;try{target.textContent=money(received()-prepared.quote.cashCents);}catch{target.textContent='—';}}
 async function confirm(){
  if(writing||!prepared)return;
  const result=current(),snapshot=prepared;
  if(snapshot.epoch!==result.epoch||snapshot.scope!==result.scope)throw Error('Oturum veya panel değişti. Ödeme özetini yeniden aç.');
  if(quoteCheckout(result).fingerprint!==snapshot.quote.fingerprint)throw Error('Sepet veya fiyat değişti. Ödeme özetini yeniden incele.');
  received();writing=true;
  try{await commit(snapshot);if(prepared===snapshot)prepared=null;}
  catch(error){const target=dialog.querySelector('[data-checkout-error]');if(target)target.textContent=error.message;throw error;}
  finally{writing=false;}
 }
 dialog.addEventListener('input',event=>{if(event.target.id==='checkout-received')change();});
 return{open,confirm,recovered:id=>{if(prepared?.id===id){prepared=null;if(dialog.querySelector('[data-action=checkout-confirm]'))dialog.close();}},cancel:()=>{if(writing)return;prepared=null;dialog.close();}};
}
