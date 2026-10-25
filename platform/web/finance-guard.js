/* Money inputs, payment totals and backup record validation. */
(function(root){
 'use strict';
 const methods=['Nakit','Kart','Veresiye','Diğer'],limit=Number.MAX_SAFE_INTEGER/100;
 const signedMoney=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=limit&&Number.isFinite(root.OSESCost.round(n));
 const money=(n,positive=false)=>signedMoney(n)&&n>=0&&(!positive||root.OSESCost.round(n)>0);
 const round=n=>root.OSESCost.round(n);
 function payments(rows,total){
  if(!Array.isArray(rows)||!money(total)||!rows.length)throw Error('Ödeme bilgisi veya satış tutarı geçersiz.');
  const grouped=new Map();
  for(const row of rows){
   if(!row||!methods.includes(row.method)||!money(row.amount))throw Error('Ödeme yöntemini ve tutarını geçerli girin.');
   const cents=Math.round(round(row.amount)*100);
   grouped.set(row.method,(grouped.get(row.method)||0)+cents);
  }
  const cents=[...grouped.values()].reduce((a,b)=>a+b,0);
  if(!Number.isSafeInteger(cents)||cents!==Math.round(round(total)*100))throw Error('Ödeme toplamı satış tutarıyla eşleşmiyor.');
  const result=[...grouped].filter(([,n])=>n>0).map(([method,n])=>({method,amount:n/100}));
  return result.length?result:[{method:rows[0].method,amount:0}];
 }
 function doughUsage(items,products,stock){
  let grams=0;
  for(const item of items){
   if(!root.OSESData.quantity(item.qty,'adet',false))throw Error('Adisyondaki ürün miktarı geçersiz.');
   const original=products.find(p=>p.id===item.productId),p=original&&root.AESDPrivateWorkflow?root.AESDPrivateWorkflow.selected(original,item,stock):original;if(!p)throw Error('Silinen ürünü adisyondan çıkarın.');
   let amount;
   if(p.gramUsage!==undefined&&p.gramUsage!==null)amount=Number(p.gramUsage);
   else{
    const lines=root.OSESCost.recipe(p,stock).filter(l=>l.stockId==='s1');amount=0;
    for(const line of lines){const n=root.OSESCost.convert(Number(line.amount),line.unit??'gr','gr');if(n===null)throw Error('Ürünün hamur birimi geçersiz.');amount+=n;}
   }
   if(!root.OSESData.quantity(amount,'gr'))throw Error('Ürünün hamur miktarı geçersiz.');
   grams+=amount*item.qty;
  }
  if(!root.OSESData.quantity(grams,'gr'))throw Error('Toplam hamur miktarı geçersiz.');
  if(grams===0)return[];
  const dough=stock.find(p=>p.id==='s1');return[{stockId:'s1',stockName:dough?.name??'Çiğköfte Hamuru',amount:root.OSESData.rounded(grams),unit:'gr'}];
 }
 const legacyDoughUsage=doughUsage;
 function recipeUsage(items,products,stock){
  const totals=new Map();
  for(const item of items){
   const original=products.find(p=>p.id===item.productId),p=original&&root.AESDPrivateWorkflow?root.AESDPrivateWorkflow.selected(original,item,stock):original;if(!p)throw Error('Satış ürünü bulunamadı.');
   if(p.productKind==='ready'){
    const material=stock.find(m=>m.id===p.readyStockId&&m.unit==='adet');
    if(!material||!Number.isSafeInteger(item.qty)||item.qty<1||!root.OSESCost.calculate(p,stock).complete)throw Error('Hazır ürünün adet stoku veya alış fiyatı geçersiz.');
    add({stockId:material.id,stockName:material.name,amount:item.qty,unit:'adet'});continue;
   }
   if(p.simpleIngredients&&item.ingredientRevision!==p.simpleIngredients.revision)throw Error('İçerik değişti. Ürünü adisyona yeniden ekle.');
   if(p.recipeReviewRequired===true)throw Error('Ürünün reçetesi kontrol bekliyor. Önce reçeteyi kontrol edip kaydet.');
   if(p.recipeStock!==true){for(const row of legacyDoughUsage([item],products,stock))add(row);continue;}
   if(!root.OSESData.quantity(item.qty,'adet',false))throw Error('Paket sayısı geçersiz.');
   const lines=root.OSESCost.recipe(p,stock),seen=new Set();
   const computed=root.OSESCost.calculate(p,stock);if(!lines.length||!(p.simpleIngredients?computed.trackedComplete:computed.complete))throw Error('Reçete veya alış maliyeti eksik.');
   for(const line of lines){
    if(seen.has(line.stockId))throw Error('Reçetede aynı malzeme yinelenmiş.');seen.add(line.stockId);
    const material=stock.find(m=>m.id===line.stockId);if(!material)throw Error('Reçete malzemesi bulunamadı.');
    const amount=root.OSESCost.convert(Number(line.amount)*item.qty,line.unit,material.unit,material);
    if(amount===null||!root.OSESData.quantity(amount,material.unit,false))throw Error(material.name+' stok ve reçete birimleri uyumsuz. Marul için parça stok kartı kullanın.');
    add({stockId:material.id,stockName:material.name,amount,unit:material.unit});
   }
   if(!seen.has('s1')&&p.productKind!=='prepared')throw Error('Paket reçetesinde net hamur miktarı gerekli.');
  }
  function add(row){const prior=totals.get(row.stockId);const amount=root.OSESData.rounded((prior?.amount||0)+row.amount);if(!root.OSESData.quantity(amount,row.unit,false))throw Error('Toplam stok tüketimi geçersiz.');totals.set(row.stockId,{...row,amount});}
  return [...totals.values()];
 }
 function product(input,stock){
  if(!input||typeof input.name!=='string'||!input.name.trim())throw Error('Ürün adı gerekli.');
  const price=Number(input.price),cost=Number(input.cost),grams=Number(input.gramUsage??0);
  if(!money(price))throw Error('Ürün fiyatı geçersiz veya çok büyük.');
  if(input.costMode==='recipe'){
   const lines=root.OSESCost.recipe(input,stock);if(lines.some(l=>l.invalid))throw Error('Önce Ürün Maliyeti sekmesinde reçeteyi düzeltin.');
   let usage=0;for(const l of lines.filter(l=>l.stockId==='s1')){const n=root.OSESCost.convert(Number(l.amount),l.unit??'gr','gr');if(n===null||!root.OSESData.quantity(n,'gr'))throw Error('Reçetenin hamur miktarı geçersiz.');usage+=n;}
   if(!root.OSESData.quantity(usage,'gr'))throw Error('Reçetenin hamur toplamı geçersiz.');
   const c=root.OSESCost.calculate(input,stock);return{...input,name:input.name.trim(),price:round(price),gramUsage:usage,cost:c.cost};
  }
  if(!money(cost)||!root.OSESData.quantity(grams,'gr'))throw Error('Maliyet veya hamur miktarı geçersiz.');
  return{...input,name:input.name.trim(),price:round(price),cost:round(cost),gramUsage:grams};
 }
 function validateEstimate(s){if(s.estimatedCost!==undefined&&s.estimatedCost!==null&&!money(s.estimatedCost))throw Error('Yedekte tahmini maliyet geçersiz.');if(s.estimatedCostExcluded!==undefined&&(!Array.isArray(s.estimatedCostExcluded)||s.estimatedCostExcluded.length>100||s.estimatedCostExcluded.some(name=>typeof name!=='string'||!name||name.length>100)))throw Error('Yedekte maliyet kapsamı geçersiz.');}
 function backup(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Yedek biçimi geçersiz.');
  if(Array.isArray(data.sales))for(const sale of data.sales)if(sale&&typeof sale==='object')validateEstimate(sale);
  const copy=JSON.parse(JSON.stringify(data));
  const collections=['products','customers','stock','sales','orders','staff','registerSessions','cashMoves','stockMoves'];
  for(const key of collections){
   if(copy[key]===undefined&&['staff','registerSessions','cashMoves','stockMoves'].includes(key))continue;
   if(!Array.isArray(copy[key]))throw Error('Yedek listesi geçersiz: '+key);
   const ids=new Set();for(const row of copy[key]){if(!row||typeof row.id!=='string'||!row.id.trim()||ids.has(row.id))throw Error('Yedekte eksik veya yinelenen kayıt kimliği var: '+key);ids.add(row.id);}
  }
  function numeric(value,fallback,signed=false){
   if(value===undefined){if(typeof fallback==='number'&&!Number.isFinite(fallback))throw Error('Yedekte gerekli sayı eksik.');return fallback;}
   if(!['number','string'].includes(typeof value)||String(value).trim()==='')throw Error('Yedekte sayı biçimi geçersiz.');
   const n=Number(value);if(!(signed?signedMoney(n):money(n)))throw Error('Yedekte tutar geçersiz.');return round(n);
  }
  function quantity(value,unit,fallback){if(value===undefined){if(typeof fallback==='number'&&!Number.isFinite(fallback))throw Error('Yedekte gerekli sayı eksik.');return fallback;}if(!['number','string'].includes(typeof value)||String(value).trim()==='')throw Error('Yedekte miktar biçimi geçersiz.');const n=Number(value);if(!root.OSESData.quantity(n,unit))throw Error('Yedekte miktar geçersiz.');return n;}
  function recipe(lines){if(lines===undefined||lines===null)return lines;if(!Array.isArray(lines)||lines.some(l=>!l||typeof l.stockId!=='string'||!root.OSESData.quantity(Number(l.amount),'gr',false)))throw Error('Yedekte reçete geçersiz.');return lines.map(l=>({...l,amount:Number(l.amount)}));}
  function items(rows){if(rows===undefined)return[];if(!Array.isArray(rows))throw Error('Yedekte ürün satırları geçersiz.');return rows.map(r=>{if(!r||typeof r.productId!=='string'||!root.OSESData.quantity(Number(r.qty),'adet',false))throw Error('Yedekte ürün miktarı geçersiz.');return{...r,qty:Number(r.qty),price:numeric(r.price,0)};});}
  copy.products=copy.products.map(p=>{if(typeof p.name!=='string'||!p.name.trim())throw Error('Yedekte ürün adı geçersiz.');return{...p,price:numeric(p.price,NaN),cost:p.cost===null?null:numeric(p.cost,null),gramUsage:quantity(p.gramUsage,'gr',undefined),recipe:recipe(p.recipe),costRecipe:recipe(p.costRecipe),costExtra:numeric(p.costExtra,0)};});
  for(const p of copy.products){if(p.productKind!==undefined&&!['ready','prepared'].includes(p.productKind))throw Error('Ürün türü geçersiz.');if(p.productKind==='ready'&&(typeof p.readyStockId!=='string'||!money(p.readyInitialCost)||p.gramUsage!==0||p.recipeStock!==true||p.recipeReviewRequired===true))throw Error('Hazır ürün stok bağlantısı geçersiz.');if(p.netGrams!==undefined&&!root.OSESData.quantity(p.netGrams,'gr')||p.recipeReviewRequired!==undefined&&typeof p.recipeReviewRequired!=='boolean')throw Error('Ürün gramajı veya reçete kontrol durumu geçersiz.');}
  copy.stock=copy.stock.map(p=>{if(typeof p.name!=='string'||!p.name.trim()||!['gr','ml','lt','adet','parca'].includes(p.unit))throw Error('Yedekte stok ürünü geçersiz.');if(p.id==='s1'&&p.unit!=='gr')throw Error('Yedekte çiğköfte hamuru gr birimiyle kayıtlı olmalı.');return{...p,gram:quantity(p.gram,p.unit,NaN),critical:quantity(p.critical,p.unit,0),...(p.packageLitres===undefined?{}:{packageLitres:quantity(p.packageLitres,'lt',0)})};});
  copy.customers=copy.customers.map(c=>{if(typeof c.name!=='string'||!c.name.trim()||(c.txns!==undefined&&!Array.isArray(c.txns)))throw Error('Yedekte müşteri kaydı geçersiz.');const ids=new Set();const txns=(c.txns??[]).map(t=>{if(!t||typeof t.id!=='string'||ids.has(t.id)||!['borc','alacak','tahsilat','odeme','iptal','duzeltme'].includes(t.type))throw Error('Yedekte cari hareket geçersiz.');ids.add(t.id);return{...t,amount:numeric(t.amount,NaN)};});return{...c,phone:typeof c.phone==='string'?c.phone:'',alacak:numeric(c.alacak,0),borc:numeric(c.borc,0),txns};});
  copy.sales=copy.sales.map(s=>{const total=numeric(s.total,NaN);if(!money(total))throw Error('Yedekte satış tutarı geçersiz.');const paid=payments((s.payments??[{method:s.method??'Diğer',amount:total}]).map(p=>({...p,amount:numeric(p?.amount,NaN)})),total);if(s.stockUsage!==undefined&&!Array.isArray(s.stockUsage))throw Error('Yedekte satış stok kaydı geçersiz.');const usage=s.stockUsage?.map(u=>{if(!u||typeof u.stockId!=='string'||!['gr','kg','ml','lt','adet','parca'].includes(u.unit??'gr'))throw Error('Yedekte satış stok birimi geçersiz.');return{...u,amount:quantity(u.amount,u.unit??'gr',NaN)};});if(s.stockUsageRecorded!==undefined&&typeof s.stockUsageRecorded!=='boolean')throw Error('Yedekte stok kayıt işareti geçersiz.');const cost=s.cost===undefined||s.cost===null?null:numeric(s.cost,NaN);return{...s,total,subtotal:numeric(s.subtotal,total),discount:numeric(s.discount,0),items:items(s.items),payments:paid,stockUsage:usage,cost,costComplete:cost!==null,grossProfit:cost===null?null:round(total-cost),grossMargin:cost===null?null:root.OSESCost.margin(total-cost,total)};});
  copy.orders=copy.orders.map(o=>({...o,items:items(o.items),discount:numeric(o.discount,0)}));
  if(copy.registerSessions)copy.registerSessions=copy.registerSessions.map(r=>{if(typeof r.name!=='string'||!['open','closed'].includes(r.status))throw Error('Yedekte kasa kaydı geçersiz.');return{...r,openingBalance:numeric(r.openingBalance,0,true),...(r.closingBalance===undefined?{}:{closingBalance:numeric(r.closingBalance,0,true)})};});
  if(copy.cashMoves)copy.cashMoves=copy.cashMoves.map(m=>{if(!['entry','exit','sale','refund'].includes(m.kind))throw Error('Yedekte kasa hareketi geçersiz.');return{...m,amount:numeric(m.amount,NaN)};});
  if(copy.stockMoves)copy.stockMoves=copy.stockMoves.map(m=>{const fields={};for(const key of ['start','gram','end'])if(m[key]!==undefined){const n=Number(m[key]);if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER/1e6)throw Error('Yedekte stok hareketi geçersiz.');fields[key]=n;}return{...m,...fields};});
  if(copy.deletedStockIds!==undefined&&(!Array.isArray(copy.deletedStockIds)||copy.deletedStockIds.some(id=>typeof id!=='string')))throw Error('Yedekte silinen stok listesi geçersiz.');
  if(copy.staff?.some(s=>typeof s.name!=='string'||!['Yönetici','Kasiyer','Usta','Kurye','Garson'].includes(s.role)))throw Error('Yedekte personel kaydı geçersiz.');
  if(copy.settings?.debtPermission!==undefined&&typeof copy.settings.debtPermission!=='boolean')throw Error('Yedekte borç yetkisi geçersiz.');
  if(copy.products.some(p=>!money(p.price))||copy.stock.some(p=>!root.OSESData.quantity(p.gram,p.unit)))throw Error('Yedekte gerekli tutar veya miktar eksik.');
  return copy;
 }
 root.OSESFinance={signedMoney,money,round,payments,doughUsage:recipeUsage,product,backup};
 if(typeof module==='object'&&module.exports)module.exports=root.OSESFinance;
})(typeof window==='object'?window:globalThis);
