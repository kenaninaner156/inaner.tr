import fs from 'fs';

const data = JSON.parse(fs.readFileSync('live_full_backup.json', 'utf8'));
const invoices = data.invoices.filter(i => !i.deleted);
invoices.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

console.log("=== TÜM AKTİF FATURALAR ===");
invoices.forEach(inv => {
    console.log(`Dönem: ${inv.startDate} - ${inv.endDate} | Araç: ${inv.truckId} | Sefer: ${(inv.trips || []).length} | Tonaj: ${Number(inv.totalTonnage || 0).toFixed(1)} | Tutar: ${Math.round(Number(inv.grandTotal || 0))} TL | Not: ${inv.note || ''}`);
});
