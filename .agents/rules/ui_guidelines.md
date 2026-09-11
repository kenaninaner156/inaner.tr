---
description: Kurumsal UI/UX Standartları, Tasarım Dili ve Dil Kuralları
globs: ["src/**/*.{js,jsx,ts,tsx,css}"]
always_on: true
---

# Kurumsal UI/UX ve Tasarım Kuralları

Bu kurallar kullanıcının kesin direktifleri doğrultusunda projede kalıcı olarak uygulanır:

1. **Kesinlikle Sıfır Emoji**:
   - Arayüzde, başlıklarda, alt başlıklarda, butonlarda, badge'lerde, sekme etiketlerinde, toast/bildirim mesajlarında ve placeholder metinlerinde hiçbir emoji (🚚, 💰, 👤, ⚠️, 🚨, 📋 vb.) kullanılmamalıdır.
   - İkon ihtiyacı için daima `lucide-react` vektörel SVG ikonları (Users, CreditCard, Calendar, AlertTriangle, CheckCircle2, Truck vb.) kullanılmalıdır.

2. **Yapay Zeka ve Robotik Metin Yasağı**:
   - Robotik, yapay zeka kokan, gereksiz uzun ve laf kalabalığı içeren açıklamalardan kesinlikle kaçınılmalıdır.
   - Doğrudan konuya odaklanan, jilet gibi net, kurumsal Türkçe lojistik ve finans terminolojisi kullanılmalıdır.

3. **Obsidian Cam Tasarım Standardı**:
   - `CompanyDebts.jsx` sayfasında yakalanan yüksek kontrastlı, koyu Obsidian panel arka planları (`#0a0d14`), ince cam çerçeveler (`border-white/[0.06]`), pürüzsüz micro-interaction'lar ve şık monospaced finansal rakamlar referans alınmalıdır.

4. **Mobil ve iPad Kusursuz Uyumu**:
   - Mobil (360px - 430px): Tek sütunlu akıcı Master-Detail akışı, dokunmatik dostu butonlar (min 40px), yatay taşma (horizontal scrollbar) olmaması, ekranın altına yapışmayan esnek dialoglar.
   - iPad / Tablet (768px - 1024px): 2 sütunlu dengeli defter düzeni, sanal klavye açıldığında form butonlarının erişilebilir kalması (`max-h-[85vh] overflow-y-auto`).
   - Masaüstü (1280px+): Geniş ekranı dolduran, ferah çift panel düzeni.
