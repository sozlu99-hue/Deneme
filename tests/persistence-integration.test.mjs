import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import Database from 'better-sqlite3';
import pg from 'pg';

test('Restored processes cannot overwrite newer auth and license snapshots',{skip:!process.env.TEST_PG_URL},async t=>{
  const url=new URL(process.env.TEST_PG_URL);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
  const name='persistence_'+randomBytes(8).toString('hex'),admin=new pg.Pool({connectionString:url.href});
  const folder=await mkdtemp(join(tmpdir(),'aesd-persistence-'));
  await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
  const original={DATABASE_URL:process.env.DATABASE_URL,DB_PATH:process.env.DB_PATH,PERSISTENCE_REQUIRED:process.env.PERSISTENCE_REQUIRED};
  const modules=[],databases=[];
  t.after(async()=>{
    for(const db of databases)db.close();
    for(const persistence of modules)await persistence.closePersistence();
    for(const [key,value] of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    await admin.query('DROP DATABASE '+name);await admin.end();await rm(folder,{recursive:true,force:true});
  });
  async function open(writer){
    process.env.DATABASE_URL=url.href;process.env.DB_PATH=join(folder,writer+'.sqlite');process.env.PERSISTENCE_REQUIRED='1';
    const persistence=await import('../persistence.js?writer='+writer+'-'+name);modules.push(persistence);
    await persistence.restorePersistentSnapshot();
    const db=new Database(process.env.DB_PATH);databases.push(db);return {persistence,db};
  }
  const a=await open('a');a.db.exec("CREATE TABLE protected_records(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO protected_records VALUES(1,'base')");
  await a.persistence.initializePersistentSnapshot();
  const b=await open('b');assert.equal(b.db.prepare('SELECT value FROM protected_records').get().value,'base');
  a.db.prepare('UPDATE protected_records SET value=?').run('new-license');await a.persistence.persistDatabaseSnapshot();
  b.db.prepare('UPDATE protected_records SET value=?').run('stale-license');
  await assert.rejects(b.persistence.persistDatabaseSnapshot(),e=>e.code==='SNAPSHOT_CONFLICT');
  assert.equal(b.persistence.getPersistenceStatus().healthy,false);
  await assert.rejects(b.persistence.persistDatabaseSnapshot(),e=>e.code==='SNAPSHOT_CONFLICT');
  const c=await open('c');assert.equal(c.db.prepare('SELECT value FROM protected_records').get().value,'new-license');
  assert.equal((await c.persistence.probePersistence()).healthy,true);
});
