// Browser installation uses the existing origin and account storage.
export function setupWebInstall({window=globalThis.window,document=window.document}={}){
 const standalone=()=>Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone);
 if(standalone()||window.Capacitor?.isNativePlatform?.()||document.getElementById('web-install-tools'))return;
 let pending=null;
 const bar=document.createElement('aside');bar.id='web-install-tools';bar.className='web-install-tools';bar.setAttribute('aria-label','Web uygulaması');
 // Keep the dock below the login brand. Do not place it above the first viewport.
 bar.innerHTML='<strong>AESD · Web</strong><button type="button" id="web-install-button" class="primary">Ana ekrana ekle</button>';
 const button=bar.querySelector('button'),help=document.createElement('dialog');help.className='web-install-help';help.setAttribute('aria-labelledby','web-install-title');
 help.innerHTML='<div class="dialog-top"><h2 id="web-install-title">AESD’yi Ekle</h2><button type="button" aria-label="Kurulum yardımını kapat">×</button></div><ol><li>iPhone veya iPad: Safari’de Paylaş menüsünü aç. “Ana Ekrana Ekle” seçeneğini seç.</li><li>Android: Chrome menüsünü aç. “Uygulamayı yükle” veya “Ana ekrana ekle” seçeneğini seç.</li><li>Bilgisayar: Chrome veya Edge’in adres çubuğundaki yükleme simgesini kullan.</li></ol><p>Mevcut hesabınla giriş yap. Personel kendi giriş bağlantısını kullanır.</p><p class="note">Giriş ve ortak satış kaydı için internet gerekir. Özel panelin mevcut çevrimdışı satış kuralları geçerlidir.</p>';
 document.body.append(bar);document.body.append(help);
 help.querySelector('button').addEventListener('click',()=>help.close());
 button.addEventListener('click',async()=>{
  if(!pending){if(!help.open)help.showModal();return;}
  const request=pending;pending=null;button.disabled=true;
  try{await request.prompt();const choice=await request.userChoice;if(choice?.outcome==='accepted')bar.hidden=true;}
  catch{if(!help.open)help.showModal();}
  finally{button.disabled=false;}
 });
 const offer=event=>{event.preventDefault();pending=event;if(!standalone())bar.hidden=false;};
 const installed=()=>{pending=null;bar.hidden=true;if(help.open)help.close();};
 window.addEventListener('beforeinstallprompt',offer);
 window.addEventListener('appinstalled',installed);
 window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change',event=>{bar.hidden=event.matches;});
 return {bar,help};
}
