/* Review only. The existing protected checkout performs all durable writes. */
function AESDPrivatePayment({request,customer,onConfirm,onClose}){
 const [received,setReceived]=Kt.useState(''),[error,setError]=Kt.useState(''),[busy,setBusy]=Kt.useState(false);
 const lock=Kt.useRef(false),store=ri();
 Kt.useEffect(()=>{setReceived('');setError('');},[request]);
 if(!request)return null;
 const cash=Math.round(request.filter(x=>x.method==='Nakit').reduce((n,x)=>n+x.amount,0)*100);
 const total=Math.round(request.reduce((n,x)=>n+x.amount,0)*100);
 const raw=received.replace(',','.'),valid=/^\d+(?:\.\d{1,2})?$/.test(raw),taken=valid?Math.round(Number(raw)*100):NaN;
 const close=()=>{if(!lock.current)onClose();};
 const confirm=async()=>{
  if(lock.current)return;
  if(cash&&(!Number.isSafeInteger(taken)||taken<cash)){setError('Alınan nakit, nakit ödeme tutarından az olamaz.');return;}
  lock.current=true;setBusy(true);setError('');
  try{const ok=await onConfirm(request);if(!ok)setError('Kayıt tamamlanmadı. Bağlantı ve işlem sonucunu kontrol et.');}
  catch(e){setError(e.message||'Ödeme tamamlanmadı. Sonucu kontrol et.');}
  finally{lock.current=false;setBusy(false);}
 };
 let contentUsage=[],contentCost=null;try{if(store.cart.some(item=>store.products.find(p=>p.id===item.productId)?.simpleIngredients)){contentUsage=window.OSESFinance.doughUsage(store.cart,store.products,store.stock);contentCost=window.OSESCost.sale(store.cart,store.products,store.stock,total/100);}}catch{}
 const line=(label,value,large=false)=>j.jsxs('div',{className:'aesd-payment-row'+(large?' aesd-payment-total':''),children:[j.jsx('span',{children:label}),j.jsx('strong',{children:value})]},label);
 return j.jsx(Na,{open:true,onClose:close,title:'Ödeme özeti',children:j.jsxs('section',{'data-aesd-private-payment':true,className:'aesd-payment-review',children:[
  line('Toplam',ae(total/100),true),contentCost?j.jsxs('section',{className:'aesd-payment-stock',children:[j.jsx('strong',{children:'Stoktan düşecek'}),...contentUsage.map(u=>line(u.stockName,u.amount+' '+(u.unit==='parca'?'parça':u.unit))),line('Tahmini maliyet',contentCost.estimatedCost===null?'Alış bilgisi eksik':ae(contentCost.estimatedCost)),j.jsx('small',{children:'Dahil olmayanlar: '+contentCost.estimatedCostExcluded.join(', ')+'. Sebze kg stokları elle takip edilir. Stok yalnız satış onaylanınca düşer.'})]}):null,...request.map(p=>line(p.method,ae(p.amount))),
  request.some(x=>x.method==='Veresiye')?line('Cari hesap',customer||'Seçili cari'):null,
  cash?j.jsxs(j.Fragment,{children:[j.jsxs('label',{children:['Alınan nakit (TL)',j.jsx('input',{name:'aesd-received',inputMode:'decimal',autoComplete:'off',placeholder:'0,00',value:received,disabled:busy,onChange:e=>setReceived(e.target.value)})]}),j.jsxs('div',{className:'aesd-payment-change',role:'status',children:[j.jsx('span',{children:'Para üstü'}),j.jsx('strong',{children:valid&&taken>=cash?ae((taken-cash)/100):'—'})]})]}):null,
  j.jsx('small',{children:'Kart seçimi ödeme kaydıdır; karttan para çekmez. Kayıt, mevcut güvenli depolama işlemi onayladıktan sonra tamamlanır.'}),
  error?j.jsx('p',{className:'aesd-payment-error',role:'alert',children:error}):null,
  j.jsxs('footer',{className:'aesd-payment-actions',children:[j.jsx('button',{type:'button',disabled:busy,onClick:close,children:'Geri dön'}),j.jsx('button',{type:'button',className:'primary',disabled:busy,onClick:confirm,children:busy?'Kaydediliyor…':'Ödemeyi onayla'})]})
 ]})});
}
