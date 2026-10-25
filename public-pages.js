const contact = 'aesdapps.tr@gmail.com';
const layout = (title, body) => `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | AESD-Kasa</title><meta name="description" content="AESD-Kasa: kasa, cari hesap ve satış takibi. Uygulama bilgileri, gizlilik ve destek.">
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif;background:#0b1022;color:#edf2ff}
*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1000px;margin:auto;padding:28px 24px}
header{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid #ffffff20}
a{color:#8ee3ff;text-underline-offset:4px}nav{display:flex;gap:18px;flex-wrap:wrap}
.brand{font-size:23px;font-weight:800;text-decoration:none;color:white}
h1{font-size:clamp(32px,6vw,58px);letter-spacing:-.04em;line-height:1.1;margin:22px 0}
h2{font-size:23px;margin:32px 0 12px}p,li{line-height:1.75;color:#d0d9ef}
.hero{padding:35px 0}.tag{color:#80dcff;font-weight:700;letter-spacing:.12em;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.card{padding:22px;border-radius:18px;background:linear-gradient(130deg,#182c51,#231e45);border:1px solid #ffffff16}
.card h2{margin:0 0 10px}.button{display:inline-block;padding:13px 20px;background:#8ee3ff;color:#10182b;border-radius:12px;text-decoration:none;font-weight:700}
footer{border-top:1px solid #ffffff20;margin-top:28px;font-size:14px}main{min-height:65vh}small{color:#a9b7d1}
</style></head><body><header><a class="brand" href="/">AESD-Kasa</a><nav aria-label="Ana menü"><a href="/privacy">Gizlilik</a><a href="/terms">Kullanım</a><a href="mailto:${contact}">Destek</a></nav></header>
<main>${body}</main><footer>AESD-Kasa · İletişim: <a href="mailto:${contact}">${contact}</a><p><a href="/privacy">Gizlilik Politikası</a> · <a href="/terms">Kullanım Koşulları</a></p></footer></body></html>`;

const home = layout('Kasa ve cari hesap takibi', `
<section class="hero"><span class="tag">İŞLETMENİZİN GÜNLÜK HESAPLARI</span><h1>Kasa ve cari hesaplarınız,<br>tek uygulamada.</h1>
<p>AESD-Kasa; gelir, gider, alacak, borç ve satış kayıtlarını takip etmek için geliştirilen bir mobil uygulamadır. Ürün ve içecek kayıtları, ödeme türleri ve hesap raporları üzerinde çalışmanızı sağlar.</p>
<a class="button" href="mailto:${contact}">Bilgi ve lisans için iletişime geçin</a></section>
<section class="grid" aria-label="Uygulama özellikleri">
<div class="card"><h2>Kasa ve satış</h2><p>Gelir ve gider kayıtları, nakit ve kart ödemeleri, günlük ve aylık satış takibi.</p></div>
<div class="card"><h2>Cari hesaplar</h2><p>Müşteri bazında alacak ve borç hareketleri, bakiye takibi ve hesap ekstreleri.</p></div>
<div class="card"><h2>Ürünler ve raporlar</h2><p>Ürün bilgileri ve görselleri, fiyat girişi ve PDF raporlarıyla kayıtlarınıza erişim.</p></div></section>
<h2>Hesap ve güvenlik e-postaları</h2><p>Hesap erişimi ve lisans işlemleri sunucu üzerinden yürütülür. Şifre yenileme ve doğrulama kodları kayıtlı e-posta adresine gönderilir. Gmail bağlantısı, izin veren gönderici hesabından bu işlem e-postalarını göndermek için kullanılır.</p>
<h2>Google bağlantısı</h2><p>Google hesap bağlantısı kullanıldığında kimlik doğrulama için temel profil bilgileri istenir. E-posta gönderme izni ayrı bir işlevdir; müşterilerin gelen kutularını okumak için kullanılmaz. Veri kullanımının ayrıntıları <a href="/privacy">Gizlilik Politikası</a> sayfasındadır.</p>
<p><small>Uygulama erişimi hesap ve lisans durumuna bağlıdır. Bu sayfa uygulamanın tanıtım ve destek sayfasıdır.</small></p>`);

