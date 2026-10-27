// Göksel ve Mert kullanıcılarına özel araç (plaka) ve şoför çapraz kontrol mekanizması
// Onay verildiğinde 2 saat boyunca (cooldown) tekrar uyarı gösterilmez.

const COOLDOWN_DURATION_MS = 2 * 60 * 60 * 1000; // 2 Saat
const COOLDOWN_PREFIX = 'tir_truck_guard_v3_';

export const getGuardedUserConfig = (sessionOrUsername) => {
    let rawUsername = '';
    let rawUid = '';

    if (typeof sessionOrUsername === 'string') {
        rawUsername = sessionOrUsername;
    } else if (sessionOrUsername && typeof sessionOrUsername === 'object') {
        rawUsername = sessionOrUsername.username || '';
        rawUid = sessionOrUsername.uid || '';
    }

    if (typeof window !== 'undefined') {
        if (!rawUsername) rawUsername = localStorage.getItem('tir_current_user') || '';
        if (!rawUid) rawUid = localStorage.getItem('tir_current_uid') || '';
    }

    const norm = (rawUsername || '').trim().toLocaleLowerCase('tr-TR');

    if (
        rawUid === 'G0P5H6Jc99VCHmoaovm3hEvOe7h2' ||
        norm === 'göksel' ||
        norm === 'goksel' ||
        norm === 'gksel' ||
        norm.includes('göksel') ||
        norm.includes('goksel') ||
        norm.includes('gksel')
    ) {
        return {
            userKey: 'goksel',
            honorific: 'Göksel Bey',
            expectedPlateTag: 'FTN',
            expectedDefaultPlate: '06 FTN 692',
            expectedDefaultTruckId: 'truck_06ftn692',
            expectedDriverTag: 'göksel',
            expectedDriverAltTag: 'goksel',
            expectedDriverFullName: 'Göksel İnaner'
        };
    }

    if (
        rawUid === 'eNNEc7hoURWPUitBwWTj38XHKro1' ||
        norm === 'mert' ||
        norm.includes('mert')
    ) {
        return {
            userKey: 'mert',
            honorific: 'Mert Bey',
            expectedPlateTag: 'CVA',
            expectedDefaultPlate: '06 CVA609',
            expectedDefaultTruckId: 'lrKVbFEF5rKQcWPAbC0l',
            expectedDriverTag: 'mert',
            expectedDriverAltTag: 'mert',
            expectedDriverFullName: 'Mert Can İnaner'
        };
    }

    return null;
};

export const isGuardOnCooldown = (userKey) => {
    if (!userKey || typeof window === 'undefined') return false;
    const raw = localStorage.getItem(`${COOLDOWN_PREFIX}${userKey}`);
    if (!raw) return false;
    const expiresAt = Number(raw);
    if (isNaN(expiresAt)) return false;
    return Date.now() < expiresAt;
};

export const setGuardCooldown = (userKey) => {
    if (!userKey || typeof window === 'undefined') return;
    const expiresAt = Date.now() + COOLDOWN_DURATION_MS;
    localStorage.setItem(`${COOLDOWN_PREFIX}${userKey}`, String(expiresAt));
};

export const clearGuardCooldowns = () => {
    if (typeof window === 'undefined') return;
    ['goksel', 'mert'].forEach(k => {
        localStorage.removeItem(`tir_truck_guard_cooldown_${k}`);
        localStorage.removeItem(`${COOLDOWN_PREFIX}${k}`);
    });
};

export const findUserOwnTruck = (trucks, config) => {
    if (!config || !Array.isArray(trucks) || trucks.length === 0) return null;
    return (
        trucks.find(t => (t.plate || '').toUpperCase().includes(config.expectedPlateTag)) ||
        trucks.find(t => t.id === config.expectedDefaultTruckId) ||
        trucks.find(t => (t.id || '').toLowerCase().includes(config.expectedPlateTag.toLowerCase())) ||
        null
    );
};

export const isPlateMatchingUser = (plate, config) => {
    if (!config) return true;
    if (!plate) return false;
    return plate.toUpperCase().includes(config.expectedPlateTag);
};

export const isDriverMatchingUser = (driverName, config) => {
    if (!config) return true;
    if (!driverName || !driverName.trim()) return true;
    const norm = driverName.trim().toLocaleLowerCase('tr-TR');
    return norm.includes(config.expectedDriverTag) || norm.includes(config.expectedDriverAltTag);
};
