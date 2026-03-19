import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { CompanyProvider } from './context/CompanyContext.jsx'
// Kalıcı Cache Temizleyici: Tüm Service Worker'ları ve Cache Depolarını Yok Et
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (registrations) {
    for (let registration of registrations) {
      registration.unregister();
    }
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
