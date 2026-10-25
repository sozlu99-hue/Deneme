from pathlib import Path
import json,re,hashlib,datetime,subprocess,zipfile
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Image,PageBreak,Table,TableStyle
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from xml.sax.saxutils import escape
root=Path(__file__).parent;ev=root/'evidence';out=root/'artifacts'
def load(name):return json.loads((ev/name).read_text())
def count(name):
 text=(ev/name).read_text();v={key:int(re.findall(r'^# '+key+r' (\d+)$',text,re.M)[-1]) for key in ['tests','pass','fail']};assert v['tests']==v['pass'] and v['fail']==0;return v
tests={k:count(n) for k,n in [('platform_and_cloud','recheck-unit.tap'),('private_and_cloud','recheck-private.tap'),('recovery_isolated','recheck-recovery.tap'),('native_http','recheck-native.tap'),('real_postgres_isolated','cloud-postgres-tests.txt')]}
browsers={k:load(n) for k,n in [('pos','browser-results.json'),('auth','auth-browser-results.json'),('webview_origin','webview-origin-results.json'),('review','review-browser-results.json'),('panels','panels-browser-results.json'),('two_devices','cloud-browser-results.json')]}
assert all(v['status']=='passed' and not v['pageErrors'] for v in browsers.values())
build=load('build.json');backend=load('live-backend.json');remote=load('remote-change-status.json');template=load('private-template-match.json')
assert remote['deployment_status']=='live' and backend['commit']==remote['commit']
assert backend['/aesd/v1/health']['body']['cloudStorage']=='postgres' and backend['/aesd/v1/health']['body']['version']==3
public=['index.html','app.js','cloud-store.js','private-cloud.js','ui.js','styles.css','pos.js','store.js','lease.js','backup-validation.js','icon.svg']
for item in build:
 path=out/item['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256']
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  for name in public:assert z.read('assets/public/'+name)==(root/'web'/name).read_bytes()
  assert json.loads(z.read('assets/public/config.json'))['publicKey']==backend['/aesd/v1/health']['body']['publicKey']
  assert ('assets/public/private-pos.html' in z.namelist())==(item['audience']=='owner')
  if item['audience']=='owner':assert hashlib.sha256(z.read('assets/public/private-pos.html')).hexdigest()==template['patchedSha256']
