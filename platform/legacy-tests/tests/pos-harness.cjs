const {afterEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const live=[];afterEach(()=>{for(const dom of live.splice(0))dom.window.close();});
const {webcrypto,pbkdf2Sync}=require('node:crypto');
const {JSDOM,VirtualConsole}=require('jsdom');const {IDBFactory,IDBKeyRange}=require('fake-indexeddb');const {SourceTextModule}=require('node:vm');
const salt=Buffer.alloc(16,17).toString('base64');
const wait=async(fn)=>{const end=Date.now()+4000;while(!fn()){if(Date.now()>end)throw Error('State did not update');await new Promise(r=>setTimeout(r,10));}};
const base=()=>({version:3,rememberAuth:true,auth:{name:'Yönetici',role:'Yönetici'},security:{loginId:'owner-test',salt,passwordHash:pbkdf2Sync('test-password',Buffer.from(salt,'base64'),120000,32,'sha256').toString('base64'),mustChangePassword:false},stock:[{id:'s1',name:'Çiğköfte Hamuru',unit:'gr',gram:5000,critical:100},{id:'s4',name:'Nar Ekşisi',unit:'ml',gram:1000,critical:200}]});
async function launch(db=new IDBFactory(),initial=base(),options={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://localhost',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 live.push(dom);Object.defineProperty(w,'parent',{value:{aesdOwnerAllowed:()=>true,location:{origin:'https://localhost'},postMessage(){}},configurable:true});Object.defineProperty(w,'crypto',{value:webcrypto});Object.assign(w,{TextEncoder,TextDecoder,structuredClone,indexedDB:db,IDBKeyRange});
 if(options.prepareWindow)options.prepareWindow(w);
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 if(initial)w.localStorage.setItem('oses.data.v3',JSON.stringify(initial));
 const {patchPrivateTemplate}=await import('../../server/private-template.mjs');
 const archive=path.join(__dirname,'../index.html'),template=process.env.OSES_TEST_HTML||(fs.existsSync(archive)?archive:path.join(__dirname,'../../legacy/private-pos.html'));
 const scripts=[...patchPrivateTemplate(fs.readFileSync(template,'utf8')).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
 w.eval(scripts[0]);w.eval(fs.readFileSync(path.join(__dirname,'../../web/private-account-rules.js'),'utf8'));let bridge;const bind=w.OSESRecovery.bind;w.OSESRecovery.bind=value=>{bridge=value;bind(value)};
 w.eval(fs.readFileSync(path.join(__dirname,'../../web/private-menu.js'),'utf8'));
 // Keep the old price fixture in existing finance tests. New menu tests opt in.
 if(!options.menu)w.AESDPrivateMenu.apply=value=>value;
 for(let script of scripts.slice(1)){
  script=script.replace('Kt.useEffect(()=>{window.OSESRecovery.bind','window.__OSESStore=At;window.__OSESRead=oQ;Kt.useEffect(()=>{window.OSESRecovery.bind');
  const m=new SourceTextModule(script,{context:dom.getInternalVMContext(),initializeImportMeta(meta){meta.url='https://localhost/index.html'}});await m.link(()=>{throw Error('External import')});await m.evaluate();
 }
 await wait(()=>bridge?.ready());return{w,dom,db,errors,store:()=>w.__OSESStore,read:()=>w.__OSESRead()};
}
const get=(app,id)=>app.store().stock.find(p=>p.id===id);
async function add(app,id){app.store().addToCart(app.store().products.find(p=>p.id===id));await wait(()=>app.store().cart.some(p=>p.productId===id));}

module.exports={launch,base,wait,add,get};
