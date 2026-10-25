import jwt from 'jsonwebtoken';

const denied=(status,message)=>Object.assign(new Error(message),{status});

export function currentUser(db,id,version) {
  const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if(!user?.active || !Number.isSafeInteger(version) || version!==(user.session_version||0)) {
    throw denied(401,'Oturum sona erdi. Tekrar giriş yapın.');
  }
  return user;
}

export function authenticateUser(db,token,secret) {
  const payload=jwt.verify(token,secret);
  if(payload.kind!=='user')throw denied(401,'Hesap oturumu gerekli.');
  return {payload,user:currentUser(db,payload.id,payload.v??0)};
}

// Recheck credentials and bind one device after the asynchronous password check.
export function bindLoginDevice(db,verified,deviceHash,variant,now=Date.now()) {
  return db.transaction(()=>{
    const user=currentUser(db,verified.id,verified.session_version||0);
    if(user.password_hash!==verified.password_hash)throw denied(401,'Şifre değişti. Tekrar giriş yapın.');
    if(variant==='owner'&&user.role!=='OWNER')throw denied(403,'Bu sürüm yalnızca AESD OWNER içindir.');
    if(user.role!=='OWNER'&&(!Number.isFinite(Date.parse(user.license_until))||Date.parse(user.license_until)<=now))throw denied(403,'Aktif AESD lisansı bulunmuyor.');
    if(!user.device_key_hash) {
      const changed=db.prepare("UPDATE users SET device_key_hash=? WHERE id=? AND (device_key_hash IS NULL OR device_key_hash='') AND session_version=? AND password_hash=? AND active=1").run(deviceHash,user.id,user.session_version||0,user.password_hash);
      if(changed.changes!==1)throw denied(409,'Cihaz kaydı değişti. Tekrar giriş yapın.');
      user.device_key_hash=deviceHash;
    }
    if(user.device_key_hash!==deviceHash)throw denied(403,'Bu lisans başka bir cihaza bağlı. Cihaz değişimi için yönetici onayı gerekir.');
    return user;
  }).immediate();
}
