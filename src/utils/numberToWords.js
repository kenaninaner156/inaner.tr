/**
 * Türkçe sayıyı yazıya çevirir.
 * Örnek: 326296.63 → "ÜçYüzYirmiAltıBinİkiYüzDoksanAltı Türk Lirası AltmışÜç Kuruş"
 */

const BIRLER = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
const ONLAR = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
const BUYUKLER = ['', 'Bin', 'Milyon', 'Milyar', 'Trilyon'];

function ucHaneYaz(n) {
    if (n === 0) return '';
    let sonuc = '';
    const yuzler = Math.floor(n / 100);
    const kalanlar = n % 100;
    const onlar = Math.floor(kalanlar / 10);
    const birler = kalanlar % 10;

    if (yuzler === 1) sonuc += 'Yüz';
    else if (yuzler > 1) sonuc += BIRLER[yuzler] + 'Yüz';

    sonuc += ONLAR[onlar];
    sonuc += BIRLER[birler];
    return sonuc;
}

function tamSayiYaz(n) {
    if (n === 0) return 'Sıfır';

    let sonuc = '';
    const gruplar = [];
    let kalan = n;
    while (kalan > 0) {
        gruplar.unshift(kalan % 1000);
        kalan = Math.floor(kalan / 1000);
    }

    for (let i = 0; i < gruplar.length; i++) {
        const grup = gruplar[i];
        const basamak = gruplar.length - 1 - i;

        if (grup === 0) continue;

        // "Bir Bin" yerine Türkçe'de sadece "Bin" denir
        if (basamak === 1 && grup === 1) {
            sonuc += 'Bin';
        } else {
            sonuc += ucHaneYaz(grup) + BUYUKLER[basamak];
        }
    }

    return sonuc;
}

/**
 * Ondalıklı sayıyı Türkçe fatura ifadesine çevirir.
 * @param {number} tutar — Türk Lirası cinsinden tutar
 * @returns {string} — "Yalnız BirYüzElli Türk Lirası ElliBir Kuruş'tur."
 */
export function tutarYazıyla(tutar) {
    if (typeof tutar !== 'number' || isNaN(tutar) || tutar < 0) return '';

    const toplam = Math.round(tutar * 100);
    const lira = Math.floor(toplam / 100);
    const kurus = toplam % 100;

    const liraYazi = tamSayiYaz(lira);
    const kurusYazi = kurus > 0 ? tamSayiYaz(kurus) : null;

    let sonuc = `Yalnız ${liraYazi} Türk Lirası`;
    if (kurusYazi) {
        sonuc += ` ${kurusYazi} Kuruş`;
    }
    sonuc += `'tur.`;
    return sonuc;
}
