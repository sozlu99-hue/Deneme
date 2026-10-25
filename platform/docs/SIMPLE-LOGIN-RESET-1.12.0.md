# AESD 1.12.0 / 220 — Sade giriş ve yeni başlangıç

Durum: kullanıcı tasarımı ve 1.12.0/220 yayınını onayladı. Bu kaynak notu canlı Web yayını veya imzalı APK teslimi kanıtı değildir; dağıtım commit’i, APK imzası ve Drive indirme sonucu ayrıca doğrulanır. Gerçek hesaplara giriş veya gerçek veri sıfırlaması yapılmaz.

## Arayüz

Girişte özgün AESD logosu, koyu yeşil tema, e-posta, şifre, hatırlama, giriş, kurtarma, kayıt ve personel bağlantısı vardır. Ön girişte Market/Restoran/Kafe seçimi kaldırıldı; yetkili panel girişten sonraki menüden seçilir. Önceki panel tercihi ve hesap güvenliği korunur. Mevcut telefonla giriş uyumluluğu kapalı bir ek seçenek altında tutulur. Kayıt ekranının panel seçimi ve onay/deneme kuralları korunur. Hesap içindeki görünüm ve yazı boyutu tercihleri değişmez.

Ayarlar → Veriler ve kayıtlar → İşletme verilerini sıfırla yalnız global OWNER hesabında görünür. CLIENT ve SHOP_MANAGER bu işlemi API üzerinden de yapamaz. OWNER yalnız owner:<kendi kimliği> kapsamını sıfırlar; istekten scope veya müşteri kimliği alınmaz. Market, Restoran, Kafe ve özel panel birbirinden bağımsızdır; tek işlem hepsini sıfırlamaz.

## Açık sıfırlama

1. Kullanıcı aktif paneli ve silinecek kayıtları inceler.
2. Sunucudan tam panel yedeği ve o revizyona bağlı 10 dakikalık tek kullanımlık onay alınır.
3. İndirme/paylaşım başlatılır; kullanıcı dosyanın güvenli yere kaydedildiğini ayrıca işaretler. Uygulama dosyanın fiziksel olarak kalıcı kaydedildiğini kanıtladığını iddia etmez.
4. Güncel AESD yönetici şifresi ve tam SIFIRLA metni gerekir. Parola sıfırlama veya yerel kasa parolası kullanılmaz.
5. SQL kilidi altında revizyon yeniden doğrulanır. Yedekten sonra değişiklik varsa sıfırlama reddedilir.
6. Aktif kayıt ve sıfırlama makbuzu aynı veritabanı işlemiyle yazılır. Tekrarlı istek aynı makbuzdan sonuçlanır; ikinci sıfırlama yapmaz. Sonucu belirsiz istek arayüzde yeniden gönderilmez; güncel kayıtlar kontrol edilir.

Silinir: seçilen panelde satış, iptal, adisyon, ürün, reçete, stok, alış, müşteri, cari bakiye/hareket ve kasa kayıtları. Özel panel fiş sayacı 1'e döner; yeni satış için ürün/stok ve gerekiyorsa kasa tekrar tanımlanır.

Korunur: sunucu hesapları/parolaları, yerel güvenlik/parola kaydı, deneme/lisans/ödemeye bağlı yetkiler, personel/cihaz/ek hesap erişimleri, işletme ayarları, sistem audit geçmişi, idempotency ve sağlayıcı makbuzları. Özel panelin menü sürüm işareti korunur; silinen ürünler yeniden başlatmada sessizce eklenmez. Eski dış yedekler ve fiziksel olarak başka cihazda kalan kopyalar otomatik silinmez. Bu işlem tüm kişisel verilerin güvenli silinmesi veya resmi mali belgenin iptali değildir.

## Eşzamanlılık ve kurtarma

Sıfırlama makbuzunun revizyonu kalıcı sınırdır. Eski işlem makbuzları silinmez. Sınırdan önceki komutlar/içe aktarma/özel durum değişiklikleri ve imzalı çevrimdışı satışlar reddedilir. Yeni komutlar kullandıkları sunucu revizyonunu gönderir. Sınır sorguları için kısmi indeks eklenir; yeni finansal tablo veya kayıt dönüşümü yoktur.

Sıfırlamayı yapan cihazda bekleyen işlem varsa ekran açılmaz. Diğer cihazların sıfırlama öncesi gönderilmemiş ödemeleri, cihazdaki kurtarma yedeğinde korunur ve yeni deftere otomatik uygulanmaz. Sahip eşitleme durumu ekranından yedek indirebilir; cihazları sıfırlamadan önce çevrimiçi getirip eşitlemek gerekir. Kurtarma yedeğini silmeyin veya eski satışları körlemesine yeniden girmeyin.

Sonucu belirsiz/süren ödeme veya mali belge sağlayıcı işlemi varsa sıfırlama durur. Sağlayıcı isteği satış okuma ile rezervasyon arasında sıfırlama olmuşsa eski satış üzerinden gönderilmez. Sağlayıcılara yeni gerçek bağlantı veya istek eklenmez.

## Doğrulama ve sınırlar

Testler yalnız sentetik SQLite, loopback PostgreSQL, Chromium ve Linux WebKit kullanır. Gerçek Android/iPhone, gerçek banka/fatura sağlayıcısı ve üretim sıfırlaması test edilmiş sayılmaz. APK paketleme kaynak kapanımı kontrol edilir; imzalı yeni APK veya canlı dağıtım ayrıca kanıt ister.

Onaylar işlem belleğinde ve oturuma bağlıdır. Sunucu yeniden başlarsa veya başka örneğe yönlenirse yeniden yedek indirmek gerekir; işlem güvenli biçimde reddedilir. Mevcut tek Render örneği için uygundur. Eski istemciler sıfırlama sonrasında yazarken revizyon göndermiyorsa güncellenmeleri gerekir. Yedekten otomatik geri alma eklenmez; mevcut kontrollü geri yükleme koruması sürer.
