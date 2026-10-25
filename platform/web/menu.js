import {createAppearance} from './appearance.js';
createAppearance();
const root=document.querySelector('#menu-app'),token=decodeURIComponent(location.hash.slice(1));
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(v/100);
const key='aesd.qr-pending.v1.'+token.split('.')[0];
let menu=null,cart=new Map(),pending=null,busy=false,message='',accepted=null,absent=false;
try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{message='Bu cihazın bekleyen sipariş kaydı okunamadı. Önce işletmeyle kontrol et.';}
async function api(path,body){
  let r;try{r=await fetch('/aesd/v1/public/menu/'+encodeURIComponent(token)+path,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,
    headers:{'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(30000)});}catch{throw Error('Bağlantı kurulamadı. Sipariş sonucu bilinmiyor. Aynı siparişi yeniden gönderme.');}
  let value;try{value=await r.json();}catch{throw Error('Geçerli yanıt alınamadı. Sipariş sonucunu kontrol et.');}
  if(!r.ok)throw Object.assign(Error(value.error||'İşlem tamamlanmadı.'),{status:r.status});
  return value;
}
function render(){
  if(!menu){root.innerHTML=`<section class="card"><h1>AESD Menü</h1><p role="alert">${escape(message||'Menü yükleniyor…')}</p><button data-menu-action="reload">Tekrar Kontrol Et</button></section>`;return;}
  const total=[...cart].reduce((n,[id,qty])=>n+(menu.items.find(x=>x.id===id)?.priceCents||0)*qty,0);
  root.innerHTML=`<header class="page-heading"><div><h1>${escape(menu.businessName)}</h1><p>${escape(menu.label)}</p></div></header>
    ${message?`<p class="note" role="status">${escape(message)}</p>`:''}
    ${accepted?`<section class="card"><h2>Sipariş Kaydı Alındı</h2><p>Durum: ${escape(({draft:'İşletme onayı bekliyor',sent:'Mutfağa gönderildi',paid:'Ödemesi kaydedildi',cancelled:'İptal edildi'})[accepted.status]||accepted.status)}</p><p>Bu ekran ödeme almaz. Hesabını işletmede tamamla.</p><button class="primary" data-menu-action="new">Yeni Sipariş</button></section>`:''}
    <section class="catalog">${menu.items.map(p=>`<article class="product card">${p.photo?`<img class="menu-photo" src="${escape(p.photo)}" alt="${escape(p.name)}" loading="lazy">`:''}<small>${escape(p.category)}</small><h2>${escape(p.name)}</h2><p>${money(p.priceCents)}</p>${menu.ordering&&!accepted?`<div class="row"><button data-menu-action="minus" data-id="${escape(p.id)}" aria-label="${escape(p.name)} azalt" ${pending||busy?'disabled':''}>−</button><strong>${cart.get(p.id)||0}</strong><button data-menu-action="add" data-id="${escape(p.id)}" aria-label="${escape(p.name)} ekle" ${pending||busy?'disabled':''}>+</button></div>`:''}</article>`).join('')}</section>
    ${menu.ordering&&!accepted?`<section class="card menu-order"><h2>Sipariş Özeti</h2>${[...cart].map(([id,qty])=>`<p>${escape(menu.items.find(x=>x.id===id)?.name||'Ürün')} × ${qty}</p>`).join('')}<p>Toplam: <strong>${money(total)}</strong></p><p class="note">Sipariş göndermek ödeme yapmak değildir. Fiyatlar sipariş kaydında tekrar kontrol edilir.</p>
      ${pending?`<p>Bir siparişin sonucu doğrulanmalı.</p><button data-menu-action="check" ${busy?'disabled':''}>Sipariş Sonucunu Kontrol Et</button>${absent?'<button data-menu-action="reload-unsubmitted">Sipariş Alınmamış · Güncel Menüyü Aç</button>':''}`:`<button class="primary full" data-menu-action="submit" ${!cart.size||busy?'disabled':''}>Siparişi İşletmeye Gönder</button>`}</section>`:''}`;
}
async function load(){menu=await api('');if(pending?.lines)cart=new Map(pending.lines.map(x=>[x.productId,x.qty]));render();}
root.addEventListener('click',async event=>{
  const el=event.target.closest('[data-menu-action]');if(!el||busy)return;
  const action=el.dataset.menuAction;
  if(action==='add'||action==='minus'){const next=(cart.get(el.dataset.id)||0)+(action==='add'?1:-1);if(next>100)return;if(next>0)cart.set(el.dataset.id,next);else cart.delete(el.dataset.id);render();return;}
  busy=true;message='';render();
  try{
    if(action==='reload')await load();
    else if(action==='submit'){
      if(pending||!cart.size)throw Error('Önce bekleyen siparişin sonucunu kontrol et.');
      pending={clientOrderId:crypto.randomUUID(),quote:menu.quote,lines:[...cart].map(([productId,qty])=>({productId,qty}))};
      // Persist before sending. A closed browser can query the same request.
      localStorage.setItem(key,JSON.stringify(pending));
      const result=await api('/orders',pending);
      if(!result.found)throw Error('Sipariş sonucu doğrulanamadı.');accepted=result;message=result.message||'Sipariş kaydı doğrulandı.';
    }else if(action==='check'){
      if(!pending)throw Error('Bekleyen sipariş bulunamadı.');
      const result=await api('/orders/'+encodeURIComponent(pending.clientOrderId));
      if(result.found){accepted=result;message='Sipariş kaydı sunucudan doğrulandı.';absent=false;}
      else{absent=true;message='Sunucuda bu sipariş kaydı bulunamadı. Güncel menüyü alıp tekrar kontrol edebilirsin.';}
    }else if(action==='new'||action==='reload-unsubmitted'){
      if(action==='reload-unsubmitted'&&!absent)throw Error('Önce sipariş sonucunu doğrula.');
      localStorage.removeItem(key);pending=null;accepted=null;absent=false;cart.clear();await load();
    }
  }catch(error){message=error.message;}finally{busy=false;render();}
});
try{if(!token)throw Error('Menü bağlantısı eksik. İşletmenin QR kodunu kullan.');await load();}catch(error){message=error.message;render();}
