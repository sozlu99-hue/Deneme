const panelNames = {private:'Özel Panelim',market: 'Market', restaurant: 'Restoran', cafe: 'Kafe'};

export function createAccountUI({root, dialog, api, modal, button, field, submit, escape,
  info, sector, refresh, enter, signOut, appearance, release, beforeGate}) {
  let retryAt = 0,retryAccount=null;
  const states = {not_requested: 'Başvuru yapılmadı', pending: 'Onay bekliyor', approved: 'Onaylı', denied: 'Reddedildi', revoked: 'Erişim kaldırıldı',retry_allowed:'Yeni başvuruya izin verildi', existing: 'Mevcut lisans kontrolü'};
  const currentDevice = () => info()?.accountAccess?.devices?.find(x => x.module === sector());
  function needsGate() {
    const access = info()?.accountAccess;
    return info()?.user?.role === 'CLIENT' && Boolean(access?.verificationRequired ||
      access?.deviceApprovalRequired && currentDevice()?.state !== 'approved');
  }
  function gate() {
    beforeGate();
    const access = info().accountAccess;
    root.className = '';
    root.innerHTML = `<main class="auth"><div class="brand"><em>A</em>ESD</div><section class="card"><h1>Hesabını Hazırla</h1>
      <p>${escape(info().user.email)}</p><ol class="account-steps">
      <li><strong>E-posta</strong><span>${access.verificationRequired ? 'Doğrulama gerekli' : access.emailVerified ? 'Doğrulandı' : 'Mevcut hesap'}</span></li>
      <li><strong>İşyeri</strong><span>${info().business?.state === 'approved' ? 'Onaylı' : 'Yönetici onayı bekleniyor'}</span></li>
      <li><strong>${panelNames[sector()]} cihazı</strong><span>${states[currentDevice()?.state] || 'Kontrol gerekli'}</span></li></ol>
      ${access.verificationRequired ? button('E-postamı Doğrula', 'account-verify', '', 'primary full')+button('E-posta Adresini Düzelt','account-correct-email','','quiet full') : ''}
      ${access.deviceApprovalRequired && !access.verificationRequired && ['not_requested', 'pending','retry_allowed'].includes(currentDevice()?.state) ? button(currentDevice()?.state === 'pending' ? 'Cihaz Kodunu Yenile' : 'Cihaz Onayı İste', 'account-device-request', '', 'primary full') : ''}
      ${button('Durumu Yenile', 'retry', '', 'full')}${button('Hesap ve Güvenlik', 'account-settings', '', 'full')}${button('Çıkış Yap', 'logout', '', 'quiet full')}
      <p class="note">E-posta doğrulaması, işyeri onayı, cihaz onayı ve panel lisansı ayrı kontrollerdir. Deneme süresi yetkili panel ilk açıldığında başlar.</p></section></main>`;
  }

  function verification(message = '') {
    if(retryAccount!==info().user.id){retryAt=0;retryAccount=info().user.id;}
    modal('E-postanı Doğrula', `<p>${escape(info().user.email)}</p><p>Kod 10 dakika geçerlidir. Şifreni değiştirmez.</p>
      ${button('Doğrulama Kodu Gönder', 'account-send-code', Date.now() < retryAt ? 'disabled' : '', 'full')}
      <p class="note">Yeni kod için en az 60 saniye bekle.</p><form data-form="account-verify">
      ${field('6 haneli kod', 'code', 'text', '', 'required pattern="[0-9]{6}" maxlength="6" inputmode="numeric" autocomplete="one-time-code"')}
      ${submit('E-postamı Doğrula')}</form>${message ? `<p role="status">${escape(message)}</p>` : ''}`);
    if(Date.now()<retryAt)setTimeout(()=>{if(dialog.querySelector('[data-form=account-verify]'))dialog.querySelector('[data-action=account-send-code]')?.removeAttribute('disabled');},retryAt-Date.now()+100);
  }

  async function settings() {
    const identity = info().user;
    const result = await api('/account/sessions');
    modal('Hesap ve Güvenlik', `<p><strong>${escape(identity.email)}</strong></p>
      <h3>Görünüm</h3><form data-form="account-appearance"><label for="appearance">Ekran görünümü</label>
      <select name="appearance" id="appearance">${[['system', 'Sisteme Göre'], ['light', 'Açık'], ['dark', 'Koyu']].map(([value, label]) => `<option value="${value}" ${appearance.preference() === value ? 'selected' : ''}>${label}</option>`).join('')}</select>${submit('Görünümü Kaydet')}</form>
      <h3>Hesap güvenliği</h3>${!info().accountAccess?.emailVerified ? button('E-postamı Doğrula', 'account-verify', '', 'full') : '<p class="good">E-posta doğrulandı.</p>'}
      <form data-form="account-password">${field('Mevcut AESD şifren', 'currentPassword', 'password', '', 'required autocomplete="current-password"')}
      ${field('Yeni AESD şifren', 'newPassword', 'password', '', 'required minlength="8" autocomplete="new-password"')}
      ${field('Yeni şifre tekrar', 'confirm', 'password', '', 'required minlength="8" autocomplete="new-password"')}${submit('Şifreyi Değiştir')}</form>
      <h3>Açık oturumlar</h3>${result.sessions.map(s => `<div class="line"><strong>${s.current ? 'Bu oturum' : 'Diğer oturum'}</strong><p>Cihaz: ${escape(s.deviceLabel)} · Bitiş: ${new Date(s.expires).toLocaleString('tr-TR')}</p>${button('Oturumu Kapat', 'account-revoke-session', `data-id="${escape(s.id)}"`, 'quiet')}</div>`).join('')}
      <h3>Yardım ve Sürüm</h3><p>${escape(release())}</p><a href="mailto:aesdapps.tr@gmail.com">Destek: aesdapps.tr@gmail.com</a>
      <p class="note">Gmail adresin ve AESD şifrenle giriş yaparsın. Gmail şifren istenmez. Cihaz onayı tek başına iki adımlı kimlik doğrulama değildir.</p>`);
  }

  async function section(kind) {
    const value=info(),identity=value?.user;
    if(!identity)throw Error('Önce hesabına giriş yap.');
    const sections={profile:'Hesap bilgileri',security:'Şifre ve giriş',sessions:'Oturumlar ve cihazlar',display:'Görünüm',help:'Yardım ve uygulama bilgisi'};
    if(!sections[kind])throw Error('Ayar bölümü bulunamadı.');
    const navigation=`<nav class="account-section-nav" aria-label="Hesap ayarları">${Object.entries(sections).map(([key,title])=>button(title,'account-'+key,'',kind===key?'selected':'')).join('')}</nav>`;
    let content='';
    const item=(label,text)=>`<div class="account-key"><span>${escape(label)}</span><strong>${escape(text)}</strong></div>`;
    if(kind==='profile')content=`<section class="account-details">${item('E-posta',identity.email)}${item('Hesap rolü',identity.role==='OWNER'?'Sistem sahibi':'İşyeri hesabı')}${item('İşyeri',value.business?.name||'Sistem sahibi')}${item('Seçili panel',panelNames[sector()])}${item('E-posta durumu',value.accountAccess?.emailVerified?'Doğrulandı':value.accountAccess?.verificationRequired?'Doğrulama gerekli':'Mevcut hesap')}</section><p class="account-info">İşyeri, lisans ve kullanıcı kimliği korunur. İletişim adresi düzeltme işlemi mevcut AESD şifreni ve yeniden doğrulamayı gerektirir.</p>${identity.role==='CLIENT'?button('E-posta Adresini Düzelt','account-correct-email','','full'):''}`;
    if(kind==='security')content=`<section class="account-details"><h3>Giriş güvenliği</h3>${value.accountAccess?.emailVerified?'<p class="good">E-posta doğrulandı.</p>':button('E-postamı Doğrula','account-verify','','full')}<p class="account-info">AESD şifren kullanılır. Gmail şifren istenmez. Cihaz onayı tek başına iki adımlı doğrulama değildir.</p><form data-form="account-password">${field('Mevcut AESD şifren','currentPassword','password','','required autocomplete="current-password"')}${field('Yeni AESD şifren','newPassword','password','','required minlength="8" autocomplete="new-password"')}${field('Yeni şifre tekrar','confirm','password','','required minlength="8" autocomplete="new-password"')}${submit('Şifreyi Değiştir')}</form></section>`;
    if(kind==='sessions'){
      const result=await api('/account/sessions');
      // The API verifies the session; never place tokens or device keys in the DOM.
      if(info()?.user?.id!==identity.id)throw Error('Oturum değişti.');
      content=`<section class="account-details"><h3>Açık oturumlar</h3>${result.sessions.map(x=>`<article class="line"><strong>${x.current?'Bu oturum':'Diğer oturum'}</strong><p>${escape(x.deviceLabel)} · Bitiş: ${new Date(x.expires).toLocaleString('tr-TR')}</p>${button('Oturumu Kapat','account-revoke-session',`data-id="${escape(x.id)}"`,'quiet')}</article>`).join('')||'<p>Açık oturum kaydı bulunamadı.</p>'}</section>`;
    }
    if(kind==='display')content=`<section class="account-details"><form data-form="account-appearance"><h3>Renk görünümü</h3><label for="appearance">Ekran görünümü</label><select name="appearance" id="appearance">${[['system','Sisteme Göre'],['light','Açık'],['dark','Koyu']].map(([key,text])=>`<option value="${key}" ${appearance.preference()===key?'selected':''}>${text}</option>`).join('')}</select><input type="hidden" name="returnSection" value="display">${submit('Görünümü Kaydet')}</form></section><section class="account-details" style="margin-top:16px"><form data-form="account-reading"><h3>Okunurluk</h3><label for="text-size">Yazı boyutu</label><select name="textSize" id="text-size"><option value="normal" ${appearance.textSize?.()!=='large'?'selected':''}>Normal</option><option value="large" ${appearance.textSize?.()==='large'?'selected':''}>Büyük</option></select>${submit('Yazı Boyutunu Kaydet')}</form><p class="account-info">Yalnız bu hesaba ait görünüm tercihi değişir. Bakiyeler, hareketler ve lisanslar etkilenmez.</p></section>`;
    if(kind==='help')content=`<section class="account-details">${item('Uygulama','AESD')}${item('Sürüm',release())}<h3 style="margin-top:22px">Destek</h3><a href="mailto:aesdapps.tr@gmail.com">aesdapps.tr@gmail.com</a><p class="account-info">Destek talebinde ekranı ve hata metnini paylaş. Parola, kurtarma kodu veya finansal yedek gönderme. Kart, yazıcı, kamera ve barkod cihazı desteği cihaz üzerinde ayrıca kontrol edilir.</p></section>`;
    modal(sections[kind],navigation+content);
  }

  async function customerDevices() {
    const result = await api('/owner/customer-devices');
    modal('Müşteri Cihaz Onayları', `<p>Personel cihazları ayrı listededir. Kod müşterinin cihazında görünür.</p>${result.devices.map(d => `<section class="line">
      <strong>${escape(d.businessName)} · ${panelNames[d.module]}</strong><p>${escape(d.email)} · ${escape(d.label)}</p><p>${states[d.state]} · ${new Date(d.requestedAt).toLocaleString('tr-TR')}</p>
      ${d.state === 'pending' ? `<form data-form="account-approve-device"><input type="hidden" name="id" value="${escape(d.id)}">${field('Cihazda görünen kod', 'verificationCode', 'text', '', 'required pattern="[0-9]{6}" maxlength="6" inputmode="numeric"')}${submit('Cihazı Onayla')}</form>${button('Başvuruyu Reddet', 'account-device-deny', `data-id="${escape(d.id)}"`, 'quiet')}` : d.state === 'approved' ? button('Cihaz Erişimini Kaldır', 'account-device-revoke', `data-id="${escape(d.id)}"`, 'quiet') : ['denied','revoked'].includes(d.state)?button('Yeniden Başvuruya İzin Ver','account-device-reopen',`data-id="${escape(d.id)}"`,'quiet'):''}</section>`).join('') || '<p>Henüz müşteri cihaz başvurusu yok.</p>'}`);
  }

  async function action(name, element) {
    if (!name.startsWith('account-')) return false;
    if (name === 'account-settings') await settings();
    else if(['profile','security','sessions','display','help'].includes(name.slice(8)))await section(name.slice(8));
    else if(name==='account-correct-email')modal('Kayıt Adresini Düzelt',`<form data-form="account-correct-email">${field('Doğru e-posta adresi','email','email',info().user.email,'required maxlength="254" autocomplete="email"')}${field('Mevcut AESD şifren','password','password','','required autocomplete="current-password"')}${submit('Adresi Düzelt')}</form><p class="note">Hesap, işyeri ve lisans tarihleri değişmez. Önceki doğrulama kodları geçersiz olur.</p>`);
    else if (name === 'account-verify') verification();
    else if (name === 'account-send-code') {
      if (Date.now() < retryAt) throw Error('Yeni kod için 60 saniye bekle.');
      const result = await api('/email-verification/request', {});
      retryAt = Date.now() + (result.retryAfter || 60) * 1000;
      verification(result.message || 'E-posta zaten doğrulandı.');
    } else if (name === 'account-device-request') {
      modal('Cihaz Onayı İste', `<form data-form="account-device-request">${field('Cihaz adı', 'label', 'text', '', 'required maxlength="80" placeholder="Örn. Kasa tableti"')}${submit('Başvuruyu Gönder')}</form>`);
    } else if (name === 'account-customer-devices') await customerDevices();
    else if (name === 'account-device-deny' || name === 'account-device-revoke'||name==='account-device-reopen') {
      await api('/owner/customer-devices/' + element.dataset.id, {action: name.endsWith('deny') ? 'deny' : name.endsWith('reopen')?'reopen':'revoke'});
      await customerDevices();
    } else if (name === 'account-revoke-session') {
      const result = await api('/account/sessions/' + element.dataset.id + '/revoke', {});
      if (result.current) { dialog.close(); await signOut(); } else await settings();
    }
    return true;
  }

  async function form(kind, data) {
    if (!kind.startsWith('account-')) return false;
    if (kind === 'account-verify') {
      await api('/email-verification/confirm', {code: data.code});
      dialog.close(); await enter();
    } else if(kind==='account-correct-email'){
      await api('/account/email-correction',{email:data.email,password:data.password});dialog.close();await enter();
    } else if (kind === 'account-device-request') {
      const result = await api('/devices/request', {module: sector(), label: data.label});
      await refresh(); gate();
      modal('Cihaz Onayı Bekleniyor', `<p>Bu kodu AESD yöneticisine ilet.</p><p class="code">${escape(result.verificationCode || 'Cihaz zaten onaylı')}</p><p>Kod 24 saat geçerlidir. Yeni kod alırsan önceki kod geçersiz olur.</p>${button('Durumu Yenile', 'retry', '', 'primary full')}`);
    } else if (kind === 'account-approve-device') {
      await api('/owner/customer-devices/' + data.id, {action: 'approve', verificationCode: data.verificationCode});
      await customerDevices();
    } else if (kind === 'account-password') {
      if (data.newPassword !== data.confirm) throw Error('Yeni şifreler eşleşmiyor.');
      await api('/account/password', {currentPassword: data.currentPassword, newPassword: data.newPassword});
      dialog.close(); await signOut();
    } else if (kind === 'account-appearance') { appearance.set(data.appearance); if(data.returnSection==='display')await section('display');else await settings(); }
    else if(kind==='account-reading'){appearance.setTextSize(data.textSize);await section('display');}
    return true;
  }
  return {needsGate, gate, settings, customerDevices, action, form};
}
