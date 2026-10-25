import {openStore as localStore} from './store.js';
export async function openStore(businessId,module){
 const local=await localStore(businessId,module),session=JSON.parse(localStorage.getItem('aesd.session.v2')||sessionStorage.getItem('aesd.session.v2')||'null'),headers={'Content-Type':'application/json',Authorization:'Bearer '+session?.token};
 const call=async(body)=>{const r=await fetch('/aesd/v1/cloud/'+module,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),{status:r.status});if(data.state)await local.replace(data.state);return data;};
 let initial;try{initial=await call();}catch(e){if(e.status===403)return local;throw e;}if(!initial.initialized)await call({operationId:crypto.randomUUID(),kind:'import',data:await local.read()});
 return{read:async()=>(await call()).state,command:async data=>(await call({operationId:crypto.randomUUID(),kind:'command',data})).state,close:()=>local.close()};
}
