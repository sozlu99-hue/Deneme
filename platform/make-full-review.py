"""Build the final review report from fresh test, deployment, and APK evidence.

This script does not change application source, validation.json, or build.json.
It refuses incomplete test logs and mismatched APK or deployment evidence.
"""
from pathlib import Path
from datetime import datetime, timezone, timedelta
from hashlib import sha256
from xml.sax.saxutils import escape
import json
import re
import zipfile

from reportlab.lib.colors import HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak,
)

ROOT = Path(__file__).resolve().parent
EV = ROOT / 'evidence'
OUT = ROOT / 'artifacts'
PDF = OUT / 'AESD-SON-KONTROL-RAPORU.pdf'
TAP_GROUPS = [
    ('Ana kaynak, yetki ve yalıtılmış DOM testleri', 'full-review-unit.tap'),
    ('Özel panel maliyet, stok ve iptal regresyonları', 'full-review-private.tap'),
    ('Yalıtılmış kurtarma · node:sqlite test bağdaştırıcısı', 'full-review-recovery.tap'),
]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(name):
    path = EV / name
    require(path.is_file(), 'Missing final evidence: ' + str(path.relative_to(ROOT)))
    return json.loads(path.read_text())


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def tap_counts(name):
    path = EV / name
    require(path.is_file(), 'Missing final TAP log: ' + name)
    source = path.read_text()
    values = {}
    for field in ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'):
        found = re.findall(r'^(?:#|ℹ)\s+' + field + r'\s+(\d+)\s*$', source, re.M)
        require(bool(found), 'The TAP log has no final ' + field + ' count: ' + name)
        values[field] = int(found[-1])
    require(values['tests'] > 0, 'The TAP log has no tests: ' + name)
    require(values['fail'] == 0 and values['cancelled'] == 0,
            'The final TAP log contains failures or cancelled tests: ' + name)
    require(values['pass'] + values['skipped'] + values['todo'] == values['tests'],
            'The TAP summary is incomplete: ' + name)
    values.update({'file': name, 'sha256': digest(path)})
    return values


def packaging_counts():
    path = EV / 'apk-packaging-tests.txt'
    require(path.is_file(), 'Missing APK packaging test evidence.')
    source = path.read_text()
    counts = re.findall(r'^Ran (\d+) tests? in [\d.]+s\s*$', source, re.M)
    require(bool(counts) and re.search(r'^OK\s*$', source, re.M),
            'The APK packaging checks did not finish with OK.')
    require(not re.search(r'^(?:FAILED|ERROR:|FAIL:)', source, re.M),
            'The APK packaging evidence contains a failure.')
    n = int(counts[-1])
    return {'tests': n, 'pass': n, 'fail': 0, 'cancelled': 0, 'skipped': 0,
            'todo': 0, 'file': path.name, 'sha256': digest(path)}


def deployment_evidence():
    value = read_json('full-review-live.json')
    require(value.get('status') == 'live', 'The final Render deployment is not LIVE.')
    require(isinstance(value.get('commit'), str)
            and re.fullmatch(r'[0-9a-f]{40}', value['commit']),
            'The final deployment has no exact commit ID.')
    require(value.get('apiOrigin') == 'https://aesd-server.onrender.com',
            'The deployment server origin does not match AESD.')
    require(isinstance(value.get('sourceHashes'), dict) and value['sourceHashes'],
            'The deployment has no source hash map.')
    for name, expected in value['sourceHashes'].items():
        path = ROOT / name
        require(path.is_file() and digest(path) == expected,
                'The local source differs from the live deployment evidence: ' + name)
    checked = datetime.fromisoformat(value['checkedAt'].replace('Z', '+00:00'))
    require(checked.tzinfo is not None
            and timedelta(0) <= datetime.now(timezone.utc) - checked <= timedelta(hours=2),
            'The final live deployment check is stale. Check Render again.')
    return value


