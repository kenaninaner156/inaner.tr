import fs from 'fs';

const data = JSON.parse(fs.readFileSync('live_full_backup.json', 'utf8'));

// Eylül faturalarının içindeki trip ID'leri incele
const septInvoices = data.invoices.filter(i => !i.deleted && i.startDate?.startsWith('2026-09'));

console.log("=== EYLÜL FATURALARI VE İÇİNDEKİ SEFERLER ===");
septInvoices.forEach(inv => {
    console.log(`\nFatura: ${inv.startDate} - ${inv.endDate} | Toplam Tutar: ${inv.grandTotal} TL | Sefer Sayısı: ${(inv.trips || []).length}`);
    const tripTrucks = {};
    (inv.trips || []).forEach(t => {
        // Find full trip from trips collection
        const fullTrip = data.trips.find(x => x.id === t.id);
        const truckId = fullTrip ? fullTrip.truckId : (t.truckId || 'Bilinmeyen');
        tripTrucks[truckId] = (tripTrucks[truckId] || 0) + 1;
    });
    console.log("   Araç Dağılımı:", tripTrucks);
});
