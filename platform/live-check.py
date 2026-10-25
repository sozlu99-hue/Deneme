from pathlib import Path
import urllib.request,urllib.error,json,datetime
root=Path(__file__).parent;origin='https://aesd-server.onrender.com';results={}
for route in ['/health','/aesd/v1/health','/oses-recovery/health','/password-reset/providers','/aesd/v1/me','/aesd/v1/cloud/market','/aesd/v1/cloud/private','/aesd/v1/owner/private-pos','/aesd/']:
 try:r=urllib.request.urlopen(origin+route,timeout=40)
 except urllib.error.HTTPError as e:r=e
 data=r.read(18000).decode('utf-8','replace');ctype=r.headers.get('content-type','')
 value=json.loads(data) if 'application/json' in ctype else {'html':data.startswith('<!doctype html>') or data.startswith('<!DOCTYPE html>')}
 results[route]={'status':r.status,'contentType':ctype,'body':value};print(route,r.status)
health=results['/aesd/v1/health'];assert health['status']==200 and health['body']['ok'] is True
assert health['body']['version']==3 and health['body']['cloudStorage']=='postgres'
assert results['/aesd/v1/cloud/market']['status']==401 and results['/aesd/v1/cloud/private']['status']==401
assert results['/health']['body']['persistence']['healthy'] is True
assert results['/aesd/v1/me']['status']==401 and results['/aesd/v1/owner/private-pos']['status']==401
assert results['/oses-recovery/health']['body']['ok'] is True
results['createdAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();results['platformReady']=True;results['commit']=json.loads((root/'evidence/remote-change-status.json').read_text())['commit'];results['realGmailDeliveryVerified']=bool(json.loads((root/'evidence/live-mail-request.json').read_text()).get('inboxDeliveryVerified'))
(root/'evidence/live-backend.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
cfg=json.loads((root/'web/config.json').read_text());assert cfg['publicKey']==health['body']['publicKey'];print('Production health and the unchanged pinned public key verified. No mail was sent.')
