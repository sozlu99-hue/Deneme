import express from 'express';
import {openDatabase} from './shared-database.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {emailConfigured, sendEmailDetailed} from './mail-provider.js';

const db = openDatabase();
const secret = String(process.env.JWT_SECRET || '');
const windows = new Map();
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const normalizePhone = value => {
  let raw = String(value || '').trim().replace(/[^\d+]/g, '');
  if (raw.startsWith('00')) raw = `+${raw.slice(2)}`;
  const d = raw.replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('5')) return `+90${d}`;
  if (d.length === 11 && d.startsWith('05')) return `+90${d.slice(1)}`;
  if (d.length === 12 && d.startsWith('90')) return `+${d}`;
  if (raw.startsWith('+') && /^\+[1-9]\d{9,14}$/.test(raw)) return raw;
  return '';
};
const maskEmail = value => { const [a,b] = normalizeEmail(value).split('@'); return a && b ? `${a.slice(0,2)}•••@${b}` : ''; };
const maskPhone = value => { const p = normalizePhone(value); return p ? `${p.slice(0,4)}••••${p.slice(-4)}` : ''; };
const hashCode = (uid,purpose,channel,target,code) => crypto.createHash('sha256').update(`${uid}:${purpose}:${channel}:${target}:${code}:${secret}`).digest('hex');

function allowed(key) {
  const now = Date.now(), old = windows.get(key);
  if (old && now-old.last < 60000) return false;
  const next = !old || now-old.first > 900000 ? {n:1,first:now,last:now} : {n:old.n+1,first:old.first,last:now};
  windows.set(key,next); return next.n <= 5;
}
function createCode(uid, channel, target) {
  const code = String(crypto.randomInt(100000,1000000));
  db.prepare("UPDATE account_security_codes SET used=1 WHERE user_id=? AND purpose='password-reset' AND channel=? AND used=0").run(uid,channel);
  db.prepare('INSERT INTO account_security_codes(user_id,purpose,channel,target,code_hash,expires_at) VALUES(?,?,?,?,?,?)')
    .run(uid,'password-reset',channel,target,hashCode(uid,'password-reset',channel,target,code),new Date(Date.now()+600000).toISOString());
  return code;
}
function verifyCode(uid, channel, target, code) {
  const row = db.prepare("SELECT * FROM account_security_codes WHERE user_id=? AND purpose='password-reset' AND channel=? AND used=0 ORDER BY id DESC LIMIT 1").get(uid,channel);
  if (!row || row.target!==target || Date.parse(row.expires_at)<=Date.now() || row.attempts>=5) return false;
  if (row.code_hash!==hashCode(uid,'password-reset',channel,target,code)) { db.prepare('UPDATE account_security_codes SET attempts=attempts+1 WHERE id=?').run(row.id); return false; }
  db.prepare('UPDATE account_security_codes SET used=1 WHERE id=?').run(row.id); return true;
}
async function sms(to, body) {
  const sid=String(process.env.TWILIO_ACCOUNT_SID||''), token=String(process.env.TWILIO_AUTH_TOKEN||''), from=String(process.env.TWILIO_FROM_NUMBER||'');
  if (!sid || !token || !from) return {ok:false,error:'SMS servisi yapılandırılmamış'};
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:to,From:from,Body:body})});
  if (!response.ok) { const x=await response.json().catch(()=>({})); return {ok:false,error:String(x.message||'SMS gönderilemedi')}; }
  return {ok:true};
}
async function deliver(channel,target,code) {
  const text=`AESD-Kasa şifre yenileme kodunuz: ${code}. Kod 10 dakika geçerlidir.`;
  if (channel==='phone') return sms(target,text);
  if (!emailConfigured()) return {ok:false,error:'E-posta servisi yapılandırılmamış'};
  const result=await sendEmailDetailed(target,'AESD-Kasa şifre yenileme kodu',text);
  return {ok:result.status==='accepted',error:result.error};
}
function auth(req,res,next) {
  try { const raw=String(req.headers.authorization||''); const p=jwt.verify(raw.startsWith('Bearer ')?raw.slice(7):'',secret); const u=db.prepare('SELECT id,email,phone,active FROM users WHERE id=?').get(p.id); if (!u?.active || p.kind!=='user') return res.status(401).json({error:'Hesap oturumu gerekli'}); req.pwUser=u; next(); }
  catch (_) { res.status(401).json({error:'Oturum geçersiz'}); }
}

