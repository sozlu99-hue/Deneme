# AESD 1.11.0 / 210 — Özel dükkâna ek hesap

Bu sürüm yalnız mevcut özel dükkâna bir ek AESD hesabı bağlar. Yeni görsel tasarım kapsam dışıdır. Ana hesap ozlusuat7@gmail.com tüm sistem yetkilerini korur. Ek hesap sozlu99@gmail.com için öneri alanı doldurulur; kaynakta otomatik yetkilendirme veya parola yoktur.

Ana yönetici menüden **Dükkân erişimi** açar ve mevcut hesabı tanımlar. Ek kullanıcı kendi AESD şifresiyle girer, gerekiyorsa e-postasını doğrular ve cihaz isteği açar. Ana yönetici o cihazda görünen kodu kontrol ederek onaylar. Gerçek hesaplara araçla giriş yapılmaz ve üretim veritabanına doğrudan kayıt yazılmaz.

Global rol CLIENT kalır. Sunucu her istekte oturumu, etkin kullanıcıyı, e-posta eşleşmesini, etkin OWNER sahibini, etkin üyeliği ve onaylı cihazı tekrar kontrol eder. İmzalı SHOP_MANAGER izni yalnız private paneli ve owner:<id> defterini açar; 60 saniye geçerlidir. Market, Kafe, Restoran, lisans, onay ve personel yönetimi açılmaz. İşletme ürün/stok/cari/kasa/rapor işlemleri özgün özel panelin sunucuda doğrulanan geçiş kurallarını kullanır.

Ek kullanıcı çevrimiçi çalışır; çevrimdışı satış izni almaz. Ana hesabın mevcut çevrimdışı kuyruğu korunur. Bekleyen işlem kimlikleri yönetici hesabına ayrı anahtarla bağlanır; kayıp yanıt aynı makbuzdan doğrulanır. Ana hesabın eski localStorage ve IndexedDB adları değişmez. Ek hesabın özel HTML veri anahtarları kullanıcıya ayrı adlandırılır; eski ana hesabın yerel kayıtları içe aktarılmaz.

Yeni satışın cashier ve yeni iptalin cancelledBy alanları ek hesabın gerçek e-postasıyla eşleşmek zorundadır. Stok iş akışı aktörü de aynı hesap olmalıdır. İptal, ek hesabın kendi güncel AESD şifresiyle sunucuda yeniden doğrulanır; iki dakikalık tek kullanımlık kanıt gerekir. Yanlış parola önceki kanıtı kaldırır. Tutar, geçmiş maliyet, stok kullanımı, veresiye karşı hareketleri ve makbuz tekilleştirmesi özgün finansal doğrulamadan geçer.

Bir dükkâna aynı anda yalnız bir ek hesap atanır. Cihaz istek sayısı 20, yeni/yenilenen istek hızı 10 dakikada 5, parola doğrulaması 10 dakikada 8 ile sınırlıdır. Ana yönetici erişimi kapatınca tüm cihaz onayları kapanır. Tekrar yetkilendirme eski cihaz onayını sessizce geri getirmez. Ek hesap başka sahibin dükkânına taşınamaz.

İki hesap aynı sunucu defterini okur. Çevrimiçi özel panel yaklaşık beş saniyede yenilenir; bağlantı hızı, ücretsiz Render uyku süresi ve işlem süresine bağlıdır. Eşzamanlı değişiklikler sürüm karşılaştırması ve veritabanı işlemiyle tekilleştirilir; eski durum yeni satışı ezemez.

Testler sentetik hesap/veri ve loopback SQLite/PostgreSQL/Chromium kullanır. Gerçek hesap yetkisi ve fiziksel Android kabulü otomatik test sonucu değildir. Yalnız gereken iki erişim tablosu eklenir; mevcut işletme, lisans, parola ve finansal kayıtlar dönüştürülmez.
