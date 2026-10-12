import fs from 'fs';

const data = JSON.parse(fs.readFileSync('live_full_backup.json', 'utf8'));

console.log("=== SEFERLER TARİH VE ARAÇ DAĞILIMI ===");
const trips = data.trips.filter(t => !t.deleted);
console.log(`Toplam Aktif Sefer: ${trips.length}`);

// Araç bazlı gruplama
const byTruck = {};
trips.forEach(t => {
    const tid = t.truckId || 'BELIRTILMEMIS';
    if (!byTruck[tid]) byTruck[tid] = [];
    byTruck[tid].push(t);
});

for (const tid in byTruck) {
    const list = byTruck[tid];
    const dates = list.map(t => t.date).filter(Boolean).sort();
    console.log(`\nAraç ID: ${tid} -> Toplam Sefer: ${list.length}`);
    console.log(`İlk Sefer: ${dates[0]} | Son Sefer: ${dates[dates.length - 1]}`);
    
    // Ay ay kırılım
    const months = {};
    list.forEach(t => {
        const m = (t.date || 'Tarihsiz').substring(0, 7);
        if (!months[m]) months[m] = { count: 0, ton: 0, km: 0 };
        months[m].count++;
        months[m].ton += (Number(t.tonnage) || 0);
        months[m].km += (Number(t.km) || 0);
    });
    for (const m in months) {
        console.log(`   ${m}: ${months[m].count} sefer | ${months[m].ton.toFixed(1)} ton | ${months[m].km} km`);
    }
}

console.log("\n=== YAKIT TARİH VE ARAÇ DAĞILIMI ===");
const fuel = data.fuel.filter(f => !f.deleted);
console.log(`Toplam Aktif Yakıt: ${fuel.length}`);
const fuelByTruck = {};
fuel.forEach(f => {
    const tid = f.truckId || 'BELIRTILMEMIS';
    if (!fuelByTruck[tid]) fuelByTruck[tid] = [];
    fuelByTruck[tid].push(f);
});

for (const tid in fuelByTruck) {
    const list = fuelByTruck[tid];
    const dates = list.map(f => f.date).filter(Boolean).sort();
    console.log(`\nAraç ID: ${tid} -> Yakıt Fişi: ${list.length}`);
    console.log(`İlk Yakıt: ${dates[0]} | Son Yakıt: ${dates[dates.length - 1]}`);
    const months = {};
    list.forEach(f => {
        const m = (f.date || 'Tarihsiz').substring(0, 7);
        if (!months[m]) months[m] = { count: 0, liters: 0, cost: 0 };
        months[m].count++;
        months[m].liters += (Number(f.liters) || 0);
        months[m].cost += (Number(f.price || f.cost || f.totalAmount) || 0);
    });
    for (const m in months) {
        console.log(`   ${m}: ${months[m].count} fiş | ${months[m].liters.toFixed(1)} L | ${Math.round(months[m].cost)} TL`);
    }
}
