/**
 * Tonaj değerini ton cinsine normalize eder.
 * Eğer değer > 200 ise kg cinsinden girilmiştir (ör. 37640 kg -> 37.64 ton).
 * 200 veya daha küçükse ton cinsindendir (ör. 40.20 ton -> 40.20 ton).
 * @param {number|string} val
 * @returns {number} Ton cinsinden sayı
 */
export const parseTonnageInTons = (val) => {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return 0;
    if (num > 200) {
        return num / 1000;
    }
    return num;
};
