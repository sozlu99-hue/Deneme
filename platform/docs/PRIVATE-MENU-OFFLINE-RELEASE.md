# AESD · Yeni menü ve çevrimdışı özel satış

Sürüm: 1.5.1. Sahip paketi: com.oses.pos. Sürüm kodu: 151. İmza sertifikası korunur. Ana marka AESD'dir. Bu menü ve çevrimdışı ödeme özelliği sistem sahibinin Özel Panelim bölümündedir. Müşteri APK'sı özel panel HTML dosyasını içermez. Market, restoran ve kafe işlemleri kendi ayrı kayıtlarını kullanır ve yeni işlem için sunucu bağlantısı ister.

## Ürünler

| Ürün | Hamur | Satış fiyatı |
|---|---:|---:|
| Çiğköfte Dürüm | 100 gr | 100 TL |
| Doritoslu Dürüm | 100 gr | 130 TL |
| Mega Dürüm | 150 gr | 150 TL |
| Doritoslu Mega Dürüm | 150 gr | 180 TL |
| Küçük Paket | 300 gr | 230 TL |
| Orta Paket | 500 gr | 370 TL |
| Büyük Paket | 750 gr | 630 TL |
| Aile Boyu Paket | 1000 gr | 680 TL |

Fiyat geçişi yalnız bir kez uygulanır. Sonraki yönetici fiyat değişikliği korunur. Diğer ürünler, satış geçmişi, stok miktarları ve yerel şifre kaydı silinmez. İlgili ürün adları ve kimlikleriyle mevcut kayıtlar güncellenir. Aile paketinin eski satış miktarı kayıtlı satışın içinde kalır; yeni ürün 1000 gr'dır.

Sarı-kırmızı özel panel, ortak bir fotoğraf dosyası kullanır. Fotoğraflar sağlanan menünün ürün türlerine göre üretilmiş temsili görsellerdir. Gerçek ürünün birebir fotoğrafı oldukları iddia edilmez. Büyük gömülü fotoğraf kodu HTML dosyasından çıkarıldı. Yeni HTML yaklaşık 2,7 MB; önceki dosya yaklaşık 5,9 MB'tı. Gerçek cihaz açılış süresi ölçülmedi.

## Maliyet ve stok

Yalnız s1 çiğköfte hamuru stoktan düşer. Reçetedeki diğer malzemeler maliyete katılır. Doritoslu ürünlere bir Doritos porsiyonu eklendi. Gerçek alış maliyeti verilmediği için alış fiyatı uydurulmadı. Stok ve Alış / Ürün Maliyeti bölümünden gerçek porsiyon maliyetini gir. Eksik maliyetli ürünlerde kâr hesabı tam sayı olarak gösterilmez; eksik maliyet uyarısı korunur.

Her satış kendi tutarını, ödeme dağılımını, hamur kullanımını ve o andaki maliyet ayrıntısını saklar. Başka cihazdaki sonraki alış, bekleyen satışın maliyetini değiştiremez. İptal özgün satışın kayıtlı hamur hareketini geri alır.

## Çevrimdışı ödeme

1. Mevcut uygulamayı silmeden yeni APK'yı üzerine yükle. Mevcut sahip hesabıyla giriş yap. Yeniden açılış için Beni Hatırla'yı kullan.
2. Özel Panelim'i internet açıkken aç. Ortak kayıt ve sunucu imzalı çevrimdışı izin bu cihazda saklanır. İlk giriş internet ister. Sahibin yeni çevrimdışı satış izni en fazla 24 saattir; oturumun kendisi de geçerli olmalıdır.
3. Bağlantı kesilince satış yap. Ödeme cihazda kalıcı IndexedDB işlemine yazılmadan başarı gösterilmez. Durum satırı bekleyen ödeme sayısını gösterir. Satış cihazın cirosuna hemen dahil olur.
4. İnternet gelince bekleyen satışlar sırayla gönderilir. Sunucu her satış için aynı kalıcı işlem kimliğini kontrol eder. Kaybolan başarı yanıtı veya tekrar gönderim ikinci satış oluşturmaz. Diğer cihaz sunucuya kaydedilmiş satışları yaklaşık 5 saniyede alır.
5. Durum satırına dokunarak bekleyen kayıtları, hata ve stok/kasa uyarılarını aç. Bekleyen Kayıtları Yedekle tam kuyruk ve imzalı kaynak kayıtlarını JSON dosyasında saklar. Bu dosya için otomatik geri yükleme arayüzü bu sürümde yoktur; kontrollü destek kurtarması gerekir.

