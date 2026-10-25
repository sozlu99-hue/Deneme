import {sameJson} from './json-value.mjs';

const cents=value=>Math.round(value*100);
function retained(before,after,label){
 const map=new Map(after.map(r=>[r.id,r]));
 if(map.size!==after.length||after.some(r=>typeof r.id!=='string'||!r.id))throw Error(label+' kimliği geçersiz veya yinelenmiş.');
 for(const old of before)if(!map.has(old.id)||!sameJson(old,map.get(old.id)))throw Error(label+' geçmişi değiştirilemez.');
 return after.filter(r=>!before.some(old=>old.id===r.id));
}
export function verifyPrivateFinance(current,next,added,cancelled){
 const registers=new Map(next.registerSessions.map(row=>[row.id,row]));
 const closingFields=new Set(['status','closedAt','closingBalance','saleTotal','saleCount','cashSales','cardSales','creditSales','otherSales','cashIn','cashOut','cashRefunds','closedBy']);
 for(const old of current.registerSessions){
  const row=registers.get(old.id);
  if(!row)throw Error('Kayıtlı kasa oturumu silinemez.');
  if(old.status==='closed'||row.status==='open'){
   if(!sameJson(old,row))throw Error('Kasa oturumunun geçmişi değiştirilemez.');
  }else{
   for(const key of Object.keys(old))if(key!=='status'&&!sameJson(old[key],row[key]))throw Error('Kasa açılış bilgileri değiştirilemez.');
   if(row.status!=='closed'||Object.keys(row).some(key=>!Object.hasOwn(old,key)&&!closingFields.has(key)))throw Error('Kasa kapanış bilgileri geçersiz.');
  }
 }
 for(const row of next.registerSessions)if(!current.registerSessions.some(old=>old.id===row.id)&&row.status!=='open')throw Error('Yeni kasa oturumu açık olmalıdır.');
 if(next.activeRegisterId!==current.activeRegisterId&&next.activeRegisterId!==null&&next.activeRegisterId!==undefined&&registers.get(next.activeRegisterId)?.status!=='open')throw Error('Etkin kasa açık olmalıdır.');
 if(new Set(next.customers.map(c=>c.id)).size!==next.customers.length||next.customers.some(c=>typeof c.id!=='string'||!c.id))throw Error('Cari kimliği geçersiz veya yinelenmiş.');
 for(const old of current.customers){
  if(!next.customers.some(c=>c.id===old.id)&&(old.alacak||old.borc||old.txns?.length))throw Error('Hareketi veya bakiyesi olan cari silinemez.');
 }
 const collections=[],cashRemaining=new Map();
 for(const c of next.customers){
  const old=current.customers.find(v=>v.id===c.id),fresh=retained(old?.txns||[],c.txns||[],'Cari hareket');
  let receivable=cents(old?.alacak||0),payable=cents(old?.borc||0);
  for(const t of fresh.slice().reverse()){
   if(['tahsilat','odeme'].includes(t.type)&&t.method!==undefined){
    if(!['Nakit','Kart'].includes(t.method))throw Error('Tahsilat ödeme yöntemi geçersiz.');
    collections.push({customerId:c.id,transaction:t});
   }
   const amount=cents(t.amount);if(!Number.isSafeInteger(amount)||amount<=0||amount/100!==t.amount)throw Error('Cari hareket tutarı geçersiz.');
   if(t.type==='duzeltme'){
    const origin=old?.txns.find(v=>v.id===t.refId);
    if(!current.settings.debtPermission||!origin||!(['borc','tahsilat','odeme'].includes(origin.type)||origin.type==='alacak'&&origin.manual===true)||origin.amount!==t.amount||old.txns.some(v=>v.type==='duzeltme'&&v.refId===origin.id)||fresh.filter(v=>v.type==='duzeltme'&&v.refId===origin.id).length!==1||typeof t.note!=='string'||t.note.trim().length<3||!Number.isFinite(Date.parse(t.date)))throw Error('Cari ters kayıt doğrulanamadı.');
    const method=['tahsilat','odeme'].includes(origin.type)?origin.method:undefined;
    if(t.method!==method)throw Error('Ters kayıt yöntemi özgün kayıtla eşleşmiyor.');
    if(method)collections.push({customerId:c.id,transaction:{...t,type:origin.type==='tahsilat'?'odeme':'tahsilat'}});
    if(origin.type==='alacak')receivable-=amount;else if(origin.type==='borc')payable-=amount;else if(origin.type==='tahsilat')receivable+=amount;else if(origin.type==='odeme')payable+=amount;
    if(receivable<0||payable<0)throw Error('Kapatılmış cari hareket ters çevrilemez.');
   }
   if(t.type==='alacak'&&t.manual===true){
    if(!current.settings.debtPermission||t.refId!==undefined||added.length||cancelled.length||typeof t.note!=='string'||t.note.trim().length<3||t.note.length>500||!Number.isFinite(Date.parse(t.date)))throw Error('Manuel cari borçlandırma geçersiz.');
   }else if(t.type==='alacak'||t.type==='iptal'){
    const sale=(t.type==='alacak'?added:cancelled).find(s=>s.id===t.refId&&s.customerId===c.id),credit=sale?.payments.filter(p=>p.method==='Veresiye').reduce((n,p)=>n+cents(p.amount),0);
    if(!sale||credit!==amount||fresh.filter(v=>v.type===t.type&&v.refId===t.refId).length!==1)throw Error('Cari hareket satışla eşleşmiyor.');
   }
   if(t.type==='alacak')receivable+=amount;
   else if(t.type==='borc')payable+=amount;
   else if(t.type==='tahsilat'){if(amount>receivable)throw Error('Tahsilat cari alacağını aşamaz.');receivable-=amount;}
   else if(t.type==='odeme'){if(amount>payable)throw Error('Ödeme cari borcunu aşamaz.');payable-=amount;}
   else if(t.type==='iptal'){const reduction=Math.min(receivable,amount);receivable-=reduction;payable+=amount-reduction;}
   if(!Number.isSafeInteger(receivable)||!Number.isSafeInteger(payable))throw Error('Cari toplam desteklenen tutarı aşıyor.');
  }
  if(receivable!==cents(c.alacak)||payable!==cents(c.borc))throw Error('Cari bakiyesi hareketlerle eşleşmiyor.');
 }
 for(const sale of [...added,...cancelled]){
  const credit=sale.payments.filter(p=>p.method==='Veresiye').reduce((n,p)=>n+cents(p.amount),0),type=added.includes(sale)?'alacak':'iptal';
  if(credit){const customer=next.customers.find(c=>c.id===sale.customerId),before=current.customers.find(c=>c.id===sale.customerId);if(!customer||!(customer.txns||[]).some(t=>t.type===type&&t.refId===sale.id&&cents(t.amount)===credit&&!before?.txns?.some(o=>o.id===t.id)))throw Error('Satışın cari hareketi eksik.');}
 }
 const freshCash=retained(current.cashMoves||[],next.cashMoves||[],'Kasa hareket');
 for(const {customerId,transaction:t} of collections){
  if(t.type==='odeme'&&t.method==='Nakit'){const receipt=freshCash.find(m=>m.refId===t.id),id=receipt?.registerId;if(!cashRemaining.has(id))cashRemaining.set(id,cents(current.registerSessions.find(r=>r.id===id)?.openingBalance||0)+(current.cashMoves||[]).filter(m=>m.registerId===id).reduce((n,m)=>n+(['sale','entry'].includes(m.kind)?1:-1)*cents(m.amount),0));if(cashRemaining.get(id)<cents(t.amount))throw Error('Nakit ödeme için kasa mevcudu yetersiz.');cashRemaining.set(id,cashRemaining.get(id)-cents(t.amount));}

  const receipts=freshCash.filter(move=>move.refId===t.id);
  if(t.method==='Kart'&&receipts.length)throw Error('Kart tahsilatı nakit kasasına yazılamaz.');
  if(t.method==='Nakit'&&(receipts.length!==1||receipts[0].kind!==(t.type==='odeme'?'exit':'entry')||receipts[0].customerId!==customerId||cents(receipts[0].amount)!==cents(t.amount)||!current.registerSessions.some(r=>r.id===receipts[0].registerId&&r.status==='open')))throw Error('Tahsilatın açık kasada eşleşen nakit kaydı gerekli.');
 }
 for(const move of freshCash)if(move.customerId!==undefined&&!collections.some(c=>c.customerId===move.customerId&&c.transaction.id===move.refId&&c.transaction.method==='Nakit'))throw Error('Kasa tahsilatı cari hareketle eşleşmiyor.');
 for(const move of freshCash){
  if(!next.registerSessions.some(r=>r.id===move.registerId))throw Error('Kasa hareketinin kasası bulunamadı.');
  if(move.kind==='sale'||move.kind==='refund'){
   const sales=move.kind==='sale'?added:cancelled,sale=sales.find(s=>s.id===move.refId),cash=sale?.payments.filter(p=>p.method==='Nakit').reduce((n,p)=>n+cents(p.amount),0);
   if(!sale||cash!==cents(move.amount)||freshCash.filter(m=>m.kind===move.kind&&m.refId===move.refId).length!==1)throw Error('Kasa hareketi satışla eşleşmiyor.');
  }
 }
 for(const sale of added){const cash=sale.payments.filter(p=>p.method==='Nakit').reduce((n,p)=>n+cents(p.amount),0);if(cash&&!freshCash.some(m=>m.kind==='sale'&&m.refId===sale.id&&cents(m.amount)===cash))throw Error('Satışın kasa hareketi eksik.');}
 for(const sale of cancelled){const cash=sale.payments.filter(p=>p.method==='Nakit').reduce((n,p)=>n+cents(p.amount),0);if(cash&&current.registerSessions.some(r=>r.status==='open')&&!freshCash.some(m=>m.kind==='refund'&&m.refId===sale.id&&cents(m.amount)===cash))throw Error('İptalin kasa iade hareketi eksik.');}
}
