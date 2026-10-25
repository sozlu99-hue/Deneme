from pathlib import Path, PurePosixPath
from datetime import datetime, timezone, timedelta
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import argparse,hashlib,json,re,struct,subprocess,zipfile,io,os
from PIL import Image
root=Path(__file__).parent
base=Path(os.environ.get('AESD_BASE_APK',root/'input/AESD-v151-base.apk'))
android=Path(os.environ.get('AESD_ANDROID_TOOLS','/workspace/oses-v151/tools/android/android-16'))
keystore=os.environ.get('AESD_KEYSTORE','/workspace/oses-v151/private-release/OSES-v1.4.1-release.jks')
password_file=os.environ.get('AESD_STOREPASS_FILE','/workspace/oses-v151/private-release/OSES-v1.4.1-release-password.txt')
CERTIFICATE_SHA256='ccc5e236fd30d0a395d49121bf1129a905a0ccf9fc952242eb920c8a8e04e2d9'
PUBLIC_KEY='MCowBQYDK2VwAyEAn/UOkf1TjvZvz7pp11a9F7msMblcvDJeKchA3HDLg48='
VERSION_NAME='1.13.1'
VERSION_CODE=231
PANELS=[('all','com.oses.pos','AESD',f'AESD-v{VERSION_NAME}.apk')]
PUBLIC_ASSETS={'business-reset-ui.js','checkout-review.js','workspace-ui.js','workspace.css','workspace-private.css','appearance.js','appearance.css','brand-shell.css','account-ui.js','business-calendar.js','numeric-rules.js','payment-rules.js','lot-rules.js','business-commands.js','business-validation.js','inventory-rules.js','inventory-commands.js','inventory-validation.js','restaurant-commands.js','restaurant-validation.js','finance-rules.js','finance-commands.js','finance-validation.js','business-ui.js','business.css','menu.html','menu.js','private-appearance.css','web-install.js','index.html','app.js','dialog-viewport.js','cloud-store.js','private-cloud.js','private-offline-store.js','private-ledger.js','cost-engine.js','data-integrity.js','finance-guard.js','sw.js','ui.js','styles.css','pos.js','store.js','lease.js','backup-validation.js','config.json','icon.svg','icon-192.png','icon-512.png','icon-maskable-512.png','manifest.webmanifest'}
OWNER_ASSETS={'private-account-rules.js','private-account-stock.css','owner-console.js','owner-console.css','private-menu.js','private-theme.css','private-products-20261008.png','staff.html','staff-app.js','staff-style.css','staff-checkout.js','staff.webmanifest'}
SECRET_MARKERS=(b'BEGIN PRIVATE KEY',b'BEGIN ENCRYPTED PRIVATE KEY',b'BEGIN RSA PRIVATE KEY',b'__OSESStore',b'browser-owner-test-password')
def require(condition,message):
 if not condition:raise ValueError(message)
def digest(data):return hashlib.sha256(data).hexdigest()
class AssetReferences(HTMLParser):
 def __init__(self):super().__init__();self.references=[]
 def handle_starttag(self,tag,attrs):
  for key,value in attrs:
   if value and (key=='src' or (key=='href' and tag in ('link','a'))):self.references.append(value)
   if key=='style' and value:self.references.extend(re.findall(r'url\([\s\"\x27]*([^\)\"\x27]+)',value))
def references(name,data):
 text=data.decode('utf-8');refs=[]
 if name.endswith('.html'):
  parser=AssetReferences();parser.feed(text);refs.extend(parser.references)
 if name.endswith(('.js','.html')):
  # Only literal local module references are valid in the packaged source.
  refs.extend(re.findall(r'\b(?:import|export)\s+(?:[^;]*?\s+from\s+)?[\"\x27](\.[^\"\x27]+)[\"\x27]',text))
  refs.extend(re.findall(r'\bimport\s*\(\s*[\"\x27](\.[^\"\x27]+)[\"\x27]',text))
  refs.extend(re.findall(r'(?:fetch|serviceWorker\.register)\s*\(\s*[\"\x27](\.[^\"\x27]+)[\"\x27]',text))
 if name.endswith(('.css','.js','.html')):refs.extend(re.findall(r'url\([\s\"\x27]*([^\)\"\x27]+)',text))
 return refs
