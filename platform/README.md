25 Ekim 1.13.1/231 kaynak: [yedek ekranından güvenli geri dönüş](docs/RESET-RETURN-1.13.1.md). Geri dönüş yalnız onay ekranını açar; gerçek sıfırlama otomatik çalışmaz. Canlı yayın ve imzalı APK ayrıca doğrulanır.

25 Ekim 1.13.0/230 yayın hazırlığı: sade stok/içindekiler ve eski sıfırlama düğmesinin güvenli ekrana yönlendirilmesi. Canlı dağıtım ve imzalı APK teslimi ayrıca doğrulanır. Gerçek sıfırlama otomatik çalışmaz; ana yönetici uygulamada güncel yedek, şifre ve SIFIRLA ile tamamlar.

Yerel geliştirme: [Sade stok ve ürün içeriği](docs/SIMPLE-INGREDIENTS-STOCK.md). Açık kullanıcı onayıyla uygulandı; canlı Web ve APK yayını henüz bu çalışma ile güncellenmedi.

25 Ekim 1.12.0/220 kaynak: [sade giriş ve güvenli yeni başlangıç](docs/SIMPLE-LOGIN-RESET-1.12.0.md). Kullanıcı yayını onayladı. Canlı Web ve özgün imzalı APK teslimi ayrıca doğrulanır; kaynak güncellemesi yayın kanıtı değildir. Gerçek veriyi sıfırlama.

25 Ekim 1.11.1/211: docs/SHOP-READINESS-1.11.1.md dosyasını oku. Ek hesapta geç gelen ana oturum için yerel İlk Kurulum yerine sunucu oturumu doğrulanır. Kayıt veya parola sıfırlanmaz. WebKit başlangıç kontrolü CI kapsamındadır; fiziksel iPhone testi değildir.

25 Ekim 1.11.0/210: Önce docs/SHOP-MANAGER-1.11.0.md dosyasını oku. Ek AESD hesabı yalnız özel dükkânı yönetir. Global OWNER yetkisi, lisans ve onay verilmez. E-posta doğrulaması ve ana yöneticinin cihaz onayı zorunlu. Gerçek erişimi ana yönetici uygulama içinden tanımlar; otomatik hesap yetkilendirme yok.

25 Ekim 1.10.0/200: Önce docs/SIMPLE-PANEL-1.10.0.md dosyasını oku. Son sade önizleme uygulanır. Hazır üründe adet/alış/satış tek formda; içindekiler yalnız hazırlanan üründedir. Mevcut kayıtları dönüştürme. İptal, yetki, maliyet anlık görüntüsü ve tekilleştirme kontrollerini koru.

25 Ekim 1.9.0/190: Önce docs/STOCK-WORKSPACE-1.9.0.md dosyasını oku. Stok–Ürün–Reçete çalışma alanı, atomik alış/sayım/fire ve açık gramaj/reçete kontrolü eklendi. Mevcut stok ve finansal kayıtlar otomatik dönüştürülmez. Destek aesdapps.tr@gmail.com. Canlı Web ve imzalı APK teslimini ayrı doğrula.

24 Ekim 1.8.1/181: Müşteri kartı yalnız alacak/tahsilat/borçlandırma gösterir. Önceki karşı borç kayıtları ayrıntıda korunur; yeni karşı borç ekleme düğmesi kaldırıldı. Adisyon düğmesi 68 px ve alt menüden ayrıdır. Özel panel yüksekliği gerçek başlık/menü ölçüsünden hesaplanır. Finansal kurallar ve geçmiş kayıtlar değişmedi.

24 Ekim: Web ve ortak APK kaynak 1.8.0/180. Önce [stok, reçete ve cari sürüm notlarını](docs/WORKFLOW-1.8.0-20261024.md) oku. Canlı Web ve imzalı APK teslimini ayrı doğrula. Eski ürünler yalnız hamur düşürür; tüm reçete düşümü ürün bazında açık seçim ister. Parçalı marul yeni parca stok kartıyla izlenir; mevcut adet kayıtları otomatik dönüştürülmez.

24 Ekim: Web ve ortak Android kaynak 1.7.0/170. Önce [yeni işyeri arayüzü](docs/WORKSPACE-1.7.0-20261024.md) notunu oku. Canlı dağıtım ve imzalı APK teslimini ayrı doğrula. Aşağıdaki önceki sürüm teslimleri tarihseldir.

