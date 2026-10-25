import express from 'express';
import {openDatabase} from './shared-database.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const db = openDatabase();
const SECRET = String(process.env.JWT_SECRET || '');
const previousPost = express.application.post;

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

function audit(userId, action, meta = {}) {
  try {
    db.prepare('INSERT INTO audit(user_id,action,meta) VALUES(?,?,?)').run(userId || null, action, JSON.stringify(meta));
  } catch (_) {}
}

// Keep the existing /login implementation untouched for e-mail callers.
// Only requests that explicitly send phone/identifier as a phone number use
// this additive phone + password path.
express.application.post = function phonePasswordAwarePost(path, ...handlers) {
  if (path !== '/login' || !handlers.length) return previousPost.call(this, path, ...handlers);

  const existingLogin = handlers[0];
  return previousPost.call(this, path, async (req, res, next) => {
    const supplied = String(req.body?.phone || req.body?.identifier || '').trim();
    const phone = normalizePhone(supplied);

    if (!phone) return existingLogin(req, res, next);

    const password = String(req.body?.password || '');
    const deviceKey = String(req.body?.deviceKey || '');
    const buildVariant = req.body?.buildVariant === 'owner' ? 'owner' : 'client';
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    if (!password || !deviceKey) {
      audit(null, 'PHONE_PASSWORD_LOGIN_FAILED', {phone: maskPhone(phone), ip, reason: 'missing'});
      return res.status(400).json({error: 'Telefon, şifre ve cihaz kimliği gerekli'});
    }

    let user;
    try {
      user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
    } catch (_) {
      return res.status(503).json({error: 'Telefon ile giriş henüz hazırlanıyor. Daha sonra tekrar deneyin.'});
    }

    const passwordOk = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !passwordOk) {
      audit(user?.id, 'PHONE_PASSWORD_LOGIN_FAILED', {phone: maskPhone(phone), ip, reason: 'credentials'});
      return res.status(401).json({error: 'Telefon numarası veya şifre hatalı'});
    }
    if (!user.active) return res.status(403).json({error: 'Hesap askıya alınmış'});
    if (buildVariant === 'owner' && user.role !== 'OWNER') return res.status(403).json({error: 'Bu sürüm yalnızca yönetici hesabı içindir'});
    if (user.role !== 'OWNER' && (!user.license_until || Date.parse(user.license_until) <= Date.now())) {
      return res.status(403).json({error: 'Aktif lisans bulunmuyor'});
    }
    if (!SECRET) return res.status(503).json({error: 'Sunucu oturum anahtarı yapılandırılmamış'});

    const deviceHash = crypto.createHash('sha256').update(deviceKey).digest('hex');
    if (!user.device_key_hash) {
      db.prepare('UPDATE users SET device_key_hash=? WHERE id=?').run(deviceHash, user.id);
    } else if (user.device_key_hash !== deviceHash) {
      return res.status(403).json({error: 'Bu hesap başka bir cihaza bağlı. Cihaz değişimi için yönetici onayı gerekir.'});
    }

    const token = jwt.sign(
      {id: user.id, role: user.role, kind: 'user', v: user.session_version || 0},
      SECRET,
      {expiresIn: '7d'},
    );
    audit(user.id, 'PHONE_PASSWORD_LOGIN_SUCCESS', {phone: maskPhone(phone), buildVariant, ip});
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: maskPhone(user.phone),
        role: user.role,
        active: Boolean(user.active),
        license_until: user.license_until || null,
      },
    });
  });
};