def local_asset(source,value):
 value=value.strip();url=urlsplit(value)
 if not value or value.startswith(('#','//')) or url.scheme or '${' in value:return None
 # API paths are not files in the APK.
 if value.startswith('/'):return None
 path=PurePosixPath(source).parent/PurePosixPath(unquote(url.path))
 require('..' not in path.parts,'The asset path leaves the public directory: '+source)
 return str(path).removeprefix('./')
def validate_assets(public,audience):
 require(audience in ('all','owner','customer'),'The APK audience is invalid.')
 require(PUBLIC_ASSETS.issubset(public),'The APK is missing a required public file.')
 if audience=='customer':
  require(not set(public).intersection(OWNER_ASSETS|{'private-pos.html'}),'The customer APK includes owner-only assets.')
  require(not any(b'function CQ(' in value for value in public.values()),'The customer APK includes the private owner panel.')
 cfg=json.loads(public['config.json'])
 require(cfg.get('audience')==audience,'The packaged audience does not match the APK.')
 require(cfg.get('publicKey')==PUBLIC_KEY,'The lease public key has changed.')
 require(cfg.get('contactEmail')=='aesdapps.tr@gmail.com','The support address has changed.')
 origin=urlsplit(cfg.get('apiOrigin',''))
 require(origin.scheme=='https' and bool(origin.netloc) and not origin.username and not origin.password and origin.path in ('','/'),'The server origin must use HTTPS.')
 checked=0
 for name,data in public.items():
  require(not name.startswith('/') and '..' not in PurePosixPath(name).parts,'The APK asset name is unsafe.')
  if not name.endswith(('.html','.js','.json','.css','.webmanifest','.svg')):continue
  require(not any(marker in data for marker in SECRET_MARKERS),'The public assets contain a private-data marker: '+name)
  for value in references(name,data) if name.endswith(('.html','.js','.css')) else []:
   target=local_asset(name,value)
   if target is None:continue
   # The shared app fetches this file only in the owner distribution. The
   # staff link is rendered only in the web audience. APKs do not start sw.js.
   if audience in ('all','customer') and name=='app.js' and target in ('private-pos.html','staff.html','owner-console.js'):continue
   require(target in public,'A local asset is missing: '+name+' -> '+target);checked+=1
 require('Personel ve Cihaz Onay'.encode() in public['app.js'],'The owner device controls are missing from the shared app.')
 if audience=='all':
  require(OWNER_ASSETS.issubset(public),'The unified APK is missing protected-role UI assets.')
  require('private-pos.html' not in public,'The unified APK must fetch private HTML after server owner authentication.')
  require(cfg.get('nativeApp') is True,'The unified APK must disable browser service-worker installation.')
 if audience=='owner':
  require(OWNER_ASSETS.issubset(public) and 'private-pos.html' in public,'The owner or staff assets are missing.')
  require(b'function CQ(' in public['private-pos.html'],'The private owner panel is missing.')
 return {'audience':audience,'assetCount':len(public),'localReferencesChecked':checked,'closedLocalDependencies':True,'ownerDeviceControlsEnabled':audience in ('all','owner'),'staffEntryBundled':audience in ('all','owner'),'staffEntryPolicy':'The owner APK has staff entry files and its photo atlas. Staff devices use the public web link. The customer APK has neither staff entry files nor owner panel files.','privateSourceIncluded':audience=='owner','privateOwnerAssetsExcluded':audience=='customer','leasePublicKeyPreserved':True,'serviceWorkerEnabled':False,'assets':{name:digest(data) for name,data in sorted(public.items())}}
