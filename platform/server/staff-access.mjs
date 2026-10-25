import crypto from 'node:crypto';
import {PlatformError,DAY} from './platform-core.mjs';
const fail=(status,message)=>{throw new PlatformError(status,message);};
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const id=()=>crypto.randomBytes(16).toString('hex');
const clean=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
const device=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(value))fail(400,'Cihaz kimliği geçersiz.');return value;};
const password=value=>{if(typeof value!=='string'||value.length<8||Buffer.byteLength(value)>72)fail(400,'Personel şifresi en az 8 karakter, en fazla 72 UTF-8 baytı olmalı.');return value;};

// Staff tokens use separate tables. They cannot authenticate as the system owner.
export function createStaffAccess({db,platform,passwords,clock=Date.now}){
 db.exec(`CREATE TABLE IF NOT EXISTS aesd_staff_grants(id TEXT PRIMARY KEY,owner_id INTEGER NOT NULL,name TEXT NOT NULL,login_id TEXT UNIQUE NOT NULL,invitation_hash TEXT NOT NULL,invitation_until INTEGER NOT NULL,claimed_at INTEGER,password_hash TEXT,active INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS aesd_staff_devices(id TEXT PRIMARY KEY,grant_id TEXT NOT NULL,device_hash TEXT NOT NULL,label TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',verification_code TEXT NOT NULL,requested_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,UNIQUE(grant_id,device_hash));
 CREATE TABLE IF NOT EXISTS aesd_staff_sessions(token_hash TEXT PRIMARY KEY,grant_id TEXT NOT NULL,device_hash TEXT NOT NULL,expires INTEGER NOT NULL,credential_fingerprint TEXT NOT NULL,created_at INTEGER NOT NULL);`);
 const available=()=>{if(!platform.ready())fail(503,'Kalıcı erişim kaydı kullanılamıyor. Tekrar deneyin.');};
 const safeGrant=g=>({id:g.id,name:g.name,loginId:g.login_id,active:Boolean(g.active),claimed:Boolean(g.claimed_at),invitationUntil:g.invitation_until,createdAt:g.created_at});
 const safeDevice=d=>({id:d.id,label:d.label,state:d.state,verificationCode:d.verification_code,requestedAt:d.requested_at,lastSeen:d.last_seen});
 const status=p=>{available();const g=db.prepare('SELECT * FROM aesd_staff_grants WHERE id=?').get(p.grantId),d=g&&db.prepare('SELECT * FROM aesd_staff_devices WHERE grant_id=? AND device_hash=?').get(g.id,hash(p.deviceId));if(!g||!d)fail(401,'Personel oturumu geçersiz.');const owner=db.prepare('SELECT active,role FROM users WHERE id=?').get(g.owner_id);return{ok:true,staff:{id:g.id,name:g.name,loginId:g.login_id,role:'STAFF'},accessState:!g.active||!owner?.active||owner.role!=='OWNER'?'blocked':d.state,verificationCode:d.verification_code,deviceLabel:d.label,serverTime:clock()};};
 function authenticate(token,deviceId){
  available();device(deviceId);if(typeof token!=='string'||!/^aesdstaff\.[a-zA-Z0-9_-]{43}$/.test(token))fail(401,'Personel girişi gerekli.');
  const s=db.prepare('SELECT * FROM aesd_staff_sessions WHERE token_hash=?').get(hash(token)),g=s&&db.prepare('SELECT * FROM aesd_staff_grants WHERE id=?').get(s.grant_id);
  if(!s||clock()>=s.expires||!g||s.device_hash!==hash(deviceId)||s.credential_fingerprint!==hash(g.password_hash))fail(401,'Personel oturumu sona erdi. Tekrar giriş yapın.');
  return{grantId:g.id,ownerId:g.owner_id,name:g.name,deviceId,tokenHash:hash(token)};
 }
 function checkSession(p){
  available();const s=p?.tokenHash&&db.prepare('SELECT * FROM aesd_staff_sessions WHERE token_hash=?').get(p.tokenHash),g=s&&db.prepare('SELECT * FROM aesd_staff_grants WHERE id=?').get(s.grant_id),d=g&&db.prepare('SELECT * FROM aesd_staff_devices WHERE grant_id=? AND device_hash=?').get(g.id,hash(p.deviceId));
  if(!s||!g||clock()>=s.expires||s.device_hash!==hash(p.deviceId)||g.owner_id!==p.ownerId||g.id!==p.grantId||s.credential_fingerprint!==hash(g.password_hash))fail(401,'Personel oturumu sona erdi. Tekrar giriş yapın.');
  return{g,d};
 }
 function guard(p){
  const {g,d}=checkSession(p);
  const owner=db.prepare('SELECT active,role FROM users WHERE id=?').get(g.owner_id);
  if(!owner?.active||owner.role!=='OWNER'||!g.active||d?.state!=='approved')fail(403,d?.state==='pending'&&g.active?'Bu cihaz için yönetici onayı bekleniyor.':'Personel veya cihaz erişimi kapatıldı.');
  return'owner:'+g.owner_id;
 }
 const requestDevice=(g,body)=>{
  const dh=hash(device(body.deviceId));let d=db.prepare('SELECT * FROM aesd_staff_devices WHERE grant_id=? AND device_hash=?').get(g.id,dh);
  if(!d){if(db.prepare('SELECT COUNT(*) AS n FROM aesd_staff_devices WHERE grant_id=?').get(g.id).n>=20)fail(429,'Cihaz istek sınırına ulaşıldı. Yöneticiyle iletişime geçin.');const key=id(),code=String(crypto.randomInt(100000,1000000));db.prepare('INSERT INTO aesd_staff_devices(id,grant_id,device_hash,label,verification_code,requested_at,last_seen) VALUES(?,?,?,?,?,?,?)').run(key,g.id,dh,clean(body.deviceLabel,80)||'Yeni cihaz',code,clock(),clock());platform.controlLog(g.owner_id,'STAFF_DEVICE_REQUEST',null,'private',{grantId:g.id,deviceId:key,name:g.name});d=db.prepare('SELECT * FROM aesd_staff_devices WHERE id=?').get(key);}else db.prepare('UPDATE aesd_staff_devices SET last_seen=? WHERE id=?').run(clock(),d.id);
  db.prepare('DELETE FROM aesd_staff_sessions WHERE expires<=?').run(clock());
  const token='aesdstaff.'+crypto.randomBytes(32).toString('base64url'),expires=clock()+(body.remember===true?14*DAY:8*3600000);
  db.prepare('INSERT INTO aesd_staff_sessions VALUES(?,?,?,?,?,?)').run(hash(token),g.id,dh,expires,hash(g.password_hash),clock());return{token,expires,...status({grantId:g.id,deviceId:body.deviceId})};
 };
 const create=(p,body)=>platform.controlWrite(()=>{platform.owner(p);const name=clean(body.name);if(!name)fail(400,'Personel adı gerekli.');if(db.prepare('SELECT COUNT(*) AS n FROM aesd_staff_grants WHERE owner_id=?').get(p.user.id).n>=500)fail(429,'Personel kayıt sınırına ulaşıldı.');const key=id(),code='AESD-P-'+crypto.randomBytes(18).toString('hex').toUpperCase(),loginId='personel-'+key.slice(0,12);db.prepare('INSERT INTO aesd_staff_grants(id,owner_id,name,login_id,invitation_hash,invitation_until,created_at) VALUES(?,?,?,?,?,?,?)').run(key,p.user.id,name,loginId,hash(code),clock()+DAY,clock());platform.controlLog(p.user.id,'STAFF_INVITE',null,'private',{grantId:key,name});return{ok:true,...safeGrant(db.prepare('SELECT * FROM aesd_staff_grants WHERE id=?').get(key)),code};});
 const claim=(body,ip='unknown')=>platform.controlWrite(async()=>{platform.controlRate('staff-claim:'+ip,8,900000);const code=clean(body.code,100).toUpperCase(),pw=password(body.password);device(body.deviceId);const g=db.prepare('SELECT * FROM aesd_staff_grants WHERE invitation_hash=?').get(hash(code));if(!g?.active||g.claimed_at||clock()>=g.invitation_until)fail(400,'Personel daveti hatalı, kullanılmış veya süresi dolmuş.');const owner=db.prepare('SELECT active,role FROM users WHERE id=?').get(g.owner_id);if(!owner?.active||owner.role!=='OWNER')fail(403,'İşyeri erişimi kapalı.');const encoded=await passwords.hash(pw,12);db.prepare('UPDATE aesd_staff_grants SET password_hash=?,claimed_at=? WHERE id=?').run(encoded,clock(),g.id);return requestDevice({...g,password_hash:encoded},body);});
 const login=(body,ip='unknown')=>platform.controlWrite(async()=>{platform.controlRate('staff-login:'+clean(body.loginId,80)+':'+ip,8,900000);device(body.deviceId);if(typeof body.password!=='string'||Buffer.byteLength(body.password)>72)fail(400,'Personel giriş bilgilerini kontrol edin.');const g=db.prepare('SELECT * FROM aesd_staff_grants WHERE login_id=?').get(clean(body.loginId,80).toLowerCase());if(!g?.active||!g.password_hash||!await passwords.compare(body.password,g.password_hash))fail(401,'Personel girişi hatalı veya erişim kapalı.');return requestDevice(g,body);});
 const list=p=>{platform.owner(p);return{ok:true,grants:db.prepare('SELECT * FROM aesd_staff_grants WHERE owner_id=? ORDER BY created_at DESC').all(p.user.id).map(g=>({...safeGrant(g),devices:db.prepare('SELECT * FROM aesd_staff_devices WHERE grant_id=? ORDER BY requested_at DESC').all(g.id).map(safeDevice)}))};};
 const summary=p=>{platform.owner(p);const pending=db.prepare("SELECT d.id,g.name,d.label,d.verification_code FROM aesd_staff_devices d JOIN aesd_staff_grants g ON g.id=d.grant_id WHERE g.owner_id=? AND g.active=1 AND d.state='pending' ORDER BY d.requested_at").all(p.user.id);return{pendingCount:pending.length,pendingIds:pending.map(d=>d.id)};};
 const changeDevice=(p,key,body)=>platform.controlWrite(()=>{platform.owner(p);const d=db.prepare('SELECT d.*,g.owner_id,g.active FROM aesd_staff_devices d JOIN aesd_staff_grants g ON g.id=d.grant_id WHERE d.id=? AND g.owner_id=?').get(key,p.user.id);if(!d)fail(404,'Cihaz isteği bulunamadı.');if(!['approve','block'].includes(body.action))fail(400,'Cihaz işlemi geçersiz.');if(body.action==='approve'&&(!d.active||body.verificationCode!==d.verification_code))fail(400,'Erişimi ve cihazdaki 6 haneli onay kodunu kontrol edin.');db.prepare('UPDATE aesd_staff_devices SET state=? WHERE id=?').run(body.action==='approve'?'approved':'blocked',d.id);platform.controlLog(p.user.id,'STAFF_DEVICE_'+body.action.toUpperCase(),null,'private',{grantId:d.grant_id,deviceId:d.id});return{ok:true,...safeDevice(db.prepare('SELECT * FROM aesd_staff_devices WHERE id=?').get(d.id))};});
 const changeGrant=(p,key,body)=>platform.controlWrite(()=>{platform.owner(p);if(typeof body.active!=='boolean')fail(400,'Erişim seçimi geçersiz.');const g=db.prepare('SELECT * FROM aesd_staff_grants WHERE id=? AND owner_id=?').get(key,p.user.id);if(!g)fail(404,'Personel bulunamadı.');db.prepare('UPDATE aesd_staff_grants SET active=? WHERE id=?').run(body.active?1:0,g.id);platform.controlLog(p.user.id,'STAFF_'+(body.active?'RESUME':'BLOCK'),null,'private',{grantId:g.id});return{ok:true,...safeGrant({...g,active:body.active?1:0})};});
 const logout=p=>platform.controlWrite(()=>{db.prepare('DELETE FROM aesd_staff_sessions WHERE token_hash=?').run(p.tokenHash);return{ok:true};});
 return{create,claim,login,authenticate,checkSession,guard,status,list,summary,changeDevice,changeGrant,logout,runOperation:fn=>platform.controlWrite(fn,()=>false)};
}
