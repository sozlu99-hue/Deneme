# AESD 1.6.0 — Tek uygulama, altı modül

18 Ekim 2026. Kullanıcı uygulamayı geliştirme, web yayını, özgün imzalı APK güncellemesi ve mevcut Drive dosyasını güncelleme için izin verdi. Yeni uygulamanın adı AESD. CARİ projesi değişmez.

Bu belge kaynak kapsamını açıklar. Canlı yayın ve imzalı APK teslimi `../evidence/unified-delivery.json` ile ayrıca doğrulanır. ASD-STE100 yaklaşımına uygun kısa, açık işlem metinleri kullanılır. Resmî ASD-STE100 uygunluk belgesi veya hatasız yazılım iddiası yoktur.

| Modül | Uygulanan çözüm | Durum ve sınır |
|---|---|---|
| 1. Hesap ve erişim | Tek giriş, e-posta + AESD şifresi, yeni hesaplarda e-posta doğrulama, yanlış kayıt adresini şifreyle düzeltme, müşteri cihaz kodu ve yönetici onayı, ret/iptal sonrası yeni istek, oturum sonlandırma, şifre değiştirme | Uygulama içi akış tamamlandı. Eski hesap ve lisanslar korunur. Cihaz onayı MFA değildir. |
| 2. Satış ve kasa | Parçalı nakit/kart/veresiye ödeme, kısmi ürün iadesi, kasa açılış/kapanış ve açıklamalı fark, geçmiş maliyet koruması | Uygulama içi kayıt tamamlandı. Karttan tahsilat veya mali fiş üretimi değildir. |
| 3. Salon ve sipariş | Masalar, adisyon ayırma/birleştirme, mutfak/bar iş sırası, QR menü ve ödenmemiş sipariş, aynı işlemi ikinci kez yazmayı önleme | Yerel sipariş akışı tamamlandı. Dış sipariş platformu bağlantısı sağlayıcı seçimini bekler. Mutfak gönderiminden sonra ayırma/birleştirme sınırlıdır. |
| 4. Stok ve tedarik | Ürün/reçete düzenleme, alternatif malzeme, hassas birim maliyeti, birim çevirme, kritik stok, sayım/fire, depo transferi, parti/SKT ve FEFO, tedarikçi faturası | Uygulama içi stok akışı tamamlandı. Fiziksel terazi/okuyucu bağlantısı ayrıca test ister. |
| 5. Cari ve finans | Risk limiti, vade/yaşlandırma, ekstre, tedarikçi borç/ödeme, gider, banka CSV aktarımı ve eşleştirme, CSV dışa aktarma, tarayıcıdan PDF yazdırma | Kayıt ve rapor akışı tamamlandı. Banka API’si yoktur. Sonuç girilen kayıtlara bağlıdır; resmî muhasebe/net kâr hesabı değildir. |
| 6. Görünüm ve dağıtım | Tek Ayarlar girişi, açık/koyu/sistem görünümü, hesaba göre tema, doğrulanmış kayıtta sabit yeşil, eşitlemede hafif sarı hareket, tek AESD APK | Kaynak tamamlandı. Yayın, imza, Drive indirme doğrulaması ayrı teslim kaydındadır. Fiziksel Android/iPhone kabul testi yapılmadı. |

## Yetki ve veri korunması

- Yönetim yetkisi sunucudaki mevcut OWNER kaydından gelir. E-posta metnini değiştirerek yönetici olunamaz. `ozlusuat7@gmail.com` hesabının mevcut OWNER ve aktif durumu yayın başlangıcında yalnız doğru/yanlış değerleriyle kontrol edilir. Şifre değiştirilmez.
- Paket kimliği `com.oses.pos`, sürüm 1.6.0/160. Özgün imza korunur. Güncelleme mevcut uygulamanın üzerine kurulur. Eski kayıt adları, işyeri kimlikleri ve lisans bitişleri değiştirilmez.
- Kullanılmayan `com.aesd.pos` müşteri APK’sı yeniden dağıtılmaz. Tek APK’da müşteriler yalnız sunucu onaylı kendi alanlarını açar. Özel panel HTML’i OWNER oturumu doğrulanmadan pakete veya yanıta eklenmez.
- Yeni satış/stok/finans modülleri Market, Restoran ve Kafe’nin ortak kayıt modelindedir. Eski Özel Panelim verileri yeni modele otomatik taşınmaz; mevcut satış ve stok davranışı korunur.
- Belirsiz yazma sonucu aynı işlemi otomatik tekrarlamaz. Kimliği ile kayıt sorgulanır. QR sipariş ödeme değildir. Dış bağlantılar sağlayıcı seçilip gerçek uygulama bağlanmadan etkin gösterilmez.

## Açık dış bağımlılıklar

1. ÖKC/yazarkasa modeli, e-Fatura sağlayıcısı ve dış sipariş platformlarının seçimi.
2. Seçilen sağlayıcıların gerçek adaptörü, yetkili hesabı ve test ortamı. Hazır adaptör olmadan bağlantı kapalıdır.
3. Gerçek Android cihazda mevcut kurulumun üzerine güncelleme, kamera, dosya paylaşımı, yazıcı ve varsa terazi kabul testi.
4. Fiziksel iPhone’da kurulum ve yazdırma kontrolü.

Gerçek sağlayıcı bağlantısı, Android/iPhone testi veya bütün rakiplerden üstünlük doğrulanmış gibi sunulmaz.

## Doğrulanan teslim

Web 1.6.0 yayında. Canlı sunucunun 11 dosya özeti kaynakla eşleşti. Belirlenen yönetici hesabı aktif OWNER olarak doğrulandı. Özgün sertifikalı AESD 1.6.0/160 APK Drive’daki mevcut dosyaya yüklendi. İndirilen dosyanın SHA-256, paket kimliği, sürümü, üç imza şeması ve hizalaması doğrulandı. 264 otomatik test, 132 tarayıcı kontrolü ve 18 APK paketleme kontrolü geçti. Yerel PostgreSQL gerektiren 3 test çalışmadı. Eski bağımsız e-posta HTTP betiği kalıcı depo olmadan 503 aldı; yeni platform e-posta kurtarma ve SQLite HTTP akışı geçti. Fiziksel cihaz ve gerçek sağlayıcı kabulü açık kalır.

[Web uygulaması](https://aesd-server.onrender.com/aesd/) · [Tek AESD APK](https://drive.google.com/file/d/10sUlB9DaS2Bem1_kH9SHeyeAvyXRXJiW/view)
