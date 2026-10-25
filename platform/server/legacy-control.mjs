import {PlatformError} from './platform-core.mjs';
import {controlScope} from '../../control-scope.js';

const paths=new Set(['/login','/password-reset/confirm','/password-reset/v2/confirm','/password-reset/google/confirm','/account/password/confirm','/account/password-code/confirm']);
export const needsLegacyControl=req=>(req.method==='POST'&&(paths.has(req.path)||/^\/admin\/(?:users|reset-device|suspend|resume|extend|phone-licenses|licenses)(?:\/|$)/.test(req.path)))||(['GET','POST','DELETE'].includes(req.method)&&(['/oauth/google/start','/oauth/google/callback','/oauth/google/refresh','/oauth/google','/password-reset/google/start'].includes(req.path)));

// The host can replace route handlers. The middleware still protects each write.
export function legacyControlMiddleware(getPlatform,{timeoutMs=30000}={}){
 return async(req,res,next)=>{
  const platform=getPlatform();if(!platform||!needsLegacyControl(req))return next();
  const originalJson=res.json,originalSend=res.send,originalEnd=res.end;let response;
  const restore=()=>{res.json=originalJson;res.send=originalSend;res.end=originalEnd;};
  try{
   await platform.controlWrite(()=>new Promise((resolve,reject)=>{
    const scope={active:true};let settled=false,timer;
    const clean=()=>{clearTimeout(timer);res.off?.('close',closed);};
    const stop=()=>{if(settled)return;settled=true;scope.active=false;clean();platform.haltWrites?.();reject(new PlatformError(503,'İşlem tamamlanmadı. Sunucu yeniden başlatılmalı.'));};
    const closed=()=>stop();
    const capture=method=>(...args)=>{if(!settled){settled=true;scope.active=false;clean();response={method,args};resolve();}return res;};
    res.json=capture('json');res.send=capture('send');res.end=capture('end');
    res.once?.('close',closed);timer=setTimeout(stop,timeoutMs);
    try{controlScope.run(scope,next);}catch(error){settled=true;scope.active=false;clean();reject(error);}
   }));
   restore();if(!res.destroyed)res[response.method](...response.args);
  }catch(error){
   restore();if(!res.destroyed&&!res.headersSent)res.status(error instanceof PlatformError?error.status:500).json({error:error instanceof PlatformError?error.message:'İşlem tamamlanamadı. Tekrar deneyin.'});
  }
 };
}
