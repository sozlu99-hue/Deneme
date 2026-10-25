/* Shared owner workflow arithmetic. Never rewrites a historical sale. */
(function(root){
 'use strict';
 const clone=v=>JSON.parse(JSON.stringify(v)),round=v=>root.OSESData.rounded(v);
 const net=p=>p.netGrams??p.gramUsage??0;
 const integerUnits=new Set(['adet','parca']);
 function amount(value,unit,zero=false){const n=Number(value);if(value===''||!root.OSESData.quantity(n,unit,zero)||integerUnits.has(unit)&&!Number.isInteger(n))throw Error('Miktar geçersiz. Adet ve parça için tam sayı kullan.');return n;}
 function number(value,zero=false){const n=Number(value);if(value===''||!Number.isFinite(n)||(zero?n<0:n<=0))throw Error('Geçerli bir sayı gir.');return n;}
 function movement(state,input){
  const m=state.stock.find(m=>m.id===input.stockId);if(!m)throw Error('Stok ürünü bulunamadı.');
  if(!['purchase','count','waste','exit'].includes(input.operation))throw Error('Stok işlem türü geçersiz.');
  if(m.offlineDeficit&&input.operation!=='purchase')throw Error('Önce önceki satışların hamur stok farkını alışla kapat. Sayım veya fire bu farkı kapatamaz.');
  if(input.expectedQty!==undefined&&Number(input.expectedQty)!==m.gram)throw Error('Stok değişti. Miktarı yeniden kontrol et.');
  if(input.expectedDeficit!==undefined&&Number(input.expectedDeficit)!==(m.offlineDeficit||0))throw Error('Bekleyen stok farkı değişti. İşlemi yeniden kontrol et.');
  const quantity=number(input.quantity,input.operation==='count'),unit=input.unit,pack=['kasa','koli','paket'].includes(unit),parts=integerUnits.has(m.unit)&&m.unit==='parca'&&unit!=='parca'?number(input.partsPerItem):1;
  const per=pack?number(input.itemsPerCase):1;
  if(materialRole(state,m.id)==='lettuce'&&((pack&&(unit!=='kasa'||per!==6))||(unit!=='parca'&&parts!==4)))throw Error('Marul: 1 kasa = 6 adet = 24 parça.');
  if((pack||unit==='adet'||unit==='parca')&&(!Number.isInteger(quantity)||!Number.isInteger(per)||!Number.isInteger(parts)))throw Error('Kasa, adet ve parça sayıları tam sayı olmalı.');
  let base,purchase;
  if(input.operation==='purchase'){
   if(!['unit','total'].includes(input.priceMode))throw Error('Alış fiyatı giriş yöntemi geçersiz.');
   const price=number(input.price,true),total=input.priceMode==='total'?price:root.OSESCost.round(price*quantity);
   const kind=pack?'kasa':unit;
   purchase={stockId:m.id,kind,quantity,totalPrice:total,itemsPerCase:per,partsPerItem:parts,addToStock:true};
   const result=root.OSESCost.purchase(purchase);
   base=root.OSESCost.convert(result.baseQty,result.unit,m.unit,m);
   if(base===null)throw Error('Alış birimi stok kartıyla uyumsuz. Parça takibi için ayrı parça stok kartı kullan.');
  }else{
   if(pack)base=quantity*per*parts;
   else if(unit==='adet'&&m.unit==='parca')base=quantity*parts;
   else base=root.OSESCost.convert(quantity,unit,m.unit,m);
   if(base===null)throw Error('Stok birimleri uyumsuz.');
  }
  base=amount(base,m.unit,input.operation==='count');
  if(['waste','exit'].includes(input.operation)&&base>m.gram)throw Error('Çıkış veya fire miktarı mevcut stoğu aşamaz.');
  const end=round(input.operation==='count'?base:input.operation==='purchase'?m.gram+base:m.gram-base);
  amount(end,m.unit,true);
  const note=String(input.note??'').trim();if(note.length>500||input.operation!=='purchase'&&note.length<3)throw Error('Stok düzeltmesi ve fire için en az 3 karakter açıklama gir.');
  const settledEnd=purchase?Math.max(0,round(end-(m.offlineDeficit||0))):end,remainingDeficit=purchase?Math.max(0,round((m.offlineDeficit||0)-base)):m.offlineDeficit||0;
  return{material:m,base,end,settledEnd,remainingDeficit,delta:round(end-m.gram),purchase,note};
 }
 function stock(state,input,ids){
  const preview=movement(state,input),{material:m,base,end,delta,purchase,note}=preview;
  if(!ids?.id||!Number.isFinite(Date.parse(ids.date))||state.stockMoves.some(row=>row.id===ids.id))throw Error('Stok hareket kimliği veya tarihi geçersiz.');
  let updated={...m,gram:end};
  if(purchase){if(!ids.purchaseId||state.stock.some(s=>s.costing?.entries?.some(e=>e.id===ids.purchaseId)))throw Error('Alış kimliği geçersiz veya yinelenmiş.');updated={...root.OSESCost.addPurchase(m,purchase,ids.purchaseId,ids.date),gram:end};}
  const names={purchase:'Alış',count:'Sayım düzeltmesi',waste:'Fire',exit:'Stok çıkışı'};
  const move={id:ids.id,stockId:m.id,date:ids.date,name:names[input.operation]+' · '+m.name,start:m.gram,qty:1,gram:delta,end:preview.settledEnd,unit:m.unit,kind:input.operation==='count'?'adjustment':input.operation,actor:String(ids.actor||'Yönetici'),note,
   ...(m.offlineDeficit?{offlineDeficitBefore:m.offlineDeficit,offlineDeficitAfter:preview.remainingDeficit}:{}),
   workflow:{stockId:m.id,operation:input.operation,quantity:Number(input.quantity),expectedQty:m.gram,expectedDeficit:m.offlineDeficit||0,unit:input.unit,note,
    ...(['kasa','koli','paket'].includes(input.unit)?{itemsPerCase:Number(input.itemsPerCase)}:{}),
    ...(m.unit==='parca'&&input.unit!=='parca'?{partsPerItem:Number(input.partsPerItem)}:{}),
    ...(purchase?{priceMode:input.priceMode,price:Number(input.price)}:{})},...(purchase?{refId:ids.purchaseId,purchaseCost:purchase.totalPrice}:{})};
  const next={...state,updatedAt:ids.date,stock:state.stock.map(s=>s.id===m.id?updated:s),stockMoves:[move,...state.stockMoves]};
  return purchase?root.OSESCost.updateProducts(next):next;
 }
 function ready(state,input,ids){
  const old=state.products.find(p=>p.id===input.productId),quantity=amount(input.quantity,'adet',true),price=number(input.salePrice,true),initialCost=number(input.unitCost,true),name=String(input.name??'').trim();
  if(!ids?.id||state.stockMoves.some(m=>m.id===ids.id)||!Number.isFinite(Date.parse(ids.date))||!input.productId||!input.stockId||!name||name.length>100||!root.OSESFinance.money(price)||!root.OSESFinance.money(initialCost))throw Error('Ürün, adet veya fiyat geçersiz.');
  if(old&&old.productKind!=='ready'&&(old.productKind==='prepared'||net(old)>0||old.recipeStock===true&&root.OSESCost.recipe(old,state.stock).length>0&&!(root.OSESCost.recipe(old,state.stock).length===1&&root.OSESCost.recipe(old,state.stock)[0].stockId===input.stockId&&root.OSESCost.recipe(old,state.stock)[0].amount===1&&state.stock.find(m=>m.id===input.stockId)?.unit==='adet')))throw Error('Hazırlanan ürünü hazır ürüne çeviremezsin. Geçmişi koruyarak ayrı ürün ekle.');
  if(old?.productKind==='ready'&&old.readyStockId!==input.stockId)throw Error('Kayıtlı adet stok bağlantısı değiştirilemez.');
  if(state.products.some(p=>p.id!==input.productId&&p.productKind==='ready'&&p.readyStockId===input.stockId))throw Error('Bu stok başka hazır ürüne bağlı.');
  let material=state.stock.find(m=>m.id===input.stockId);
  if(material&&material.unit!=='adet')throw Error('Hazır ürün adedi için adet stok kartı gerekli.');
  if(Number(input.expectedQty)!==(material?.gram||0))throw Error('Stok değişti. Miktarı yeniden kontrol et.');
  if(old?.productKind==='ready'&&input.mode==='edit'&&quantity!==0)throw Error('Adet eklemek için Stok ekle kullan.');
  if(!['create','convert','purchase','edit'].includes(input.mode)||input.mode==='create'&&old||input.mode==='convert'&&(!old||old.productKind==='ready')||['purchase','edit'].includes(input.mode)&&old?.productKind!=='ready'||input.mode==='purchase'&&quantity<1)throw Error('Hazır ürün işlem türü geçersiz.');
  material=material||{id:input.stockId,name,unit:'adet',gram:0,critical:0};
  let next={...state,stock:state.stock.some(m=>m.id===material.id)?state.stock:[...state.stock,material]};
  if(quantity>0)next=stock(next,{stockId:material.id,expectedQty:material.gram,operation:'purchase',quantity,unit:'adet',priceMode:'unit',price:initialCost,note:''},ids);
  else next={...next,stockMoves:[{id:ids.id,stockId:material.id,date:ids.date,name:'Hazır ürün · '+name,start:material.gram,qty:1,gram:0,end:material.gram,unit:'adet',kind:'product',actor:String(ids.actor||'Yönetici')},...next.stockMoves]};
  let packageSize={};if(input.packageAmount!==undefined&&input.packageAmount!==''){const n=number(input.packageAmount);if(!['ml','lt'].includes(input.packageUnit)||n>100000)throw Error('Ambalaj hacmi geçersiz.');packageSize={packageAmount:n,packageUnit:input.packageUnit};}
  if(old?.packageAmount!==undefined&&packageSize.packageAmount!==undefined&&(old.packageAmount!==packageSize.packageAmount||old.packageUnit!==packageSize.packageUnit))throw Error('Farklı ambalaj hacmi için ayrı hazır ürün ekle. Mevcut adetler dönüştürülmez.');
  const row={...(old||{id:input.productId,emoji:'🥤',active:true}),name,...packageSize,price:root.OSESCost.round(price),category:old?.category||'İçecekler',productKind:'ready',readyStockId:material.id,readyInitialCost:old?.productKind==='ready'&&input.mode==='edit'?old.readyInitialCost:initialCost,gramUsage:0,netGrams:0,recipe:[],costRecipe:[],costExtra:0,costMode:'ready',recipeStock:true,recipeReviewRequired:false};
  row.cost=root.OSESCost.calculate(row,next.stock).cost;
  next.products=old?next.products.map(p=>p.id===row.id?row:p):[...next.products,row];
  next.stockMoves[0]={...next.stockMoves[0],workflow:{operation:'ready',mode:input.mode,productId:row.id,stockId:material.id,name,quantity,expectedQty:material.gram,salePrice:row.price,unitCost:initialCost,...packageSize}};
  return next;
 }
 function product(state,input){
  const old=state.products.find(p=>p.id===input.id);
  const name=String(input.name??'').trim(),price=number(input.price,true),grams=amount(input.netGrams,'gr',true);
  if(!input.id||!name||name.length>100||!root.OSESFinance.money(price)||!Number.isFinite(root.OSESCost.round(price)))throw Error('Ürün adı veya satış fiyatı geçersiz.');
  if(old&&input.expectedNet!==undefined&&Number(input.expectedNet)!==net(old))throw Error('Ürün gramajı değişti. Yeniden kontrol et.');
  if(old?.productKind==='ready')throw Error('Hazır ürünü adet ve fiyat ekranından düzenle.');
  const changed=old&&net(old)!==grams;
  const row={...(old||{id:input.id,active:true,emoji:'🍽️',recipe:[],costMode:'recipe',costRecipe:[],cost:null,costExtra:0,gramUsage:0,recipeStock:false}),name,...(!old&&input.productKind==='prepared'?{productKind:'prepared'}:{}),...(input.emoji!==undefined?{emoji:String(input.emoji).slice(0,12)}:{}),price:root.OSESCost.round(price),netGrams:grams,category:String(input.category||old?.category||'Paketler'),active:input.active!==false,
   ...(!old&&[300,500,750,1000].includes(grams)&&input.category==='Paketler'?{aesdPhoto:({300:4,500:5,750:6,1000:7})[grams]}:{}),
   ...(!old||changed?{recipeReviewRequired:true,previousNetGrams:old?net(old):grams}:{} )};
  return{...state,products:old?state.products.map(p=>p.id===row.id?row:p):[...state.products,row]};
 }
 function recipe(state,input,date){
  if(!Number.isFinite(Date.parse(date)))throw Error('Reçete kontrol tarihi geçersiz.');
  const p=state.products.find(p=>p.id===input.productId);if(p?.productKind==='ready')throw Error('Hazır üründe içindekiler gerekmez.');if(!p)throw Error('Ürün bulunamadı.');
  if(input.expectedNet!==undefined&&Number(input.expectedNet)!==net(p))throw Error('Ürün gramajı değişti. Reçeteyi yeniden aç.');
  if(p.productKind==='prepared'&&input.recipeStock!==true)throw Error('Hazırlanan üründe malzeme stok takibi açık olmalı.');
  if(p.recipeReviewRequired===true&&input.reviewed!==true)throw Error('Reçeteyi yeni gramaja göre kontrol ettiğini onayla.');
  if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>100||new Set(input.lines.map(l=>l.stockId)).size!==input.lines.length)throw Error('Reçete boş, çok uzun veya malzeme yinelenmiş.');
  const lines=input.lines.map(l=>{const m=state.stock.find(s=>s.id===l.stockId);if(!m)throw Error('Stok ürünü bulunamadı.');const value=amount(l.amount,l.unit);if(root.OSESCost.convert(value,l.unit,m.unit,m)===null)throw Error('Reçete birimi stokla uyumsuz.');return{stockId:m.id,amount:value,unit:l.unit};});
  let grams=0;for(const line of lines.filter(l=>l.stockId==='s1')){const n=root.OSESCost.convert(line.amount,line.unit,'gr');if(n===null)throw Error('Hamur gr/kg olarak girilmeli.');grams+=n;}
  if(lines.some(l=>l.stockId==='s1')&&p.productKind!=='prepared'&&net(p)>0&&round(grams)!==net(p))throw Error('Hamur miktarı ürünün net gramajıyla eşleşmiyor. Miktarları kontrol et.');
  const extra=number(input.extra??0,true),row={...p,...(p.productKind==='prepared'?{netGrams:round(grams)}:{}),gramUsage:round(grams),costMode:'recipe',costRecipe:lines,costExtra:extra,recipeStock:input.recipeStock===true,recipeReviewRequired:false,recipeReviewedGrams:p.productKind==='prepared'?round(grams):net(p),recipeReviewedAt:date,recipeRevision:(p.recipeRevision||0)+1};
  if(!Number.isSafeInteger(row.recipeRevision))throw Error('Reçete sürüm sınırı aşıldı.');
  const cost=root.OSESCost.calculate(row,state.stock);if(!cost.complete)throw Error('Alış maliyeti veya reçete eksik.');if(input.expectedCost!==undefined&&input.expectedCost!==cost.cost)throw Error('Alış maliyeti değişti. Reçete özetini yeniden kontrol et.');
  row.cost=cost.cost;if(row.recipeStock)root.OSESFinance.doughUsage([{productId:p.id,qty:1}],[row],state.stock);
  return{...state,updatedAt:date,products:state.products.map(p=>p.id===row.id?row:p)};
 }
 function status(p,stock){
  if(p.productKind==='ready'){const m=stock.find(m=>m.id===p.readyStockId);return !m||!root.OSESCost.calculate(p,stock).complete?'Alış fiyatı eksik':m.gram<1?'Stok yok':p.active?'Satışa hazır':'Satışa kapalı';}
  if(!root.OSESCost.recipe(p,stock).length)return'Reçete eksik';
  if(p.recipeReviewRequired===true)return'Reçete kontrolü gerekli';
  const calculation=root.OSESCost.calculate(p,stock);if(!(p.simpleIngredients?calculation.trackedComplete:calculation.complete))return'Maliyet eksik';
  try{const usage=root.OSESFinance.doughUsage([{productId:p.id,qty:1,...(p.simpleIngredients?{ingredientRevision:p.simpleIngredients.revision}:{})}],[p],stock);if(usage.some(u=>{const m=stock.find(s=>s.id===u.stockId);return!m||m.gram-(m.offlineDeficit||0)<u.amount;}))return'Stok yetersiz';}catch{return'Reçete kontrolü gerekli';}
  return p.active?'Satışa hazır':'Satışa kapalı';
 }
 // Explicit product content setup. No startup migration and no stock quantity rewrite.
 const roles={dough:['Çiğköfte Hamuru','gr'],lavash:['Lavaş','adet'],hot:['Acı Sos','ml'],pomegranate:['Nar Ekşisi','ml'],lettuce:['Marul','parca'],tomato:['Domates','gr'],pickle:['Turşu','gr'],lemon:['Limon','gr']};
 const templates={p1:[100,1,12,1,true,false],aesd_doritos_100:[100,1,12,1,true,true],p2:[150,2,20,1,false,false],aesd_doritos_150:[150,2,20,1,false,true],aesd_pack_300:[300,2,12,1,true,false],aesd_pack_500:[500,4,24,1,true,false],aesd_pack_750:[750,6,36,2,true,false],p5:[1000,8,36,4,true,false]};
 const autoRoles=['dough','lavash','hot','pomegranate','lettuce'];
 function content(p,stock){
  const c=p.simpleIngredients,t=Object.hasOwn(templates,c?.template)?templates[c.template]:null;if(p._selectedContent!==undefined||p._unmeasured!==undefined)throw Error('İçerik iç alanları kaydedilemez.');
  if(!t||c.template!==p.id||c.version!==1||!Number.isSafeInteger(c.revision)||c.revision<1||!c.materials||!c.amounts||p.recipeStock!==true||p.productKind==='ready')throw Error('Ürün içeriği yapılandırması geçersiz.');
  const keys=[...autoRoles,'tomato','pickle',...(t[4]?['lemon']:[])];
  if(Object.keys(c.materials).length!==keys.length||Object.keys(c.amounts).length!==autoRoles.length||new Set(Object.values(c.materials)).size!==keys.length)throw Error('İçerik stok bağlantıları geçersiz.');
  for(const role of keys){const m=stock.find(m=>m.id===c.materials[role]);if(!m||m.unit!==roles[role][1]||m.stockKind&&m.stockKind!==role||role==='dough'&&m.id!=='s1')throw Error('İçerik birimi uyumsuz: '+roles[role][0]);}
  for(const role of autoRoles){if(typeof c.amounts[role]!=='number')throw Error('İçerik miktarı sayısal olmalı.');amount(c.amounts[role],roles[role][1]);}
  if(c.amounts.dough!==net(p)&&p.recipeReviewRequired!==true)throw Error('İçerik hamuru net gramajla eşleşmiyor.');
  const lines=autoRoles.map(role=>({stockId:c.materials[role],amount:c.amounts[role],unit:roles[role][1]}));
  const recorded=root.OSESCost.recipe(p,stock);if(recorded.length!==lines.length||recorded.some((l,i)=>Object.keys(l).length!==3||l.stockId!==lines[i].stockId||l.amount!==lines[i].amount||l.unit!==lines[i].unit)||Number(p.costExtra)!==0)throw Error('Ölçülü içerikler kayıtlı miktarlarla eşleşmiyor.');
  return{keys,lines,manual:['tomato','pickle',...(t[4]?['lemon']:[]),...(t[5]?['doritos']:[])]};
 }
 function selected(p,item,stock){
  if(!p.simpleIngredients){if(item.omitted!==undefined||item.ingredientRevision!==undefined)throw Error('Bu ürün için içerik seçimi açık değil.');return p;}
  const c=p.simpleIngredients,info=content(p,stock),omitted=item.omitted??[];
  if(item.ingredientRevision!==undefined&&item.ingredientRevision!==c.revision)throw Error('İçerik değişti. Ürünü adisyona yeniden ekle.');
  if(!Array.isArray(omitted)||omitted.length>6||new Set(omitted).size!==omitted.length||omitted.some(role=>!['hot','pomegranate','lettuce',...info.manual.filter(r=>r!=='doritos')].includes(role)))throw Error('Çıkarılan içerik geçersiz.');
  const lines=info.lines.filter(line=>!omitted.some(role=>c.materials[role]===line.stockId));
  return{...p,costRecipe:lines,_selectedContent:true,_unmeasured:info.manual.filter(role=>!omitted.includes(role)).map(role=>role==='doritos'?'Doritos':roles[role][0])};
 }
 function ingredients(state,input,ids){
  const old=state.products.find(p=>p.id===input.productId),t=Object.hasOwn(templates,input.template)?templates[input.template]:null;
  if(input.reviewed!==true)throw Error('İçindekileri ve stok bağlantılarını kontrol ettiğini onayla.');
  if(!old||old.productKind==='ready'||!t||Number(input.expectedRevision)!==(old.simpleIngredients?.revision||0)||old.id!==input.template)throw Error('Ürün veya içerik sürümü değişti. Yeniden aç.');
  if(!ids?.id||!Number.isFinite(Date.parse(ids.date))||state.stockMoves.some(m=>m.id===ids.id))throw Error('İçerik işlem kimliği geçersiz.');
  const keys=[...autoRoles,'tomato','pickle',...(t[4]?['lemon']:[])],materials={},stock=clone(state.stock);
  if(!input.materials||Object.keys(input.materials).length!==keys.length)throw Error('Tüm malzeme bağlantılarını kontrol et.');
  for(const role of keys){const id=input.materials[role];if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||role==='dough'&&id!=='s1')throw Error('Stok kimliği geçersiz.');let m=stock.find(m=>m.id===id);if(!m){if(state.deletedStockIds?.includes(id))throw Error('Silinmiş stok kimliği kullanılamaz.');m={id,name:roles[role][0],unit:roles[role][1],gram:0,critical:0};stock.push(m);}if(m.stockKind&&m.stockKind!==role||state.products.some(p=>Object.entries(p.simpleIngredients?.materials||{}).some(([r,v])=>v===id&&r!==role)))throw Error('Stok farklı bir malzemeye bağlı.');if(m.unit!==roles[role][1])throw Error(roles[role][0]+' için '+roles[role][1]+' stok kartı seç. Eski kartın birimi değişmez.');materials[role]=id;}
  const rawAmounts=input.amounts||{dough:t[0],lavash:t[1],hot:t[2],pomegranate:t[2],lettuce:t[3]};const amounts=Object.fromEntries(Object.entries(rawAmounts).map(([role,value])=>[role,Number(value)]));
  const row={...old,netGrams:net(old),gramUsage:Number(amounts.dough),recipeStock:true,recipeReviewRequired:false,recipeReviewedGrams:net(old),recipeReviewedAt:ids.date,recipeRevision:(old.recipeRevision||0)+1,costMode:'recipe',costExtra:0,cost:null,simpleIngredients:{version:1,template:input.template,revision:(old.simpleIngredients?.revision||0)+1,materials,amounts:clone(amounts)}};
  if(!Number.isSafeInteger(row.recipeRevision))throw Error('İçerik sürüm sınırı aşıldı.');
  row.costRecipe=autoRoles.map(role=>({stockId:materials[role],amount:amounts[role],unit:roles[role][1]}));content(row,stock);
  const move={id:ids.id,stockId:materials.dough,date:ids.date,name:'İçindekiler · '+row.name,start:stock.find(m=>m.id===materials.dough).gram,qty:1,gram:0,end:stock.find(m=>m.id===materials.dough).gram,unit:'gr',kind:'product',actor:String(ids.actor||'Yönetici'),workflow:{operation:'ingredients',reviewed:true,productId:old.id,template:input.template,expectedRevision:Number(input.expectedRevision),materials,amounts:clone(amounts)}};
  return{...state,updatedAt:ids.date,stock,products:state.products.map(p=>p.id===old.id?row:p),stockMoves:[move,...state.stockMoves]};
 }
 function materialRole(state,id){const tagged=state.stock.find(m=>m.id===id)?.stockKind;if(tagged)return tagged;for(const p of state.products){const role=Object.entries(p.simpleIngredients?.materials||{}).find(([r,v])=>v===id)?.[0];if(role)return role;}return null;}
 const preview=(state,input)=>movement(state,{...input,price:input.price===''?'0':input.price,note:input.note||'Önizleme'});
 root.AESDPrivateWorkflow={ingredients,content,selected,roles,templates,autoRoles,materialRole,ready,movement,preview,stock,product,recipe,status,net,clone};
})(typeof window==='object'?window:globalThis);
