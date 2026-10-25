25 Ekim 1.13.1/231 kaynak: [yedek ekranından güvenli geri dönüş](docs/RESET-RETURN-1.13.1.md). Geri dönüş yalnız onay ekranını açar; gerçek sıfırlama otomatik çalışmaz. Canlı yayın ve imzalı APK ayrıca doğrulanır.

25 Ekim 1.13.0/230 yayın hazırlığı: sade stok/içindekiler ve eski sıfırlama düğmesinin güvenli ekrana yönlendirilmesi. Canlı dağıtım ve imzalı APK teslimi ayrıca doğrulanır. Gerçek sıfırlama otomatik çalışmaz; ana yönetici uygulamada güncel yedek, şifre ve SIFIRLA ile tamamlar.

25 Ekim yerel çalışma: [Sade stok ve ürün içeriği](docs/SIMPLE-INGREDIENTS-STOCK.md). Kullanıcı Başla dedi; sekiz menü için açık içerik bağlantısı, satışa özel çıkarma, kasa/adet marul ve kg sebze/hamur girişi uygulandı. Üretim kaydı dönüştürülmedi. Bu yerel düzeltme henüz commit/push/yayın değildir; 1.12.0 canlı teslimi aşağıdaki tarihsel kayıtta korunur. Test kanıtları /workspace/aesd-server-simple-stock-results içinde.

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

19 Ekim 1.6.1: önce [Modül eksik analizi](docs/MODULE-GAP-1.6.1-20261019.md) oku. Kaynak 1.6.1/161 PWA ikonları ve erişim sertleştirmesini içerir. İmzalı APK üretimi özgün keystore ister; bu ortamda keystore yok. İmzalanmamış paket yükleme. Önceki 1.6.0 teslimi: [Tek AESD uygulaması](docs/UNIFIED-1.6.0-20261018.md). Kanıt: evidence/unified-delivery.json.

18 Ekim sahip paneli: önce docs/OWNER-CONSOLE-1.5.8-20261018.md dosyasını oku. Yönetim arayüzü web/owner-console.js ve owner-console.css içindedir. Bu modül yalnız OWNER rolünde yüklenir. Müşteri APK’sına girmez. Sonucu belirsiz yönetim isteği tekrar gönderilmez; sessionStorage işaretini ve geçmiş kontrolünü koru.

Güncel menü ve özel panel çevrimdışı ödeme için [9 Ekim sürüm notlarını](docs/PRIVATE-MENU-OFFLINE-RELEASE.md) oku. Aşağıdaki ortak kayıt açıklamaları önceki sürümü anlatır; özel panel ödeme davranışını güncel belge belirler.

# Ortak kayıt devir notu — 8 Ekim 2026

Yeni akış için önce docs/CLOUD-SYNC-RELEASE.md ve validation.json dosyalarını oku. server/cloud-core.mjs yetki, ilk aktarım ve işlem kimliğini; server/cloud-repository.mjs PostgreSQL kilidi ve atomik yazımı; web/cloud-store.js kalıcı bekleyen işlem ve yerel yedeği yönetir. Özel panel uyumu server/private-template.mjs, server/private-engine.mjs ve web/private-cloud.js içindedir. Özel HTML büyük olduğu için metin aramasını sınırlı tut. Kaynak ve APK aynı dönüşümü kullanır.

Canlı hizmet ücretsiz Render planında kalır. Kullanıcı verisini silme, OWNER şifresini değiştirme veya ücretli servis açma. Gerçek tablet/iPhone testi ve kullanıcının ilk aktarımı ayrı kabul işlemleridir.

# AESD geliştirme devri

Önce README.md, validation.json ve evidence/ dosyalarını oku. Geçmiş rapor sayıları bu teslimin sonuçları değildir.

Kullanıcı geliştirmenin başlamasını açıkça onayladı. Markanın tamamı AESD. Destek ozlusuat7@gmail.com. Gizli müşteri ciro izlemesi uygulanmaz; açık ve isteğe bağlı rıza zorunludur.

Sahip APK com.oses.pos/151 ve önceki sertifikayı korur. Müşteri APK com.aesd.pos/151; private-pos.html müşteri paketine girmez. Mevcut kullanıcı verilerini veya parolalarını sıfırlama. Eski IndexedDB/localStorage anahtarlarını yeniden adlandırma.

Eski özel panel ürünleri yalnız hamuru stoktan düşürür. Kullanıcının onayladığı 1.8.0 modelinde recipeStock=true olan ürünler tüm reçete malzemelerini sunucu onayıyla düşürür. Diğer ürünlerde eski davranış korunur. Market, Restoran ve Kafe stok kuralları ayrıdır. Satış maliyeti anlık görüntüdür; yeni alış geçmiş maliyeti değiştiremez.

