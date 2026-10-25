import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {setupWebInstall} from '../web/web-install.js';

function fixture({standalone=false,native=false}={}){
 const dom=new JSDOM('<body><main>Existing account</main></body>',{url:'https://example.test/aesd/'}),w=dom.window;
 w.matchMedia=()=>({matches:standalone,addEventListener:()=>{}});
 if(native)w.Capacitor={isNativePlatform:()=>true};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const ui=setupWebInstall({window:w});return {dom,w,ui,close:()=>w.close()};
}
test('Web installation provides manual instructions and preserves account storage',()=>{
 const f=fixture();try{
  f.w.localStorage.setItem('existing-account','preserve');
  f.ui.bar.querySelector('button').click();assert.equal(f.ui.help.open,true);
  assert.match(f.ui.help.textContent,/Safari/);assert.match(f.ui.help.textContent,/internet gerekir/);
  f.ui.help.querySelector('button').click();assert.equal(f.ui.help.open,false);
  assert.equal(f.w.localStorage.getItem('existing-account'),'preserve');
  setupWebInstall({window:f.w});assert.equal(f.w.document.querySelectorAll('#web-install-tools').length,1);
 }finally{f.close();}
});
test('An offered install prompt is used once and a dismissed offer can show help',async()=>{
 const f=fixture();try{
  const event=new f.w.Event('beforeinstallprompt',{cancelable:true});let calls=0;
  event.prompt=async()=>calls++;event.userChoice=Promise.resolve({outcome:'dismissed'});
  f.w.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
  const button=f.ui.bar.querySelector('button');button.click();await new Promise(r=>setTimeout(r,0));
  assert.equal(calls,1);assert.equal(button.disabled,false);assert.equal(f.ui.bar.hidden,false);
  button.click();assert.equal(f.ui.help.open,true);assert.equal(calls,1);
 }finally{f.close();}
});
test('Installation completion hides the tools and closes help',()=>{
 const f=fixture();try{f.ui.bar.querySelector('button').click();f.w.dispatchEvent(new f.w.Event('appinstalled'));assert.equal(f.ui.bar.hidden,true);assert.equal(f.ui.help.open,false);}finally{f.close();}
});
for(const kind of ['standalone','native'])test('Do not offer browser installation inside '+kind,()=>{
 const f=fixture({[kind]:true});try{assert.equal(f.ui,undefined);assert.equal(f.w.document.querySelector('#web-install-tools'),null);}finally{f.close();}
});
test('The worker caches public shell files and bypasses APIs and authenticated requests',async()=>{
 const handlers={},responses=[],writes=[],store=new Map();
 const cache={addAll:async files=>files.forEach(file=>store.set(new URL(file,'https://example.test/aesd/').href,new Response('cached'))),put:async(req,response)=>{const key=typeof req==='string'?req:req.url;writes.push(key);store.set(key,response);}};
 let offline=false;
 const context={URL,Error,Headers,Response,Date,self:{location:{href:'https://example.test/aesd/sw.js'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true,match:async req=>store.get(req.url)},fetch:async()=>{if(offline)throw Error('offline');return new Response('public shell');}};
 vm.runInNewContext(fs.readFileSync(new URL('../web/sw.js',import.meta.url),'utf8'),context);
 let installed;handlers.install({waitUntil:p=>installed=p});await installed;
 assert.ok(store.has('https://example.test/aesd/manifest.webmanifest'));
 assert.ok(store.has('https://example.test/aesd/icon-192.png'));
 assert.ok(store.has('https://example.test/aesd/icon-maskable-512.png'));
 assert.ok(store.has('https://example.test/aesd/brand-shell.css'));
 for(const [path,headers] of [['v1/me',{}],['v1/owner/private-pos',{}],['config.json',{Authorization:'Bearer private-token'}],['v1/cloud/private',{}]]){
  let intercepted=false;handlers.fetch({request:new Request('https://example.test/aesd/'+path,{headers}),respondWith:()=>intercepted=true,waitUntil:()=>{}});assert.equal(intercepted,false,path);
 }
 const req=new Request('https://example.test/aesd/index.html');
 handlers.fetch({request:req,respondWith:p=>responses.push(p),waitUntil:()=>{}});assert.equal(await (await responses.pop()).text(),'public shell');
 offline=true;handlers.fetch({request:req,respondWith:p=>responses.push(p),waitUntil:()=>{}});assert.ok(await responses.pop());
 assert.deepEqual(writes,['https://example.test/aesd/config.json','https://example.test/aesd/index.html']);
});