def collect_assets(audience,app_label):
 names=PUBLIC_ASSETS|(OWNER_ASSETS if audience in ('all','owner') else set())
 public={name:(root/'web'/name).read_bytes() for name in sorted(names)}
 cfg=json.loads(public['config.json']);cfg['audience']=audience;cfg['nativeApp']=True;cfg['release']=f'AESD {VERSION_NAME} · Ortak uygulama';public['config.json']=json.dumps(cfg,ensure_ascii=False).encode()
 # Keep the approved Server monogram files from web/. Do not invent a new mark.
 for name in ('icon-192.png','icon-512.png','icon-maskable-512.png','manifest.webmanifest'):
  require((root/'web'/name).is_file(),'The install icon or manifest is missing: '+name)
  public[name]=(root/'web'/name).read_bytes()
 if audience=='owner':
  public['private-pos.html']=subprocess.run(['node','--input-type=module','-e',"import {readPrivateTemplate} from './server/private-template.mjs';process.stdout.write(readPrivateTemplate('legacy/private-pos.html'));"],cwd=root,check=True,capture_output=True).stdout
 return public
def source_hashes():
 # These directories contain source files only. Do not read signing files.
 return {str(p.relative_to(root)):digest(p.read_bytes()) for directory in ('web','server','branding') for p in sorted((root/directory).iterdir()) if p.is_file() and p.suffix in ('.mjs','.js','.html','.css','.json','.png','.svg','.webmanifest')}|{'legacy/private-pos.html':digest((root/'legacy/private-pos.html').read_bytes())}
def backend_status(evidence_path,expected_commit,sources,now=None):
 result={'production_backend_deployed':False,'backendCurrent':False,'backendEvidence':'No current deployment evidence was supplied.'}
 if not evidence_path or not expected_commit:return result
 require(bool(re.fullmatch('[0-9a-f]{40}',expected_commit)),'The expected backend commit is invalid.')
 value=json.loads(Path(evidence_path).read_text());current=now or datetime.now(timezone.utc)
 if not isinstance(value,dict) or not isinstance(value.get('checkedAt'),str):result['backendEvidence']='The deployment evidence has no valid check time.';return result
 try:checked=datetime.fromisoformat(value['checkedAt'].replace('Z','+00:00'))
 except ValueError:result['backendEvidence']='The deployment evidence has no valid check time.';return result
 if checked.tzinfo is None or not timedelta(0)<=current-checked<=timedelta(hours=2):result['backendEvidence']='The deployment evidence is stale.';return result
 if value.get('status')!='live' or value.get('commit')!=expected_commit or value.get('sourceHashes')!=sources:
  result['backendEvidence']='The live commit or source hashes do not match this build.';return result
 if value.get('apiOrigin')!=json.loads((root/'web/config.json').read_text()).get('apiOrigin'):
  result['backendEvidence']='The deployment server origin does not match this build.';return result
 return {'production_backend_deployed':True,'backendCurrent':True,'backendCommit':expected_commit,'backendDeploymentId':value.get('deployId'),'backendCheckedAt':value['checkedAt'],'backendEvidence':'The Render deployment is live. The supplied source hashes match this build.','productionHttpTested':value.get('productionHttpTested') is True}
def signature(n):return n.startswith('META-INF/') and (n.upper().endswith(('.RSA','.DSA','.EC','.SF')) or n.upper()=='META-INF/MANIFEST.MF')
def strings(d):
 o=struct.unpack_from('<H',d,2)[0];t,h,size=struct.unpack_from('<HHI',d,o);count,styles,flags,start,end=struct.unpack_from('<5I',d,o+8);assert t==1 and flags==0 and styles==0
 result=[]
 for i in range(count):
  p=o+start+struct.unpack_from('<I',d,o+h+4*i)[0];length=struct.unpack_from('<H',d,p)[0];assert length<0x8000;result.append(d[p+2:p+2+2*length].decode('utf-16le'))
 return o,h,size,result
