import assert from 'node:assert/strict';
export async function acceptBrowserAccount({origin,token,ownerToken,module='market'}){
 const api=async(path,body,bearer=token)=>{
  const response=await fetch(origin+'/aesd/v1'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer},body:body===undefined?undefined:JSON.stringify(body)});
  const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;
 };
 const me=await api('/me');
 if(me.accountAccess.verificationRequired){
  await api('/email-verification/request',{});
  const response=await fetch(origin+'/test/mail');assert.ok(response.ok,'This fixture only uses the isolated development mail outbox.');
  const messages=await response.json(),message=messages.findLast(x=>x.to===me.user.email&&x.subject==='AESD e-posta doğrulama kodu');
  assert.ok(message);await api('/email-verification/confirm',{code:message.text.match(/kodun: (\d{6})/)[1]});
 }
 const current=(await api('/me')).accountAccess.devices.find(x=>x.module===module);
 if(current?.state!=='approved'){
  const request=await api('/devices/request',{module,label:'İzole tarayıcı test cihazı'});
  await api('/owner/customer-devices/'+request.id,{action:'approve',verificationCode:request.verificationCode},ownerToken);
 }
}
export async function acceptBrowserPage(page,ownerToken,module='market'){
 const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('aesd.session.v2')||sessionStorage.getItem('aesd.session.v2')||'null'));
 assert.ok(session?.token);
 await acceptBrowserAccount({origin:new URL(page.url()).origin,token:session.token,ownerToken,module});
}
export async function clickBusinessControl(page,action){
 let control=page.locator('[data-action="'+action+'"]').first();
 if((await control.count()===0||!await control.isVisible())&&await page.locator('.owner-console').count()){
  await page.locator('.oc-status').filter({hasText:/Yönetim kayıtları güncel|Yönetim kayıtlarını yenile|Bağlantı yok|İşlem sonucu doğrulanmalı/}).waitFor();
  if(action==='sales')return page.locator('[data-owner-action=sales]').first().click();
  if(action==='owner-admin')return page.locator('[data-owner-action=customers]').first().click();
  if(action==='logout'){await page.locator('.oc-nav [data-owner-action=settings]').click();return page.locator('[data-owner-action=logout]').click();}
  await page.locator('[data-owner-action=sales]').first().click();
  await page.locator('.owner-console').waitFor({state:'detached'});
 }
 control=page.locator('[data-action="'+action+'"]').first();
 if(await control.count()===0||!await control.isVisible()){
  await page.locator('[data-action=menu]').click();control=page.locator('.panel-menu [data-action="'+action+'"]');
 }
 await control.click();
 if(action==='settings'){
  await page.getByRole('heading',{name:/^(Ayarlar|Müşteri Yönetimi)$/}).waitFor();
  if(await page.locator('.owner-console').count())await page.locator('.oc-status').filter({hasText:'Yönetim kayıtları güncel'}).waitFor();
 }
}