22 Ekim: [AESD 1.6.4/164 APK teslimi doğrulandı](docs/APK-1.6.4-20261022.md). Özgün imza ve Drive’dan indirilen dosyanın SHA-256 eşleşmesi doğrulandı. Fiziksel cihaz ve gerçek sağlayıcı kabulü yapılmadı.

Current source: Web and unified Android 1.6.4/164. Read [compact stock and collections](docs/STOCK-COLLECTION-1.6.4-20261019.md). Verify live deployment and signed delivery separately. Earlier notes below are historical.

19 Ekim 1.6.1 kaynak turu: [Modül eksik analizi](docs/MODULE-GAP-1.6.1-20261019.md). PWA ikonları, Google kurtarma gizliliği, giriş kilidi ve özel panel hata metni düzeltildi. Sürüm 1.6.1 / 161. Özgün imza dosyası bu ortamda yok; imzalı Drive APK güncellemesi imza dosyaları bağlanınca yapılır. Fiziksel cihaz ve gerçek sağlayıcı testi yapılmadı. Önceki 1.6.0 teslimi: [Tek uygulama](docs/UNIFIED-1.6.0-20261018.md).

Güncel sahip paneli 1.5.8: [18 Ekim müşteri yönetimi](docs/OWNER-CONSOLE-1.5.8-20261018.md). Web 1.5.8 yayında. Özgün imzalı iki APK 1.5.8 / 158 Drive’dan indirilerek doğrulandı. Gerçek Android cihaz testi yapılmadı. CARİ ve Server müşteri uygulaması ayrı kalır.

APK 1.5.7 yayını tamamlandı: [17 Ekim Android notları](docs/APK-1.5.7-20261017.md). Sahip ve müşteri paketleri denetim düzeltmelerini içerir. Özgün imza, paket kaynakları ve Drive'dan indirilen dosyaların SHA-256 değerleri doğrulandı. Gerçek Android cihaz testi yapılmadı.

Güncel ikon 1.5.5: [Yeşil-beyaz Server ikonu](docs/ICON-1.5.5-20261017.md). Web ve sahip/müşteri APK kaynakları aynı onaylı görseli kullanır. CARİ ikonu değişmez.

Güncel Web 1.5.4: [17 Ekim web sürümü](docs/WEB-1.5.4-20261017.md). Ana ekrana ekleme eklendi. Sektör ciro özetleri Türkiye saatine sabitlendi. APK teslimi 1.5.3 olarak kalır.

Güncel 9 Ekim tam inceleme: [Web ve iki APK kontrolü](docs/FULL-REVIEW-20261009.md). Yeni yetki ve ödeme kaydı düzeltmeleri web ve iki APK kaynağına uygulanır. Güncel sonuçlar validation.json ve evidence/full-review-tests.json içindedir: 246 Node testi ve 15 APK paketleme testi geçti. Gerçek Android/iPhone ve yeni tarayıcı ekran kontrolleri tamamlanmadı. Native HTTP kontrolü bu ortamda engellendi; native SQLite kurtarma denemesi çökünce aynı 16 yalıtılmış test node:sqlite ile çalıştırıldı. APK imzası ve canlı yayın durumu evidence/build.json ile evidence/full-review-live.json içinde ayrı doğrulanır.

Önceki web personel erişimi yayını: [Personel ve cihaz onayı](docs/STAFF-DEVICE-APPROVAL.md). Kardeşin ayrı giriş kullanır. Her yeni cihaz senin onayını bekler. O yayında APK yeniden üretilmedi ve 127 + 61 = 188 test geçti. Bu sayılar güncel tam incelemenin yerine geçmez.

Önceki web ödeme alanı düzeltmesi: [9 Ekim web görünüm notları](docs/WEB-PAYMENT-LAYOUT-FIX.md). O turda düzeltme web görünümüne uygulandı; APK yeniden üretilmedi.

Önceki görsel ve panel dönüşü düzeltmesi: [9 Ekim düzeltme notları](docs/PRIVATE-PHOTO-NAV-FIX.md). Bu düzeltme web kaynaklarında uygulandı; önceki APK teslimi ayrı bir sürüm kanıtıdır.

Güncel menü ve özel panel çevrimdışı ödeme için [9 Ekim sürüm notlarını](docs/PRIVATE-MENU-OFFLINE-RELEASE.md) oku. Aşağıdaki ortak kayıt açıklamaları önceki sürümü anlatır; özel panel ödeme davranışını güncel belge belirler.