def panel_manifest(data,is_customer):
 o,h,size,ss=strings(data)
 known_versions={'1.5.1':151,'1.6.4':164,'1.7.0':170,'1.8.0':180}
 version_names=[name for name in known_versions if ss.count(name)==1]
 require(len(version_names)==1,'The base manifest version name is not unique.')
 base_name=version_names[0];base_code=known_versions[base_name]
 require(VERSION_CODE>base_code,'The new version code must exceed the verified base.')
 ss=[VERSION_NAME if s==base_name else s.replace('com.oses.pos','com.aesd.pos') if is_customer and s.startswith('com.oses.pos') and s!='com.oses.pos.MainActivity' else s for s in ss]
 has_camera='android.permission.CAMERA' in ss
 if not has_camera:ss.append('android.permission.CAMERA')
 camera=ss.index('android.permission.CAMERA');offsets=[];body=b''
 for s in ss:offsets.append(len(body));body+=struct.pack('<H',len(s))+s.encode('utf-16le')+b'\0\0'
 start=h+4*len(ss);padding=(-(start+len(body)))%4
 pool=struct.pack('<HHI5I',1,h,start+len(body)+padding,len(ss),0,0,start,0)+struct.pack('<'+'I'*len(ss),*offsets)+body+b'\0'*padding
 tail=bytearray(data[o+size:]);p=0;extra=None;version_changed=False
 while p<len(tail):
  t,ch,sz=struct.unpack_from('<HHI',tail,p)
  if t==258 and ss[struct.unpack_from('<I',tail,p+20)[0]]=='manifest':
   at=p+16+struct.unpack_from('<H',tail,p+24)[0];width=struct.unpack_from('<H',tail,p+26)[0]
   for i in range(struct.unpack_from('<H',tail,p+28)[0]):
    attribute=at+i*width
    if ss[struct.unpack_from('<I',tail,attribute+4)[0]]=='versionCode':
     require(tail[attribute+15]==16 and struct.unpack_from('<I',tail,attribute+16)[0]==base_code,'The base manifest version code is invalid.')
     struct.pack_into('<I',tail,attribute+16,VERSION_CODE);version_changed=True
  if t==258 and ss[struct.unpack_from('<I',tail,p+20)[0]]=='uses-permission':
   at=p+16+struct.unpack_from('<H',tail,p+24)[0]
   if not has_camera and struct.unpack_from('<I',tail,at+16)[0]==ss.index('android.permission.INTERNET'):
    assert struct.unpack_from('<H',tail,p+28)[0]==1
    element=bytearray(tail[p:p+sz]);a=at-p;struct.pack_into('<I',element,a+8,camera);struct.pack_into('<I',element,a+16,camera)
    et,eh,es=struct.unpack_from('<HHI',tail,p+sz);assert et==259
    extra=(p+sz+es,bytes(element)+bytes(tail[p+sz:p+sz+es]));break
  p+=sz
 require(version_changed,'The manifest version code was not changed.')
 if extra:
  at,value=extra;tail=tail[:at]+value+tail[at:]
 result=bytearray(data[:o]+pool+tail);struct.pack_into('<I',result,4,len(result));return bytes(result)
def label(data,label):
 # Both the original AESD base and the supplied Sahip 1.5.1 base reserve
 # the same resource slot. Preserve offsets when switching the label.
 markers=(b'\x04\x04AESD\x00',b'\x0a\x0aAESD Sahip\x00')
 matches=[marker for marker in markers if data.count(marker)==1]
 require(len(matches)==1,'The base application label is not unique.')
 marker=matches[0];i=data.index(marker)
 value=bytes([len(label),len(label)])+label.encode()+b'\x00'
 width=max(len(marker),len(value))
 require(data[i:i+width]==marker+b'\x00'*(width-len(marker)),'The base label has no room for the requested application name.')
 return data[:i]+value+b'\x00'*(width-len(value))+data[i+width:]

def icon(size):
 # Derive Web and launcher sizes from the approved Server artwork.
 with Image.open(root/'branding/server-icon.png') as source:
  image=source.convert('RGBA').resize(size,Image.Resampling.LANCZOS)
 output=io.BytesIO();image.save(output,format='PNG');return output.getvalue()

