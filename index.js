import {verifyRelease} from './release-check.mjs';
import {registerPublicPages} from './public-pages.js';
import {installOSESRecovery} from './oses-recovery.js';
import {emailConfigured, sendEmailDetailed, recoveryProvider} from './mail-provider.js';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {openDatabase} from './shared-database.js';
import crypto from 'crypto';
import {getPool,getPersistenceStatus, probePersistence, initializePersistentSnapshot, installPersistenceMiddleware, persistDatabaseSnapshot} from './persistence.js';
import {installHealthRoutes} from './health.js';
import {installPlatform} from './platform/server/install-platform.mjs';
import {postgresRepository} from './platform/server/cloud-repository.mjs';
import {legacyControlMiddleware} from './platform/server/legacy-control.mjs';
import {authenticateUser,bindLoginDevice} from './legacy-auth.js';

const app = express();
let centralPlatform;
app.set('trust proxy', 1);
app.use(cors());
app.use('/aesd/v1/cloud',express.json({limit:'17mb'}));
app.use(express.json({limit: '128kb'}));
installPersistenceMiddleware(app);
app.use(legacyControlMiddleware(()=>centralPlatform));
registerPublicPages(app);

const db = openDatabase();
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'CLIENT',
    active INTEGER NOT NULL DEFAULT 1,
    session_version INTEGER NOT NULL DEFAULT 0,
    phone TEXT,
    license_until TEXT,
    device_key_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS activation_licenses(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT,
    code_hash TEXT UNIQUE NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT NOT NULL,
    device_key_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS phone_licenses(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT,
    phone TEXT UNIQUE NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT NOT NULL,
    device_key_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS phone_otps(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS password_resets(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS audit(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    meta TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_activation_code ON activation_licenses(code_hash);
  CREATE INDEX IF NOT EXISTS idx_phone_license_phone ON phone_licenses(phone);
  CREATE INDEX IF NOT EXISTS idx_phone_otp_phone ON phone_otps(phone, created_at);
  CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit(user_id, created_at);
`);
// Old account files can lack the columns used by the current auth routes.
for(const [name,definition] of [['session_version','INTEGER NOT NULL DEFAULT 0'],['phone','TEXT']]){
  if(!db.prepare('PRAGMA table_info(users)').all().some(column=>column.name===name))db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
}

const generatedJwtSecret = crypto.randomBytes(48).toString('hex');
const SECRET = process.env.JWT_SECRET || generatedJwtSecret;
if (!process.env.JWT_SECRET) console.warn('UYARI: JWT_SECRET ayarlı değil. Yeniden başlatmada oturumlar geçersiz olur.');

const OWNER_EMAIL = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
const OWNER_PASSWORD = String(process.env.OWNER_PASSWORD || '');
const SECURITY_NOTIFY_EMAIL = String(process.env.SECURITY_NOTIFY_EMAIL || 'ozlusuat7@gmail.com').trim();
const SECURITY_FROM_EMAIL = String(process.env.SECURITY_FROM_EMAIL || '').trim();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim();
const TWILIO_ACCOUNT_SID = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
const TWILIO_AUTH_TOKEN = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
const TWILIO_FROM_NUMBER = String(process.env.TWILIO_FROM_NUMBER || '').trim();
const PORT = Number(process.env.PORT || 8787);

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_THRESHOLD = 8;
const LOGIN_IP_LOCK_THRESHOLD = 30;
const LOGIN_NOTIFY_THRESHOLD = 3;
const LOGIN_NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;
const SECURITY_ALERT_GAP_MS = 10 * 60 * 1000;
const RESET_WINDOW_MS = 15 * 60 * 1000;
const RESET_COOLDOWN_MS = 60 * 1000;
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_WINDOW_MS = 15 * 60 * 1000;
const failedLogins = new Map();
const failedLoginsByIp = new Map();
const resetRequests = new Map();
const otpRequests = new Map();
let lastSecurityAlertAt = 0;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizePhone = (value) => {
  let raw = String(value || '').trim().replace(/[^\d+]/g, '');
  if (raw.startsWith('00')) raw = `+${raw.slice(2)}`;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('5')) return `+90${digits}`;
  if (digits.length === 11 && digits.startsWith('05')) return `+90${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('90')) return `+${digits}`;
  if (raw.startsWith('+') && /^\+[1-9]\d{9,14}$/.test(raw)) return raw;
  return '';
};
const maskPhone = (value) => {
  const p = normalizePhone(value);
  if (!p) return '';
  return `${p.slice(0, 4)}••••${p.slice(-4)}`;
};
const hashDevice = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const hashCode = (value) => crypto.createHash('sha256').update(String(value || '').trim().toUpperCase()).digest('hex');
const hashResetCode = (email, code) => crypto.createHash('sha256').update(`${normalizeEmail(email)}:${String(code || '').trim()}:${SECRET}`).digest('hex');
const hashOtp = (phone, code) => crypto.createHash('sha256').update(`${normalizePhone(phone)}:${String(code || '').trim()}:${SECRET}`).digest('hex');
const sign = (user) => jwt.sign({id: user.id, role: user.role, kind: 'user', v: user.session_version || 0}, SECRET, {expiresIn: '7d'});
const signActivation = (license) => jwt.sign({licenseId: license.id, role: 'CLIENT', kind: 'activation'}, SECRET, {expiresIn: '7d'});
const signPhone = (license) => jwt.sign({phoneLicenseId: license.id, role: 'CLIENT', kind: 'phone-license'}, SECRET, {expiresIn: '7d'});
const safeUser = (user) => user ? ({id: user.id, email: user.email, role: user.role, active: Boolean(user.active), license_until: user.license_until || null}) : null;

function audit(userId, action, meta = {}) {
  try { db.prepare('INSERT INTO audit(user_id,action,meta) VALUES(?,?,?)').run(userId || null, action, JSON.stringify(meta)); }
  catch (error) { console.error('Audit kaydı yazılamadı:', error.message); }
}

async function sendEmail(to, subject, details) {
  return (await sendEmailDetailed(to, subject, details)).status === 'accepted';
}

async function sendSms(to, message) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) return false;
  const body = new URLSearchParams({To: to, From: TWILIO_FROM_NUMBER, Body: message});
  let response;
  try {
    response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    console.error('SMS bağlantı hatası:', error.name);
    return false;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('SMS gönderilemedi:', response.status, text.slice(0, 300));
    return false;
  }
  return true;
}

async function sendSecurityEmail(subject, details) { return sendEmail(SECURITY_NOTIFY_EMAIL, subject, details); }

function pruneLoginMaps(now = Date.now()) {
  for (const [key, row] of failedLogins) if (now - row.firstAt > LOGIN_WINDOW_MS) failedLogins.delete(key);
  for (const [key, row] of failedLoginsByIp) if (now - row.firstAt > LOGIN_WINDOW_MS) failedLoginsByIp.delete(key);
}
function isLoginLocked(email, ip) {
  const now = Date.now();
  pruneLoginMaps(now);
  const account = failedLogins.get(`${normalizeEmail(email)}|${ip || 'unknown'}`);
  const address = failedLoginsByIp.get(ip || 'unknown');
  return Boolean(account && account.count >= LOGIN_LOCK_THRESHOLD && now - account.firstAt <= LOGIN_WINDOW_MS)
    || Boolean(address && address.count >= LOGIN_IP_LOCK_THRESHOLD && now - address.firstAt <= LOGIN_WINDOW_MS);
}
function recordFailedLogin(email, ip) {
  const now = Date.now();
  pruneLoginMaps(now);
  const key = `${normalizeEmail(email)}|${ip || 'unknown'}`;
  const previous = failedLogins.get(key);
  const state = !previous || now - previous.firstAt > LOGIN_WINDOW_MS
    ? {count: 1, firstAt: now, lastAt: now, notifiedAt: 0}
    : {...previous, count: previous.count + 1, lastAt: now};
  failedLogins.set(key, state);
  const addressKey = ip || 'unknown';
  const address = failedLoginsByIp.get(addressKey);
  failedLoginsByIp.set(addressKey, !address || now - address.firstAt > LOGIN_WINDOW_MS ? {count: 1, firstAt: now} : {count: address.count + 1, firstAt: address.firstAt});
  if (state.count >= LOGIN_NOTIFY_THRESHOLD && now - state.notifiedAt >= LOGIN_NOTIFY_COOLDOWN_MS && now - lastSecurityAlertAt >= SECURITY_ALERT_GAP_MS) {
    state.notifiedAt = now;
    lastSecurityAlertAt = now;
    failedLogins.set(key, state);
    // Do not wait for the alert e-mail inside the shared sales queue.
    void sendSecurityEmail('AESD güvenlik uyarısı: başarısız giriş denemeleri', `E-posta: ${normalizeEmail(email) || '(boş)'}\nIP: ${ip || 'bilinmiyor'}\nDeneme: ${state.count}\nZaman: ${new Date(now).toISOString()}`).catch(() => undefined);
  }
}

function clearFailedLogins(email, ip) { failedLogins.delete(`${normalizeEmail(email)}|${ip || 'unknown'}`); }
function allowResetRequest(email, ip) {
  const now = Date.now();
  const key = `${normalizeEmail(email)}|${ip || 'unknown'}`;
  const previous = resetRequests.get(key);
  if (previous && now - previous.lastAt < RESET_COOLDOWN_MS) return false;
  const next = !previous || now - previous.firstAt > RESET_WINDOW_MS
    ? {count: 1, firstAt: now, lastAt: now}
    : {count: previous.count + 1, firstAt: previous.firstAt, lastAt: now};
  resetRequests.set(key, next);
  return next.count <= 5;
}
function allowOtpRequest(phone, ip) {
  const now = Date.now();
  const key = `${phone}|${ip || 'unknown'}`;
  const previous = otpRequests.get(key);
  if (previous && now - previous.lastAt < OTP_COOLDOWN_MS) return false;
  const next = !previous || now - previous.firstAt > OTP_WINDOW_MS
    ? {count: 1, firstAt: now, lastAt: now}
    : {count: previous.count + 1, firstAt: previous.firstAt, lastAt: now};
  otpRequests.set(key, next);
  return next.count <= 5;
}

function auth(req, res, next) {
  try {
    const raw = String(req.headers.authorization || '');
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
    if (!token) return res.status(401).json({error: 'Oturum gerekli'});
    req.user = authenticateUser(db,token,SECRET).payload;
    next();
  } catch (_) { res.status(401).json({error: 'Oturum geçersiz'}); }
}
function ownerOnly(req, res, next) {
  const current=req.user?.id&&db.prepare('SELECT role,active FROM users WHERE id=?').get(req.user.id);
  if (req.user?.role !== 'OWNER'||!current?.active||current.role!=='OWNER') return res.status(403).json({error: 'Yönetici yetkisi gerekli'});
  next();
}
function createActivationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  let chars = '';
  for (let i = 0; i < 12; i += 1) chars += alphabet[bytes[i] % alphabet.length];
  return `AESD-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

if (OWNER_EMAIL && OWNER_PASSWORD && !db.prepare('SELECT 1 FROM users WHERE email=?').get(OWNER_EMAIL)) {
  const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 12);
  db.prepare("INSERT INTO users(email,password_hash,role,active) VALUES(?,?, 'OWNER',1)").run(OWNER_EMAIL, passwordHash);
  console.log('AESD OWNER hesabı oluşturuldu.');
}

const withControlHealth=status=>({...status,healthy:status.healthy&&centralPlatform?.ready()!==false});
installHealthRoutes(app, {status:()=>withControlHealth(getPersistenceStatus()),probe:async()=>withControlHealth(await probePersistence()),
  phoneOtpConfigured:Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER),
  commit:process.env.RENDER_GIT_COMMIT || null});

app.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const deviceKey = String(req.body?.deviceKey || '');
  const buildVariant = req.body?.buildVariant === 'owner' ? 'owner' : 'client';
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (isLoginLocked(email, ip)) return res.status(429).json({error: 'Çok fazla başarısız giriş. 15 dakika sonra tekrar deneyin.'});
  if (!email || !password || !deviceKey) {
    recordFailedLogin(email, ip);
    return res.status(400).json({error: 'E-posta, şifre ve cihaz kimliği gerekli'});
  }
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  const passwordOk = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !passwordOk) {
    recordFailedLogin(email, ip);
    audit(user?.id, 'LOGIN_FAILED', {email, ip});
    return res.status(401).json({error: 'E-posta veya şifre hatalı'});
  }
  clearFailedLogins(email, ip);
  const deviceHash = hashDevice(deviceKey);
  let current;
  try { current=bindLoginDevice(db,user,deviceHash,buildVariant); }
  catch(error) { return res.status(error.status||500).json({error:error.status?error.message:'Giriş tamamlanamadı.'}); }
  audit(current.id, 'LOGIN', {buildVariant, ip});
  res.json({token: sign(current), user: safeUser(current)});
});

app.post('/v1/phone/request', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!phone) return res.status(400).json({error: 'Geçerli telefon numarası gerekli'});
  const license = db.prepare('SELECT * FROM phone_licenses WHERE phone=?').get(phone);
  if (!license || !license.active || Date.parse(license.expires_at) <= Date.now()) {
    audit(null, 'PHONE_OTP_DENIED', {phone: maskPhone(phone), ip});
    return res.status(403).json({error: 'Bu telefon numarası için aktif AESD lisansı bulunmuyor'});
  }
  if (!allowOtpRequest(phone, ip)) return res.status(429).json({error: 'Çok sık kod istendi. Biraz bekleyip tekrar deneyin.'});
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) return res.status(503).json({error: 'SMS doğrulama servisi henüz yapılandırılmamış'});
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  db.prepare('UPDATE phone_otps SET used=1 WHERE phone=? AND used=0').run(phone);
  const result = db.prepare('INSERT INTO phone_otps(phone,code_hash,expires_at) VALUES(?,?,?)').run(phone, hashOtp(phone, code), expiresAt);
  const delivered = await sendSms(phone, `AESD-Kasa doğrulama kodunuz: ${code}. Kod 5 dakika geçerlidir.`).catch(() => false);
  if (!delivered) {
    db.prepare('UPDATE phone_otps SET used=1 WHERE id=?').run(result.lastInsertRowid);
    return res.status(503).json({error: 'SMS gönderilemedi. Daha sonra tekrar deneyin.'});
  }
  audit(null, 'PHONE_OTP_SENT', {phone: maskPhone(phone), ip, licenseId: license.id});
  res.json({ok: true, phone: maskPhone(phone), expiresIn: 300});
});

app.post('/v1/phone/verify', (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || '').trim();
  const deviceId = String(req.body?.deviceId || '');
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!phone || !/^\d{6}$/.test(code) || !deviceId) return res.status(400).json({error: 'Telefon, 6 haneli kod ve cihaz kimliği gerekli'});
  const license = db.prepare('SELECT * FROM phone_licenses WHERE phone=?').get(phone);
  if (!license || !license.active) return res.status(403).json({error: 'Telefon lisansı pasif veya bulunamadı'});
  if (Date.parse(license.expires_at) <= Date.now()) return res.status(403).json({error: 'Telefon lisansının süresi dolmuş'});
  const otp = db.prepare('SELECT * FROM phone_otps WHERE phone=? AND used=0 ORDER BY id DESC LIMIT 1').get(phone);
  if (!otp || Date.parse(otp.expires_at) <= Date.now() || otp.attempts >= 5) {
    if (otp) db.prepare('UPDATE phone_otps SET used=1 WHERE id=?').run(otp.id);
    return res.status(400).json({error: 'Kod geçersiz veya süresi dolmuş'});
  }
  if (otp.code_hash !== hashOtp(phone, code)) {
    db.prepare('UPDATE phone_otps SET attempts=attempts+1 WHERE id=?').run(otp.id);
    audit(null, 'PHONE_OTP_FAILED', {phone: maskPhone(phone), ip});
    return res.status(400).json({error: 'Kod geçersiz veya süresi dolmuş'});
  }
  const deviceHash = hashDevice(deviceId);
  if (!license.device_key_hash) db.prepare('UPDATE phone_licenses SET device_key_hash=? WHERE id=?').run(deviceHash, license.id);
  else if (license.device_key_hash !== deviceHash) return res.status(403).json({error: 'Bu telefon lisansı başka bir cihaza bağlı. Yönetici cihaz bağını sıfırlamalı.'});
  db.prepare('UPDATE phone_otps SET used=1 WHERE id=?').run(otp.id);
  db.prepare('UPDATE phone_licenses SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').run(license.id);
  audit(null, 'PHONE_LOGIN_SUCCESS', {phone: maskPhone(phone), ip, licenseId: license.id});
  res.json({active: true, token: signPhone(license), user: {role: 'CLIENT', active: true, phone: maskPhone(phone), phoneAuth: true, expiresAt: license.expires_at}});
});

app.post('/v1/phone/validate', (req, res) => {
  const token = String(req.body?.token || '');
  const deviceId = String(req.body?.deviceId || '');
  if (!token || !deviceId) return res.status(400).json({active: false, reason: 'missing'});
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload?.kind !== 'phone-license' || !payload?.phoneLicenseId) return res.status(401).json({active: false, reason: 'invalid-token'});
    const license = db.prepare('SELECT * FROM phone_licenses WHERE id=?').get(payload.phoneLicenseId);
    if (!license || !license.active) return res.status(403).json({active: false, reason: 'revoked'});
    if (Date.parse(license.expires_at) <= Date.now()) return res.status(403).json({active: false, reason: 'expired'});
    if (license.device_key_hash !== hashDevice(deviceId)) return res.status(403).json({active: false, reason: 'device-mismatch'});
    db.prepare('UPDATE phone_licenses SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').run(license.id);
    res.json({active: true, role: 'CLIENT', phone: maskPhone(license.phone), phoneAuth: true, expiresAt: license.expires_at});
  } catch (_) { res.status(401).json({active: false, reason: 'invalid-token'}); }
});

app.post('/password-reset/request', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!email) return res.status(400).json({error: 'E-posta gerekli'});
  if (!emailConfigured()) return res.status(503).json({error: 'Şifre yenileme e-posta servisi henüz yapılandırılmamış'});
  if (!allowResetRequest(email, ip)) return res.status(429).json({error: 'Çok sık istek gönderildi. Biraz bekleyip tekrar deneyin.'});
  const user = db.prepare('SELECT id,email,active FROM users WHERE email=?').get(email);
  if (!user || !user.active) return res.json({ok: true, message: 'Hesap mevcutsa doğrulama kodu e-posta adresine gönderildi.'});
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS).toISOString();
  db.prepare('UPDATE password_resets SET used=1 WHERE user_id=? AND used=0').run(user.id);
  db.prepare('INSERT INTO password_resets(user_id,code_hash,expires_at) VALUES(?,?,?)').run(user.id, hashResetCode(email, code), expiresAt);
  const delivered = await sendEmail(user.email, 'AESD-Kasa şifre yenileme kodu', `AESD-Kasa şifre yenileme kodunuz: ${code}\n\nBu kod 10 dakika geçerlidir.`).catch(() => false);
  if (!delivered) return res.status(503).json({error: 'Şifre yenileme e-postası gönderilemedi.'});
  audit(user.id, 'PASSWORD_RESET_REQUESTED', {ip});
  res.json({ok: true, message: 'Doğrulama kodu e-posta adresinize gönderildi.'});
});

app.post('/password-reset/confirm', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || '').trim();
  const newPassword = String(req.body?.newPassword || '');
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!email || !/^\d{6}$/.test(code) || newPassword.length < 8) return res.status(400).json({error: 'Geçerli e-posta, 6 haneli kod ve en az 8 karakter yeni şifre gerekli'});
  const user = db.prepare('SELECT id,email,active FROM users WHERE email=?').get(email);
  if (!user || !user.active) return res.status(400).json({error: 'Kod geçersiz veya süresi dolmuş'});
  const reset = db.prepare('SELECT * FROM password_resets WHERE user_id=? AND used=0 ORDER BY id DESC LIMIT 1').get(user.id);
  if (!reset || Date.parse(reset.expires_at) <= Date.now() || reset.attempts >= 5) return res.status(400).json({error: 'Kod geçersiz veya süresi dolmuş'});
  if (reset.code_hash !== hashResetCode(email, code)) {
    db.prepare('UPDATE password_resets SET attempts=attempts+1 WHERE id=?').run(reset.id);
    return res.status(400).json({error: 'Kod geçersiz veya süresi dolmuş'});
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const changePassword = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?').run(passwordHash, user.id);
    db.prepare('UPDATE password_resets SET used=1 WHERE user_id=? AND used=0').run(user.id);
  });
  changePassword();
  clearFailedLogins(email, ip);
  audit(user.id, 'PASSWORD_RESET_COMPLETED', {ip});
  res.json({ok: true, message: 'Şifreniz yenilendi.'});
});

app.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT id,email,role,active,license_until FROM users WHERE id=?').get(req.user.id);
  if (!user || !user.active) return res.status(401).json({error: 'Hesap aktif değil'});
  if (user.role !== 'OWNER' && (!user.license_until || Date.parse(user.license_until) <= Date.now())) return res.status(403).json({error: 'Lisans süresi dolmuş'});
  res.json(safeUser(user));
});

app.post('/v1/licenses/activate', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const deviceId = String(req.body?.deviceId || '');
  if (!code || !deviceId) return res.status(400).json({error: 'Aktivasyon kodu ve cihaz kimliği gerekli'});
  const license = db.prepare('SELECT * FROM activation_licenses WHERE code_hash=?').get(hashCode(code));
  if (!license || !license.active) return res.status(403).json({error: 'Aktivasyon kodu geçersiz veya pasif'});
  if (Date.parse(license.expires_at) <= Date.now()) return res.status(403).json({error: 'Aktivasyon kodunun süresi dolmuş'});
  const deviceHash = hashDevice(deviceId);
  if (!license.device_key_hash) db.prepare('UPDATE activation_licenses SET device_key_hash=?, last_used_at=CURRENT_TIMESTAMP WHERE id=?').run(deviceHash, license.id);
  else if (license.device_key_hash !== deviceHash) return res.status(403).json({error: 'Bu aktivasyon kodu başka bir cihaza bağlı'});
  else db.prepare('UPDATE activation_licenses SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').run(license.id);
  audit(null, 'ACTIVATION_SUCCESS', {licenseId: license.id});
  res.json({active: true, token: signActivation(license), expiresAt: license.expires_at});
});

app.post('/v1/licenses/validate', (req, res) => {
  const token = String(req.body?.token || '');
  const deviceId = String(req.body?.deviceId || '');
  if (!token || !deviceId) return res.status(400).json({active: false, reason: 'missing'});
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload?.kind !== 'activation' || !payload?.licenseId) return res.status(401).json({active: false, reason: 'invalid-token'});
    const license = db.prepare('SELECT * FROM activation_licenses WHERE id=?').get(payload.licenseId);
    if (!license || !license.active) return res.status(403).json({active: false, reason: 'revoked'});
    if (Date.parse(license.expires_at) <= Date.now()) return res.status(403).json({active: false, reason: 'expired'});
    if (license.device_key_hash !== hashDevice(deviceId)) return res.status(403).json({active: false, reason: 'device-mismatch'});
    db.prepare('UPDATE activation_licenses SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').run(license.id);
    res.json({active: true, role: 'CLIENT', expiresAt: license.expires_at});
  } catch (_) { res.status(401).json({active: false, reason: 'invalid-token'}); }
});

app.get('/summary', auth, (_req, res) => res.json({net: '₺0', receivables: '₺0', risk: '0/100', today: '₺0', brief: 'AESD hazır.'}));

app.get('/admin/users', auth, ownerOnly, (_req, res) => {
  const users = db.prepare(`SELECT id,email,role,active,license_until,CASE WHEN device_key_hash IS NULL THEN 0 ELSE 1 END AS device_bound,created_at FROM users ORDER BY id DESC`).all();
  res.json({users});
});
app.post('/admin/users', auth, ownerOnly, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const days = Math.max(1, Math.min(3650, Number(req.body?.days || 30)));
  if (!email || password.length < 8) return res.status(400).json({error: 'Geçerli e-posta ve en az 8 karakter şifre gerekli'});
  const until = new Date(Date.now() + days * 86400000).toISOString();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare("INSERT INTO users(email,password_hash,role,active,license_until) VALUES(?,?, 'CLIENT',1,?)").run(email, passwordHash, until);
    audit(req.user.id, 'CLIENT_CREATED', {clientId: result.lastInsertRowid, email, until});
    res.json({id: result.lastInsertRowid, email, license_until: until});
  } catch (_) { res.status(400).json({error: 'Kullanıcı oluşturulamadı veya e-posta mevcut'}); }
});

app.get('/admin/phone-licenses', auth, ownerOnly, (_req, res) => {
  const licenses = db.prepare(`SELECT id,label,phone,active,expires_at,CASE WHEN device_key_hash IS NULL THEN 0 ELSE 1 END AS device_bound,created_at,last_used_at FROM phone_licenses ORDER BY id DESC`).all();
  res.json({licenses: licenses.map((x) => ({...x, phone_display: maskPhone(x.phone)}))});
});
app.post('/admin/phone-licenses', auth, ownerOnly, (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const label = String(req.body?.label || '').trim().slice(0, 120);
  const days = Math.max(1, Math.min(3650, Number(req.body?.days || 30)));
  if (!phone) return res.status(400).json({error: 'Geçerli telefon numarası gerekli'});
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  try {
    const result = db.prepare('INSERT INTO phone_licenses(label,phone,expires_at) VALUES(?,?,?)').run(label, phone, expiresAt);
    audit(req.user.id, 'PHONE_LICENSE_CREATED', {licenseId: result.lastInsertRowid, phone: maskPhone(phone), label, expiresAt});
    res.json({id: result.lastInsertRowid, phone: maskPhone(phone), label, expiresAt});
  } catch (_) { res.status(400).json({error: 'Bu telefon numarası zaten kayıtlı olabilir'}); }
});
app.post('/admin/phone-licenses/:id/reset-device', auth, ownerOnly, (req, res) => {
  if(!db.prepare('UPDATE phone_licenses SET device_key_hash=NULL WHERE id=?').run(req.params.id).changes)return res.status(404).json({error:'Kayıt bulunamadı'});
  audit(req.user.id, 'PHONE_LICENSE_DEVICE_RESET', {licenseId: req.params.id});
  res.json({ok: true});
});
app.post('/admin/phone-licenses/:id/suspend', auth, ownerOnly, (req, res) => {
  if(!db.prepare('UPDATE phone_licenses SET active=0 WHERE id=?').run(req.params.id).changes)return res.status(404).json({error:'Kayıt bulunamadı'});
  audit(req.user.id, 'PHONE_LICENSE_SUSPENDED', {licenseId: req.params.id});
  res.json({ok: true});
});
app.post('/admin/phone-licenses/:id/resume', auth, ownerOnly, (req, res) => {
  if(!db.prepare('UPDATE phone_licenses SET active=1 WHERE id=?').run(req.params.id).changes)return res.status(404).json({error:'Kayıt bulunamadı'});
  audit(req.user.id, 'PHONE_LICENSE_RESUMED', {licenseId: req.params.id});
  res.json({ok: true});
});
app.post('/admin/phone-licenses/:id/extend', auth, ownerOnly, (req, res) => {
  const days = Math.max(1, Math.min(3650, Number(req.body?.days || 30)));
  const license = db.prepare('SELECT id,expires_at FROM phone_licenses WHERE id=?').get(req.params.id);
  if (!license) return res.status(404).json({error: 'Telefon lisansı bulunamadı'});
  const base = Date.parse(license.expires_at) > Date.now() ? Date.parse(license.expires_at) : Date.now();
  const expiresAt = new Date(base + days * 86400000).toISOString();
  db.prepare('UPDATE phone_licenses SET expires_at=?, active=1 WHERE id=?').run(expiresAt, license.id);
  audit(req.user.id, 'PHONE_LICENSE_EXTENDED', {licenseId: license.id, days, expiresAt});
  res.json({ok: true, expiresAt});
});

app.get('/admin/licenses', auth, ownerOnly, (_req, res) => {
  const licenses = db.prepare(`SELECT id,label,active,expires_at,CASE WHEN device_key_hash IS NULL THEN 0 ELSE 1 END AS device_bound,created_at,last_used_at FROM activation_licenses ORDER BY id DESC`).all();
  res.json({licenses});
});
app.post('/admin/licenses', auth, ownerOnly, (req, res) => {
  const days = Math.max(1, Math.min(3650, Number(req.body?.days || 30)));
  const label = String(req.body?.label || '').trim().slice(0, 120);
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createActivationCode();
    try {
      const result = db.prepare('INSERT INTO activation_licenses(label,code_hash,expires_at) VALUES(?,?,?)').run(label, hashCode(code), expiresAt);
      audit(req.user.id, 'ACTIVATION_LICENSE_CREATED', {licenseId: result.lastInsertRowid, label, expiresAt});
      return res.json({id: result.lastInsertRowid, code, label, expiresAt});
    } catch (_) {}
  }
  res.status(500).json({error: 'Aktivasyon kodu oluşturulamadı'});
});
app.post('/admin/licenses/:id/reset-device', auth, ownerOnly, (req, res) => { if(!db.prepare('UPDATE activation_licenses SET device_key_hash=NULL WHERE id=?').run(req.params.id).changes)return res.status(404).json({error:'Kayıt bulunamadı'}); res.json({ok: true}); });
app.post('/admin/licenses/:id/suspend', auth, ownerOnly, (req, res) => { if(!db.prepare('UPDATE activation_licenses SET active=0 WHERE id=?').run(req.params.id).changes)return res.status(404).json({error:'Kayıt bulunamadı'}); res.json({ok: true}); });
app.post('/admin/licenses/:id/resume', auth, ownerOnly, (req, res) => { if(!db.prepare('UPDATE activation_licenses SET active=1 WHERE id=?').run(req.params.id).changes)return res.status(404).json({error:'Kayıt bulunamadı'}); res.json({ok: true}); });

app.post('/admin/reset-device/:id', auth, ownerOnly, (req, res) => { if(!db.prepare("UPDATE users SET device_key_hash=NULL WHERE id=? AND role='CLIENT'").run(req.params.id).changes)return res.status(404).json({error:'Kayıt bulunamadı'}); res.json({ok: true}); });
app.post('/admin/suspend/:id', auth, ownerOnly, (req, res) => { if(!db.prepare("UPDATE users SET active=0 WHERE id=? AND role='CLIENT'").run(req.params.id).changes)return res.status(404).json({error:'Kayıt bulunamadı'}); res.json({ok: true}); });
app.post('/admin/resume/:id', auth, ownerOnly, (req, res) => { if(!db.prepare("UPDATE users SET active=1 WHERE id=? AND role='CLIENT'").run(req.params.id).changes)return res.status(404).json({error:'Kayıt bulunamadı'}); res.json({ok: true}); });
app.post('/admin/extend/:id', auth, ownerOnly, (req, res) => {
  const days = Math.max(1, Math.min(3650, Number(req.body?.days || 30)));
  const user = db.prepare("SELECT id,license_until FROM users WHERE id=? AND role='CLIENT'").get(req.params.id);
  if (!user) return res.status(404).json({error: 'Müşteri bulunamadı'});
  const current = user.license_until && Date.parse(user.license_until) > Date.now() ? Date.parse(user.license_until) : Date.now();
  const until = new Date(current + days * 86400000).toISOString();
  db.prepare('UPDATE users SET license_until=?, active=1 WHERE id=?').run(until, user.id);
  res.json({ok: true, license_until: until});
});
app.get('/admin/audit', auth, ownerOnly, (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 100)));
  res.json({audit: db.prepare('SELECT id,user_id,action,meta,created_at FROM audit ORDER BY id DESC LIMIT ?').all(limit)});
});

installOSESRecovery(app);

// Add business registration and sector licenses without changing old accounts.
if (typeof process.env.JWT_SECRET === 'string' && process.env.JWT_SECRET.length >= 32) {
  const cloudRepository=getPool()?postgresRepository(getPool()):undefined;
  await cloudRepository?.ready();
  centralPlatform=installPlatform(app, {
    db, secret: process.env.JWT_SECRET, passwords: bcrypt,
    mail: {provider: recoveryProvider(), configured: () => emailConfigured(recoveryProvider()), send: (to, subject, text) => sendEmailDetailed(to, subject, text, recoveryProvider())},
    persist: persistDatabaseSnapshot,
    cloudRepository,
    ready: () => {const s = getPersistenceStatus(); return s.configured && s.healthy;},
  });
  const designatedAdministrator=db.prepare('SELECT role,active FROM users WHERE email=?').get('ozlusuat7@gmail.com');
  console.info('AESD primary-admin-check',JSON.stringify({exists:Boolean(designatedAdministrator),active:Boolean(designatedAdministrator?.active),owner:designatedAdministrator?.role==='OWNER'}));
} else {
  console.warn('AESD central licensing needs a stable JWT_SECRET with at least 32 characters.');
}


app.use((error, _req, res, _next) => {
  console.error('AESD server error:', error);
  res.status(500).json({error: 'Sunucu hatası'});
});

await initializePersistentSnapshot();
const server=app.listen(PORT,'0.0.0.0',async()=>{
 console.log(`AESD server running on ${server.address().port}`);
 if(process.env.RENDER_GIT_COMMIT)try{
  const result=await verifyRelease({origin:'http://127.0.0.1:'+server.address().port,healthPath:'/ready',commit:process.env.RENDER_GIT_COMMIT,assets:["app.js", "config.json", "owner-console.js", "owner-console.css", "account-ui.js", "appearance.css", "business-ui.js", "pos.js", "backup-validation.js", "menu.js", "sw.js"].map(name=>({path:'/aesd/'+name,file:new URL('./platform/web/'+name,import.meta.url)}))});
  console.log(JSON.stringify(result));
 }catch{console.error(JSON.stringify({event:'release_verification',ok:false,commit:process.env.RENDER_GIT_COMMIT}));process.exit(1);}
});


