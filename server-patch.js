import {emailConfigured, sendEmailDetailed} from './mail-provider.js';
import express from 'express';
import {openDatabase} from './shared-database.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const db = openDatabase();
let ownerMiddlewares = null;
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_SECRET = String(process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex'));
const requestWindows = new Map();


db.exec(`
  CREATE TABLE IF NOT EXISTS account_security_codes(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    purpose TEXT NOT NULL,
    channel TEXT NOT NULL,
    target TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_account_security_codes
  ON account_security_codes(user_id,purpose,channel,created_at);
`);

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
  const phone = normalizePhone(value);
  return phone ? `${phone.slice(0, 4)}••••${phone.slice(-4)}` : '';
};
const maskEmail = (value) => {
  const email = normalizeEmail(value);
  const [name, domain] = email.split('@');
  if (!name || !domain) return '';
  return `${name.slice(0, 2)}•••@${domain}`;
};
const hashSecurityCode = (userId, purpose, channel, target, code) => crypto
  .createHash('sha256')
  .update(`${userId}:${purpose}:${channel}:${target}:${code}:${CODE_SECRET}`)
  .digest('hex');

function audit(userId, action, meta = {}) {
  try {
    db.prepare('INSERT INTO audit(user_id,action,meta) VALUES(?,?,?)').run(userId || null, action, JSON.stringify(meta));
  } catch (error) {
    console.error('Patch audit kaydı yazılamadı:', error.message);
  }
}

function allowRequest(key) {
  const now = Date.now();
  const previous = requestWindows.get(key);
  if (previous && now - previous.lastAt < 60_000) return false;
  const next = !previous || now - previous.firstAt > 15 * 60_000
    ? {count: 1, firstAt: now, lastAt: now}
    : {count: previous.count + 1, firstAt: previous.firstAt, lastAt: now};
  requestWindows.set(key, next);
  return next.count <= 5;
}

async function sendSmsDetailed(to, message) {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const from = String(process.env.TWILIO_FROM_NUMBER || '').trim();
  if (!accountSid || !authToken || !from) {
    return {status: 'failed', error: 'SMS servisi yapılandırılmamış. Twilio bilgileri eksik.'};
  }
  try {
    const body = new URLSearchParams({To: to, From: from, Body: message});
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = String(payload?.message || '').trim();
      console.error('SMS gönderilemedi:', response.status, providerMessage.slice(0, 300));
      return {status: 'failed', error: providerMessage || `SMS sağlayıcısı hata verdi (${response.status}).`};
    }
    return {status: 'accepted', providerStatus: payload?.status || 'queued', messageId: payload?.sid || null};
  } catch (error) {
    console.error('SMS bağlantı hatası:', error.message);
    return {status: 'failed', error: 'SMS sağlayıcısına ulaşılamadı.'};
  }
}


function createCodeRecord(userId, purpose, channel, target) {
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  db.prepare('UPDATE account_security_codes SET used=1 WHERE user_id=? AND purpose=? AND channel=? AND used=0')
    .run(userId, purpose, channel);
  db.prepare('INSERT INTO account_security_codes(user_id,purpose,channel,target,code_hash,expires_at) VALUES(?,?,?,?,?,?)')
    .run(userId, purpose, channel, target, hashSecurityCode(userId, purpose, channel, target, code), expiresAt);
  return {code, expiresAt};
}

function verifyCode(userId, purpose, channel, target, code) {
  const row = db.prepare('SELECT * FROM account_security_codes WHERE user_id=? AND purpose=? AND channel=? AND used=0 ORDER BY id DESC LIMIT 1')
    .get(userId, purpose, channel);
  if (!row || row.target !== target || Date.parse(row.expires_at) <= Date.now() || row.attempts >= 5) {
    if (row) db.prepare('UPDATE account_security_codes SET used=1 WHERE id=?').run(row.id);
    return false;
  }
  if (row.code_hash !== hashSecurityCode(userId, purpose, channel, target, code)) {
    db.prepare('UPDATE account_security_codes SET attempts=attempts+1 WHERE id=?').run(row.id);
    return false;
  }
  db.prepare('UPDATE account_security_codes SET used=1 WHERE id=?').run(row.id);
  return true;
}