İzin bitince yeni çevrimdışı ödeme durur. Önceden tamamlanmış bekleyen kayıt silinmez. Geçerli bir oturumla yeniden bağlanınca, eski izin içinde alınmış satış daha sonra da gönderilebilir. Hesap yetkisi reddedilirse kayıt cihazda kalır; yetki sorunu çözülmelidir. Bekleyen satış varken alış, iptal ve yönetim değişikliği için önce eşitleme tamamlanır.

İki cihaz çevrimdışıyken aynı son hamuru satabilir. İki alınmış ödeme kaydı da korunur. Fiziksel stok sıfırın altına gösterilmez; eksik hamur ayrı stok farkı olarak kaydedilir. Ekran uyarı verir. Sonraki hamur girişi önce bu farkı kapatır. Sonradan kapanmış kasaya bağlı satış, özgün kasa kaydıyla korunur ve uyarı verir. Uyarıları işletme kayıtlarıyla karşılaştır.

Kart seçeneği, harici POS ile alınan ödemenin kaydıdır. Bu uygulamada banka ödeme sağlayıcısı bağlı değildir. SMS sağlayıcısı da bağlı değildir.

## Web ve veri koruması

Web adresi: https://aesd-server.onrender.com/aesd/ . Aynı sahip hesabı ve Özel Panelim, Android ve web için aynı sunucu kaydını kullanır. Bekleyen çevrimdışı satış diğer cihazda ancak eşitlemeden sonra görünür. Safari ana ekran kısayolu kullanılabilir. Web dosyaları Service Worker önbelleğine, yetkili özel panel HTML dosyası hesap kapsamlı cihaz kaydına alınır. Önceden açılmamış ekran internet olmadan açılamaz. Yeni web önbelleği ve gerçek Safari çevrimdışı açılışı bu tur doğrulanmadı.

Uygulamayı kaldırma, tarayıcı verisini silme veya bekleyen kayıt varken cihazı sıfırlama; bunlar cihazda kalan satış kuyruğunu silebilir. JSON yedekleri şifreli değildir. Sunucuya gitmeyen kayıt için cihaz ve dış dosya yedeği önemlidir. Ücretsiz Render hizmeti uyuyabilir; bağlantı geri geldiğinde eşitleme hizmetin açılmasını bekleyebilir. Ücretli hizmet veya domain satın alınmadı.

Kullanıcı daha önce web/tablet ortak görünümünü doğruladı. Gerçek kullanıcı defteri bu çalışma ortamında incelenmedi. Mevcut sunucu kaydına eski bir yedek yazılmaz. İlk aktarım mekanizması ve yerel aktarım yedeği korunur. Lisans yöneticisi müşteri ayrıntılı defterini bu API ile okuyamaz; günlük özet paylaşımı müşterinin iznine bağlıdır.

## Doğrulama sınırları

Otomatik test sonuçları validation.json ve PDF raporundadır. Bu tur yeni tarayıcı ekran kontrolleri, gerçek Android/iPhone, emülatör, fiziksel barkod/kamera, gerçek native yedek paylaşımı ve işletme yedeğinden geri yükleme doğrulanmadı. Chromium başlatma ortamın ağ kısıtlamasıyla engellendi. Önceki 92 tarayıcı kontrolü ve PostgreSQL kanıtı eski sürüm arşividir; yeni sürüm sonucu sayılmaz. Bu tur gerçek Gmail gönderimi yapılmadı. Önceki gerçek teslimatı kullanıcı doğrulamıştı.

## Technical notes

The owner panel saves a paid sale on the device first. The device reports success only after the local transaction ends. The server checks a signed copy of the last shared record. Each sale has one permanent operation ID. The server adds the sale, dough use and payment record in one transaction. A repeat request does not create a second sale. A new purchase does not change the saved sale cost. The device keeps queued sales until the server confirms them. The tests do not confirm use on a physical Android or iPhone device.

ASD-STE100 yazım ilkeleri kullanıldı. Resmî uygunluk, sertifika veya kusursuzluk iddiası yoktur.
