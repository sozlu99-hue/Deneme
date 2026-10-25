# AESD 1.9.0 — Stok, ürün ve reçete

Stoklar, Ürünler ve Reçeteler aynı korumalı çalışma alanındadır. Destek aesdapps.tr@gmail.com olarak kalır. Mevcut kullanıcı, parola, lisans, cihaz, cari ve finansal kayıtlar taşınmaz veya sıfırlanmaz.

Alış miktarı ile maliyeti aynı pencerede ve ortak sunucu işlemiyle kaydedilir. Adet/parça stoklarında kasa/koli/paket ve tam marul → parça dönüşümü açıkça girilir. Ağırlık/hacim stokları kg/gr ve lt/ml dönüşümünü kullanır. Mevcut adet marul kartları otomatik parçaya dönüştürülmez. Ayrı parça stok kartı gerekir. Eski stoklar yeni alışmış gibi yeniden eklenmemelidir.

Sayımda fiziksel mevcut miktar girilir; başlangıç ve fark onaydan önce gösterilir. Fire/çıkış eldeki stoğu aşamaz. Sayım/fire açıklama ve son onay gerektirir, alış kaydı veya yeni birim maliyet oluşturmaz. Yeni stok kartı sıfır miktarla açılır; miktar sayım veya alışla değiştirilir. Yeni hareketin komut özeti sunucuda aynı ortak hesaplayıcıyla tekrar hesaplanır. Önceki yeni iş akışı hareketleri değiştirilemez.

Ürün bir kez eklenir ve aynı kimliğiyle reçetesine geçilir. Yeni ürün kontrol bekler. `netGrams` isteğe bağlı yeni alanıdır; eski `gramUsage` geçmiş/legacy tüketimiyle karıştırılmaz. Gramaj değişince mevcut reçete korunur ve `recipeReviewRequired` satış hesabını hem sahip hem personel için durdurur. Kullanıcı miktarları kontrol edip açık onay verdikten sonra geçerli, maliyeti tamam ve net gramajıyla uyumlu reçete kaydedilebilir. Reçete gramajları otomatik orantılanmaz. Önceki satışın maliyeti, stok kullanım anlık görüntüsü ve fişi değiştirilmez.

Mevcut ürünlerin yalnız-hamur davranışı topluca değiştirilmez. Tam reçete düşümü seçimi görünür. Kaydedilen ürün ve reçete stok düşürmez; düşüm tamamlanan satıştadır. Tam reçeteli satış için bağlantı ve güncel yeterli stok gerekir. Eski çevrimdışı hamur kayıtları korunur. Marulsuz varyant ayrı satış kartıdır; standart reçete değiştirilmez.

Kaydedilmemiş reçete sekme/ürün değişiminde ve dış ana gezinmede sorulur. Reçeteye dön taslağı korur; Kaydetmeden çık yalnız taslağı bırakır, son kaydedilmiş ürünü korur. Ürün kartında reçete kontrolü, eksik reçete/maliyet, yetersiz stok ve hazır durumu gösterilir. Alış fiyatı reçetede tekrar girilmez; fiyat Ürünler, alış maliyeti Stoklar içindedir. Ek maliyet mevcut uyum için korunur.

Kaynak hazırlığı, canlı Web ve özgün imzalı APK teslimi ayrı doğrulanır. Gerçek kayıtta test yapılmaz. Yerel ve CI Node, SQLite, PostgreSQL ve Chromium doğrulaması kullanılır. Chromium fiziksel Android testi değildir. Özgün com.oses.pos sertifikası korunur. CARİ ve emekli müşteri APK dosyası değiştirilmez.
