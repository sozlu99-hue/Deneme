import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('Offline configuration expires while private API requests bypass the shell cache',async()=>{
 let now=200000000,stamp=now-1000,pending;const listeners={};
 const cached=()=>new Response('{}',{headers:{'X-AESD-Config-Verified-At':String(stamp)}});
 const context=vm.createContext({self:{location:{href:'https://example.test/aesd/sw.js'},addEventListener:(name,fn)=>listeners[name]=fn},URL,Headers,Response,Date:class extends Date{static now(){return now;}},fetch:async()=>{throw Error('Offline');},caches:{match:async()=>cached()}});
 vm.runInContext(fs.readFileSync(new URL('../web/sw.js',import.meta.url),'utf8'),context);
 const event=url=>({request:new Request(url),respondWith:value=>pending=value,waitUntil:()=>{}});
 listeners.fetch(event('https://example.test/aesd/config.json'));assert.equal((await pending).status,200);
 stamp=now-86400001;listeners.fetch(event('https://example.test/aesd/config.json'));await assert.rejects(pending,/refresh/);
 pending=null;listeners.fetch(event('https://example.test/aesd/v1/cloud/market'));assert.equal(pending,null);
});
