/* Stock quantities and cancellation plans. Historical sale costs stay unchanged. */
(function(root){
 'use strict';
 const max=Number.MAX_SAFE_INTEGER/1e6;
 function quantity(n,unit,allowZero=true){return Number.isFinite(n)&&n>=0&&n<=max&&(allowZero||n>0)&&(n===0||Math.round(n*1e6)>0)&&(unit!=='adet'||Number.isInteger(n));}
 const rounded=n=>Math.round(n*1e6)/1e6;
 function normalizeStock(rows){return rows.map(p=>({...p,gram:Number(p.gram),critical:Number(p.critical??0),...(p.packageLitres===undefined?{}:{packageLitres:Number(p.packageLitres??0)})}));}
 function restorePlan(sale,stock,fallback){
  const rows=sale.stockUsageRecorded===false?fallback: sale.stockUsage;
  if(!Array.isArray(rows))throw Error('Fişin stok kaydı geçersiz.');
  const totals=new Map();
  for(const row of rows){
   if(!row||typeof row.stockId!=='string'||!Number.isFinite(row.amount)||row.amount<0)throw Error('Fişin stok miktarı geçersiz.');
   if(row.amount===0)continue;
   const material=stock.find(p=>p.id===row.stockId);
   if(!material)throw Error('İptal için stok ürününü geri ekleyin: '+(row.stockName||row.stockId));
   const amount=root.OSESCost.convert(row.amount,row.unit??material.unit,material.unit,material);
   if(amount===null||!quantity(amount,material.unit,false))throw Error('İptal için stok birimini düzeltin: '+material.name);
   const previous=totals.get(material.id)?.amount??0,total=rounded(previous+amount),end=rounded(material.gram+total);
   if(!quantity(total,material.unit,false)||!quantity(end,material.unit))throw Error('İptal sonrası stok miktarı geçersiz.');
   totals.set(material.id,{stockId:material.id,stockName:material.name,amount:total,unit:material.unit,start:material.gram,end});
  }
  return [...totals.values()];
 }
 root.OSESData={quantity,rounded,normalizeStock,restorePlan};
 if(typeof module==='object'&&module.exports)module.exports=root.OSESData;
})(typeof window==='object'?window:globalThis);
