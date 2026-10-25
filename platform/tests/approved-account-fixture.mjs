// License and transaction tests start after account verification. The real
// challenge delivery/expiry/attempt flow is exercised in account-access.test.mjs.
export async function approveFixtureAccount(db,platform,owner,principal,module='market') {
  db.prepare('UPDATE aesd_account_security SET email_verified_at=1 WHERE user_id=?').run(principal.user.id);
  const status=platform.accounts.status(principal);
  if(status.devices.find(x=>x.module===module)?.state==='approved')return;
  const request=await platform.accounts.requestDevice(principal,{module,label:'İzole test cihazı'});
  await platform.accounts.changeDevice(owner,request.id,{action:'approve',verificationCode:request.verificationCode});
}
