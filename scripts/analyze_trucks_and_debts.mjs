import fs from 'fs';

const data = JSON.parse(fs.readFileSync('live_full_backup.json', 'utf8'));

console.log("==========================================");
console.log("1. ARAÇLAR (TRUCKS)");
console.log("==========================================");
data.trucks.forEach(t => {
    console.log(`ID: ${t.id} | Plaka: ${t.plate || t.plaka || t.name} | Model: ${t.model || ''} | Marka: ${t.brand || ''} | Şoför: ${t.driver || t.defaultDriver || ''} | Silinmiş: ${t.deleted}`);
});

console.log("\n==========================================");
console.log("2. KREDİLER & BORÇLAR (LOANS)");
console.log("==========================================");
data.loans.forEach(l => {
    console.log(JSON.stringify(l, null, 2));
});

console.log("\n==========================================");
console.log("3. AÇIK BORÇLAR (OPEN_DEBTS)");
console.log("==========================================");
data.open_debts.forEach(d => {
    console.log(JSON.stringify(d, null, 2));
});
