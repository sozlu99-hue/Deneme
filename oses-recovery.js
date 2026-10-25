import crypto from 'node:crypto';
import {openDatabase} from './shared-database.js';
import {emailConfigured, sendEmailDetailed, checkEmailTransport} from './mail-provider.js';
import {getPersistenceStatus, persistDatabaseSnapshot} from './persistence.js';

class RecoveryError extends Error {
  constructor(status, message) {super(message); this.status = status;}
}
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const env = name => String(process.env[name] || '').trim();
const mask = email => email.replace(/^(.{1,2})[^@]*@/, '$1***@');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));


export const normalizePhone = value => {
  const raw = typeof value === 'string' ? value.trim().replace(/[ ()-]/g, '') : '';
  const digits = raw.replace(/^\+/, '').replace(/^00/, '');
  if (/^5[0-9]{9}$/.test(digits)) return '+90' + digits;
  if (/^05[0-9]{9}$/.test(digits)) return '+90' + digits.slice(1);
  if (/^90[0-9]{10}$/.test(digits)) return '+' + digits;
  return /^(?:\+|00)[1-9][0-9]{9,14}$/.test(raw) ? '+' + digits : '';
};
const maskPhone = value => value ? value.slice(0,4) + '••••' + value.slice(-4) : '';
const smsConfigured = () => /^AC[a-f0-9]{32}$/i.test(env('TWILIO_ACCOUNT_SID')) && Boolean(env('TWILIO_AUTH_TOKEN')) && Boolean(env('TWILIO_FROM_NUMBER'));
export async function sendSmsDetailed(to, message) {
  if (!smsConfigured()) return {status: 'failed'};
  try {
    const sid = env('TWILIO_ACCOUNT_SID');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST', headers: {Authorization: 'Basic ' + Buffer.from(sid + ':' + env('TWILIO_AUTH_TOKEN')).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({To: to, From: env('TWILIO_FROM_NUMBER'), Body: message}), signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => ({}));
    return response.ok && typeof data.sid === 'string' && ['accepted','scheduled','queued','sending','sent','delivered'].includes(data.status) ? {status: 'accepted', messageId: data.sid} : {status: 'failed'};
  } catch {return {status: 'failed'};}
}

