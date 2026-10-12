import { messaging, db } from './firebaseConfig';
import { getToken } from 'firebase/messaging';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { parseDevice } from '../utils/visitorTracker';

/**
 * Kullanıcıdan bildirim izni ister, FCM token'ı alır ve cihaz detaylarıyla birlikte approved_users dökümanına kaydeder.
 * @param {string} userId - Giriş yapmış kullanıcının UID'si
 * @returns {Promise<{ success: boolean, token?: string, error?: string, permission?: string, device?: object }>}
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
          ? 'Bildirim izni tarayıcı tarafından engellendi. Adres çubuğundaki site ayarlarından bildirim iznini "İzin Ver" olarak değiştirin ve sayfayı yenileyin.'
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

    // 4. VAPID anahtarı kontrolü
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

    // Bu cihazın tokenını yerel bellekte sakla (hangi cihazın aktif olduğunu hemen anlamak için)
    try {
      localStorage.setItem('fcm_device_token', token);
    } catch {}

    const dev = parseDevice();
    const deviceDetail = {
      token,
      deviceName: dev.deviceName || `${dev.os} (${dev.browser})`,
      model: dev.model || dev.os,
      deviceType: dev.deviceType,
      os: dev.os,
      browser: dev.browser,
      registeredAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };

    // 6. Firestore'a kaydet (approved_users dökümanı)
    if (userId) {
      const userRef = doc(db, 'approved_users', userId);
      const userSnap = await getDoc(userRef);
      const existingDevices = (userSnap.exists() && Array.isArray(userSnap.data()?.fcmDevices))
        ? userSnap.data().fcmDevices
        : [];

      const updatedDevices = [
        ...existingDevices.filter(d => (typeof d === 'object' && d?.token ? d.token !== token : d !== token)),
        deviceDetail
      ];

      await setDoc(userRef, {
        fcmTokens: arrayUnion(token),
        fcmDevices: updatedDevices,
        lastActive: new Date().toISOString()
      }, { merge: true });
    }

    return { success: true, token, device: deviceDetail, permission: 'granted' };
  } catch (err) {
    console.error('[FCM] Bildirim kaydı sırasında hata:', err);
    return { 
      success: false, 
      error: `Bildirim kaydı başarısız: ${err.message || err}` 
    };
  }
}

/**
 * Belirtilen bildirim token'ını kullanıcının dökümanından siler.
 * @param {string} userId 
 * @param {string} tokenToRemove 
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function removeNotificationToken(userId, tokenToRemove) {
  if (!userId || !tokenToRemove) return { success: false, error: 'Eksik parametre.' };
  try {
    const userRef = doc(db, 'approved_users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return { success: false, error: 'Kullanıcı bulunamadı.' };
    }

    const data = userSnap.data();
    const updatedTokens = (data.fcmTokens || []).filter(t => t !== tokenToRemove);
    const updatedDevices = (data.fcmDevices || []).filter(d => (typeof d === 'object' && d?.token ? d.token !== tokenToRemove : d !== tokenToRemove));

    await updateDoc(userRef, {
      fcmTokens: updatedTokens,
      fcmDevices: updatedDevices
    });

    if (typeof window !== 'undefined' && localStorage.getItem('fcm_device_token') === tokenToRemove) {
      localStorage.removeItem('fcm_device_token');
    }

    return { success: true };
  } catch (err) {
    console.error('[FCM] Cihaz tokenı silinirken hata:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Bir cihaz için özel isim belirler veya günceller (Örn: "Kenan iPhone 14 Pro", "Babamın Telefonu")
 * @param {string} userId 
 * @param {string} token 
 * @param {string} customName 
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function updateDeviceCustomName(userId, token, customName) {
  if (!userId || !token) return { success: false, error: 'Eksik parametre.' };
  try {
    const userRef = doc(db, 'approved_users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return { success: false, error: 'Kullanıcı bulunamadı.' };
    }

    const data = userSnap.data();
    const existingDevices = Array.isArray(data.fcmDevices) ? data.fcmDevices : [];

    let found = false;
    const updatedDevices = existingDevices.map(d => {
      const dToken = typeof d === 'string' ? d : d?.token;
      if (dToken === token) {
        found = true;
        return typeof d === 'string'
          ? { token, customName: customName.trim(), lastActive: new Date().toISOString() }
          : { ...d, customName: customName.trim() };
      }
      return d;
    });

    if (!found) {
      updatedDevices.push({
        token,
        customName: customName.trim(),
        lastActive: new Date().toISOString()
      });
    }

    const existingNicknames = data.deviceNicknames || {};
    const updatedNicknames = {
      ...existingNicknames,
      [token]: customName.trim()
    };

    await setDoc(userRef, {
      fcmDevices: updatedDevices,
      deviceNicknames: updatedNicknames
    }, { merge: true });

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`device_nickname_${token}`, customName.trim());
      } catch {}
    }

    return { success: true };
  } catch (err) {
    console.error('[FCM] Cihaz ismi güncellenirken hata:', err);
    return { success: false, error: err.message };
  }
}

