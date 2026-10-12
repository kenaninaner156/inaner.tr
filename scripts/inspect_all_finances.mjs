import fs from 'fs';

const data = JSON.parse(fs.readFileSync('live_full_backup.json', 'utf8'));

console.log("=== FATURALAR (INVOICES) TAM LİSTESİ ===");
const invoices = data.invoices.filter(i => !i.deleted);
console.log(`Toplam Aktif Fatura: ${invoices.length}`);

// Tarih sırasına göre
invoices.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

invoices.forEach(inv => {
    console.log(`ID: ${inv.id} | Araç: ${inv.truckId} | Dönem: ${inv.startDate} - ${inv.endDate} | Sefer: ${(inv.trips || []).length} | Tonaj: ${Number(inv.totalTonnage || 0).toFixed(1)} | GrandTotal: ${Math.round(Number(inv.grandTotal || 0))} TL | Not: ${inv.note || ''}`);
});

console.log("\n=== BAKIMLAR (MAINTENANCE) TAM LİSTESİ ===");
const maint = data.maintenance.filter(m => !m.deleted);
console.log(`Toplam Aktif Bakım: ${maint.length}`);
maint.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
maint.forEach(m => {
    console.log(`Tarih: ${m.date} | Araç: ${m.truckId} | Tür: ${m.type} | Maliyet: ${m.cost} TL | Km: ${m.km || '-'} | Açıklama: ${m.description || ''}`);
});

console.log("\n=== CEZALAR (PENALTIES) TAM LİSTESİ ===");
const penalties = data.penalties.filter(p => !p.deleted);
console.log(`Toplam Aktif Ceza: ${penalties.length}`);
penalties.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
penalties.forEach(p => {
    console.log(`Tarih: ${p.date} | Araç: ${p.truckId} | Tür: ${p.type} | Tutar: ${p.amount} TL | Ödendi: ${p.paid} | Sürücü: ${p.driver} | Açıklama: ${p.description || ''}`);
});

console.log("\n=== ÖDEMELER (PAYMENTS) TAM LİSTESİ ===");
const payments = data.payments.filter(p => !p.deleted);
console.log(`Toplam Aktif Ödeme: ${payments.length}`);
payments.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
payments.forEach(p => {
    console.log(`Tarih: ${p.date} | Tür: ${p.type} | Tutar: ${p.amount} TL | Araç: ${p.truckId || '-'} | Açıklama: ${p.description || ''}`);
});
