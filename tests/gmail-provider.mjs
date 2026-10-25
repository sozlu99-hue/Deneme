import assert from 'node:assert/strict';
process.env.MAIL_PROVIDER = 'gmail';
process.env.GMAIL_CLIENT_ID = 'test-client';
process.env.GMAIL_CLIENT_SECRET = 'test-secret';
process.env.GMAIL_REFRESH_TOKEN = 'test-refresh';
process.env.GMAIL_SENDER_EMAIL = 'sender@example.test';
const {sendEmailDetailed, emailConfigured} = await import('../mail-provider.js');
let refreshes = 0, sends = 0, mode = 'ok';
globalThis.fetch = async (url, options) => {
  if (url === 'https://oauth2.googleapis.com/token') {
    refreshes++;
    assert.equal(options.body.get('grant_type'), 'refresh_token');
    if (mode === 'revoked') return new Response(JSON.stringify({error: 'invalid_grant'}), {status: 400});
    return new Response(JSON.stringify({access_token: 'test-access', expires_in: 3600}));
  }
  assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  sends++;
  const mime = Buffer.from(JSON.parse(options.body).raw, 'base64url').toString();
  assert.ok(mime.includes('To: recipient@example.test\r\n'));
  assert.equal(Buffer.from(mime.split('\r\n\r\n')[1], 'base64').toString(), 'Şifre kodu: 123456');
  if (mode === 'revoked') return new Response('{}', {status: 401});
  if (mode === 'quota') return new Response('{}', {status: 429});
  return new Response(JSON.stringify({id: 'provider-message'}));
};
const send = () => sendEmailDetailed('recipient@example.test', 'AESD güvenlik', 'Şifre kodu: 123456');
assert.equal(emailConfigured(), true);
assert.equal((await send()).status, 'accepted');
assert.equal((await send()).status, 'accepted');
assert.equal(refreshes, 1);
assert.equal((await sendEmailDetailed('a@example.test\r\nBcc:b@example.test', 'test', '')).status, 'failed');
assert.equal(sends, 2);
mode = 'quota'; assert.equal((await send()).status, 'failed'); assert.equal(sends, 3);
mode = 'revoked'; assert.match((await send()).error, /izni geçersiz/);
delete process.env.GMAIL_REFRESH_TOKEN;
assert.equal(emailConfigured(), false);
assert.equal((await send()).status, 'failed');
console.log('PASS: Gmail MIME, Turkish text, token cache, invalid recipient, quota failure, revoked permission and missing config. Mock transport only; no real mail sent.');

// O SES must use HTTPS even when the existing application's default is SMTP.
process.env.MAIL_PROVIDER = 'gmail_smtp';
process.env.GMAIL_REFRESH_TOKEN = 'test-refresh';
mode = 'ok';
assert.equal(emailConfigured('gmail'), true);
assert.equal((await sendEmailDetailed('recipient@example.test', 'O SES güvenlik', 'Şifre kodu: 123456', 'gmail')).status, 'accepted');
const beforeCheck = sends;
const {checkEmailTransport} = await import('../mail-provider.js');
assert.deepEqual(await checkEmailTransport('gmail'), {ok: true, method: 'gmail-https', authentication: 'verified'});
assert.equal(sends, beforeCheck);
mode = 'revoked';
const freshProvider = await import('../mail-provider.js?revoked-health');
assert.deepEqual(await freshProvider.checkEmailTransport('gmail'), {ok: false, reason: 'GMAIL_AUTHORIZATION_REQUIRED'});
assert.equal(sends, beforeCheck);
console.log('PASS: explicit HTTPS provider override and live-auth health behavior without sending mail.');
