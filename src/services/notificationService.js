import { messaging, db } from './firebaseConfig';
import { getToken } from 'firebase/messaging';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';

/**
 * Kullanıcıdan bildirim izni ister, FCM token'ı alır ve approved_users dökümanına kaydeder.
 * @param {string} userId - Giriş yapmış kullanıcının UID'si
 * @returns {Promise<{ success: boolean, token?: string, error?: string, permission?: string }>}
 */
export async function requestAndSaveNotificationToken(userId) {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Tarayıcı ortamı değil.' };
  }

  // 1. Tarayıcı desteği kontrolü
  if (!('Notification' in window)) {
    return { 
      success: false, 
      error: 'Bu tarayıcı anlık bildirimleri desteklemiyor. (iPhone kullanıyorsanız lütfen Safari\'de Paylaş > "Ana Ekrana Ekle" yaptıktan sonra açın).' 
    };
  }

  if (!('serviceWorker' in navigator)) {
    return { success: false, error: 'Tarayıcınızda Service Worker desteği bulunamadı.' };
  }

  try {
    // 2. İzin isteme
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        permission,
        error: permission === 'denied'
          ? 'Bildirim izni tarayıcı tarafından engellendi. Adres çubuğundaki kilit 🔒 simgesine tıklayarak bildirim iznini "İzin Ver" olarak değiştirin ve sayfayı yenileyin.'
          : 'Bildirim izni isteği onaylanmadı.'
      };
    }

    if (!messaging) {
      return { success: false, error: 'Firebase Messaging servisi bu tarayıcıda başlatılamadı.' };
    }

    // 3. Service Worker hazır olana kadar bekle
    let swRegistration = null;
    try {
      swRegistration = await navigator.serviceWorker.ready;
    } catch (swErr) {
      console.warn('Service worker ready beklenirken hata:', swErr);
    }

    // 4. VAPID anahtarı kontrolü (Yalnızca geçerli 80+ karakterlik public key'ler geçirilir)
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    const tokenOptions = {
      serviceWorkerRegistration: swRegistration || undefined
    };
    if (vapidKey && vapidKey.trim().length >= 80) {
      tokenOptions.vapidKey = vapidKey.trim();
    }

    // 5. FCM Token alımı
    const token = await getToken(messaging, tokenOptions);
    if (!token) {
      return { success: false, error: 'Cihaz için bildirim anahtarı (token) oluşturulamadı.' };
    }

    console.log('[FCM] Bildirim tokenı başarıyla üretildi:', token);

    // 6. Firestore'a kaydet
    if (userId) {
      const userRef = doc(db, 'approved_users', userId);
      await setDoc(userRef, {
        fcmTokens: arrayUnion(token),
        lastActive: new Date().toISOString()
      }, { merge: true });
    }

    return { success: true, token, permission: 'granted' };
  } catch (err) {
    console.error('[FCM] Bildirim kaydı sırasında hata:', err);
    return { 
      success: false, 
      error: `Bildirim kaydı başarısız: ${err.message || err}` 
    };
  }
}
