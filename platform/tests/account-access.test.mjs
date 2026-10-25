import test from 'node:test';
import assert from 'node:assert/strict';
import {sqlite} from '../server/sqlite-adapter.mjs';
import {createPlatform, DAY} from '../server/platform-core.mjs';

async function fixture() {
  const db = sqlite();
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,password_hash TEXT,role TEXT,active INTEGER DEFAULT 1)');
  db.prepare("INSERT INTO users(email,password_hash,role) VALUES('owner@example.test','hash:owner-password','OWNER')").run();
  let time = Date.parse('2026-10-18T08:00:00Z'), provider = 'accepted', failed = false;
  const messages = [];
  const platform = createPlatform({db, secret: 'account-access-isolated-secret-32-characters',
    passwords: {hash: async p => 'hash:' + p, compare: async (p, hash) => hash === 'hash:' + p},
    ready: () => true, persist: async () => { if (failed) throw Error('isolated persistence failure'); }, clock: () => time,
    mail: {configured: () => true, send: async (to, subject, text) => { messages.push({to, subject, text}); return {status: provider}; }}
  });
  const ownerLogin = await platform.login({email: 'owner@example.test', password: 'owner-password', deviceId: 'account_owner_device_001'});
  const owner = platform.authenticate(ownerLogin.token);
  const b = await platform.register({email: 'customer@example.test', password: 'customer-password', businessName: 'İzole Test', contactName: 'Yetkili', module: 'market', role: 'OWNER'});
  const login = await platform.login({email: 'customer@example.test', password: 'customer-password', deviceId: 'account_customer_device_001'});
  const customer = platform.authenticate(login.token);
  const verify = async () => { await platform.accounts.requestVerification(customer); const code = messages.at(-1).text.match(/kodun: (\d{6})/)[1]; await platform.accounts.confirmVerification(customer, {code}); return code; };
  const approveDevice = async (principal = customer) => {
    const request = await platform.accounts.requestDevice(principal, {module: 'market', label: 'Test cihazı'});
    await platform.accounts.changeDevice(owner, request.id, {action: 'approve', verificationCode: request.verificationCode});
    return request;
  };
  return {db, platform, owner, customer, b, login, messages, verify, approveDevice,
    advance: n => time += n, provider: value => provider = value, failPersist: () => failed = true};
}

test('New registration requires verification and cannot grant OWNER through email or input', async () => {
  const f = await fixture();
  try {
    assert.equal(f.customer.user.role, 'CLIENT');
    assert.equal(f.platform.status(f.customer).accountAccess.verificationRequired, true);
    await f.platform.approve(f.owner, f.b.id);
    await assert.rejects(f.platform.lease(f.customer, 'market'), /e-posta/);
    const code = await f.verify();
    assert.equal(f.platform.status(f.customer).accountAccess.verificationRequired, false);
    assert.equal(f.platform.status(f.customer).user.role, 'CLIENT');
    await assert.rejects(f.platform.accounts.confirmVerification(f.customer, {code}), /kullanılmış/);
    await assert.rejects(f.platform.lease(f.customer, 'market'), /cihaz onayı/);
  } finally { f.db.close(); }
});

test('Verification limits attempts, expires and stores only code hashes', async () => {
  const f = await fixture();
  try {
    await f.platform.accounts.requestVerification(f.customer);
    const code = f.messages.at(-1).text.match(/kodun: (\d{6})/)[1];
    const row = f.db.prepare('SELECT * FROM aesd_email_challenges').get();
    assert.notEqual(row.code_hash, code);
    await assert.rejects(f.platform.accounts.requestVerification(f.customer), e => e.status === 429);
    for (let i = 0; i < 5; i++) await assert.rejects(f.platform.accounts.confirmVerification(f.customer, {code: 'wrong'}));
    await assert.rejects(f.platform.accounts.confirmVerification(f.customer, {code}));
    f.advance(3600001);
    await f.platform.accounts.requestVerification(f.customer);
    f.advance(600000);
    await assert.rejects(f.platform.accounts.confirmVerification(f.customer, {code: f.messages.at(-1).text.match(/kodun: (\d{6})/)[1]}));
  } finally { f.db.close(); }
});

