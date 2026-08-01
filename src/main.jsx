import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { CompanyProvider } from './context/CompanyContext.jsx'
import { TruckProvider } from './context/TruckContext.jsx'
import { DataProvider } from './context/DataContext.jsx'

// Kalıcı Cache Temizleyici: firebase-messaging-sw dışındaki Service Worker'ları Yok Et
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (registrations) {
    for (let registration of registrations) {
      const scriptURL = registration.active?.scriptURL || registration.installing?.scriptURL || registration.waiting?.scriptURL || '';
      if (!scriptURL.includes('firebase-messaging-sw.js')) {
        registration.unregister().then(() => {
          console.log('Eski/Farklı Service Worker kaldırıldı:', scriptURL);
        });
      }
    }
  });

  // Firebase Messaging Service Worker'ını kaydet
  navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .then((reg) => {
      console.log('Firebase Service Worker başarıyla kaydedildi:', reg.scope);
    })
    .catch((err) => {
      console.error('Firebase Service Worker kaydı başarısız:', err);
    });
}
if ('caches' in window) {
  caches.keys().then((names) => {
    names.forEach(name => {
      caches.delete(name);
    });
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