def apk_evidence(live, template):
    # build-apks.py writes this array. Do not use an older report manifest.
    value = read_json('build.json')
    require(isinstance(value, list) and len(value) == 2,
            'The builder manifest must contain the owner and customer APKs.')
    source_check = read_json('apk-source-check.json')
    require(source_check.get('sourceHashes') == live['sourceHashes'],
            'The APK source check differs from the final live source map.')
    require({item.get('audience') for item in value} == {'owner', 'customer'},
            'The builder manifest does not contain both APK audiences.')
    for item in value:
        path = OUT / item['file']
        require(path.is_file() and digest(path) == item.get('sha256'),
                'The APK file does not match its builder hash: ' + item['file'])
        require(path.stat().st_size == item.get('bytes'), 'The APK byte count differs.')
        require(item.get('versionCode') == 151, 'The APK version code has changed.')
        expected_package = 'com.oses.pos' if item['audience'] == 'owner' else 'com.aesd.pos'
        require(item.get('package') == expected_package, 'The APK package is incorrect.')
        for key in ('zipalign', 'source_match', 'asset_dependencies_closed',
                    'native_source_match', 'native_origin_preserved',
                    'production_backend_deployed', 'backendCurrent'):
            require(item.get(key) is True, 'The builder did not verify: ' + key)
        require(item.get('backendCommit') == live['commit'],
                'The APK build does not refer to the final live commit.')
        require(item.get('signatures') == [1, 2, 3], 'The APK signature schemes differ.')
        require(item.get('certificate_sha256') ==
                'ccc5e236fd30d0a395d49121bf1129a905a0ccf9fc952242eb920c8a8e04e2d9',
                'The original signing certificate has changed.')
        with zipfile.ZipFile(path) as apk:
            require(apk.testzip() is None, 'The APK contains a damaged ZIP member.')
            packed = {name.removeprefix('assets/public/'): sha256(apk.read(name)).hexdigest()
                      for name in apk.namelist() if name.startswith('assets/public/')}
            require(packed == item['assets'], 'The APK asset manifest does not match.')
            for name, expected in packed.items():
                if name in ('config.json', 'private-pos.html', 'icon-512.png',
                            'manifest.webmanifest'):
                    continue
                source = ROOT / 'web' / name
                require(source.is_file() and digest(source) == expected,
                        'A packaged APK asset differs from the current source: ' + name)
            if item['audience'] == 'owner':
                require(packed.get('private-pos.html') == template['patchedSha256'],
                        'The owner APK private template differs from the verified template.')
                require(item.get('staff_entry_bundled') is True
                        and item.get('owner_device_controls_enabled') is True,
                        'The owner APK staff controls are absent.')
            else:
                require('private-pos.html' not in packed
                        and 'staff-app.js' not in packed
                        and item.get('private_owner_assets_excluded') is True,
                        'The customer APK includes owner-only source.')
    return value


