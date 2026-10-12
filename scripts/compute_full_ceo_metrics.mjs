import fs from 'fs';

const data = JSON.parse(fs.readFileSync('live_full_backup.json', 'utf8'));

// 1. Ay bazlı Gelirler (Faturalar)
const months = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

const report = {};
months.forEach(m => {
    report[m] = {
        month: m,
        revenue: 0,
        tripsCount: 0,
        tripsTruck1: 0,
        tripsTruck2: 0,
        tonnageTruck1: 0,
        tonnageTruck2: 0,
        kmTruck1: 0,
        kmTruck2: 0,
        fuelCostTruck1: 0,
        fuelCostTruck2: 0,
        fuelLitersTruck1: 0,
        fuelLitersTruck2: 0,
        maintenanceTruck1: 0,
        maintenanceTruck2: 0,
        penalties: 0,
        taxesAndOfficial: 0,
        netProfit: 0
    };
});

// Faturalar üzerinden gelir
const activeInvoices = data.invoices.filter(i => !i.deleted && (i.truckId === 'truck_06ftn692' || i.truckId === 'lrKVbFEF5rKQcWPAbC0l' || i.truckId === null));
activeInvoices.forEach(inv => {
    const m = (inv.startDate || '').substring(0, 7);
    if (report[m]) {
        report[m].revenue += (Number(inv.grandTotal) || 0);
    }
});

// Seferler
const activeTrips = data.trips.filter(t => !t.deleted);
activeTrips.forEach(t => {
    const m = (t.date || '').substring(0, 7);
    if (report[m]) {
        report[m].tripsCount++;
        const ton = Number(t.tonnage) || 0;
        const km = Number(t.km) || 0;
        if (t.truckId === 'truck_06ftn692') {
            report[m].tripsTruck1++;
            report[m].tonnageTruck1 += ton;
            report[m].kmTruck1 += km;
        } else if (t.truckId === 'lrKVbFEF5rKQcWPAbC0l') {
            report[m].tripsTruck2++;
            report[m].tonnageTruck2 += ton;
            report[m].kmTruck2 += km;
        }
    }
});

// Yakıt
const activeFuel = data.fuel.filter(f => !f.deleted);
activeFuel.forEach(f => {
    const m = (f.date || '').substring(0, 7);
    if (report[m]) {
        const cost = Number(f.price || f.cost || f.totalAmount) || 0;
        const liters = Number(f.liters) || 0;
        if (f.truckId === 'truck_06ftn692') {
            report[m].fuelCostTruck1 += cost;
            report[m].fuelLitersTruck1 += liters;
        } else if (f.truckId === 'lrKVbFEF5rKQcWPAbC0l') {
            report[m].fuelCostTruck2 += cost;
            report[m].fuelLitersTruck2 += liters;
        }
    }
});

// Bakım
const activeMaint = data.maintenance.filter(m => !m.deleted);
activeMaint.forEach(m => {
    const month = (m.date || '').substring(0, 7);
    if (report[month]) {
        const cost = Number(m.cost) || 0;
        if (m.truckId === 'truck_06ftn692') {
            report[month].maintenanceTruck1 += cost;
        } else if (m.truckId === 'lrKVbFEF5rKQcWPAbC0l') {
            report[month].maintenanceTruck2 += cost;
        }
    }
});

// Cezalar
const activePenalties = data.penalties.filter(p => !p.deleted && (p.truckId === 'truck_06ftn692' || p.truckId === 'lrKVbFEF5rKQcWPAbC0l' || p.amount > 500));
activePenalties.forEach(p => {
    const m = (p.date || '').substring(0, 7);
    if (report[m]) {
        report[m].penalties += (Number(p.amount) || 0);
    }
});

// Resmi Ödemeler (Vergi, SGK vb.)
const activePayments = data.payments.filter(p => !p.deleted && p.type === 'Ödeme' && p.amount > 100);
activePayments.forEach(p => {
    const m = (p.date || '').substring(0, 7);
    if (report[m]) {
        report[m].taxesAndOfficial += (Number(p.amount) || 0);
    }
});

// Net Kâr Hesaplama
months.forEach(m => {
    const r = report[m];
    const totalExp = r.fuelCostTruck1 + r.fuelCostTruck2 + r.maintenanceTruck1 + r.maintenanceTruck2 + r.penalties + r.taxesAndOfficial;
    r.netProfit = r.revenue - totalExp;
    r.margin = r.revenue > 0 ? ((r.netProfit / r.revenue) * 100).toFixed(1) : 0;
});

console.log(JSON.stringify(report, null, 2));
