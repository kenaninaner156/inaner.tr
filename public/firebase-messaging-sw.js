/* eslint-env worker */
/* global firebase */
importScripts('https://www.gstatic.com/firebasejs/10.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.10.0/firebase-messaging-compat.js');

// Instant auto-update lifecycle
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Firebase credentials
firebase.initializeApp({
  apiKey: "AIzaSyDZBOiVMPCQEiGxvJ1SIbFIxpfr1xIHoYo",
  authDomain: "v2-tir.firebaseapp.com",
  projectId: "v2-tir",
  storageBucket: "v2-tir.firebasestorage.app",
  messagingSenderId: "1000600529147",
  appId: "1:1000600529147:web:526e80325687dc052e285e"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Arka planda bildirim alındı:', payload);

  // If the browser already handled the notification via WebPush standard payload,
  // do not duplicate it!
  if (payload.notification && Object.keys(payload.notification).length > 0) {
    console.log('[firebase-messaging-sw.js] Bildirim tarayıcı tarafından otomatik gösterildi, tekrar gösterilmiyor.');
    return;
  }

  const title = payload.data?.title || payload.notification?.title || "İnaner Lojistik";
  const body = payload.data?.body || payload.notification?.body || "";
  const targetTab = payload.data?.targetTab || 'detaylar';
  
  let actions = [];
  if (payload.data?.buttons) {
    try {
      const parsedBtns = JSON.parse(payload.data.buttons);
      if (Array.isArray(parsedBtns)) {
        parsedBtns.slice(0, 3).forEach(b => {
          if (b.actionType === 'ack_approved') {
            actions.push({ action: 'ack_approved', title: b.label || '👍 Onayladım' });
          } else if (b.actionType === 'ack_rejected') {
            actions.push({ action: 'ack_rejected', title: b.label || '❌ Sorun Var' });
          } else if (b.actionType === 'navigate' || b.targetTab) {
            actions.push({ action: `nav_${b.targetTab || 'detaylar'}`, title: b.label || '🚀 Sayfayı Aç' });
          }
        });
      }
    } catch (e) {
      console.warn('[sw] Buton parse hatası:', e);
    }
  }

  const notificationOptions = {
    body: body,
    icon: '/tir-clear.png',
    badge: '/tir-clear.png',
    tag: payload.data?.notificationId ? `inaner-${payload.data.notificationId}` : 'inaner-alert',
    renotify: false,
    silent: true, // Tamamen sessiz, OS sesi kapalı
    data: {
      url: targetTab ? `/#tab=${targetTab}` : '/',
      notificationId: payload.data?.notificationId || null,
      targetTab: targetTab,
      ...payload.data
    },
    actions: actions
  };

  self.registration.showNotification(title, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const notifData = event.notification.data || {};
  let targetUrl = notifData.url || '/';

  // Aksiyon butonlarına tıklandığında hedef sekmeyi ayarla
  if (event.action && event.action.startsWith('nav_')) {
    const tab = event.action.replace('nav_', '');
    targetUrl = `/#tab=${tab}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if (notifData.targetTab) {
            client.postMessage({ type: 'SWITCH_TAB', tab: notifData.targetTab });
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