Merkezî API kalıcı deneme tarihleri, işyeri onayı, bağımsız panel lisansları, haftalık/aylık/yıllık/süresiz paketler, cihaz bağlama, askıya alma, uzatma ve rızaya bağlı özet içerir. Oturumlar şifre değişikliğinden sonra geçersiz olur. Lisans izni en fazla 1 saat; bağlantılı uygulama 45 saniyede yeniler.

Bulunan yeni hata: Chromium çökünce son panel seçimi eski değere dönebiliyordu. Oturum, cihaz ve panel seçimi strict IndexedDB işlemiyle kaydedildi. Güncel tarayıcı testi çökmeden sonra aynı hesabı/paneli tekrar giriş istemeden açar ve satış kaydını doğrular.

8 Ekim giriş düzeltmesi dağıtıldı. Ana dal commit: f28253d05f9801e9663e5fb79619c71c97461989. Önceki taban: 90f936969e82d8dcae116c2f19338f5b7833edb7. Canlı API ve eski kurtarma sağlığı 200, kalıcı snapshot sağlıklı. config.json üretim açık anahtarını içerir. WebView localhost kökeni API adresi olarak seçilmez; her zaman yapılandırılmış Render adresi kullanılır. Yerel dev-server kendi test config yanıtını verir. Giriş yanıtı doğrulaması ve per-account şifre yenileme eklendi. docs/AUTH-FIX.md dosyasını oku.

JWT_SECRET, OWNER_PASSWORD, e-posta yetkileri, veritabanı URL'si ve APK imza anahtarı kaynaklara, APK'ya veya rapora yazılmaz. Var olan OWNER hesabını koru. Sunucu sırrını gereksiz yere döndürme.

Android, SMS, kamera ve fiziksel barkod okuyucu başarılı olarak raporlanmaz. Gmail kod teslimatı alıcının teyidiyle doğrulandı. Yeni müşteri şifre kurtarması bağlıdır; kullanıcı şifre yenilemesi ve giriş sonucu ayrı doğrulanır. İngilizce teknik metinlerde ASD-STE100 yazım ilkelerini kullan; sertifika iddia etme.

8 Ekim son doğrulama: Gmail HTTPS kod isteği 200 döndü. Kullanıcı yeni kodun e-postaya ulaştığını açıkça teyit etti. Gerçek e-posta teslimatı doğrulandı. Kullanıcının kendi hesabında şifre yenilemesi ve giriş yapması ayrı sonuç olarak beklenir. Android cihaz üzerinde kabul testi yapılmadı.

Son inceleme commit: 177b580c10c1a11f8aa80fccb7db3b3d9068b5a5. Önceki sürüm f28253d05f9801e9663e5fb79619c71c97461989. Yeni düzeltmeler docs/FINAL-REVIEW.md içindedir. Lisans tablosuna activation_days eklendi; mevcut lisansların süreleri taşınır. Yeni müşteri paneli yedek denetimi web/backup-validation.js dosyasındadır; APK ve sunucu bu dosyayı birlikte içermelidir. Yeni panel reçeteleri şu an değiştirilemez; ileride reçete düzenlemesi için geçmiş reçete sürümü gerekir. Özel panelin biçimi değişmez. Testleri npm test, npm run test:private, npm run test:native ve npm run test:browser ile çalıştırın. Test sonuçları validation.json dosyasındadır.

Sunucu bağımlılık düzeltme commit: 14313b710e88b564f87c656098083b13d5d40d03. nodemailer 10.0.16 ESM aktarımı ve proxy-addr 2.0.8 override kullanılır. npm audit bilinen açık sayısı sıfırdır; kapsam sunucu JavaScript bağımlılıklarıdır. SMTP adaptörü named createTransport işlevini kullanır. Gmail HTTPS ayarları ve hesaplar değişmedi. Son sonuçlar validation.json ve docs/FINAL-REVIEW.md içindedir.

Yeni tasarım ve sahip erişimi: docs/PANELS-REVIEW.md dosyasını oku. Sahip mevcut sunucu hesabıyla dört paneli açar. OWNER hesabını veya eski cihaz güvenlik şifresini sıfırlama. ownerPanel tercihi yalnız arayüz seçimidir; sunucu rolü ve imzalı izin yetkiyi belirler. web/ui.js hem sunucu hem APK listesinde olmalıdır. server/private-template.mjs özgün özel HTML bloğunu dönüştürür; tekrar uygulama güvenlidir. evidence/private-template-match.json APK ve sunucu dönüşüm eşliğini doğrular. Güncel test sayıları yalnız validation.json dosyasından alınır.
