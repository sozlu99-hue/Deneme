import assert from 'node:assert/strict';
import {test} from 'node:test';
import BetterSQLite from 'better-sqlite3';
import crypto from 'node:crypto';
import {createRecovery} from '../oses-recovery.js';

let Database = BetterSQLite;
try {if(process.env.AESD_RECOVERY_SQLITE==='node')throw Error('Use the selected isolated SQLite adapter.');const probe = new BetterSQLite(':memory:'); probe.close();}
catch {
  const {DatabaseSync} = await import('node:sqlite');
  Database = class extends DatabaseSync {
    transaction(fn) {return (...args) => {this.exec('BEGIN IMMEDIATE'); try {const result=fn(...args);this.exec('COMMIT');return result;} catch(error) {this.exec('ROLLBACK');throw error;}};}
  };
}

function fixture() {
  const db = new Database(':memory:'); let now = 10000000, persisted = 0, failPersist = false, failMail = false;
  const sent = [];
  const options = {db, pepper: 'x'.repeat(64), ownerEmail: 'owner@example.test', clock: () => now, ready: () => true,
    persist: async () => {if (failPersist) throw Error('disk'); persisted++;},
    send: async (to, subject, message) => {sent.push({to, subject, message, code: message.match(/kodunuz: ([0-9]{6})/)[1]}); return failMail ? {status: 'failed'} : {status: 'accepted', messageId: 'test-id'};}};
  const service = createRecovery(options);
  const body = {deviceId: crypto.randomBytes(32).toString('hex'), secret: crypto.randomBytes(32).toString('hex'), email: 'owner@example.test'};
  const request = async purpose => {const result = await service.request(body, purpose); return {...body, challengeId: result.challengeId, code: sent.at(-1).code};};
  return {db, body, service, sent, request, options, advance: () => now += 61000, expire: () => now += 600000,
    failPersist: () => failPersist = true, failMail: () => failMail = true, persisted: () => persisted};
}
test('enroll then reset: single use, bounded purpose, no plaintext secrets in database', async () => {
  const f = fixture(), enroll = await f.request('enroll');
  await assert.rejects(f.service.verify(enroll, 'reset'));
  assert.equal((await f.service.verify(enroll, 'enroll')).ok, true);
  f.advance(); const reset = await f.request('reset');
  await f.service.verify(reset, 'reset'); await assert.rejects(f.service.verify(reset, 'reset'));
  const record = f.db.prepare('SELECT * FROM oses_recovery_challenges WHERE id=?').get(reset.challengeId);
  assert.notEqual(record.code_hash, reset.code);
  assert.notEqual(f.db.prepare('SELECT secret_hash FROM oses_recovery_devices').get().secret_hash, f.body.secret);
  assert(f.persisted() >= 6); f.db.close();
});
test('five wrong codes stay exhausted after service restart', async () => {
  const f = fixture(), challenge = await f.request('enroll');
  const wrong = challenge.code === '111111' ? '222222' : '111111';
  for (let i=0; i<5; i++) await assert.rejects(f.service.verify({...challenge, code: wrong}, 'enroll'));
  const restarted = createRecovery(f.options);
  await assert.rejects(restarted.verify(challenge, 'enroll'));
  assert.equal(f.db.prepare('SELECT attempts FROM oses_recovery_challenges').get().attempts, 5); f.db.close();
});
test('old code invalidated on resend, expiry enforced at 10 minutes', async () => {
  const f=fixture(), first=await f.request('enroll'); f.advance(); const second=await f.request('enroll');
  await assert.rejects(f.service.verify(first,'enroll')); f.expire(); await assert.rejects(f.service.verify(second,'enroll')); f.db.close();
});
test('different recipient or secret is rejected', async () => {
  const f=fixture(); await assert.rejects(f.service.request({...f.body,email:'other@example.test'},'enroll'));
  const code=await f.request('enroll'); await assert.rejects(f.service.verify({...code,secret:'a'.repeat(64)},'enroll')); f.db.close();
});
test('resend rate limits are durable and cannot be bypassed by new IDs', async () => {
  const f=fixture(); await f.request('enroll'); await assert.rejects(f.request('enroll'),{status:429});
  for(let i=0;i<2;i++){f.advance();f.body.deviceId=crypto.randomBytes(32).toString('hex');await f.request('enroll');}
  f.advance();f.body.deviceId=crypto.randomBytes(32).toString('hex');await assert.rejects(f.request('enroll'),{status:429});f.db.close();
});
test('failed mail never creates a usable code',async()=>{
  const f=fixture();f.failMail();await assert.rejects(f.request('enroll'),{status:503});
  const row=f.db.prepare('SELECT * FROM oses_recovery_challenges').get();assert.equal(row.used,1);assert.equal(row.sent,0);f.db.close();
});
test('failed durable reservation sends no mail',async()=>{
  const f=fixture();f.failPersist();await assert.rejects(f.request('enroll'),{status:503});assert.equal(f.sent.length,0);f.db.close();
});
test('unverified device cannot request reset',async()=>{
  const f=fixture();await f.request('enroll');f.advance();await assert.rejects(f.request('reset'));f.db.close();
});
test('parallel code verification succeeds only once',async()=>{
  const f=fixture(), code=await f.request('enroll');const results=await Promise.allSettled(Array.from({length:5},()=>f.service.verify(code,'enroll')));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);f.db.close();
});