def main():
 parser=argparse.ArgumentParser(description='Build the signed AESD APKs. Preserve the original owner package and certificate.')
 parser.add_argument('--check-sources',action='store_true',help='Check the asset bundles without reading signing files or building APKs.')
 parser.add_argument('--deployment-evidence',help='Use a fresh JSON deployment record with matching sourceHashes.')
 parser.add_argument('--expected-backend-commit',help='Match the deployment evidence to this Git commit.')
 args=parser.parse_args()
 (root/'artifacts').mkdir(exist_ok=True);(root/'evidence').mkdir(exist_ok=True)
 sources=source_hashes();bundles={};checks=[]
 for audience,package,app_label,name in PANELS:
  public=collect_assets(audience,app_label);bundles[audience]=public;checks.append(validate_assets(public,audience))
 require(source_hashes()==sources,'The source changed during the asset check. Run the check again.')
 check_record={'checkedAt':datetime.now(timezone.utc).isoformat(),'sourceHashes':sources,'panels':checks,'signingFilesRead':False,'apkBuilt':False,'androidRuntimeTested':False}
 (root/'evidence/apk-source-check.json').write_text(json.dumps(check_record,indent=2))
 if args.check_sources:
  print(json.dumps({key:value for key,value in check_record.items() if key not in ('sourceHashes','panels')}|{'panels':[{key:value for key,value in item.items() if key!='assets'} for item in checks]},indent=2));return
 metadata=subprocess.run([str(android/'aapt'),'dump','badging',str(base)],check=True,capture_output=True,text=True).stdout
 require("name='com.oses.pos'" in metadata and any(f"versionCode='{code}'" in metadata and f"versionName='{name}'" in metadata for name,code in [('1.5.1',151),('1.6.4',164),('1.7.0',170),('1.8.0',180)]),'The base APK package or version has changed.')
 base_verified=subprocess.run([str(android/'apksigner'),'verify','--print-certs',str(base)],check=True,capture_output=True,text=True).stdout
 require(CERTIFICATE_SHA256 in base_verified,'The base APK does not have the original signing certificate.')
 icons=set(re.findall(r"application-icon-\d+:'([^']+)'",metadata))
 require(bool(icons),'The base APK icons were not found.')
 backend=backend_status(args.deployment_evidence,args.expected_backend_commit,sources)
 records=[]
 for audience,package,app_label,name in PANELS:
  raw=root/'artifacts'/('raw-'+audience+'.apk');aligned=root/'artifacts'/('aligned-'+audience+'.apk');out=root/'artifacts'/name
  public=bundles[audience]
  with zipfile.ZipFile(base) as original,zipfile.ZipFile(raw,'w',compression=zipfile.ZIP_DEFLATED) as archive:
   require(len(original.namelist())==len(set(original.namelist())),'The base APK contains duplicate entries.')
   require(original.testzip() is None,'The base APK ZIP data is invalid.')
   for info in original.infolist():
    n=info.filename
    if signature(n) or n.startswith('assets/public/'):continue
    data=original.read(n)
    if n=='AndroidManifest.xml':data=panel_manifest(data,audience=='customer')
    if n=='resources.arsc':
     data=label(data,app_label)
     if audience=='customer':data=data.replace(('com.oses.pos'+'\0').encode('utf-16le'),('com.aesd.pos'+'\0').encode('utf-16le'))
    if n=='assets/capacitor.config.json':
     config=json.loads(data);config['appId']=package;config['appName']=app_label;data=json.dumps(config).encode()
    if n in icons:
     dimensions=Image.open(io.BytesIO(data)).size;data=icon(dimensions)
    archive.writestr(info,data)
   for n,data in public.items():archive.writestr('assets/public/'+n,data)
  try:
   subprocess.run([str(android/'zipalign'),'-f','-p','4',str(raw),str(aligned)],check=True)
   # Pass the password file to the signer. Do not read or print its contents.
   subprocess.run([str(android/'apksigner'),'sign','--ks',keystore,'--ks-pass','file:'+password_file,'--ks-key-alias','oses','--v4-signing-enabled','false','--out',str(out),str(aligned)],check=True)
   verified=subprocess.run([str(android/'apksigner'),'verify','--verbose','--print-certs',str(out)],check=True,capture_output=True,text=True).stdout;(root/'evidence'/('signature-'+audience+'.txt')).write_text(verified)
   aligned_result=subprocess.run([str(android/'zipalign'),'-c','-v','4',str(out)],check=True,capture_output=True,text=True).stdout;(root/'evidence'/('alignment-'+audience+'.txt')).write_text(aligned_result)
   meta=subprocess.run([str(android/'aapt'),'dump','badging',str(out)],check=True,capture_output=True,text=True).stdout;(root/'evidence'/('metadata-'+audience+'.txt')).write_text(meta)
   require("name='"+package+"'" in meta and f"versionCode='{VERSION_CODE}'" in meta and f"versionName='{VERSION_NAME}'" in meta and "application-label:'"+app_label+"'" in meta,'The APK package, version or label is incorrect.')
   require(CERTIFICATE_SHA256 in verified,'The APK signing certificate has changed.')
   for version in (1,2,3):require(bool(re.search(rf'v{version} scheme.*: true',verified)),'The APK signature scheme is missing.')
   require('android.permission.CAMERA' in meta,'The APK camera permission is missing.')
   with zipfile.ZipFile(out) as apk,zipfile.ZipFile(base) as original:
    require(apk.testzip() is None,'The APK ZIP data is invalid.')
    require(len(apk.namelist())==len(set(apk.namelist())),'The APK contains duplicate entries.')
    packed={n.removeprefix('assets/public/'):apk.read(n) for n in apk.namelist() if n.startswith('assets/public/')}
    require(packed==public,'The APK public files do not match the source bundle.')
    validate_assets(packed,audience)
    modified={'AndroidManifest.xml','resources.arsc','assets/capacitor.config.json'}|icons
    retained=[n for n in original.namelist() if not signature(n) and not n.startswith('assets/public/') and n not in modified]
    require(all(apk.read(n)==original.read(n) for n in retained),'The native program or bridge has changed.')
    config=json.loads(apk.read('assets/capacitor.config.json'))
    original_config=json.loads(original.read('assets/capacitor.config.json'))
    require(config.get('appId')==package and config.get('appName')==app_label,'The Capacitor package identity is incorrect.')
    require(config.get('server')==original_config.get('server') and config.get('android')==original_config.get('android'),'The native web origin or security settings have changed.')
   records.append({'file':name,'audience':audience,'package':package,'label':app_label,'versionCode':VERSION_CODE,'versionName':VERSION_NAME,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sha256':digest(out.read_bytes()),'bytes':out.stat().st_size,'certificate_sha256':CERTIFICATE_SHA256,'signatures':[1,2,3],'zipalign':True,'source_match':True,'asset_dependencies_closed':True,'assets':{n:digest(data) for n,data in sorted(public.items())},'native_source_match':True,'native_origin_preserved':True,'android_runtime_tested':False,'private_source_present':audience=='owner','staff_entry_bundled':audience in ('all','owner'),'staff_entry_policy':'Unified AESD app. Staff permissions remain server controlled.','private_owner_assets_excluded':audience=='customer','owner_device_controls_enabled':audience in ('all','owner'),'camera_permission':True,**backend})
  finally:
   raw.unlink(missing_ok=True);aligned.unlink(missing_ok=True)
 # Refuse to describe source edits made during signing as part of this build.
 require(source_hashes()==sources,'The source changed while the APKs were built. Build the APKs again.')
 (root/'evidence/build.json').write_text(json.dumps(records,indent=2))
 print(json.dumps([{key:value for key,value in item.items() if key!='assets'} for item in records],indent=2))
if __name__=='__main__':main()

