// Server-only mail delivery. Never include these credentials in the mobile build.
const value = (name) => String(process.env[name] || '').trim();
const provider = () => value('MAIL_PROVIDER') || 'resend';
export function emailConfigured(selectedProvider = provider()) {
  if (selectedProvider === 'gmail_smtp') return Boolean(value('GMAIL_SENDER_EMAIL') && value('GMAIL_APP_PASSWORD'));
  if (selectedProvider === 'gmail') return Boolean(value('GMAIL_CLIENT_ID') && value('GMAIL_CLIENT_SECRET') && value('GMAIL_REFRESH_TOKEN') && value('GMAIL_SENDER_EMAIL'));
  return selectedProvider === 'resend' && Boolean(value('RESEND_API_KEY') && value('SECURITY_FROM_EMAIL'));
}
// Account recovery uses the working HTTPS transport on Render Free.
export function recoveryProvider() {
  return value('AESD_RECOVERY_MAIL_PROVIDER') || value('OSES_MAIL_PROVIDER') || (emailConfigured('gmail') ? 'gmail' : provider());
}
const mailbox = (input) => /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/.test(input);
let tokenCache = null;
let pendingToken = null;
async function accessToken() {
  if (tokenCache && tokenCache.expires > Date.now() + 60000) return tokenCache.token;
  if (pendingToken) return pendingToken;
  pendingToken = (async () => {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({client_id: value('GMAIL_CLIENT_ID'), client_secret: value('GMAIL_CLIENT_SECRET'), refresh_token: value('GMAIL_REFRESH_TOKEN'), grant_type: 'refresh_token'}),
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      const reason = ['invalid_client', 'invalid_grant', 'unauthorized_client', 'invalid_request'].includes(data.error) ? data.error : 'provider_error';
      console.error('Gmail token refresh failed:', response.status, reason);
      throw new Error(`GMAIL_AUTH_FAILED:${reason}`);
    }
    tokenCache = {token: data.access_token, expires: Date.now() + Math.max(0, Number(data.expires_in) || 0) * 1000};
    return tokenCache.token;
  })();
  try { return await pendingToken; } finally { pendingToken = null; }
}
let transportCheck = null;
export async function checkEmailTransport(selectedProvider = provider()) {
  if (!emailConfigured(selectedProvider)) return {ok: false, reason: 'NOT_CONFIGURED'};
  if (selectedProvider !== 'gmail') return {ok: false, reason: 'TRANSPORT_NOT_VERIFIED'};
  if (transportCheck && transportCheck.until > Date.now()) return transportCheck.result;
  let result;
  try {await accessToken(); result = {ok: true, method: 'gmail-https', authentication: 'verified'};}
  catch {result = {ok: false, reason: 'GMAIL_AUTHORIZATION_REQUIRED'};}
  transportCheck = {until: Date.now() + 60000, result};
  return result;
}
export async function sendEmailDetailed(to, subject, message, selectedProvider = provider(), createTransport = async options => (await import('nodemailer')).createTransport(options)) {
  const target = String(to || '').trim().toLowerCase();
  if (!emailConfigured(selectedProvider)) return {status: 'failed', error: 'E-posta servisi yapılandırılmamış.'};
  if (!mailbox(target) || /[\r\n]/.test(subject)) return {status: 'failed', error: 'Geçersiz e-posta bilgisi.'};
  try {
    let response;
    if (selectedProvider === 'gmail_smtp') {
      const from = value('GMAIL_SENDER_EMAIL');
      const transporter = await createTransport({
        service: 'gmail',
        disableFileAccess: true,
        disableUrlAccess: true,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth: {user: from, pass: value('GMAIL_APP_PASSWORD')},
      });
      const info = await transporter.sendMail({
        from: `AESD Kasa <${from}>`,
        to: target,
        subject: String(subject),
        text: String(message),
      });
      return {status: info?.messageId ? 'accepted' : 'failed', messageId: info?.messageId || null, error: info?.messageId ? undefined : 'Gmail gönderimi kabul edilmedi.'};
    }
    if (selectedProvider === 'gmail') {
      const from = value('GMAIL_SENDER_EMAIL');
      if (!mailbox(from)) return {status: 'failed', error: 'Gönderici e-posta adresi geçersiz.'};
      const encodedBody = Buffer.from(String(message), 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
      const raw = Buffer.from([
        `From: AESD-Kasa <${from}>`, `To: ${target}`,
        `Subject: =?UTF-8?B?${Buffer.from(String(subject)).toString('base64')}?=`,
        'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64', '', encodedBody,
      ].join('\r\n')).toString('base64url');
      const send = async () => fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST', headers: {Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({raw}), signal: AbortSignal.timeout(12000),
      });
      response = await send();
      // A rejected token has not sent mail; refresh once. Never retry ambiguous failures.
      if (response.status === 401) { tokenCache = null; response = await send(); }
    } else {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: {Authorization: `Bearer ${value('RESEND_API_KEY')}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({from: value('SECURITY_FROM_EMAIL'), to: [target], subject, text: message}),
        signal: AbortSignal.timeout(12000),
      });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.id) return {status: 'failed', error: `E-posta sağlayıcısı gönderimi kabul etmedi (${response.status}).`};
    return {status: 'accepted', messageId: data.id};
  } catch (error) {
    // Do not expose provider responses, credentials or message contents in logs.
    return {status: 'failed', error: error.message.startsWith('GMAIL_AUTH_FAILED:') ? `Gmail gönderim izni geçersiz: ${error.message.split(':')[1]}. Yönetici bağlantıyı kontrol etmeli.` : 'E-posta sağlayıcısına ulaşılamadı.'};
  }
}

