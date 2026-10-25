# Özel panel görsel ve panel dönüşü düzeltmesi — 9 Ekim 2026

Porsiyon ve Yarım Porsiyon için ürün fotoğrafı tanımlı değildi. Küçük emoji, geniş görsel alanının üstünde kalıyordu. Fotoğrafı olmayan ürünün simgesi artık büyük ve ortalıdır. Bu simge ürün fotoğrafı değildir. Dar ekranda fiyat büyütüldü; ekleme düğmesi 44 × 44 piksel oldu. Fotoğraflı ürünler kendi görselini kullanır.

Özel panelden Market, Restoran veya Kafe'ye geçildiğinde oturum neslinin değeri değişiyordu. Eski özel panel çerçevesi aynı izin bağlantısıyla yeniden kullanılıyordu. Bu bağlantı “Sahip oturumu gerekli” hatasını veriyordu. Panel değişimi artık eski bağlantıyı kapatır. Özel panel geri açıldığında yeni oturumla bağlanır. Ayarlar ve Satış arasında geçiş aynı çerçeveyi korur. Geciken eski bağlantı yeni bağlantıyı değiştiremez.

Bu düzeltme ürün fiyatını, satış maliyetini, stok miktarını veya şifreyi değiştirmez. Kalıcı bekleyen satış kuyruğu silinmez. Gerçek oturum süresi dolarsa yeniden giriş gerekir; yetki kontrolü kaldırılmadı.

Yeni otomatik doğrulama: ana testler 103/103, özel panel regresyonları 61/61; toplam 164 geçti. Üç yeni test Ayarlar/Satış çerçeve korumasını, sektör dönüşünde yeni sahip bağlantısını ve geciken eski bağlantının engellenmesini kapsar. Yeni Chromium ekran kontrolü veya gerçek iPhone/Android testi yapılmadı. Önceki APK ve PDF raporu önceki teslimi anlatır; bu düzeltmenin doğrulaması evidence/photo-nav-* dosyalarındadır.

The application centers a large symbol when a product has no photo.
The application closes the old private connection when the owner changes panels.
The private panel uses the current session when it opens again.
The application keeps paid sales in device storage.
The tests use an isolated DOM and a store stub.
These tests do not confirm operation on an iPhone or Android device.
