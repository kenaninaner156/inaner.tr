---
description: Yapılan değişiklikleri GitHub'a gönderip Vercel'de yayınlama
---

# Yerelden Vercel'e Deploy Etme Adımları

Bu proje `dev` branch'i üzerinden çalışır. Her commit sonrası Vercel otomatik olarak yayına alır.

## Ön Koşul
- Projenin dizini: `c:\Users\kenan\Documents\Kenan - IA\TIR money\tir-muhasebe-v2`
- Local test sunucusu açmak için: `npm run dev -- --host`

---

## Adım 1 — Çalışan Tüm Değişiklikleri Stage'e Al

// turbo
```powershell
cd 'c:\Users\kenan\Documents\Kenan - IA\TIR money\tir-muhasebe-v2'
git add .
```

## Adım 2 — Commit Yap (değişikliği anlatan bir mesaj yaz)

```powershell
git commit -m "feat: yapilanlar"
```

> Commit mesajı örnekleri:
> - `feat: swipe menu added`
> - `fix: mobile card layout fix`
> - `style: trip card redesign`

## Adım 3 — GitHub'a Gönder (Vercel bu push ile otomatik deploy eder)

// turbo
```powershell
git push origin dev
```

## Adım 4 — Vercel Deployment Durumunu Kontrol Et

```powershell
vercel ls
```

Çıktıda son satır `● Ready` ise site canlıda, `● Error` ise bir sorun var demektir.

---

## Hızlı Tek Komut (Her Şeyi Tek Seferde Yap)

// turbo
```powershell
cd 'c:\Users\kenan\Documents\Kenan - IA\TIR money\tir-muhasebe-v2'; git add . ; git commit -m "feat: degisiklikler" ; git push origin dev
```

> ⚠️ Commit mesajını her seferinde değiştirmeyi unutma!

---

## Sık Sorunlar ve Çözümleri

| Sorun | Çözüm |
|---|---|
| `git push` engellendi (push blocked) | Hassas dosya eklenmis olabilir. `git status` ile kontrol et, `.env.local` gibi dosyalar stage'de olmamalı |
| Vercel `Error` gösteriyor | `vercel logs` komutu ile detayı gör |
| Local'de mavi ekran / boş sayfa | `.env.local` dosyasının varlığını kontrol et, Firebase bilgileri eksik olabilir |
| Değişiklik Vercel'de görünmüyor | Cache temizle: tarayıcıda Ctrl+Shift+R (veya Safari'de Cmd+Option+R) |

---

## Dosyalar — Ne Nerede?

| Dosya | Açıklama |
|---|---|
| `src/App.jsx` | Ana uygulama bileşeni |
| `src/components/` | Tüm sayfa bileşenleri (Trips, Fuel, vb.) |
| `src/index.css` | Global stiller ve tema değişkenleri |
| `index.html` | Sayfa başlığı, favicon, meta taglar |
| `public/manifest.json` | Safari/Chrome uygulama adı ve ikon ayarı |
| `.env.local` | Local Firebase kimlik bilgileri (Git'e gönderilmez!) |
| `.env.production` | Vercel'deki canlı Firebase bilgileri |
