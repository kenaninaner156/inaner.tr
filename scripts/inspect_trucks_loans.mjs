import fs from 'fs';

const data = JSON.parse(fs.readFileSync('live_full_backup.json', 'utf8'));

console.log("=== ARAÇLAR LİSTESİ ===");
data.trucks.forEach(t => {
    console.log(JSON.stringify(t, null, 2));
});

console.log("\n=== TÜM KREDİLER (LOANS) ===");
data.loans.forEach(l => {
    console.log(`ID: ${l.id} | Banka/Kurum: ${l.bankName} | Başlık: ${l.loanTitle} | Tür: ${l.loanType} | Toplam: ${l.totalAmount} TL | Aylık: ${l.monthlyAmount} TL | Vade: ${l.monthsCount} ay | Başlangıç: ${l.startDate}`);
});