// Factory dependencies permit isolated tests; production uses the existing durable database and mail provider.
export function createRecovery({db, pepper, ownerEmail, ownerPhone = '', send, sendSms = async () => ({status: 'failed'}), persist, ready, smsReady = () => false, clock = Date.now}) {
  const owner = String(ownerEmail || '').trim().toLowerCase();
  const phone = normalizePhone(ownerPhone);
  const digest = text => crypto.createHmac('sha256', pepper).update('oses-recovery/v1:' + text).digest('hex');
  db.exec(`
    CREATE TABLE IF NOT EXISTS oses_recovery_devices (
      id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, email TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS oses_recovery_challenges (
      id TEXT PRIMARY KEY, device_id TEXT NOT NULL, purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      used INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS oses_recovery_sends (challenge_id TEXT PRIMARY KEY, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS oses_recovery_sends_created ON oses_recovery_sends(created);
  `);
  // Additive migration preserves all previously verified Gmail devices and challenges.
  for (const [table, column, ddl] of [
    ['oses_recovery_devices', 'phone', "TEXT NOT NULL DEFAULT ''"],
    ['oses_recovery_devices', 'phone_verified', 'INTEGER NOT NULL DEFAULT 0'],
    ['oses_recovery_challenges', 'channel', "TEXT NOT NULL DEFAULT 'email'"],
    ['oses_recovery_challenges', 'target', "TEXT NOT NULL DEFAULT ''"],
  ]) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
  const coreReady = () => typeof pepper === 'string' && pepper.length >= 32 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner);
  const channelOf = body => {
    if (body?.channel === undefined || body.channel === 'email') return 'email';
    if (body.channel === 'phone') return 'phone';
    throw new RecoveryError(400, 'Kurtarma yöntemi geçersiz.');
  };
  const configured = () => pepper.length >= 32 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner) && ready();
  const identity = body => {
    if (!body || typeof body !== 'object' || !hex64(body.deviceId) || !hex64(body.secret)) throw new RecoveryError(400, 'Cihaz kaydı geçersiz.');
    return body;
  };
  const authenticated = ({deviceId, secret}) => {
    const row = db.prepare('SELECT * FROM oses_recovery_devices WHERE id=?').get(deviceId);
    if (!row || !equal(row.secret_hash, digest(secret))) throw new RecoveryError(401, 'Kurtarma kaydı doğrulanamadı.');
    return row;
  };
  const durable = async () => {
    try {await persist();}
    catch {throw new RecoveryError(503, 'Güvenli kayıt tamamlanamadı. Daha sonra tekrar deneyin.');}
  };
  async function request(body, purpose) {
    identity(body);
    if (!['enroll', 'reset'].includes(purpose)) throw new RecoveryError(400, 'İşlem geçersiz.');
    const channel = channelOf(body), target = channel === 'phone' ? phone : owner;
    if (!coreReady()) throw new RecoveryError(503, 'Kurtarma hizmeti henüz hazır değil. Kod gönderilmedi.');
    if (channel === 'email' && !ready()) throw new RecoveryError(503, 'E-posta kurtarma hizmeti henüz hazır değil. Kod gönderilmedi.');
    if (channel === 'phone' && (!phone || !smsReady())) throw new RecoveryError(503, 'SMS sağlayıcısı ve yönetici telefon numarası henüz bağlanmadı. SMS kodu gönderilmedi.');
    const now = clock(), cid = crypto.randomBytes(32).toString('hex'), code = String(crypto.randomInt(1000000)).padStart(6, '0');
    db.transaction(() => {
      if (purpose === 'enroll') {
        if (channel === 'phone' ? normalizePhone(body.phone) !== phone : (typeof body.email !== 'string' || body.email.trim().toLowerCase() !== owner)) throw new RecoveryError(400, channel === 'phone' ? 'Sunucudaki yönetici telefon numarasını kullanın.' : 'Sunucudaki yönetici hesabına ait e-posta adresini kullanın.');
        if (db.prepare('SELECT 1 FROM oses_recovery_devices WHERE id=?').get(body.deviceId)) authenticated(body);
        else db.prepare('INSERT INTO oses_recovery_devices(id,secret_hash,email) VALUES(?,?,?)').run(body.deviceId, digest(body.secret), owner);
        if (channel === 'phone') db.prepare('UPDATE oses_recovery_devices SET phone=?,phone_verified=CASE WHEN phone=? THEN phone_verified ELSE 0 END WHERE id=?').run(phone, phone, body.deviceId);
      } else {
        const device = authenticated(body);
        if (!(channel === 'phone' ? device.phone_verified && device.phone === phone : device.verified && device.email === owner)) throw new RecoveryError(409, channel === 'phone' ? 'Önce Ayarlar bölümünden telefon kurtarmasını etkinleştirin.' : 'Önce Ayarlar bölümünden e-posta kurtarmasını etkinleştirin.');
      }
      db.prepare('DELETE FROM oses_recovery_sends WHERE created<?').run(now - 86400000);
      db.prepare('DELETE FROM oses_recovery_challenges WHERE expires<?').run(now - 86400000);
      const sends = db.prepare('SELECT s.created FROM oses_recovery_sends s JOIN oses_recovery_challenges c ON c.id=s.challenge_id WHERE s.created>? AND c.channel=? ORDER BY s.created DESC').all(now - 3600000, channel);
      if (sends.length && now - sends[0].created < 60000) throw new RecoveryError(429, 'Yeni kod için 60 saniye bekleyin.');
      if (sends.length >= 3) throw new RecoveryError(429, 'Saatlik 3 kod sınırına ulaşıldı. Daha sonra tekrar deneyin.');
      db.prepare('UPDATE oses_recovery_challenges SET used=1 WHERE device_id=? AND purpose=? AND channel=?').run(body.deviceId, purpose, channel);
      db.prepare('INSERT INTO oses_recovery_challenges(id,device_id,purpose,code_hash,expires,channel,target) VALUES(?,?,?,?,?,?,?)').run(cid, body.deviceId, purpose, digest(cid + ':' + code), now + 600000, channel, target);
      db.prepare('INSERT INTO oses_recovery_sends VALUES(?,?)').run(cid, now);
    })();
    await durable(); // Reserve throttles durably before contacting the provider.
    let result;
    try {
      const label = purpose === 'enroll' ? 'Gmail kurtarmasını etkinleştir' : 'Şifreni yenile';
      result = channel === 'phone' ? await sendSms(phone, `O SES CIGKOFTE sifre yenileme kodunuz: ${code}. Kod 10 dakika gecerlidir. Kimseyle paylasmayin.`) : await send(owner, `O SES ÇİĞKÖFTE — ${label}`,
        `${label}\n\nDoğrulama kodunuz: ${code}\n\nKod 10 dakika geçerlidir ve yalnızca bir kez kullanılabilir.\nBu işlemi siz başlatmadıysanız kodu kimseyle paylaşmayın. Şifreniz değişmez.`);
    } catch {result = {status: 'failed'};}
    if (result?.status !== 'accepted' || !result.messageId) {
      db.prepare('UPDATE oses_recovery_challenges SET used=1 WHERE id=?').run(cid);
      await durable();
      throw new RecoveryError(503, channel === 'phone' ? 'SMS sağlayıcısı gönderimi kabul etmedi. Yeni kodu daha sonra isteyin.' : 'E-posta sağlayıcısı gönderimi tamamlayamadı. Kod gönderilmiş sayılmadı.');
    }
    db.prepare('UPDATE oses_recovery_challenges SET sent=1 WHERE id=?').run(cid);
    await durable();
    return {challengeId: cid, expiresIn: 600, retryAfter: 60, channel, destination: channel === 'phone' ? maskPhone(phone) : mask(owner), ...(channel === 'email' ? {email: mask(owner)} : {phone: maskPhone(phone)})};
  }
  async function verify(body, purpose) {
    identity(body);
    if (!['enroll', 'reset'].includes(purpose)) throw new RecoveryError(400, 'İşlem geçersiz.');
    const channel = channelOf(body);
    // Already delivered codes remain verifiable during a temporary provider outage.
    if (!coreReady()) throw new RecoveryError(503, 'Kurtarma hizmeti henüz hazır değil.');
    if (!hex64(body.challengeId)) throw new RecoveryError(400, 'Kod geçersiz veya süresi dolmuş.');
    let outcome;
    db.transaction(() => {
      const device = authenticated(body);
      const row = db.prepare('SELECT * FROM oses_recovery_challenges WHERE id=? AND device_id=? AND purpose=? AND channel=?').get(body.challengeId, body.deviceId, purpose, channel);
      const destination = row?.target || (channel === 'phone' ? device.phone : device.email);
      if (row && destination !== (channel === 'phone' ? phone : owner)) throw new RecoveryError(400, 'Kurtarma adresi değişti. Yeni kod isteyin.');
      if (!row || row.used || !row.sent || row.expires <= clock() || row.attempts >= 5) {
        outcome = new RecoveryError(400, 'Kod geçersiz veya süresi dolmuş. Yeni kod isteyin.'); return;
      }
      if (typeof body.code !== 'string' || !/^[0-9]{6}$/.test(body.code) || !equal(row.code_hash, digest(row.id + ':' + body.code))) {
        db.prepare('UPDATE oses_recovery_challenges SET attempts=attempts+1,used=CASE WHEN attempts>=4 THEN 1 ELSE 0 END WHERE id=?').run(row.id);
        outcome = new RecoveryError(400, 'Kod hatalı. Beş hatalı denemeden sonra yeni kod gerekir.'); return;
      }
      if (purpose === 'reset') {
        // A completed reset cancels every outstanding reset code for this device.
        db.prepare('UPDATE oses_recovery_challenges SET used=1 WHERE device_id=? AND purpose=?').run(body.deviceId, purpose);
      } else {
        db.prepare('UPDATE oses_recovery_challenges SET used=1 WHERE device_id=? AND purpose=? AND channel=?').run(body.deviceId, purpose, channel);
      }
      if (purpose === 'enroll') db.prepare(channel === 'phone' ? 'UPDATE oses_recovery_devices SET phone_verified=1 WHERE id=?' : 'UPDATE oses_recovery_devices SET verified=1 WHERE id=?').run(body.deviceId);
    })();
    // The host's general middleware skips error responses. Persist wrong-code counters explicitly.
    await durable();
    if (outcome) throw outcome;
    return {ok: true, purpose, channel};
  }
  return {request, verify, configured, phoneConfigured: () => coreReady() && Boolean(phone) && smsReady()};
}

