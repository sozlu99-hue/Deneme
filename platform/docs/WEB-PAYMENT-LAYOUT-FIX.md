# Web ödeme alanı düzeltmesi — 9 Ekim 2026

Özel panel, eşitleme çubuğunun altında tam ekran yüksekliğini kullanıyordu. Dış çerçeve de üst menü için sabit bir yükseklik çıkarıyordu. Menü sarılınca veya Safari'nin kullanılabilir alanı değişince ödeme düğmesi ekranın altında kalabiliyordu.

Web kabuğu artık üst menünün gerçek yüksekliğinden sonra kalan alanı kullanır. Telefonun güvenli ekran kenarları korunur. Özel panel, eşitleme çubuğundan sonra kalan alanı kullanır. Sepet ayrıntıları kayar; genel toplam ve ödeme düğmeleri ayrı, sabit alandadır. Kısa ekranda bu iki bölüm daha az boşluk kullanır. Ayarlar açılınca normal sayfa kaydırması geri gelir.

Bu görünüm yalnız `audience=all` web çalışmasına bağlı sınıflarla etkinleşir. APK yeniden üretilmedi veya dağıtılmadı. Ödeme işlevi, satış tutarı, stok düşümü ve kalıcı satış kuyruğu değişmedi.

Ana otomatik testler ve özel panel regresyonları yeniden çalıştırıldı. Yalıtılmış DOM kontrolü, yeni sepet gruplarını, 100 TL ödeme tutarını, ödeme yöntemleri penceresinin açılışını ve hatasız React yüklemesini kontrol eder. Bu kontrol piksel yerleşimi testi değildir. Chromium başlatma bu ortamda başarısız oldu. Yeni tarayıcı ekran kontrolü ve gerçek iPhone/tablet testi yapılmış sayılmaz. Kanıtlar `evidence/web-payment-*` dosyalarındadır.

The web frame uses the space below the header.
The private panel uses the space below the sync bar.
Cart details scroll inside the panel.
The total and payment controls stay in a separate area.
The change does not modify a recorded sale.
The DOM check does not confirm the screen layout on an iPhone.
