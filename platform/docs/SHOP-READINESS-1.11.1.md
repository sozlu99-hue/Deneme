# AESD 1.11.1 / 211 — Ek hesabın ilk açılışı

Kullanıcı ek hesabında eski İlk Kurulum formunu bildirdi. Sentetik test, ana oturum bilgisi özel çerçevede hazır değilken aynı formun gösterilebildiğini yeniden üretti. Gerçek iPhone oturumuna veya üretim hesabına girilmedi; ekran görüntüsünün cihazdaki kesin tetikleyicisi uzaktan doğrulanmış değildir.

Yalnız sunucunun üyelik ve cihaz kontrollerinden geçen yönetici HTML'si AESDShopManager işareti alır. İşaretli çerçeve ana oturum hazır değilken yerel yönetici hesabı veya deneme oluşturmaz. Oturum doğrulama ekranı gösterir; kullanıcı yeniden doğrulama isteyebilir. Ana çerçeve mesaj kaynağını ve kökenini doğrular, mevcut /me ve imzalı /lease akışını yeniden çalıştırır. İzin yüklenince/değişince veya çerçeve yüklenince alt çerçeve bildirilir. Uygulama görünür olduğunda izin yenilenir.

Alt çerçeve yalnız geçerli ana izin ve yönetici kimliğiyle geçici yerel auth bilgisi kurar. Yetki hazır olmadan ortak depoya bağlanmayı denemez; kimlik hazır olduğunda bağlantı başlatılır. İzin yokken eski yerel kurulum formuna düşmez. Ana hesabın eski bağımsız yerel akışı değişmez. Kayıtlar, parola hashleri, saklama anahtarları, sunucu üyelik/cihaz kontrolü, gerçek AESD şifresiyle iptal ve finansal doğrulama korunur.

İki yeni birim testi gecikmiş kimlik, izin kaybı, yerel parola/deneme reddi ve gecikmiş ortak kayıt bağlantısını sınar. Tam yönetici Chromium testi gecikmeli kimlik adımıyla genişletilir. Yeni başlangıç testi Chromium ve WebKit'te yeni cihazı, izin onayını, gecikmiş kimliği, diğer panel/yönetim kontrollerinin yokluğunu ve yeniden açılışta değişmeyen sunucu kayıtlarını doğrular. WebKit Linux motor testi fiziksel iPhone/Safari kabul testi değildir.
