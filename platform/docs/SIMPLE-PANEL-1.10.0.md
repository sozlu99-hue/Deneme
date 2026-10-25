# AESD 1.10.0 / 200 — Son sade önizleme

Kapsam 25 Ekim sade panel önizlemesidir. Sonraki ek tasarım önerileri kapsam dışıdır. Destek aesdapps.tr@gmail.com olarak kalır. Mevcut hesap, parola, lisans, cihaz ve finansal geçmiş değiştirilmez. CARİ bağımsız kalır.

Hazır üründe tek form: ad, gelen adet, bir adet alış fiyatı ve satış fiyatı. Koli adedi isteğe bağlı açılır; toplam adedi uygulama hesaplar. Alış ve ürün güncellemesi sunucuda yeniden hesaplanan tek atomik işlemdir. `productKind=ready` ve `readyStockId` ürünün adet stok kartını bağlar. Aynı kart iki hazır ürüne bağlanamaz; mevcut bağlantı sonradan değiştirilemez. Sıfır ilk miktarda alış oluşturulmaz; açıkça girilen başlangıç birim maliyeti, ilk kayıtlı alışa kadar kullanılır. Mevcut ortalama alış algoritması korunur.

Hazır ürün reçete listesine girmez. Sunucunun stok kullanım planı doğrudan adet üzerinden oluşur. İç `recipeStock=true` alanı eski APK köprülerinin de çevrimiçi onaylı işlem seçmesini sağlar; hazır üründe kullanıcıya açılan reçete veya ayar değildir. Yeni hazır ürün satışı çevrimdışı ödeme kuyruğuna alınamaz. Eski ödenmiş hamur fişlerinin uzlaşma davranışı değiştirilmez.

Mevcut içecekler otomatik dönüştürülmez. Kullanıcı açıkça adet takibini açabilir ve önceden kayıtlı adet stoğunu seçebilir. Mevcut miktar korunur; alış yoksa gelen adet boş bırakılır. Eski miktar yeniden alış gibi girilmemelidir. Hazırlanan ürün hazır ürüne çevrilmez. Eski satışların kimlikleri, ödeme, müşteri hareketleri ve maliyet/stok anlık görüntüleri korunur.

Yeni hazırlanan üründe ad ve satış fiyatı girilir, aynı kimlikle “Ürünün içindekiler” açılır. Malzemeler elle belirlenir; oranlar otomatik ölçeklenmez. Yeni `productKind=prepared` kayıtlarında tüm malzemeler satışta düşer; kahve gibi hamursuz ürünler desteklenir. Eski ürünlerin yalnız-hamur/tam reçete tercihi topluca değiştirilmez. Eski gramaj kontrolleri ve kaydedilmemiş değişiklik koruması korunur.

Mobil ana menü Satış, Ürün ve Stok, Müşteriler, Raporlar ve Ayarlar olarak düzenlenir. Müşteri borç düğmesi “Borç yaz” olur; tahsilat, ters kayıt ve önceki karşı borç ayrıntıları korunur. Mevcut kasa, adisyon, barkod/yazıcı, hesap ve sistem yönetimi işlevleri kaldırılmaz.

Satış iptali özgün parola kontrollü işlemden geçer. Stok, satış fişindeki kaydedilmiş kullanım üzerinden geri gelir. Nakit iade hareketi ve veresiye karşı hareketi korunur; eski maliyet yeni alıştan hesaplanmaz. Aynı satış ikinci kez iptal edilemez. Kısmi iade ayrı mevcut panel davranışıdır; bu sürüm yeni iade politikası getirmez.

Testler yalnız sentetik kayıtlarla SQLite, PostgreSQL ve Chromium üzerinde çalıştırılır. PostgreSQL son adet yarışı tek kazanan ve yeniden açılış sonrası işlem tekilleştirmesi ister. Fiziksel Android, gerçek yazıcı veya gerçek sağlayıcı testi olarak raporlanmaz. Web dağıtımı ve özgün imzalı APK teslimi ayrı doğrulanır.