async function deliverSecurityCode(userId, purpose, channel, target, code) {
  const message = purpose === 'password-reset'
    ? `AESD-Kasa şifre yenileme kodunuz: ${code}. Kod 10 dakika geçerlidir.`
    : purpose === 'change-email'
      ? `AESD-Kasa yeni e-posta doğrulama kodunuz: ${code}. Kod 10 dakika geçerlidir.`
      : purpose === 'change-phone'
        ? `AESD-Kasa yeni telefon doğrulama kodunuz: ${code}. Kod 10 dakika geçerlidir.`
        : `AESD-Kasa güvenlik kodunuz: ${code}. Kod 10 dakika geçerlidir.`;
  return channel === 'phone'
    ? sendSmsDetailed(target, message)
    : sendEmailDetailed(target, 'AESD-Kasa güvenlik kodu', message);
}

function licenseMessage(label, phone) {
  const customer = String(label || '').trim();
  const prefix = customer ? `${customer}, ` : '';
  return `${prefix}AESD-Kasa lisansınız aktif. Uygulamayı açın ve ${maskPhone(phone)} numarasıyla “SMS Kodu Gönder” seçeneğine dokunun.`;
}

const originalPost = express.application?.post;
const originalListen = express.application?.listen;
if (typeof originalPost !== 'function' || typeof originalListen !== 'function') {
  throw new Error('Express uygulama prototipi yamalanamadı.');
}

express.application.post = function patchedPost(path, ...handlers) {
  if (path === '/admin/phone-licenses') {
    ownerMiddlewares = handlers.slice(0, -1);
    return originalPost.call(this, path, ...ownerMiddlewares, async (req, res) => {
      const phone = normalizePhone(req.body?.phone);
      const label = String(req.body?.label || '').trim().slice(0, 120);
      const days = Math.max(1, Math.min(3650, Number(req.body?.days || 30)));
      if (!phone) return res.status(400).json({error: 'Geçerli telefon numarası gerekli'});
      const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
      try {
        const result = db.prepare('INSERT INTO phone_licenses(label,phone,expires_at) VALUES(?,?,?)').run(label, phone, expiresAt);
        audit(req.user?.id, 'PHONE_LICENSE_CREATED', {licenseId: result.lastInsertRowid, phone: maskPhone(phone), label, expiresAt});
        const sms = await sendSmsDetailed(phone, licenseMessage(label, phone));
        audit(req.user?.id, sms.status === 'accepted' ? 'PHONE_LICENSE_SMS_ACCEPTED' : 'PHONE_LICENSE_SMS_FAILED', {
          licenseId: result.lastInsertRowid, phone: maskPhone(phone), providerStatus: sms.providerStatus || null, error: sms.error || null,
        });
        return res.json({id: result.lastInsertRowid, phone: maskPhone(phone), label, expiresAt, sms});
      } catch (error) {
        console.error('Telefon lisansı oluşturma hatası:', error.message);
        return res.status(400).json({error: 'Bu telefon numarası zaten kayıtlı olabilir'});
      }
    });
  }

  if (path === '/password-reset/request') {
    return originalPost.call(this, path, async (req, res) => {
      const channel = 'email';
      const target = channel === 'phone' ? normalizePhone(req.body?.phone || req.body?.identifier) : normalizeEmail(req.body?.email || req.body?.identifier);
      if (!emailConfigured()) return res.status(503).json({error: 'E-posta gönderimi henüz yapılandırılmamış. Kod gönderilmedi.'});
      if (!allowRequest(`ip:${req.ip}`)) return res.status(429).json({error: 'Çok sık kod istendi. Bir dakika bekleyin.'});
      if (!target) return res.status(400).json({error: channel === 'phone' ? 'Geçerli telefon numarası gerekli' : 'Geçerli e-posta gerekli'});
      const user = channel === 'phone'
        ? db.prepare('SELECT id,email,phone,active FROM users WHERE phone=?').get(target)
        : db.prepare('SELECT id,email,phone,active FROM users WHERE email=?').get(target);
      if (!user || !user.active) return res.json({ok: true, message: 'Hesap mevcutsa doğrulama kodu gönderildi.'});
      if (!allowRequest(`reset:${channel}:${target}`)) return res.status(429).json({error: 'Çok sık kod istendi. Biraz bekleyip tekrar deneyin.'});
      const {code} = createCodeRecord(user.id, 'password-reset', channel, target);
      const delivery = await deliverSecurityCode(user.id, 'password-reset', channel, target, code);
      if (delivery.status !== 'accepted') {
        db.prepare('UPDATE account_security_codes SET used=1 WHERE user_id=? AND purpose=? AND used=0').run(user.id, 'password-reset');
        return res.status(503).json({error: delivery.error || 'Kod gönderilemedi'});
      }
      audit(user.id, 'PASSWORD_RESET_CODE_SENT', {channel, target: channel === 'phone' ? maskPhone(target) : maskEmail(target)});
      return res.json({ok: true, channel, destination: channel === 'phone' ? maskPhone(target) : maskEmail(target), message: '6 haneli doğrulama kodu gönderildi.'});
    });
  }

  if (path === '/password-reset/confirm') {
    return originalPost.call(this, path, async (req, res) => {
      const channel = 'email';
      const target = channel === 'phone' ? normalizePhone(req.body?.phone || req.body?.identifier) : normalizeEmail(req.body?.email || req.body?.identifier);
      const code = String(req.body?.code || '').trim();
      const newPassword = String(req.body?.newPassword || '');
      if (!target || !/^\d{6}$/.test(code) || newPassword.length < 8) return res.status(400).json({error: 'Geçerli hesap bilgisi, 6 haneli kod ve en az 8 karakter yeni şifre gerekli'});
      const user = channel === 'phone'
        ? db.prepare('SELECT id,email,phone,active FROM users WHERE phone=?').get(target)
        : db.prepare('SELECT id,email,phone,active FROM users WHERE email=?').get(target);
      if (!user || !user.active || !verifyCode(user.id, 'password-reset', channel, target, code)) return res.status(400).json({error: 'Kod geçersiz veya süresi dolmuş'});
      const passwordHash = await bcrypt.hash(newPassword, 12);
      db.prepare('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?').run(passwordHash, user.id);
      audit(user.id, 'PASSWORD_RESET_COMPLETED', {channel});
      return res.json({ok: true, email: user.email, message: 'Şifreniz güvenli şekilde yenilendi.'});
    });
  }

  return originalPost.call(this, path, ...handlers);
};

