import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../shared-database.js';
import {legacyControlMiddleware} from '../platform/server/legacy-control.mjs';

test('A timed out handler cannot make a late write after the queue fails closed',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aesd-write-scope-')),file=path.join(dir,'test.sqlite'),db=openDatabase(file);
 t.after(async()=>{db.close();await fs.rm(dir,{recursive:true,force:true});});
 assert.equal(openDatabase(file),db);assert.equal(db.pragma('busy_timeout',{simple:true}),5000);db.exec('CREATE TABLE checks(id INTEGER)');
 let halted=false,late,release,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const platform={controlWrite:fn=>fn(),haltWrites:()=>halted=true};let status,body;
 const res={status(n){status=n;return this;},json(value){body=value;return this;},send(){},end(){}};
 const pending=legacyControlMiddleware(()=>platform,{timeoutMs:20})({method:'POST',path:'/login'},res,()=>{late=(async()=>{entered();await gate;assert.throws(()=>db.prepare('INSERT INTO checks VALUES(1)').run(),/ended/);})();});
 await started;await pending;assert.equal(halted,true);assert.equal(status,503);assert.ok(body.error);release();await late;assert.equal(db.prepare('SELECT COUNT(*) AS n FROM checks').get().n,0);
});