const privacy = layout('Gizlilik Politikası', `
<h1>Gizlilik Politikası</h1><p><small>Güncelleme: 13 Eylül 2026</small></p>
<p>Bu metin AESD-Kasa mobil uygulamasını, hesap sunucusunu ve bu internet sitesini kapsar. Uygulama yöneticisine ve veri talepleri için iletişim adresine <a href="mailto:${contact}">${contact}</a> üzerinden ulaşabilirsiniz.</p>
<h2>İşlenen bilgiler ve amaçları</h2><ul>
<li>Hesap e-postası, varsa telefon numarası, parola özeti, hesap rolü ve lisans bilgileri: hesabı doğrulamak ve erişimi yönetmek için işlenir.</li>
<li>Cihaz kimliğinin özeti, aktivasyon kayıtları, giriş denemeleri, zaman bilgileri ve IP adresi gibi teknik kayıtlar: cihaz sınırlarını uygulamak, hataları incelemek ve yetkisiz kullanımı tespit etmek için işlenir.</li>
<li>Girdiğiniz cari hesap, satış, ürün, tutar ve ürün görseli bilgileri: seçtiğiniz uygulama işlevlerini sunmak için kullanılır. Cihazda tutulan kayıtlar, oluşturulan PDF'ler ve dışa aktarılan dosyalar cihazınızda veya seçtiğiniz paylaşım hedefinde bulunabilir.</li>
<li>Doğrulama ve şifre yenileme kodları: hesap erişimini doğrulamak için süreli olarak oluşturulur. Sunucuda doğrulama amacıyla kodların özeti tutulur.</li></ul>
<h2>Google ve Gmail verileri</h2>
<p>Google hesabını bağlama işlevi, izin verdiğinizde temel kimlik bilgilerini (Google hesap kimliği, e-posta ve profil kapsamları) talep eder. Sunucu hesap eşleştirmesi için Google hesap kimliğini, bağlantıyı sürdürmek için OAuth yetkilendirme bilgilerini kullanır. Hesap bağlantısına ait yenileme belirteçleri sunucuda şifrelenerek tutulur.</p>
<p>Gmail gönderme bağlantısı, yöneticinin izin verdiği gönderici hesabından giriş/doğrulama kodları, şifre yenileme ve güvenlik bildirimleri göndermek içindir. Gmail API'ye alıcı adresi, konu ve mesaj içeriği iletilir. Bu işlev <code>gmail.send</code> iznini kullanır; gelen kutusu okuma, e-posta listeleme veya silme izni talep etmez. Gönderici yetkilendirme bilgileri sunucu ortamında tutulur ve APK içine eklenmez.</p>
<p>Google verileri reklam hedefleme, satış veya genel amaçlı yapay zekâ modeli eğitimi için kullanılmaz. AESD-Kasa'nın Google API'lerinden aldığı bilgileri kullanımı ve aktarımı, Sınırlı Kullanım gereklilikleri dahil <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Hizmetleri Kullanıcı Verileri Politikası</a> ile sınırlıdır.</p>
<h2>Hizmet sağlayıcıları ve paylaşım</h2>
<p>Sunucu barındırma için Render, yapılandırılmış e-posta gönderiminde Google/Gmail veya Resend kullanılır. Telefon ile mesaj işlevi ayrıca etkinleştirilirse ilgili telefon ve mesaj bilgileri yapılandırılmış SMS sağlayıcısına iletilir. Bu hizmet sağlayıcıları verileri Türkiye dışında işleyebilir. Kullanıcının PDF veya başka bir dosyayı paylaşması, dosyayı kendi seçtiği alıcıya ya da hizmete aktarır.</p>
<p>Güvenlik olaylarında yöneticiye giriş denemesinin e-posta adresi, IP ve zaman bilgilerini içeren bildirim gönderilebilir. Verilere teknik destek veya güvenlik için gerektiğinde yetkili yönetici erişebilir; yasal yükümlülükler kapsamında yetkili makamlarla paylaşım gerekebilir.</p>
<h2>Saklama ve silme</h2>
<p>Hesap ve lisans kayıtları hizmetin sunulması için gerekli olduğu sürece tutulur. Güvenlik kayıtlarının saklanması, güvenlik incelemeleri ve uygulanabilir yükümlülüklere bağlıdır. Doğrulama kodlarının kullanım süresi sınırlıdır; süresi dolan kodlar erişim sağlamaz. Cihazınızda veya paylaştığınız hizmetlerde kalan dosyaların silinmesi ayrıca sizin kontrolünüzdedir.</p>
<p>Hesap bilgilerinizin düzeltilmesi, hesabınızın ve ilişkili sunucu kayıtlarının silinmesi veya veri kullanımı hakkında bilgi için kayıtlı e-posta adresinizden <a href="mailto:${contact}">${contact}</a> adresine başvurabilirsiniz. Talep öncesinde kimlik doğrulaması yapılabilir; saklanması gereken kayıtlar varsa size açıklanır. Hesap silinmesi erişimi ve lisans kullanımını etkileyebilir.</p>
<h2>Google iznini kaldırma</h2>
<p>Google hesabınızdaki <a href="https://myaccount.google.com/connections">üçüncü taraf bağlantıları</a> bölümünden AESD-Kasa'nın iznini kaldırabilirsiniz. Bu işlem sonraki Google erişimini durdurur; önceden tutulan uygulama kayıtlarını silmek için ayrıca silme talebi iletin. Uygulamadaki bağlantıyı kaldırma seçeneği sunucudaki hesap bağlantısını temizler.</p>
<h2>İnternet sitesi</h2><p>Bu tanıtım sayfalarında reklam, üçüncü taraf izleme betiği veya analiz çerezi bulunmaz. Barındırma hizmeti isteklerin teknik kayıtlarını işleyebilir.</p>
<h2>Değişiklikler ve iletişim</h2><p>İşlevler veya veri uygulamaları değiştiğinde bu metin ve güncelleme tarihi yenilenir. Sorularınızı <a href="mailto:${contact}">${contact}</a> adresine gönderebilirsiniz.</p>`);