express.application.listen = function patchedListen(...args) {
for (const statement of [
  'ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN phone TEXT',
  'ALTER TABLE users ADD COLUMN google_sub TEXT',
  'ALTER TABLE users ADD COLUMN apple_sub TEXT',
]) {
  try { db.prepare(statement).run(); } catch (_) {}
}

  if (!this.__aesdLicensePatchInstalled) {
    this.__aesdLicensePatchInstalled = true;
    const guards = Array.isArray(ownerMiddlewares) ? ownerMiddlewares : [];
    const authGuard = guards[0];

    originalPost.call(this, '/email-login/request', async (req, res) => {
      if (!emailConfigured() || !process.env.JWT_SECRET) return res.status(503).json({error: 'E-posta ile giriş sunucuda henüz yapılandırılmamış. Kod gönderilmedi.'});
      const email = normalizeEmail(req.body?.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error: 'Geçerli e-posta gerekli'});
      if (!allowRequest(`email-ip:${req.ip}`) || !allowRequest(`email-login:${email}`)) return res.status(429).json({error: 'Yeni kod için bir dakika bekleyin.'});
      const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
      const message = 'Hesap aktif ve lisanslıysa 6 haneli kod e-postanıza gönderildi.';
      if (!user?.active || (user.role !== 'OWNER' && Date.parse(user.license_until || '') <= Date.now()) || (user.role !== 'OWNER' && !user.license_until)) return res.json({ok: true, message});
      const {code} = createCodeRecord(user.id, 'email-login', 'email', email);
      const delivery = await sendEmailDetailed(email, 'AESD-Kasa giriş kodu', `Giriş kodunuz: ${code}. Kod 10 dakika geçerlidir.`);
      if (delivery.status !== 'accepted') {
        db.prepare("UPDATE account_security_codes SET used=1 WHERE user_id=? AND purpose='email-login'").run(user.id);
        return res.status(503).json({error: delivery.error});
      }
      res.json({ok: true, message});
    });
    originalPost.call(this, '/email-login/verify', (req, res) => {
      const email = normalizeEmail(req.body?.email), code = String(req.body?.code || '');
      const deviceKey = String(req.body?.deviceKey || '');
      if (!deviceKey || !/^\d{6}$/.test(code) || !process.env.JWT_SECRET) return res.status(400).json({error: 'Geçerli kod ve cihaz gerekli'});
      const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
      if (!user?.active || !verifyCode(user.id, 'email-login', 'email', email, code)) return res.status(400).json({error: 'Kod geçersiz veya süresi dolmuş'});
      if (user.role !== 'OWNER' && (!user.license_until || !(Date.parse(user.license_until) > Date.now()))) return res.status(403).json({error: 'Aktif lisans gerekli'});
      if (req.body?.buildVariant === 'owner' && user.role !== 'OWNER') return res.status(403).json({error: 'Owner hesabı gerekli'});
      const hash = crypto.createHash('sha256').update(deviceKey).digest('hex');
      if (user.device_key_hash && user.device_key_hash !== hash) return res.status(403).json({error: 'Bu hesap başka cihaza bağlı. Yönetici cihazı sıfırlamalı.'});
      db.prepare('UPDATE users SET device_key_hash=? WHERE id=?').run(hash, user.id);
      const token = jwt.sign({id: user.id, role: user.role, kind: 'user', v: user.session_version || 0}, process.env.JWT_SECRET, {expiresIn: '7d'});
      audit(user.id, 'EMAIL_LOGIN_SUCCESS');
      res.json({token});
    });

    originalPost.call(this, '/admin/phone-licenses/:id/notify', ...guards, async (req, res) => {
      const license = db.prepare('SELECT id,label,phone,active,expires_at FROM phone_licenses WHERE id=?').get(req.params.id);
      if (!license) return res.status(404).json({error: 'Telefon lisansı bulunamadı'});
      if (!license.active || Date.parse(license.expires_at) <= Date.now()) return res.status(400).json({error: 'Pasif veya süresi dolmuş lisansa SMS gönderilemez'});
      const sms = await sendSmsDetailed(license.phone, licenseMessage(license.label, license.phone));
      audit(req.user?.id, sms.status === 'accepted' ? 'PHONE_LICENSE_SMS_ACCEPTED' : 'PHONE_LICENSE_SMS_FAILED', {
        licenseId: license.id, phone: maskPhone(license.phone), providerStatus: sms.providerStatus || null, error: sms.error || null,
      });
      return res.json({ok: sms.status === 'accepted', sms});
    });

    this.delete('/admin/phone-licenses/:id', ...guards, (req, res) => {
      const license = db.prepare('SELECT id,phone FROM phone_licenses WHERE id=?').get(req.params.id);
      if (!license) return res.status(404).json({error: 'Telefon lisansı bulunamadı'});
      const remove = db.transaction(() => {
        db.prepare('DELETE FROM phone_otps WHERE phone=?').run(license.phone);
        db.prepare('DELETE FROM phone_licenses WHERE id=?').run(license.id);
      });
      remove();
      audit(req.user?.id, 'PHONE_LICENSE_DELETED', {licenseId: license.id, phone: maskPhone(license.phone)});
      return res.json({ok: true});
    });

    this.delete('/admin/licenses/:id', ...guards, (req, res) => {
      const license = db.prepare('SELECT id FROM activation_licenses WHERE id=?').get(req.params.id);
      if (!license) return res.status(404).json({error: 'Lisans bulunamadı'});
      db.prepare('DELETE FROM activation_licenses WHERE id=?').run(license.id);
      audit(req.user?.id, 'ACTIVATION_LICENSE_DELETED', {licenseId: license.id});
      return res.json({ok: true});
    });

    if (authGuard) {
      this.get('/account/profile', authGuard, (req, res) => {
        const user = db.prepare('SELECT id,email,phone,role,active,google_sub,apple_sub FROM users WHERE id=?').get(req.user.id);
        if (!user) return res.status(404).json({error: 'Hesap bulunamadı'});
        return res.json({
          id: user.id, email: user.email, phone: user.phone || '', phoneDisplay: maskPhone(user.phone), role: user.role,
          googleLinked: Boolean(user.google_sub), appleLinked: Boolean(user.apple_sub),
          providers: {googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID), appleConfigured: Boolean(process.env.APPLE_CLIENT_ID)},
        });
      });

      originalPost.call(this, '/account/contact/request', authGuard, async (req, res) => {
        const type = req.body?.type === 'phone' ? 'phone' : 'email';
        const target = type === 'phone' ? normalizePhone(req.body?.value) : normalizeEmail(req.body?.value);
        if (!target) return res.status(400).json({error: type === 'phone' ? 'Geçerli telefon numarası gerekli' : 'Geçerli e-posta gerekli'});
        if (type === 'email' && db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(target, req.user.id)) return res.status(400).json({error: 'Bu e-posta başka bir hesapta kullanılıyor'});
        if (type === 'phone' && db.prepare('SELECT id FROM users WHERE phone=? AND id<>?').get(target, req.user.id)) return res.status(400).json({error: 'Bu telefon başka bir hesapta kullanılıyor'});
        if (!allowRequest(`contact:${req.user.id}:${type}:${target}`)) return res.status(429).json({error: 'Çok sık kod istendi. Biraz bekleyin.'});
        const purpose = type === 'phone' ? 'change-phone' : 'change-email';
        const {code} = createCodeRecord(req.user.id, purpose, type, target);
        const delivery = await deliverSecurityCode(req.user.id, purpose, type, target, code);
        if (delivery.status !== 'accepted') return res.status(503).json({error: delivery.error || 'Kod gönderilemedi'});
        audit(req.user.id, 'ACCOUNT_CONTACT_CODE_SENT', {type, target: type === 'phone' ? maskPhone(target) : maskEmail(target)});
        return res.json({ok: true, destination: type === 'phone' ? maskPhone(target) : maskEmail(target)});
      });

      originalPost.call(this, '/account/contact/confirm', authGuard, (req, res) => {
        const type = req.body?.type === 'phone' ? 'phone' : 'email';
        const target = type === 'phone' ? normalizePhone(req.body?.value) : normalizeEmail(req.body?.value);
        const code = String(req.body?.code || '').trim();
        const purpose = type === 'phone' ? 'change-phone' : 'change-email';
        if (!target || !/^\d{6}$/.test(code) || !verifyCode(req.user.id, purpose, type, target, code)) return res.status(400).json({error: 'Kod geçersiz veya süresi dolmuş'});
        db.prepare(`UPDATE users SET ${type === 'phone' ? 'phone' : 'email'}=? WHERE id=?`).run(target, req.user.id);
        audit(req.user.id, type === 'phone' ? 'ACCOUNT_PHONE_CHANGED' : 'ACCOUNT_EMAIL_CHANGED', {target: type === 'phone' ? maskPhone(target) : maskEmail(target)});
        return res.json({ok: true, email: type === 'email' ? target : undefined, phone: type === 'phone' ? maskPhone(target) : undefined});
      });

      originalPost.call(this, '/account/password/request', authGuard, async (req, res) => {
        const channel = 'email';
        const user = db.prepare('SELECT id,email,phone FROM users WHERE id=?').get(req.user.id);
        const target = channel === 'phone' ? normalizePhone(user?.phone) : normalizeEmail(user?.email);
        if (!target) return res.status(400).json({error: channel === 'phone' ? 'Önce hesabınıza telefon numarası ekleyin' : 'Hesap e-postası bulunamadı'});
        if (!allowRequest(`pw:${req.user.id}:${channel}`)) return res.status(429).json({error: 'Çok sık kod istendi. Biraz bekleyin.'});
        const {code} = createCodeRecord(req.user.id, 'password-reset', channel, target);
        const delivery = await deliverSecurityCode(req.user.id, 'password-reset', channel, target, code);
        if (delivery.status !== 'accepted') return res.status(503).json({error: delivery.error || 'Kod gönderilemedi'});
        return res.json({ok: true, destination: channel === 'phone' ? maskPhone(target) : maskEmail(target)});
      });

      originalPost.call(this, '/account/password/confirm', authGuard, async (req, res) => {
        const channel = 'email';
        const code = String(req.body?.code || '').trim();
        const newPassword = String(req.body?.newPassword || '');
        const user = db.prepare('SELECT id,email,phone FROM users WHERE id=?').get(req.user.id);
        const target = channel === 'phone' ? normalizePhone(user?.phone) : normalizeEmail(user?.email);
        if (!target || !/^\d{6}$/.test(code) || newPassword.length < 8) return res.status(400).json({error: 'Kod ve en az 8 karakter yeni şifre gerekli'});
        if (!verifyCode(req.user.id, 'password-reset', channel, target, code)) return res.status(400).json({error: 'Kod geçersiz veya süresi dolmuş'});
        const passwordHash = await bcrypt.hash(newPassword, 12);
        db.prepare('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?').run(passwordHash, req.user.id);
        audit(req.user.id, 'ACCOUNT_PASSWORD_CHANGED', {channel});
        return res.json({ok: true});
      });
    }
  }
  return originalListen.apply(this, args);
};