const originalListen=express.application.listen;
express.application.listen=function(...args){
  if(!this.__passwordChannelsAdded){
    this.__passwordChannelsAdded=true;
    this.get('/password-reset/providers',(_req,res)=>res.json({emailConfigured:emailConfigured(),smsConfigured:Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_FROM_NUMBER)}));
    this.post('/password-reset/v2/request',async(req,res)=>{
      const channel=req.body?.channel==='phone'?'phone':'email';
      const target=channel==='phone'?normalizePhone(req.body?.identifier||req.body?.phone):normalizeEmail(req.body?.identifier||req.body?.email);
      if(!target)return res.status(400).json({error:channel==='phone'?'Geçerli telefon numarası gerekli':'Geçerli e-posta gerekli'});
      if(!allowed(`public:${req.ip}:${channel}:${target}`))return res.status(429).json({error:'Yeni kod için bir dakika bekleyin'});
      const u=channel==='phone'?db.prepare('SELECT id,active FROM users WHERE phone=?').get(target):db.prepare('SELECT id,active FROM users WHERE email=?').get(target);
      if(!u?.active)return res.json({ok:true,message:'Hesap mevcutsa kod gönderildi'});
      const code=createCode(u.id,channel,target), sent=await deliver(channel,target,code);
      if(!sent.ok)return res.status(503).json({error:sent.error||'Kod gönderilemedi'});
      res.json({ok:true,destination:channel==='phone'?maskPhone(target):maskEmail(target)});
    });
    this.post('/password-reset/v2/confirm',async(req,res)=>{
      const channel=req.body?.channel==='phone'?'phone':'email';
      const target=channel==='phone'?normalizePhone(req.body?.identifier||req.body?.phone):normalizeEmail(req.body?.identifier||req.body?.email);
      const code=String(req.body?.code||''), newPassword=String(req.body?.newPassword||'');
      const u=channel==='phone'?db.prepare('SELECT id,email,active FROM users WHERE phone=?').get(target):db.prepare('SELECT id,email,active FROM users WHERE email=?').get(target);
      if(!u?.active || !/^\d{6}$/.test(code) || newPassword.length<8 || !verifyCode(u.id,channel,target,code))return res.status(400).json({error:'Kod geçersiz veya süresi dolmuş'});
      db.prepare('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?').run(await bcrypt.hash(newPassword,12),u.id);
      res.json({ok:true,email:u.email,message:'Şifreniz yenilendi'});
    });
    this.post('/account/password-code/request',auth,async(req,res)=>{
      const channel=req.body?.channel==='phone'?'phone':'email';
      const target=channel==='phone'?normalizePhone(req.pwUser.phone):normalizeEmail(req.pwUser.email);
      if(!target)return res.status(400).json({error:channel==='phone'?'Önce hesabınıza telefon numarası ekleyin':'Hesap e-postası bulunamadı'});
      if(!allowed(`account:${req.pwUser.id}:${channel}`))return res.status(429).json({error:'Yeni kod için bir dakika bekleyin'});
      const code=createCode(req.pwUser.id,channel,target), sent=await deliver(channel,target,code);
      if(!sent.ok)return res.status(503).json({error:sent.error||'Kod gönderilemedi'});
      res.json({ok:true,destination:channel==='phone'?maskPhone(target):maskEmail(target)});
    });
    this.post('/account/password-code/confirm',auth,async(req,res)=>{
      const channel=req.body?.channel==='phone'?'phone':'email';
      const target=channel==='phone'?normalizePhone(req.pwUser.phone):normalizeEmail(req.pwUser.email);
      const code=String(req.body?.code||''), newPassword=String(req.body?.newPassword||'');
      if(!target || !/^\d{6}$/.test(code) || newPassword.length<8 || !verifyCode(req.pwUser.id,channel,target,code))return res.status(400).json({error:'Kod geçersiz veya süresi dolmuş'});
      db.prepare('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?').run(await bcrypt.hash(newPassword,12),req.pwUser.id);
      res.json({ok:true});
    });
  }
  return originalListen.apply(this,args);
};