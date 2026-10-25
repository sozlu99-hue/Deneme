import crypto from 'node:crypto';
import {PlatformError} from './platform-core.mjs';
import {privateStaffSale} from './private-engine.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
const menu=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../web/private-menu.js',import.meta.url),'utf8'),menu);
const fail=(status,message)=>{throw new PlatformError(status,message);};
const hash=body=>crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
const uuid=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))fail(400,'Satış işlem kimliği geçersiz.');return value;};
const dateKey=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date(date));
const receipt=s=>({id:s.id,receiptNo:s.receiptNo,date:s.date,total:s.total,status:s.status,items:s.items.map(i=>({name:i.name,price:i.price,qty:i.qty})),payments:s.payments.map(p=>({method:p.method,amount:p.amount})),cashier:s.cashier});
export function createStaffSales({repository,access,clock=Date.now}){
 const scope=p=>{if(!repository)fail(503,'Satış veritabanı kullanılamıyor.');return access.guard(p);};
 const ready=row=>{if(!row.state)fail(409,'Yönetici önce özel panel kayıtlarını açmalı.');return row.state;};
 const read=p=>access.runOperation(async()=>{const ownerScope=scope(p);return repository.transact(ownerScope,'private',async tx=>{scope(p);const s=ready(tx.row),today=dateKey(clock()),month=today.slice(0,7),valid=s.sales.filter(s=>s.status!=='cancelled'),daily=valid.filter(s=>dateKey(s.date)===today);return{ok:true,revision:tx.row.revision,updatedAt:tx.row.updatedAt,serverTime:clock(),staffName:p.name,products:s.products.filter(p=>p.active&&p.recipeReviewRequired!==true).map(p=>({id:p.id,name:p.name,category:p.category,price:p.price,grams:p.gramUsage,emoji:p.emoji,photo:menu.AESDPrivateMenu.photo(p)})),summary:{today:Math.round(daily.reduce((n,s)=>n+s.total,0)*100)/100,month:Math.round(valid.filter(s=>dateKey(s.date).startsWith(month)).reduce((n,s)=>n+s.total,0)*100)/100,sales:daily.length},cashOpen:s.registerSessions.some(r=>r.id===s.activeRegisterId&&r.status==='open')};});});
 const sale=(p,body)=>access.runOperation(async()=>{const ownerScope=scope(p),operationId=uuid(body?.operationId),key='staff_'+p.grantId+'_'+operationId,fingerprint=hash({grantId:p.grantId,deviceId:p.deviceId,items:body.items,payments:body.payments});return repository.transact(ownerScope,'private',async tx=>{scope(p);const current=ready(tx.row),old=await tx.receipt(key);if(old){if(old.fingerprint!==fingerprint)fail(409,'Aynı işlem kimliği farklı satış için kullanılamaz.');const found=current.sales.find(s=>s.id===key);if(!found)fail(409,'Satış makbuzu eksik. Yöneticiyle iletişime geçin.');return{ok:true,duplicate:true,receipt:receipt(found)};}let next;try{next=privateStaffSale(current,body,{saleId:key,cashier:'Personel · '+p.name,date:new Date(clock()).toISOString(),deviceId:p.deviceId,grantId:p.grantId});}catch(e){fail(409,e.message);}if(Buffer.byteLength(JSON.stringify(next))>16*1024*1024)fail(413,'Satış kaydı boyut sınırına ulaştı. Yöneticiyle iletişime geçin.');scope(p);await tx.save(next,tx.row.revision+1,key,fingerprint);return{ok:true,receipt:receipt(next.sales[0])};});});
 // An old paid receipt can be checked after access is closed. It grants no new sale.
 const findReceipt=(p,operationId)=>access.runOperation(async()=>{access.checkSession(p);if(!repository)fail(503,'Satış veritabanı kullanılamıyor.');const key='staff_'+p.grantId+'_'+uuid(operationId);return repository.transact('owner:'+p.ownerId,'private',async tx=>{access.checkSession(p);const r=await tx.receipt(key),s=tx.row.state?.sales.find(s=>s.id===key&&s.staffGrantId===p.grantId&&s.sourceDevice===p.deviceId);return{ok:true,found:Boolean(r&&s),...(r&&s?{receipt:receipt(s)}:{})};});});
 return{read,sale,findReceipt};
}
