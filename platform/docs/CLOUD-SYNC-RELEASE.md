Güncel menü ve özel panel çevrimdışı ödeme için [9 Ekim sürüm notlarını](PRIVATE-MENU-OFFLINE-RELEASE.md) oku. Aşağıdaki ortak kayıt açıklamaları önceki sürümü anlatır; özel panel ödeme davranışını güncel belge belirler.

# AESD ortak kayıt sürümü

Ödeme sırasında geçmiş satış değişikliği mesajı için [PostgreSQL ödeme düzeltmesi](PAYMENT-JSONB-FIX.md) belgesini oku. Düzeltme sunucudadır; mevcut APK korunur.

Web ve Android uygulaması aynı sunucu hesabı ve aynı panel için ortak kayıt kullanır. Sistem sahibi Özel Panelim, Market, Restoran ve Kafe panellerini aynı hesapla açar. Panellerin verileri birbirinden ayrıdır. Müşteri lisansı kendi işyerine, panele ve onaylanan cihaza bağlı kalır. Bu değişiklik ikinci müşteri cihazına otomatik lisans vermez.

## İlk kullanım

1. Gerçek kayıtların bulunduğu tablette AESD Sahip APK'sını mevcut uygulamanın üzerine yükle. Uygulamayı silme.
2. Mevcut hesabınla gir. Panelin ilk aktarım ekranındaki ürün, satış ve cari sayılarını kontrol et. Yerel aktarım yedeğini indir.
3. Bu cihazın kayıtlarını aktar. Her panel ayrı aktarılır. Farklı dolu sunucu kayıtları varsa aktarım durur. Yerel yedek korunur. Boş bir ilk web kaydı, henüz ortak işlem yapılmadıysa tablet aktarımını kabul eder.
4. iPhone Safari'de https://aesd-server.onrender.com/aesd/ adresini aç. Aynı sahip hesabı ve paneli kullan. Yeni cihazdaki farklı yerel kayıtları sunucuya sessizce ekleme; ortak sunucu kaydını seç.
5. İnternet bağlantısı açıkken bir deneme satışı yap. Diğer cihazda ciro ve stok durumunu kontrol et. Ekran yaklaşık 5 saniyede bir değişiklikleri kontrol eder. Safari'deki Paylaş → Ana Ekrana Ekle bir web kısayolu oluşturur.

Gerçek tablet kayıtları bu çalışma ortamında bulunmuyor. Bu nedenle kullanıcının gerçek verilerinin ilk aktarımı yapılmış olarak raporlanmaz. APK ve web sitesi, aktarım akışını içerir.

## Kayıt ve hata davranışı

PostgreSQL, panel verisi ve işlem makbuzunu aynı işlem içinde yazar. Sunucu stok ve tutarları kontrol eder. Yeni Market/Restoran/Kafe işlemlerini sunucu hesaplar. Özel panel uyum katmanı kayıt sürümünü, satış tutarını, hamur hareketini ve maliyetini doğrular. Eski sürüme göre özel panel değişikliği yapılırsa 409 yanıtı gelir; kullanıcı güncel kaydı kontrol eder ve yeniden dener.

İşlem kimliği istekten önce IndexedDB'ye yazılır. Ağ yanıtı kaybolursa uygulama aynı kimliği sorgular. Tekrar gönderme ikinci satış veya tahsilat oluşturmaz. Uygulama sunucu onayından önce başarı göstermez. Tarayıcı çevrimdışı olduğunu bildirirse yeni ortak işlem gönderilmez. Uçuşta bağlantısı kesilen istek, sonuç belirsizliği çözülene kadar bekleyen işlem olarak tutulur. Bu özellik çok cihazlı çevrimdışı satış sistemi değildir.

Ürün araması, ödeme seçimi ve sepet eşitleme sırasında korunur. Yeni özel panel satışında yalnız s1 hamur stoku düşer. Diğer malzemeler maliyete katılır. Yeni alış geçmiş satışın maliyetini değiştirmez. İptal kayıtlı hareketi geri alır. Eski yedek veya veri sıfırlama, yeni ortak kaydı cihazdan silemez. Aktarım öncesi yedek aynı cihazın IndexedDB kaydında da tutulur. Tarayıcı verilerinin silinmesi bu yerel kopyayı siler; dosya yedeğini ayrıca güvenli sakla.

## Yetki ve görünürlük

Sunucu her istekte hesabı, oturumu, işyerini, paneli ve cihaz lisansını kontrol eder. OWNER lisans hesabı, müşteri ayrıntılı kayıtlarını bu API ile okuyamaz. Müşteri satış, stok ve cari kayıtları ortak kayıt hizmetinde saklanır. Lisans yöneticisi yalnız müşteri açıkça izin verirse günlük ciro özetini görür. Kayıt ve veri paylaşımı ekranı bu farkı açıklar. Parolalar ve özel panelin yerel güvenlik kaydı bulut mali verisine eklenmez. Özel panelin iptal ve kasa gibi yönetici doğrulamaları, merkezdeki sahip şifresini kontrol eder. Yerel güvenlik kaydı korunur ve başka cihaza şifre özeti kopyalanmaz. Mevcut Gmail bağlantısı değiştirilmedi. Bu tur gerçek Gmail gönderimi yapılmadı.

## Sınırlar

- Ücretsiz Render hizmeti uyuyabilir. Kalıcı PostgreSQL kaydı hizmet uykusundan ayrı tutulur. Ücretli plana veya satın alınmış domaine geçilmedi.
- Gerçek Android/iPhone cihazı ve Android emülatörü bağlı değildir. Tarayıcı otomasyonu fiziksel cihaz kabul testi değildir.
- Panel belgesi en fazla 16 MB olabilir. İşlem kimlikleri kalıcı tutulur. Büyük defterler için kayıt bazında depolama ve performans çalışması gerekir.
- Şifrelenmemiş JSON yedeğini güvenli sakla. Günlük işletme yedek planı ve gerçek tablet kabul testi tamamlanmalıdır.
- SMS ve ödeme sağlayıcısı bağlı değildir. Denemeler yalıtılmış e-posta sağlayıcılarını kullanır.

## ASD-STE100 yazım ilkeleriyle teknik özet

The server stores each panel in Postgres. The server checks the account and license for each request. Each operation has one permanent ID. The server writes the panel and receipt in one transaction. The client reports success after the server confirms the write. A repeated request does not create a second sale. A new purchase does not change a past sale cost. An old backup cannot replace a newer shared record. The tests use separate browser sessions and an isolated Postgres database. Physical Android and iPhone tests are not complete.

Kısa cümle ve tutarlı terim kullanıldı. Resmî ASD-STE100 uygunluk sertifikası iddia edilmez.
