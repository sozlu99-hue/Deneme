# AESD 1.8.0 — Stok, reçete ve cari

Temel kaynak: `5d577501c2fabc3d0174c7b6ed6ff91920472cf0`. Web ve birleşik Android paketi 1.8.0/180 hazırlanır. Kaynak sürümü, canlı Web dağıtımı ve imzalı APK teslimi ayrı kanıtlarla doğrulanmalıdır.

Girişte küçük özgün logo, masaüstü tanıtım alanı, şifre görünürlüğü, telefonla girişte AESD şifresi açıklaması ve varsayılan kapalı cihaz hatırlama bulunur. Kurulum çubuğu belge akışındadır; formun üstüne sabitlenmez. Çift gönderim mevcut sunucu/istemci kilidiyle engellenir. Bağlantı yokken giriş düğmesi kapalıdır.

Mal kabulde adet, kasa, koli, paket, kg/gram ve litre/ml ayrılır. Girilen birimin fiyatı veya toplam belge tutarı açıkça seçilir. Özel panelde alışın temel stok birimine karşılığı ve toplam maliyeti onaydan önce gösterilir. Market mal kabul kaydı her teslimatın kendi paket içeriğini tutar; sonraki koli boyutu değişikliği önceki alış miktarını değiştirmez. Eski stok ve fiyatlar otomatik dönüştürülmez. Satış fiyatı bağlantısı seçilmezse alış kaydı ürün fiyatını değiştirmez.

Özel panel reçetesi her ürün için bağımsızdır. 300/500 g için 1 parça, 750/1000 g için 2 parça marul uygulanabilir. Bir marul 4 parçadır. Bu ölçü ilgili parça stok kartı seçilerek açıkça uygulanır; mevcut işletmelerin reçeteleri ve marul kartları arka planda güncellenmez. Diğer malzeme miktarlarını ve gerçek alış fiyatlarını işletme belirler. Eksik maliyet sıfır kabul edilmez. Reçete veya fiyatı kaydetmek stok düşürmez.

`recipeStock` kapalı veya bulunmayan ürünler eski yalnız-hamur kuralını korur. Açık ürünler sunucu onaylı satışta tüm kayıtlı içerikleri düşürür. İstemci, sunucu ve personel satışları aynı miktar/maliyet hesabını kullanır. Bir malzeme yetersizse bütün işlem reddedilir. Fiziksel marul adedi ile parça sayısı aynı birim sayılmaz; adet stok kartından çeyrek adet düşürülerek tam sayı doğrulaması atlanmaz. Parça takibi için ayrı parca kartı gerekir. Eski stokların aktarımı otomatik yapılmaz; işletmenin açık stok sayımı ve kayıt kararıyla yapılmalıdır.

Tüm reçete düşümü, var olan hamur için çevrimdışı eksik stok modeline genişletilmez. Yeni reçeteli satış ortak sunucu işlemi olarak onaylanır; bağlantı yoksa tamamlanmış sayılmaz. Eski çevrimdışı hamur ödemeleri ve bekleyen kayıtlar korunur. Yeniden gönderilen aynı işlem kimliği ikinci satış oluşturmaz. İptal, kayıtlı stok kullanımından geri alınır; geçmiş reçeteden tekrar türetilmez.

Marulsuz seçenek standart reçeteyi değiştirmeyen ayrı bir satış kartı olarak oluşturulur. Kartın kayıtlı reçetesinde seçilen marul bulunmaz; maliyeti ve stok düşümü buna göre hesaplanır. Standart kart ve diğer gramajlar değişmez. Ürün seçimi kasiyere ve fişe açıkça yansır. Bu sürümde tek kart üzerinde geçici malzeme çıkarma yerine açık varyant kullanılır.

Cari hesapta müşterinin bize borcu (alacağımız) ve bizim müşteriye borcumuz ayrı gösterilir. Manuel borçlandırma açıklamalı alacak hareketidir; tek başına kasaya para yazmaz. Tahsilat alacağı, ödeme borcu azaltır. Nakit tahsilat açık kasada giriş, nakit ödeme çıkış makbuzuyla birlikte doğrulanır. Kart kaydı nakit kasasına yazılmaz ve gerçek karttan çekim yapmaz. Yetersiz kasa mevcudunda nakit ödeme reddedilir. Müşteri kartı sıfır bakiyeyle açılır; başlangıç borcu/alacağı hareket olarak eklenir.

Manuel düzeltme eski hareketi silmez: özgün tutarı referanslayan ters kayıt ve gerekirse karşı kasa hareketi eklenir. Aynı hareket tekrar ters çevrilemez. Otomatik veresiye satış alacağı bu yolla değiştirilemez; satış iptal/iadeleri kendi akışını kullanır. Geçmiş satış tutarı, reçetesi ve maliyetleri sonradan alış/fiyat değişikliğiyle yazılmaz. Eşzamanlı değişikliklerde mevcut revizyon/işlem kimliği kontrolleri korunur.

Gerçek müşteri kayıtlarında test yapılmaz. Node, SQLite, yerel PostgreSQL, mevcut bütün tarayıcı grupları ve yeni gerçek akış testi birlikte çalıştırılır. APK özgün com.oses.pos kimliği ve sertifikayla imzalanır; Drive dosyası yerinde güncellenip geri indirilerek SHA-256 doğrulanır. CARİ ve emekli müşteri APK'sına dokunulmaz. Fiziksel Android, yazıcı, kamera ve gerçek ödeme sağlayıcısı kabulü yapılmadıkça başarılı raporlanmaz.
