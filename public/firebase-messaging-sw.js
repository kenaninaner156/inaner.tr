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

  const title = payload.notification?.title || payload.data?.title || "İnaner Lojistik";
  const body = payload.notification?.body || payload.data?.body || "";
  const imageUrl = payload.notification?.image || payload.data?.imageUrl || payload.fcmOptions?.image || null;
  const targetTab = payload.data?.targetTab || 'dashboard';
  const buttonMode = payload.data?.buttonMode || 'nav'; // 'none' | 'nav' | 'ack' | 'both'
  const customNavLabel = payload.data?.customNavLabel || null;

  // Titreşim paterni
  let vibratePattern = [200, 100, 200];
  if (payload.data?.vibrationPattern === 'sos') {
    vibratePattern = [300, 100, 300, 100, 300, 200, 600, 100, 600, 100, 600, 200, 300, 100, 300];
  } else if (payload.data?.vibrationPattern === 'general') {
    vibratePattern = [200];
  } else if (payload.data?.vibrationPattern === 'silent') {
    vibratePattern = [];
  }

  const tabTitles = {
    dashboard: '📊 Özeti Aç',
    trips: '📋 Sefer Detayları',
    fuel: '⛽ Mazot Fişi Yükle',
    maintenance: '🔧 Araç Bakım',
    detaylar: '⚠️ Cezalar & Belgeler',
    invoices: '📑 Fatura Durumu',
    earsiv: '🧾 E-Arşiv Fatura',
    payments: '💳 Ödeme Takibi',
    map: '📍 Canlı Harita',
    chat: '💬 Sohbete Git'
  };

  const actions = [];
  if (buttonMode === 'ack' || buttonMode === 'both') {
    actions.push({ action: 'ack_approved', title: '👍 Onayladım' });
    actions.push({ action: 'ack_rejected', title: '❌ Sorun Var' });
  }
  if ((buttonMode === 'nav' || buttonMode === 'both') && targetTab) {
    actions.push({ action: `nav_${targetTab}`, title: customNavLabel || tabTitles[targetTab] || '🚀 Sayfayı Aç' });
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
