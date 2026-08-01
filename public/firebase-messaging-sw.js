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
  console.log('[firebase-messaging-sw.js] Arka planda mesaj alındı:', payload);

  const notificationTitle = payload.notification?.title || "İnaner Lojistik";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: '/tir-clear.png',
    badge: '/tir-clear.png',
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
