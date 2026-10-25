/* Update this menu once. Keep sale snapshots and later owner edits. */
(function(root){
 const version='aesd-menu-20261008-2',norm=s=>String(s||'').toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşü0-9]/g,'');
 const rows=[
  {id:'p1',name:'Çiğköfte Dürüm',price:100,grams:100,photo:0,category:'Dürümler'},
  {id:'aesd_doritos_100',name:'Doritoslu Dürüm',price:130,grams:100,photo:1,category:'Dürümler',doritos:true},
  {id:'p2',name:'Mega Dürüm',price:150,grams:150,photo:2,category:'Dürümler'},
  {id:'aesd_doritos_150',name:'Doritoslu Mega Dürüm',price:180,grams:150,photo:3,category:'Dürümler',doritos:true},
  {id:'aesd_pack_300',name:'Küçük Paket',price:230,grams:300,photo:4,category:'Paketler'},
  {id:'aesd_pack_500',name:'Orta Paket',price:370,grams:500,photo:5,category:'Paketler'},
  {id:'aesd_pack_750',name:'Büyük Paket',price:630,grams:750,photo:6,category:'Paketler'},
  {id:'p5',name:'Aile Boyu Paket',price:680,grams:1000,photo:7,category:'Paketler'}
 ];
 function apply(value){
  if(value.settings?.aesdMenuRelease===version)return value;
  const state=structuredClone(value),products=state.products||[],stock=state.stock||[];
  const bases={wrap:products.find(p=>p.id==='p1')||products.find(p=>p.gramUsage===100),package:products.find(p=>p.id==='p4')||products.find(p=>p.gramUsage>=200)};
  for(const row of rows){
   let p=products.find(p=>norm(p.name)===norm(row.name));
   if(!p)p=products.find(p=>p.id===row.id);
   if(!p&&row.id==='p5')p=products.find(p=>['aileboyu','aileboyupaket'].includes(norm(p.name)));
   const template=p||(row.category==='Dürümler'?bases.wrap:bases.package)||{recipe:[{stockId:'s1',amount:row.grams,unit:'gr'}]};
   const source=template.costRecipe||template.recipe||[{stockId:'s1',amount:row.grams,unit:'gr'}],factor=template.gramUsage>0?row.grams/template.gramUsage:1;
   const recipe=p?.recipeStock===true?source:source.map(l=>({...l,amount:l.stockId==='s1'?row.grams:Math.round(Number(l.amount)*factor*1e6)/1e6,...(l.stockId==='s1'?{unit:'gr'}:{})}));
   if(!recipe.some(l=>l.stockId==='s1'))recipe.unshift({stockId:'s1',amount:row.grams,unit:'gr'});
   if(row.doritos&&!recipe.some(l=>l.stockId==='aesd_doritos_portion'))recipe.push({stockId:'aesd_doritos_portion',amount:1,unit:'adet'});
   const next={...template,id:p?.id||row.id,name:row.name,price:row.price,gramUsage:row.grams,category:row.category,active:p?.active??true,emoji:'🌯',recipe,costRecipe:recipe,costMode:'recipe',aesdPhoto:row.photo};
   if(p)products[products.indexOf(p)]=next;else products.push(next);
  }
  if(!stock.some(p=>p.id==='aesd_doritos_portion'))stock.push({id:'aesd_doritos_portion',name:'Doritos porsiyonu',unit:'adet',gram:0,critical:0});
  state.products=products;state.stock=stock;state.settings={...state.settings,aesdMenuRelease:version};
  return root.OSESCost?root.OSESCost.updateProducts(state):state;
 }
 function photo(p){if(Number.isInteger(p.aesdPhoto)&&p.aesdPhoto>=0&&p.aesdPhoto<=8)return p.aesdPhoto;const row=rows.find(r=>norm(r.name)===norm(p.name));return row?.photo??(norm(p.name).includes('ayran')?8:null);}
 root.AESDPrivateMenu={version,rows,apply,photo};
})(typeof window==='object'?window:globalThis);
