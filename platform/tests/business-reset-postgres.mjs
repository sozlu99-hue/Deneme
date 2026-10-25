import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {staffFixture} from './staff-fixture.mjs';
import {postgresRepository} from '../server/cloud-repository.mjs';
import {createCloud} from '../server/cloud-core.mjs';
import {createBusinessReset} from '../server/business-reset.mjs';
import {emptyState} from '../web/pos.js';
const url=process.env.TEST_PG_URL;if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Explicit isolated loopback PostgreSQL URL required.');
const {Pool}=createRequire(import.meta.url)('pg');
const op=(kind,data,extra={})=>({kind,data,operationId:crypto.randomUUID(),...extra});
const confirm=ticket=>({token:ticket.token,password:'owner-test-password',confirmation:'SIFIRLA',backupAcknowledged:true});
test('PostgreSQL reset atomically locks the snapshot, preserves other scopes and retains barriers after reconnect',async t=>{
 const f=await staffFixture();t.after(()=>f.close());const pool=new Pool({connectionString:url,max:4});const prefix='reset-pg-'+crypto.randomUUID()+':',base=postgresRepository(pool);
 const repository={mode:base.mode,read:(scope,module,since)=>base.read(prefix+scope,module,since),transact:(scope,module,fn)=>base.transact(prefix+scope,module,fn)};
 t.after(async()=>{await pool.query('DELETE FROM aesd_cloud_operations WHERE scope LIKE $1',[prefix+'%']);await pool.query('DELETE FROM aesd_cloud_panels WHERE scope LIKE $1',[prefix+'%']);await pool.end();});
 const a=createCloud({repository,authorize:f.platform.authorizePanel}),b=createCloud({repository,authorize:f.platform.authorizePanel}),reset=createBusinessReset({...f,repository});
 await a.mutate(f.owner,'market',op('import',emptyState('owner:1','market')));const seed=(await f.cloud.read(f.owner,'private')).state;await a.mutate(f.owner,'private',op('import',seed));
 const before=await a.mutate(f.owner,'market',op('command',{type:'customer',name:'Before reset'})),ticket=await reset.prepare(f.owner,'market');
 const attempts=await Promise.allSettled([reset.confirm(f.owner,'market',confirm(ticket)),b.mutate(f.owner,'market',op('command',{type:'customer',name:'Concurrent record'},{expectedRevision:before.revision}))]);
 const after=await a.read(f.owner,'market');if(attempts[0].status==='fulfilled'){assert.deepEqual(after.state.customers,[]);assert.equal(attempts[1].status,'rejected');}else{assert.equal(attempts[1].status,'fulfilled');assert.equal(after.state.customers.length,2);}
 const latest=await reset.prepare(f.owner,'market');const done=await reset.confirm(f.owner,'market',confirm(latest));assert(done.revision>before.revision);
 const reopened=createCloud({repository,authorize:f.platform.authorizePanel});const row=await reopened.read(f.owner,'market');assert.equal(row.resetRevision,done.revision);await assert.rejects(reopened.mutate(f.owner,'market',op('command',{type:'customer',name:'Stale'},{expectedRevision:before.revision})),/sıfırlandı/);assert.deepEqual((await reopened.read(f.owner,'private')).state,seed);
 const current=await reset.prepare(f.owner,'private');const failing={...repository,transact:(scope,module,fn)=>repository.transact(scope,module,tx=>fn({...tx,save:async(...args)=>{await tx.save(...args);throw Error('Injected transaction failure');}}))};const broken=createBusinessReset({...f,repository:failing}),bad=await broken.prepare(f.owner,'private');await assert.rejects(broken.confirm(f.owner,'private',confirm(bad)),/Injected transaction failure/);assert.deepEqual((await reopened.read(f.owner,'private')).state,current.backup.state);
 const privateDone=await reset.confirm(f.owner,'private',confirm(current));assert(privateDone.revision>current.revision);assert.deepEqual((await reopened.read(f.owner,'private')).state.sales,[]);assert.deepEqual((await reopened.read(f.owner,'private')).state.products,[]);
});
