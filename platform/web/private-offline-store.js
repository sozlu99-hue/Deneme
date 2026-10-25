import './cost-engine.js';
import './data-integrity.js';
import './finance-guard.js';
import './private-ledger.js';
import {openCloudStore,cloudMeta,cloudMetaUpdate,updatePending} from './cloud-store.js';
const engine=(typeof window==='object'?window:globalThis).AESDPrivateLedger;
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
export async function verifyOfflinePermit(token,base,publicKey,{businessId,deviceId,now=Date.now()}){
 try{
  const [prefix,payload,signature,extra]=token.split('.');if(prefix!=='aesd-offline1'||!payload||!signature||extra)return false;
  const key=await crypto.subtle.importKey('spki',decode(publicKey),{name:'Ed25519'},false,['verify']);
  if(!await crypto.subtle.verify('Ed25519',key,decode(signature),new TextEncoder().encode(prefix+'.'+payload)))return false;
  const p=JSON.parse(new TextDecoder().decode(decode(payload))),digest=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(engine.canonical(base)))));
  return p.schema===1&&p.businessId===businessId&&p.deviceId===deviceId&&p.role==='OWNER'&&p.module==='private'&&p.stateHash===digest&&Number.isSafeInteger(p.issuedAt)&&Number.isSafeInteger(p.validUntil)&&p.validUntil-p.issuedAt===86400000&&p.issuedAt<=now+30000&&p.validUntil>now?p:false;
 }catch{return false;}
}
export async function openPrivateOfflineStore({businessId,deviceId,publicKey,api,chooseMigration,onStatus=()=>{},onRecovered=()=>{},permission=()=>true,clock=Date.now}){
 const scope=businessId+':private',key=scope+':offline-v1';let packet=await cloudMeta(key),closed=false,inflight=false,lastError='',verified=null,pollPromise=null;
 const adopt=p=>{if(packet&&p?.localVersion===packet.localVersion)p.visible=packet.visible;packet=p;};
 const assertOpen=()=>{if(closed||!permission())throw Error('Sahip oturumu gerekli. Bekleyen satışlar cihazda korunur.');};
 const report=mode=>onStatus(mode|| (packet?.queue.length?'queued':'synced'),packet?.updatedAt,{count:packet?.queue.length||0,error:lastError,warnings:packet?.visible.sales.filter(s=>s.syncWarning?.length).length||0,resetArchiveCount:packet?.resetArchives?.length||0});
 const rebase=p=>{let state=p.base;for(const item of p.queue){const ctx=p.contexts[item.contextId];if(!ctx)throw Error('Satışın doğrulama kaydı eksik. Yedeği koruyun.');state=engine.merge(state,ctx.base,item.event,{pending:true,deviceId});}p.visible=state;const needed=new Set(p.queue.map(q=>q.contextId));for(const id of Object.keys(p.contexts))if(!needed.has(id))delete p.contexts[id];return p;};
 const accept=async(result,removeId=null)=>{
  if(!result?.state||!result.offlinePermit||!Number.isSafeInteger(result.revision))throw Error('Çevrimdışı kayıt izni alınamadı. İnternete bağlanın.');
  const saved=await cloudMetaUpdate(key,previous=>{
   const p=previous||{schema:1,queue:[],contexts:{},localVersion:0};if(result.revision<(p.revision||0)){if(removeId){p.queue=p.queue.filter(q=>q.operationId!==removeId);p.localVersion++;rebase(p);}return p;}
   if(result.resetRevision>0&&p.queue.some(item=>{try{return JSON.parse(new TextDecoder().decode(decode(p.contexts[item.contextId].permit.split('.')[1]))).revision<result.resetRevision;}catch{return true;}})){
    // Quarantine, never replay or discard payments captured before a reset.
    (p.resetArchives??=[]).push({resetRevision:result.resetRevision,queue:p.queue,contexts:p.contexts,visible:p.visible});p.queue=[];p.contexts={};p.localVersion++;
   }
   if(removeId)p.queue=p.queue.filter(q=>q.operationId!==removeId);
   const changed=p.revision!==result.revision||removeId||!p.visible;p.base=result.state;p.revision=result.revision;p.updatedAt=result.updatedAt;p.permit=result.offlinePermit;
   if(changed){p.localVersion++;rebase(p);}return p;
  });adopt(saved);verified=null;lastError='';report();return packet.visible;
 };
 const recoverLegacy=async()=>{
  const old=await cloudMeta(scope+':pending');if(!old)return false;report('pending');
  const found=await api('/cloud/private/operations/'+old.operationId);
  if(!found.found&&found.resetRevision>0&&(!Number.isSafeInteger(old.expectedRevision)||old.expectedRevision<found.resetRevision)){
   await cloudMetaUpdate(key,previous=>{const p=previous||{schema:1,queue:[],contexts:{},localVersion:0};(p.resetArchives??=[]).push({resetRevision:found.resetRevision,legacyPending:old});return p;});
   await updatePending(scope+':pending',null,old.operationId);await accept(found);return true;
  }
  const result=found.found?found:await api('/cloud/private',old);await accept(result);await updatePending(scope+':pending',null,old.operationId);onRecovered(old);return true;
 };
 function poll(){if(pollPromise)return pollPromise;pollPromise=performPoll().finally(()=>{pollPromise=null;});return pollPromise;}
 async function performPoll(){
  if(closed||inflight)return packet?.visible;assertOpen();inflight=true;
  try{
   await recoverLegacy();adopt(await cloudMeta(key)||packet);
   if(packet?.queue.length){const fresh=await api('/cloud/private');await accept(fresh);adopt(await cloudMeta(key));}
   while(packet?.queue.length){
    const item=packet.queue[0],ctx=packet.contexts[item.contextId];
    const body={kind:'offline-private-sale',operationId:item.operationId,data:{base:ctx.base,permit:ctx.permit,event:item.event}};
    const response=await api('/cloud/private',body);await accept(response,item.operationId);adopt(await cloudMeta(key));
   }
   let issued=0;try{issued=JSON.parse(new TextDecoder().decode(decode(packet.permit.split('.')[1]))).issuedAt;}catch{}
   const response=await api('/cloud/private'+(issued>clock()-1800000?'?since='+packet.revision:''));if(response.state)await accept(response);else{lastError='';report();}return packet.visible;
  }catch(e){lastError=e.message;report(packet?.queue.length?'queued':e.network?'offline':'error');throw e;}
  finally{inflight=false;}
 }
 async function initialize(initial){
  assertOpen();if(!packet)await recoverLegacy();
  if(packet){try{await poll();}catch(e){if(!e.network)throw e;if(!await verifyOfflinePermit(packet.permit,packet.base,publicKey,{businessId,deviceId,now:clock()}))throw Error('Çevrimdışı izin süresi bitti. İnternete bağlanın; kayıtlar korunur.');report(packet.queue.length?'queued':'offline');}return packet.visible;}
  let latest;const capture=async(...args)=>{const response=await api(...args);if(response.state)latest=response;return response;};
  const migration=await openCloudStore({businessId,module:'private',api:capture,chooseMigration,onStatus,onRecovered});
  try{await migration.initialize(initial);try{await capture('/cloud/private');}catch(e){if(!e.network||!latest?.offlinePermit)throw e;}return await accept(latest);}finally{migration.close();}
 }
 async function commitPrivateSale(before,next){
  assertOpen();adopt(await cloudMeta(key)||packet);
  if(await cloudMeta(scope+':pending'))throw Error('Önce önceki sunucu işleminin sonucunu doğrulayın.');
  if(!packet||packet.queue.length>=500)throw Error('Bekleyen satış sınırına ulaşıldı. İnternete bağlanın.');
  const proofKey=packet.permit,base=packet.base;
  if(verified?.token!==proofKey||verified.payload.validUntil<=clock())verified={token:proofKey,payload:await verifyOfflinePermit(proofKey,base,publicKey,{businessId,deviceId,now:clock()})};
  if(!verified.payload||verified.payload.validUntil<=clock())throw Error('Çevrimdışı izin süresi bitti. İnternete bağlanın.');
  const event=engine.event(before,next),captured=Date.parse(event.sale.date);
  if(captured<verified.payload.issuedAt-30000||captured>clock()+30000||captured>verified.payload.validUntil)throw Error('Satış zamanı geçersiz. Cihaz saatini kontrol edin.');
  const operationId=crypto.randomUUID(),contextId=proofKey.split('.')[2];
  packet=await cloudMetaUpdate(key,p=>{
   if(!p||p.permit!==proofKey||!engine.equal(before,p.visible))throw Error('Başka sekme kayıtları değiştirdi. Sepeti yeniden kontrol edin.');
   if(p.queue.length>=500)throw Error('Bekleyen satış sınırına ulaşıldı.');
   p.contexts[contextId]??={base,permit:proofKey};p.queue.push({operationId,contextId,event});p.localVersion++;rebase(p);
   if(JSON.stringify(p).length>48*1024*1024)throw Error('Cihaz kayıt sınırına ulaşıldı. İnternete bağlanın.');return p;
  });lastError='';report('queued');
  // Start network work after the durable device transaction has completed.
  setTimeout(()=>{if(!closed)poll().catch(()=>{});},0);return packet.visible;
 }
 async function commitPrivate(data,before){
  assertOpen();adopt(await cloudMeta(key)||packet);if(packet?.queue.length)throw Error('Önce bekleyen satışları eşitleyin. Alış, iptal ve ayarlar için internet gerekir.');
  if(before&&!engine.equal(before,packet.visible))throw Error('Başka sekme kayıtları değiştirdi. Güncel kaydı kontrol edin.');
  if(inflight)throw Error('Eşitleme bitince tekrar deneyin.');inflight=true;
  let body;try{
   if(await recoverLegacy())throw Error('Önceki işlem doğrulandı. Son kayıtları kontrol edin.');
   body={kind:'private-state',data,expectedRevision:packet.revision,operationId:crypto.randomUUID()};await updatePending(scope+':pending',body);report('saving');
   const result=await api('/cloud/private',body);await accept(result);await updatePending(scope+':pending',null,body.operationId);return packet.visible;
  }catch(e){if(body&&e.status>=400&&e.status<500&&!e.uncertain)await updatePending(scope+':pending',null,body.operationId);report(body&&(!e.status||e.uncertain)?'pending':'error');throw e;}
  finally{inflight=false;}
 }
 return{initialize,poll,commitPrivateSale,commitPrivate,read:async()=>packet?.visible,backup:()=>cloudMeta(scope+':backup'),pendingBackup:()=>cloudMeta(key),details:()=>({count:packet?.queue.length||0,error:lastError,records:packet?.queue.map(q=>q.event.sale)||[],warnings:packet?.visible.sales.filter(s=>s.syncWarning?.length)||[],resetArchiveCount:packet?.resetArchives?.length||0}),close:()=>{closed=true;}};
}
