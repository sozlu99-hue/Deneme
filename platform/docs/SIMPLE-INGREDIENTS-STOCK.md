# Özel dükkân: sade stok ve ürün içeriği

Bu çalışma yerel kaynakta uygulanmıştır; bu belge canlı Web/APK yayını veya fiziksel cihaz kabulü anlamına gelmez. Sürüm ve dağıtım kaydı, yayın doğrulandığında ayrıca güncellenir. Market, Restoran, Kafe ve bağımsız CARİ kuralları değiştirilmez.

Ürün ve Stok alanında yalnız Ürünler ve Malzemeler sekmeleri görünür. Hazırlanan ürünün içindekileri kendi kartından açılır. Hazır içeceklerin reçetesi yoktur; adet, alış ve satış fiyatları aynı formdadır. Ambalaj ml/litre bilgisi adetten ayrı bir tüketim değildir. Örneğin 24 adet 200 ml ayrandan bir satış sonrası 23 adet kalır. Kayıtlı ambalaj hacmi değiştirilemez; 200 ml ve 1 litre ayrı ürün kartlarıdır.

## Stok ve maliyet

- Hamur ve sebzeler kg ile alınır; gr temel miktarı korunur. Aynı form toplam alış tutarını ve birim maliyeti gösterir.
- Marul bağlantısı parça birimlidir. 1 kasa = 6 adet = 24 parça; 1 adet = 4 parça. Yanlış çarpan sunucuda reddedilir. Sayım/fire alış oluşturmaz ve kayıtlı maliyeti değiştirmez.
- Domates, turşu ve limon kg stokları elle takip edilir. Satış bunların miktarını otomatik azaltmaz. Kartta son stok güncellemesi görünür. Kalan miktar fiziksel sayımla güncellenmelidir.
- Stok kaydı satış onayından sonra düşer. İptal, eski satışın kaydedilmiş tüketimini geri getirir; güncel içerikten yeniden hesaplamaz.
- Alışlar menü satış fiyatını ve geçmiş maliyet anlık görüntülerini değiştirmez.

## Açık bağlantı ve uyumluluk

Başlangıçta mevcut stok veya ürünler otomatik dönüştürülmez. İlk kullanımda her menü kartında İçindekileri aç → stok kartlarını seç → kontrol onayı → İçeriği kaydet akışı uygulanır. Bu işlem mevcut miktarı değiştirmez. Eksik kart sıfır miktarla açılır. Eski adet marul kartı parçaya sessizce çevrilmez. Hamur bağlantısı eski finansal altyapının s1 kimliğini korur; yeni hamur kartı aynı kimlikle açılır. Diğer özel/custom ürünlerin eski içerik düzenleyicisi korunur.

Sekiz standart menünün gramajları ve mevcut fiyatları korunur. Aile boyu içerik 1000 gr hamur, 8 lavaş, 36 ml acı sos, 36 ml nar ekşisi ve 4 parça maruldur. Mega seçeneklerinde kullanıcı tarifinde belirtilmeyen limon otomatik eklenmez.

## Satış ve doğrulama

Sos ve sebze seçimi yalnız adisyon satırına aittir; standart ürün ve fiyat değişmez. Doritoslu ürünler ayrı mevcut fiyatlı menü kartlarıdır. Aynı ürünün farklı içerikleri farklı satırlarda tutulur. İçerik sürümü değişmiş eski adisyon yeniden kontrol edilmeden ödenemez. Kaydedilmiş adisyonlar ve fişler seçimleri taşır.

Domates/turşu/limon için porsiyon ağırlığı, Doritos için miktar bilinmediğinden maliyet tam değildir. Ölçülü içeriklerin tahmini maliyeti ayrı alanda tutulur. Eksik tam maliyet ve brüt kâr null kalır; ölçülmeyen kalemler sıfır maliyet kabul edilmez. Ölçülü kullanılan malzemede alış maliyeti eksikse satış engellenir. Bu kontrol eski reçeteli ürünlerde gevşetilmez. Tam içerikli satışlar mevcut çevrimiçi onay gereksinimini korur.

Sunucu aynı ortak kurallarla bağlantıyı, birimleri, miktarı, sürümü, seçimi, maliyeti ve tüketimi yeniden hesaplar. İçerik değişikliği tek atomik, kalıcı işlem kimliği olan hareketle kaydedilir. Eski hareketler ve satış anlık görüntüleri değişmez. OWNER/SHOP_MANAGER/personel, şifreli iptal, kayıt kapsamı, lisans ve sıfırlama engelleri korunur.

## Doğrulama

`npm test`, `npm run test:private`, `npm run test:native`; açık loopback TEST_PG_URL ile `node --experimental-vm-modules --test --test-isolation=none tests/*postgres.mjs`; `npm run test:browser`; paketleme/source kontrolleri. Yeni `simple-ingredients.test.mjs`, `simple-ingredients-postgres.mjs` ve `simple-ingredients-browser.mjs` sentetik kayıtlarla çalışır. Tarayıcı senaryosu Chromium ve WebKit destekler. Fiziksel Android/iPhone veya üretim müşteri kaydıyla işlem yapılmaz. CI yalnız güvenli test özetlerini toplar; parolalar, oturumlar ve ham finansal örnekler artefaktlara eklenmez.
