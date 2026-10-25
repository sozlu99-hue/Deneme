/* Post one customer transaction and its cash receipt in the same state change. */
(function(root){
 const clone=value=>JSON.parse(JSON.stringify(value));
 function parseMoney(text){
  const raw=String(text??'').trim();
  if(!/^\d+(?:[,.]\d{1,2})?$/.test(raw))throw Error('Geçerli bir tutar gir. Örn. 500,00');
  const value=Number(raw.replace(',','.'));
  if(!root.OSESFinance.money(value,true))throw Error('Tutar sıfırdan büyük ve geçerli olmalı.');
  return root.OSESFinance.round(value);
 }
 function availableCash(state,id){return Math.round((state.registerSessions.find(r=>r.id===id)?.openingBalance||0)*100)+(state.cashMoves||[]).filter(m=>m.registerId===id).reduce((n,m)=>n+(['sale','entry'].includes(m.kind)?1:-1)*Math.round(m.amount*100),0);}
 function post(current,input,{transactionId,cashId,date}){
  if(input.type==='duzeltme')return reverse(current,input,{transactionId,cashId,date});
  const guard=root.OSESFinance,{customerId,type,amount}=input;
  if(!['alacak','borc','tahsilat','odeme'].includes(type)||!guard.money(amount,true)||Math.round(amount*100)/100!==amount)throw Error('Cari tutarı veya işlem türü geçersiz.');
  const customer=current.customers.find(row=>row.id===customerId);
  if(!customer||!guard.money(customer.alacak)||!guard.money(customer.borc))throw Error('Müşteri bakiyesi doğrulanamadı.');
  const cents=value=>Math.round(value*100),value=guard.round(amount);
  if(type==='alacak'&&(!current.settings.debtPermission||String(input.note||'').trim().length<3))throw Error('Manuel borçlandırma için yetki ve açıklama gerekli.');
  if(type==='alacak'&&!guard.money(guard.round(customer.alacak+value)))throw Error('Cari toplam desteklenen tutarı aşıyor.');
  if(type==='tahsilat'&&cents(value)>cents(customer.alacak))throw Error('Tahsilat açık alacağı aşamaz.');
  if(type==='odeme'&&cents(value)>cents(customer.borc))throw Error('Ödeme mevcut borcu aşamaz.');
  if(type==='borc'&&!guard.money(guard.round(customer.borc+value)))throw Error('Cari toplam desteklenen tutarı aşıyor.');
  if(!transactionId||current.customers.some(row=>row.txns.some(t=>t.id===transactionId)))throw Error('Cari işlem kimliği daha önce kullanılmış.');
  const method=type==='tahsilat'?(input.method||'Nakit'):type==='odeme'?(input.method||null):null;
  if(method&&!['Nakit','Kart'].includes(method))throw Error('Ödeme yöntemi geçersiz.');
  const register=method==='Nakit'?(current.registerSessions.find(r=>r.id===current.activeRegisterId&&r.status==='open')||current.registerSessions.find(r=>r.status==='open')):null;
  if(method==='Nakit'&&!register)throw Error('Nakit tahsilat için açık kasa gerekli.');
  if(method==='Nakit'&&type==='odeme'&&cents(value)>availableCash(current,register.id))throw Error('Nakit ödeme için kasadaki para yetersiz.');
  if(method==='Nakit'&&(!cashId||current.cashMoves.some(move=>move.id===cashId)))throw Error('Kasa işlem kimliği geçersiz.');
  if(!Number.isFinite(Date.parse(date)))throw Error('Cari işlem tarihi geçersiz.');
  const next=clone(current),row=next.customers.find(row=>row.id===customerId),actor=current.auth?.name||'Yönetici';
  const txn={id:transactionId,date,type,amount:value,note:String(input.note||'').trim().slice(0,500),actor,...(type==='alacak'?{manual:true}:{}),...(method?{method}:{})};
  row.alacak=type==='alacak'?guard.round(row.alacak+value):type==='tahsilat'?guard.round(row.alacak-value):row.alacak;
  row.borc=type==='borc'?guard.round(row.borc+value):type==='odeme'?guard.round(row.borc-value):row.borc;
  row.lastActivity=date;row.txns.unshift(txn);next.updatedAt=date;
  if(method==='Nakit')next.cashMoves.unshift({id:cashId,date,registerId:register.id,kind:type==='odeme'?'exit':'entry',amount:value,note:(type==='odeme'?'Ödeme · ':'Tahsilat · ')+row.name,refId:transactionId,customerId,cashier:actor});
  return next;
 }
 function reverse(current,input,ids){
  const c=current.customers.find(c=>c.id===input.customerId),original=c?.txns.find(t=>t.id===input.reverseOf);
  if(!current.settings.debtPermission||!original||!(['borc','tahsilat','odeme'].includes(original.type)||original.type==='alacak'&&original.manual===true)||c.txns.some(t=>t.type==='duzeltme'&&t.refId===original.id))throw Error('Bu hareket ters kayıtla düzeltilemez veya zaten düzeltildi.');
  if(String(input.note||'').trim().length<3||input.amount!==original.amount||!Number.isFinite(Date.parse(ids.date))||!ids.transactionId||current.customers.some(c=>c.txns.some(t=>t.id===ids.transactionId)))throw Error('Ters kayıt tutarı, açıklaması veya kimliği geçersiz.');
  const method=['tahsilat','odeme'].includes(original.type)?original.method:null;
  const out=original.type==='tahsilat',reg=method==='Nakit'?current.registerSessions.find(r=>r.id===current.activeRegisterId&&r.status==='open'):null;
  if(method==='Nakit'&&(!reg||!ids.cashId||current.cashMoves.some(m=>m.id===ids.cashId)||out&&availableCash(current,reg.id)<Math.round(original.amount*100)))throw Error('Ters kayıt için açık kasa ve yeterli nakit gerekli.');
  const next=clone(current),row=next.customers.find(c=>c.id===input.customerId),amount=original.amount;
  row.alacak=root.OSESFinance.round(row.alacak+(original.type==='alacak'?-amount:original.type==='tahsilat'?amount:0));row.borc=root.OSESFinance.round(row.borc+(original.type==='borc'?-amount:original.type==='odeme'?amount:0));
  if(row.alacak<0||row.borc<0)throw Error('Bu hareket kapatılmış. İlgili tahsilat/ödemeyi önce kontrol et.');
  row.txns.unshift({id:ids.transactionId,date:ids.date,type:'duzeltme',refId:original.id,amount,note:String(input.note).trim().slice(0,500),actor:current.auth?.name||'Yönetici',...(method?{method}:{})});row.lastActivity=ids.date;next.updatedAt=ids.date;
  if(reg)next.cashMoves.unshift({id:ids.cashId,date:ids.date,registerId:reg.id,kind:out?'exit':'entry',amount,note:'Cari ters kayıt · '+row.name,refId:ids.transactionId,customerId:row.id,cashier:current.auth?.name||'Yönetici'});
  return next;
 }
 root.AESDPrivateAccounts={parseMoney,post,availableCash};
})(typeof window==='object'?window:globalThis);
