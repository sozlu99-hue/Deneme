# AESD 1.5.1 — yeni tasarım ve sahip erişimi

Sistem sahibi, mevcut sunucu hesabının e-posta ve şifresiyle Özel Panelim, Market, Restoran ve Kafe panellerini açar. Sahip APK giriş ekranından panel seçilebilir. Ayarlar ve dört kare menüsüyle tekrar şifre girmeden geçiş yapılır. Sahip hesabı APK içinde bulunmaz. Sunucu rolü ve imzalı izin doğrulanır. Beni Hatırla oturumu saklar; düz metin şifre saklanmaz. Mevcut kullanıcı hesabı ve parolası sıfırlanmaz.

Müşteri kendi işyerinin lisanslı panelini açar. Başka panel ayrı lisans ister. Müşteri APK'sında sahip özel paneli yoktur. Yeni kayıt CLIENT olur. Müşterinin satış özeti yalnız açık rızayla paylaşılır.

Beyaz zemin, kırmızı vurgu, ince SVG simgeleri ve açılır menü uygulandı. Market barkod araması, restoran/kafe adisyon kısayolları, kategori filtresi ve ürün fotoğrafı yükleme eklendi. Fotoğraflar cihazda küçük JPEG olarak saklanır; dış görüntü sunucusuna gönderilmez. Yeni gerçek paneller boş başlar. Rapor görsellerindeki kayıtlar yalnız test verisidir.

Sahibin Market/Restoran/Kafe verileri hesap ve panel bazında ayrı IndexedDB anahtarlarında saklanır. Özel panel önceki veritabanı ve teknik kayıt anahtarlarını kullanır. Yerel güvenlik şifresi korunur. Doğrulanmış merkezî sahip kimliği özel panelde ikinci giriş ihtiyacını kaldırır. Merkezî oturum veya lisans geçersizse işlemler durur. Çıkış özel panel çerçevesini kaldırır.

## Performans değişiklikleri

Özel panel çerçevesi Ayarlar geçişlerinde DOM içinde tutulur. Testte dönüş sırasında ek HTML isteği sayısı sıfırdır. Sepet eklemeleri yalnız sepet bölümünü günceller; katalog, arama odağı ve ödeme seçimi korunur. Satış geçmişi özetleri aynı değişmez durum için tekrar hesaplanmaz. Store, komutun yaptığı tam doğrulamayı ikinci kez yapmaz; işyeri/panel anahtarını ayrıca denetler. Yedek doğrulaması ve strict kalıcı kayıt korunur. Sahip izni yenileme veritabanını değiştirmez ve snapshot yazmaz; mevcut rol/oturum kontrolü sırada tekrar yapılır. Müşteri deneme başlangıcı ve lisans hareketleri kalıcı kaydedilir.

Tablet üzerinde hız ölçümü yapılmadı. Render hizmetinin soğuk başlangıç süresi bu turda ölçülmedi. Tarayıcı bulguları gerçek Android performans sonucu değildir.

## Sunucuya uygulanması

server/private-template.mjs mevcut özel HTML'ye küçük, tekrar uygulanabilir bir dönüşüm uygular ve sonucu süreçte önbelleğe alır. GitHub'daki özgün özel HTML bloğu korunur. Kanıt evidence/private-template-match.json dosyasındadır: özgün dosyanın Git blob kimliği doğrulandı; dönüşüm sonucu APK'nın HTML'siyle tam eşleşir. Yerel HTML dönüşümü zaten içerir; ikinci uygulama dosyayı değiştirmez. Özel HTML yanıtı yine yalnız doğrulanmış OWNER hesabına sunulur.

Yeni web/ui.js hem sunucu statik dosya listesine hem APK paketleme listesine eklendi. Statik dosyalar önbellek doğrulaması ister. config.json üretim API adresini ve mevcut açık imza anahtarını korur.

## Doğrulama ve sınırlar

Güncel ve yeniden çalıştırılmış sonuçlar validation.json içindedir. Otomatik testler, özel panel testleri, eski kurtarma testleri, native SQLite HTTP ve beş tarayıcı grubu ayrı sayılır. Native HTTP testi Android cihaz testi değildir.

Android emülatörü, adb veya bağlı Android cihazı bulunmadığından Android kurulum/güncelleme, çökme, yeniden açılış, kamera, fiziksel barkod okuyucu ve native yedek paylaşımı test edilmedi. Gerçek Gmail teslimatı önceki alıcı teyidiyle doğrulandı. Bu tur gerçek e-posta gönderilmedi; gerçek tablet şifre yenileme/giriş sonucu ayrı doğrulanmalıdır. SMS ve ödeme sağlayıcısı bağlı değil. Domain satın alınmadı. Çevrimdışı kapatma en fazla bir saat gecikebilir. JSON yedekler şifrelenmez. Yeni panellerde reçete düzenleme henüz sunulmaz.

## ASD-STE100 yazım ilkeleriyle teknik açıklama

The server checks the owner account before it grants access.
The owner uses one account for all four panels.
Each customer panel requires its own license.
Each panel stores its own sale records.
The application retains the private frame during navigation.
The application updates the basket without replacing the catalog.
The server does not write a snapshot for an owner lease.
New purchases do not change past sale costs.
The tests do not confirm operation on an Android tablet.

Kısa cümle, etken anlatım ve tutarlı teknik terimler kullanılır. Resmî ASD-STE100 uygunluk veya kusursuzluk sertifikası iddia edilmez.

Son görsel kontrolü: srcdoc çerçevesinin location.origin değeri null olur. Özel panel menüsü postMessage hedefinde artık window.parent.location.origin kullanır. Yeni tarayıcı testi özel panel içindeki gerçek menü düğmesine basıp ana menünün açıldığını doğrular.
