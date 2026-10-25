import {normalizePayments,paymentAmount} from './payment-rules.js';
import {extraCollections,validateBusinessExtras} from './business-validation.js';
const fail=message=>{throw Error(message);};
const integer=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
const quantity=n=>Number.isFinite(n)&&n>0&&n<=1e6&&Math.abs(n*1000-Math.round(n*1000))<1e-5;
const stock=n=>Number.isFinite(n)&&n>=0&&Number.isSafeInteger(Math.round(n*1000))&&Math.abs(n*1000-Math.round(n*1000))<1e-5;
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function validateState(s,businessId,module){
 if(!s||s.schema!==2||s.businessId!==businessId||s.module!==module||!['market','restaurant','cafe'].includes(module)||!integer(s.revision))fail('Yedek bu işyeri ve panele ait değil.');
 const kinds=['products','materials','sales','customers','purchases','collections','orders',...(s.refunds===undefined?[]:['refunds']),...extraCollections.filter(k=>s[k]!==undefined)];
 const ids=new Set();
 for(const kind of kinds){
  if(!Array.isArray(s[kind])||s[kind].length>100000)fail('Yedek yapısı geçersiz.');
  for(const x of s[kind]){
   if(!x||typeof x.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(x.id)||ids.has(x.id))fail('Kayıt kimliği geçersiz veya yinelenmiş.');
   ids.add(x.id);
  }
 }
 const products=new Map(s.products.map(x=>[x.id,x])),materials=new Map(s.materials.map(x=>[x.id,x])),customers=new Map(s.customers.map(x=>[x.id,x]));
 const balances=new Map(s.customers.map(x=>[x.id,0])),stocks=new Map(),barcodes=new Set();
 for(const x of s.materials){
  if(!text(x.name,100)||!text(x.unit,15)||!stock(x.stock)||!integer(x.costCents))fail('Malzeme kaydı geçersiz.');
  stocks.set('materials:'+x.id,0);
 }
 for(const x of s.products){
  if(!text(x.name,100)||typeof x.barcode!=='string'||x.barcode.length>80||!integer(x.priceCents)||!integer(x.costCents)||!stock(x.stock)||!Array.isArray(x.recipe)||x.recipe.length>materials.size)fail('Ürün kaydı geçersiz.');
  if(x.category!==undefined&&!text(x.category,40)||x.photo!==undefined&&(typeof x.photo!=='string'||x.photo.length>120000||x.photo!==''&&!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(x.photo)))fail('Ürün kategorisi veya fotoğrafı geçersiz.');
  if(x.barcode){if(barcodes.has(x.barcode))fail('Barkod başka üründe yinelenmiş.');barcodes.add(x.barcode);}
  const seen=new Set();
  for(const r of x.recipe){if(!r||!materials.has(r.materialId)||seen.has(r.materialId)||!quantity(r.qty))fail('Reçete malzemesi eksik, yinelenmiş veya geçersiz.');seen.add(r.materialId);if(r.alternatives!==undefined){if(!Array.isArray(r.alternatives)||r.alternatives.length>materials.size)fail('Reçete alternatifleri geçersiz.');const alternatives=new Set([r.materialId]);for(const a of r.alternatives){if(!a||!materials.has(a.materialId)||alternatives.has(a.materialId)||!quantity(a.qty))fail('Reçete alternatifi eksik veya geçersiz.');alternatives.add(a.materialId);}}}
  if(module==='market'&&x.recipe.length)fail('Market reçetesi geçersiz.');
  stocks.set('products:'+x.id,0);
 }
 for(const c of s.customers)if(!text(c.name,100)||!Number.isSafeInteger(c.balanceCents)||Math.abs(c.balanceCents)>1e12)fail('Cari kaydı geçersiz.');
 for(const x of s.purchases){
  const key=x?.kind+':'+x?.itemId;
  if(!stocks.has(key)||!integer(x.costCents)||!date(x.date)||!quantity(x.qty))fail('Alış kaydı geçersiz.');
  stocks.set(key,stocks.get(key)+Math.round(x.qty*1000));
 }
 for(const sale of s.sales){
  if(!integer(sale.totalCents)||!integer(sale.costCents)||!Array.isArray(sale.lines)||!sale.lines.length||sale.lines.length>products.size||!['cash','card','credit','other','split'].includes(sale.payment)||!['completed','cancelled'].includes(sale.status)||!date(sale.date))fail('Satış kaydı geçersiz.');
  if(sale.status==='cancelled'&&!date(sale.cancelledAt))fail('İptal kaydı geçersiz.');
  normalizePayments(sale.payments||[{method:sale.payment,amountCents:sale.totalCents}],sale.totalCents,sale.payment);if(sale.payments&&sale.payment!==(sale.payments.length>1?'split':sale.payments[0].method))fail('Ödeme türü dağılımla eşleşmiyor.');if(paymentAmount(sale,'credit')&&!customers.has(sale.customerId))fail('Satışın cari kaydı eksik.');
  let total=0,cost=0;const lines=new Set(),expected=new Map();
  const add=(kind,id,qty)=>{const key=kind+':'+id;expected.set(key,Math.round(((expected.get(key)||0)/1000+qty)*1000));};
  for(const line of sale.lines){
   const p=products.get(line?.productId);
   const rawCost=line?.rawUnitCostCents??line?.unitCostCents;
   if(!p||lines.has(p.id)||!quantity(line.qty)||!text(line.name,100)||!integer(line.unitPriceCents)||!integer(line.unitCostCents)||!integer(line.totalCents)||!integer(line.costCents)||!Number.isFinite(rawCost)||rawCost<0||rawCost>1e12||Math.round(rawCost)!==line.unitCostCents||line.totalCents!==Math.round(line.qty*line.unitPriceCents)||line.costCents!==Math.round(line.qty*rawCost))fail('Satış maliyeti geçersiz.');
   lines.add(p.id);total+=line.totalCents;cost+=line.costCents;
   if(module==='market')add('products',p.id,line.qty);
   else{const recipe=line.recipeSnapshot||p.recipe;if(!recipe.length)fail('Stok reçetesi eksik.');const used=new Set();for(const r of recipe){if(!materials.has(r.materialId)||used.has(r.materialId)||!quantity(r.qty))fail('Satış reçete kaydı geçersiz.');used.add(r.materialId);}for(const r of recipe){const use=line.qty*r.qty;if(use<0.001)fail('Stok tüketimi geçersiz.');add('materials',r.materialId,use);}}
  }
  if(!integer(total)||!integer(cost)||total!==sale.totalCents||cost!==sale.costCents)fail('Satış toplamı geçersiz.');
  if(!Array.isArray(sale.deductions)||sale.deductions.length!==expected.size)fail('Stok hareketleri satışla eşleşmiyor.');
  const seen=new Set();
  for(const d of sale.deductions){
   const key=d?.kind+':'+d?.id;
   if(!d||!quantity(d.qty)||seen.has(key)||expected.get(key)!==Math.round(d.qty*1000)||d.unitCostCents!==undefined&&!integer(d.unitCostCents)||d.rawUnitCostCents!==undefined&&(!Number.isFinite(d.rawUnitCostCents)||d.rawUnitCostCents<0||d.rawUnitCostCents>1e12||Math.round(d.rawUnitCostCents)!==d.unitCostCents))fail('Stok hareketleri satışla eşleşmiyor.');
   seen.add(key);if(sale.status==='completed')stocks.set(key,stocks.get(key)-Math.round(d.qty*1000));
  }
  if(sale.status==='completed'&&paymentAmount(sale,'credit'))balances.set(sale.customerId,balances.get(sale.customerId)+paymentAmount(sale,'credit'));if(sale.dueDate!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(sale.dueDate)||!date(sale.dueDate)||new Date(sale.dueDate).toISOString().slice(0,10)!==sale.dueDate))fail('Vade tarihi geçersiz.');
 }
 for(const c of s.collections){
  if(!customers.has(c.customerId)||!integer(c.amountCents)||!c.amountCents||!date(c.date))fail('Tahsilat kaydı geçersiz.');
  balances.set(c.customerId,balances.get(c.customerId)-c.amountCents);
 }
 for(const r of s.refunds||[]){
  if(!customers.has(r.customerId)||!integer(r.amountCents)||!r.amountCents||!date(r.date)||!['cash','card','other'].includes(r.payment)||!text(r.reason,500))fail('Müşteri iadesi geçersiz.');
  balances.set(r.customerId,balances.get(r.customerId)+r.amountCents);
 }
 validateBusinessExtras(s,{stocks,balances});
 for(const c of s.customers)if(balances.get(c.id)!==c.balanceCents)fail('Cari bakiyesi kayıtlarla eşleşmiyor.');
 for(const kind of ['products','materials'])for(const x of s[kind])if(stocks.get(kind+':'+x.id)!==Math.round(x.stock*1000))fail('Stok bakiyesi kayıtlarla eşleşmiyor.');
 for(const o of s.orders){
  if(module==='market'||!text(o.label,60)||!date(o.date)||!Array.isArray(o.lines)||!o.lines.length||o.lines.length>products.size)fail('Adisyon geçersiz.');
  const seen=new Set();for(const r of o.lines){if(!r||!products.has(r.productId)||seen.has(r.productId)||!quantity(r.qty))fail('Adisyon ürünü eksik veya geçersiz.');seen.add(r.productId);}
 }
 return s;
}
