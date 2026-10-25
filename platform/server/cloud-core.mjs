import crypto from 'node:crypto';
import {command,emptyState,validateState} from '../web/pos.js';
import {PlatformError} from './platform-core.mjs';
import {validatePrivate,privateTransition,privateMenu,menuRelease,canonicalPrivate,mergeOfflinePrivate} from './private-engine.mjs';
import {sameJson} from './json-value.mjs';
import {extraCollections} from '../web/business-validation.js';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(status,message)=>{throw new PlatformError(status,message);};
export function createCloud({repository,authorize,clock=Date.now,signOffline,verifyOffline,catalogMigration=false,runOperation=fn=>fn(),authorizePrivateMutation=()=>{}}){
 const migrated=new Set();
 const scope=(p,module)=>{if(!repository)fail(503,'Ortak kayıt veritabanı kullanılamıyor. Satış onaylanmadı.');return authorize(p,module);};
 const recheck=(p,module,businessId)=>{if(authorize(p,module)!==businessId)fail(403,'Panel yetkisi değişti. Tekrar giriş yapın.');};
 const result=(row,p,module,businessId)=>({ok:true,initialized:row.initialized??row.state!==null,revision:row.revision,resetRevision:row.resetRevision||0,...(row.state===undefined?{}:{state:row.state}),updatedAt:row.updatedAt,serverTime:clock(),storage:repository.mode,...(module==='private'&&row.state&&signOffline&&p.user.role==='OWNER'?{offlinePermit:signOffline({schema:1,businessId,module,deviceId:p.deviceId,role:'OWNER',revision:row.revision,stateHash:crypto.createHash('sha256').update(canonicalPrivate(row.state)).digest('hex'),issuedAt:clock(),validUntil:clock()+86400000})}:{})});
 const operation=(body)=>{if(!/^[a-zA-Z0-9_-]{16,100}$/.test(body?.operationId||'')||body.operationId.startsWith('reset_'))fail(400,'Kalıcı işlem kimliği gerekli.');return hash({kind:body.kind,data:body.data,expectedRevision:body.expectedRevision});};
 const api={async read(p,module,since){const businessId=scope(p,module);if(repository.read&&(module!=='private'||migrated.has(businessId))){const row=await repository.read(businessId,module,since);recheck(p,module,businessId);return result(row,p,module,businessId);}return repository.transact(businessId,module,async tx=>{recheck(p,module,businessId);let row={...tx.row,resetRevision:await tx.resetRevision?.()||0};if(module==='private'&&catalogMigration&&row.state&&row.state.settings?.aesdMenuRelease!==menuRelease){const state=validatePrivate(privateMenu(row.state)),revision=row.revision+1;await tx.save(state,revision,'catalog_'+menuRelease,hash({menuRelease}));row={state,revision,resetRevision:row.resetRevision,updatedAt:new Date(clock()).toISOString()};}recheck(p,module,businessId);if(module==='private'&&row.state)migrated.add(businessId);const unchanged=String(row.revision)===String(since)&&row.state!==null;return result(unchanged?{...row,state:undefined,initialized:true}:row,p,module,businessId);});},async receipt(p,module,id){const businessId=scope(p,module);return repository.transact(businessId,module,async tx=>{recheck(p,module,businessId);const receipt=await tx.receipt(id);recheck(p,module,businessId);return{...result({...tx.row,resetRevision:await tx.resetRevision?.()||0},p,module,businessId),found:Boolean(receipt),operationRevision:receipt?Number(receipt.revision):null};});},async mutate(p,module,body){const businessId=scope(p,module),fingerprint=operation(body);return repository.transact(businessId,module,async tx=>{
  recheck(p,module,businessId);const old=await tx.receipt(body.operationId);recheck(p,module,businessId);if(old){if(old.fingerprint!==fingerprint)fail(409,'İşlem kimliği farklı içerikle yeniden kullanılamaz.');return{...result({...tx.row,resetRevision:await tx.resetRevision?.()||0},p,module,businessId),duplicate:true,operationRevision:Number(old.revision)};}
  const resetRevision=await tx.resetRevision?.()||0;
  if(resetRevision){
   let source=body.expectedRevision;
   if(body.kind==='offline-private-sale')source=verifyOffline?.(body.data?.permit)?.revision;
   if(!Number.isSafeInteger(source)||source<resetRevision)fail(409,'İşletme verileri sıfırlandı. Eski işlem uygulanmadı; cihaz yedeğini koruyup güncel kayıtları açın.');
  }
  let state;try{
   if(body.kind==='import'){
    state=module==='private'?validatePrivate(catalogMigration?privateMenu(body.data):body.data):(validateState(body.data,businessId,module),structuredClone(body.data));
    const emptyTarget=module!=='private'&&tx.row.revision===1&&tx.row.state&&['products','materials','sales','customers','purchases','collections','orders',...extraCollections].every(k=>!tx.row.state[k]?.length);
    if(tx.row.state!==null&&!emptyTarget){const a={...tx.row.state},b={...state};delete a.revision;delete b.revision;if(!sameJson(a,b))fail(409,'Sunucuda farklı kayıtlar var. Yerel yedek korunur; aktarım durduruldu.');return{...result(tx.row,p,module,businessId),alreadyImported:true};}
   }else{
    if(tx.row.state===null)fail(409,'Önce bu panelin ilk aktarımını tamamlayın.');
    if(body.kind==='offline-private-sale'&&module==='private'){
     const proof=verifyOffline?.(body.data?.permit),base=body.data?.base,event=body.data?.event,captured=Date.parse(event?.sale?.date);
     if(!proof||p.user.role!=='OWNER'||proof.schema!==1||proof.role!=='OWNER'||proof.businessId!==businessId||proof.module!==module||proof.deviceId!==p.deviceId||!Number.isSafeInteger(proof.issuedAt)||!Number.isSafeInteger(proof.validUntil)||proof.validUntil-proof.issuedAt!==86400000||!Number.isFinite(captured)||captured<proof.issuedAt-30000||captured>proof.validUntil||captured>clock()+30000||proof.stateHash!==crypto.createHash('sha256').update(canonicalPrivate(base)).digest('hex'))fail(403,'Çevrimdışı satış izni veya yerel kayıt doğrulanmadı. Satış cihazda korunur.');
     state=mergeOfflinePrivate(tx.row.state,validatePrivate(base),event,{deviceId:p.deviceId,syncedAt:new Date(clock()).toISOString()});
    }
    else if(body.kind==='private-state'&&module==='private'){if(body.expectedRevision!==tx.row.revision)fail(409,'Başka cihaz kayıtları değiştirdi. Son verileri alın ve işlemi yeniden kontrol edin.');state=privateTransition(tx.row.state,body.data);authorizePrivateMutation(p,tx.row.state,state);}
    else if(body.kind==='command'&&module!=='private')state=command(tx.row.state,body.data,new Date(clock()).toISOString());
    else fail(400,'Ortak kayıt işlemi geçersiz.');
   }
  }catch(e){if(e instanceof PlatformError)throw e;fail(400,e.message||'Kayıt doğrulanamadı.');}
  const revision=tx.row.revision+1;if(module!=='private')state.revision=revision;
  if(Buffer.byteLength(JSON.stringify(state))>16*1024*1024)fail(413,'Panel kaydı 16 MB sınırını aştı. Destek ile iletişime geçin.');
  recheck(p,module,businessId);await tx.save(state,revision,body.operationId,fingerprint);recheck(p,module,businessId);return{...result({state,revision,resetRevision,updatedAt:new Date(clock()).toISOString()},p,module,businessId),operationRevision:revision};
 });}};
 // A permission change must wait until an earlier database operation ends.
 return{read:(...args)=>runOperation(()=>api.read(...args)),receipt:(...args)=>runOperation(()=>api.receipt(...args)),mutate:(...args)=>runOperation(()=>api.mutate(...args))};
}
