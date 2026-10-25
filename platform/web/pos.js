import {dateKey} from './business-calendar.js';
export {dateKey} from './business-calendar.js';
import {allocateLots} from './lot-rules.js';
import {assertOrderCheckout,closePaidOrder} from './restaurant-commands.js';
import {selectedRecipe,warehouseBalance,warehouseExists} from './inventory-rules.js';
import {normalizePayments,paymentAmount} from './payment-rules.js';
import {applyBusinessCommand} from './business-commands.js';
import {validateState} from './backup-validation.js';
export {validateState};
export const cents=value=>{const text=String(value??'').trim();if(!/^\d+(?:[.,]\d{1,2})?$/.test(text))throw Error('Tutar sıfır veya pozitif olmalı ve en fazla 2 ondalık içermeli.');const [whole,fraction='']=text.replace(',','.').split('.'),minor=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));if(minor>10000000000n)throw Error('Tutar geçersiz.');return Number(minor);};
const id=()=>crypto.randomUUID();
const quantity=n=>{n=Number(n);if(!Number.isFinite(n)||n<=0||n>1e6||Math.abs(n*1000-Math.round(n*1000))>1e-5)throw Error('Miktar pozitif olmalı ve en fazla 3 ondalık içermeli.');return n;};
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const money=n=>{if(!integer(n)||n>1e12)throw Error('Tutar geçersiz.');return n;};
export function emptyState(businessId,module){return{schema:2,businessId,module,revision:0,products:[],materials:[],sales:[],customers:[],purchases:[],collections:[],refunds:[],orders:[]};}
export function command(state,action,now=new Date().toISOString()){
 const s=structuredClone(state);s.refunds??=[];if(['sale','sale-return','collect','refund'].includes(action.type)&&s.shifts?.length&&!s.shifts.some(x=>x.status==='open'))throw Error('Önce kasayı aç.');const find=(kind,key)=>s[kind].find(x=>x.id===key)||(()=>{throw Error('Kayıt bulunamadı.');})();
 if(action.type==='product'){
  const p=action.product;if(!p?.name?.trim())throw Error('Ürün adı gerekli.');money(p.priceCents);money(p.costCents??0);if(s.products.some(x=>p.barcode&&x.barcode===p.barcode))throw Error('Bu barkod başka üründe var.');
  const recipe=p.recipe||[];const seen=new Set();for(const r of recipe){find('materials',r.materialId);quantity(r.qty);if(seen.has(r.materialId))throw Error('Malzeme reçetede yinelenmiş.');seen.add(r.materialId);}
  s.products.push({id:id(),name:p.name.trim().slice(0,100),barcode:String(p.barcode||'').trim().slice(0,80),category:String(p.category||'Genel').trim().slice(0,40)||'Genel',photo:p.photo||'',priceCents:p.priceCents,costCents:p.costCents??0,stock:0,recipe:s.module==='market'?[]:recipe});
 }else if(action.type==='material'){if(!action.name?.trim())throw Error('Malzeme adı gerekli.');s.materials.push({id:id(),name:action.name.trim().slice(0,100),stock:0,costCents:0,unit:String(action.unit||'adet').slice(0,15)});
 }else if(action.type==='purchase'){
  if(!['products','materials'].includes(action.kind)||s.module==='market'&&action.kind!=='products')throw Error('Stok türü geçersiz.');const p=find(action.kind,action.itemId),qty=quantity(action.qty),cost=money(action.costCents);if(p.trackLots)throw Error('Parti takibi açık. Mal Kabul ekranında parti ve SKT bilgisi gir.');
  const stock=Math.round((p.stock+qty)*1000)/1000;p.rawCostCents=((p.stock*(p.rawCostCents??p.costCents))+qty*cost)/stock;p.costCents=Math.round(p.rawCostCents);p.stock=stock;s.purchases.push({id:id(),date:now,kind:action.kind,itemId:p.id,qty,costCents:cost});
 }else if(action.type==='customer'){if(!action.name?.trim())throw Error('Cari adı gerekli.');s.customers.push({id:id(),name:action.name.trim().slice(0,100),balanceCents:0});
 }else if(action.type==='collect'){if(action.payment&&!['cash','card','other'].includes(action.payment))throw Error('Tahsilat yöntemi geçersiz.');const c=find('customers',action.customerId),amount=money(action.amountCents);if(!amount||amount>c.balanceCents)throw Error('Tahsilat açık borçtan fazla olamaz.');c.balanceCents-=amount;s.collections.push({id:id(),date:now,customerId:c.id,amountCents:amount,payment:action.payment||'cash',shiftId:s.shifts?.find(x=>x.status==='open')?.id||null});
 }else if(action.type==='refund'){
  const c=find('customers',action.customerId),amount=money(action.amountCents);
  if(!action.id||s.refunds.some(r=>r.id===action.id))throw Error('Bu iade daha önce kaydedildi.');
  if(!amount||amount>-c.balanceCents)throw Error('İade müşteri alacağını aşamaz.');
  if(!['cash','card','other'].includes(action.payment)||typeof action.reason!=='string'||action.reason.trim().length<3||action.reason.length>500)throw Error('İade yöntemi ve açıklaması gerekli.');
  c.balanceCents+=amount;s.refunds.push({id:action.id,date:now,customerId:c.id,amountCents:amount,payment:action.payment,reason:action.reason.trim(),shiftId:s.shifts?.find(x=>x.status==='open')?.id||null});
 }else if(action.type==='sale'){assertOrderCheckout(s,action);
  if(!action.id||s.sales.some(x=>x.id===action.id))throw Error('Bu satış daha önce kaydedildi.');if((!action.payments&&!['cash','card','credit','other'].includes(action.payment))||!action.lines?.length)throw Error('Sepet ve ödeme seçimi gerekli.');
  const seen=new Set(),deductions=new Map();let totalCents=0,costCents=0;
  const add=(kind,key,qty)=>{const k=kind+':'+key,old=deductions.get(k);deductions.set(k,{kind,id:key,qty:Math.round(((old?.qty||0)+qty)*1000)/1000});};
  const lines=action.lines.map(line=>{const p=find('products',line.productId),qty=quantity(line.qty);if(seen.has(p.id))throw Error('Sepette ürün yinelenmiş.');seen.add(p.id);let cost=p.rawCostCents??p.costCents;const recipe=selectedRecipe(p,line);
   if(s.module==='market')add('products',p.id,qty);else{if(!recipe.length)throw Error(p.name+' için malzeme reçetesi gerekli.');cost=recipe.reduce((n,r)=>{const m=find('materials',r.materialId);return n+(m.rawCostCents??m.costCents)*r.qty;},0);for(const r of recipe){const use=qty*r.qty;if(use<0.001)throw Error('Stok tüketimi 0,001 birimden küçük olamaz.');add('materials',r.materialId,use);}}
   const unitCostCents=Math.round(cost),total=Math.round(p.priceCents*qty),lc=Math.round(cost*qty);totalCents+=total;costCents+=lc;return{productId:p.id,name:p.name,qty,unitPriceCents:p.priceCents,unitCostCents,rawUnitCostCents:cost,totalCents:total,costCents:lc,...(s.module!=='market'?{recipeSnapshot:structuredClone(recipe),recipeVersion:p.recipeVersion||1}:{})};});
  const warehouseId=action.warehouseId||'main';if(!warehouseExists(s,warehouseId))throw Error('Depo bulunamadı.');money(totalCents);money(costCents);const payments=normalizePayments(action.payments||[{method:action.payment,amountCents:totalCents}],totalCents,action.payment),creditCents=payments.filter(p=>p.method==='credit').reduce((n,p)=>n+p.amountCents,0),customer=creditCents?find('customers',action.customerId):null;if(customer?.creditLimitCents!=null&&customer.balanceCents+creditCents>customer.creditLimitCents)throw Error('Cari risk limiti aşılıyor. Tahsilat yap veya ödeme yöntemini değiştir.');for(const d of deductions.values()){const p=find(d.kind,d.id);if(p.stock+1e-8<d.qty||warehouseBalance(s,d.kind,d.id,warehouseId)+1e-8<d.qty)throw Error(p.name+' stoku yetersiz.');}
  // Keep the material or product cost at sale time for a later stock return.
  for(const d of deductions.values()){const p=find(d.kind,d.id);const lots=allocateLots(s,d.kind,d.id,d.qty,warehouseId,now);if(lots)d.lots=lots;d.unitCostCents=p.costCents;d.rawUnitCostCents=p.rawCostCents??p.costCents;p.stock=Math.round((p.stock-d.qty)*1000)/1000;}
  if(customer)customer.balanceCents+=creditCents;
  s.sales.push({id:action.id,date:now,status:'completed',payment:payments.length>1?'split':payments[0].method,payments,customerId:customer?.id||null,totalCents,costCents,lines,deductions:[...deductions.values()],orderLabel:action.orderLabel||null,warehouseId,shiftId:s.shifts?.find(x=>x.status==='open')?.id||null,...(customer?{dueDate:action.dueDate||dateKey(Date.parse(now)+(customer.termDays||0)*86400000)}:{})});
  closePaidOrder(s,action,now);
 }else if(action.type==='cancel'){
  const sale=find('sales',action.id);if(sale.status!=='completed')throw Error('Satış zaten iptal edildi.');if(s.saleReturns?.some(r=>r.saleId===sale.id))throw Error('Kısmi iadesi olan satış iptal edilemez. Kalan ürünler için iade oluştur.');if(sale.shiftId&&s.shifts?.find(x=>x.id===sale.shiftId)?.status==='closed')throw Error('Kapalı kasanın satışı iptal edilemez. Yeni kasada ürün iadesi oluştur.');
  for(const d of sale.deductions){
   const p=find(d.kind,d.id),stock=Math.round((p.stock+d.qty)*1000)/1000;
   // Old market sales already have a product cost. Old recipe sales lack
   // material cost snapshots, so retain their previous return valuation.
   const returnedCost=d.unitCostCents??(d.kind==='products'?sale.lines.find(line=>line.productId===d.id)?.unitCostCents:undefined)??p.costCents;
   p.rawCostCents=(p.stock*(p.rawCostCents??p.costCents)+d.qty*(d.rawUnitCostCents??returnedCost))/stock;p.costCents=Math.round(p.rawCostCents);p.stock=stock;
  }
  if(paymentAmount(sale,'credit'))find('customers',sale.customerId).balanceCents-=paymentAmount(sale,'credit');sale.status='cancelled';sale.cancelledAt=now;
 }else if(action.type==='order'){applyBusinessCommand(s,action,now);
 }else if(!applyBusinessCommand(s,action,now))throw Error('İşlem geçersiz.');
 s.revision++;validateState(s,s.businessId,s.module);return s;
}
// Every device reports the same Turkish business day. Stored sale times stay unchanged.
export function summary(s){const days=new Map();for(const sale of s.sales){const date=dateKey(sale.date);if(!days.has(date))days.set(date,{date,netCents:0,cashCents:0,cardCents:0,creditCents:0,otherCents:0,refundCents:0,salesCount:0});const d=days.get(date);if(sale.status==='cancelled'){d.refundCents+=sale.totalCents;continue;}d.netCents+=sale.totalCents;for(const method of ['cash','card','credit','other'])d[method+'Cents']+=paymentAmount(sale,method);d.salesCount++;}for(const r of s.saleReturns||[]){const original=s.sales.find(x=>x.id===r.saleId),d=days.get(dateKey(original.date));if(!d)continue;d.netCents-=r.totalCents;d.refundCents+=r.totalCents;for(const method of ['cash','card','credit','other'])d[method+'Cents']-=paymentAmount(r,method);}return{module:s.module,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-93)};}
