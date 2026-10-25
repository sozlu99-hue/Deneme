from pathlib import Path
import json,re,hashlib,datetime,subprocess,zipfile
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
root=Path(__file__).parent;ev=root/'evidence';out=root/'artifacts'
def load(n):return json.loads((ev/n).read_text())
def count(n):
 s=(ev/n).read_text();v={k:int(re.findall(r'^# '+k+r' (\d+)$',s,re.M)[-1]) for k in ['tests','pass','fail']};assert v['tests']==v['pass'] and v['fail']==0;return v
tests={k:count(n) for k,n in [('platform','recheck-unit.tap'),('private_pos','recheck-private.tap'),('recovery_isolated','recheck-recovery.tap'),('native_http','recheck-native.tap')]}
browsers={k:load(n) for k,n in [('pos','browser-results.json'),('authentication','auth-browser-results.json'),('webview_origin','webview-origin-results.json'),('review','review-browser-results.json'),('panels','panels-browser-results.json')]}
assert all(x['status']=='passed' and not x['pageErrors'] for x in browsers.values())
build=load('build.json');backend=load('live-backend.json');remote=load('remote-change-status.json');template=load('private-template-match.json');audit=load('dependency-audit-after.json')
assert remote['deployment_status']=='live' and backend['commit']==remote['commit'] and backend['platformReady']
assert audit['metadata']['vulnerabilities']['total']==0
for b in build:
 p=out/b['file'];assert hashlib.sha256(p.read_bytes()).hexdigest()==b['sha256']
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  for n in ['index.html','app.js','ui.js','styles.css','pos.js','store.js','lease.js','backup-validation.js','icon.svg']:assert z.read('assets/public/'+n)==(root/'web'/n).read_bytes()
  cfg=json.loads(z.read('assets/public/config.json'));assert cfg['publicKey']==backend['/aesd/v1/health']['body']['publicKey']
  assert ('assets/public/private-pos.html' in z.namelist())==(b['audience']=='owner')
  if b['audience']=='owner':assert hashlib.sha256(z.read('assets/public/private-pos.html')).hexdigest()==template['patchedSha256']