def main():
    groups = [{'label': label, **tap_counts(file)} for label, file in TAP_GROUPS]
    groups.append({'label': 'Python APK paketleme ve kanıt denetimleri', **packaging_counts()})
    suite_manifest = read_json('full-review-tests.json')
    require(suite_manifest.get('successfulCases') == sum(g['pass'] for g in groups),
            'The final suite manifest differs from the current test logs.')
    runtime = read_json('final-runtime-check.json')
    template = read_json('full-review-template-match.json')
    require(template.get('idempotent') is True
            and template.get('localMatchesServerTransformation') is True,
            'The server and APK private template match is not verified.')
    require((EV / 'full-review-native.tap').is_file(), 'Missing native HTTP attempt evidence.')
    native = (EV / 'full-review-native.tap').read_text()
    native_blocked = 'EPERM' in native and '127.0.0.1' in native and 'listen' in native
    require(native_blocked, 'Review the native HTTP result before making this report.')
    require((EV / 'full-review-recovery-native-failed.tap').is_file(),
            'Missing the preserved native recovery attempt evidence.')
    native_recovery = (EV / 'full-review-recovery-native-failed.tap').read_text()
    require('RemoveEnvironmentCleanupHook' in native_recovery,
            'Review the native recovery result before making this report.')
    require(runtime.get('realBrowser', {}).get('newScreenshots') is False
            and runtime.get('realBrowser', {}).get('status') == 'blocked',
            'Review the current browser result before making this report.')
    live = deployment_evidence()
    apks = apk_evidence(live, template)
    for name in ('AESD-GUNCEL-KONTROL-SEMASI.png', 'AESD-GUNCEL-KONTROL-TEMSILI.png'):
        require((OUT / name).is_file(), 'Missing final diagram or illustrative image: ' + name)

    pdfmetrics.registerFont(TTFont('AESDReview', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
    pdfmetrics.registerFont(TTFont('AESDReviewBold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
    styles = getSampleStyleSheet()
    for name in ('Normal', 'Title', 'Heading2'):
        styles[name].fontName = 'AESDReview' if name == 'Normal' else 'AESDReviewBold'
        styles[name].textColor = HexColor('#1c2534')
    styles['Normal'].fontSize = 9.5
    styles['Normal'].leading = 14
    styles['Title'].fontSize = 25
    styles['Title'].leading = 32
    styles['Heading2'].fontSize = 16
    styles['Heading2'].leading = 22
    styles.add(ParagraphStyle('SmallReview', parent=styles['Normal'], fontSize=8, leading=11))
    story = []

    def p(value, style='Normal'):
        story.extend([Paragraph(escape(str(value)), styles[style]), Spacer(1, 9)])

    def table(rows, widths):
        cells = [[Paragraph(escape(str(cell)), styles['SmallReview']) for cell in row] for row in rows]
        result = Table(cells, colWidths=widths, repeatRows=1)
        result.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HexColor('#ffe18b')),
            ('GRID', (0, 0), (-1, -1), .35, HexColor('#eadba7')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ]))
        story.extend([result, Spacer(1, 12)])

    def image(name, height):
        item = Image(str(OUT / name))
        scale = min(510 / item.imageWidth, height / item.imageHeight)
        item.drawWidth = item.imageWidth * scale
        item.drawHeight = item.imageHeight * scale
        story.extend([item, Spacer(1, 12)])

    total = sum(group['pass'] for group in groups)
    p('AESD · Son Kontrol Raporu', 'Title')
    p('9 Ekim 2026 · APK, web, sahip, müşteri ve personel erişimi')
    p(str(total) + ' otomatik test geçti.', 'Heading2')
    p('Bu sayı yalnız aşağıdaki yeni logların başarılı sonuçlarını içerir. Kaynak ve DOM testleri gerçek tarayıcı ekran kontrolü değildir. Önceki test sayıları bu tura eklenmedi.')
    table([['Yeni test grubu', 'Geçen / toplam', 'Atlanan / bekleyen']]
          + [[g['label'], f"{g['pass']} / {g['tests']}", f"{g['skipped']} / {g['todo']}"] for g in groups],
          [340, 86, 84])
    table([
        ['Ayrı kabul kontrolü', 'Bu tur sonucu'],
        ['Gerçek Chromium ve ekran yerleşimi', 'Engellendi. Tarayıcı sayfa açmadan durdu; setsockopt EPERM ve SIGTRAP.'],
        ['Native SQLite HTTP testi', 'Engellendi. Yerel TCP dinlemesi EPERM verdi. Bu tur başarılı sayılmadı.'],
        ['Native SQLite kurtarma denemesi', 'Bu Node 24 test ortamında native bağdaştırıcı kapatma sırasında durdu. Ayrı 16 test node:sqlite ile tamamlandı; native çalışma sonucu sayılmadı.'],
        ['Gerçek Android / iPhone', 'Çalıştırılmadı. Emülatör, adb ve fiziksel cihaz yok.'],
        ['Üretim HTTP kabul kontrolü', 'Bu tur doğrulanmadı. LIVE dağıtımı HTTP kabul testi değildir.'],
        ['Gmail / SMS', 'Bu tur gerçek teslimat testi yapılmadı. SMS sağlayıcısı bağlı değil.'],
    ], [198, 312])
    p('Kaynaklar düzeltilip yeniden sınandı. Gerçek cihaz kabulü eksik olduğu için kusursuzluk veya resmî uygunluk belgesi verilmez.')
    p('Kurtarma testleri yalıtılmış sağlayıcı ve açıkça seçilmiş node:sqlite bağdaştırıcısını kullanır. Native better-sqlite3 denemesi bu test makinesinde RemoveEnvironmentCleanupHook assertion ile durdu. Bu, üretim veya Android uygulamasının çöktüğü anlamına gelmez; bu ortamda native kabulü doğrulamaz.', 'SmallReview')

    story.append(PageBreak())
    p('Bulunan ve düzeltilen hatalar', 'Heading2')
    fixes = [
        ('Yetki reddinde eski kayıtlar görünüyordu.',
         'Sunucunun doğrulanmış 401/403 yanıtı satış ekranını kapatır. Eski özel panel çerçevesi, açık pencereler ve kayıt erişimi durur. Geciken yanıt yeni yetki vermez. Kalıcı bekleyen satış kuyruğu korunur.'),
        ('Okunamayan 4xx yanıtı satışın sonucunu kesinleştiremiyordu.',
         'JSON olmayan veya okunamayan yanıt belirsiz sayılır. Bekleyen satış ve aynı işlem kimliği silinmez. Uygulama önce mevcut makbuzu arar; kaybolan yanıt ikinci satış oluşturmaz.'),
        ('Lisans veya hesap kapatma ile devam eden satış çakışabiliyordu.',
         'Lisans, hesap, şifre ve satış işlemleri aynı yetki sırasını kullanır. Sunucu beklemelerden sonra oturumu ve veritabanındaki güncel rolü yeniden okur. Daha önce sıraya girmiş satış tamamlanabilir; kapatma tamamlandıktan sonraki yeni satış reddedilir.'),
        ('APK içindeki bağımlılık listesi yeni dosyalarla eksik kalabiliyordu.',
         'Paketleyici yerel ve dolaylı dosya bağlantılarını kontrol eder. Sahip paketine personel yönetimi ve gerekli görseller girer. Müşteri paketine sahip özel paneli veya personel giriş kaynağı girmez. Eksik dosya paketi durdurur.'),
        ('Eski dağıtım kaydı güncel APK ile eşleşmeyebilirdi.',
         'APK kanıtı güncel LIVE commit, kaynak özetleri ve kontrol saatine bağlandı. Eski sağlık sonucu veya değişmiş kaynak güncel sunucu kanıtı kabul edilmez. Rapor APK dosya ve paket içerik özetlerini ayrıca doğrular.'),
    ]
    for index, (problem, fix) in enumerate(fixes, 1):
        p(str(index) + '. ' + problem, 'Heading2')
        p(fix)
    p('Mali kurallar korunur: özel panelde yalnız çiğköfte hamuru stoktan düşer. Diğer malzemeler ürün maliyetine katılır. Yeni alış geçmiş satış maliyetini değiştirmez. İptal özgün stok hareketini geri alır.')

    story.append(PageBreak())
    p('APK ve canlı web kaydı', 'Heading2')
    p('Web: https://aesd-server.onrender.com/aesd/')
    p('Personel: https://aesd-server.onrender.com/aesd/staff.html')
    p('Render durumu: LIVE · Kontrol zamanı: ' + live['checkedAt'])
    p('Kaynak commit: ' + live['commit'], 'SmallReview')
    p('Dağıtım kimliği: ' + str(live.get('deployId', 'Kanıtta belirtilmedi')), 'SmallReview')
    p('Bu kaydı Render dağıtım aracı doğruladı. Üretimde gerçek satış veya HTTP kabul testi bu tur yapılmadı. Ücretsiz Render hizmeti uyuyabilir; sürekli açık kalma garantisi verilmez.')
    for item in apks:
        p(item['label'], 'Heading2')
        p(item['file'])
        p(f"{item['package']} · Sürüm kodu 151 · {item['bytes']:,} bayt")
        p('SHA-256: ' + item['sha256'][:32] + ' ' + item['sha256'][32:], 'SmallReview')
    p('Özgün sertifika, v1/v2/v3 imzaları, hizalama, native program eşitliği ve kaynak paketi eşitliği denetlendi. Bunlar APK çalıştırma veya Android kurulum testi değildir.')
    p('Sahip APK’sı com.oses.pos ve özgün sertifikayı korur. Mevcut uygulamayı silmeden üzerine güncelle. Müşteri APK’sı com.aesd.pos paketidir; yalnız lisanslı müşteri panellerini açar. Personel kendi web linkini kullanır.')
    p('Özel panel kaynak eşleşmesi: kanonik sunucu dönüşümü ile paketlenen kaynak aynı. Dönüşüm tekrar uygulandığında dosyayı değiştirmez. Geçmiş kullanıcı verileri bu ortamda incelenmedi; gerçek tablet güncellemesi ayrıca kabul edilmelidir.')

    story.append(PageBreak())
    p('Sistem şeması', 'Heading2')
    p('Şema, erişim ve satış akışını gösterir. Gerçek Android veya iPhone ekran görüntüsü değildir.')
    image('AESD-GUNCEL-KONTROL-SEMASI.png', 660)

    story.append(PageBreak())
    p('Temsili arayüz görünümü', 'Heading2')
    p('Bu görsel tasarımı anlatmak için üretildi. Gerçek tarayıcı ekran görüntüsü veya yerleşim testi kanıtı değildir. Ekrandaki kişi ve tutarlar örnektir.')
    image('AESD-GUNCEL-KONTROL-TEMSILI.png', 420)
    p('Senin panelin: Ayarlar → Personel ve Cihaz Onayı. Tek kullanımlık davet oluştur; personelin yeni cihazında görünen 6 haneli kodla onayla. Cihazı veya personelin bütün erişimini kapatabilirsin.')
    p('Personel paneli: günlük/aylık net ciro, ürünler, sepet ve Nakit/Kart/Diğer ödeme kaydı. Personelin stok düzenleme, lisans yönetimi ve geçmiş satış iptali yetkisi yoktur. Linkin iletilmesini izleyemeyiz; yeni cihaz giriş isteği görünür.')
    p('Personel satışı internet gerekir. Sahip özel paneli önceden alınmış geçerli imzalı izinle en fazla 24 saat yeni çevrimdışı satış saklayabilir. Bağlantı gelince aynı işlem kimliğiyle eşitler. Bekleyen kayıt varken uygulamayı veya tarayıcı verisini silme.')

    story.append(PageBreak())
    p('Açık kabul işleri ve sınırlar', 'Heading2')
    for value in [
        'Gerçek Android: uygulamayı kaldırmadan güncelleme, zorla kapatma, yeniden açma, ödeme, iptal, cari, stok ve native yedek paylaşımı bu tur çalıştırılmadı.',
        'Gerçek iPhone Safari: giriş, ödeme alanının görünmesi, cihaz onayı ve ana ekrandan çevrimdışı açılış bu tur çalıştırılmadı.',
        'Kamera, fiziksel barkod okuyucu, banka ödeme sağlayıcısı ve gerçek kullanıcı kayıtlarıyla güncelleme kabulü yapılmadı. Kart düğmesi dış POS ile alınan ödemeyi kaydeder.',
        'Yeni sunucu kodu üzerinde gerçek ağ PostgreSQL işlem testi bu tur yapılmadı. Yalıtılmış veritabanı ve işleyici testleri üretim ağı kontrolü değildir.',
        'Gerçek Gmail teslimatı bu tur tekrar sınanmadı. Önceki ayrı testte alıcı e-postanın geldiğini teyit etti. Kendi hesabında şifre yenileme ve giriş ayrı kabul işlemidir. SMS sağlayıcısı bağlı değil.',
        'Satın alınmış domain yok. Ücretsiz hizmet uyuyabilir. İlk giriş ve yetki alma internet ister. Personel internet olmadan yeni satış tamamlayamaz.',
        'Bekleyen satış yedeği şifreli değildir. Kuyruk yedeğini otomatik geri yükleme arayüzü yoktur. Ortak JSON kayıt sınırı 16 MB; sahip bekleyen satış sınırı 500 kayıttır.',
        'Doritos maliyeti için gerçek alış fiyatı gerekir. Eksik gerçek maliyet uydurulmadı. Yönetici şifresi personelle paylaşılmaz.',
    ]:
        p(value)
    p('English technical notes', 'Heading2')
    for value in [
        'The server reads the current account role from the database.',
        'The server runs access changes and sales in one queue.',
        'The application hides shop records after a confirmed access denial.',
        'An unreadable response does not cancel a pending sale.',
        'The application keeps the same sale ID when it checks the receipt.',
        'A repeat request does not create a second sale.',
        'A new purchase does not change a past sale cost.',
        'The APK check fails if a required local file is missing.',
        'The report separates a live deployment from an HTTP acceptance test.',
        'The tests use sample records. Physical device tests are not complete.',
    ]:
        p(value, 'SmallReview')
    p('ASD-STE100 kısa cümle, açık fiil ve tutarlı terim yazım ilkeleri teknik metinde kullanıldı. Bu ilkeler kodlama kuralları veya resmî sertifika değildir. Kusursuzluk iddiası yoktur.')

    def footer(canvas, doc):
        canvas.setFont('AESDReview', 8)
        canvas.setFillColor(HexColor('#78613d'))
        canvas.drawString(42, 23, 'AESD · Test kapsamı ve sınırları raporda belirtilmiştir')
        canvas.drawRightString(553, 23, str(doc.page))

    OUT.mkdir(exist_ok=True)
    temporary = PDF.with_suffix('.pending.pdf')
    SimpleDocTemplate(str(temporary), pagesize=(595, 842), leftMargin=42,
                      rightMargin=42, topMargin=36, bottomMargin=42,
                      title='AESD APK ve Web Son Kontrol Raporu').build(
                          story, onFirstPage=footer, onLaterPages=footer)
    temporary.replace(PDF)
    record = {
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'automaticTestsPassedThisRound': total,
        'groups': groups,
        'newBrowserScreenControlsPassed': 0,
        'nativeHttpStatus': 'blocked: local TCP listen EPERM',
        'nativeRecoveryStatus': 'aborted on this Node 24 test host: better-sqlite3 cleanup assertion; isolated recovery passed with node:sqlite',
        'realBrowserStatus': 'blocked: Chromium socket EPERM and SIGTRAP',
        'physicalAndroidTested': False,
        'physicalIphoneTested': False,
        'actualMailRetestedThisRound': False,
        'smsConnected': False,
        'liveCommit': live['commit'],
        'deployId': live.get('deployId'),
        'productionHttpTestedThisRound': False,
        'apkManifest': 'evidence/build.json',
        'apkFiles': [{key: item[key] for key in ('file', 'package', 'sha256', 'bytes')}
                     for item in apks],
        'report': str(PDF.relative_to(ROOT)),
        'reportBytes': PDF.stat().st_size,
        'reportSha256': digest(PDF),
        'illustrativeImageIsScreenshot': False,
        'writingCertificationClaim': False,
        'perfectionClaim': False,
    }
    (EV / 'full-review-report.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'testsPassed': total, 'report': record['report'],
                      'reportBytes': record['reportBytes'],
                      'reportSha256': record['reportSha256']}, indent=2))


if __name__ == '__main__':
    main()
