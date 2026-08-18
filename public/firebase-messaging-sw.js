/* eslint-env worker */
/* global firebase */
importScripts('https://www.gstatic.com/firebasejs/10.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.10.0/firebase-messaging-compat.js');

// Firebase credentials (public credentials matching config)
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

  const title = payload.notification?.title || payload.data?.title || "İnaner Lojistik";
  const body = payload.notification?.body || payload.data?.body || "";
  
  const notificationOptions = {
    body: body,
    icon: '/tir-clear.png',
    badge: '/tir-clear.png',
    tag: 'inaner-alert',
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: payload.data?.click_action || payload.fcmOptions?.link || '/',
      ...payload.data
    },
    actions: [
      { action: 'open', title: '🚀 Uygulamayı Aç' }
    ]
  };

  self.registration.showNotification(title, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
