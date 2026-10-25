# 1.13.1 / 231 — yedek ekranından sıfırlamaya dönüş

Yedek indirme/önizleme/paylaşım ekranı uygulamadan ayrılmaya ve sayfanın yeniden yüklenmesine neden olabilir. Önceki akış indirme adımını yalnız açık formun belleğinde tutuyordu. Dönüşte ana satış ekranı açıldığından kullanıcı güvenli sıfırlamaya devam edemiyordu.

İndirme başlatılırken bu sekmenin sessionStorage alanına yalnız oturumun SHA-256 özeti, panel/modül, yedek revizyonu, aşama ve en fazla 10 dakikalık süre yazılır. Parola, gerçek oturum tokenı, sıfırlama bileti ve finansal yedek saklanmaz. İndirme dosyasının gerçekten cihaza kaydedildiğini kullanıcı ayrıca onaylar.

Sayfa yüklenmesi veya pageshow dönüşünde yalnız aynı ana yönetici oturumu ve aynı panel için onay ekranı geri açılır. Sunucudan yeni bir hazırlık bileti alınır; revizyon aynıysa önceki indirme adımı tanınır. Kullanıcı yedeği kaydettiğini yeniden işaretler, şifresini tekrar girer ve SIFIRLA yazar. Geri dönmek silme isteği göndermez. Revizyon değişmişse yeni yedek gerekir. Başka oturum/panel, süre aşımı ve bozuk dönüş kaydı onay ekranını otomatik açamaz. Diğer açık formlar değiştirilmez.

Açık vazgeçme, başarılı sıfırlama veya geçersiz bağlam dönüş işaretini temizler. Sayfadan ayrılırken parola alanı boşaltılır. Sonucu belirsiz/gönderilmekte olan bir sıfırlama sonrası dönüşte yalnız kayıtları kontrol etme uyarısı gösterilir; işlem kendiliğinden tekrarlanmaz. Android Share iptali yedeği kaydedilmiş saymaz.

Doğrulama sentetik Node/JSDOM, SQLite, PostgreSQL, Chromium ve WebKit kullanır. Gerçek finansal kayıt veya üretim sıfırlaması yapılmaz. Fiziksel iPhone/Android testi iddia edilmez. İşletim sistemi bu sekmenin oturum depolamasını tamamen silerse veya uygulama oturumu değişirse yeni bir yedek adımı gerekir. Bu değişiklik eski stok/içerik, yetki, lisans ve finansal geçmiş kurallarını değiştirmez.
