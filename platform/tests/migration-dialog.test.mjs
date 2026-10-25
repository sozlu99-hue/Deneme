import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const source=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const line=prefix=>source.split('\n').find(value=>value.startsWith(prefix));
function fixture(){
 const dom=new JSDOM('<dialog id="dialog"></dialog>',{runScripts:'outside-only'}),w=dom.window;
 const dialog=w.document.querySelector('dialog'),pending=[];
 dialog.showModal=()=>{dialog.open=true;};
 dialog.close=()=>{if(dialog.open){dialog.open=false;pending.push(()=>dialog.dispatchEvent(new w.Event('close')));}};
 w.eval(`
 const dialog=document.querySelector('#dialog');let migrationChoice=null,scanStream=null;
 ${line('const escape=')}
 ${line('const button=')}
 ${line('function stopCamera(')}
 ${line('function modal(')}
 ${line("dialog.addEventListener('close',")}
 ${source.slice(source.indexOf('async function chooseMigration('),source.indexOf('window.aesdExportPrivatePending='))}
 function downloadJson(){}
 window.start=()=>chooseMigration({module:'market',local:{products:[],sales:[],customers:[]},remote:{},conflict:false});
 window.camera=stop=>{scanStream={getTracks:()=>[{stop}]};};
 `);
 return{w,dialog,flush:()=>{while(pending.length)pending.shift()();},click:action=>dialog.querySelector('[data-action="'+action+'"]').click(),close:()=>w.close()};
}

test('A queued close from the previous dialog does not cancel a new migration',async()=>{
 const f=fixture();try{
  f.dialog.showModal();f.dialog.close();
  let result;const choice=f.w.start();choice.then(value=>result=value);
  f.flush();await Promise.resolve();
  assert.equal(result,undefined);assert.equal(f.dialog.open,true);
  f.click('cloud-import');assert.equal(await choice,'import');f.flush();
 }finally{f.close();}
});

test('Closing the current migration dialog still cancels it',async()=>{
 const f=fixture();try{
  const choice=f.w.start();f.dialog.close();f.flush();
  assert.equal(await choice,'cancel');assert.equal(f.dialog.open,false);
 }finally{f.close();}
});

test('A queued close does not stop a camera opened by the new dialog',()=>{
 const f=fixture();try{
  f.dialog.showModal();f.dialog.close();f.w.start();let stopped=0;f.w.camera(()=>stopped++);
  f.flush();assert.equal(stopped,0);
  f.dialog.close();f.flush();assert.equal(stopped,1);
 }finally{f.close();}
});
