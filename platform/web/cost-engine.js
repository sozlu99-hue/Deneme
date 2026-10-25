/* Product cost arithmetic. Inventory deduction remains a separate rule. */
(function(root){
 'use strict';
 const round=n=>Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER/100?Math.round((n+Number.EPSILON)*100)/100:NaN;
 const margin=(profit,revenue)=>{if(!Number.isFinite(profit)||!Number.isFinite(revenue)||revenue<=0)return null;const n=round(profit/revenue*100);return Number.isFinite(n)?n:null;};
 const positive=n=>Number.isFinite(n)&&n>0;
 function normaliseStock(rows){return rows.map(p=>{
  if(!p?.costing)return p;
  const c=p.costing;
  if(!['gr','ml','adet','parca'].includes(c.unit)||!positive(c.totalBaseQty)||!Number.isFinite(c.totalPurchasePrice)||c.totalPurchasePrice<0)return{...p,costing:undefined,costInvalid:true};
  const entries=Array.isArray(c.entries)?c.entries.filter(e=>e&&typeof e.id==='string'&&typeof e.date==='string'&&Number.isFinite(e.totalPrice)&&Number.isFinite(e.quantity)):[];
  return{...p,costInvalid:false,costing:{...c,unitCost:c.totalPurchasePrice/c.totalBaseQty,entries}};
 });}
 const convert=(amount,from,to,material={})=>{
  if(!Number.isFinite(amount)||amount<0)return null;
  if(from===to)return amount;
  const weight={kg:1000,gr:1},volume={lt:1000,ml:1};
  if(weight[from]&&weight[to])return amount*weight[from]/weight[to];
  if(volume[from]&&volume[to])return amount*volume[from]/volume[to];
  if(positive(material.packageLitres)){
   if(from==='adet'&&volume[to])return amount*material.packageLitres*1000/volume[to];
   if(volume[from]&&to==='adet')return amount*volume[from]/(material.packageLitres*1000);
  }
  return null;
 };
 function purchase(input){
  const qty=Number(input.quantity),price=Number(input.totalPrice);
  if(input.quantity===''||input.totalPrice===''||!positive(qty)||!Number.isFinite(price)||price<0)throw Error('Alış miktarını ve toplam maliyeti geçerli girin.');
  let baseQty,unit,physicalQty,physicalUnit;
  if(input.kind==='kasa'){
   const heads=Number(input.itemsPerCase),parts=Number(input.partsPerItem);
   if(!Number.isInteger(qty)||!Number.isInteger(heads)||!positive(heads)||!Number.isInteger(parts)||!positive(parts))throw Error('Kasa, adet ve parça sayıları pozitif tam sayı olmalı.');
   baseQty=qty*heads*parts;unit=parts===1?'adet':'parca';physicalQty=qty*heads;physicalUnit='adet';
  }else if(input.kind==='adet'){
   const parts=Number(input.partsPerItem??1);
   if(!Number.isInteger(qty)||!Number.isInteger(parts)||!positive(parts))throw Error('Adet ve parça sayıları pozitif tam sayı olmalı.');
   baseQty=qty*parts;unit=parts===1?'adet':'parca';physicalQty=qty;physicalUnit='adet';
  }else if(input.kind==='parca'){
   if(!Number.isInteger(qty))throw Error('Parça sayısı pozitif tam sayı olmalı.');
   unit='parca';baseQty=qty;physicalQty=qty;physicalUnit='parca';
  }else if(['kg','gr','lt','ml'].includes(input.kind)){
   unit=['kg','gr'].includes(input.kind)?'gr':'ml';baseQty=convert(qty,input.kind,unit);physicalQty=baseQty;physicalUnit=unit;
  }else throw Error('Alış birimi geçersiz.');
  if(!positive(baseQty)||baseQty>Number.MAX_SAFE_INTEGER||!Number.isFinite(round(price))||!Number.isFinite(price/baseQty))throw Error('Alış miktarı çok büyük veya geçersiz.');
  return{baseQty,unit,totalPrice:round(price),unitCost:round(price)/baseQty,physicalQty,physicalUnit};
 }
 function addPurchase(material,input,id,date){
  const entry=purchase(input),old=material.costing;
  let previousQty=Number(old?.totalBaseQty)||0,previousValue=Number(old?.totalPurchasePrice)||0;
  if(old){
   previousQty=convert(previousQty,old.unit,entry.unit,material);
   if(previousQty===null)throw Error('Önceki alımlarla bu birim arasında dönüşüm yok. Ayrı stok ürünü oluşturun.');
  }
  const totalBaseQty=previousQty+entry.baseQty,totalPurchasePrice=round(previousValue+entry.totalPrice);
  if(!positive(totalBaseQty)||totalBaseQty>Number.MAX_SAFE_INTEGER||!Number.isFinite(totalPurchasePrice))throw Error('Toplam alış miktarı geçersiz.');
  return{...material,costing:{unit:entry.unit,totalBaseQty,totalPurchasePrice,unitCost:totalPurchasePrice/totalBaseQty,
   entries:[{id,date,...entry,kind:input.kind,quantity:Number(input.quantity),itemsPerCase:Number(input.itemsPerCase)||1,partsPerItem:Number(input.partsPerItem)||1},...(old?.entries??[])]}};
 }
 function recipe(product,stock){
  const previousUnits={s1:'gr',s2:'adet',s3:'gr',s4:'ml',s5:'adet',s6:'adet',s7:'adet',s8:'adet',s9:'adet',s10:'adet',s11:'gr',s12:'ml',s13:'ml'};
  const invalid={stockId:'',amount:NaN,unit:'',invalid:true};
  const explicit=product.costRecipe!==undefined&&product.costRecipe!==null;
  const rows=explicit?product.costRecipe:(product.recipe??[]);
  if(!Array.isArray(rows))return[invalid];
  return rows.map(line=>!line||typeof line!=='object'||Array.isArray(line)?{...invalid}:explicit?{...line}:{...line,unit:line.unit??previousUnits[line.stockId]??stock.find(p=>p.id===line.stockId)?.unit??'adet'});
 }
 function calculate(product,stock){
  if(product.productKind==='ready'){
   const material=stock.find(m=>m.id===product.readyStockId&&m.unit==='adet'),unitCost=material?.costing?.unit==='adet'?material.costing.unitCost:product.readyInitialCost;
   const valid=!!material&&Number.isFinite(round(unitCost))&&unitCost>=0;
   return{complete:valid,cost:valid?round(unitCost):null,rawCost:valid?unitCost:null,source:'stock',lines:valid?[{stockId:material.id,name:material.name,amount:1,unit:'adet',costUnit:'adet',unitCost,cost:round(unitCost)}]:[],missing:valid?[]:['Adet stoku veya alış fiyatı eksik']};
  }
  if(product.simpleIngredients&&!product._selectedContent){root.AESDPrivateWorkflow.content(product,stock);product=root.AESDPrivateWorkflow.selected(product,{},stock);}
  const lines=recipe(product,stock),automatic=product.costMode==='recipe'||lines.some(l=>{const p=stock.find(p=>p.id===l.stockId);return !p||l.invalid||p.costing||p.costInvalid;});
  if(!automatic){
   const valid=Number.isFinite(round(product.cost))&&product.cost>=0;
   return{complete:valid,cost:valid?round(product.cost):null,rawCost:valid?product.cost:null,source:'manual',lines:[],missing:valid?[]:['Elle girilmiş maliyet geçersiz']};
  }
  let raw=product.costExtra===undefined||product.costExtra===null?0:Number(product.costExtra);const details=[],missing=[];
  if(!Number.isFinite(raw)||raw<0){raw=0;missing.push('Ek maliyet geçersiz');}
  if(!lines.length&&raw===0)missing.push('Reçete boş');
  for(const l of lines){
   const material=stock.find(p=>p.id===l.stockId),unit=l.unit??material?.unit;
   const qty=material?.costing?convert(Number(l.amount),unit,material.costing.unit,material):null;
   const valid=material&&positive(Number(l.amount))&&qty!==null&&Number.isFinite(material.costing?.unitCost)&&material.costing.unitCost>=0;
   if(!valid){missing.push(l.invalid?'Geçersiz reçete satırı':material?.name??'Silinmiş stok ürünü');continue;}
   const value=qty*material.costing.unitCost;
   if(!Number.isFinite(value)){missing.push(material.name);continue;}
   raw+=value;details.push({stockId:l.stockId,name:material.name,amount:Number(l.amount),unit,costUnit:material.costing.unit,unitCost:material.costing.unitCost,cost:round(value)});
  }
  if(!Number.isFinite(round(raw))){missing.push('Maliyet toplamı geçersiz');raw=0;}
  const unmeasured=product._unmeasured||[];return{complete:missing.length===0&&!unmeasured.length,cost:missing.length||unmeasured.length?null:round(raw),rawCost:missing.length||unmeasured.length?null:raw,knownCost:round(raw),source:'recipe',lines:details,missing:[...missing,...unmeasured],...(product.simpleIngredients?{trackedComplete:missing.length===0,trackedRawCost:missing.length?null:raw,excluded:unmeasured}:{})};
 }
 function sale(items,products,stock,revenue){
  let total=0,estimated=0,hasEstimate=false,estimateValid=true;const details=[],missing=[],excluded=new Set();
  for(const item of items){
   const product=products.find(p=>p.id===item.productId);
   const configured=!!product?.simpleIngredients,selected=product&&root.AESDPrivateWorkflow?root.AESDPrivateWorkflow.selected(product,item,stock):product;
   const c=selected?calculate(selected,stock):{complete:false,missing:['Satış ürünü bulunamadı']};
   if(configured){hasEstimate=true;for(const name of c.excluded||[])excluded.add(name);if(c.trackedComplete&&positive(item.qty))estimated+=c.trackedRawCost*item.qty;else estimateValid=false;}else if(c.complete&&positive(item.qty))estimated+=c.rawCost*item.qty;else estimateValid=false;
   if(!c.complete||!positive(item.qty)){missing.push({productId:item.productId,name:item.name,reasons:c.missing});details.push({productId:item.productId,name:item.name,qty:item.qty,cost:null,source:'incomplete',...(configured?{ingredients:c.lines,omitted:item.omitted||[],ingredientRevision:product.simpleIngredients.revision}: {})});continue;}
   const lineCost=c.rawCost*item.qty;total+=lineCost;
   details.push({productId:item.productId,name:item.name,qty:item.qty,unitCost:c.cost,rawUnitCost:c.rawCost,cost:round(lineCost),source:c.source,ingredients:c.lines});
  }
  if(!Number.isFinite(round(total))||!Number.isFinite(round(revenue)))missing.push({name:'Satış toplamı',reasons:['Maliyet veya satış tutarı çok büyük veya geçersiz']});
  const cost=missing.length?null:round(total),grossProfit=cost===null?null:round(revenue-cost);
  return{cost,costComplete:cost!==null,costDetails:details,costMissing:missing,grossProfit,grossMargin:margin(grossProfit,revenue),...(hasEstimate?{estimatedCost:estimateValid&&Number.isFinite(round(estimated))?round(estimated):null,estimatedCostExcluded:[...excluded]}:{})};
 }
 function updateProducts(state){return{...state,products:state.products.map(p=>{const c=calculate(p,state.stock);return c.source==='recipe'||c.source==='stock'?{...p,costMode:'recipe',...(c.complete?{cost:c.cost}:{})}:p;})};}
 const api={round,margin,convert,purchase,addPurchase,recipe,calculate,sale,updateProducts,normaliseStock};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.OSESCost=api;
})(typeof window==='object'?window:globalThis);
