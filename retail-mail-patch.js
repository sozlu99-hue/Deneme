import express from 'express';
import {openDatabase} from './shared-database.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {emailConfigured, sendEmailDetailed} from './mail-provider.js';

const db = openDatabase();
const SECRET = String(process.env.JWT_SECRET || '');
const SECURITY_NOTIFY_EMAIL = String(process.env.SECURITY_NOTIFY_EMAIL || '').trim().toLowerCase();
const originalListen = express.application?.listen;
const lowStockWindow = new Map();

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const hashDevice = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const money = (value) => Number(value || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});

function validateRetailToken(req) {
  if (!SECRET) throw new Error('JWT_NOT_CONFIGURED');
  const raw = String(req.headers.authorization || '');
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
  const deviceId = String(req.body?.deviceId || '');
  if (!token || !deviceId) throw new Error('AUTH_REQUIRED');
  const payload = jwt.verify(token, SECRET);
  const deviceHash = hashDevice(deviceId);

  if (payload?.kind === 'user' && payload.id) {
    const user = db.prepare('SELECT id,email,role,active,license_until,device_key_hash,session_version FROM users WHERE id=?').get(payload.id);
    if (!user?.active || (payload.v || 0) !== (user.session_version || 0)) throw new Error('SESSION_INVALID');
    if (user.role !== 'OWNER' && (!user.license_until || Date.parse(user.license_until) <= Date.now())) throw new Error('LICENSE_EXPIRED');
    if (user.device_key_hash && user.device_key_hash !== deviceHash) throw new Error('DEVICE_MISMATCH');
    return {kind: 'user', id: user.id, role: user.role, email: user.email};
  }

  if (payload?.kind === 'activation' && payload.licenseId) {
    const license = db.prepare('SELECT id,active,expires_at,device_key_hash FROM activation_licenses WHERE id=?').get(payload.licenseId);
    if (!license?.active || Date.parse(license.expires_at) <= Date.now()) throw new Error('LICENSE_EXPIRED');
    if (license.device_key_hash !== deviceHash) throw new Error('DEVICE_MISMATCH');
    return {kind: 'activation', id: license.id, role: 'CLIENT'};
  }

  if (payload?.kind === 'phone-license' && payload.phoneLicenseId) {
    const license = db.prepare('SELECT id,active,expires_at,device_key_hash FROM phone_licenses WHERE id=?').get(payload.phoneLicenseId);
    if (!license?.active || Date.parse(license.expires_at) <= Date.now()) throw new Error('LICENSE_EXPIRED');
    if (license.device_key_hash !== deviceHash) throw new Error('DEVICE_MISMATCH');
    return {kind: 'phone-license', id: license.id, role: 'CLIENT'};
  }
  throw new Error('AUTH_REQUIRED');
}

function authRetail(req, res, next) {
  try {
    req.retailAuth = validateRetailToken(req);
    next();
  } catch (error) {
    const code = error?.message === 'LICENSE_EXPIRED' || error?.message === 'DEVICE_MISMATCH' ? 403 : 401;
    res.status(code).json({error: code === 403 ? 'Lisans veya cihaz doğrulaması başarısız.' : 'Geçerli AESD oturumu gerekli.'});
  }
}

function invoiceText(sale) {
  const items = Array.isArray(sale?.items) ? sale.items : [];
  const lines = items.map((item) => `- ${String(item.name || 'Ürün').slice(0, 120)} x${Number(item.qty || 0)} = ${money(item.lineTotal)} ₺`);
  const payments = Array.isArray(sale?.payments) ? sale.payments : [];
  const paymentLines = payments.map((p) => `- ${p.type === 'cash' ? 'Nakit' : p.type === 'card' ? 'Kart' : 'Borç'}: ${money(p.amount)} ₺`);
  return [
    'AESD-Kasa Satış Faturası / Bilgi Fişi',
    `Fiş: ${String(sale?.id || '-').slice(0, 120)}`,
    `Tarih: ${String(sale?.date || new Date().toISOString())}`,
    `Kasa: ${String(sale?.cashboxName || sale?.cashboxId || 'Kasa').slice(0, 120)}`,
    '', 'Ürünler', ...lines,
    '', `Ara toplam: ${money(sale?.subtotal ?? sale?.total)} ₺`,
    `İndirim: ${money(sale?.discountAmount || 0)} ₺`,
    `Toplam: ${money(sale?.total)} ₺`,
    '', 'Ödeme', ...(paymentLines.length ? paymentLines : ['- Belirtilmedi']),
    '', 'Bu belge AESD-Kasa tarafından satış bilgilendirmesi amacıyla oluşturulmuştur.',
  ].join('\n');
}

express.application.listen = function retailPatchedListen(...args) {
  if (!this.__aesdRetailMailRoutes) {
    this.__aesdRetailMailRoutes = true;

    this.post('/v1/retail/invoice-email', authRetail, async (req, res) => {
      const to = normalizeEmail(req.body?.to);
      const sale = req.body?.sale || {};
      if (!emailConfigured()) return res.status(503).json({error: 'E-posta servisi yapılandırılmamış.'});
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({error: 'Geçerli fatura e-posta adresi gerekli.'});
      if (!sale?.id || !Array.isArray(sale?.items) || !sale.items.length) return res.status(400).json({error: 'Geçerli satış fişi gerekli.'});
      const delivery = await sendEmailDetailed(to, `AESD-Kasa fiş ${String(sale.id).slice(0, 40)}`, invoiceText(sale));
      if (delivery.status !== 'accepted') return res.status(503).json({error: delivery.error || 'Fatura e-postası gönderilemedi.'});
      return res.json({ok: true});
    });

    this.post('/v1/retail/low-stock', authRetail, async (req, res) => {
      if (!emailConfigured() || !SECURITY_NOTIFY_EMAIL) return res.status(503).json({error: 'Stok bildirim e-postası yapılandırılmamış.'});
      const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 50).map((item) => ({
        id: String(item?.id || '').slice(0, 120),
        name: String(item?.name || 'Ürün').slice(0, 120),
        remaining: Number(item?.remaining || 0),
        unit: item?.unit === 'kg' ? 'kg' : 'adet',
      })).filter((item) => item.id && Number.isFinite(item.remaining) && item.remaining <= 30);
      if (!items.length) return res.json({ok: true, sent: false});
      const signature = items.map((i) => `${i.id}:${Math.floor(i.remaining)}`).sort().join('|');
      const previous = lowStockWindow.get(signature) || 0;
      if (Date.now() - previous < 60 * 60 * 1000) return res.json({ok: true, sent: false, throttled: true});
      const body = ['AESD-Kasa düşük stok uyarısı', '', ...items.map((i) => `- ${i.name}: ${i.remaining.toLocaleString('tr-TR')} ${i.unit}`), '', `Zaman: ${new Date().toISOString()}`].join('\n');
      const delivery = await sendEmailDetailed(SECURITY_NOTIFY_EMAIL, 'AESD-Kasa düşük stok uyarısı', body);
      if (delivery.status !== 'accepted') return res.status(503).json({error: delivery.error || 'Stok uyarı e-postası gönderilemedi.'});
      lowStockWindow.set(signature, Date.now());
      return res.json({ok: true, sent: true});
    });
  }
  return originalListen.apply(this, args);
};
