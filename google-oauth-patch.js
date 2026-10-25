import express from 'express';
import {openDatabase} from './shared-database.js';
import crypto from 'crypto';
import {authenticateUser,currentUser} from './legacy-auth.js';

const db = openDatabase();
const secret = String(process.env.JWT_SECRET || '');
const clientId = String(process.env.GOOGLE_CLIENT_ID || '');
const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '');
const callback = String(process.env.GOOGLE_REDIRECT_URI || 'https://aesd-server.onrender.com/oauth/google/callback');

for (const sql of [
  'ALTER TABLE users ADD COLUMN google_refresh_token_enc TEXT',
  'ALTER TABLE users ADD COLUMN google_refresh_updated_at TEXT',
]) { try { db.prepare(sql).run(); } catch (_) {} }

db.exec(`CREATE TABLE IF NOT EXISTS google_oauth_states(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state_hash TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
)`);
if(!db.prepare('PRAGMA table_info(google_oauth_states)').all().some(c=>c.name==='session_version'))db.exec('ALTER TABLE google_oauth_states ADD COLUMN session_version INTEGER');

db.exec(`CREATE TABLE IF NOT EXISTS google_recovery_states(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state_hash TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS google_recovery_tokens(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
)`);

const recoveryStarts = new Map();
const RECOVERY_START_WINDOW_MS = 15 * 60 * 1000;
function allowRecoveryStart(ip) {
  const now = Date.now();
  for (const [key, row] of recoveryStarts) {
    if (now - row.firstAt > RECOVERY_START_WINDOW_MS) recoveryStarts.delete(key);
  }
  const key = String(ip || 'unknown');
  const previous = recoveryStarts.get(key);
  const next = !previous || now - previous.firstAt > RECOVERY_START_WINDOW_MS
    ? {count: 1, firstAt: now}
    : {count: previous.count + 1, firstAt: previous.firstAt};
  recoveryStarts.set(key, next);
  return next.count <= 10;
}
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const configured = () => Boolean(secret && clientId && clientSecret);
const html = value => String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const key = () => crypto.createHash('sha256').update(`aesd-google:${secret}`).digest();
function protect(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
}
function unprotect(value) {
  const [a,b,c] = String(value || '').split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(a, 'base64url'));
  decipher.setAuthTag(Buffer.from(b, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(c, 'base64url')), decipher.final()]).toString('utf8');
}
function auth(req,res,next) {
  try {
    const raw = String(req.headers.authorization || '');
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
    const {user} = authenticateUser(db,token,secret);
    req.googleUser = user;
    next();
  } catch (_) { return res.status(401).json({error:'Oturum geçersiz'}); }
}
function recoveryPage({token = '', error = ''} = {}) {
  const safeError = html(error);
  const safeToken = html(token);
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>O Ses Çiğköfte Şifre Kurtarma</title><style>body{font-family:system-ui;background:#0f1115;padding:24px;color:#111}.card{max-width:520px;margin:8vh auto;background:#fff;border-radius:24px;padding:28px;box-shadow:0 18px 60px #0006}h1{font-size:24px;margin:0 0 8px}.sub{color:#667085;line-height:1.55}.err{background:#fff1f1;color:#b42318;padding:12px;border-radius:12px;margin:14px 0}label{display:block;font-weight:700;margin-top:14px}input{width:100%;box-sizing:border-box;height:52px;border:1px solid #d0d5dd;border-radius:12px;padding:0 12px;font-size:16px;margin-top:6px}button{width:100%;height:54px;border:0;border-radius:12px;background:#e31b23;color:#fff;font-weight:800;font-size:16px;margin-top:18px}.ok{color:#067647;font-weight:800}.foot{font-size:12px;color:#98a2b3;margin-top:18px}</style></head><body><div class="card"><h1>O Ses Çiğköfte</h1><p class="sub">Google hesabınız doğrulandı. Yeni şifrenizi belirleyin.</p>${safeError ? `<div class="err">${safeError}</div>` : ''}${safeToken ? `<form method="post" action="/password-reset/google/confirm"><input type="hidden" name="token" value="${safeToken}"><label>Yeni şifre</label><input name="newPassword" type="password" minlength="8" required autocomplete="new-password"><label>Yeni şifre tekrar</label><input name="confirmPassword" type="password" minlength="8" required autocomplete="new-password"><button type="submit">ŞİFREYİ DEĞİŞTİR</button></form>` : ''}<p class="foot">Şifre en az 8 karakter olmalıdır. İşlem tamamlandıktan sonra uygulamaya dönüp yeni şifrenizle giriş yapabilirsiniz.</p></div></body></html>`;
}

function recoveryDone(ok, message) {
  const safe = html(message);
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>O Ses Çiğköfte</title><style>body{font-family:system-ui;background:#0f1115;padding:24px}.card{max-width:520px;margin:12vh auto;background:#fff;border-radius:24px;padding:28px;box-shadow:0 18px 60px #0006}.ok{color:#067647}.bad{color:#b42318}p{color:#475467;line-height:1.6}</style></head><body><div class="card"><h1 class="${ok?'ok':'bad'}">${ok?'Şifre değiştirildi ✅':'İşlem tamamlanamadı'}</h1><p>${safe}</p><p>Bu sayfayı kapatıp O Ses Çiğköfte uygulamasına dönebilirsiniz.</p></div></body></html>`;
}

function resultPage(ok, message) {
  const title = ok ? 'Google hesabı bağlandı' : 'Google bağlantısı tamamlanamadı';
  const safe = String(message || '').replace(/[<>&"']/g, '');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui;background:#f5f7fb;padding:28px;color:#101828}.card{max-width:520px;margin:12vh auto;background:#fff;border-radius:22px;padding:28px;box-shadow:0 12px 36px #0002}h1{font-size:24px}p{line-height:1.6;color:#475467}.ok{color:#067647}.bad{color:#b42318}</style></head><body><div class="card"><h1 class="${ok?'ok':'bad'}">${title}</h1><p>${safe}</p><p>Bu sayfayı kapatıp AESD-Kasa uygulamasına dönün. Uygulamada “Bağlantıyı kontrol et / token yenilemeyi test et” seçeneğine dokunun.</p></div></body></html>`;
}
async function tokenRequest(params) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams(params),
    signal:AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `Google token hatası ${response.status}`);
  return data;
}

const originalListen = express.application.listen;
express.application.listen = function(...args) {
  if (!this.__googleOauthAdded) {
    this.__googleOauthAdded = true;
    this.get('/oauth/google/status', auth, (req,res) => {
      const u = db.prepare('SELECT google_sub,google_refresh_token_enc,google_refresh_updated_at FROM users WHERE id=?').get(req.googleUser.id);
      res.json({configured:configured(),linked:Boolean(u?.google_sub),refreshAvailable:Boolean(u?.google_refresh_token_enc),refreshedAt:u?.google_refresh_updated_at || null,redirectUri:callback});
    });
    this.get('/oauth/google/start', auth, (req,res) => {
      if (!configured()) return res.status(503).json({error:'Google OAuth sunucuda eksik yapılandırılmış'});
      const state = crypto.randomBytes(32).toString('base64url');
      db.prepare('DELETE FROM google_oauth_states WHERE user_id=? OR expires_at<=?').run(req.googleUser.id,new Date().toISOString());
      db.prepare('INSERT INTO google_oauth_states(state_hash,user_id,expires_at,session_version) VALUES(?,?,?,?)').run(hash(state),req.googleUser.id,new Date(Date.now()+600000).toISOString(),req.googleUser.session_version||0);
      const q = new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:'code',scope:'openid email profile',access_type:'offline',prompt:'consent',state});
      res.json({authUrl:`https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`});
    });
    this.get('/password-reset/google/status', (_req,res) => {
      res.json({configured: configured()});
    });
    this.get('/password-reset/google/start', (req,res) => {
      if (!configured()) return res.status(503).send(recoveryDone(false,'Google ile kurtarma sunucuda henüz yapılandırılmamış.'));
      if (!allowRecoveryStart(req.ip)) return res.status(429).send(recoveryDone(false,'Çok sık deneme yapıldı. 15 dakika sonra tekrar deneyin.'));
      const email = normalizeEmail(req.query.email);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).send(recoveryDone(false,'Geçerli hesap e-postasını girin.'));
      // Do not tell the caller if the account exists. The callback accepts only a verified Google e-mail that matches.
      const state = crypto.randomBytes(32).toString('base64url');
      db.prepare('DELETE FROM google_recovery_states WHERE email=? OR expires_at<=?').run(email,new Date().toISOString());
      db.prepare('INSERT INTO google_recovery_states(state_hash,email,expires_at) VALUES(?,?,?)').run(hash(state),email,new Date(Date.now()+600000).toISOString());
      const q = new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:'code',scope:'openid email profile',prompt:'select_account',state});
      return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`);
    });
    this.get('/oauth/google/callback', async (req,res) => {
      if (req.query.error) return res.status(400).send(resultPage(false,String(req.query.error)));

      const recovery = db.prepare('SELECT * FROM google_recovery_states WHERE state_hash=? AND used=0').get(hash(req.query.state));
      if (recovery) {
        if (Date.parse(recovery.expires_at)<=Date.now()) return res.status(400).send(recoveryDone(false,'Google doğrulama oturumunun süresi dolmuş.'));
        db.prepare('UPDATE google_recovery_states SET used=1 WHERE id=?').run(recovery.id);
        try {
          const tokens = await tokenRequest({code:String(req.query.code||''),client_id:clientId,client_secret:clientSecret,redirect_uri:callback,grant_type:'authorization_code'});
          const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token || '')}`,{signal:AbortSignal.timeout(12000)});
          const info = await infoRes.json().catch(() => ({}));
          const verified = info.email_verified === true || String(info.email_verified).toLowerCase() === 'true';
          if (!infoRes.ok || info.aud !== clientId || !verified || normalizeEmail(info.email) !== recovery.email) {
            return res.status(403).send(recoveryDone(false,'Seçilen Google hesabı uygulamadaki hesap e-postasıyla eşleşmiyor.'));
          }
          const user = db.prepare('SELECT id,active FROM users WHERE email=?').get(recovery.email);
          if (!user?.active) return res.status(404).send(recoveryDone(false,'Aktif hesap bulunamadı.'));
          const token = crypto.randomBytes(32).toString('base64url');
          db.prepare('DELETE FROM google_recovery_tokens WHERE user_id=? OR expires_at<=?').run(user.id,new Date().toISOString());
          db.prepare('INSERT INTO google_recovery_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash(token),user.id,new Date(Date.now()+600000).toISOString());
          return res.send(recoveryPage({token}));
        } catch (e) {
          return res.status(400).send(recoveryDone(false,e.message || 'Google doğrulaması tamamlanamadı.'));
        }
      }

      const row = db.prepare('SELECT * FROM google_oauth_states WHERE state_hash=? AND used=0').get(hash(req.query.state));
      if (!row || Date.parse(row.expires_at)<=Date.now()) return res.status(400).send(resultPage(false,'OAuth oturumu geçersiz veya süresi dolmuş.'));
      db.prepare('UPDATE google_oauth_states SET used=1 WHERE id=?').run(row.id);
      try {
        currentUser(db,row.user_id,row.session_version);
        const tokens = await tokenRequest({code:String(req.query.code||''),client_id:clientId,client_secret:clientSecret,redirect_uri:callback,grant_type:'authorization_code'});
        const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token || '')}`,{signal:AbortSignal.timeout(12000)});
        const info = await infoRes.json();
        const verified=info.email_verified===true||info.email_verified==='true';
        const user=currentUser(db,row.user_id,row.session_version);
        if (!infoRes.ok || info.aud !== clientId || !info.sub || !verified || normalizeEmail(info.email)!==normalizeEmail(user.email)) throw new Error('Doğrulanmış Google e-postası hesap e-postasıyla eşleşmeli.');
        const saved = tokens.refresh_token ? protect(tokens.refresh_token) : user.google_sub===String(info.sub)?user.google_refresh_token_enc:null;
        const updated=db.prepare('UPDATE users SET google_sub=?,google_refresh_token_enc=?,google_refresh_updated_at=? WHERE id=? AND active=1 AND session_version=?').run(String(info.sub),saved||null,saved?new Date().toISOString():null,row.user_id,row.session_version);
        if(updated.changes!==1)throw new Error('Oturum değişti. Yeniden giriş yapın.');
        return res.send(resultPage(true,saved?'Refresh token kaydedildi. Token yenileme testi yapılabilir.':'Google hesabı bağlandı fakat refresh token dönmedi; yeniden bağlayıp izin ekranını onaylayın.'));
      } catch (e) { return res.status(400).send(resultPage(false,e.message)); }
    });
    this.post('/password-reset/google/confirm', express.urlencoded({extended:false}), async (req,res) => {
      const token = String(req.body?.token || '');
      const newPassword = String(req.body?.newPassword || '');
      const confirmPassword = String(req.body?.confirmPassword || '');
      const row = db.prepare('SELECT * FROM google_recovery_tokens WHERE token_hash=? AND used=0').get(hash(token));
      if (!row || Date.parse(row.expires_at)<=Date.now()) return res.status(400).send(recoveryDone(false,'Kurtarma bağlantısı geçersiz veya süresi dolmuş.'));
      if (newPassword.length < 8) return res.status(400).send(recoveryPage({token,error:'Yeni şifre en az 8 karakter olmalıdır.'}));
      if (newPassword !== confirmPassword) return res.status(400).send(recoveryPage({token,error:'Şifreler birbiriyle eşleşmiyor.'}));
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.default.hash(newPassword,12);
      db.prepare('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?').run(passwordHash,row.user_id);
      db.prepare('UPDATE google_recovery_tokens SET used=1 WHERE id=?').run(row.id);
      return res.send(recoveryDone(true,'Yeni şifreniz kaydedildi.'));
    });

    this.post('/oauth/google/refresh', auth, async (req,res) => {
      const u = db.prepare('SELECT google_sub,google_refresh_token_enc FROM users WHERE id=?').get(req.googleUser.id);
      if (!u?.google_sub || !u?.google_refresh_token_enc) return res.status(400).json({error:'Google refresh token bulunamadı'});
      try {
        const data = await tokenRequest({client_id:clientId,client_secret:clientSecret,refresh_token:unprotect(u.google_refresh_token_enc),grant_type:'refresh_token'});
        currentUser(db,req.googleUser.id,req.googleUser.session_version||0);
        const now = new Date().toISOString();
        db.prepare('UPDATE users SET google_refresh_updated_at=? WHERE id=?').run(now,req.googleUser.id);
        res.json({ok:true,expiresIn:data.expires_in || null,refreshedAt:now});
      } catch (e) { res.status(502).json({error:`Google token yenilenemedi: ${e.message}`}); }
    });
    this.delete('/oauth/google', auth, (req,res) => {
      db.prepare('UPDATE users SET google_sub=NULL,google_refresh_token_enc=NULL,google_refresh_updated_at=NULL WHERE id=?').run(req.googleUser.id);
      res.json({ok:true});
    });
  }
  return originalListen.apply(this,args);
};