const terms = layout('Kullanım Koşulları', `
<h1>Kullanım Koşulları</h1><p><small>Güncelleme: 13 Eylül 2026</small></p>
<h2>Hizmet</h2><p>AESD-Kasa, işletme kayıtlarının ve cari hesapların takibini destekleyen bir uygulamadır. Resmî muhasebe kayıtları, vergi bildirimleri veya profesyonel mali danışmanlık yerine geçmez. Girdiğiniz bilgilerin doğruluğunu ve raporları kontrol etmelisiniz.</p>
<h2>Hesap ve lisans</h2><p>Kullanım, yöneticinin tanımladığı hesap, cihaz ve lisans koşullarına bağlıdır. Ücret, süre ve cihaz sayısı lisans verilmeden önce kullanıcıyla belirlenir. Uygulama dosyasına sahip olmak tek başına kullanım yetkisi sağlamaz. Yetkisiz paylaşım ve güvenlik denetimlerini aşma girişimleri erişimin askıya alınmasına yol açabilir.</p>
<h2>Kayıtlar ve yedekleme</h2><p>Uygulamaya girdiğiniz verileri işlemeye yetkili olmalısınız. Önemli kayıtların bağımsız yedeklerini saklayın. İnternet, sunucu veya e-posta sağlayıcısındaki kesintiler erişimi ve kod teslimini etkileyebilir; kesintisiz hizmet ya da sınırsız e-posta gönderimi taahhüt edilmez.</p>
<h2>Gizlilik ve destek</h2><p>Verilerin işlenmesi <a href="/privacy">Gizlilik Politikası</a> sayfasında açıklanır. Lisans, iptal, hesap silme ve destek talepleri için <a href="mailto:${contact}">${contact}</a> adresi kullanılabilir. Emredici mevzuattan doğan haklarınız saklıdır.</p>`);

export function registerPublicPages(app) {
  for (const [path, html] of [['/', home], ['/privacy', privacy], ['/terms', terms]]) {
    app.get(path, (_req, res) => {
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Referrer-Policy', 'no-referrer');
      res.set('Cache-Control', 'public, max-age=300');
      res.type('html').send(html);
    });
  }
}
