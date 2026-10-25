import {cloudMeta,cloudMetaUpdate} from './cloud-store.js';
const empty=()=>({cart:[],pending:null,lastReceipt:null});
const items=cart=>cart.map(p=>({productId:p.productId,qty:p.qty,price:p.price}));
export async function openStaffCheckout(grantId,deviceId){
 const key='staff:'+grantId+':'+deviceId+':checkout';
 const read=async()=>await cloudMeta(key)||empty();
 return{read,change:fn=>cloudMetaUpdate(key,old=>{const p=old||empty();if(p.pending)throw Error('Önce bekleyen satışın sonucunu doğrulayın.');p.cart=fn(p.cart);return p;}),
 prepare:body=>cloudMetaUpdate(key,old=>{const p=old||empty();if(p.pending)throw Error('Başka sekmede bekleyen satış var. Önce sonucunu kontrol edin.');if(!p.cart.length||!Array.isArray(body.items)||JSON.stringify(items(p.cart))!==JSON.stringify(items(body.items)))throw Error('Sepet başka sekmede değişti. Güncel sepeti kontrol edin.');p.pending=body;return p;}),
 accept:async(body,result)=>{const r=result?.receipt,total=body.payments.reduce((n,p)=>n+Math.round(p.amount*100),0);if(result?.ok!==true||!r||r.id!=='staff_'+grantId+'_'+body.operationId||Math.round(r.total*100)!==total)throw Error('Satış yanıtı doğrulanamadı. Aynı işlem kontrol edilecek.');return cloudMetaUpdate(key,old=>{const p=old||empty();if(p.pending?.operationId===body.operationId){p.lastReceipt=r;p.pending=null;p.cart=[];}return p;});},
 reject:body=>cloudMetaUpdate(key,old=>{const p=old||empty();if(p.pending?.operationId===body.operationId)p.pending=null;return p;})};
}