test('Provider rejection invalidates the verification code without verifying the account', async () => {
  const f = await fixture();
  try {
    f.provider('rejected');
    await assert.rejects(f.platform.accounts.requestVerification(f.customer), e => e.status === 503);
    assert.equal(f.db.prepare('SELECT used FROM aesd_email_challenges').get().used, 1);
    assert.equal(f.platform.status(f.customer).accountAccess.emailVerified, false);
  } finally { f.db.close(); }
});

test('Device approval checks the displayed code and remains separate from business approval', async () => {
  const f = await fixture();
  try {
    await f.verify();
    const request = await f.platform.accounts.requestDevice(f.customer, {module: 'market', label: 'Tablet'});
    await assert.rejects(f.platform.accounts.changeDevice(f.customer, request.id, {action: 'approve', verificationCode: request.verificationCode}), e => e.status === 403);
    const wrong = request.verificationCode === '000000' ? '000001' : '000000';
    await assert.rejects(f.platform.accounts.changeDevice(f.owner, request.id, {action: 'approve', verificationCode: wrong}), e => e.status === 400);
    await f.platform.accounts.changeDevice(f.owner, request.id, {action: 'approve', verificationCode: request.verificationCode});
    await assert.rejects(f.platform.lease(f.customer, 'market'), /İşyeri/);
    await f.platform.approve(f.owner, f.b.id);
    assert.equal((await f.platform.lease(f.customer, 'market')).lease.mode, 'trial');
    assert.equal(f.platform.authorizePanel(f.customer, 'market'), f.b.id);
    assert.throws(() => f.platform.authorizePanel(f.customer, 'private'), e => e.status === 403);
    assert.equal(JSON.stringify(f.platform.accounts.listDevices(f.owner)).includes(request.verificationCode), false);
  } finally { f.db.close(); }
});

test('Approved device replacement preserves trial/license dates and revokes the previous device', async () => {
  const f = await fixture();
  try {
    await f.verify(); await f.approveDevice(); await f.platform.approve(f.owner, f.b.id);
    await f.platform.lease(f.customer, 'market');
    const grant = await f.platform.grant(f.owner, f.b.id, {module: 'market', plan: 'monthly', paymentConfirmed: true});
    const activated = await f.platform.activate(f.customer, {module: 'market', code: grant.code});
    const trialEnds = f.platform.status(f.customer).business.trialEnds;
    const nextLogin = await f.platform.login({email: 'customer@example.test', password: 'customer-password', deviceId: 'replacement_device_0001'});
    const next = f.platform.authenticate(nextLogin.token);
    await assert.rejects(f.platform.lease(next, 'market'), e => e.status === 403);
    f.advance(3600001); await f.approveDevice(next);
    const lease = await f.platform.lease(next, 'market');
    assert.equal(lease.lease.validUntil <= activated.expires, true);
    assert.equal(f.platform.status(next).business.panels[0].expires, activated.expires);
    assert.equal(f.platform.status(next).business.trialEnds, trialEnds);
    assert.throws(() => f.platform.authorizePanel(f.customer, 'market'), e => e.status === 403);
    const device = f.platform.accounts.listDevices(f.owner).devices.find(x => x.state === 'approved');
    await f.platform.accounts.changeDevice(f.owner, device.id, {action: 'revoke'});
    assert.throws(() => f.platform.authorizePanel(next, 'market'), e => e.status === 403);
  } finally { f.db.close(); }
});

