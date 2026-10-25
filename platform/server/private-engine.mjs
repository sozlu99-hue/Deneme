import fs from 'node:fs';
import vm from 'node:vm';
import {sameJson} from './json-value.mjs';
import {verifyPrivateFinance} from './private-finance.mjs';
const context=vm.createContext({structuredClone});
for(const file of ['cost-engine.js','data-integrity.js','finance-guard.js','private-workflow.js','private-menu.js','private-ledger.js'])vm.runInContext(fs.readFileSync(new URL('../web/'+file,import.meta.url),'utf8'),context);
const {OSESCost:cost,OSESFinance:finance,OSESData:data}=context;
export const menuRelease=context.AESDPrivateMenu.version;
export const privateMenu=value=>privateProjection(context.AESDPrivateMenu.apply(value));
export const canonicalPrivate=value=>JSON.stringify(context.AESDPrivateLedger.canonical(value));
export const mergeOfflinePrivate=(current,base,event,options)=>validatePrivate(context.AESDPrivateLedger.merge(current,base,event,options));
// Derive staff sale prices, costs and stock use from the current server ledger.
export function privateStaffSale(current,body,{saleId,cashier,date,deviceId,grantId}){
 if(!Array.isArray(body?.items)||!body.items.length||body.items.length>100)throw Error('Satış sepeti geçersiz.');
 const seen=new Set(),items=body.items.map(item=>{
  const p=item&&current.products.find(p=>p.id===item.productId&&p.active);
  if(!p||!Number.isSafeInteger(item.qty)||item.qty<1||item.qty>1000)throw Error('Satış ürünü veya miktarı geçersiz.');
  if(p.simpleIngredients&&item.ingredientRevision!==p.simpleIngredients.revision)throw Error('İçerik değişti. Ürünü adisyona yeniden ekle.');
  context.AESDPrivateWorkflow.selected(p,item,current.stock);
  const omitted=[...(item.omitted||[])].sort(),key=JSON.stringify([p.id,omitted]);
  if(seen.has(key))throw Error('Satış ürünü veya miktarı geçersiz.');seen.add(key);
  if(item.price!==p.price)throw Error('Ürün fiyatı değişti. Sepeti yeniden kontrol edin.');
  return{productId:p.id,name:p.name,price:p.price,qty:item.qty,...(p.simpleIngredients?{omitted,ingredientRevision:p.simpleIngredients.revision}:{})};
 });
 const total=cost.round(items.reduce((n,item)=>n+item.price*item.qty,0));
 if(!Array.isArray(body.payments)||!body.payments.length||body.payments.length>3||body.payments.some(p=>!['Nakit','Kart','Diğer'].includes(p.method)||!Number.isFinite(p.amount)||p.amount<0||cost.round(p.amount)!==p.amount)||cost.round(body.payments.reduce((n,p)=>n+p.amount,0))!==total)throw Error('Ödeme toplamı veya yöntemi geçersiz.');
 const register=current.registerSessions.find(r=>r.id===current.activeRegisterId&&r.status==='open');if(!register)throw Error('Satış için yöneticinin açık kasası gerekli.');
 const usage=finance.doughUsage(items,current.products,current.stock);if(usage.some(u=>{const p=current.stock.find(p=>p.id===u.stockId);return!p||p.gram-(p.offlineDeficit||0)<u.amount;}))throw Error('Hamur stoku yetersiz. Yöneticinin stok girişini bekleyin.');
 const sale={id:saleId,date,receiptNo:'A'+String(current.orderCounter).padStart(4,'0'),cashier,registerId:register.id,items,subtotal:total,discount:0,total,payments:body.payments.map(p=>({method:p.method,amount:p.amount})),status:'completed',stockUsageRecorded:true,stockUsage:usage,staffGrantId:grantId,...cost.sale(items,current.products,current.stock,total)};
 return mergeOfflinePrivate(current,current,{sale,orderId:null},{deviceId,syncedAt:date});
}
const keys=['version','products','customers','stock','stockMoves','staff','settings','sales','orders','orderCounter','registerSessions','activeRegisterId','cashMoves','deletedStockIds'];
export function privateProjection(value){return Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,structuredClone(value[k])]));}
export function validatePrivate(value){
 if(value?.version!==3)throw Error('Özel panel yedeğinin sürümü geçersiz.');
 const result=finance.backup(privateProjection(value));
 for(const p of result.products)if(p.productKind==='prepared'&&!p.recipeReviewRequired&&p.recipeStock!==true)throw Error('Hazırlanan ürünün malzeme stok takibi kapatılamaz.');
 for(const m of result.stock)if(m.stockKind&&(!Object.hasOwn(context.AESDPrivateWorkflow.roles,m.stockKind)||m.unit!==context.AESDPrivateWorkflow.roles[m.stockKind][1]))throw Error('Malzeme stok birimi geçersiz.');
 const materialRoles=new Map();for(const p of result.products){if(p.simpleIngredients)for(const [role,id] of Object.entries(p.simpleIngredients.materials||{})){if(materialRoles.has(id)&&materialRoles.get(id)!==role)throw Error('Stok farklı malzemelere bağlanamaz.');materialRoles.set(id,role);}if(p._selectedContent!==undefined||p._unmeasured!==undefined)throw Error('İçerik iç alanları kaydedilemez.');if(p.simpleIngredients)context.AESDPrivateWorkflow.content(p,result.stock);if(p.packageAmount!==undefined&&(!Number.isFinite(p.packageAmount)||p.packageAmount<=0||p.packageAmount>100000||!['ml','lt'].includes(p.packageUnit)))throw Error('Ambalaj hacmi geçersiz.');}
 const linked=new Set();for(const p of result.products)if(p.productKind==='ready'){if(linked.has(p.readyStockId)||!result.stock.some(m=>m.id===p.readyStockId&&m.unit==='adet'))throw Error('Hazır ürünün adet stok bağlantısı eksik veya yinelenmiş.');linked.add(p.readyStockId);}

 for(const k of ['products','customers','stock','stockMoves','staff','sales','orders','registerSessions','cashMoves'])if((result[k]?.length||0)>100000)throw Error('Özel panel kayıt sınırı aşıldı.');
 if(!Number.isSafeInteger(result.orderCounter)||result.orderCounter<1)throw Error('Fiş sayacı geçersiz.');
 for(const p of result.stock)if(p.offlineDeficit!==undefined&&(!data.quantity(p.offlineDeficit,'gr')||p.id!=='s1'&&p.offlineDeficit!==0||p.offlineDeficit>0&&p.gram!==0))throw Error('Çevrimdışı stok farkı geçersiz.');
 return privateProjection(result);
}
const equal=sameJson;
const almost=(a,b)=>Math.abs(a-b)<0.00001;
export function privateTransition(current,input){
 for(const m of current.stock){const next=input.stock.find(s=>s.id===m.id);if(next&&m.stockKind&&m.stockKind!==next.stockKind)throw Error('Kayıtlı stok türü değiştirilemez.');}
 for(const p of current.stock)if(p.offlineDeficit&&!input.stock.some(n=>n.id===p.id))throw Error('Önce hamur stok farkını kapatın.');
 for(const p of input.stock)if((p.offlineDeficit||0)!==(current.stock.find(n=>n.id===p.id)?.offlineDeficit||0))throw Error('Stok farkı alış veya iptal kaydıyla kapatılmalıdır.');
 const next=validatePrivate(context.AESDPrivateLedger.settleStock(current,input));
 for(const move of current.stockMoves)if(move.workflow&&!next.stockMoves.some(n=>n.id===move.id&&sameJson(move,n)))throw Error('Kayıtlı stok işlem geçmişi değiştirilemez.');
 const workflow=context.AESDPrivateWorkflow;
 for(const p of next.products){
  const old=current.products.find(old=>old.id===p.id);
  if(!sameJson(old?.simpleIngredients??null,p.simpleIngredients??null)&&!next.stockMoves.some(m=>m.workflow?.operation==='ingredients'&&m.workflow.productId===p.id&&!current.stockMoves.some(o=>o.id===m.id)))throw Error('İçerik bağlantısı doğrulanmış işlem gerektirir.');
  if(old?.simpleIngredients&&!p.simpleIngredients)throw Error('İçerik takibi kaldırılamaz.');
  if(old?.netGrams!==undefined&&p.netGrams===undefined)throw Error('Ürünün kayıtlı net gramajı kaldırılamaz.');
  if(old?.packageAmount!==undefined&&(old.packageAmount!==p.packageAmount||old.packageUnit!==p.packageUnit))throw Error('Kayıtlı ambalaj hacmi değiştirilemez. Ayrı ürün ekle.');
  if(old?.productKind==='ready'&&(p.productKind!=='ready'||p.readyStockId!==old.readyStockId))throw Error('Hazır ürünün stok bağlantısı değiştirilemez.');
  if(p.productKind==='ready'&&old?.productKind!=='ready'&&!next.stockMoves.some(m=>m.workflow?.operation==='ready'&&m.workflow.productId===p.id&&!current.stockMoves.some(o=>o.id===m.id)))throw Error('Hazır ürün için doğrulanmış stok işlemi gerekli.');
  if(old?.recipeReviewRequired===true&&p.recipeReviewRequired!==true&&p.simpleIngredients&&!next.stockMoves.some(m=>m.workflow?.operation==='ingredients'&&m.workflow.productId===p.id&&!current.stockMoves.some(o=>o.id===m.id)))throw Error('İçerik kontrol kaydı gerekli.');
  if(old?.recipeReviewRequired===true&&p.recipeReviewRequired!==true&&p.productKind!=='ready'&&!p.simpleIngredients){
   if(p.recipeReviewedGrams!==workflow.net(p)||!Number.isFinite(Date.parse(p.recipeReviewedAt))||!Number.isSafeInteger(p.recipeRevision)||p.recipeRevision<=(old.recipeRevision||0))throw Error('Reçete kontrol kaydı gerekli.');
   workflow.recipe({...current,products:current.products.map(row=>row.id===p.id?{...old,netGrams:workflow.net(p)}:row)}, {productId:p.id,lines:p.costRecipe,extra:p.costExtra,recipeStock:p.recipeStock,reviewed:true},p.recipeReviewedAt);
  }
  if(p.netGrams!==undefined&&!p.recipeReviewRequired&&p.costMode==='recipe'&&cost.recipe(p,next.stock).some(l=>l.stockId==='s1')){const grams=cost.recipe(p,next.stock).filter(l=>l.stockId==='s1').reduce((n,l)=>n+(cost.convert(Number(l.amount),l.unit,'gr')??NaN),0);if(!almost(grams,p.netGrams))throw Error('Ürün gramajı reçeteyle eşleşmiyor.');}
  if(!p.simpleIngredients&&p.recipeStock===true&&p.recipeReviewRequired!==true&&(!old||!sameJson(old,p)))finance.doughUsage([{productId:p.id,qty:1}],next.products,next.stock);
 }
 const freshWorkflow=next.stockMoves.filter(m=>m.workflow&&!current.stockMoves.some(old=>old.id===m.id));
 if(freshWorkflow.length){
  if(freshWorkflow.length!==1)throw Error('Stok işlemleri ayrı kaydedilmelidir.');
  const move=freshWorkflow[0],expected=validatePrivate(context.AESDPrivateLedger.settleStock(current,(move.workflow.operation==='ingredients'?workflow.ingredients:move.workflow.operation==='ready'?workflow.ready:workflow.stock)(current,move.workflow,{id:move.id,purchaseId:move.refId,date:move.date,actor:move.actor})));
  if(!sameJson(expected,next))throw Error('Stok, maliyet veya hareket özeti sunucu hesabıyla eşleşmiyor.');
 }
 const before=new Map(current.sales.map(s=>[s.id,s])),nextSales=new Map(next.sales.map(s=>[s.id,s]));
 for(const old of current.sales){const sale=nextSales.get(old.id);if(!sale)throw Error('Kayıtlı satış silinemez.');const clean=s=>{const v={...s};for(const k of ['status','cancelledAt','cancelledBy','cancelReason','grossProfit','grossMargin','costComplete'])delete v[k];return v;};if(!equal(clean(old),clean(sale)))throw Error('Geçmiş satışın tutarı veya maliyeti değiştirilemez.');if(old.status==='cancelled'&&sale.status!=='cancelled')throw Error('İptal edilen satış yeniden açılamaz.');}
 const added=next.sales.filter(s=>!before.has(s.id)),cancelled=current.sales.filter(s=>s.status!=='cancelled'&&nextSales.get(s.id)?.status==='cancelled');
 if(added.length+cancelled.length>1)throw Error('Satış ve iptal tek işlem olarak gönderilmelidir.');
 if(added.length||cancelled.length){
  const sale=added[0]||cancelled[0],returns=cancelled.length>0;
  const usage=returns?data.restorePlan(sale,current.stock,sale.stockUsageRecorded===false?finance.doughUsage(sale.items,current.products,current.stock):[]):finance.doughUsage(sale.items,current.products,current.stock);
  if(!returns){if(sale.status!=='completed'||sale.stockUsageRecorded!==true)throw Error('Yeni satış durumu geçersiz.');const subtotal=cost.round(sale.items.reduce((sum,item)=>{const p=current.products.find(p=>p.id===item.productId);if(!p||!almost(p.price,item.price))throw Error('Ürün fiyatı değişti. Sepeti yeniden kontrol edin.');return sum+item.price*item.qty;},0));if(!almost(subtotal,sale.subtotal)||sale.discount>subtotal||!almost(subtotal-sale.discount,sale.total))throw Error('Satış toplamı geçersiz.');const calculated=cost.sale(sale.items,current.products,current.stock,sale.total);if(!sameJson(calculated.estimatedCost??null,sale.estimatedCost??null)||!sameJson(calculated.estimatedCostExcluded??null,sale.estimatedCostExcluded??null))throw Error('Tahmini maliyet sunucu hesabıyla eşleşmiyor.');if(calculated.cost!==sale.cost||!equal(calculated.costDetails,sale.costDetails))throw Error('Satış maliyeti güncel reçeteyle eşleşmiyor.');if(!equal(usage,sale.stockUsage))throw Error('Satış stok hareketi kayıtlı reçeteyle eşleşmelidir.');}
  for(const p of current.stock){const n=next.stock.find(n=>n.id===p.id),u=usage.find(u=>u.stockId===p.id)?.amount||0,expected=data.rounded(p.gram-(p.offlineDeficit||0)+(returns?u:-u));if(!returns&&expected<0||!n||!almost(n.gram,Math.max(0,expected))||!almost(n.offlineDeficit||0,Math.max(0,-expected)))throw Error('Stok değişti veya stok hareketi satışla eşleşmiyor.');}
  if(next.stock.length!==current.stock.length)throw Error('Satış sırasında stok ürünü eklenemez.');
 }
 verifyPrivateFinance(current,next,added,cancelled);
 return next;
}
