/* A paid offline sale is an event. It must not replace a shared snapshot. */
(function(root){
 const clone=v=>JSON.parse(JSON.stringify(v));
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 const equal=(a,b)=>JSON.stringify(canonical(clone(a)))===JSON.stringify(canonical(clone(b)));
 const round=n=>root.OSESData.rounded(n),money=n=>root.OSESCost.round(n);
 function event(before,next){
  const added=next.sales.filter(s=>!before.sales.some(x=>x.id===s.id));
  if(added.length!==1)throw Error('Çevrimdışı kayıt yalnız yeni bir satış içermelidir.');
  const sale=clone(added[0]),removed=(before.orders||[]).filter(o=>!next.orders.some(x=>x.id===o.id));
  if(removed.length>1)throw Error('Satış tek adisyonu kapatabilir.');
  return{sale,orderId:removed[0]?.id||null};
 }
 function validate(base,input){
  if(!input?.sale||base.sales.some(s=>s.id===input.sale.id))throw Error('Satış kimliği geçersiz veya daha önce kullanılmış.');
  const sale=root.OSESFinance.backup({...base,sales:[input.sale,...base.sales]}).sales[0];
  if(typeof sale.id!=='string'||sale.id.length>100||!Number.isFinite(Date.parse(sale.date))||sale.status!=='completed'||sale.stockUsageRecorded!==true||!sale.items.length)throw Error('Çevrimdışı satış kaydı geçersiz.');
  let subtotal=0;for(const item of sale.items){const p=base.products.find(p=>p.id===item.productId);if(!p||p.price!==item.price)throw Error('Satış fiyatı doğrulanmış ürün kaydıyla eşleşmiyor.');subtotal+=item.qty*item.price;}
  subtotal=money(subtotal);if(sale.subtotal!==subtotal||sale.discount<0||sale.discount>subtotal||sale.total!==money(subtotal-sale.discount))throw Error('Satış toplamı geçersiz.');
  const cost=root.OSESCost.sale(sale.items,base.products,base.stock,sale.total),usage=root.OSESFinance.doughUsage(sale.items,base.products,base.stock);
  if(!equal(cost.estimatedCost??null,sale.estimatedCost??null)||!equal(cost.estimatedCostExcluded??null,sale.estimatedCostExcluded??null))throw Error('Tahmini maliyet doğrulanmış kayıtla eşleşmiyor.');
  if(cost.cost!==sale.cost||!equal(cost.costDetails,sale.costDetails)||!equal(usage,sale.stockUsage))throw Error('Satış maliyeti veya hamur hareketi doğrulanmış kayıtla eşleşmiyor.');
  if(usage.some(u=>(base.stock.find(p=>p.id===u.stockId)?.gram||0)<u.amount))throw Error('Doğrulanmış yerel hamur stoku yetersiz.');
  const credit=sale.payments.filter(p=>p.method==='Veresiye').reduce((n,p)=>n+p.amount,0);
  if(credit&&(!base.settings.debtPermission||!base.customers.some(c=>c.id===sale.customerId)))throw Error('Veresiye müşteri kaydı geçersiz.');
  if(!base.registerSessions.some(r=>r.id===sale.registerId&&r.status==='open'))throw Error('Satış için doğrulanmış açık kasa gerekli.');
  if(input.orderId&&!base.orders.some(o=>o.id===input.orderId))throw Error('Adisyon kaydı geçersiz.');
  delete sale.syncWarning;delete sale.syncStatus;delete sale.syncedAt;delete sale.sourceDevice;
  return sale;
 }
 function merge(current,base,input,{pending=false,deviceId='',syncedAt=null}={}){
  const sale=validate(base,input),existing=current.sales.find(s=>s.id===sale.id);
  if(existing){const clean=s=>{s=clone(s);for(const k of ['syncWarning','syncStatus','syncedAt','sourceDevice'])delete s[k];return s;};if(!equal(clean(existing),clean(sale)))throw Error('Satış kimliği farklı içerikle kullanılmış.');return current;}
  const fullRecipe=sale.items.some(i=>base.products.find(p=>p.id===i.productId)?.recipeStock===true||base.products.find(p=>p.id===i.productId)?.productKind==='ready');if(fullRecipe&&(pending||sale.stockUsage.some(u=>!current.stock.some(p=>p.id===u.stockId&&p.gram-(p.offlineDeficit||0)>=u.amount))))throw Error('Reçeteli satış için bağlantı ve yeterli güncel stok gerekli.');
  const next=clone(current),warnings=[];
  for(const use of sale.stockUsage){let p=next.stock.find(p=>p.id===use.stockId);if(!p){const saved=base.stock.find(p=>p.id===use.stockId);if(!saved)throw Error('Hamur stok kaydı eksik.');p={...clone(saved),gram:0};next.stock.push(p);}
   const start=round(p.gram-(p.offlineDeficit||0)),end=round(start-use.amount);p.gram=Math.max(0,end);p.offlineDeficit=Math.max(0,-end);
   if(end<0)warnings.push({kind:'stock-shortage',stockId:p.id,shortage:Math.min(use.amount,-end)});
   next.stockMoves.unshift({id:'offline_move_'+sale.id+'_'+use.stockId,stockId:p.id,date:sale.date,name:'Satış · '+p.name,start,qty:1,gram:-use.amount,end,unit:use.unit,kind:'sale',refId:sale.id,actor:sale.cashier});
  }
  const credit=sale.payments.filter(p=>p.method==='Veresiye').reduce((n,p)=>n+p.amount,0),cash=sale.payments.filter(p=>p.method==='Nakit').reduce((n,p)=>n+p.amount,0);
  if(credit){let c=next.customers.find(c=>c.id===sale.customerId);if(!c){c={...clone(base.customers.find(c=>c.id===sale.customerId)),alacak:0,borc:0,txns:[],archived:true};next.customers.push(c);warnings.push({kind:'restored-credit-account'});}c.alacak=money(c.alacak+credit);c.lastActivity=sale.date;c.txns.unshift({id:'offline_credit_'+sale.id,date:sale.date,type:'alacak',amount:credit,note:'Veresiye satış '+sale.receiptNo,refId:sale.id,actor:sale.cashier});}
  if(!next.registerSessions.some(r=>r.id===sale.registerId)){const r=clone(base.registerSessions.find(r=>r.id===sale.registerId));r.status='closed';next.registerSessions.push(r);}
  if(next.registerSessions.find(r=>r.id===sale.registerId)?.status!=='open')warnings.push({kind:'closed-register'});
  if(input.orderId){const order=next.orders.find(o=>o.id===input.orderId),original=base.orders.find(o=>o.id===input.orderId);if(order&&!equal(order,original))warnings.push({kind:'order-changed'});else{if(!order)warnings.push({kind:'order-already-closed'});next.orders=next.orders.filter(o=>o.id!==input.orderId);}}
  if(cash)next.cashMoves.unshift({id:'offline_cash_'+sale.id,date:sale.date,registerId:sale.registerId,kind:'sale',amount:cash,note:'Satış '+sale.receiptNo,refId:sale.id,cashier:sale.cashier});
  sale.syncStatus=pending?'queued':'synced';if(syncedAt)sale.syncedAt=syncedAt;if(deviceId)sale.sourceDevice=deviceId;if(warnings.length)sale.syncWarning=warnings;
  // Preserve the device receipt and use the sale ID to disambiguate receipts.
  next.sales.unshift(sale);next.orderCounter=Math.max(next.orderCounter+1,base.orderCounter+1);
  return root.OSESFinance.backup(next);
 }
 function settleStock(current,next){
  const result=clone(next);for(const p of result.stock){const old=current.stock.find(x=>x.id===p.id);if(!old?.offlineDeficit)continue;if((p.offlineDeficit||0)!==old.offlineDeficit)throw Error('Stok farkı alış veya iptal kaydıyla kapatılmalıdır.');if(p.gram>old.gram){const effective=round(p.gram-old.offlineDeficit);p.gram=Math.max(0,effective);p.offlineDeficit=Math.max(0,-effective);}}
  return result;
 }
 root.AESDPrivateLedger={canonical,equal,event,validate,merge,settleStock};
})(typeof window==='object'?window:globalThis);
