# Project UI/UX Update Log - 2026-05-03

## Context
"Liquid Black" glassmorphism temasının uygulanması ve modüller arası animasyon/renk standartlarının belirlenmesi.

## Design Tokens & Standards

### 1. Color Strategy (Module-Based)
Her modülün kendine ait bir kimlik rengi (Identity Color) tanımlanmıştır:
- **Maintenance/Truck Management**: `Amber` (Kehribar)
- **Documents**: `Blue` (Mavi)
- **Penalties**: `Red` (Kırmızı)
- **Notifications**: `Amber` (Dikkat/Uyarı)
- **Fuel**: `Cyan` (Turkuaz)
- **Financial Amounts (₺)**: Sabit `Orange-400` (Okunabilirlik ve önem vurgusu için cyan temadan ayrıştırıldı).

### 2. Animation Specs (Standardized)
Uygulama genelinde "Apple-style" etkileşimler için aşağıdaki değerler kullanılır:

- **Pill Tab Bar (Framer Motion):**
  - `type: 'spring'`
  - `stiffness: 400`
  - `damping: 32`
  - `mass: 0.8`

- **Tab Content Transition:**
  - `mode: 'wait'` (Sequential exit/entry)
  - `duration: 0.1s` (Hızlı tepki için tween tercih edildi)
  - `ease: [0.25, 0.1, 0.25, 1]` (iOS Native Cubic-Bezier)
  - `y-shift: ±5px` (Hafif dikey hareket)

## Implementation Details

### File: `Fuel.jsx`
- Tutar display sınıfları `text-cyan-400`'den `text-orange-400`'e geri çekildi.
- Tablo ve mobil kartlardaki tüm ₺ simgeleri ve değerleri bu standartla senkronize edildi.

### File: `Detaylar.jsx`
- Klasik buton tab yapısı kaldırıldı; `AnimatePresence` ve `motion.div` ile sarmalanmış spring-pill yapısına geçildi.
- Redundant (gereksiz) `p` tag'i altındaki açıklama metinleri temizlendi.

### File: `Maintenance.jsx`
- Tab içerik animasyonu spring'den hızlı tween'e (`0.1s`) güncellendi (lag/delay sorununu çözmek için).

## Maintenance Notes
- Gelecekteki UI güncellemelerinde "finansal tutar" renklerini değiştirirken `orange-400` standardını bozmayın.
- Tab animasyonlarında `wait` modu ile spring kullanmayın (settle lag oluşur), daima hızlı tween tercih edin.
