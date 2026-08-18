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
  const imageUrl = payload.notification?.image || payload.data?.imageUrl || payload.fcmOptions?.image || null;
  const targetTab = payload.data?.targetTab || 'dashboard';
  const requireAck = payload.data?.requireAck === 'true';

  // Titreşim paterni
  let vibratePattern = [200, 100, 200];
  if (payload.data?.vibrationPattern === 'sos') {
    vibratePattern = [300, 100, 300, 100, 300, 200, 600, 100, 600, 100, 600, 200, 300, 100, 300];
  } else if (payload.data?.vibrationPattern === 'general') {
    vibratePattern = [200];
  } else if (payload.data?.vibrationPattern === 'silent') {
    vibratePattern = [];
  }

  const actions = [];
  if (requireAck) {
    actions.push({ action: 'ack_approved', title: '👍 Onayladım' });
    actions.push({ action: 'ack_rejected', title: '❌ Sorun Var' });
  } else if (targetTab) {
    const tabTitles = {
      dashboard: '📊 Özeti Aç',
      trips: '🚚 Seferleri Gör',
      fuel: '⛽ Mazot Fişleri',
      maintenance: '🔧 Araç Bakım',
      detaylar: '⚠️ Cezalar & Belgeler',
      invoices: '📑 Faturalar',
      earsiv: '🧾 E-Arşiv',
      payments: '💳 Ödemeler',
      map: '📍 Canlı Harita',
      chat: '💬 Sohbete Git'
    };
    actions.push({ action: `nav_${targetTab}`, title: tabTitles[targetTab] || '🚀 Aç' });
  }
  
  const notificationOptions = {
    body: body,
    icon: '/tir-clear.png',
    badge: '/tir-clear.png',
    ...(imageUrl ? { image: imageUrl } : {}),
    tag: payload.data?.notificationId ? `inaner-${payload.data.notificationId}` : 'inaner-alert',
    renotify: true,
    vibrate: vibratePattern,
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
          // İstemci penceresine sekme değiştirme mesajı gönder
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
