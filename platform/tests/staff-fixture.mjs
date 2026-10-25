import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {sqlite} from '../server/sqlite-adapter.mjs';
import {createPlatform} from '../server/platform-core.mjs';
import {createStaffAccess} from '../server/staff-access.mjs';
import {createStaffSales} from '../server/staff-sales.mjs';
import {sqliteRepository} from '../server/cloud-repository.mjs';
import {createCloud} from '../server/cloud-core.mjs';
import {privateProjection,privateMenu} from '../server/private-engine.mjs';
const require=createRequire(import.meta.url),{launch,base}=require('../legacy-tests/tests/pos-harness.cjs');
let seed;
const passwords={hash:async value=>'isolated-hash:'+value,compare:async(value,encoded)=>encoded==='isolated-hash:'+value};
const firstDevice='staff_first_device_001',secondDevice='staff_second_device_001';
export async function staffFixture(){
 if(!seed){const app=await launch(undefined,base(),{menu:true});seed=privateMenu(privateProjection(app.store()));}
 const db=sqlite(),ledgerDb=sqlite();db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,password_hash TEXT,role TEXT,active INTEGER DEFAULT 1)');db.prepare("INSERT INTO users(email,password_hash,role) VALUES(?,?,'OWNER')").run('owner@example.test','isolated-hash:owner-test-password');
 let now=Date.now(),failPersistence=false;
 const platform=createPlatform({db,secret:'staff-access-test-secret-never-for-production',passwords,clock:()=>now,persist:async()=>{if(failPersistence)throw Error('Isolated persistence failure');},ready:()=>true});
 const ownerLogin=await platform.login({email:'owner@example.test',password:'owner-test-password',deviceId:'staff_owner_device_001'}),owner=platform.authenticate(ownerLogin.token);
 const access=createStaffAccess({db,platform,passwords,clock:()=>now}),repository=sqliteRepository(ledgerDb),sales=createStaffSales({repository,access,clock:()=>now}),cloud=createCloud({repository,authorize:platform.authorizePanel,clock:()=>now});
 await cloud.mutate(owner,'private',{kind:'import',operationId:crypto.randomUUID(),data:structuredClone(seed)});
 const invite=await access.create(owner,{name:'Kardeşim'});
 const claim=()=>access.claim({code:invite.code,password:'staff-test-password',deviceId:firstDevice,deviceLabel:'iPhone Safari',remember:true});
 const principal=response=>access.authenticate(response.token,firstDevice);
 const approve=async()=>{const response=await claim(),p=principal(response),d=access.list(owner).grants[0].devices[0];await access.changeDevice(owner,d.id,{action:'approve',verificationCode:response.verificationCode});return{response,p,d};};
 return{db,ledgerDb,passwords,repository,platform,owner,ownerLogin,access,sales,cloud,invite,claim,principal,approve,advance:n=>now+=n,failPersist:()=>failPersistence=true,close:()=>{db.close();ledgerDb.close();}};
}