export function installOSESRecovery(app) {
  const db = openDatabase();
  const pepper = env('OSES_RECOVERY_SECRET') || env('JWT_SECRET');
  const owner = env('OWNER_EMAIL').toLowerCase();
  const ownerPhone = normalizePhone(env('OWNER_PHONE')) || normalizePhone(db.prepare('SELECT phone FROM users WHERE email=?').get(owner)?.phone);
  // Render Free blocks SMTP ports. O SES uses the already configured Gmail HTTPS credentials.
  // Leave the default AESD provider unchanged.
  const mailProvider = env('OSES_MAIL_PROVIDER') || (emailConfigured('gmail') ? 'gmail' : 'resend');
  const persistenceReady = () => {
    const state = getPersistenceStatus(); return state.configured && state.healthy;
  };
  const service = createRecovery({db, pepper, ownerEmail: owner, ownerPhone, sendSms: sendSmsDetailed, smsReady: () => smsConfigured() && persistenceReady(), send: (...args) => sendEmailDetailed(...args, mailProvider),
    persist: persistDatabaseSnapshot, ready: () => emailConfigured(mailProvider) && persistenceReady()});
  const route = '/oses-recovery';
  app.get(route + '/health', async (_req, res) => {
    const transport = await checkEmailTransport(mailProvider);
    res.set('Cache-Control', 'no-store').json({ok: service.configured() && transport.ok, version: '1.3', smsConfigured: service.phoneConfigured(), phoneConfigured: Boolean(ownerPhone), ownerDestination: mask(owner),
      emailConfigured: emailConfigured(mailProvider), persistenceHealthy: persistenceReady(), ownerConfigured: Boolean(owner),
      emailProvider: mailProvider, transport});
  });
  app.get(route + '/providers', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({emailConfigured: service.configured(), smsConfigured: service.phoneConfigured(), ownerDestination: mask(owner), phoneDestination: maskPhone(ownerPhone)});
  });
  app.post([route + '/v1/:purpose/:action', route + '/v2/:purpose/:action'], async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    const {purpose, action} = req.params;
    if (!['enroll', 'reset'].includes(purpose) || !['request', 'verify'].includes(action)) return res.status(404).json({message: 'İşlem bulunamadı.'});
    if (JSON.stringify(req.body || {}).length > 4096) return res.status(413).json({message: 'İstek çok büyük.'});
    try {return res.json(await service[action](req.path.includes('/v1/') ? {...req.body, channel: 'email'} : req.body, purpose));}
    catch (error) {return res.status(error instanceof RecoveryError ? error.status : 503).json({message: error instanceof RecoveryError ? error.message : 'Kurtarma hizmetine ulaşılamadı.'});}
  });
}