# AESD — Web ve tablet ortak kayıt

Ödeme sırasında “Geçmiş satışın tutarı veya maliyeti değiştirilemez” mesajı için PostgreSQL alan sırası düzeltmesi uygulandı. Ayrıntılar: [Ödeme düzeltmesi](docs/PAYMENT-JSONB-FIX.md).

Bu sürüm, aynı sahip hesabı ve panel için satış, stok ve cari kayıtlarını ortak PostgreSQL deposuna bağlar. Önce gerçek kayıtların bulunduğu tablette ilk aktarımı yap. Ayrıntılar: [Ortak kayıt kullanım ve test belgesi](docs/CLOUD-SYNC-RELEASE.md). Gerçek tablet verileri burada aktarılmış değildir.

# AESD — merkezi işyeri ve panel lisansı

Bu paket AESD 1.5.1 yeni tasarım ve sahip erişimi sürümüdür. Güncel değişiklikler docs/PANELS-REVIEW.md dosyasındadır. Yeni satış, yedek, lisans ve oturum düzeltmeleri docs/FINAL-REVIEW.md dosyasında açıklanır. Güncel test sonuçlarını validation.json dosyasından okuyun. Gerçek Android kabul testi tamamlanmadı; kusursuzluk veya üretime hazır sertifikası iddia edilmez. Sahip uygulamasını kaldırmadan güncelle; önce mümkünse yedek al.

Uygulama adı AESD. Destek: ozlusuat7@gmail.com. Sahip paketi com.oses.pos/151 ve özgün imza korunur. Müşteri paketi com.aesd.pos/151 olarak ayrıdır. Müşteri APK'sında özel panel kaynağı yoktur. Özel panelde önceki veritabanı ve kayıt anahtarları korunur; teknik anahtarların yeniden adlandırılması veri kaybına yol açabileceği için yapılmaz.

## Tamamlanan davranış

- İşyeri kaydı Market, Restoran veya Kafe panelini seçer. Yeni kullanıcı CLIENT olur ve sahip onayı bekler. Kayıt sahibi yetkisi vermez.
- Onaylanan işyeri ilk panel açılışında 24 saat deneme alır. Tarih sunucuda saklanır. Yeni kurulum, yeni cihaz ve başka panele geçiş denemeyi yenilemez. Yeni e-posta hesabı da sahip onayı olmadan deneme alamaz.
- Her panel ayrı satılır. Paketler 7 gün, 30 gün, 365 gün ve süresizdir. Ödeme sisteminin yerine satıcının manuel ödeme onayı kullanılır. Süre ilk aktivasyonda başlar.
- Sahip işyerini onaylar/askıya alır; panel lisansı verir, kapatır, açar, uzatır ve cihazını sıfırlar. Kod bir kez gösterilir. Cihaz değişimi lisans bitişini yenilemez. Süresiz lisans da kapatılabilir.
- Girişten sonra Satış açılır. Bugünün net cirosu, ayın net cirosu ve işlem sayısı öndedir. Diğer işlemler Ayarlar'dadır.
- Beni Hatırla oturumu 14 gün; normal oturum 8 saat geçerlidir. Şifre düz metin olarak saklanmaz. Oturum ve panel seçimi IndexedDB yazımı tamamlanınca onaylanır. Çıkış ve şifre yenileme önceki oturumu geçersiz kılar.
- Market ürün stokunu düşürür. Restoran ve Kafe malzeme reçetesini düşürür. Özel panel yalnız s1 çiğköfte hamurunu düşürür; diğer malzemeleri maliyete dahil eder. Yeni alış geçmiş satış maliyetini değiştirmez.
- İptal kayıtlı stok hareketlerini geri alır. Cari satış ve tahsilat ayrı tutulur. Yeni panellerin yedekleri işyeri/panel kimliğine bağlıdır. İlk aktarım yedeği korunur. Ortak kayıtların üzerine eski yedek yazılmaz.
- Restoran/Kafe adisyon veya sipariş kaydını tahsilata kadar stok düşürmeden saklar. Barkod arama alanı Enter ile satış sepetine ekler. Kamera desteklenmiyorsa uygulama USB/Bluetooth okuyucu veya elle giriş önerir.
- Satıcının müşteri cirosunu görmesi açık rızaya bağlıdır. Varsayılan kapalıdır. Yalnız günlük toplam, işlem sayısı, ödeme dağılımı ve iptal toplamı gönderilir. Kişi isimleri ve ürün listeleri lisans yönetim özetine dahil edilmez. Ayrıntılı kayıtlar ortak kayıt hizmetinde saklanır. Rıza kaldırılınca sunucudaki özetler silinir. Bu özet cihazın bildirdiği veridir; banka doğrulaması değildir.

