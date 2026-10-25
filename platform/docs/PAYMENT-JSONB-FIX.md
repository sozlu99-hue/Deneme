# Ödeme doğrulaması — PostgreSQL alan sırası düzeltmesi

Kullanıcının bildirdiği mesaj: “Geçmiş satışın tutarı veya maliyeti değiştirilemez.”

İlk özel panel satışı kaydedildikten sonra ikinci ödeme bu mesajla reddediliyordu. PostgreSQL JSONB, nesne alanlarının yazım sırasını korumaz. Sunucu eski ve yeni kaydı JSON metni olarak karşılaştırdığı için değişmeyen geçmiş satışı değişmiş sayıyordu. Aynı sorun yeniden açılış ve aynı kayıtların tekrar aktarılması sırasında da oluşabilirdi.

Sunucu artık JSON içeriğini karşılaştırır. Nesne alanlarının sırası önemsizdir. Dizi sırası, tutar, ödeme satırı, ürün ve maliyet ayrıntıları aynı kalmalıdır. Gerçek değişiklikler reddedilir. İşlem kimliği, istek parmak izi, kayıt sürümü ve atomik yazım kuralları korunur. Kullanıcının kayıtlarını, şifresini veya stok bakiyesini değiştiren bir veri taşıma işlemi yapılmadı.

## Doğrulama

- Düzeltme öncesi gerçek, yalıtılmış PostgreSQL 17 testinde ikinci 150 TL ödeme aynı mesajla reddedildi. Kanıt: evidence/payment-postgres-before.tap.
- Düzeltme sonrası Nakit 150 TL, Kart 150 TL ve yeniden açılan ikinci cihaz oturumunda Nakit 50 TL + Kart 100 TL ödemeleri geçti. Üç satış, her satışta bir hamur düşümü ve korunmuş geçmiş maliyetler kontrol edildi.
- Geçmiş satışın tutarı, maliyeti, ürün adı, ödeme yöntemi veya maliyet ayrıntısı değiştirildiğinde işlem reddedildi. Kayıt sürümü ve stok aynı kaldı; işlem makbuzu oluşmadı.
- Alan sırası değişmiş aynı dolu kaydın aktarımı kayıtları değiştirmeden kabul edildi. Farklı dolu kayıtların aktarımı hâlâ reddedilir.

Bu turdaki sonuçlar: 79 platform testi, 61 özel panel testi, 7 gerçek PostgreSQL testi ve 1 native SQLite HTTP testi. Önceki 16 kurtarma testi ve 92 Chromium kontrolü bu ödeme düzeltmesi turunda yeniden çalıştırılmadı. Fiziksel iPhone veya Android testi yapılmadı. Kullanıcının gerçek ödeme isteğinin kimliği bu ortamda bulunmuyor; canlı defterde o isteğe ait kayıt incelemesi yapılmış değildir.

## Kullanım

Düzeltme yalnız sunucudadır. Mevcut APK değişmez. Ödeme penceresini kapat, web sayfasını yenile ve ortak kaydın güncel olduğunu kontrol et. Yeniden ödeme almadan önce satış geçmişini kontrol et. Daha önce tamamlanmış bir satış için ikinci ödeme kaydı oluşturma. Yenileme kaydedilmemiş sepeti temizleyebilir.

## English technical note

Postgres can change the order of object fields. The previous check compared JSON text. It rejected an unchanged past sale. The new check compares the stored values. It retains array order and rejects changes to past sale amounts and costs. The fix does not change customer records. The tests use an isolated database. They do not confirm operation on a physical iPhone or Android device.

ASD-STE100 yazım ilkeleri kullanıldı. Resmî uygunluk sertifikası iddia edilmez.