test('email and phone codes are isolated; enrolling phone preserves Gmail verification', async () => {
 const f=fixture(); const phoneSent=[];
 const opts={...f.options, ownerPhone:'0532 111 22 33',smsReady:()=>true,
  sendSms:async(to,message)=>{phoneSent.push({to,code:message.match(/kodunuz: ([0-9]{6})/)[1]});return {status:'accepted',messageId:'sms-test'};}};
 const service=createRecovery(opts); const emailChallenge=await f.request('enroll'); await service.verify(emailChallenge,'enroll');
 const phoneBody={...f.body,channel:'phone',phone:'+905321112233'};
 const phoneChallenge=await service.request(phoneBody,'enroll');
 const verification={...phoneBody,challengeId:phoneChallenge.challengeId,code:phoneSent[0].code};
 await assert.rejects(service.verify({...verification,channel:'email'},'enroll'));
 await service.verify(verification,'enroll');
 const row=f.db.prepare('SELECT * FROM oses_recovery_devices').get();assert.equal(row.verified,1);assert.equal(row.phone_verified,1);
 assert.equal(phoneSent[0].to,'+905321112233');assert.equal(phoneChallenge.channel,'phone');
 f.advance();const reset=await service.request(phoneBody,'reset');
 await service.verify({...phoneBody,challengeId:reset.challengeId,code:phoneSent.at(-1).code},'reset');f.db.close();
});
test('SMS not configured never sends code or creates a challenge',async()=>{
 const f=fixture();await assert.rejects(f.service.request({...f.body,channel:'phone',phone:'+905321112233'},'enroll'),{status:503});
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM oses_recovery_challenges').get().n,0);f.db.close();
});
test('accepted code verifies even if email provider temporarily goes offline',async()=>{
 const f=fixture(), code=await f.request('enroll');
 const service=createRecovery({...f.options,ready:()=>false});assert.equal(service.configured(),false);
 assert.equal((await service.verify(code,'enroll')).ok,true);f.db.close();
});
test('migrating an existing v1 database retains verified devices and usable in-flight email codes',async()=>{
 const f=fixture(), code=await f.request('enroll');
 f.db.prepare("UPDATE oses_recovery_challenges SET target='' WHERE id=?").run(code.challengeId);
 const service=createRecovery(f.options);await service.verify(code,'enroll');assert.equal(f.db.prepare('SELECT verified FROM oses_recovery_devices').get().verified,1);f.db.close();
});
test('wrong SMS destination is rejected before provider call',async()=>{
 const f=fixture(), service=createRecovery({...f.options,ownerPhone:'+905321112233',smsReady:()=>true});
 await assert.rejects(service.request({...f.body,channel:'phone',phone:'+905331112233'},'enroll'),{status:400});f.db.close();
});

test('successful password reset cancels outstanding reset codes from every channel', async()=>{
 const f=fixture();let phoneCode;
 const service=createRecovery({...f.options,ownerPhone:'+905321112233',smsReady:()=>true,sendSms:async(_to,message)=>{phoneCode=message.match(/kodunuz: ([0-9]{6})/)[1];return {status:'accepted',messageId:'test-sms'};}});
 const emailEnroll=await service.request(f.body,'enroll');await service.verify({...f.body,challengeId:emailEnroll.challengeId,code:f.sent.at(-1).code},'enroll');
 const phoneBody={...f.body,channel:'phone',phone:'+905321112233'};
 const phoneEnroll=await service.request(phoneBody,'enroll');await service.verify({...phoneBody,challengeId:phoneEnroll.challengeId,code:phoneCode},'enroll');
 f.advance();const emailReset=await service.request(f.body,'reset'),emailCode=f.sent.at(-1).code;
 const phoneReset=await service.request(phoneBody,'reset'),pendingPhoneCode=phoneCode;
 await service.verify({...f.body,challengeId:emailReset.challengeId,code:emailCode},'reset');
 await assert.rejects(service.verify({...phoneBody,challengeId:phoneReset.challengeId,code:pendingPhoneCode},'reset'),{status:400});f.db.close();
});
test('legacy code cannot approve recovery after the configured owner address changes',async()=>{
 const f=fixture(),code=await f.request('enroll');
 f.db.prepare("UPDATE oses_recovery_challenges SET target='' WHERE id=?").run(code.challengeId);
 const changed=createRecovery({...f.options,ownerEmail:'new-owner@example.test'});
 await assert.rejects(changed.verify(code,'enroll'),{status:400});f.db.close();
});
