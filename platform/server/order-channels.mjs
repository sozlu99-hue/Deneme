import crypto from 'node:crypto';
import QRCode from 'qrcode';
import {PlatformError} from './platform-error.mjs';
import {command} from '../web/pos.js';
const fail=(status,message)=>{throw new PlatformError(status,message);};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

export function createOrderChannels({db,platform,repository,secret,publicOrigin,clock=Date.now}) {
  const origin=new URL(publicOrigin);
  if(origin.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('QR origin must use HTTPS.');
  db.exec(`CREATE TABLE IF NOT EXISTS aesd_order_channels(id TEXT PRIMARY KEY,business_id TEXT NOT NULL,module TEXT NOT NULL,
    label TEXT NOT NULL,ordering INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL)`);
  const tokenFor=id=>id+'.'+crypto.createHmac('sha256',secret).update('AESD-QR-V1\0'+id).digest('base64url');
  const readPanel=(scope,module)=>repository.read?repository.read(scope,module):repository.transact(scope,module,async tx=>tx.row);
  function publicChannel(token) {
    if(typeof token!=='string'||token.length>150)fail(404,'Menü bağlantısı bulunamadı.');
    const [id,signature,extra]=token.split('.');
    const expected=tokenFor(id||'').split('.')[1];
    if(extra||!signature||signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))fail(404,'Menü bağlantısı bulunamadı.');
    const channel=db.prepare('SELECT * FROM aesd_order_channels WHERE id=? AND active=1').get(id);
    if(!channel)fail(404,'Menü bağlantısı kapalı veya bulunamadı.');
    platform.authorizePublic(channel.business_id,channel.module);
    return channel;
  }
  const quote=(channel,state)=>hash(JSON.stringify({channel:channel.id,items:state.products.map(p=>({id:p.id,name:p.name,priceCents:p.priceCents,recipeVersion:p.recipeVersion||1})).sort((a,b)=>a.id.localeCompare(b.id))}));
  const menuView=(channel,state)=>({businessName:platform.publicBusinessName(channel.business_id),label:channel.label,
    ordering:Boolean(channel.ordering),quote:quote(channel,state),currency:'TRY',
    items:state.products.map(p=>({id:p.id,name:p.name,category:p.category||'Genel',priceCents:p.priceCents,photo:p.photo||''}))});
  function list(p,module) {
    const businessId=platform.authorizePanel(p,module);
    return {channels:db.prepare('SELECT id,label,ordering,active,created_at AS createdAt FROM aesd_order_channels WHERE business_id=? AND module=? ORDER BY created_at DESC').all(businessId,module)
      .map(c=>({...c,ordering:Boolean(c.ordering),active:Boolean(c.active)}))};
  }
  async function create(p,module,body) {
    if(!['restaurant','cafe'].includes(module))fail(400,'QR sipariş için Restoran veya Kafe panelini aç.');
    const businessId=platform.authorizePanel(p,module),label=typeof body.label==='string'?body.label.trim():'';
    if(!label||label.length>60||typeof body.ordering!=='boolean')fail(400,'Bağlantı adı ve sipariş tercihi gerekli.');
    const id=crypto.randomUUID();
    await platform.controlWrite(()=>{platform.authorizePanel(p,module);platform.controlRate('qr-create:'+p.user.id,20,3600000);
      db.prepare('INSERT INTO aesd_order_channels(id,business_id,module,label,ordering,created_at) VALUES(?,?,?,?,?,?)').run(id,businessId,module,label,body.ordering?1:0,clock());
      platform.controlLog(p.user.id,'QR_CHANNEL_CREATED',businessId,module,{channelId:id,ordering:body.ordering});});
    const url=origin.origin+'/aesd/menu.html#'+encodeURIComponent(tokenFor(id));
    const svg=await QRCode.toString(url,{type:'svg',errorCorrectionLevel:'M',width:240,margin:4});
    return {ok:true,id,url,svg};
  }
  const change=(p,module,id,body)=>platform.controlWrite(()=>{
    const businessId=platform.authorizePanel(p,module);
    if(body.active!==false)fail(400,'Bağlantı yalnız kapatılabilir. Yeni bağlantı oluşturabilirsin.');
    const result=db.prepare('UPDATE aesd_order_channels SET active=0 WHERE id=? AND business_id=? AND module=?').run(id,businessId,module);
    if(!result.changes)fail(404,'Bağlantı bulunamadı.');
    platform.controlLog(p.user.id,'QR_CHANNEL_DISABLED',businessId,module,{channelId:id});return{ok:true};
  });
  async function read(token) {
    const channel=publicChannel(token);
    if(!repository)fail(503,'Menü şu anda kullanılamıyor.');
    const row=await readPanel(channel.business_id,channel.module);
    publicChannel(token);
    if(!row.state)fail(503,'Menü henüz hazırlanmadı.');
    return menuView(channel,row.state);
  }
  function externalKey(channel,id) {
    if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(id))fail(400,'Sipariş işlem kimliği gerekli.');
    return 'qr:'+channel.id+':'+id;
  }
  const result=(state,key)=>{
    const order=[...state.orders,...(state.closedOrders||[])].find(x=>x.externalKey===key);
    return {ok:true,found:Boolean(order),...(order?{orderId:order.id,status:order.outcome||order.status||'draft'}:{})};
  };
  const submit=(token,body,ip)=>platform.controlWrite(async()=>{
    const channel=publicChannel(token),key=externalKey(channel,body.clientOrderId);
    if(!channel.ordering)fail(403,'Bu bağlantıda sipariş kapalı.');
    if(!repository)fail(503,'Sipariş kaydı şu anda kullanılamıyor.');
    if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>50||body.lines.some(x=>!x||typeof x.productId!=='string'||!Number.isFinite(x.qty)||x.qty<=0||x.qty>100))fail(400,'Sipariş ürünlerini kontrol et.');
    const normalized={quote:body.quote,lines:body.lines.map(({productId,qty})=>({productId,qty}))};
    const operationId='qr_'+hash(key).slice(0,48),fingerprint=hash(JSON.stringify(normalized));
    return repository.transact(channel.business_id,channel.module,async tx=>{
      publicChannel(token);
      const old=await tx.receipt(operationId);
      if(old){if(old.fingerprint!==fingerprint)fail(409,'Aynı sipariş kimliği farklı içerikle kullanılamaz.');return{...result(tx.row.state,key),duplicate:true};}
      platform.controlRate('qr-order-ip:'+ip,10,60000);platform.controlRate('qr-order-channel:'+channel.id,100,3600000);
      if(!tx.row.state)fail(503,'Menü henüz hazırlanmadı.');
      if(body.quote!==quote(channel,tx.row.state))fail(409,'Menü fiyatları değişti. Güncel menüyü aç ve siparişi kontrol et.');
      let state;
      try{state=command(tx.row.state,{type:'external-order',source:'qr',externalKey:key,label:('QR · '+channel.label).slice(0,60),lines:normalized.lines},new Date(clock()).toISOString());}
      catch(e){fail(400,e.message);}
      publicChannel(token);
      const revision=tx.row.revision+1;state.revision=revision;
      if(Buffer.byteLength(JSON.stringify(state))>16*1024*1024)fail(413,'Panel kayıt sınırı aşıldı. Sipariş alınmadı.');
      await tx.save(state,revision,operationId,fingerprint);
      return{...result(state,key),accepted:true,message:'Sipariş kaydedildi. Bu işlem ödeme değildir.'};
    });
  });
  async function receipt(token,id) {
    const channel=publicChannel(token),key=externalKey(channel,id);
    if(!repository)fail(503,'Sipariş kontrolü şu anda kullanılamıyor.');
    const row=await readPanel(channel.business_id,channel.module);publicChannel(token);
    return row.state?result(row.state,key):{ok:true,found:false};
  }
  return {list,create,change,read,submit,receipt};
}
