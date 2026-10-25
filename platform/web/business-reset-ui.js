// Only explicit UI actions can request reset. Never run it on startup or migration.
export function createBusinessResetUI({modal,api,escape,scope,pending,afterReset}){
 let generation=0,opening=false,activeForm=null;
 const markerKey='aesd.reset-return.v1',lifetime=10*60*1000;
 const read=()=>{try{return JSON.parse(window.sessionStorage.getItem(markerKey)||'null');}catch{return null;}};
 const clear=()=>{try{window.sessionStorage.removeItem(markerKey);}catch{}};
 const write=value=>{try{window.sessionStorage.setItem(markerKey,JSON.stringify(value));}catch{throw Error('Geri dönüş adımı saklanamadı. Tarayıcı depolamasını kontrol et.');}};
 const fingerprint=async identity=>Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity.token)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 document.addEventListener('click',event=>{if(activeForm?.isConnected&&event.target.closest?.('[data-action="close"]'))clear();},true);
 document.querySelector('#dialog')?.addEventListener('cancel',()=>{if(activeForm?.isConnected)clear();});
 window.addEventListener('pagehide',()=>{if(activeForm?.isConnected){activeForm.elements.password.value='';activeForm.dispatchEvent(new window.Event('input',{bubbles:true}));}});
 async function download(backup){
  const text=JSON.stringify(backup,null,2),name='AESD-'+backup.module+'-sifirlama-oncesi-'+backup.revision+'.json';
  const cap=window.Capacitor;
  if(cap?.isNativePlatform?.()&&cap.nativePromise){
   const file=await cap.nativePromise('Filesystem','writeFile',{path:name,directory:'CACHE',data:text,encoding:'utf8'});
   await cap.nativePromise('Share','share',{title:'Sıfırlama öncesi yedek',files:[file.uri],dialogTitle:'Yedeği güvenli bir yere kaydet'});
  }else{
   const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
 }
 async function open(resume=null){
  if(opening)return false;opening=true;
  try{
  const identity=scope(),mine=++generation;
  const current=()=>{const now=scope();if(mine!==generation||now.token!==identity.token||now.epoch!==identity.epoch||now.module!==identity.module||!now.owner)throw Error('Oturum veya panel değişti. Ekranı yeniden açın.');};
  current();if(await pending())throw Error('Önce bekleyen satışları ve belirsiz işlemleri eşitleyin.');
  const sessionHash=await fingerprint(identity);current();
  const prepared=await api('/business-reset/'+identity.module+'/prepare',{});current();
  const restored=!!resume&&resume.sessionHash===sessionHash&&resume.module===identity.module&&resume.revision===prepared.revision;
  if(!restored)clear();
  modal('Yeni başlangıç',`<section class="reset-review"><p><strong>${escape(identity.name)}</strong> · Yalnız bu panel etkilenir.</p><div class="reset-warning" role="note"><strong>Bu işlem geri alınamaz.</strong><p>Yedek alın. Diğer cihazları çevrimiçi getirip satışları eşitleyin. Eski çevrimdışı işlemler sıfırlamadan sonra uygulanmaz.</p></div><h3>Silinecek veriler</h3><ul><li>Satışlar, iptaller ve adisyonlar</li><li>Ürünler, stok, reçeteler ve alış kayıtları</li><li>Müşteriler, bakiyeler ve kasa hareketleri</li></ul><p class="reset-preserved">Korunur: hesap, şifre, lisans, personel yetkileri, işletme ayarları ve güvenlik/sağlayıcı makbuzları. Diğer paneller etkilenmez.</p><button type="button" class="primary full" id="reset-download">Yedeği indir</button><p class="note">İndirmenin başladığını uygulama kontrol eder; dosyanın cihazına kaydedildiğini sen kontrol et.</p><form id="business-reset-form"><label class="check"><input type="checkbox" name="backup" required disabled>Güncel yedeği indirip güvenli yere kaydettim</label><label for="reset-password">Güncel AESD yönetici şifresi</label><input id="reset-password" name="password" type="password" minlength="8" maxlength="128" autocomplete="current-password" required><label for="reset-word">Onaylamak için SIFIRLA yaz</label><input id="reset-word" name="confirmation" autocomplete="off" spellcheck="false" pattern="SIFIRLA" required><button type="submit" class="danger full" disabled>Verileri sıfırla</button><p class="error" role="alert" id="reset-error"></p></form><button type="button" class="full" data-action="close">Vazgeç</button></section>`);
  const form=document.querySelector('#business-reset-form'),error=form.querySelector('#reset-error'),save=document.querySelector('#reset-download'),submit=form.querySelector('[type=submit]');let downloaded=restored,working=false,uncertain=false;activeForm=form;
  if(restored){form.elements.backup.disabled=false;save.textContent='Yedeği tekrar indir';error.textContent='Yedek ekranından döndün. Dosyanın kaydedildiğini kontrol edip onayla; şifreni yeniden gir.';}
  else if(resume)error.textContent='Yedekten sonra kayıtlar değişmiş. Güncel yedeği yeniden indir.';
  const remember=phase=>{if(mine!==generation)return;write({version:1,module:identity.module,sessionHash,revision:prepared.revision,expires:Math.min(prepared.expires,Date.now()+lifetime),phase});};
  const update=()=>{submit.disabled=working||uncertain||!downloaded||!form.elements.backup.checked||form.elements.confirmation.value!=='SIFIRLA'||form.elements.password.value.length<8;};
  form.addEventListener('input',update);form.addEventListener('change',update);
  save.addEventListener('click',async()=>{if(working)return;working=true;save.disabled=true;try{current();form.elements.password.value='';remember('download');await download(prepared.backup);current();remember('download');downloaded=true;form.elements.backup.disabled=false;save.textContent='Yedeği tekrar indir';}catch(e){if(mine===generation)clear();downloaded=false;form.elements.backup.checked=false;form.elements.backup.disabled=true;error.textContent=e.message;}finally{working=false;save.disabled=false;update();}});
  form.addEventListener('submit',async event=>{event.preventDefault();event.stopPropagation();if(submit.disabled||working)return;working=true;update();try{
   current();if(await pending())throw Error('Bekleyen işlem var. Önce eşitleyin ve güncel yedeği alın.');
   const password=form.elements.password.value;form.elements.password.value='';
   remember('submitting');
   await api('/business-reset/'+identity.module+'/confirm',{token:prepared.token,confirmation:form.elements.confirmation.value,backupAcknowledged:downloaded&&form.elements.backup.checked,password});current();clear();await afterReset();
  }catch(e){error.textContent=e.message;if(!e.status||e.status>=500||e.uncertain){uncertain=true;try{remember('uncertain');}catch{}error.textContent+=' Sonuç belirsiz; yeniden sıfırlamayın. Ekranı kapatıp güncel kayıtları kontrol edin.';}else if(downloaded)remember('download');}finally{working=false;update();}});
  update();return true;
  }finally{opening=false;}
 }
 async function resume(){
  const saved=read();if(!saved)return false;
  const identity=scope();if(!identity.owner||!identity.token)return false;
  if(saved.version!==1||!Number.isSafeInteger(saved.revision)||!Number.isFinite(saved.expires)||saved.expires<=Date.now()||saved.expires>Date.now()+lifetime||saved.module!==identity.module||saved.sessionHash!==await fingerprint(identity)){clear();return false;}
  const dialog=document.querySelector('#dialog');if(dialog?.open&&!document.querySelector('#business-reset-form'))return false;
  if(document.querySelector('#business-reset-form')&&dialog?.open)return false;
  if(['submitting','uncertain'].includes(saved.phase)){
   clear();modal('Sıfırlama sonucunu kontrol et','<p>Önceki sıfırlama isteğinin sonucu bu cihazda doğrulanamadı. Yeniden sıfırlamayın. Ekranı kapatıp güncel satış ve stok kayıtlarını kontrol edin.</p><button type="button" data-action="close">Kapat ve kayıtları kontrol et</button>');return true;
  }
  if(saved.phase!=='download'){clear();return false;}
  return open(saved);
 }
 return{open:()=>open(),resume};
}
