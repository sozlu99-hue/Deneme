import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sqlite} from '../server/sqlite-adapter.mjs';
import {installPlatform} from '../server/install-platform.mjs';

const web=new URL('../web/',import.meta.url);
const text=file=>fs.readFileSync(new URL(file,web),'utf8');
const pngSize=file=>{
 const bytes=fs.readFileSync(new URL(file,web));
 assert.equal(bytes.subarray(1,4).toString(),'PNG',file+' is not a PNG file.');
 return`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
};
const manifests=['manifest.webmanifest','staff.webmanifest'].map(file=>({file,data:JSON.parse(text(file))}));

function server(){
 const db=sqlite(),routes=new Map();
 db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,password_hash TEXT,role TEXT,active INTEGER DEFAULT 1)');
 const app={get:(path,fn)=>routes.set(String(path),fn),post:(path,fn)=>routes.set(String(path),fn)};
 installPlatform(app,{db,secret:'web-icons-test-secret-never-for-production',passwords:{hash:async v=>v,compare:async(a,b)=>a===b},persist:async()=>{},ready:()=>true});
 const handler=routes.get('/aesd/,/aesd/:file');
 return{db,get:file=>{const out={headers:{}},res={set:(k,v)=>{out.headers[k]=v;return res;},type:v=>{out.headers['Content-Type']=v;return res;},sendFile:path=>{out.sent=path;},sendStatus:code=>{out.status=code;}};handler({params:{file}},res);return out;}};
}

for(const {file,data} of manifests){
 test(file+' has the icon sizes Chrome needs for installation',()=>{
  assert.equal(data.display,'standalone');
  assert.ok(data.name&&data.short_name);
  const icons=data.icons;
  for(const size of ['192x192','512x512'])assert.ok(icons.some(i=>i.sizes===size&&i.type==='image/png'&&i.purpose==='any'),file+' missing any icon '+size);
  assert.ok(icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'),file+' missing maskable icon');
 });
}

test('Each declared icon is a PNG with the declared pixel size',()=>{
 const seen=new Set();
 for(const {data} of manifests)for(const icon of data.icons){
  if(seen.has(icon.src))continue;seen.add(icon.src);
  assert.equal(pngSize(icon.src.replace(/^\.\//,'')),icon.sizes,icon.src);
 }
});

test('The server sends the icons and both manifests with the correct type',()=>{
 const s=server();try{
  for(const file of ['manifest.webmanifest','staff.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png']){
   const answer=s.get(file);
   assert.ok(answer.sent&&fs.existsSync(answer.sent),file+' is not sent.');
   assert.equal(answer.headers['Cache-Control'],'no-cache');
   assert.equal(answer.headers['X-Content-Type-Options'],'nosniff');
  }
  assert.equal(s.get('manifest.webmanifest').headers['Content-Type'],'application/manifest+json');
  assert.equal(s.get('staff.webmanifest').headers['Content-Type'],'application/manifest+json');
 }finally{s.db.close();}
});

test('The service worker caches the three install icons',()=>{
 const worker=text('sw.js');
 for(const file of ['./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-512.png'])assert.ok(worker.includes("'"+file+"'"),file);
});
