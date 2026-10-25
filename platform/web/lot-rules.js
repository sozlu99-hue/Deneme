import {dateKey} from './business-calendar.js';
import {isQuantity} from './numeric-rules.js';

export function lotBalances(s) {
  const balances=new Map();
  const add=(purchaseId,warehouseId,qty)=>{const key=warehouseId+':'+purchaseId;balances.set(key,(balances.get(key)||0)+Math.round(qty*1000));};
  for(const p of s.purchases)if(p.lotTracked)add(p.id,p.warehouseId||'main',p.qty);
  for(const sale of s.sales)if(sale.status==='completed')for(const d of sale.deductions)for(const lot of d.lots||[])add(lot.purchaseId,sale.warehouseId||'main',-lot.qty);
  const saleMap=new Map(s.sales.map(x=>[x.id,x]));
  for(const r of s.saleReturns||[])for(const d of r.deductions)for(const lot of d.lots||[])add(lot.purchaseId,r.warehouseId||saleMap.get(r.saleId)?.warehouseId||'main',lot.qty);
  for(const t of s.transfers||[])for(const line of t.lines)for(const lot of line.lots||[]){add(lot.purchaseId,t.fromWarehouseId,-lot.qty);if(t.status==='received')add(lot.purchaseId,t.toWarehouseId,lot.qty);}
  for(const row of s.stockAdjustments||[])for(const lot of row.lots||[])add(lot.purchaseId,row.warehouseId||'main',lot.qty);
  return balances;
}
export function availableLots(s,kind,itemId,warehouseId='main') {
  const balances=lotBalances(s);
  return s.purchases.filter(p=>p.lotTracked&&p.kind===kind&&p.itemId===itemId)
    .map(p=>({...p,remainingQty:(balances.get(warehouseId+':'+p.id)||0)/1000}))
    .sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate)||a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function allocateLots(s,kind,itemId,qty,warehouseId,date,includeExpired=false) {
  const item=s[kind].find(x=>x.id===itemId);
  if(!item?.trackLots)return undefined;
  let remaining=Math.round(qty*1000);const rows=[];
  const today=dateKey(date);
  for(const lot of availableLots(s,kind,itemId,warehouseId)){
    if(lot.remainingQty<=0||!includeExpired&&lot.expiryDate<today)continue;
    const take=Math.min(remaining,Math.round(lot.remainingQty*1000));
    if(take>0){rows.push({purchaseId:lot.id,qty:take/1000});remaining-=take;}
    if(!remaining)break;
  }
  if(remaining)throw Error('Satılabilir parti stoku yetersiz. Son kullanma tarihlerini ve depoyu kontrol et.');
  return rows;
}
export function returnedLots(sale,deduction,previous,qty) {
  if(!deduction?.lots)return undefined;
  let skip=Math.round(previous*1000),remaining=Math.round(qty*1000);const rows=[];
  for(const lot of deduction.lots){const stored=Math.round(lot.qty*1000),before=Math.min(skip,stored);skip-=before;
    const take=Math.min(remaining,stored-before);if(take>0){rows.push({purchaseId:lot.purchaseId,qty:take/1000});remaining-=take;}if(!remaining)break;}
  if(remaining)throw Error('İade partisi satılan parti miktarını aşıyor.');
  return rows;
}
export function lotAlerts(s,at=new Date(),days=30) {
  const start=dateKey(at),end=dateKey(+new Date(at)+days*86400000);
  const purchases=new Map(s.purchases.filter(x=>x.lotTracked).map(x=>[x.id,x]));
  const items=new Map(['products','materials'].flatMap(kind=>s[kind].map(x=>[kind+':'+x.id,x]))),rows=[];
  for(const [key,qty]of lotBalances(s)){if(qty<=0)continue;const i=key.indexOf(':'),warehouseId=key.slice(0,i),lot=purchases.get(key.slice(i+1));
    if(lot&&lot.expiryDate<=end)rows.push({...lot,warehouseId,remainingQty:qty/1000,name:items.get(lot.kind+':'+lot.itemId).name,expired:lot.expiryDate<start});}
  return rows;
}
export function validateLots(s) {
  const purchases=new Map(s.purchases.filter(p=>p.lotTracked).map(p=>[p.id,p]));
  for(const p of purchases.values())if(!p.lotNumber?.trim()||typeof p.expiryDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.expiryDate))throw Error('Takip edilen partinin numarası ve tarihi gerekli.');
  function check(kind,itemId,qty,rows,signed=false){
    if(!rows)return;
    if(!Array.isArray(rows)||!rows.length)throw Error('Parti hareketi eksik.');
    let total=0;const seen=new Set();
    for(const row of rows){const p=purchases.get(row.purchaseId);if(!p||p.kind!==kind||p.itemId!==itemId||seen.has(p.id)||!isQuantity(Math.abs(row.qty))||!signed&&row.qty<=0)throw Error('Parti hareketi geçersiz.');seen.add(p.id);total+=Math.round(row.qty*1000);}
    if(total!==Math.round(qty*1000))throw Error('Parti miktarı stok hareketiyle eşleşmiyor.');
  }
  for(const sale of s.sales)for(const d of sale.deductions)check(d.kind,d.id,d.qty,d.lots);
  for(const r of s.saleReturns||[])for(const d of r.deductions)check(d.kind,d.id,d.qty,d.lots);
  for(const t of s.transfers||[])for(const d of t.lines)check(d.kind,d.itemId,d.qty,d.lots);
  for(const row of s.stockAdjustments||[])check(row.kind,row.itemId,row.deltaQty,row.lots,true);
  const totals=new Map(),balances=lotBalances(s);
  const add=(key,value)=>totals.set(key,(totals.get(key)||0)+value);
  for(const [key,value]of balances){if(value<0)throw Error('Parti bakiyesi negatif olamaz.');const p=purchases.get(key.slice(key.indexOf(':')+1));if(p)add(p.kind+':'+p.itemId,value);}
  for(const t of s.transfers||[])if(t.status==='in_transit')for(const line of t.lines)add(line.kind+':'+line.itemId,Math.round(line.qty*1000));
  for(const kind of ['products','materials'])for(const item of s[kind])if(item.trackLots){
    if((totals.get(kind+':'+item.id)||0)!==Math.round(item.stock*1000))throw Error('Takip edilen parti toplamı stokla eşleşmiyor.');
  }
}
