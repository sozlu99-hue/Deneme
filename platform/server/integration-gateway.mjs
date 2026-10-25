import {sameJson} from './json-value.mjs';
import crypto from 'node:crypto';
import {PlatformError} from './platform-error.mjs';
const names={fiscal:'ÖKC / Mali yazıcı',invoice:'e-Fatura / e-Arşiv',payment:'Kart ve banka tahsilatı',orders:'Dış sipariş platformları',scale:'Canlı terazi'};
const fail=(status,message)=>{throw new PlatformError(status,message);};
export function createIntegrationGateway({db,platform,repository,adapters={},clock=Date.now}) {
  db.exec(`CREATE TABLE IF NOT EXISTS aesd_integration_operations(id TEXT PRIMARY KEY,business_id TEXT NOT NULL,module TEXT NOT NULL,
    kind TEXT NOT NULL,sale_id TEXT NOT NULL,fingerprint TEXT NOT NULL,state TEXT NOT NULL,provider_reference TEXT,
    created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`);
  db.prepare("UPDATE aesd_integration_operations SET state='unknown' WHERE state='sending'").run();
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS aesd_integration_sale_kind ON aesd_integration_operations(business_id,module,kind,sale_id)');
  const available=kind=>adapters[kind]&&typeof adapters[kind].submit==='function'&&typeof adapters[kind].lookup==='function';
  function status(p,module) {
    platform.authorizePanel(p,module);
    return {providers:Object.entries(names).map(([kind,name])=>({kind,name,state:available(kind)?'Bağlı':'Kurulum gerekli',
      message:available(kind)?'Sağlayıcı adaptörü yapılandırıldı. Gerçek hesap ve cihaz kabulü ayrıca gerekir.':'Sağlayıcı / cihaz modeli ve bağlantı hesabı seçilmedi. İşlem gönderilmez.'}))};
  }
  const safe=row=>({id:row.id,kind:row.kind,saleId:row.sale_id,state:row.state,providerReference:row.provider_reference,updatedAt:row.updated_at});
  async function request(p,module,kind,body) {
    const businessId=platform.authorizePanel(p,module);
    if(!Object.hasOwn(names,kind)||!available(kind))fail(503,'Bu sağlayıcı bağlantısı hazır değil. Mali belge veya tahsilat oluşturulmadı.');
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(body.operationId||'')||typeof body.saleId!=='string')fail(400,'İşlem kimliği ve satış gerekli.');
    if(!repository)fail(503,'Ortak kayıt veritabanı kullanılamıyor.');
    const row=await (repository.read?repository.read(businessId,module):repository.transact(businessId,module,async tx=>tx.row));platform.authorizePanel(p,module);
    const sale=row.state?.sales.find(x=>x.id===body.saleId&&x.status==='completed');
    if(!sale)fail(404,'Tamamlanmış satış bulunamadı.');
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify({businessId,module,kind,saleId:sale.id,totalCents:sale.totalCents})).digest('hex');
    const prior=db.prepare('SELECT * FROM aesd_integration_operations WHERE id=?').get(body.operationId);
    if(prior){if(prior.business_id!==businessId||prior.module!==module||prior.fingerprint!==fingerprint)fail(409,'İşlem kimliği farklı içerikle kullanılamaz.');return{ok:true,...safe(prior),duplicate:true};}
    const existing=await platform.controlWrite(async()=>{platform.authorizePanel(p,module);return repository.transact(businessId,module,async tx=>{
      // A reset between quote read and reservation must not send an old invoice.
      const currentSale=tx.row.state?.sales.find(x=>x.id===sale.id&&x.status==='completed');
      if(!currentSale||!sameJson(currentSale,sale))fail(409,'Satış kaydı değişti veya sıfırlandı. Sağlayıcı işlemi gönderilmedi.');
      const existing=db.prepare('SELECT * FROM aesd_integration_operations WHERE business_id=? AND module=? AND kind=? AND sale_id=?').get(businessId,module,kind,sale.id);if(existing)return existing;db.prepare("INSERT INTO aesd_integration_operations(id,business_id,module,kind,sale_id,fingerprint,state,created_at,updated_at) VALUES(?,?,?,?,?,?,'sending',?,?)")
      .run(body.operationId,businessId,module,kind,sale.id,fingerprint,clock(),clock());platform.controlLog(p.user.id,'INTEGRATION_REQUEST',businessId,module,{operationId:body.operationId,kind});});});
    if(existing){if(existing.id!==body.operationId)fail(409,'Bu satışın sağlayıcı işlemi mevcut. Önce sonucunu kontrol et.');return{ok:true,...safe(existing),duplicate:true};}
    let result;
    try{platform.authorizePanel(p,module);result=await timed(signal=>adapters[kind].submit({operationId:body.operationId,businessId,module,kind,sale:structuredClone(sale),signal}));}catch{result={state:'unknown'};}
    await saveResult(body.operationId,result);
    platform.authorizePanel(p,module);
    return{ok:true,...safe(db.prepare('SELECT * FROM aesd_integration_operations WHERE id=?').get(body.operationId))};
  }
  async function saveResult(id,result) {
    const state=['confirmed','rejected'].includes(result?.state)?result.state:'unknown';
    const reference=state==='confirmed'&&typeof result.reference==='string'&&result.reference.trim()&&result.reference.length<=200?result.reference:null;
    const next=state==='confirmed'&&!reference?'unknown':state;
    await platform.controlWrite(()=>{
      const current=db.prepare('SELECT state,provider_reference FROM aesd_integration_operations WHERE id=?').get(id);
      if(!current)fail(404,'Bağlantı işlemi bulunamadı.');
      // A late uncertain response must not remove a final provider result.
      if(['confirmed','rejected'].includes(current.state)){
        if(next==='unknown')return;
        if(next!==current.state||next==='confirmed'&&reference!==current.provider_reference)fail(409,'Sağlayıcı sonucu kayıtla çelişiyor. Mevcut sonuç korundu. Destek ile kontrol et.');
        return;
      }
      db.prepare("UPDATE aesd_integration_operations SET state=?,provider_reference=?,updated_at=? WHERE id=? AND state IN ('sending','unknown')")
        .run(next,reference,clock(),id);
    });
  }
  async function receipt(p,module,id,refresh=false) {
    const businessId=platform.authorizePanel(p,module),row=db.prepare('SELECT * FROM aesd_integration_operations WHERE id=? AND business_id=? AND module=?').get(id,businessId,module);
    if(!row)fail(404,'Bağlantı işlemi bulunamadı.');
    if(refresh&&['unknown','sending'].includes(row.state)&&available(row.kind)) {
      let result;try{result=await timed(signal=>adapters[row.kind].lookup({operationId:id,businessId,module,kind:row.kind,signal}));}catch{result={state:'unknown'};}
      await saveResult(id,result);
    }
    platform.authorizePanel(p,module);return{ok:true,...safe(db.prepare('SELECT * FROM aesd_integration_operations WHERE id=?').get(id))};
  }
  return{status,request,receipt};
}
async function timed(run){const controller=new AbortController();let timer;try{return await Promise.race([run(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Provider timeout'));},15000);})]);}finally{clearTimeout(timer);}}
