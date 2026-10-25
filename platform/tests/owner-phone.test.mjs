import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {sqlite} from '../server/sqlite-adapter.mjs';
import {createPlatform} from '../server/platform-core.mjs';
import {normalizeLoginPhone} from '../server/login-phone.mjs';

test('Owner phone normalization accepts existing Turkish and international forms and rejects malformed identifiers',()=>{
 for(const value of ['0539 590 66 66','5395906666','+90 (539) 590-66-66','00905395906666','905395906666'])assert.equal(normalizeLoginPhone(value),'+905395906666');
 for(const value of ['name5395906666','abc','123','+00','5'.repeat(60),'owner@example.test'])assert.equal(normalizeLoginPhone(value),'');
});
test('Registered owner phone uses the same password, account identity, role and session revocation',async()=>{
 const db=sqlite(':memory:');db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,phone TEXT UNIQUE,password_hash TEXT,role TEXT,active INTEGER)');
 const hash=await bcrypt.hash('isolated-owner-password',4);db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(1,'owner@example.test','+905395906666',hash,'OWNER',1);db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(2,'client@example.test','+905395906667',hash,'CLIENT',1);
 const p=createPlatform({db,secret:'isolated-owner-phone-secret-more-than-32',passwords:bcrypt,persist:async()=>{},ready:()=>true});
 try{
  const value=await p.login({phone:'05395906666',password:'isolated-owner-password',deviceId:'owner_phone_test_device'});assert.equal(value.user.id,1);assert.equal(value.user.email,'owner@example.test');assert.equal(value.user.role,'OWNER');assert.equal(p.authenticate(value.token).user.id,1);
  await assert.rejects(p.login({phone:'05395906667',password:'isolated-owner-password',deviceId:'owner_phone_test_device'}),e=>e.status===401);
  await assert.rejects(p.login({phone:'05395906666',password:'wrong-password',deviceId:'owner_phone_test_device'}),e=>e.status===401);
  db.prepare('UPDATE users SET active=0 WHERE id=1').run();assert.throws(()=>p.authenticate(value.token),e=>e.status===401);
 }finally{db.close();}
});
