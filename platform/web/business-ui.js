import {dateKey} from './business-calendar.js';
import {lotAlerts,availableLots} from './lot-rules.js';
import {cents,command} from './pos.js';
import {buildSaleReturn} from './payment-rules.js';
import {paymentAmount,expectedCash} from './payment-rules.js';
import {warehouseBalance,stockAlerts,expiryAlerts} from './inventory-rules.js';
import {financialTotals,receivablesAging,customerStatement,supplierBalance,bankLedgerTargets,csvDocument} from './finance-rules.js';

const methods = {cash:'Nakit',card:'Kart',credit:'Veresiye',other:'Diğer'};
const stamp = date => new Date(date).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'});

export function createBusinessUI({modal,dialog,button,field,submit,escape,money,getState,execute,render,api,getSector}) {
  let pendingReview=null;
  const state = () => getState() || (()=>{throw Error('Önce Market, Restoran veya Kafe panelini aç. Özel panelin mevcut işletme işlemleri kendi menüsündedir.');})();
  const select = (label,name,rows,current='') => `<label for="${name}">${escape(label)}</label><select id="${name}" name="${name}">${rows.map(([key,text])=>`<option value="${escape(key)}" ${key===current?'selected':''}>${escape(text)}</option>`).join('')}</select>`;
  const hidden = (name,value) => `<input type="hidden" name="${name}" value="${escape(value)}">`;
  const form = (kind,content,label) => `<form data-form="business-${kind}">${content}${submit(label)}</form>`;
  const action = (label,name,extra='',cls='') => button(label,'business-'+name,extra,cls);
  const warehouseOptions = () => [['main','Ana depo'],...(state().warehouses||[]).map(x=>[x.id,x.name])];
  const paymentFields = (initial={}) => Object.entries(methods).map(([key,label])=>field(label+' (TL)','paid_'+key,'number',initial[key]??'0','min="0" step="0.01" required')).join('');
  const paymentRows = data => Object.keys(methods).map(method=>({method,amountCents:cents(data['paid_'+method]||'0')})).filter(x=>x.amountCents>0);
  const itemOptions = () => ['products','materials'].flatMap(kind=>state()[kind].map(x=>[kind+':'+x.id,x.name+' · '+(x.unit||'adet')]));
  const pickItem = value => {const [kind,id]=value.split(':');return {kind,itemId:id,item:state()[kind]?.find(x=>x.id===id)};};
  const amountInput = (label,name='amount',value='') => field(label,name,'number',value,'required min="0.01" step="0.01"');
  const qtyInput = (label,name='qty',value='') => field(label,name,'number',value,'required min="0.001" step="0.001"');
  const reason = () => field('Açıklama','reason','text','','required minlength="3" maxlength="500"');

  function home() {
    const s=state();
    modal('İşletme İşlemleri',`<p>Seçili panel: ${escape(({market:'Market',restaurant:'Restoran',cafe:'Kafe'})[s.module])}</p><div class="operation-links">
      ${action('Kasa ve Ödeme','register','','full')}${action('Ürün ve Reçete Düzenleme','products','','full')}
      ${action('Stok, Sayım ve Tedarik','inventory','','full')}${s.module!=='market'?action('Masalar ve Mutfak','restaurant','','full'):''}
      ${action('Cari, Finans ve Raporlar','finance','','full')}${action('Bağlantılar ve Donanım','integrations','','full')}</div>`);
  }
  function register() {
    const s=state(),shift=s.shifts?.find(x=>x.status==='open');
    modal('Kasa ve Ödeme',`${shift?`<section class="card"><h3>${escape(shift.name)}</h3><p>Açılış: ${stamp(shift.openedAt)}</p><p>Beklenen nakit: <strong>${money(expectedCash(s,shift.id))}</strong></p></section>
      ${form('cash-move',select('Yön','direction',[['in','Nakit giriş'],['out','Nakit çıkış']])+amountInput('Tutar (TL)')+reason(),'Kasa Hareketini Kaydet')}
      <hr>${form('register-close',hidden('shiftId',shift.id)+field('Sayılan nakit (TL)','counted','number','','required min="0" step="0.01"')+reason(),'Kasayı Kapat')}`:
      form('register-open',field('Kasa / vardiya adı','name','text','','required maxlength="80"')+field('Açılış nakdi (TL)','opening','number','0','required min="0" step="0.01"'),'Kasayı Aç')}
      <p class="note">Bu ekran ödeme kaydı tutar. Karttan para çekmez. Mali fiş üretmez. Nakit giderler ve tedarikçi ödemeleri kasaya yansır.</p>
      <h3>Son kapanışlar</h3>${(s.shifts||[]).filter(x=>x.status==='closed').slice(-20).reverse().map(x=>`<div class="line"><strong>${escape(x.name)}</strong><p>${stamp(x.closedAt)} · Beklenen ${money(x.expectedCents)} · Sayılan ${money(x.countedCents)} · Fark ${money(x.differenceCents)}</p><small>${escape(x.reason)}</small></div>`).join('')||'<p>Henüz kapanış yok.</p>'}`);
  }
  function products() {
    modal('Ürün ve Reçete Düzenleme',`<p>Değişiklikler yeni satışlara uygulanır. Önceki satışların tutarları ve maliyetleri korunur.</p>${state().products.map(p=>`<div class="line row spread"><span><strong>${escape(p.name)}</strong><small> · ${money(p.priceCents)} · Reçete sürümü ${p.recipeVersion||1}</small></span>${action('Düzenle','product-edit',`data-id="${p.id}"`)}</div>`).join('')||'<p>Önce Ürünler bölümünden ürün ekle.</p>'}`);
  }
  function editProduct(id) {
    const s=state(),p=s.products.find(x=>x.id===id);
    if(!p)throw Error('Ürün bulunamadı.');
    modal('Ürünü Düzenle',form('product-edit',hidden('id',p.id)+field('Ürün adı','name','text',p.name,'required maxlength="100"')+
      field('Birim fiyat (TL)','price','number',(p.priceCents/100).toFixed(2),'required min="0" step="0.01"')+field('Barkod','barcode','text',p.barcode,'maxlength="80"')+
      field('Kategori','category','text',p.category||'Genel','required maxlength="40"')+(s.module==='market'?'':select('Hazırlık istasyonu','station',[['kitchen','Mutfak'],['bar','Bar / İçecek']],p.station||'kitchen')+
      '<h3>Bir ürün için malzeme miktarları</h3>'+s.materials.map(m=>{const row=p.recipe.find(x=>x.materialId===m.id);return `<fieldset><legend>${escape(m.name)} (${escape(m.unit)})</legend>${field('Ana malzeme miktarı','recipe_'+m.id,'number',row?.qty||0,'min="0" step="0.001"')}${select('İsteğe bağlı alternatif','alt_'+m.id,[['','Alternatif yok'],...s.materials.filter(x=>x.id!==m.id).map(x=>[x.id,x.name])],row?.alternatives?.[0]?.materialId||'')}${field('Alternatif miktarı','altqty_'+m.id,'number',row?.alternatives?.[0]?.qty||0,'min="0" step="0.001"')}</fieldset>`;}).join('')),'Değişikliği Kaydet'));
  }
  function inventory() {
    const s=state(),alerts=stockAlerts(s),expiry=lotAlerts(s);
    modal('Stok, Sayım ve Tedarik',`<div class="operation-links">${action('Mal Kabul / Alış','receive','','full')}${action('Tedarikçiler','suppliers','','full')}${action('Depolar ve Transfer','warehouses','','full')}</div>
      ${alerts.length?`<p class="note">Kritik stok: ${alerts.map(x=>escape(x.name)+' ('+x.stock+')').join(', ')}</p>`:''}
      <div class="table-wrap"><table><thead><tr><th>Stok kalemi</th><th>Toplam / Ana depo</th><th>İşlem</th></tr></thead><tbody>${['products','materials'].flatMap(kind=>s[kind].map(p=>`<tr><td>${escape(p.name)}<small> ${escape(p.unit||'adet')}</small></td><td>${p.stock} / ${warehouseBalance(s,kind,p.id)}</td><td>${action('Ayrıntı','stock-detail',`data-kind="${kind}" data-id="${p.id}"`)} ${action('Sayım','count',`data-kind="${kind}" data-id="${p.id}"`)} ${action('Fire','waste',`data-kind="${kind}" data-id="${p.id}"`)} ${action('Kritik Stok','stock-settings',`data-kind="${kind}" data-id="${p.id}"`)}</td></tr>`)).join('')}</tbody></table></div>
      <h3>Parti ve tarih kayıtları</h3><p class="note">Parti takibi açık kalemlerde kalan miktarlar izlenir. Satışta önce tarihi yaklaşan parti kullanılır. Tarihi geçmiş parti satılamaz.</p>${expiry.slice(-100).map(x=>`<div class="line"><strong>${escape(x.name)} · ${escape(x.lotNumber||'Parti belirtilmedi')}</strong><p>Kalan: ${x.remainingQty} · SKT ${escape(x.expiryDate)} ${x.expired?'· Tarih geçmiş':''}</p></div>`).join('')||'<p>Yaklaşan tarih kaydı yok.</p>'}`);
  }
  function stockDetail(kind,id) {
    const s=state(),p=s[kind]?.find(x=>x.id===id);if(!p)throw Error('Stok kalemi bulunamadı.');
    const unit=p.unit||'adet',rows=[...s.purchases.filter(x=>x.kind===kind&&x.itemId===id).map(x=>({date:x.date,label:'Alış / giriş',qty:x.qty,reason:x.invoiceNumber||'Alış kaydı'})),...(s.stockAdjustments||[]).filter(x=>x.kind===kind&&x.itemId===id).map(x=>({date:x.date,label:x.type==='waste'?'Fire':'Sayım farkı',qty:x.deltaQty,reason:x.reason})),...s.sales.flatMap(x=>(x.deductions||[]).filter(d=>d.kind===kind&&d.id===id).flatMap(d=>[{date:x.date,label:'Satış',qty:-d.qty,reason:'Kayıtlı satış hareketi'},...(x.status==='cancelled'?[{date:x.cancelledAt||x.date,label:'Satış iptali',qty:d.qty,reason:'İlgili satışın stok dönüşü'}]:[])])),...(s.saleReturns||[]).flatMap(x=>(x.deductions||[]).filter(d=>d.kind===kind&&d.id===id).map(d=>({date:x.date,label:'Ürün iadesi',qty:d.qty,reason:x.reason})))].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    modal('Stok ayrıntısı · '+p.name,`<section class="account-details"><div class="account-key"><span>Mevcut miktar</span><strong>${p.stock} ${escape(unit)}</strong></div><div class="account-key"><span>Ana depo</span><strong>${warehouseBalance(s,kind,id)} ${escape(unit)}</strong></div><div class="account-key"><span>Ortalama birim maliyet</span><strong>${money(p.costCents)} / ${escape(unit)}</strong></div></section><div class="operation-links">${action('Alış / giriş','receive','','full')}${action('Sayım / çıkış','count',`data-kind="${kind}" data-id="${id}"`,'full')}${action('Fire','waste',`data-kind="${kind}" data-id="${id}"`,'full')}${action('Depolar / transfer','warehouses','','full')}</div><h3>Son 100 stok hareketi</h3>${rows.slice(0,100).map(r=>`<article class="line"><strong>${escape(r.label)} · ${r.qty>0?'+':''}${r.qty} ${escape(unit)}</strong><p>${stamp(r.date)} · ${escape(r.reason)}</p></article>`).join('')||'<p>Henüz hareket yok.</p>'}<p class="account-info">Hareketler mevcut kayıtlardan okunur. Yeni alış, geçmiş satış fiyatını veya maliyetini değiştirmez. Depolar arası sevk ve teslim kayıtları Depolar / transfer bölümündedir.</p>`);
  }
  function reviewCommand(value,key) {
    const s=state(),next=command(s,value),rows=[];
    let details='';
    if(key==='sale-return'){
      const result=buildSaleReturn(s,value,new Date().toISOString());
      details=`<h3>İade tutarı: ${money(result.totalCents)}</h3><p>${escape(value.reason)}</p><div class="checkout-summary">${result.lines.map(l=>`<div><span>${escape(s.products.find(p=>p.id===l.productId).name)} × ${l.qty}</span><strong>${money(l.totalCents)}</strong></div>`).join('')}${result.payments.map(x=>`<div><span>${methods[x.method]}</span><strong>${money(x.amountCents)}</strong></div>`).join('')}</div><p class="account-info">${result.restock?'Stok dönüşü seçildi. Aşağıdaki miktarlar mevcut kayıtlara göre geri eklenir.':'Stok dönüşü seçilmedi. Hazırlanmış gıda veya kullanılamayan ürün stoğa eklenmez.'} Gerçek banka/kart iadesi ayrıca tamamlanır.</p>`;
    }
    for(const kind of ['products','materials'])for(const before of s[kind]){const after=next[kind].find(x=>x.id===before.id);if(after&&after.stock!==before.stock)rows.push(`<div class="account-key"><span>${escape(before.name)}</span><strong>${before.stock} → ${after.stock} ${escape(before.unit||'adet')}</strong></div>`);}
    pendingReview={value:structuredClone(value),key,scope:s.businessId,module:s.module,revision:s.revision};
    modal(key==='sale-return'?'İade özeti':'Stok hareketi özeti',details+`<section class="account-details">${rows.join('')||'<p>Stok miktarı değişmiyor.</p>'}</section><p class="account-info">Önceki finansal kayıtlar korunur. Kayıt son kez sunucuda doğrulanır; durum değişmişse işlem reddedilir.</p><footer class="checkout-controls">${action('Vazgeç','review-cancel')}${action('İşlemi onayla','review-confirm','','primary')}</footer>`);
  }
  function receive() {
    const s=state();
    modal('Mal Kabul / Alış',form('receive',select('Stok kalemi','item',itemOptions())+qtyInput('Alınan miktar')+select('Alış birimi','unit',[['adet','Adet'],['kasa','Kasa'],['koli','Koli'],['paket','Paket'],['gram','Gram'],['kg','Kilogram'],['ml','Mililitre'],['lt','Litre']])+amountInput('Seçilen alış biriminin fiyatı (TL)','unitPrice')+field('Kasa / koli / paket içindeki adet (diğer birimlerde boş bırak)','packSize','number','','min="1" step="1"')+
      select('Teslim alınan depo','warehouseId',warehouseOptions())+select('Tedarikçi','supplierId',[['','Tedarikçi seçilmedi'],...(s.suppliers||[]).map(x=>[x.id,x.name])])+field('Belge / fatura numarası','invoiceNumber','text','','maxlength="80"')+
      field('Ödeme vadesi','dueDate','date',dateKey(new Date()))+field('Parti numarası','lotNumber','text','','maxlength="80"')+field('Son kullanma tarihi','expiryDate','date'),'Mal Kabulü Kaydet')+
      '<p class="note">Birim fiyatı seçtiğin alış birimine aittir. Örneğin 1 kg için 79,90 TL gir. Koli için stok kaleminin koli içeriğini tanımla. Bu kayıt e-Fatura oluşturmaz.</p>');
  }
  function count(kind,id,waste=false) {
    const s=state(),p=s[kind].find(x=>x.id===id);if(!p)throw Error('Stok kalemi bulunamadı.');
    const available=warehouseBalance(s,kind,id);
    modal((waste?'Fire':'Sayım')+' · '+p.name,form(waste?'waste':'count',hidden('kind',kind)+hidden('id',id)+hidden('expectedStock',available)+
      `<p>Ana depodaki kayıtlı stok: <strong>${available} ${escape(p.unit||'adet')}</strong></p>`+(waste?qtyInput('Fire miktarı'):field('Sayılan miktar','countedQty','number',available,'required min="0" step="0.001"'))+(p.trackLots?select('Fark uygulanacak parti','lotPurchaseId',availableLots(s,kind,id).map(l=>[l.id,l.lotNumber+' · '+l.remainingQty+' · SKT '+l.expiryDate])):'')+reason(),waste?'Fireyi Kaydet':'Sayım Farkını Kaydet')+'<p class="note">Bu form açıkken stok değişirse kayıt reddedilir. Yeniden sayım kontrolü gerekir.</p>');
  }
  function stockSettings(kind,id) {
    const p=state()[kind].find(x=>x.id===id);
    modal('Stok Uyarısı · '+p.name,form('stock-settings',hidden('kind',kind)+hidden('id',id)+field('Kritik stok miktarı','reorderLevel','number',p.reorderLevel??0,'required min="0" step="0.001"')+
      qtyInput('Koli içindeki adet','packSize',p.packSize||1)+`<label class="check"><input name="trackLots" type="checkbox" ${p.trackLots?'checked':''}>Parti ve son kullanma tarihi takibi</label><p class="note">Parti takibi stok sıfırken açılır veya kapanır. Açıkken her mal kabulde parti ve SKT gerekir.</p>`,'Stok Ayarını Kaydet'));
  }
  function warehouses() {
    const s=state();
    modal('Depolar ve Transfer',form('warehouse',field('Yeni depo adı','name','text','','required maxlength="80"'),'Depo Ekle')+'<hr>'+form('transfer-send',
      select('Çıkış deposu','fromWarehouseId',warehouseOptions())+select('Varış deposu','toWarehouseId',warehouseOptions())+select('Stok kalemi','item',itemOptions())+qtyInput('Sevk miktarı')+reason(),'Sevki Kaydet')+
      '<p class="note">Yoldaki stok toplamda korunur. Teslim alınana kadar varış deposunda satılamaz.</p>'+(s.transfers||[]).slice(-50).reverse().map(t=>`<div class="line"><strong>${t.status==='in_transit'?'Yolda':'Teslim alındı'}</strong><p>${stamp(t.date)} · ${escape(warehouseOptions().find(x=>x[0]===t.fromWarehouseId)?.[1])} → ${escape(warehouseOptions().find(x=>x[0]===t.toWarehouseId)?.[1])}</p>${t.status==='in_transit'?action('Teslim Al','transfer-receive',`data-id="${t.id}"`):''}</div>`).join(''));
  }
  function suppliers() {
    const s=state();
    modal('Tedarikçiler',form('supplier',field('Tedarikçi adı','name','text','','required maxlength="100"')+field('Telefon','phone','tel','','maxlength="40"'),'Tedarikçi Ekle')+
      (s.suppliers||[]).map(x=>`<div class="line"><strong>${escape(x.name)}</strong><p>Açık borç: ${money(supplierBalance(s,x.id))}</p>${action('Borç / Fatura Kaydı','supplier-bill',`data-id="${x.id}"`)} ${action('Ödeme Kaydet','supplier-pay',`data-id="${x.id}"`)}</div>`).join(''));
  }
  function restaurant() {
    const s=state(); if(s.module==='market')throw Error('Restoran veya Kafe panelini aç.');
    modal('Masalar ve Mutfak',`<div class="operation-links">${action('Mutfak / Bar Ekranı','kitchen','','full')}${action('QR Menü ve Sipariş','qr','','full')}</div>`+
      form('table',field('Masa adı','name','text','','required maxlength="60"')+field('Alan','area','text','Salon','required maxlength="60"')+field('Kişi sayısı','seats','number',4,'required min="1" max="100" step="1"'),'Masa Ekle')+
      '<h3>Masalar</h3><div class="business-tables">'+(s.tables||[]).map(t=>`<section class="card"><strong>${escape(t.name)}</strong><p>${escape(t.area)} · ${t.seats} kişi · ${s.orders.filter(o=>o.tableId===t.id).length} açık adisyon</p></section>`).join('')+'</div><h3>Açık adisyonlar</h3>'+
      s.orders.map(o=>`<div class="line"><strong>${escape(o.label)}</strong><p>${o.lines.length} ürün · ${o.status==='sent'?'Mutfağa gönderildi':'Taslak'}</p>${button('Sepete Aç','load-order',`data-id="${o.id}"`)} ${o.status!=='sent'?action('Mutfağa Gönder','order-send',`data-id="${o.id}"`):''} ${action('Masa Değiştir','order-move',`data-id="${o.id}"`)} ${o.status!=='sent'?action('Böl / Birleştir','order-tools',`data-id="${o.id}"`):''} ${action('İptal Et','order-cancel',`data-id="${o.id}"`)}</div>`).join(''));
  }
  function kitchen() {
    const labels={pending:'Sırada',preparing:'Hazırlanıyor',ready:'Hazır',served:'Servis edildi',cancelled:'İptal'},next={pending:['preparing','Hazırlamaya Başla'],preparing:['ready','Hazır'],ready:['served','Servis Edildi']};
    const tickets=(state().kitchenTickets||[]).filter(x=>!['served','cancelled'].includes(x.status));
    modal('Mutfak / Bar',action('Güncel Kayıtları Al','refresh-kitchen','','full')+'<div class="business-kitchen-grid">'+(tickets.map(t=>`<section class="card"><h3>${escape(t.label)} · ${t.station==='bar'?'Bar':'Mutfak'}</h3><p>${labels[t.status]} · ${stamp(t.createdAt)}</p>${t.lines.map(l=>`<p>${escape(l.name)} × ${l.qty}</p>`).join('')}${next[t.status]?action(next[t.status][1],'kitchen-status',`data-id="${t.id}" data-status="${next[t.status][0]}"`,'primary full'):''}</section>`).join('')||'<p>Bekleyen mutfak işi yok.</p>')+'</div>');
  }
  function finance() {
    const s=state(),totals=financialTotals(s),aging=receivablesAging(s);
    modal('Cari, Finans ve Raporlar',`<div class="stats"><section class="stat"><span>Satış geliri − ürün iadeleri</span><strong>${money(totals.revenueCents)}</strong></section><section class="stat"><span>Brüt kâr</span><strong>${money(totals.grossProfitCents)}</strong></section><section class="stat"><span>Kaydedilen giderler sonrası sonuç</span><strong>${money(totals.operatingResultCents)}</strong></section></div><p>Kaydedilen giderler: ${money(totals.expenseCents)} · Sayım/fire değer farkı: ${money(totals.stockVarianceCents)}</p><p class="note">Kaydedilmiş giderler ve stok değer farkı hesaba katılır. Eksik kira, ücret, vergi veya diğer giderler varsa bu sonuç net işletme kârı değildir. Satış ve tahsilat iki ayrı gelir sayılmaz.</p>
      <div class="operation-links">${action('Gider Ekle','expense','','full')}${action('Banka Hareketleri ve Eşleştirme','bank','','full')}${action('Excel Uyumlu Rapor İndir','export-finance','','full')}${action('Yazdır / PDF Olarak Kaydet','print-finance','','full')}</div>
      <h3>Cari vade ve risk</h3>${aging.map(c=>`<div class="line"><strong>${escape(c.name)} · ${money(c.balanceCents)}</strong><p>Vadesi gelmemiş: ${money(c.notDueCents)} · 1–30 gün: ${money(c.days1to30Cents)} · 31–60 gün: ${money(c.days31to60Cents)} · 61–90 gün: ${money(c.days61to90Cents)} · 90 gün üzeri: ${money(c.days91plusCents)}</p>${action('Vade ve Limit','customer-terms',`data-id="${c.customerId}"`)} ${action('Ekstre','statement',`data-id="${c.customerId}"`)}</div>`).join('')}`);
  }
  function bank() {
    const s=state(),matched=new Map((s.bankMatches||[]).filter(x=>x.status==='matched').map(x=>[x.bankId,x]));
    modal('Banka Hareketleri ve Eşleştirme',form('bank-import',field('Banka hesabı adı','account','text','','required maxlength="80"')+field('CSV dosyası','file','file','','required accept=".csv,text/csv"'),'Hareketleri İçe Aktar')+
      '<p class="note">Şablon sütunları: Kimlik;Tarih;Tutar;Açıklama. Tarih YYYY-AA-GG biçiminde olmalı. Tutar TL’dir. Para çıkışı negatif girilir. Bu işlem bankaya bağlanmaz veya para aktarmaz.</p>'+action('Boş CSV Şablonu İndir','bank-template','','full')+
      (s.bankTransactions||[]).slice(-100).reverse().map(b=>`<div class="line"><strong>${escape(b.account)} · ${money(b.amountCents)}</strong><p>${stamp(b.date)} · ${escape(b.description)}</p>${matched.has(b.id)?action('Eşleştirmeyi Kaldır','bank-unmatch',`data-id="${matched.get(b.id).id}"`):action('Kayıtlarla Eşleştir','bank-match',`data-id="${b.id}"`)}</div>`).join(''));
  }
  function saleReturn(saleId) {
    const s=state(),sale=s.sales.find(x=>x.id===saleId);if(!sale||sale.status!=='completed')throw Error('Tamamlanmış satış bulunamadı.');
    modal('Ürün Bazlı İade',form('sale-return',hidden('saleId',saleId)+sale.lines.map(l=>{
      const returned=(s.saleReturns||[]).filter(r=>r.saleId===saleId).flatMap(r=>r.lines).filter(x=>x.productId===l.productId).reduce((n,x)=>n+x.qty,0);
      return field(escape(l.name)+' · Kalan '+Math.max(0,l.qty-returned),'return_'+l.productId,'number',0,`min="0" max="${l.qty-returned}" step="0.001"`);
    }).join('')+`<label class="check"><input type="checkbox" name="restock" ${s.module==='market'?'checked':''}>İade edilen ürün kullanılabilir. Stoka geri ekle.</label>`+reason()+action('İade Tutarını Hesapla','return-quote','','full')+'<p data-return-total role="status"></p>'+paymentFields(),'İade Kaydını Onayla')+'<p class="note">Banka veya kart sağlayıcısına otomatik iade gönderilmez. Gerçek ödemeyi ayrıca tamamla. Hazırlanmış gıdayı stoka geri ekleme.</p>');
  }
  async function saveFile(text,name,type='text/csv;charset=utf-8') {
    const cap=window.Capacitor;
    if(cap?.isNativePlatform?.()&&cap.nativePromise){const file=await cap.nativePromise('Filesystem','writeFile',{path:name,directory:'CACHE',data:text,encoding:'utf8'});await cap.nativePromise('Share','share',{title:'AESD Rapor',files:[file.uri],dialogTitle:'Raporu kaydet veya paylaş'});return;}
    const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function reportRows() {const s=state();return s.sales.map(x=>[x.id,stamp(x.date),x.status,x.totalCents/100,x.costCents/100,paymentAmount(x,'cash')/100,paymentAmount(x,'card')/100,paymentAmount(x,'credit')/100,paymentAmount(x,'other')/100]);}
  async function qr() {
    const result=await api('/channels/'+getSector());
    modal('QR Menü ve Sipariş',`<p>QR menü ve sipariş ayrı seçeneklerdir. Sipariş kaydı ödeme sayılmaz.</p>${form('qr-create',field('Bağlantı adı / masa','label','text','','required maxlength="60"')+'<label class="check"><input name="ordering" type="checkbox">Bu bağlantıdan sipariş alınabilsin.</label>','QR Bağlantısı Oluştur')}
      ${result.channels.map(c=>`<div class="line"><strong>${escape(c.label)}</strong><p>${c.ordering?'Sipariş açık':'Yalnız menü'} · ${c.active?'Aktif':'Kapalı'}</p>${c.active?action('Bağlantıyı Kapat','qr-disable',`data-id="${c.id}"`):''}</div>`).join('')}`);
  }
  async function integrations() {
    const result=await api('/integrations/'+getSector());
    modal('Bağlantılar ve Donanım',result.providers.map(p=>`<section class="line"><strong>${escape(p.name)}</strong><p>${escape(p.message)}</p><p>Durum: ${escape(p.state)}</p></section>`).join('')+'<p class="note">Barkod klavye okuyucusu ürün aramasında kullanılabilir. ÖKC, terazi, yazıcı, e-Fatura ve sipariş sağlayıcıları seçilen model ve hesapla ayrıca doğrulanır.</p>');
  }

  async function handleAction(name,el) {
    if(!name.startsWith('business-'))return false;
    const key=name.slice(9),s=state();
    if(key==='review-cancel'){pendingReview=null;dialog.close();}
    else if(key==='review-confirm'){const pending=pendingReview;if(!pending)throw Error('İşlem özeti bulunamadı.');if(s.businessId!==pending.scope||s.module!==pending.module||s.revision!==pending.revision)throw Error('Kayıtlar değişti. İşlemi yeniden incele.');await execute(pending.value);pendingReview=null;render();if(pending.key==='sale-return')dialog.close();else inventory();}
    else if(key==='stock-detail')stockDetail(el.dataset.kind,el.dataset.id);
    else if(key==='home')home();else if(key==='register')register();else if(key==='products')products();else if(key==='product-edit')editProduct(el.dataset.id);
    else if(key==='inventory')inventory();else if(key==='receive')receive();else if(key==='count'||key==='waste')count(el.dataset.kind,el.dataset.id,key==='waste');else if(key==='stock-settings')stockSettings(el.dataset.kind,el.dataset.id);
    else if(key==='warehouses')warehouses();else if(key==='transfer-receive'){await execute({type:'transfer-receive',id:el.dataset.id});warehouses();}
    else if(key==='suppliers')suppliers();else if(key==='supplier-bill')modal('Tedarikçi Borç Kaydı',form(key,hidden('supplierId',el.dataset.id)+field('Belge / fatura numarası','invoiceNumber','text','','required maxlength="80"')+amountInput('Tutar (TL)')+field('Ödeme vadesi','dueDate','date',dateKey(new Date()),'required'),'Borcu Kaydet'));
    else if(key==='supplier-pay')modal('Tedarikçi Ödeme Kaydı',form(key,hidden('supplierId',el.dataset.id)+amountInput('Tutar (TL)')+select('Ödeme yöntemi','payment',[['cash','Nakit'],['bank','Banka']])+reason(),'Ödemeyi Kaydet'));
    else if(key==='restaurant')restaurant();else if(key==='kitchen')kitchen();else if(key==='refresh-kitchen'){await execute({type:'refresh-only'});kitchen();}
    else if(key==='order-send'){await execute({type:'order-send',id:el.dataset.id});restaurant();}else if(key==='kitchen-status'){await execute({type:'kitchen-status',id:el.dataset.id,status:el.dataset.status});kitchen();}
    else if(key==='order-move')modal('Adisyonu Taşı',form(key,hidden('id',el.dataset.id)+select('Hedef masa','tableId',(s.tables||[]).map(x=>[x.id,x.name])),'Masayı Değiştir'));
    else if(key==='order-cancel')modal('Adisyonu İptal Et',form(key,hidden('id',el.dataset.id)+reason(),'İptali Kaydet'));
    else if(key==='order-tools'){const o=s.orders.find(x=>x.id===el.dataset.id);modal('Adisyonu Böl / Birleştir',form('order-split',hidden('id',o.id)+field('Yeni adisyon adı','label','text','','required maxlength="60"')+o.lines.map(l=>field(escape(s.products.find(p=>p.id===l.productId).name)+' · Mevcut '+l.qty,'split_'+l.productId,'number',0,`min="0" max="${l.qty}" step="0.001"`)).join(''),'Seçilen Ürünleri Ayır')+form('order-merge',hidden('id',o.id)+select('Bu hesaba eklenecek adisyon','sourceId',s.orders.filter(x=>x.id!==o.id&&x.status!=='sent').map(x=>[x.id,x.label])),'Adisyonları Birleştir'));}
    else if(key==='finance')finance();else if(key==='expense')modal('İşletme Gideri',form(key,field('Gider türü','category','text','','required maxlength="60"')+amountInput('Tutar (TL)')+select('Ödeme yöntemi','payment',[['cash','Nakit'],['bank','Banka']])+reason(),'Gideri Kaydet'));
    else if(key==='customer-terms'){const c=s.customers.find(x=>x.id===el.dataset.id);modal('Cari Vade ve Risk',form(key,hidden('id',c.id)+field('Veresiye limiti (TL) · Boş bırakılırsa limitsiz','limit','number',c.creditLimitCents==null?'':(c.creditLimitCents/100).toFixed(2),'min="0" step="0.01"')+field('Standart vade (gün)','termDays','number',c.termDays||0,'required min="0" max="3650" step="1"'),'Vade ve Limiti Kaydet'));}
    else if(key==='statement'){const c=s.customers.find(x=>x.id===el.dataset.id),rows=customerStatement(s,c.id);modal('Cari Ekstre · '+c.name,action('Excel Uyumlu Ekstre İndir','export-statement',`data-id="${c.id}"`,'full')+`<div class="table-wrap"><table><tr><th>Tarih</th><th>İşlem</th><th>Borç</th><th>Alacak</th><th>Bakiye</th></tr>${rows.map(r=>`<tr><td>${stamp(r.date)}</td><td>${r.label}</td><td>${money(r.debitCents)}</td><td>${money(r.creditCents)}</td><td>${money(r.balanceCents)}</td></tr>`).join('')}</table></div>`);}
    else if(key==='export-statement')await saveFile(csvDocument(['Tarih','İşlem','Borç TL','Alacak TL','Bakiye TL'],customerStatement(s,el.dataset.id).map(r=>[stamp(r.date),r.label,r.debitCents/100,r.creditCents/100,r.balanceCents/100])),'AESD-cari-ekstre.csv');
    else if(key==='export-finance')await saveFile(csvDocument(['Kimlik','Tarih','Durum','Satış TL','Maliyet TL','Nakit TL','Kart TL','Veresiye TL','Diğer TL'],reportRows()),'AESD-satis-raporu.csv');
    else if(key==='print-finance'){const win=window.open('','_blank');if(!win)throw Error('PDF için açılır pencere izni ver.');win.document.write(`<!doctype html><html lang="tr"><meta charset="utf-8"><title>AESD Satış Raporu</title><style>body{font:12px sans-serif}td,th{padding:6px;border-bottom:1px solid #ccc}table{border-collapse:collapse;width:100%}@media print{button{display:none}}</style><h1>AESD Satış Raporu</h1><p>Bu rapor mali fiş veya e-Fatura değildir. Tutarlar TL’dir.</p><table><tr><th>Kimlik</th><th>Tarih</th><th>Durum</th><th>Tutar</th><th>Maliyet</th><th>Nakit</th><th>Kart</th><th>Veresiye</th><th>Diğer</th></tr>${reportRows().map(row=>'<tr>'+row.map(x=>'<td>'+escape(x)+'</td>').join('')+'</tr>').join('')}</table></html>`);win.document.close();win.focus();win.print();}
    else if(key==='bank')bank();else if(key==='bank-template')await saveFile(csvDocument(['Kimlik','Tarih','Tutar','Açıklama'],[]),'AESD-banka-sablonu.csv');
    else if(key==='bank-match'){const used=new Set((s.bankMatches||[]).filter(x=>x.status==='matched').flatMap(x=>x.keys));modal('Banka Hareketini Eşleştir',form(key,hidden('bankId',el.dataset.id)+bankLedgerTargets(s).filter(x=>!used.has(x.key)).map(x=>`<label class="check"><input type="checkbox" name="match_${escape(x.key)}">${escape(x.label)} · ${stamp(x.date)} · ${money(x.amountCents)}</label>`).join(''),'Eşleştirmeyi Kaydet'));}
    else if(key==='bank-unmatch')modal('Banka Eşleştirmesini Kaldır',form(key,hidden('id',el.dataset.id)+reason(),'Eşleştirmeyi Kaldır'));
    else if(key==='sale-return')saleReturn(el.dataset.id);else if(key==='return-quote')quoteReturn();
    else if(key==='qr')await qr();else if(key==='qr-disable'){await api('/channels/'+getSector()+'/'+el.dataset.id,{active:false});await qr();}else if(key==='integrations')await integrations();
    return true;
  }
  function quoteReturn() {
    const s=state(),f=dialog.querySelector('form'),data=Object.fromEntries(new FormData(f)),sale=s.sales.find(x=>x.id===data.saleId);
    let total=0;
    for(const line of sale.lines){const qty=Number(data['return_'+line.productId]||0),old=(s.saleReturns||[]).filter(r=>r.saleId===sale.id).flatMap(r=>r.lines).filter(l=>l.productId===line.productId);const before=old.reduce((n,l)=>n+l.qty,0);if(qty<0||qty+before>line.qty)throw Error('İade miktarını kontrol et.');total+=Math.round(line.totalCents*(before+qty)/line.qty)-old.reduce((n,l)=>n+l.totalCents,0);}
    let left=total;
    for(const method of Object.keys(methods)){const previous=(s.saleReturns||[]).filter(r=>r.saleId===sale.id).reduce((n,r)=>n+paymentAmount(r,method),0);const amount=Math.min(left,paymentAmount(sale,method)-previous);f.elements['paid_'+method].value=(amount/100).toFixed(2);left-=amount;}
    f.querySelector('[data-return-total]').textContent='İade tutarı: '+money(total)+'. Gerçek iade yöntemini kontrol et.';
  }
  async function handleForm(kind,data,element) {
    if(!kind.startsWith('business-'))return false;
    const key=kind.slice(9),s=state();let value;
    if(key==='register-open')value={type:key,name:data.name,openingCents:cents(data.opening)};
    else if(key==='register-close')value={type:key,shiftId:data.shiftId,countedCents:cents(data.counted),reason:data.reason};
    else if(key==='cash-move')value={type:'register-move',direction:data.direction,amountCents:cents(data.amount),reason:data.reason};
    else if(key==='product-edit'){const recipe=s.materials.filter(m=>Number(data['recipe_'+m.id])>0).map(m=>({materialId:m.id,qty:Number(data['recipe_'+m.id]),...(data['alt_'+m.id]?{alternatives:[{materialId:data['alt_'+m.id],qty:Number(data['altqty_'+m.id])}]}:{})}));value={type:'product-update',id:data.id,product:{...s.products.find(p=>p.id===data.id),name:data.name,priceCents:cents(data.price),barcode:data.barcode,category:data.category,station:data.station,recipe}};}
    else if(key==='receive'){const picked=pickItem(data.item);value={type:'receive',kind:picked.kind,itemId:picked.itemId,qty:Number(data.qty),unit:data.unit,unitPriceCents:cents(data.unitPrice),packSize:data.packSize?Number(data.packSize):undefined,warehouseId:data.warehouseId,supplierId:data.supplierId,invoiceNumber:data.invoiceNumber,dueDate:data.dueDate,lotNumber:data.lotNumber,expiryDate:data.expiryDate};}
    else if(key==='count'||key==='waste')value={type:key==='count'?'stock-count':'stock-waste',kind:data.kind,itemId:data.id,expectedStock:Number(data.expectedStock),countedQty:Number(data.countedQty),qty:Number(data.qty),reason:data.reason,lotPurchaseId:data.lotPurchaseId};
    else if(key==='stock-settings')value={type:key,kind:data.kind,itemId:data.id,reorderLevel:Number(data.reorderLevel),packSize:Number(data.packSize),trackLots:data.trackLots==='on'};
    else if(key==='warehouse')value={type:key,name:data.name};else if(key==='transfer-send'){const picked=pickItem(data.item);value={type:key,fromWarehouseId:data.fromWarehouseId,toWarehouseId:data.toWarehouseId,lines:[{kind:picked.kind,itemId:picked.itemId,qty:Number(data.qty)}],reason:data.reason};}
    else if(key==='supplier')value={type:key,name:data.name,phone:data.phone};else if(key==='supplier-bill'||key==='supplier-pay')value={type:key,supplierId:data.supplierId,invoiceNumber:data.invoiceNumber,dueDate:data.dueDate,amountCents:cents(data.amount),payment:data.payment,reason:data.reason};
    else if(key==='table')value={type:key,name:data.name,area:data.area,seats:Number(data.seats)};
    else if(['order-move','order-merge','order-cancel'].includes(key))value={type:key,id:data.id,tableId:data.tableId,sourceId:data.sourceId,reason:data.reason};
    else if(key==='order-split')value={type:key,id:data.id,label:data.label,lines:Object.keys(data).filter(k=>k.startsWith('split_')&&Number(data[k])>0).map(k=>({productId:k.slice(6),qty:Number(data[k])}))};
    else if(key==='customer-terms')value={type:key,id:data.id,creditLimitCents:data.limit===''?null:cents(data.limit),termDays:Number(data.termDays)};
    else if(key==='expense')value={type:key,category:data.category,amountCents:cents(data.amount),payment:data.payment,reason:data.reason};
    else if(key==='bank-import'){const file=element.querySelector('[name=file]').files[0];if(!file||file.size>2*1024*1024)throw Error('CSV dosyası en fazla 2 MB olabilir.');value={type:key,account:data.account,rows:parseBankCsv(await file.text())};}
    else if(key==='bank-match')value={type:key,bankId:data.bankId,keys:Object.keys(data).filter(k=>k.startsWith('match_')).map(k=>k.slice(6))};
    else if(key==='bank-unmatch')value={type:key,id:data.id,reason:data.reason};
    else if(key==='sale-return')value={type:key,id:crypto.randomUUID(),saleId:data.saleId,restock:data.restock==='on',reason:data.reason,lines:Object.keys(data).filter(k=>k.startsWith('return_')&&Number(data[k])>0).map(k=>({productId:k.slice(7),qty:Number(data[k])})),payments:paymentRows(data)};
    else if(key==='qr-create'){const result=await api('/channels/'+getSector(),{label:data.label,ordering:data.ordering==='on'});modal('QR Bağlantısı Hazır',`<img src="data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(result.svg)))}" width="240" height="240" alt="QR menü bağlantısı"><p><a href="${escape(result.url)}" target="_blank" rel="noopener">Menüyü Aç</a></p>${field('Bağlantı','url','text',result.url,'readonly')}<p class="note">Bu bağlantıyı alan kişiler menüyü görebilir. Kapatmak için QR Menü bölümünü kullan.</p>`);return true;}
    if(!value)throw Error('İşlem seçimi geçersiz.');
    if(['sale-return','receive','count','waste'].includes(key)){reviewCommand(value,key);return true;}
    await execute(value);render();
    if(key.startsWith('register')||key==='cash-move')register();else if(key==='product-edit')products();else if(['receive','count','waste','stock-settings'].includes(key))inventory();else if(key==='warehouse'||key==='transfer-send')warehouses();else if(key.startsWith('supplier'))suppliers();else if(['table','order-move','order-merge','order-cancel','order-split'].includes(key))restaurant();else if(key.startsWith('bank'))bank();else if(key==='sale-return')dialog.close();else finance();
    return true;
  }
  return {action:handleAction,form:handleForm,home};
}

export function parseBankCsv(text) {
  text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===';'||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){if(row.some(x=>x.trim()))rows.push(row);row=[];}}else cell+=c;}
  if(quoted)throw Error('CSV tırnakları kapanmamış.');row.push(cell.replace(/\r$/,''));if(row.some(x=>x.trim()))rows.push(row);
  const headers=rows.shift()?.map(x=>x.trim());if(!headers||headers.join(';')!=='Kimlik;Tarih;Tutar;Açıklama')throw Error('CSV başlığı Kimlik;Tarih;Tutar;Açıklama olmalı.');
  return rows.map((r,index)=>{if(r.length!==4||!r[0].trim()||!/^\d{4}-\d{2}-\d{2}$/.test(r[1].trim()))throw Error('CSV satırı geçersiz: '+(index+2));const value=r[2].trim(),negative=value.startsWith('-');const amount=cents(negative?value.slice(1):value);return {externalId:r[0].trim(),date:r[1].trim()+'T00:00:00.000Z',amountCents:negative?-amount:amount,description:r[3]};});
}
