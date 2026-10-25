import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {installHealthRoutes} from '../health.js';

test('Health and readiness distinguish a live process from unavailable storage',async t=>{
  let persistence={configured:true,snapshotExists:true,healthy:true};
  const app=express();
  installHealthRoutes(app,{status:()=>persistence,probe:async()=>persistence,phoneOtpConfigured:false,commit:'test-commit'});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const good=await fetch(base+'/ready');assert.equal(good.status,200);assert.equal((await good.json()).commit,'test-commit');
  persistence={...persistence,healthy:false,error:'PERSISTENCE_UNAVAILABLE'};
  for(const path of ['/health','/ready']){const response=await fetch(base+path);assert.equal(response.status,503);assert.equal((await response.json()).ok,false);assert.equal(response.headers.get('cache-control'),'no-store');}
  persistence={configured:false,snapshotExists:false,healthy:true};
  assert.equal((await fetch(base+'/health')).status,200);assert.equal((await fetch(base+'/ready')).status,503);
});

test('A storage probe failure returns a safe readiness response',async t=>{
  const app=express();installHealthRoutes(app,{status:()=>({configured:true,snapshotExists:true,healthy:true}),probe:async()=>{throw Error('Private connection details');},phoneOtpConfigured:false});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/ready');assert.equal(response.status,503);assert.ok(!(await response.text()).includes('Private connection details'));
});
