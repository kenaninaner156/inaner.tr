import { useState, useEffect } from 'react';

// ── Merkezi PIN Kilit Oturumu Yönetimi ──
// Borç & Kredi, Personel Yönetimi ve Vergi & SGK Masası ortak 5 dakikalık kilit oturumu paylaşır.
// Siteden çıkıldığında (sekme/tarayıcı kapatıldığında veya çıkış yapıldığında) otomatik kilitlenir.

const PIN_SESSION_KEY = 'tir_pin_unlock_timestamp';
const PIN_EXPIRY_MS = 5 * 60 * 1000; // 5 Dakika (300.000 ms)

/**
 * PIN oturumunun halen geçerli (5 dakika dolmamış ve oturum açık) olup olmadığını kontrol eder.
 */
export const isPinSessionValid = () => {
    try {
        const stored = sessionStorage.getItem(PIN_SESSION_KEY);
        if (!stored) return false;
        const timestamp = parseInt(stored, 10);
        if (isNaN(timestamp)) return false;

        const elapsed = Date.now() - timestamp;
        if (elapsed < PIN_EXPIRY_MS) {
            return true;
        }

        // 5 dakika dolmuşsa oturumu sonlandır
        sessionStorage.removeItem(PIN_SESSION_KEY);
        return false;
    } catch {
        return false;
    }
};

/**
 * Kalan geçerlilik süresini milisaniye cinsinden döner.
 */
export const getRemainingPinSessionMs = () => {
    try {
        const stored = sessionStorage.getItem(PIN_SESSION_KEY);
        if (!stored) return 0;
        const timestamp = parseInt(stored, 10);
        if (isNaN(timestamp)) return 0;

        const remaining = PIN_EXPIRY_MS - (Date.now() - timestamp);
        return remaining > 0 ? remaining : 0;
    } catch {
        return 0;
    }
};

/**
 * Şifre doğru girildiğinde 5 dakikalık oturumu başlatır ve tüm açık masaları bilgilendirir.
 */
export const setPinSessionUnlocked = () => {
    try {
        sessionStorage.setItem(PIN_SESSION_KEY, String(Date.now()));
        window.dispatchEvent(new CustomEvent('tir_pin_session_change', { detail: { unlocked: true } }));
    } catch (e) {
        console.error('PIN oturumu kaydetme hatası:', e);
    }
};

/**
 * Manuel kilitleme veya oturum kapatmada tüm masaları derhal kilitler.
 */
export const lockPinSession = () => {
    try {
        sessionStorage.removeItem(PIN_SESSION_KEY);
        window.dispatchEvent(new CustomEvent('tir_pin_session_change', { detail: { unlocked: false } }));
    } catch (e) {
        console.error('PIN oturumu temizleme hatası:', e);
    }
};

/**
 * React Hook: Bileşenlerin ortak 5 dakikalık kilit oturumunu reaktif olarak dinlemesini sağlar.
 */
export const usePinSession = () => {
    const [isUnlocked, setIsUnlocked] = useState(() => isPinSessionValid());

    useEffect(() => {
        // Oturum durumunu anlık kontrol et
        setIsUnlocked(isPinSessionValid());

        const handleSessionChange = (e) => {
            if (e?.detail?.unlocked !== undefined) {
                setIsUnlocked(e.detail.unlocked);
            } else {
                setIsUnlocked(isPinSessionValid());
            }
        };

        window.addEventListener('tir_pin_session_change', handleSessionChange);

        // Kalan süre kadar sonra otomatik kilitle
        let timer = null;
        const remaining = getRemainingPinSessionMs();
        if (remaining > 0) {
            timer = setTimeout(() => {
                lockPinSession();
            }, remaining);
        }

        return () => {
            window.removeEventListener('tir_pin_session_change', handleSessionChange);
            if (timer) clearTimeout(timer);
        };
    }, [isUnlocked]);

    const unlock = () => {
        setPinSessionUnlocked();
        setIsUnlocked(true);
    };

    const lock = () => {
        lockPinSession();
        setIsUnlocked(false);
    };

    return { isUnlocked, unlock, lock };
};