## Güvenlik ve süre kontrolü

Sunucu rolü, hesabı, oturumu, işyerini, paneli ve cihazı yeniden kontrol eder. İmzalı geçici izin en fazla 1 saattir. Uygulama açık ve bağlantılıyken 45 saniyede bir izin yeniler. Kapatılmış lisans bu kontrolde reddedilir. İmzalı izin bulunsa da yeni ortak satış sunucu onayı gerektirir. Sunucu, askıya alınmış lisansla ortak işlem yapmayı reddeder.

Üretim sunucusunun açık anahtarı config.json/publicKey alanına sabitlendi. Yerel kayda yazılan başka bir açık anahtar güven kaynağı değildir. Lisans özel anahtarı veya JWT_SECRET APK’ya girmez. Çevrimdışı açılış yalnız imzalı ve süresi dolmamış izne bağlıdır; bu turda gerçek Android çevrimdışı açılışı test edilmedi.

Hesap ve lisans değişiklikleri kalıcı snapshot yazımını bekler. Ortak satış kayıtları doğrudan PostgreSQL işlemi içinde yazılır. Yazım başarısızsa 503 döner ve yeni işlemleri durdurur. Yetki ve deneme tarihleri istemcinin saatine dayanmaz. APK üzerinde değişiklik yapmayı fiziksel olarak imkânsız kılma iddiası yoktur. Yedek JSON dosyaları şifrelenmez; güvenli saklanmalıdır.

## Kaynaklar ve çalıştırma

- server/platform-core.mjs: işyeri, oturum, deneme, lisans, paylaşım ve denetim kaydı.
- server/install-platform.mjs: /aesd/v1 API ve korunan özel panel dosyası.
- web/: müşteri panelleri, kayıt/giriş ve sahip yönetimi.
- legacy/private-pos.html: korunan özel panel. Önceki satış ve maliyet çekirdeği korunur.
- parent-server/: mevcut GitHub sunucusu ve entegrasyon. Gmail, telefon ve kalıcı snapshot kodları korunur.
- tests/: yeni birim ve tarayıcı testleri. legacy-tests/: özel panel regresyonları.
- evidence/: bu turda üretilen kanıtlar. validation.json: güncel sonuçlar.

Node 24 veya üzeri kullanın. Önce parent-server/ klasöründe npm ci çalıştırın. Sonra proje kökünde npm install, npm test çalıştırın. Yerel test sunucusu için AESD_TEST_OWNER_PASSWORD belirleyip npm start çalıştırın. tests/browser.mjs içinde Chromium yolu kurulu sürüme göre ayarlanır. Tarayıcı testi yalnız örnek hesaplar ve yerel sunucu kullanır. Gerçek e-posta/SMS göndermez.

Üretim sunucusuna entegrasyonda server/, web/ ve legacy/ klasörleri mevcut sunucu kökünde platform/ altında bulunur. parent-server/index.js ve persistence.js değişiklikleri mevcut sunucuya uygulanır. package.json/package-lock.json mevcut sunucuya aittir ve çalışma komutu npm start olarak kalır. Mevcut OWNER hesabını veya şifresini yeniden oluşturmayın. JWT_SECRET kalıcı ve en az 32 karakter olmalı; DATABASE_URL ve mevcut snapshot sağlıklı olmalı. İlgili değerleri rapora veya APK'ya yazmayın.

## Domain

web/config.json/apiOrigin mevcut https://aesd-server.onrender.com adresini kullanır. Domain satın alınmadı. Domain alınınca DNS ve TLS hazırlanır; aynı sunucuya bağlanır, API adresi ve varsa OAuth dönüş adresleri güncellenir. APK yeniden paketlenir ve bağlantı testi yapılır. Domain sahibi ve OAuth yapılandırması doğrulanmadan çalışan kabul edilmez.

## Açık ve test edilmemiş işler

8 Ekim giriş düzeltmesi mevcut Render hizmetine dağıtıldı. /aesd/v1/health ve eski kurtarma sağlığı 200 döndü. Kalıcı snapshot sağlıklı. Android kabul testi bitmedi; satışa hazır sertifikalı sürüm iddiası yok. Ayrıntılar docs/AUTH-FIX.md ve validation.json içindedir.

