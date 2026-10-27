// Göksel ve Mert kullanıcılarına özel araç (plaka) ve şoför çapraz kontrol mekanizması
// Onay verildiğinde 2 saat boyunca (cooldown) tekrar uyarı gösterilmez.

const COOLDOWN_DURATION_MS = 2 * 60 * 60 * 1000; // 2 Saat

export const getGuardedUserConfig = (username) => {
    if (!username || typeof username !== 'string') return null;
    const norm = username.trim().toLocaleLowerCase('tr-TR');

    if (norm === 'göksel' || norm === 'goksel' || norm === 'goksel@inaner.com') {
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

    if (norm === 'mert' || norm === 'mert@inaner.com') {
        return {
            userKey: 'mert',
            honorific: 'Mert Bey',
            expectedPlateTag: 'CVA',
            expectedDefaultPlate: '06 CVA609',
            expectedDefaultTruckId: 'truck_06cva609',
            expectedDriverTag: 'mert',
            expectedDriverAltTag: 'mert',
            expectedDriverFullName: 'Mert Can İnaner'
        };
    }

    return null;
};

export const isGuardOnCooldown = (userKey) => {
    if (!userKey || typeof window === 'undefined') return false;
    const raw = localStorage.getItem(`tir_truck_guard_cooldown_${userKey}`);
    if (!raw) return false;
    const expiresAt = Number(raw);
    if (isNaN(expiresAt)) return false;
    return Date.now() < expiresAt;
};

export const setGuardCooldown = (userKey) => {
    if (!userKey || typeof window === 'undefined') return;
    const expiresAt = Date.now() + COOLDOWN_DURATION_MS;
    localStorage.setItem(`tir_truck_guard_cooldown_${userKey}`, String(expiresAt));
};

export const findUserOwnTruck = (trucks, config) => {
    if (!config || !Array.isArray(trucks) || trucks.length === 0) return null;
    return (
        trucks.find(t => (t.plate || '').toUpperCase().includes(config.expectedPlateTag)) ||
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
