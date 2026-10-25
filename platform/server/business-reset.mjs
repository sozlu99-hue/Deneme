import crypto from 'node:crypto';
import {PlatformError} from './platform-core.mjs';
import {emptyState} from '../web/pos.js';
import {validatePrivate} from './private-engine.mjs';
const fail=(status,message)=>{throw new PlatformError(status,message);};
// Tickets bind the downloaded snapshot to a session, panel and exact revision.
// A restart expires tickets. Receipts and reset barriers remain durable in SQL.
export function createBusinessReset({repository,platform,passwords,db,clock=Date.now}){
 const tickets=new Map();
 const authorize=(p,module)=>{platform.owner(p);return platform.authorizePanel(p,module);};
 const checkPendingProviders=(scope,module)=>{
  if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='aesd_integration_operations'").get()&&db.prepare("SELECT id FROM aesd_integration_operations WHERE business_id=? AND module=? AND state IN ('sending','unknown') LIMIT 1").get(scope,module))fail(409,'Sonucu belirsiz sağlayıcı işlemi var. Önce tahsilat veya mali belge sonucunu doğrulayın.');
 };
 const clean=()=>{for(const [key,t] of tickets)if(t.expires<=clock())tickets.delete(key);};
 const result=row=>({ok:true,revision:row.revision});
 return{
 prepare:(p,module)=>platform.controlWrite(async()=>{
  const scope=authorize(p,module);checkPendingProviders(scope,module);platform.controlRate('business-reset-prepare:'+p.user.id,10,600000);clean();
  if(!repository)fail(503,'Ortak kayıt veritabanı kullanılamıyor.');
  if(tickets.size>=1000)fail(429,'Daha sonra tekrar deneyin.');
  return repository.transact(scope,module,async tx=>{
   authorize(p,module);if(!tx.row.state)fail(409,'Önce ortak kayıtları açın.');
   const token=crypto.randomBytes(24).toString('base64url'),expires=clock()+600000;
   tickets.set(token,{scope,module,session:p.tokenHash,revision:tx.row.revision,expires});
   return{ok:true,token,expires,revision:tx.row.revision,backup:{schema:'aesd-reset-backup-v1',scope,module,revision:tx.row.revision,exportedAt:new Date(clock()).toISOString(),state:structuredClone(tx.row.state)}};
  });
 }),
 confirm:(p,module,body)=>platform.controlWrite(async()=>{
  const scope=authorize(p,module);checkPendingProviders(scope,module);clean();const ticket=tickets.get(body?.token);
  if(!ticket||ticket.scope!==scope||ticket.module!==module||ticket.session!==p.tokenHash)fail(409,'Yedek onayı sona erdi. Güncel yedeği yeniden indirin.');
  if(body.confirmation!=='SIFIRLA'||body.backupAcknowledged!==true)fail(400,'Yedek ve SIFIRLA onayı gerekli.');
  if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)fail(400,'Güncel AESD yönetici şifresi gerekli.');
  platform.controlRate('business-reset-password:'+p.user.id,5,600000);
  const user=db.prepare('SELECT password_hash FROM users WHERE id=?').get(p.user.id);
  if(!await passwords.compare(body.password,user.password_hash))fail(422,'Yönetici şifresi doğrulanmadı.');
  authorize(p,module);
  return repository.transact(scope,module,async tx=>{
   authorize(p,module);const id='reset_'+body.token,receipt=await tx.receipt(id);
   if(receipt)return{...result(tx.row),duplicate:true,operationRevision:Number(receipt.revision)};
   if(tx.row.revision!==ticket.revision)fail(409,'Yedekten sonra kayıtlar değişti. Güncel yedeği yeniden indirin.');
   const current=tx.row.state;
   const state=module==='private'?validatePrivate({version:3,products:[],customers:[],stock:[],stockMoves:[],staff:structuredClone(current.staff||[]),settings:structuredClone(current.settings||{}),sales:[],orders:[],orderCounter:1,registerSessions:[],activeRegisterId:null,cashMoves:[],deletedStockIds:[]}):emptyState(scope,module);
   const revision=tx.row.revision+1;if(module!=='private')state.revision=revision;
   // Keep previous receipts: delayed retries must never recreate an old sale.
   await tx.save(state,revision,id,crypto.createHash('sha256').update(JSON.stringify({scope,module,revision})).digest('hex'));
   authorize(p,module);return{...result({revision}),operationRevision:revision};
  });
 })};
}