test('Account session revocation is scoped to the authenticated account', async () => {
  const f = await fixture();
  try {
    const own = f.platform.accounts.sessions(f.customer).sessions[0];
    const admin = f.platform.accounts.sessions(f.owner).sessions[0];
    assert.equal(own.current, true);
    assert.notEqual(own.id, f.login.token);
    await assert.rejects(f.platform.accounts.revokeSession(f.customer, admin.id), e => e.status === 404);
    await f.platform.accounts.revokeSession(f.customer, own.id);
    assert.throws(() => f.platform.authenticate(f.login.token), e => e.status === 401);
    assert.equal(f.platform.accounts.sessions(f.owner).sessions.length, 1);
  } finally { f.db.close(); }
});

test('Correcting an unverified address preserves identity, invalidates the old code and never changes role',async()=>{
 const f=await fixture();try{
  await f.platform.accounts.requestVerification(f.customer);const oldCode=f.messages.at(-1).text.match(/kodun: (\d{6})/)[1];
  await assert.rejects(f.platform.accounts.correctEmail(f.customer,{email:'corrected@example.test',password:'wrong'}),e=>e.status===400);
  await f.platform.accounts.correctEmail(f.customer,{email:'corrected@example.test',password:'customer-password'});
  assert.equal(f.platform.status(f.customer).user.id,f.customer.user.id);assert.equal(f.platform.status(f.customer).user.email,'corrected@example.test');assert.equal(f.platform.status(f.customer).user.role,'CLIENT');
  assert.equal(f.platform.status(f.customer).business.id,f.b.id);await assert.rejects(f.platform.accounts.confirmVerification(f.customer,{code:oldCode}));
  f.advance(60001);await f.verify();await assert.rejects(f.platform.accounts.correctEmail(f.customer,{email:'other@example.test',password:'customer-password'}),e=>e.status===400);
  await assert.rejects(f.platform.accounts.correctEmail(f.owner,{email:'customer@example.test',password:'owner-password'}),e=>e.status===400);
 }finally{f.db.close();}
});

test('A revoked device requires explicit reopening, a fresh device code and owner approval',async()=>{
 const f=await fixture();try{
  await f.verify();const request=await f.approveDevice();await f.platform.accounts.changeDevice(f.owner,request.id,{action:'revoke'});
  await assert.rejects(f.platform.accounts.requestDevice(f.customer,{module:'market',label:'Tablet'}),e=>e.status===403);
  await f.platform.accounts.changeDevice(f.owner,request.id,{action:'reopen'});f.advance(60001);
  const retry=await f.platform.accounts.requestDevice(f.customer,{module:'market',label:'Tablet'});assert.equal(retry.state,'pending');
  await f.platform.accounts.changeDevice(f.owner,retry.id,{action:'approve',verificationCode:retry.verificationCode});
  assert.equal(f.platform.accounts.status(f.customer).devices[0].state,'approved');assert.equal(f.platform.status(f.customer).business.trialStarted,null);
 }finally{f.db.close();}
});

test('Password changes reject the wrong password and revoke all old account sessions', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.platform.accounts.changePassword(f.customer, {currentPassword: 'wrong', newPassword: 'a-new-password'}), e => e.status === 400);
    await f.platform.accounts.changePassword(f.customer, {currentPassword: 'customer-password', newPassword: 'a-new-password'});
    assert.throws(() => f.platform.authenticate(f.login.token), e => e.status === 401);
    const login = await f.platform.login({email: 'customer@example.test', password: 'a-new-password', deviceId: 'account_customer_device_001'});
    assert.equal(login.user.role, 'CLIENT');
  } finally { f.db.close(); }
});

test('Existing users retain access controls and a failed durable write never reports approval', async () => {
  const f = await fixture();
  try {
    assert.equal(f.platform.status(f.owner).accountAccess.verificationRequired, false);
    await f.verify();
    const request = await f.platform.accounts.requestDevice(f.customer, {module: 'market', label: 'Test'});
    f.failPersist();
    await assert.rejects(f.platform.accounts.changeDevice(f.owner, request.id, {action: 'approve', verificationCode: request.verificationCode}), e => e.status === 503);
    assert.equal(f.platform.ready(), false);
  } finally { f.db.close(); }
});
