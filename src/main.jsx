import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { CompanyProvider } from './context/CompanyContext.jsx'
import { TruckProvider } from './context/TruckContext.jsx'
import { DataProvider } from './context/DataContext.jsx'

// Otomatik PWA Güncelleme ve Service Worker Yönetimi (iOS & Android & PC)
if ('serviceWorker' in navigator) {
  // 1. Service Worker'ı kaydet
  navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .then((reg) => {
      console.log('[SW] Service Worker kayıtlı:', reg.scope);

      // Uygulama her açıldığında / ön plana geldiğinde sunucudaki güncellemeyi sorgula
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
        }
      });

      // Her 45 saniyede bir sessizce güncelleme sorgula
      setInterval(() => {
        reg.update().catch(() => {});
      }, 45000);

      // Yeni bir sürüm tespit edildiğinde ve yüklendiğinde
      reg.onupdatefound = () => {
        const installingWorker = reg.installing;
        if (installingWorker) {
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] Yeni sürüm yüklendi! Otomatik yenileniyor...');
              window.location.reload();
            }
          };
        }
      };
    })
    .catch((err) => {
      console.error('[SW] Kayıt hatası:', err);
    });

  // Yeni servis işçisi aktifleştiğinde sayfayı otomatik tazele
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      console.log('[SW] Yeni Service Worker devraldı, sayfa yenileniyor.');
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CompanyProvider>
      <TruckProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </TruckProvider>
    </CompanyProvider>
  </StrictMode>,
)