v={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'release':'AESD 1.5.1 shared web and tablet records','productionReady':False,'backendCommit':remote['commit'],'backendDeployment':remote,'tests':tests,'automaticTestsPassed':sum(x['pass'] for x in tests.values()),'browser':browsers,'browserChecksPassed':sum(x['checksCount'] for x in browsers.values()),'apks':build,'backend':backend,'privateTemplateMatch':template,'sharedRecords':{'implemented':True,'storage':'PostgreSQL panel JSONB and operation receipts','pollIntervalMs':5000,'rowLockAndAtomicWrite':True,'permanentOperationIds':True,'requiresServerConfirmation':True,'multiDeviceOfflineSales':False,'localMigrationBackup':True,'realUserTabletDataMigrated':False,'customerDevicePolicyUnchanged':True,'ownerCannotReadCustomerLedgerThroughCloudApi':True,'maxPanelBytes':16777216},'preserved':{'ownerPackage':'com.oses.pos','versionCode':151,'certificate':build[0]['certificate_sha256'],'legacyDataKeys':True,'legacyPasswordStore':True,'privateDoughOnlyDeduction':True,'pastSaleCostSnapshots':True,'centralOwnerPasswordForPrivateActions':True},'realMailSentThisRound':False,'previousInboxDeliveryConfirmed':bool(load('live-mail-request.json').get('inboxDeliveryVerified')),'realAndroid':False,'realIPhone':False,'androidEmulatorAvailable':False,'notTested':['Physical Android installation and update','Physical Android crash, camera, barcode reader and backup sharing','Physical iPhone Safari and home screen launch','Actual user tablet migration','Actual owner password reset and login on tablet','Daily business backup and disaster recovery restore'],'notConnected':['SMS provider','Payment provider','Purchased domain'],'hostingPlan':'free','hostingMaySleep':True,'writing':'ASD-STE100 writing principles; no certification claim','perfectionClaim':False,'remainingLimits':['Internet and server confirmation required for shared operations','Different populated ledgers do not merge automatically','JSON backups are not encrypted','Customer licenses remain bound to the approved device','Large ledgers need record-based storage and performance tests']}
(root/'validation.json').write_text(json.dumps(v,ensure_ascii=False,indent=2))
schema='''# AESD ortak kayıt şeması

```mermaid
flowchart TD
  Tablet[Gerçek kayıtların bulunduğu tablet] --> Backup[Yerel aktarım yedeği]
  Backup --> Import[İşyeri ve panel doğrulaması]
  Import --> API[Hesap, lisans ve işlem kimliği kontrolü]
  Phone[iPhone Safari] --> API
  Android[Android satış ekranı] --> API
  API --> DB[PostgreSQL: satış, stok, cari ve makbuz aynı işlemde]
  DB --> Sync[Onaylanan kayıt ve sürüm]
  Sync --> Phone
  Sync --> Android
  API --> Guard[Çift istek: aynı makbuz. Son stok: tek satış.]
```

Ortak satış internet gerektirir. İlk gerçek tablet aktarımı kullanıcı cihazında tamamlanmalıdır. Fiziksel cihaz testi yapılmadı.
'''
(root/'docs/SCHEMA.md').write_text(schema)
dot='''digraph AESD {graph[rankdir=TB,bgcolor="white",pad="0.4",nodesep="0.35",ranksep="0.5"];node[shape=box,style="rounded,filled",fillcolor="#f5f7fa",color="#d7dce6",fontcolor="#172238",fontname="DejaVu Sans",fontsize=15,margin="0.2,0.16"];edge[color="#ed3038",fontname="DejaVu Sans",fontsize=11];
 tablet[label="İlk adım: Gerçek kayıtların bulunduğu tablet\nYerel yedek → Kontrollü ilk aktarım",fillcolor="#fff1f2",color="#ed3038"];
 phone[label="iPhone\nSafari web sürümü"];android[label="Android tablet\nAESD imzalı APK"];
 auth[label="Aynı hesap + aynı panel\nOturum ve lisans kontrolü\nHer işlemin kalıcı kimliği var"];
 db[label="POSTGRESQL\nSatış + stok + cari + işlem makbuzu\nTek işlemde kalıcı kayıt",fillcolor="#fff1f2",color="#ed3038"];
 sync[label="Sunucu onayı ve yeni sürüm\nİki ekran ortak kaydı alır\nDeğişiklik kontrolü: yaklaşık 5 saniye"];
 rules[label="Çift istek → İkinci satış oluşmaz\nSon stok yarışı → Tek satış onaylanır\nYeni alış → Geçmiş maliyet değişmez\nÖzel panel → Yalnız hamur stoktan düşer"];
 offline[label="İnternet yoksa yeni ortak satış onaylanmaz\nYanıt kaybolursa aynı işlem kimliği sorgulanır"];
 tablet->auth;phone->auth;android->auth;auth->db;db->sync;sync->phone[constraint=false];sync->android[constraint=false];db->rules;auth->offline;
}'''
(ev/'cloud-schema.dot').write_text(dot);subprocess.run(['dot','-Tpng',str(ev/'cloud-schema.dot'),'-o',str(out/'AESD-SON-KONTROL-SEMASI.png')],check=True)
pdfmetrics.registerFont(TTFont('AESD','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'));pdfmetrics.registerFont(TTFont('AESDBold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
styles=getSampleStyleSheet();styles['Normal'].fontName='AESD';styles['Normal'].fontSize=10;styles['Normal'].leading=15;styles['Normal'].textColor=HexColor('#172238');styles['Title'].fontName='AESDBold';styles['Title'].fontSize=24;styles['Title'].leading=30;styles['Heading2'].fontName='AESDBold';styles['Heading2'].fontSize=16;styles['Heading2'].leading=22
story=[]
def p(text,style='Normal'):story.extend([Paragraph(escape(text),styles[style]),Spacer(1,10)])
def image_page(path,title,note):
 story.append(PageBreak());p(title,'Heading2');p(note);im=Image(str(path));scale=min(515/im.imageWidth,650/im.imageHeight);im.drawWidth=im.imageWidth*scale;im.drawHeight=im.imageHeight*scale;story.append(im)
p('AESD · Ortak Kayıt Test Raporu','Title');p('8 Ekim 2026 · v1.5.1 · Web ve Android tablet')
p(f"{v['automaticTestsPassed']}/{v['automaticTestsPassed']} otomatik test ve {v['browserChecksPassed']}/{v['browserChecksPassed']} tarayıcı kontrolü geçti.",'Heading2')
p('Ortak kayıt katmanı uygulandı ve mevcut Render hizmetine yayımlandı. PostgreSQL, panel ve işlem makbuzunu aynı işlemde yazar. İki bağımsız tarayıcı oturumu aynı satış ve stok kaydını gördü. Fiziksel Android/iPhone testi yapılmadı.')
rows=[['Test grubu','Geçen / Toplam']]+[[k,f"{x['pass']} / {x['tests']}"] for k,x in tests.items()]+[[f'Tarayıcı: {k}',str(x['checksCount'])] for k,x in browsers.items()]
table=Table(rows,colWidths=[380,130]);table.setStyle(TableStyle([('FONTNAME',(0,0),(-1,-1),'AESD'),('FONTSIZE',(0,0),(-1,-1),10),('BACKGROUND',(0,0),(-1,0),HexColor('#fff1f2')),('GRID',(0,0),(-1,-1),.4,HexColor('#e0e4ec')),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]));story.append(table);story.append(Spacer(1,15));p('Canlı kod: '+remote['commit']);p('Ücretsiz Render planı korunur. Hizmet uyuyabilir. Ücretli plan veya domain satın alınmadı.')
story.append(PageBreak());p('Doğrulanan davranışlar','Heading2')
for text in ['İki cihaz aynı panelin satış, stok ve cari kaydını okur. Son stok için eşzamanlı iki satıştan yalnız biri tamamlanır.','Kaybolan başarı yanıtı kalıcı işlem kimliğiyle çözülür. İkinci satış ve ikinci stok düşümü oluşmaz.','Çevrimdışı olduğu bildirilen cihaz yeni ortak satış yapamaz. Yeniden bağlantı bu reddedilmiş satışı kendiliğinden kaydetmez.','Özel panelde ikinci cihazın eski sürüme dayanan satışı reddedilir. Sepet korunur. Hamur dışında malzeme stoktan düşmez.','Yeni alış geçmiş satış maliyetini değiştirmez. Özel panel iptali hamuru geri ekler; genel panel iptali cari ve stok hareketini geri alır.','İlk aktarım yerel yedek tutar. Farklı dolu kayıtlar sessizce birleştirilmez. Eski yedek yeni ortak kayıtların üzerine yazılmaz.','Lisans kapatma, yanlış cihaz, başka panel ve özel panel erişim denemeleri sunucuda reddedilir. Yönetici müşteri ayrıntılı defterini bu API ile okuyamaz.','Arama, kategori, ödeme seçimi ve sepet davranışı korunur. Özel çerçeve menü dönüşünde yeniden indirilmez.']:p(text)
p('Bulunan ve düzeltilen sorunlar','Heading2');p('Cihaza özel mali kayıtlar ortak PostgreSQL kaydına bağlandı. Başarı yanıtı kaybında çift satış riski işlem makbuzuyla kapatıldı. Eski özel panel sürümü artık diğer cihazın kaydını ezemez. Yönetici sektör panelindeyken ürün ve stok işlemleri Ayarlar’a eklendi. Eski yedekle yeni ortak verinin ezilmesi durduruldu.')
image_page(out/'AESD-SON-KONTROL-SEMASI.png','İşlem şeması','Şema uygulanan ortak kayıt yolunu gösterir. Gerçek tablet verileri bu ortamda bulunmuyor; ilk kullanıcı aktarımı henüz yapılmadı.')
image_page(ev/'cloud-phone-sales.png','Telefon boyutunda web ekranı','390 piksel Chromium kontrolü. Gösterilen ciro yalıtılmış test verisidir. Gerçek iPhone/Safari testi değildir.')
image_page(ev/'cloud-tablet-sales.png','Tablet boyutunda satış ekranı','1024 piksel Chromium kontrolü. Aynı test hesabı ve panel kullanıldı. Gerçek Android kurulum testi değildir.')
image_page(ev/'owner-private-sales.png','Sana özel panel','Özgün veri anahtarı ve yerel güvenlik kaydı korunur. Görsel yalıtılmış test ortamından alınmıştır.')
story.append(PageBreak());p('APK, ilk aktarım ve test sınırları','Heading2')
for item in build:
 p(item['file']);p(item['package']+' · Sürüm kodu 151 · '+str(item['bytes'])+' bayt');p('SHA-256: '+item['sha256'][:32]+' '+item['sha256'][32:])
p('Özgün sertifika, v1/v2/v3 imzaları, hizalama ve APK kaynak eşitliği doğrulandı. Sahip APK’sı com.oses.pos paketini korur. Müşteri APK’sı özel panel HTML dosyasını içermez.')
p('Özel panel iptal ve kasa doğrulaması merkezdeki sahip şifresini kullanır. Yerel güvenlik kaydı korunur; yeni cihaza şifre özeti kopyalanmaz.')
p('Önce tablette güncelle; uygulamayı kaldırma. Yerel aktarım yedeğini indir ve ilk kayıt aktarımını tamamla. Sonra iPhone Safari’de aynı hesap ve paneli aç. Ortak satış internet ve sunucu onayı gerektirir.')
p('Test edilmedi: fiziksel Android/iPhone, emülatör kurulum testi, gerçek tabletin ilk aktarımı, gerçek cihaz şifre yenilemesi, fiziksel kamera/barkod okuyucu, native yedek paylaşımı ve işletme yedeğinden felaket kurtarma. Bu tur gerçek Gmail e-postası gönderilmedi. Önceki teslimat kullanıcı tarafından doğrulanmıştı. SMS ve ödeme sağlayıcısı bağlı değil.')
p('The server writes each panel and receipt in one transaction. The client reports success after the server confirms the write. The tests do not confirm operation on a physical Android or iPhone device.');p('ASD-STE100 yazım ilkeleri kullanıldı. Resmî uygunluk veya kusursuzluk sertifikası iddia edilmez.')
def footer(c,doc):c.setFont('AESD',8);c.setFillColor(HexColor('#687386'));c.drawString(42,24,'AESD · Test verileri · Fiziksel cihaz testi tamamlanmadı');c.drawRightString(553,24,str(doc.page))
SimpleDocTemplate(str(out/'AESD-SON-KONTROL-RAPORU.pdf'),pagesize=(595,842),leftMargin=42,rightMargin=42,topMargin=36,bottomMargin=42,title='AESD ortak kayıt test raporu').build(story,onFirstPage=footer,onLaterPages=footer)
(out/'ONCE-OKU-SON-KONTROL.txt').write_text((root/'docs/CLOUD-SYNC-RELEASE.md').read_text()+f"\nDoğrulama: {v['automaticTestsPassed']} otomatik test, {v['browserChecksPassed']} tarayıcı kontrolü.\nDestek: ozlusuat7@gmail.com\n")
delivery=[out/x['file'] for x in build]+[out/'AESD-SON-KONTROL-RAPORU.pdf',out/'AESD-SON-KONTROL-SEMASI.png',out/'ONCE-OKU-SON-KONTROL.txt',root/'validation.json',root/'docs/SCHEMA.md',root/'docs/CLOUD-SYNC-RELEASE.md']+[ev/x for x in ['cloud-phone-sales.png','cloud-tablet-sales.png','owner-private-sales.png','owner-settings.png','owner-expanded-menu.png','aesd-market-final.png','aesd-restaurant-final.png','aesd-cafe-final.png']]
with zipfile.ZipFile(out/'AESD-SON-KONTROL-PAKETI.zip','w',zipfile.ZIP_DEFLATED) as z:
 for path in delivery:z.write(path,path.name)
source=[root/n for n in ['README.md','CODEX_DEVIR.md','package.json','build-apks.py','make-cloud-review.py','live-check.py','validation.json']]
for folder in ['server','web','tests','docs','legacy','input','legacy-tests']:
 source.extend(p for p in (root/folder).rglob('*') if p.is_file() and 'node_modules' not in p.parts and '__pycache__' not in p.parts)
source.extend(p for p in (root/'parent-server').iterdir() if p.suffix in ['.js','.json'])
source.extend(ev/n for n in ['recheck-unit.tap','recheck-private.tap','recheck-recovery.tap','recheck-native.tap','cloud-postgres-tests.txt','browser-results.json','auth-browser-results.json','webview-origin-results.json','review-browser-results.json','panels-browser-results.json','cloud-browser-results.json','private-template-match.json','build.json','live-backend.json','remote-change-status.json','signature-owner.txt','signature-customer.txt','dependency-audit-after.json','live-mail-request.json','cloud-live-assets.json'])
with zipfile.ZipFile(out/'AESD-SON-KONTROL-KAYNAK.zip','w',zipfile.ZIP_DEFLATED) as z:
 for path in source:
  assert path.suffix not in ['.jks','.pem','.key'] and not path.name.startswith('.env');z.write(path,'aesd-platform/'+str(path.relative_to(root)))
records=[]
for name in [x['file'] for x in build]+['AESD-SON-KONTROL-RAPORU.pdf','AESD-SON-KONTROL-SEMASI.png','AESD-SON-KONTROL-PAKETI.zip','AESD-SON-KONTROL-KAYNAK.zip']:
 path=out/name;records.append({'file':name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(ev/'final-delivery-manifest.json').write_text(json.dumps(records,indent=2));print(json.dumps({'automaticTests':v['automaticTestsPassed'],'browserChecks':v['browserChecksPassed'],'files':records},indent=2))
