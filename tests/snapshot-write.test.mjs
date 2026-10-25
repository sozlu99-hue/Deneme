import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {writeSnapshot} from '../snapshot-write.js';

test('PostgreSQL rejects stale snapshot writers and concurrent first writers',{skip:!process.env.TEST_PG_URL},async t=>{
  const url=new URL(process.env.TEST_PG_URL);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
  const schema='snapshot_'+randomBytes(8).toString('hex'),admin=new pg.Pool({connectionString:url.href});
  await admin.query('CREATE SCHEMA '+schema);
  const pool=new pg.Pool({connectionString:url.href,options:'-c search_path='+schema});
  t.after(async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();});
  await pool.query('CREATE TABLE aesd_sqlite_snapshots(id TEXT PRIMARY KEY,sqlite_data BYTEA NOT NULL,sha256 TEXT NOT NULL,byte_size BIGINT NOT NULL,updated_at TIMESTAMPTZ NOT NULL)');
  const write=(checksum,expectedChecksum,id='test')=>writeSnapshot(pool,{id,data:Buffer.from(checksum),checksum,expectedChecksum});
  await write('base',null);
  const competing=await Promise.allSettled([write('first','base'),write('second','base')]);
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(competing.find(r=>r.status==='rejected').reason.code,'SNAPSHOT_CONFLICT');
  const {rows:[saved]}=await pool.query('SELECT * FROM aesd_sqlite_snapshots WHERE id=$1',['test']);
  assert.equal(saved.sqlite_data.toString(),saved.sha256);
  await assert.rejects(write('stale','base'),e=>e.code==='SNAPSHOT_CONFLICT');
  await write('next',saved.sha256);
  const initial=await Promise.allSettled([write('a',null,'new'),write('b',null,'new')]);
  assert.equal(initial.filter(r=>r.status==='fulfilled').length,1);
  await pool.query('DELETE FROM aesd_sqlite_snapshots WHERE id=$1',['test']);
  await assert.rejects(write('resurrected','next'),e=>e.code==='SNAPSHOT_CONFLICT');
  assert.equal((await pool.query('SELECT * FROM aesd_sqlite_snapshots WHERE id=$1',['test'])).rowCount,0);
});