Android emülatörü, adb, bağlı Android cihazı ve /dev/kvm yok. Gerçek kurulum/güncelleme, Android zorla kapatma, kamera, fiziksel barkod okuyucu, native dosya paylaşımı ve gerçek kullanıcı verileriyle güncelleme test edilmedi. Tarayıcı çökmesi Android testi değildir. Native better-sqlite3 ile HTTP giriş, şifre yenileme ve veritabanını yeniden açma kontrolü geçti. Diğer birim testleri Node SQLite kullanır.

Yeni müşteri ve sahip sunucu hesapları için kodla şifre yenileme bağlandı ve yalıtılmış sağlayıcıyla test edildi. Gmail HTTPS kod teslimatı kullanıcı teyidiyle doğrulandı. Kullanıcının kendi şifresini yenilemesi ayrıca doğrulanmalıdır. Önceki gönderim zaman aşımına uğradı; sağlayıcı seçimi düzeltildikten sonraki istek 200 döndü. SMS bağlı değil. Merkezî sahip girişi tüm panelleri açar. Özel panelin cihaz güvenlik şifresi ve eski kurtarma kodları korunur.

## ASD-STE100 ilkeleriyle İngilizce teknik özet

The server stores the trial dates for each business.
Each customer panel needs a separate license.
The owner uses one account for all four panels.
The server checks the account and device before it grants access.
The application saves the session before it reports success.
The application does not store a plain-text password.
New purchases do not change past sale costs.
The server deletes sales summaries when the user withdraws consent.
The tests use sample records.
The automated tests do not confirm Android operation or email delivery.
The recipient confirmed Gmail delivery in a separate test.
The production server now has the new API.

Kısa cümle, etken anlatım ve tutarlı teknik ad ilkeleri uygulanmıştır. Bu belge resmî ASD-STE100 uygunluk veya güvenlik sertifikası değildir.

## APK yeniden paketleme

input/AESD-v151-base.apk özgün imzalı tabandır. Mevcut kaynak web/ ve legacy/private-pos.html dosyalarındadır. Bu paket tam bir Android Gradle projesi içermez. build-apks.py taban APK'yı yeniden paketler. AESD_ANDROID_TOOLS ile Android araç yolunu, AESD_KEYSTORE ile özgün imza anahtarını, AESD_STOREPASS_FILE ile parola dosyasını belirt. Anahtar ve parola bu kaynak paketine dahil değildir. Özgün sertifika değişirse sahip uygulamasına veri koruyan güncelleme yapılamaz. Güncel kaynaklar üzerinde tarihsel yama betiklerini gereksiz yere çalıştırma.

8 Ekim son doğrulama: Gmail HTTPS kod isteği 200 döndü. Kullanıcı yeni kodun e-postaya ulaştığını açıkça teyit etti. Gerçek e-posta teslimatı doğrulandı. Kullanıcının kendi hesabında şifre yenilemesi ve giriş yapması ayrı sonuç olarak beklenir. Android cihaz üzerinde kabul testi yapılmadı.

## Son inceleme düzeltmeleri

Yeni kayıtta şifre sınırı 72 UTF-8 baytıdır. İlk aktivasyondan önce ödenen lisans günleri birikir. Yedekte stok hareketleri satış satırlarına, stok bakiyesi alış/satış geçmişine bağlıdır. Eski özel panel yedekleri değişmez. Yeni panellerde ürün reçetesi düzenlemesi henüz yoktur.

Sepet, adisyon ve ödeme seçimi panel değişiminde temizlenir. Ürün eklerken ödeme/cari seçimi korunur. Barkod alanı bir sonraki okutma için odağı tutar. Kesirli satışın sepet toplamı kayıtlı toplamla eşleşir. Eski oturum/panelden gelen yanıt kullanılmaz. Hatırlanan girişte APK rolü kontrol edilir.

npm run test:browser yerel örnek sunucusunu kendi geçici veritabanıyla başlatır ve durdurur. Eski panel testleri npm run test:private, native SQLite HTTP testi npm run test:native ile çalışır. Android çalıştırıldığı anlamına gelmez.

Sunucu bağımlılıkları nodemailer 10.0.16 ve proxy-addr 2.0.8 ile güncellendi. Son npm audit taramasında bilinen açık sayısı sıfırdır. Android native paketlerin tam bağımlılık taraması yapılmadı.
