/* This component runs inside the existing authenticated private React app. */
function UQ({onMenu}){
 const store=ri(),{customers,addCustomerTxn,toast,settings}=store;
 const [newCustomer,setNewCustomer]=Kt.useState(null);
 const [customerId,setCustomerId]=Kt.useState(null),[draft,setDraft]=Kt.useState(null);
 const [amount,setAmount]=Kt.useState(''),[note,setNote]=Kt.useState(''),[method,setMethod]=Kt.useState('Nakit');
 const [review,setReview]=Kt.useState(null),[busy,setBusy]=Kt.useState(false),[error,setError]=Kt.useState('');
 const saving=Kt.useRef(false),selected=customers.find(c=>c.id===customerId),target=customers.find(c=>c.id===draft?.id);
 const totalAlacak=customers.reduce((sum,c)=>sum+c.alacak,0);
 const open=(customer,type,original)=>{setDraft({id:customer.id,type,reverseOf:original?.id});setAmount(original?String(original.amount):'');setNote('');setMethod(original?.method||'Nakit');setReview(null);setError('');};
 const close=()=>{if(!saving.current){setDraft(null);setReview(null);setError('');}};
 const prepare=()=>{
  try{
   const value=window.AESDPrivateAccounts.parseMoney(amount);
   if(!target)throw Error('Müşteri kaydı bulunamadı.');
   if(draft.type==='tahsilat'&&value>target.alacak)throw Error('Tahsilat açık alacağı aşamaz.');
   if(draft.type==='odeme'&&value>target.borc)throw Error('Ödeme mevcut borcu aşamaz.');
   if(draft.type==='alacak'&&note.trim().length<3)throw Error('En az 3 karakter açıklama gir.');
   if(draft.type==='duzeltme')window.AESDPrivateAccounts.post(store,{customerId:draft.id,type:'duzeltme',reverseOf:draft.reverseOf,amount:value,note:note.trim()},{transactionId:crypto.randomUUID(),cashId:crypto.randomUUID(),date:new Date().toISOString()});
   const preview=window.AESDPrivateAccounts.post(store,{customerId:draft.id,type:draft.type,reverseOf:draft.reverseOf,amount:value,note:note.trim(),method},{transactionId:crypto.randomUUID(),cashId:crypto.randomUUID(),date:new Date().toISOString()}).customers.find(c=>c.id===draft.id);
   setReview({amount:value,method,note:note.trim(),alacak:preview.alacak,borc:preview.borc});setError('');
  }catch(e){setError(e.message);}
 };
 const save=async()=>{
  if(saving.current||!review||!draft)return;
  saving.current=true;setBusy(true);setError('');
  try{
   const ok=await addCustomerTxn(draft.id,draft.type,review.amount,review.note,review.method,draft.reverseOf);
   if(ok){setDraft(null);setReview(null);toast(draft.type==='tahsilat'?'Tahsilat kaydedildi':'Cari işlem kaydedildi','ok');}
   else setError('İşlem tamamlanmadı. Güncel bakiyeyi ve bağlantını kontrol et.');
  }catch(e){setError(e.message||'İşlem tamamlanmadı.');}
  finally{saving.current=false;setBusy(false);}
 };
 const button=(label,action,disabled=false,primary=false)=>j.jsx('button',{type:'button',className:'aesd-ledger-button'+(primary?' aesd-ledger-primary':''),onClick:action,disabled,children:label});
 const balances=c=>j.jsx('div',{className:'aesd-account-balances aesd-account-receivable',children:j.jsxs('div',{children:[j.jsx('span',{children:'Müşterinin bize borcu'}),j.jsx('strong',{children:ae(c.alacak)})]})});
 // Existing opposite balances remain accessible without offering new borrowing.
 const previousPayable=c=>c.borc>0&&j.jsxs('section',{className:'aesd-account-previous-payable',children:[j.jsx('h3',{children:'Önceki karşı borç kaydı'}),j.jsxs('p',{children:['Geçmişte müşteriye borç olarak kaydedilen tutar: ',j.jsx('strong',{children:ae(c.borc)}),'. Bu kayıt silinmedi; geçmişini inceleyebilir veya kapatabilirsin.']}),button('Önceki borcu kapat',()=>open(c,'odeme'),!settings.debtPermission)]});
 const transactions=c=>j.jsxs('section',{className:'aesd-account-history',children:[j.jsx('h3',{children:'Hareket geçmişi'}),c.txns.length?c.txns.map(t=>j.jsxs('div',{className:'aesd-account-txn',children:[j.jsxs('div',{children:[j.jsx('strong',{children:({duzeltme:'Düzeltme · Ters kayıt',tahsilat:'Tahsilat',alacak:t.manual?'Manuel borçlandırma':'Veresiye satış',borc:'Borç',odeme:'Ödeme',iptal:'İptal'})[t.type]||t.type}),j.jsx('small',{children:[Ki(t.date),t.method,t.note].filter(Boolean).join(' · ')})]}),j.jsx('strong',{className:['tahsilat','odeme'].includes(t.type)?'aesd-account-collected':'',children:(['tahsilat','odeme'].includes(t.type)?'−':'+')+ae(t.amount)}),(['borc','tahsilat','odeme'].includes(t.type)||t.type==='alacak'&&t.manual===true)&&!c.txns.some(x=>x.type==='duzeltme'&&x.refId===t.id)&&button('Ters kayıtla düzelt',()=>open(c,'duzeltme',t),!settings.debtPermission)]},t.id)):j.jsx('p',{className:'aesd-ledger-muted',children:'Henüz hareket yok.'})]});
 return j.jsxs('div',{className:'aesd-private-accounts flex h-[100dvh] flex-col',children:[
  j.jsx(Rs,{title:'Müşteriler',onMenu}),
  j.jsxs('main',{className:'aesd-ledger-content',children:[button('+ Müşteri ekle',()=>setNewCustomer({id:cn('customer_'),name:'',phone:''}),false,true),
   j.jsxs('div',{className:'aesd-account-totals',children:[j.jsxs('div',{children:[j.jsx('span',{children:'Toplam müşteri borcu'}),j.jsx('strong',{children:ae(totalAlacak)})]}),j.jsxs('div',{children:[j.jsx('span',{children:'Müşteri sayısı'}),j.jsx('strong',{children:customers.length})]})]}),
   j.jsx('div',{className:'aesd-account-list',children:customers.length?customers.map(c=>j.jsxs('section',{className:'aesd-account-row','data-customer-id':c.id,children:[
    j.jsxs('button',{type:'button',className:'aesd-account-open',onClick:()=>setCustomerId(c.id),children:[j.jsx('span',{className:'aesd-account-avatar',children:(c.name||'M').trim().slice(0,1).toLocaleUpperCase('tr-TR')}),j.jsxs('span',{children:[j.jsx('strong',{children:c.name}),j.jsx('small',{children:c.phone||'Müşteri hesabı'})]})]}),balances(c),
    j.jsxs('div',{className:'aesd-account-actions',children:[button('Tahsilat al',()=>open(c,'tahsilat'),!settings.debtPermission||c.alacak<=0,true),button('Borç yaz',()=>open(c,'alacak'),!settings.debtPermission)]})
   ]},c.id)):j.jsx('p',{className:'aesd-ledger-muted',children:'Henüz müşteri hesabı yok.'})})
  ]}),
  j.jsx(Na,{open:!!newCustomer,onClose:()=>{if(!saving.current)setNewCustomer(null);},title:'Yeni müşteri hesabı',children:newCustomer&&j.jsxs('div',{className:'aesd-stock-form',children:[j.jsxs('label',{className:'aesd-ledger-field',children:['Müşteri adı',j.jsx('input',{value:newCustomer.name,onChange:e=>setNewCustomer({...newCustomer,name:e.target.value}),maxLength:100})]}),j.jsxs('label',{className:'aesd-ledger-field',children:['Telefon (isteğe bağlı)',j.jsx('input',{value:newCustomer.phone,inputMode:'tel',onChange:e=>setNewCustomer({...newCustomer,phone:e.target.value}),maxLength:40})]}),j.jsx('p',{className:'aesd-ledger-muted',children:'Başlangıç bakiyesi sıfırdır. Borç ve alacakları açıklamalı hareket olarak ayrıca ekle.'}),button('Müşteriyi kaydet',async()=>{if(saving.current||!newCustomer.name.trim())return;saving.current=true;setBusy(true);try{const result=await store.upsertCustomer({...newCustomer,name:newCustomer.name.trim()});if(result!==false)setNewCustomer(null);}finally{saving.current=false;setBusy(false);}},busy,true)]})}),
  j.jsx(Na,{open:!!selected&&!draft,onClose:()=>setCustomerId(null),title:selected?.name||'',wide:true,children:selected&&j.jsxs('div',{className:'aesd-account-detail',children:[balances(selected),button('Tahsilat al',()=>open(selected,'tahsilat'),!settings.debtPermission||selected.alacak<=0,true),button('Borç yaz',()=>open(selected,'alacak'),!settings.debtPermission),previousPayable(selected),transactions(selected)]})}),
  j.jsx(Na,{open:!!draft,onClose:close,title:review?'İşlemi kontrol et':draft?.type==='duzeltme'?'Geçmişi koruyarak ters kayıt':draft?.type==='tahsilat'?'Tahsilat al':draft?.type==='odeme'?'Müşteriye ödeme':draft?.type==='alacak'?'Borç yaz':'Müşteriye borç ekle',children:target&&j.jsxs('section',{className:'aesd-collection',children:[
   j.jsx('p',{className:'aesd-ledger-muted',children:({duzeltme:'Özgün hareket silinmez. Karşı hareket oluşturulur; nakit etkisi varsa kasa da ters yönde kaydedilir. ',alacak:'Müşterinin bize borcu artar; para girişi olmaz. ',borc:'Bizim müşteriye borcumuz artar; para çıkışı olmaz. ',tahsilat:'Müşteriden para alınır; alacağımız azalır. ',odeme:'Müşteriye para ödenir; borcumuz azalır. '})[draft.type]+target.name+' · '+(draft.type==='odeme'?'Borç ':'Açık alacak ')+ae(draft.type==='odeme'?target.borc:target.alacak)}),
   review?j.jsxs('div',{className:'aesd-collection-review',children:[j.jsxs('p',{children:[j.jsx('span',{children:'Tutar'}),j.jsx('strong',{children:ae(review.amount)})]}),['tahsilat','odeme'].includes(draft.type)&&j.jsxs('p',{children:[j.jsx('span',{children:'Ödeme yöntemi'}),j.jsx('strong',{children:review.method})]}),j.jsxs('p',{children:[j.jsx('span',{children:'İşlem sonrası alacağımız'}),j.jsx('strong',{children:ae(review.alacak)})]}),j.jsxs('p',{children:[j.jsx('span',{children:'İşlem sonrası müşteriye borcumuz'}),j.jsx('strong',{children:ae(review.borc)})]}),review.note&&j.jsx('p',{children:review.note})]}):j.jsxs('div',{children:[
    j.jsxs('label',{className:'aesd-ledger-field',children:['Tutar (₺)',j.jsx('input',{type:'text',inputMode:'decimal',autoComplete:'off',placeholder:'0,00',value:amount,onChange:e=>setAmount(e.target.value),'aria-label':'Tahsilat veya ödeme tutarı'})]}),
    ['tahsilat','odeme'].includes(draft.type)&&j.jsxs('div',{className:'aesd-collection-method',children:[j.jsx('span',{children:'Ödeme yöntemi'}),j.jsx('div',{children:['Nakit','Kart'].map(m=>j.jsx('button',{type:'button',className:'aesd-ledger-button','aria-pressed':method===m,onClick:()=>setMethod(m),children:m},m))})]}),
    j.jsxs('label',{className:'aesd-ledger-field',children:[['alacak','duzeltme'].includes(draft.type)?'Açıklama (en az 3 karakter)':'Açıklama (isteğe bağlı)',j.jsx('input',{type:'text',maxLength:500,value:note,onChange:e=>setNote(e.target.value),'aria-label':'Tahsilat açıklaması'})]})
   ]}),
   j.jsx('p',{className:'aesd-collection-error',role:'alert',children:error}),
   review?j.jsxs('div',{className:'aesd-account-actions',children:[button('Geri',()=>setReview(null),busy),button(busy?'Kaydediliyor…':draft.type==='tahsilat'?'Tahsilatı kaydet':'İşlemi kaydet',save,busy,true)]}):button('Devam et',prepare,false,true)
  ]})})
 ]});
}
