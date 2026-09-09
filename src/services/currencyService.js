/**
 * Canlı Döviz & Altın Kurları Servisi
 * USD, EUR ve Farklı Ayarlardaki Altın Kurlarını çeker ve TL karşılıklarını hesaplar.
 */

const DEFAULT_RATES = {
    USD: 48.50,
    EUR: 56.40,
    GOLD_GRAM_24: 6850, // 24 Ayar Gram Has Altın
    lastUpdated: new Date().toISOString()
};

const TROY_OUNCE_TO_GRAM = 31.1034768;

export const GOLD_PURITY = {
    'GOLD_GRAM_24': { label: 'Gram Altın (24 Ayar Has)', purity: 1.0, isByGram: true },
    'GOLD_BILEZIK_22': { label: '22 Ayar Bilezik (Gram)', purity: 0.916, isByGram: true },
    'GOLD_14': { label: '14 Ayar Altın / Hurda (Gram)', purity: 0.585, isByGram: true },
    'GOLD_CEYREK': { label: 'Çeyrek Altın (Adet)', weightGram: 1.754, purity: 0.916, isByGram: false },
    'GOLD_YARIM': { label: 'Yarım Altın (Adet)', weightGram: 3.508, purity: 0.916, isByGram: false },
    'GOLD_TAM': { label: 'Tam / Ziynet Altın (Adet)', weightGram: 7.016, purity: 0.916, isByGram: false },
    'GOLD_ATA': { label: 'Cumhuriyet / Ata Altın (Adet)', weightGram: 7.216, purity: 0.916, isByGram: false }
};

/**
 * Cache veya varsayılan kurları getirir
 */
export const getStoredRates = () => {
    try {
        const stored = localStorage.getItem('tir_market_rates');
        if (stored) {
            return JSON.parse(stored);
        }
    } catch {
        // ignore
    }
    return DEFAULT_RATES;
};

/**
 * Kullanıcı tarafından el ile belirlenen özel kurları getirir
 */
export const getCustomRates = () => {
    try {
        const custom = localStorage.getItem('tir_custom_market_rates');
        if (custom) {
            return JSON.parse(custom);
        }
    } catch {
        // ignore
    }
    return null;
};

export const saveCustomRates = (rates) => {
    if (!rates) {
        localStorage.removeItem('tir_custom_market_rates');
    } else {
        localStorage.setItem('tir_custom_market_rates', JSON.stringify(rates));
    }
};

/**
 * Canlı kurları dış API'lerden çeker
 */
export const fetchLiveRates = async () => {
    let rates = { ...getStoredRates() };

    // 1. Döviz kurları (USD, EUR)
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (res.ok) {
            const data = await res.json();
            if (data.rates && data.rates.TRY) {
                const usdTry = data.rates.TRY;
                const eurTry = data.rates.EUR ? (usdTry / data.rates.EUR) : (usdTry * 1.16);
                rates.USD = parseFloat(usdTry.toFixed(2));
                rates.EUR = parseFloat(eurTry.toFixed(2));
            }
        }
    } catch (e) {
        console.warn('Döviz kurları çekilemedi, yerel kur kullanılıyor:', e);
    }

    // 2. Altın Kurları (PAX-Gold 1 oz London fiziki altın fiyatı)
    try {
        const resGold = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold,tether-gold&vs_currencies=try');
        if (resGold.ok) {
            const dataGold = await resGold.json();
            const paxTry = dataGold['pax-gold']?.try || dataGold['tether-gold']?.try;
            if (paxTry && paxTry > 0) {
                const gramHasAltin = paxTry / TROY_OUNCE_TO_GRAM;
                rates.GOLD_GRAM_24 = Math.round(gramHasAltin);
            }
        }
    } catch (e) {
        console.warn('Canlı altın kuru çekilemedi, yerel kur kullanılıyor:', e);
    }

    rates.lastUpdated = new Date().toISOString();
    try {
        localStorage.setItem('tir_market_rates', JSON.stringify(rates));
    } catch {}

    return rates;
};

/**
 * Efektif kurları hesaplar (Özel kur varsa öncelikli)
 */
export const getEffectiveRates = (baseRates, customRates) => {
    const rates = { ...(baseRates || getStoredRates()) };
    if (customRates) {
        if (customRates.USD) rates.USD = parseFloat(customRates.USD);
        if (customRates.EUR) rates.EUR = parseFloat(customRates.EUR);
        if (customRates.GOLD_GRAM_24) rates.GOLD_GRAM_24 = parseFloat(customRates.GOLD_GRAM_24);
    }

    // Altın türevlerini hesapla
    const g24 = rates.GOLD_GRAM_24 || DEFAULT_RATES.GOLD_GRAM_24;
    rates.GOLD_BILEZIK_22 = Math.round(g24 * 0.916);
    rates.GOLD_14 = Math.round(g24 * 0.585);
    rates.GOLD_CEYREK = Math.round(g24 * 1.754 * 0.916);
    rates.GOLD_YARIM = Math.round(rates.GOLD_CEYREK * 2);
    rates.GOLD_TAM = Math.round(rates.GOLD_CEYREK * 4);
    rates.GOLD_ATA = Math.round(g24 * 7.216 * 0.916);

    return rates;
};

/**
 * Verilen miktar ve borç cinsinin güncel TL karşılığını hesaplar
 * @param {number} amount - Miktar (TL, Döviz veya Altın Gram/Adet)
 * @param {string} currencyType - 'TL', 'USD', 'EUR', 'GOLD_GRAM_24', 'GOLD_BILEZIK_22', 'GOLD_CEYREK' vb.
 * @param {object} rates - getEffectiveRates çıktısı
 */
export const calculateTryEquivalent = (amount, currencyType, rates) => {
    const qty = Number(amount) || 0;
    if (qty <= 0) return 0;
    if (!currencyType || currencyType === 'TL') return qty;

    const effRates = rates || getEffectiveRates();

    switch (currencyType) {
        case 'USD':
            return qty * (effRates.USD || 48.5);
        case 'EUR':
            return qty * (effRates.EUR || 56.4);
        case 'GOLD_GRAM_24':
            return qty * (effRates.GOLD_GRAM_24 || 6850);
        case 'GOLD_BILEZIK_22':
            return qty * (effRates.GOLD_BILEZIK_22 || 6280);
        case 'GOLD_14':
            return qty * (effRates.GOLD_14 || 4010);
        case 'GOLD_CEYREK':
            return qty * (effRates.GOLD_CEYREK || 11020);
        case 'GOLD_YARIM':
            return qty * (effRates.GOLD_YARIM || 22040);
        case 'GOLD_TAM':
            return qty * (effRates.GOLD_TAM || 44080);
        case 'GOLD_ATA':
            return qty * (effRates.GOLD_ATA || 45400);
        default:
            return qty;
    }
};
