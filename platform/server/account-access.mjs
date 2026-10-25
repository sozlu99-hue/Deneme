import crypto from 'node:crypto';
import {PlatformError} from './platform-error.mjs';

const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const reject = (status, message) => { throw new PlatformError(status, message); };
const modules = ['market', 'restaurant', 'cafe'];
const codeValue = () => String(crypto.randomInt(100000, 1000000));

// Additive tables preserve old users, licenses and existing device bindings.
export function createAccountAccess({db, secret, passwords, mail, current, owner, write, rate, log, clock}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS aesd_account_security (
      user_id INTEGER PRIMARY KEY, required INTEGER NOT NULL DEFAULT 0,
      email_verified_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS aesd_email_challenges (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, email TEXT NOT NULL,
      code_hash TEXT NOT NULL, expires INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS aesd_customer_devices (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, business_id TEXT NOT NULL,
      module TEXT NOT NULL, device_hash TEXT NOT NULL, label TEXT NOT NULL,
      state TEXT NOT NULL, code_hash TEXT NOT NULL, code_expires INTEGER NOT NULL,
      requested_at INTEGER NOT NULL, decided_at INTEGER,
      UNIQUE(user_id, module, device_hash)
    );
  `);
  const challengeHash = (purpose, id, value) => crypto.createHmac('sha256', secret)
    .update(`AESD-${purpose}-V1\0${id}\0${value}`).digest('hex');
  const equal = (a, b) => typeof a === 'string' && a.length === b.length &&
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const security = userId => db.prepare('SELECT * FROM aesd_account_security WHERE user_id=?').get(userId);
  const requestedDevice = (p, module) => db.prepare(
    'SELECT * FROM aesd_customer_devices WHERE user_id=? AND module=? AND device_hash=?'
  ).get(p.user.id, module, digest(p.deviceId));
  const requireNewAccount = userId => db.prepare(
    'INSERT INTO aesd_account_security(user_id,required) VALUES(?,1)'
  ).run(userId);

  function status(p) {
    const user = current(p), record = security(user.id);
    return {
      emailVerified: Boolean(record?.email_verified_at),
      verificationRequired: Boolean(record?.required && !record.email_verified_at),
      verificationConfigured: Boolean(mail?.configured()),
      deviceApprovalRequired: user.role !== 'OWNER' && Boolean(record?.required),
      devices: user.role === 'OWNER' ? [] : modules.map(module => {
        const d = requestedDevice(p, module);
        return {module, state: d?.state || (record?.required ? 'not_requested' : 'existing'),
          ...(d ? {id: d.id, requestedAt: d.requested_at} : {})};
      })
    };
  }

  function requirePanel(p, module) {
    const user = current(p);
    if (user.role === 'OWNER') return;
    const record = security(user.id);
    if (record?.required && !record.email_verified_at) reject(403, 'Önce e-posta adresini doğrula.');
    // Existing installed accounts keep their existing license/device controls.
    if (record?.required && requestedDevice(p, module)?.state !== 'approved') {
      reject(403, 'Bu panel için cihaz onayı gerekli.');
    }
  }

  async function requestVerification(p, ip = 'unknown') {
    const user = current(p);
    if (security(user.id)?.email_verified_at) return {ok: true, verified: true};
    if (!mail?.configured()) reject(503, 'E-posta servisi yapılandırılmamış. Destek ile iletişime geç.');
    const challenge = await write(() => {
      const u = current(p);
      rate('verify-ip:' + ip, 12, 3600000);
      rate('verify-user:' + u.id, 3, 3600000);
      rate('verify-cooldown:' + u.id, 1, 60000);
      const id = crypto.randomUUID(), code = codeValue();
      db.transaction(() => {
        db.prepare('UPDATE aesd_email_challenges SET used=1 WHERE user_id=? AND used=0').run(u.id);
        db.prepare('INSERT INTO aesd_email_challenges(id,user_id,email,code_hash,expires,created_at) VALUES(?,?,?,?,?,?)')
          .run(id, u.id, u.email, challengeHash('VERIFY', id, code), clock() + 600000, clock());
        log(u.id, 'EMAIL_VERIFICATION_REQUEST');
      })();
      return {id, email: u.email, code};
    });
    let result;
    try {
      result = await mail.send(challenge.email, 'AESD e-posta doğrulama kodu',
        `AESD e-posta doğrulama kodun: ${challenge.code}\n\nKod 10 dakika geçerlidir. Bir kez kullanılabilir. Bu kod hesabının yönetici yetkisini veya lisansını değiştirmez.\nBu işlemi sen istemediysen kodu paylaşma.\nDestek: aesdapps.tr@gmail.com`);
    } catch { result = null; }
    if (result?.status !== 'accepted') {
      await write(() => db.prepare('UPDATE aesd_email_challenges SET used=1 WHERE id=?').run(challenge.id));
      reject(503, 'E-posta sağlayıcısı gönderimi onaylamadı. Bir dakika sonra tekrar dene.');
    }
    return {ok: true, retryAfter: 60, message: 'Kod e-posta sağlayıcısına iletildi. Gelen kutusunu ve spam klasörünü kontrol et.'};
  }

  const confirmVerification = (p, body, ip = 'unknown') => write(() => {
    const user = current(p), code = String(body.code || '').trim();
    rate('verify-confirm:' + user.id + ':' + ip, 10, 900000);
    const row = db.prepare('SELECT * FROM aesd_email_challenges WHERE user_id=? AND used=0 ORDER BY created_at DESC LIMIT 1').get(user.id);
    if (!row || row.email !== user.email || clock() >= row.expires || row.attempts >= 5) {
      reject(400, 'Kod hatalı, kullanılmış veya süresi dolmuş. Yeni kod iste.');
    }
    if (!/^\d{6}$/.test(code) || !equal(row.code_hash, challengeHash('VERIFY', row.id, code))) {
      db.prepare('UPDATE aesd_email_challenges SET attempts=attempts+1 WHERE id=?').run(row.id);
      reject(400, 'Kod hatalı, kullanılmış veya süresi dolmuş. Yeni kod iste.');
    }
    db.transaction(() => {
      db.prepare('INSERT INTO aesd_account_security(user_id,required,email_verified_at) VALUES(?,0,?) ON CONFLICT(user_id) DO UPDATE SET email_verified_at=excluded.email_verified_at').run(user.id, clock());
      db.prepare('UPDATE aesd_email_challenges SET used=1 WHERE user_id=?').run(user.id);
      log(user.id, 'EMAIL_VERIFIED');
    })();
    return {ok: true, verified: true};
  });

  const requestDevice = (p, body) => write(() => {
    const user = current(p), module = body.module;
    if (user.role === 'OWNER' || !modules.includes(module)) reject(400, 'Müşteri panelini seç.');
    if (status(p).verificationRequired) reject(400, 'Önce e-posta adresini doğrula.');
    const business = db.prepare('SELECT * FROM aesd_businesses WHERE user_id=?').get(user.id);
    if (!business) reject(403, 'İşyeri hesabı gerekli.');
    const old = requestedDevice(p, module);
    if (old?.state === 'approved') return {ok: true, state: 'approved', id: old.id};
    if (old?.state === 'revoked' || old?.state === 'denied') reject(403, 'Bu cihaz reddedilmiş veya kaldırılmış. Destek ile iletişime geç.');
    rate('device-request:' + user.id + ':' + module, 3, 3600000);
    rate('device-cooldown:' + user.id + ':' + module, 1, 60000);
    const id = old?.id || crypto.randomUUID(), code = codeValue();
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : '';
    if (!label) reject(400, 'Cihaz adı gerekli.');
    db.prepare(`INSERT INTO aesd_customer_devices(id,user_id,business_id,module,device_hash,label,state,code_hash,code_expires,requested_at)
      VALUES(?,?,?,?,?,?,'pending',?,?,?) ON CONFLICT(user_id,module,device_hash) DO UPDATE SET
      label=excluded.label,state='pending',code_hash=excluded.code_hash,code_expires=excluded.code_expires,requested_at=excluded.requested_at,decided_at=NULL`)
      .run(id, user.id, business.id, module, digest(p.deviceId), label, challengeHash('DEVICE', id, code), clock() + 86400000, clock());
    log(user.id, 'CUSTOMER_DEVICE_REQUEST', business.id, module, {deviceRequestId: id});
    return {ok: true, id, state: 'pending', verificationCode: code, expires: clock() + 86400000};
  });

  function listDevices(p) {
    owner(p);
    return {devices: db.prepare(`SELECT d.id,d.business_id AS businessId,d.module,d.label,d.state,
      d.requested_at AS requestedAt,d.decided_at AS decidedAt,d.code_expires AS codeExpires,
      u.email,b.name AS businessName FROM aesd_customer_devices d JOIN users u ON u.id=d.user_id
      JOIN aesd_businesses b ON b.id=d.business_id ORDER BY d.requested_at DESC LIMIT 500`).all()};
  }

  const changeDevice = (p, id, body) => write(() => {
    owner(p);
    const row = db.prepare('SELECT * FROM aesd_customer_devices WHERE id=?').get(id);
    if (!row) reject(404, 'Cihaz başvurusu bulunamadı.');
    if (!['approve', 'deny', 'revoke','reopen'].includes(body.action)) reject(400, 'Cihaz işlemi geçersiz.');
    if(body.action==='reopen'&&!['denied','revoked'].includes(row.state))reject(400,'Yalnız reddedilmiş veya kaldırılmış cihaz için yeniden başvuru açılabilir.');
    if (body.action === 'approve') {
      rate('customer-device-approve:' + p.user.id, 20, 3600000);
      const code = String(body.verificationCode || '').trim();
      if (row.state !== 'pending' || clock() >= row.code_expires || !/^\d{6}$/.test(code) ||
          !equal(row.code_hash, challengeHash('DEVICE', row.id, code))) reject(400, 'Bekleyen cihazdaki güncel 6 haneli kod gerekli.');
    }
    db.transaction(() => {
      if (body.action === 'approve') {
        db.prepare("UPDATE aesd_customer_devices SET state='revoked',decided_at=? WHERE user_id=? AND module=? AND state='approved'")
          .run(clock(), row.user_id, row.module);
        // A replacement changes the binding and revision, never the license dates.
        db.prepare('UPDATE aesd_panel_licenses SET device_hash=?,revision=revision+1 WHERE business_id=? AND module=? AND activated_at IS NOT NULL')
          .run(row.device_hash, row.business_id, row.module);
      } else if(body.action!=='reopen') {
        db.prepare('UPDATE aesd_panel_licenses SET device_hash=NULL,revision=revision+1 WHERE business_id=? AND module=? AND device_hash=?')
          .run(row.business_id, row.module, row.device_hash);
      }
      const state = {approve: 'approved', deny: 'denied', revoke: 'revoked',reopen:'retry_allowed'}[body.action];
      db.prepare('UPDATE aesd_customer_devices SET state=?,decided_at=? WHERE id=?').run(state, clock(), id);
      log(p.user.id, 'CUSTOMER_DEVICE_' + body.action.toUpperCase(), row.business_id, row.module, {deviceRequestId: id});
    })();
    return {ok: true};
  });

  function sessions(p) {
    const user = current(p);
    return {sessions: db.prepare('SELECT token_hash AS id,device_id AS deviceId,expires,created_at AS createdAt FROM aesd_sessions WHERE user_id=? AND expires>? ORDER BY created_at DESC').all(user.id, clock())
      .map(row => ({...row, deviceId: undefined, deviceLabel: row.deviceId.slice(0, 8), current: row.id === p.tokenHash}))};
  }
  const revokeSession = (p, id) => write(() => {
    const user = current(p);
    const result = db.prepare('DELETE FROM aesd_sessions WHERE token_hash=? AND user_id=?').run(id, user.id);
    if (!result.changes) reject(404, 'Oturum bulunamadı.');
    log(user.id, 'SESSION_REVOKED');
    return {ok: true, current: id === p.tokenHash};
  });

  const changePassword = (p, body) => write(async () => {
    const user = current(p);
    rate('password-change:' + user.id, 5, 900000);
    if (typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string' ||
        body.newPassword.length < 8 || Buffer.byteLength(body.newPassword, 'utf8') > 72 ||
        body.currentPassword.length > 128) reject(400, 'Mevcut şifre ve en az 8 karakterli yeni şifre gerekli.');
    if (!await passwords.compare(body.currentPassword, user.password_hash)) reject(400, 'Mevcut şifre hatalı.');
    const passwordHash = await passwords.hash(body.newPassword, 12);
    current(p);
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash, user.id);
      if (db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'session_version')) {
        db.prepare('UPDATE users SET session_version=session_version+1 WHERE id=?').run(user.id);
      }
      db.prepare('UPDATE aesd_password_resets SET used=1 WHERE user_id=? AND used=0').run(user.id);
      db.prepare('DELETE FROM aesd_sessions WHERE user_id=?').run(user.id);
      log(user.id, 'PASSWORD_CHANGED');
    })();
    return {ok: true, signInRequired: true};
  });
  const correctEmail = (p, body) => write(async () => {
    const user=current(p),record=security(user.id);
    if(user.role!=='CLIENT'||!record?.required||record.email_verified_at)reject(400,'Yalnız henüz doğrulanmamış kayıt adresi düzeltilebilir.');
    rate('email-correction:'+user.id,5,900000);
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof body.password!=='string'||body.password.length>128)reject(400,'Yeni e-posta ve mevcut AESD şifren gerekli.');
    if(!await passwords.compare(body.password,user.password_hash))reject(400,'Mevcut AESD şifren hatalı.');
    current(p);
    if(db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(email,user.id))reject(409,'Bu e-posta başka bir hesapta kullanılıyor.');
    db.transaction(()=>{db.prepare('UPDATE users SET email=? WHERE id=?').run(email,user.id);
      db.prepare('UPDATE aesd_email_challenges SET used=1 WHERE user_id=?').run(user.id);log(user.id,'UNVERIFIED_EMAIL_CORRECTED');})();
    return{ok:true};
  });
  return {requireNewAccount, status, requirePanel, requestVerification, confirmVerification,
    requestDevice, listDevices, changeDevice, sessions, revokeSession, changePassword,correctEmail};
}