v={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'release':'AESD 1.5.1 light design and owner panel access','productionReady':False,'productionBackendDeployed':True,'backendCommit':remote['commit'],'tests':tests,'automaticTestsPassed':sum(x['pass'] for x in tests.values()),'browser':browsers,'browserChecksPassed':sum(x['checksCount'] for x in browsers.values()),'apks':build,'backend':backend,'realMail':load('live-mail-request.json'),'realMailSentThisRound':False,'newFeatures':['Verified OWNER account opens Private, Market, Restaurant and Cafe','Owner package selects a panel before login','Light design and four-square menu','Category filters and bounded local product photos'],'performanceEvidence':{'privateFrameRetainedAcrossNavigation':True,'additionalPrivateHtmlRequestsOnReturn':0,'basketRetainsCatalogNodes':True,'saleSummaryCachedForUnchangedState':True,'oneFullCommandValidation':True,'ownerLeaseSnapshotWrites':0,'androidMeasured':False,'renderColdStartMeasured':False},'preserved':{'ownerPackage':'com.oses.pos','versionCode':151,'certificate':build[0]['certificate_sha256'],'legacyDatabaseKeys':True,'legacyPasswordStore':True,'privateDoughOnlyStockRule':True,'historicalCostSnapshots':True},'privateTemplateMatch':template,'notTested':['Android install and update','Android crash and reopen','Android camera and physical barcode reader','Native Android backup sharing','Reset and login of the real user on the tablet'],'notConnected':['SMS provider','Payment provider','Purchased custom domain'],'limits':['Offline suspension can take up to one hour','JSON backups are not encrypted','Recipe editing is not available in the new panels'],'writing':'ASD-STE100 writing principles; no certification claim','perfectionClaim':False,'dependencyAudit':{'knownVulnerabilities':audit['metadata']['vulnerabilities'],'scope':'server JavaScript dependencies'}}
(root/'validation.json').write_text(json.dumps(v,ensure_ascii=False,indent=2))
(root/'docs/SCHEMA.md').write_text('''# AESD panel erişimi

```mermaid
flowchart TD
  Login[Mevcut e-posta ve şifre] --> Server[Sunucu rol ve oturum kontrolü]
  Server --> Owner[Sistem sahibi]
  Server --> Client[Müşteri]
  Owner --> Private[Özel Panelim]
  Owner --> Market[Market]
  Owner --> Restaurant[Restoran]
  Owner --> Cafe[Kafe]
  Client --> License[İşyeri + panel lisansı + cihaz]
  License --> Customer[Satın alınan panel]
  Private --> Existing[Mevcut özel kayıtlar korunur]
  Market --> Separate[Her panel kendi verisini saklar]
  Restaurant --> Separate
  Cafe --> Separate
  Customer --> Consent[Açık rıza varsa ciro özeti]
```

Şema sunucu yetkisini gösterir. Yerel panel tercihi yetki vermez. Android kabul testi yapılmadı.
''')
dot='''digraph AESD {
 graph [rankdir=TB,bgcolor="white",pad="0.5",nodesep="0.4",ranksep="0.65"];
 node [shape=box,style="rounded,filled",fillcolor="#f5f7fa",color="#d7dce6",fontcolor="#172238",fontname="DejaVu Sans",fontsize=16,margin="0.23,0.15"];
 edge [color="#ed3038",fontcolor="#687386",fontname="DejaVu Sans",fontsize=12];
 login [label="AESD\nMevcut e-posta + yönetici şifresi",fillcolor="#fff1f2",color="#ed3038"];
 check [label="Sunucu\nOturum + rol + imzalı izin kontrolü"];
 owner [label="SİSTEM SAHİBİ\nTek hesap · Tüm paneller"];
 client [label="MÜŞTERİ\nKendi işyeri ve lisanslı paneli"];
 private [label="Özel Panelim\nÖnceki veriler korunur\nYalnız hamur stoktan düşer"];
 sector [label="Market · Restoran · Kafe\nPanel kayıtları ayrı saklanır"];
 license [label="Lisans + cihaz kontrolü\nHaftalık · Aylık · Yıllık · Süresiz"];
 menu [label="Dört kare menüsü\nSatış + Ayarlar\nÖzel panel yeniden indirilmez"];
 save [label="Kalıcı yerel kayıt\nSatış + stok + cari\nGeçmiş maliyet değişmez"];
 consent [label="Ciro özeti\nYalnız açık rıza varsa paylaşılır"];
 login -> check;check -> owner;check -> client;owner -> private;owner -> sector;client -> license;license -> sector;sector -> menu;private -> menu;menu -> save;client -> consent;
}'''
(ev/'final-schema.dot').write_text(dot);subprocess.run(['dot','-Tpng',str(ev/'final-schema.dot'),'-o',str(out/'AESD-SON-KONTROL-SEMASI.png')],check=True)
pdfmetrics.registerFont(TTFont('AESD','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'));pdfmetrics.registerFont(TTFont('AESDBold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
c=canvas.Canvas(str(out/'AESD-SON-KONTROL-RAPORU.pdf'),pagesize=(595,842));c.setTitle('AESD 1.5.1 yeni tasarım ve sahip erişimi test raporu')
def text(x,y,s,size=10,bold=False,color='#26344b'):
 c.setFillColor(HexColor(color));c.setFont('AESDBold' if bold else 'AESD',size);c.drawString(x,y,s)
def page(title):
 c.setFillColor(HexColor('#172238'));c.rect(0,770,595,72,fill=1,stroke=0);text(30,804,'AESD',23,True,'#ff454b');text(140,809,title,12,True,'#ffffff');text(30,22,'8 Ekim 2026 · Gerçek Android cihaz testi yapılmadı.',8)
def lines(items,y=732):
 for s in items:text(30,y,s,10);y-=23
 return y
def image_page(p,title):
 page(title);im=ImageReader(str(p));w,h=im.getSize();scale=min(535/w,650/h);c.drawImage(im,(595-w*scale)/2,70,width=w*scale,height=h*scale);text(30,44,'Gerçek tarayıcı ekranı. Görünen hesaplar ve kayıtlar test verisidir.',8);c.showPage()
page('Yeni tasarım ve sahip erişimi')
lines([f"{v['automaticTestsPassed']} otomatik test geçti. Başarısız test: 0.",f"{v['browserChecksPassed']} tarayıcı kontrolü geçti. Sayfa hatası: 0.",f"Çekirdek ve yeni regresyonlar: {tests['platform']['pass']}. Özel panel: {tests['private_pos']['pass']}.",f"Eski kurtarma: {tests['recovery_isolated']['pass']}. Native SQLite HTTP: {tests['native_http']['pass']}.",'Tarayıcı: satış 26, giriş 15, köken 3, önceki inceleme 12, paneller 28.','','Mevcut sahip hesabı dört paneli aynı şifreyle açar.','Sahip APK girişinde Özel Panelim, Market, Restoran veya Kafe seçilir.','Yeni kayıt sahibin yetkisini alamaz; müşteri lisansı ayrı kontrol edilir.','Müşteri APK özel panel kaynağını içermez.','','Beyaz-kırmızı tasarım, açılır menü ve kategori filtreleri eklendi.','Küçük ürün fotoğrafları cihazda saklanır.','Yeni gerçek panellere örnek satış, ciro veya stok eklenmez.','','Mevcut Render sunucusuna dağıtıldı. Kalıcı snapshot sağlıklı.','Sunucu commit:']);text(30,345,remote['commit'],9);lines(['Paket adı, sürüm kodu, özgün imza ve eski özel kayıt anahtarları korundu.','Gmail teslimatı önceki alıcı teyidiyle doğrulandı.','Bu tur gerçek e-posta gönderilmedi. SMS sağlayıcısı bağlı değil.','','ASD-STE100 yazım ilkeleri kullanılır; sertifika iddia edilmez.','Testler kusursuzluk veya Android kabul testi kanıtı değildir.'],315);c.showPage()
page('Düzeltmeler ve ölçülen davranış')
lines(['1. Sahip girişindeki özel panel yönlendirmesi genişletildi.','   Sistem sahibi tüm panelleri açar. Müşteri ayrı lisans ister.','2. Özel panelde doğrulanmış sahip kimliği ikinci girişi kaldırır.','   Eski cihaz güvenlik şifresi ve kullanıcı verileri değiştirilmez.','3. Özel panel Ayarlar geçişlerinde aynı çerçevede tutulur.','   Testte dönüş sırasında ek özel HTML isteği: 0.','4. Sepet güncellemesi katalog düğümlerini değiştirmez.','   Arama odağı, barkod alanı ve ödeme/cari seçimi korunur.','5. Komutun tam doğrulaması bir kez yapılır.','   İşlem anahtarı ayrıca denetlenir; yedek doğrulaması korunur.','6. Sahip izin yenilemesi snapshot yazmaz.','   Rol ve oturum sırada tekrar doğrulanır.','7. Panel seçimi girişe yazılan e-posta ve şifreyi temizlemez.','8. Son panel tercihi Beni Hatırla ile yeniden açılışta korunur.','9. Çıkış, tutulan özel çerçeveyi kaldırır.','10. Özel panel menüsü ana pencerenin kökeniyle iletişim kurar.',
'11. Fotoğrafta uzak URL ve çalıştırılabilir veri reddedilir.','','Önceki satış, maliyet, iptal, cari, yedek ve lisans testleri geçti.','Sunucu JavaScript bağımlılık taramasında bilinen açık: 0.','','Android hız ölçümü yapılmadı. Render soğuk başlangıcı ölçülmedi.','Tarayıcıda süreç kapatma/çökme ve yeniden açılış geçti.','Bu bulgu Android çökme testi olarak raporlanmaz.']);c.showPage()
image_page(out/'AESD-SON-KONTROL-SEMASI.png','Yetki ve panel şeması')
for name,title in [('owner-settings.png','Sahip: Yönetim ve Ayarlar'),('owner-expanded-menu.png','Dört kare: Açılır menü'),('aesd-market-final.png','Market satış paneli'),('aesd-restaurant-final.png','Restoran satış paneli'),('aesd-cafe-final.png','Kafe satış paneli'),('owner-private-sales.png','Sana özel satış paneli')]:image_page(ev/name,title)
page('İmza ve test sınırları');y=733
for b in build:
 y=lines([b['file'],b['package']+' · Sürüm kodu 151 · '+str(b['bytes'])+' bayt','SHA-256: '+b['sha256'][:32],b['sha256'][32:]],y)-10
lines(['Özgün sertifika, v1/v2/v3 imzaları ve hizalama doğrulandı.','APK kaynakları ve sunucu özel şablon dönüşümü eşleşir.','Sahip uygulamasını kaldırmadan güncelle; önce mümkünse yedek al.','','Test edilmeyen işlemler:','Android kurulum/güncelleme, zorla kapatma ve yeniden açılış.','Android kamera, fiziksel barkod okuyucu ve native dosya paylaşımı.','Gerçek kullanıcının tablette şifre yenilemesi ve giriş yapması.','','SMS ve ödeme sağlayıcısı bağlı değil. Domain satın alınmadı.','Çevrimdışı lisans kapatma en fazla bir saat gecikebilir.','JSON yedekler şifrelenmez. Yeni panel reçetesi düzenlemesi yok.','','The owner uses one account for all four panels.','Each customer panel requires its own license.','The application retains the private frame during navigation.','The tests do not confirm operation on an Android tablet.'],y);c.showPage();c.save()
(out/'ONCE-OKU-SON-KONTROL.txt').write_text('AESD 1.5.1 — yeni tasarım ve sahip erişimi\n\nSana özel uygulama: AESD-SAHIP-v1.5.1-SON-KONTROL.apk\nMüşteri uygulaması: AESD-MUSTERI-v1.5.1-SON-KONTROL.apk\n\nSahip hesabının mevcut e-posta ve şifresini kullan. Girişte panel seçebilir veya dört kare menüsünden geçiş yapabilirsin. Müşteri her panel için ayrı lisans kullanır.\n\nSahip uygulamasını kaldırmadan güncelle. Önce mümkünse yedek al. Android tablette dosyayı indirip yükle. iPhone APK çalıştırmaz.\n\n'+str(v['automaticTestsPassed'])+' otomatik test ve '+str(v['browserChecksPassed'])+' tarayıcı kontrolü geçti. Gerçek Android kabul testi yapılmadı. Bu tur gerçek e-posta gönderilmedi.\n\nDestek: ozlusuat7@gmail.com\n')
delivery=[out/b['file'] for b in build]+[out/'AESD-SON-KONTROL-RAPORU.pdf',out/'AESD-SON-KONTROL-SEMASI.png',out/'ONCE-OKU-SON-KONTROL.txt',root/'validation.json',root/'docs/PANELS-REVIEW.md',root/'docs/SCHEMA.md']+[ev/n for n in ['owner-settings.png','owner-expanded-menu.png','aesd-market-final.png','aesd-restaurant-final.png','aesd-cafe-final.png','owner-private-sales.png']]
with zipfile.ZipFile(out/'AESD-SON-KONTROL-PAKETI.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in delivery:z.write(p,p.name)
source=[root/n for n in ['README.md','CODEX_DEVIR.md','package.json','build-apks.py','make-panels-review.py','live-check.py','validation.json']]
for folder in ['server','web','tests','docs','legacy','input','legacy-tests']:
 source.extend(p for p in (root/folder).rglob('*') if p.is_file() and 'node_modules' not in p.parts and '__pycache__' not in p.parts)
source.extend(p for p in (root/'parent-server').iterdir() if p.suffix in ['.js','.json'])
source.extend(ev/n for n in ['recheck-unit.tap','recheck-private.tap','recheck-recovery.tap','recheck-native.tap','browser-results.json','auth-browser-results.json','webview-origin-results.json','review-browser-results.json','panels-browser-results.json','private-template-match.json','build.json','live-backend.json','live-mail-request.json','remote-change-status.json','signature-owner.txt','signature-customer.txt','dependency-audit-after.json'])
with zipfile.ZipFile(out/'AESD-SON-KONTROL-KAYNAK.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in source:
  assert p.suffix not in ['.jks','.pem','.key'] and p.name!='.env';z.write(p,'aesd-platform/'+str(p.relative_to(root)))
records=[]
for name in [b['file'] for b in build]+['AESD-SON-KONTROL-RAPORU.pdf','AESD-SON-KONTROL-SEMASI.png','AESD-SON-KONTROL-PAKETI.zip','AESD-SON-KONTROL-KAYNAK.zip']:
 p=out/name;records.append({'file':name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(ev/'final-delivery-manifest.json').write_text(json.dumps(records,indent=2));print(json.dumps({'automaticTests':v['automaticTestsPassed'],'browserChecks':v['browserChecksPassed'],'files':records},indent=2))
