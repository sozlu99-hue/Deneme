import fs from 'node:fs';
// Keep the original data schema and password store. The parent supplies the
// identity only after the server verifies the OWNER account and signed lease.
export function patchPrivateTemplate(html){
 // Update legacy support labels without changing saved account addresses.
 html=html.replaceAll('ozlusuat7@gmail.com','aesdapps.tr@gmail.com');
 const version=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
 html=html.replace('children:"v1.5.1"','children:'+JSON.stringify('v'+version));
 // Use identical readable calculation and quantity rules in browser and server.
 for(const file of ['cost-engine.js','data-integrity.js','finance-guard.js']){
  const source=fs.readFileSync(new URL('../web/'+file,import.meta.url),'utf8');
  const marker=file==='cost-engine.js'?'/* Product cost arithmetic.':file==='data-integrity.js'?'/* Stock quantities and cancellation plans.':'/* Money inputs, payment totals';
  html=html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g,(tag,body)=>body.trimStart().startsWith(marker)?'<script>'+source+'</script>':tag);
 }

 html=html.replace("['adet','lt','ml','gr'].includes(item.unit)","['adet','parca','lt','ml','gr'].includes(item.unit)");
 html=html.replace("costRecipe:lines,costExtra:extra}","costRecipe:lines,costExtra:extra,recipeStock:input.recipeStock===undefined?row.recipeStock:input.recipeStock===true}");
 if(!html.includes('data-aesd-recipe-editor')){
  const first=html.indexOf('function OSESCostPage('),last=html.indexOf('\nfunction ',first+25);
  if(first<0||last<first)throw Error('The recipe page was not found.');
  html=html.slice(0,first)+fs.readFileSync(new URL('./private-recipe-ui.js',import.meta.url),'utf8')+html.slice(last);
 }
 // Replace these screens from readable sources. Preserve the legacy state store.
 if(!html.includes('data-aesd-ledger-ui')){
  const screens=[['function zQ(', 'var Fl=', 'private-stock-ui.js'],['function UQ(', 'function AESDLegacyContents(', 'private-account-ui.js']];
  for(const [start,end,file] of screens){
   const first=html.indexOf(start),last=html.indexOf(end,first+start.length);
   if(first<0||last<first)throw Error('The private stock or account screen was not found.');
   html=html.slice(0,first)+fs.readFileSync(new URL('./'+file,import.meta.url),'utf8')+'\n'+html.slice(last);
  }
  const first=html.indexOf('_A=Kt.useCallback((id,type,amount,note)=>'),last=html.indexOf('IA=Kt.useCallback',first);
  if(first<0||last<first)throw Error('The private customer transaction handler was not found.');
  html=html.slice(0,first)+`_A=Kt.useCallback((id,type,amount,note,method,reverseOf)=>{
   const state=osesLive.current;
   if(!Vn(state.auth?.role,'debt')||!state.settings.debtPermission){w('Cari işlem yetkiniz yok','err');return false;}
   try{const next=window.AESDPrivateAccounts.post(state,{customerId:id,type,amount,note,method,reverseOf},{transactionId:cn('tx_'),cashId:cn('cash_'),date:new Date().toISOString()});vA(next);return true;}
   catch(e){w(e.message,'warn');return false;}
  },[w]),`+html.slice(last);
  html=html.replace('</head>','<script data-aesd-ledger-ui src="./private-account-rules.js"></script><link rel="stylesheet" href="./private-account-stock.css"></head>');
 }
 html=html.replace('{id:"ayarlar",label:"Ayarlar",','{id:"ayarlar",label:"Yedek ve İşletme",').replace('title:"Ayarlar",onMenu:', 'title:"Yedek ve İşletme",onMenu:');
 const old='function CQ({children:uA}){const[AA,vA]=Kt.useState(QQ)';
 const replacement="function osesCentralState(value){try{const identity=window.parent!==window&&window.parent.aesdOwnerIdentity?.();if(identity?.role==='Yönetici')return {...value,auth:{name:identity.name,role:'Yönetici'},rememberAuth:false};}catch{}return value;}function CQ({children:uA}){const[AA,vA]=Kt.useState(()=>osesCentralState(QQ()))";
 html=html.replace(old,replacement)
  .replace('if(TA)vA(Fg(TA));','if(TA)vA(osesCentralState(Fg(TA)));')
  .replace('if(uA.role==="Yönetici"&&AA.mustChangePassword)','if(uA.role==="Yönetici"&&AA.mustChangePassword&&!window.parent.aesdOwnerIdentity?.())')
  .replace('if(!AA.auth||AA.rememberAuth)return;','if(!AA.auth||AA.rememberAuth||window.parent.aesdOwnerIdentity?.())return;')
  .replace('type:"AESD_OPEN_SETTINGS"','type:"AESD_OPEN_MENU"')
  .replace('window.parent.postMessage({type:"AESD_OPEN_MENU"},location.origin)','window.parent.postMessage({type:"AESD_OPEN_MENU"},window.parent.location.origin)');
 if(!html.includes('id="aesd-cloud-private"')){
  html=html.replace('</head>',`<style id="aesd-cloud-private">#aesd-private-sync~div[hidden]{display:none!important}</style><script src="./private-cloud.js"></script></head>`)
   .replace('const[AA,vA]=Kt.useState(()=>osesCentralState(QQ()))','const[AA,osesSetState]=Kt.useState(()=>osesCentralState(QQ()))')
   .replace('const osesLive=Kt.useRef(AA);',`const osesCloudBridge=Kt.useRef(null);function vA(update){const bridge=osesCloudBridge.current;if(bridge?.active)return bridge.set(update);osesSetState(update);}const osesCloudWrap=fn=>(...args)=>osesCloudBridge.current?.active?osesCloudBridge.current.run(fn,args):fn(...args);const osesLive=Kt.useRef(AA);`)
   .replace('const dA=cn("t_");s(et=>', 'if(osesCloudBridge.current?.defer(()=>w(JA,TA)))return;const dA=cn("t_");s(et=>')
   .replace('m=Kt.useCallback(()=>{XA([]),C(0),i(null),E(null)}', 'm=Kt.useCallback(()=>{if(osesCloudBridge.current?.defer(()=>{XA([]),C(0),i(null),E(null)}))return;XA([]),C(0),i(null),E(null)}')
   .replace('},[u,w]),At={...AA,',`},[u,w]);Kt.useEffect(()=>{if(!u||!window.AESDPrivateConnect||osesCloudBridge.current)return;window.AESDPrivateConnect({get:()=>osesLive.current,apply:value=>{const next=osesCentralState(value);osesLive.current=next;osesSetState(next);},bind:bridge=>{osesCloudBridge.current=bridge;},error:message=>{s(rows=>[...rows,{id:cn('t_'),msg:message,kind:'err'}]);},unlock:()=>{osesPayLock.current=false;},clearCart:()=>{XA([]);C(0);i(null);E(null);}});},[u]);const At={...AA,`)
   .replace('_=yA=>{c(yA,h)&&', '_=async yA=>{await c(yA,h)&&');
  html=html.replace('function CQ(',`function osesVerifyAdmin(password,salt,hash){if(window.parent.aesdOwnerIdentity?.()?.role==='Yönetici'&&window.parent.aesdVerifyOwnerPassword)return window.parent.aesdVerifyOwnerPassword(password);return ca(password,salt,hash);}function CQ(`);
  const begin=html.indexOf('function CQ('),end=html.indexOf('function ri(',begin);const stop=end>begin?end:html.indexOf('function ',html.indexOf('OSESRecovery.bind',begin));const scope=html.slice(begin,stop);html=html.slice(0,begin)+scope.replace(/ca\((\w+),AA\.security\.salt,AA\.security\.passwordHash\)/g,'osesVerifyAdmin($1,AA.security.salt,AA.security.passwordHash)')+html.slice(stop);
  const callbacks={recordPurchase:'osesRecordPurchase',saveCostRecipe:'osesSaveCostRecipe',checkout:'tA',cancelSale:'H',saveOrder:'_',upsertProduct:'CA',deleteProduct:'yA',upsertCustomer:'pA',deleteCustomer:'PA',addCustomerTxn:'_A',addStock:'IA',removeStock:'q',upsertStock:'oA',deleteStock:'osesDeleteStock',upsertStaff:'sA',deleteStaff:'NA',updateSettings:'mA',cashEntry:'xA',cashExit:'T',closeRegister:'BA',openRegister:'nA',switchRegister:'x'};
  for(const [key,value]of Object.entries(callbacks))html=html.replace(key+':'+value+',',key+':osesCloudWrap('+value+'),');
  // A shared ledger cannot be replaced by an old device backup.
  html=html.replace('importBackup:rA,restoreLastImportBackup:hA,resetAllData:OA,',`importBackup:(...args)=>{if(osesCloudBridge.current?.active){w('Ortak kayıt üzerine eski yedek yüklenemez. Yerel aktarım yedeği korunur.','err');return false;}return rA(...args);},restoreLastImportBackup:(...args)=>{if(osesCloudBridge.current?.active)return false;return hA(...args);},resetAllData:(...args)=>{if(osesCloudBridge.current?.active){w('Ortak kayıtlar bu cihazdan silinemez.','err');return false;}return OA(...args);},`);
 }
 if(!html.includes('id="aesd-light-private"'))html=html.replace('</head>','<style id="aesd-light-private">.aesd-private-revenue>div{background:white;border:1px solid #e4e7ee;color:#172238;box-shadow:0 3px 12px #18223805}.aesd-private-revenue>div:first-child{background:linear-gradient(115deg,#fff5f4,white);border-color:#f5cfcc}.aesd-private-revenue span,.aesd-private-revenue small{color:#667085}.aesd-private-revenue>div:first-child strong{color:#ed1c24}.oses-menu-button{display:flex!important}</style></head>');
 if(!html.includes('id="aesd-private-menu-release"')){
  html=html.replace('</head>','<script id="aesd-private-menu-release" src="./private-menu.js"></script><link rel="stylesheet" href="./private-theme.css"></head>')
   .replace('function osesCentralState(value){try{','function osesCentralState(value){value=window.AESDPrivateMenu?.apply(value)||value;try{')
   .replace('const osesCloudWrap=fn=>(...args)=>osesCloudBridge.current?.active?osesCloudBridge.current.run(fn,args):fn(...args);','const osesCloudWrap=(fn,kind="change")=>(...args)=>osesCloudBridge.current?.active?osesCloudBridge.current.run(fn,args,kind):fn(...args);')
   .replace('checkout:osesCloudWrap(tA),','checkout:osesCloudWrap(tA,"sale"),')
   .replace('))),[vA,o,d]),c=Kt.useMemo','))).sort((a,b)=>(window.AESDPrivateMenu?.photo(a)??99)-(window.AESDPrivateMenu?.photo(b)??99)),[vA,o,d]),c=Kt.useMemo')
   .replace('o==="Tümü"&&!d&&j.jsxs("div",','o==="Tümü"&&!d&&c.some(p=>C.some(s=>s.status!=="cancelled"&&s.items.some(i=>i.productId===p.id)))&&j.jsxs("div",')
   .replace('W0=["Dürümler","Porsiyonlar",','W0=["Dürümler","Paketler","Porsiyonlar",');
  const start=html.indexOf('function OSESProductPhoto('),end=html.indexOf('\nfunction ',start);
  if(start<0||end<start)throw Error('The private photo component was not found.');
  html=html.slice(0,start)+`function OSESProductPhoto({p,compact=false}){const tile=window.AESDPrivateMenu?.photo(p)??null;return j.jsx("span",{role:"img","aria-label":p.name+" ürün görseli",className:compact?"oses-product-photo oses-product-photo-small":"oses-product-photo",style:tile===null?{}:{backgroundImage:'url("./private-products-20261008.png")',backgroundSize:'300% 300%',backgroundPosition:\`\${(tile%3)*50}% \${Math.floor(tile/3)*50}%\`},children:tile===null?p.emoji:null});}`+html.slice(end);
  html=html.replace('children:uA.name}),j.jsx("span",{className:"text-sm font-extrabold text-[#ed1c24]"','children:uA.name}),uA.gramUsage>0&&j.jsx("small",{className:"aesd-product-grams",children:uA.gramUsage+" gr"}),j.jsx("span",{className:"text-sm font-extrabold text-[#ed1c24]"');
 }
 // Group scrollable cart details. The web CSS keeps totals and actions visible.
 if(!html.includes('className:"aesd-web-cart-stack ')){
  const start=html.indexOf('function IQ('),end=html.indexOf('function ',start+12);
  if(start<0||end<start)throw Error('The private cart component was not found.');
  let cart=html.slice(start,end);
  const root='return j.jsxs("div",{className:"flex h-full flex-col",children:[',totals=',j.jsxs("div",{className:"space-y-1.5 border-t border-slate-100 px-4 py-3 text-sm"',actions='className:"space-y-2 border-t border-slate-100 p-3"';
  if(!cart.includes(root)||!cart.includes(totals)||!cart.includes(actions))throw Error('The private cart layout was not found.');
  cart=cart.replace(root,'return j.jsxs("div",{className:"aesd-web-cart-stack flex h-full flex-col",children:[j.jsxs("div",{className:"aesd-web-cart-scroll",children:[')
   .replace(totals,']}),j.jsxs("div",{className:"aesd-web-cart-totals space-y-1.5 border-t border-slate-100 px-4 py-3 text-sm"')
   .replace(actions,'className:"aesd-web-cart-actions space-y-2 border-t border-slate-100 p-3"');
  html=html.slice(0,start)+cart+html.slice(end);
 }
 // Apply this component update to both original and previously patched files.
 const photoStart=html.indexOf('function OSESProductPhoto('),photoEnd=html.indexOf('\nfunction ',photoStart);
 if(photoStart<0||photoEnd<photoStart)throw Error('The private photo component was not found.');
 html=html.slice(0,photoStart)+`function OSESProductPhoto({p,compact=false}){const tile=window.AESDPrivateMenu?.photo(p)??null,fallback=tile===null;return j.jsx("span",{role:"img","aria-label":p.name+(fallback?" ürün simgesi":" ürün görseli"),className:"oses-product-photo"+(compact?" oses-product-photo-small":"")+(fallback?" oses-product-photo-fallback":""),style:fallback?{}:{backgroundImage:'url("./private-products-20261008.png")',backgroundSize:'300% 300%',backgroundPosition:\`\${(tile%3)*50}% \${Math.floor(tile/3)*50}%\`},children:fallback?p.emoji||"🍽️":null});}`+html.slice(photoEnd);
 if(!html.includes('id="aesd-unified-appearance"'))html=html.replace('</head>','<link id="aesd-unified-appearance" rel="stylesheet" href="./appearance.css"><link rel="stylesheet" href="./private-appearance.css"></head>');
 if(!html.includes('id="aesd-workspace-private"'))html=html.replace('</head>','<link id="aesd-workspace-private" rel="stylesheet" href="./workspace-private.css"></head>');
 // Keep the existing protected checkout and its atomic/durable acknowledgement.
 // Only its user-facing confirmation step is replaced by a readable component.
 if(!html.includes('data-aesd-private-payment')){
  const start=html.indexOf('function IQ('),end=html.indexOf('function ',start+12);
  if(start<0||end<start)throw Error('The private checkout screen was not found.');
  let cart=html.slice(start,end);
  const handler='_=async yA=>{await c(yA,h)&&(M(!1),z(!1),D({Nakit:"",Kart:"",Diğer:"",Veresiye:""}),t(""))}';
  if(!cart.includes(handler))throw Error('The protected checkout acknowledgement was not found.');
  cart=cart.replace('[h,t]=Kt.useState("")','[aesdPayment,setAESDPayment]=Kt.useState(null),[h,t]=Kt.useState("")')
   .replace(handler,'_=yA=>{M(!1);setAESDPayment(yA);}')
   .replace('return j.jsxs("div",{className:"aesd-web-cart-stack flex h-full flex-col",children:[',
    'const aesdCommit=async rows=>{const ok=await c(rows,h);if(ok){setAESDPayment(null);M(false);z(false);D({Nakit:"",Kart:"",Diğer:"",Veresiye:""});t("");}return ok;};return j.jsxs("div",{className:"aesd-web-cart-stack flex h-full flex-col",children:[j.jsx(AESDPrivatePayment,{request:aesdPayment,customer:I?.name,onConfirm:aesdCommit,onClose:()=>{setAESDPayment(null);M(true);}}),');
  if(!cart.includes('onConfirm:aesdCommit'))throw Error('The protected payment review was not attached.');
  html=html.slice(0,start)+fs.readFileSync(new URL('./private-payment-ui.js',import.meta.url),'utf8')+'\n'+cart+html.slice(end);
 }
 if(!html.includes('data-aesd-stock-workspace')){
  const workspace=fs.readFileSync(new URL('./private-workspace-ui.js',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('./private-ready-ui.js',import.meta.url),'utf8');
  html=html.replace('function zQ(',workspace+'\nfunction zQ(');
  const oldRoutes='o==="urunler"&&j.jsx(pQ,{onMenu:d}),o==="cari"&&j.jsx(UQ,{onMenu:d}),o==="stok"&&j.jsx(zQ,{onMenu:d,onNavigate:e}),o==="maliyet"&&j.jsx(OSESCostPage,{onMenu:d})';
  if(!html.includes(oldRoutes))throw Error('The stock workspace routes were not found.');
  html=html.replace(oldRoutes,'["stok","urunler","maliyet"].includes(o)&&j.jsx(AESDStockWorkspace,{onMenu:d,initialTab:o}),o==="cari"&&j.jsx(UQ,{onMenu:d})');
  html=html.replace('</head>','<script id="aesd-workflow-rules">'+fs.readFileSync(new URL('../web/private-workflow.js',import.meta.url),'utf8')+'</script></head>');
  const marker='const At={...AA,';
  if(!html.includes(marker))throw Error('The durable store context was not found.');
  html=html.replace(marker,`const aesdWorkflow=(kind,input)=>{
   const state=osesLive.current,needsStock=kind==='stock'||kind==='ready'||kind==='ingredients',needsProducts=kind!=='stock'||input.operation==='purchase';
   if(needsStock&&!Vn(state.auth?.role,'stock')||needsProducts&&!Vn(state.auth?.role,'products')){w('Bu işlem için yetkiniz yok.','err');return false;}
   try{const wf=window.AESDPrivateWorkflow,date=new Date().toISOString();
    const next=kind==='ingredients'?wf.ingredients(state,input,{id:cn('m_'),date,actor:state.auth?.name}):kind==='ready'?wf.ready(state,input,{id:cn('m_'),purchaseId:cn('buy_'),date,actor:state.auth?.name}):kind==='stock'?wf.stock(state,input,{id:cn('m_'),purchaseId:cn('buy_'),date,actor:state.auth?.name}):kind==='product'?wf.product(state,input):wf.recipe(state,input,date);
    vA(next);return true;
   }catch(error){w(error.message||'İşlem kaydedilmedi.','warn');throw error;}
  };const At={...AA,workflowIngredients:osesCloudWrap(input=>aesdWorkflow('ingredients',input)),workflowReady:osesCloudWrap(input=>aesdWorkflow('ready',input)),workflowStock:osesCloudWrap(input=>aesdWorkflow('stock',input)),workflowProduct:osesCloudWrap(input=>aesdWorkflow('product',input)),workflowRecipe:osesCloudWrap(input=>aesdWorkflow('recipe',input)),`);
  html=html.replace('const listener=event=>{if(event.source!==window.parent||event.data?.type!=="AESD_PRIVATE_NAVIGATE")return;', 'const listener=async event=>{if(event.source!==window.parent||event.origin!==window.parent.location.origin||event.data?.type!=="AESD_PRIVATE_NAVIGATE")return;if(!(await(window.aesdConfirmDraftNavigation?.()??Promise.resolve(true))))return;');
  html=html.replace('e=i=>{const a=i;L0[a]&&!vA(L0[a])||XA(a)}','e=async i=>{if(!(await(window.aesdConfirmDraftNavigation?.()??Promise.resolve(true))))return;const a=i;if(!L0[a]||vA(L0[a])){window.aesdStockOpen?.(a);XA(a);}}');
  html=html.replace('includes(page))XA(page);','includes(page)){window.aesdStockOpen?.(page);XA(page);}')
  html=html.replace('{id:"maliyet",label:"Ürün Maliyeti",icon:"wallet",permission:"products"},','');
  html=html.replace('children:uA.gramUsage+" gr"','children:(uA.netGrams??uA.gramUsage)+" gr"');
  html=html.replace('function Du({p:uA,onAdd:AA,featured:vA}){return j.jsxs("button",{onClick:AA,','function Du({p:uA,onAdd:AA,featured:vA}){const aesdReadyStock=ri().stock.find(m=>m.id===uA.readyStockId);return j.jsxs("button",{disabled:uA.recipeReviewRequired===true||uA.productKind==="ready"&&(!aesdReadyStock||aesdReadyStock.gram<1),"data-recipe-pending":uA.recipeReviewRequired===true,"aria-label":uA.name+(uA.recipeReviewRequired?" · Reçete kontrolü gerekli":""),onClick:AA,');
 }

 if(!html.includes('aesd-simple-ingredients-cart')){
  html=html.replace('</head>','<style id="aesd-simple-ingredients-cart">.aesd-ingredient-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid #e5ece7}.aesd-ingredient-toggle input{width:24px;height:24px;accent-color:#00843f}</style></head>');
  const start=html.indexOf('v=Kt.useCallback(JA=>{Vn(AA.auth?.role,"sales")'),end=html.indexOf('m=Kt.useCallback',start);
  if(start<0||end<start)throw Error('The protected cart handlers were not found.');
  html=html.slice(0,start)+`v=Kt.useCallback((JA,options={})=>{if(!Vn(AA.auth?.role,"sales"))return;let extra={};if(JA.simpleIngredients){const omitted=[...(options.omitted||[])].sort(),revision=options.ingredientRevision??JA.simpleIngredients.revision;window.AESDPrivateWorkflow.selected(JA,{omitted,ingredientRevision:revision},AA.stock);extra={omitted,ingredientRevision:revision,lineKey:JA.id+':'+revision+':'+omitted.join(',')};}const key=extra.lineKey||JA.id;XA(TA=>TA.some(et=>(et.lineKey||et.productId)===key)?TA.map(et=>(et.lineKey||et.productId)===key?{...et,qty:et.qty+1}:et):[...TA,{productId:JA.id,name:JA.name,price:JA.price,listPrice:JA.price,qty:1,emoji:JA.emoji,...extra}]);},[AA.auth?.role,AA.stock]),D=Kt.useCallback(JA=>XA(TA=>TA.map(dA=>(dA.lineKey||dA.productId)===JA?{...dA,qty:dA.qty+1}:dA)),[]),Y=Kt.useCallback(JA=>XA(TA=>TA.flatMap(dA=>(dA.lineKey||dA.productId)===JA?dA.qty>1?[{...dA,qty:dA.qty-1}]:[]:[dA])),[]),U=Kt.useCallback(JA=>XA(TA=>TA.filter(dA=>(dA.lineKey||dA.productId)!==JA)),[]),`+html.slice(end);
  html=html.replace('Mt.productId===JA','(Mt.lineKey||Mt.productId)===JA');
  const saleItem='productId:Ft.productId,name:Ft.name,price:Ft.price,listPrice:Ft.listPrice,qty:Ft.qty,emoji:Ft.emoji';
  if(!html.includes(saleItem))throw Error('The protected sale item projection was not found.');
  html=html.replace(saleItem,saleItem+',...(Ft.ingredientRevision!==undefined?{omitted:Ft.omitted||[],ingredientRevision:Ft.ingredientRevision,lineKey:Ft.lineKey}:{})');

  const begin=html.indexOf('function IQ('),stop=html.indexOf('function ',begin+12);let cart=html.slice(begin,stop);
  for(const handler of ['vA','AA','DA','osesPrice'])cart=cart.replaceAll(handler+'(yA.productId',handler+'((yA.lineKey||yA.productId)');
  cart=cart.replaceAll('},yA.productId)', '},(yA.lineKey||yA.productId))');
  cart=cart.replace('children:yA.name})','children:yA.name}),yA.omitted?.length>0&&j.jsx("small",{children:"Çıkarılan: "+yA.omitted.map(r=>window.AESDPrivateWorkflow.roles[r]?.[0]||r).join(", ")})');
  html=html.slice(0,begin)+cart+html.slice(stop);
  html=html.replace('const aesdReadyStock=ri().stock.find(m=>m.id===uA.readyStockId);return j.jsxs("button",{','const aesdReadyStock=ri().stock.find(m=>m.id===uA.readyStockId),[aesdPicker,setAESDPicker]=Kt.useState(false);return j.jsxs(j.Fragment,{children:[aesdPicker&&j.jsx(AESDIngredientPicker,{product:uA,onClose:()=>setAESDPicker(false)}),j.jsxs("button",{');
  const ds=html.indexOf('function Du('),de=html.indexOf('function ',ds+12);let card=html.slice(ds,de);card=card.replace('onClick:AA,','onClick:()=>uA.simpleIngredients?setAESDPicker(true):AA(),');const ending=card.lastIndexOf('})}');if(ending<0)throw Error('The private product card ending was not found.');card=card.slice(0,ending)+'})]})}'+card.slice(ending+3);html=html.slice(0,ds)+card+html.slice(de);
 }

 // The legacy reset control must open the authenticated, revision-bound flow.
 // It must never announce success from a rejected local reset.
 if(!html.includes('data-aesd-safe-reset-link')){
  const legacy='onClick:()=>{confirm("Tüm işletme verileri sıfırlanacak. Emin misiniz?")&&(u(),XA("İşletme verileri sıfırlandı","ok"))}';
  if(!html.includes(legacy))throw Error('The legacy reset control was not found.');
  html=html.replace(legacy,`"data-aesd-safe-reset-link":true,disabled:!!window.AESDShopManager,onClick:async()=>{if(window.AESDShopManager){XA('Yalnız ana yönetici kendi işletmesini sıfırlayabilir.','warn');return;}if(window.parent!==window){window.parent.postMessage({type:'AESD_OPEN_BUSINESS_RESET'},window.parent.location.origin);return;}XA('Güvenli sıfırlama için AESD ana uygulamasını yönetici hesabıyla aç.','warn');}`);
 }
 // A protected manager frame never creates a second local administrator account.
 if(!html.includes('function aesdManagerSession(')){
  html=html.replace('function CQ(',`function aesdManagerSession(){try{if(window.parent===window||window.parent.aesdOwnerAllowed?.()!==true)return null;const identity=window.parent.aesdOwnerIdentity?.();return identity?.role==='Yönetici'?identity:null;}catch{return null;}}function CQ(`);
  html=html.replace('osesLive.current=AA;Kt.useEffect(()=>{let JA=!0;',`osesLive.current=AA;Kt.useEffect(()=>{if(!window.AESDShopManager)return;const sync=()=>{const identity=aesdManagerSession();osesSetState(value=>({...value,auth:identity?{name:identity.name,role:'Yönetici'}:null,rememberAuth:false}));};window.addEventListener('aesd-central-session',sync);sync();return()=>window.removeEventListener('aesd-central-session',sync);},[]);Kt.useEffect(()=>{let JA=!0;`);
  html=html.replace('if(!u||!window.AESDPrivateConnect||osesCloudBridge.current)return;','if(!u||!window.AESDPrivateConnect||osesCloudBridge.current||window.AESDShopManager&&!aesdManagerSession())return;').replace('},[u]);const aesdWorkflow=','},[u,AA.auth]);const aesdWorkflow=');
  html=html.replace('if(!u||osesSetupLock.current||!current.security.setupRequired','if(window.AESDShopManager||!u||osesSetupLock.current||!current.security.setupRequired');
  html=html.replace('if(!uA)return j.jsxs(j.Fragment,{children:[j.jsx(vQ,{}),j.jsx(K0,{})]});',`if(window.AESDShopManager&&(!uA||!aesdManagerSession()))return j.jsxs("main",{className:"flex min-h-[70dvh] items-center justify-center p-6",children:[j.jsxs("section",{role:"status",children:[j.jsx("h1",{children:"Dükkân oturumu doğrulanıyor"}),j.jsx("p",{children:"Yeni şifre oluşturma. Mevcut AESD hesabının bağlantısını kontrol et."}),j.jsx("button",{type:"button",className:"oses-gradient rounded-xl p-4",onClick:()=>window.parent.postMessage({type:"AESD_RECHECK_PRIVATE"},window.parent.location.origin),children:"Tekrar doğrula"})]})]});if(!uA)return j.jsxs(j.Fragment,{children:[j.jsx(vQ,{}),j.jsx(K0,{})]});`);
 }
 return html;
}
let cached=null;
export function readPrivateTemplate(file){
 const stat=fs.statSync(file),key=file+':'+stat.mtimeMs+':'+stat.size;
 if(cached?.key!==key)cached={key,html:patchPrivateTemplate(fs.readFileSync(file,'utf8'))};
 return cached.html;
}
