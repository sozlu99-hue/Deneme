/* Ready goods: one authenticated, atomic quantity and price form. */
function AESDReadyForm({product,mode,onBack,bindDraft}){
 const store=ri(),w=window.AESDPrivateWorkflow;
 const oldLines=product?window.OSESCost.recipe(product,store.stock):[];
 const oldLink=product&&!product.productKind&&oldLines.length===1&&Number(oldLines[0].amount)===1&&oldLines[0].unit==='adet'?oldLines[0].stockId:null;
 const linked=store.stock.find(m=>m.id===product?.readyStockId)||store.stock.find(m=>m.id===oldLink&&m.unit==='adet'&&!store.products.some(p=>p.productKind==='ready'&&p.readyStockId===m.id));
 const [draft,setDraft]=Kt.useState(()=>({productId:product?.id||cn('p_'),stockId:linked?.id||cn('ready_'),name:product?.name||'',quantity:'',expectedQty:linked?.gram||0,unitCost:String(linked?.costing?.unitCost!==undefined?window.OSESCost.round(linked.costing.unitCost):product?.readyInitialCost??product?.cost??''),salePrice:String(product?.price??''),packageAmount:String(product?.packageAmount??''),packageUnit:product?.packageUnit||'ml',mode:product?.productKind==='ready'?mode:product?'convert':'create'}));
 const [cases,setCases]=Kt.useState(''),[perCase,setPerCase]=Kt.useState(''),[error,setError]=Kt.useState(''),[busy,setBusy]=Kt.useState(false);
 const lock=Kt.useRef(false),dirty=Kt.useRef(false);
 Kt.useEffect(()=>{bindDraft(()=>dirty.current,()=>{dirty.current=false;});return()=>bindDraft(()=>false,()=>{});},[]);
 const material=store.stock.find(m=>m.id===draft.stockId),editing=draft.mode==='edit';
 const patch=values=>{dirty.current=true;setDraft(d=>({...d,...values}));setError('');};
 const pack=(a,b)=>{setCases(a);setPerCase(b);if(Number.isSafeInteger(Number(a))&&Number(a)>0&&Number.isSafeInteger(Number(b))&&Number(b)>0)patch({quantity:String(Number(a)*Number(b))});};
 const save=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const input={...draft,quantity:editing?0:draft.quantity===''&&draft.mode==='convert'?0:draft.quantity};const ok=await store.workflowReady(input);if(ok){dirty.current=false;onBack();store.toast('Kaydedildi.','ok');}else setError('Kayıt onaylanmadı. Güncel stoğu kontrol et.');}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}};
 const field=(label,value,fn,props={})=>aesdField(label,value,fn,{disabled:busy,...props});
 const qty=Number(draft.quantity),total=window.OSESCost.round(qty*Number(draft.unitCost));
 return aesdH('main',{className:'aesd-ledger-content aesd-ready-form'},aesdButton('‹ Ürün ve Stoğa dön',onBack,false,busy),aesdH('div',{className:'aesd-simple-heading'},aesdNote('HAZIR ÜRÜN'),aesdH('h1',{},draft.mode==='purchase'?product.name+' · Stok ekle':editing?'Ürünü düzenle':'Hazır ürün ekle'),aesdNote('Reçete yok. Adet ve fiyat aynı yerde.')),
  aesdH('section',{className:'aesd-stock-card aesd-stock-form'},draft.mode!=='purchase'&&field('Ürün adı',draft.name,v=>patch({name:v}),{inputMode:'text',maxLength:100}),
   aesdH('div',{className:'aesd-workflow-fields'},field('Ambalaj hacmi (isteğe bağlı)',draft.packageAmount,v=>patch({packageAmount:v}),{readOnly:product?.packageAmount!==undefined}),aesdChoice('Hacim birimi',draft.packageUnit,v=>patch({packageUnit:v}),[['ml','ml'],['lt','litre']],{disabled:busy||product?.packageAmount!==undefined})),aesdNote('Hacim yalnız ambalaj bilgisidir. Satılan her şişe veya kutu stoktan 1 adet düşer. Farklı hacim için ayrı ürün ekle.'),
   editing?aesdNote('Mevcut stok: '+(material?.gram||0)+' adet. Sayım ve ziyan, Diğer işlemler altındadır.'):field('Kaç adet geldi?',draft.quantity,v=>patch({quantity:v})),
   !editing&&aesdH('details',{},aesdH('summary',{},'Koliyle mi geldi?'),aesdH('div',{className:'aesd-workflow-fields'},field('Koli sayısı',cases,v=>pack(v,perCase)),field('Bir kolide kaç adet?',perCase,v=>pack(cases,v))),aesdNote(cases&&perCase?cases+' koli × '+perCase+' adet = '+(Number(cases)*Number(perCase))+' adet':'Toplam adedi uygulama hesaplar.')),
   field('Bir adet alış fiyatı (TL)',draft.unitCost,v=>patch({unitCost:v}),{readOnly:editing}),
   field('Bir adet satış fiyatı (TL)',draft.salePrice,v=>patch({salePrice:v})),
   draft.mode==='convert'&&aesdH('details',{open:true},aesdH('summary',{},'Önceden kayıtlı stoğu bağla'),aesdNote('Bu ürün için zaten stok girdiysen o kartı seç. Eski miktarı yeni alış gibi tekrar yazma.'),aesdChoice('Kayıtlı adet stoku',material?.id||'',id=>{const m=store.stock.find(m=>m.id===id);patch({stockId:m?.id||cn('ready_'),expectedQty:m?.gram||0,unitCost:String(m?.costing?.unitCost??draft.unitCost)});},[['','Yeni ayrı stok kartı'],...store.stock.filter(m=>m.unit==='adet'&&!store.products.some(p=>p.productKind==='ready'&&p.readyStockId===m.id)).map(m=>[m.id,m.name+' · '+m.gram+' adet'])],{disabled:busy}),material&&aesdNote('Mevcut '+material.gram+' adet korunacak. Alış yoksa gelen adedi boş bırak.')),
   !editing&&qty>0&&Number.isFinite(total)&&aesdH('div',{className:'aesd-step-note'},aesdH('strong',{},qty+' adet eklenecek · Stok '+((material?.gram||0)+qty)+' olacak.'),aesdNote('Toplam alış: '+ae(total))),
   aesdH('p',{role:'alert',className:'aesd-collection-error'},error),aesdH('div',{className:'aesd-simple-save'},aesdButton(busy?'Kaydediliyor…':draft.mode==='purchase'?'Stoğu ekle':'Kaydet',save,true,busy)),aesdNote('Satış tamamlanınca adet düşer. Satış iptal edilirse geri gelir.')));
}
