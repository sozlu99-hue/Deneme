# AESD 1.7.0 — Yeni işyeri arayüzü

24 Ekim 2026. Temel kaynak: `437400eee316aa8001f11bf228ad88468c8a6119`.

Yeni tasarım gerçek uygulamanın mevcut yetkili işlemlerine bağlanır. Önizleme dosyaları, örnek fiyatlar ve sahte işlem kontrolleri kaynak paketine alınmaz. CARİ değiştirilmez.

## Kullanıcı davranışı

- Masaüstünde yan menü; telefonda Satış, Stok, Cari, Raporlar ve Ayarlar alt menüsü.
- Özgün yeşil Server kimliği ve ürün görselleri korunur. Market ürünlerinin kullanıcının seçtiği fotoğrafları değişmez.
- Yeni ayar kartları hesap, güvenlik, oturum, görünüm, panel, yedek, eşitleme, geçmiş, lisans, donanım, sağlayıcı, destek ve personel işlemlerine açılır. Mevcut sahip yönetim konsolu ayrı kalır.
- Hesap alt ekranları mevcut yetkili API'yi kullanır. Yeni parola, oturum veya yetki mekanizması icat edilmez. Normal/büyük yazı tercihi hesap başına saklanır.
- Ödeme özetinde kayıtlı ürün tutarı, ödeme dağılımı, cari ve nakit para üstü görünür. Nakit eksikse onay verilmez. Parçalı toplam kuruş düzeyinde eşleşir. Veresiye için geçerli cari gerekir.
- Özel panelin ödeme özeti de mevcut güvenli `checkout` işlemini kullanır. Yerel kalıcılık ve sunucu ACK kontrolleri korunur. Yanıt kaybında eski işlem kimliği ile sonuç doğrulanır.
- Ürün iadesi, mal kabul, sayım ve fire, yazım öncesinde tutar ve stok etkisini gösterir. Doğrulama mevcut saf komut çekirdeğinde yapılır. Sunucu işlemi tekrar kontrol eder. İnceleme sonrasında panel veya revizyon değişirse eski özet onaylanmaz.
- Stok ayrıntısı miktar/birim, maliyet ve mevcut hareketlerden türetilen son 100 kaydı gösterir. Depo sevk/teslim işlemleri ayrı bölümde kalır.
- Masa ve mutfak ekranları mevcut adisyon kayıtlarını kullanır. Mutfağın servis durumunu değiştirmek, ödenmemiş adisyonu kapatmaz ve satış stoku düşürmez.

## Veri ve güvenlik

Veritabanı şeması, mevcut kayıt anahtarları, kimlikler, şifreler, lisanslar, cihaz bağları ve imzalı izinler değiştirilmez. Geçmiş satış tutarları ve maliyetleri yeniden yazılmaz. Eski finansal/izin çekirdek dosyalarının özetleri doğrulanır. Yeni dosyalar Web sunucusu, servis çalışanı ve APK dosya listelerine birlikte eklenir. Özel HTML yalnız OWNER yetkili isteğinden sonra alınır.

Eşzamanlı bir oturum reddi sırasında geciken çıkış yanıtının yeni girişi temizlememesi için çıkış akışına dönem/oturum kimliği kontrolü eklenir. Geç tamamlanan eski özel/ortak panel başlatması, yeni hesaba ait API oturumunu veya aktarım penceresini kullanamaz; istek ve aktarım geri çağrıları başladıkları oturum dönemine bağlanır.

Yayın taramasında bulunan `body-parser` yüksek düzey sıkıştırılmış istek DoS açığı 2.4.0 ile; `nodemailer` adres ayrıştırma açıkları 10.2.1 ile giderilir. Mevcut posta erişim kısıtları ve yalıtılmış kurtarma testleri korunur.

## Doğrulama

Node, eski özel panel, SQLite HTTP, ayrı yerel PostgreSQL, bütün tarayıcı grupları ve APK paketleme kontrolleri çalıştırılır. Ayrıntılı son sayılar doğrulama raporuna yazılır. CI yeni arayüz/tarayıcı/paketleme işini de çalıştırır. Paylaşılan CI kanıtı yalnız test adı, durum ve sayılardan oluşur; ekran görüntüsü, oturum kaydı, ham finansal fixture veya sunucu günlüğü yüklenmez.

Ortak APK `com.oses.pos`, sürüm 1.7.0/kod 170 olarak hazırlanır. Yalnız bilinen özgün 1.5.1/151 veya imzası doğrulanmış önceki 1.6.4/164 tabanı kabul edilir. Yeni kod tabandan büyük olmalıdır. Özgün sertifika, native program baytları, WebView kökeni ve ZIP hizalaması ayrıca doğrulanır. Emekli müşteri APK dosyası değiştirilmez. Web'in canlı olması ile APK'nın imzalanıp Drive'dan geri doğrulanması ayrı kanıtlardır.

## Kabul sınırı

Fiziksel Android/iPhone, kamera, yazıcı, ÖKC, e-Fatura ve gerçek ödeme sağlayıcısı kabulü yapılmadı. Kart seçimi karttan para çekmez. Hazırlanmış gıdanın stoka geri eklenmesi açık seçim gerektirir. Yeni tasarım donanımı veya sağlayıcı hesabını kurulmuş göstermez. Kusursuzluk veya resmî sertifikasyon iddia edilmez.
