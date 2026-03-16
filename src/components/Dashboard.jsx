import React, { useContext, useState, useMemo } from 'react';
import {
    Activity,
    Wallet,
    CreditCard,
    Clock,
    Weight,
    ChevronLeft,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    Minus,
    CalendarDays,
    BarChart2,
    Fuel,
    Check,
    X
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { DataContext } from '../context/DataContext';

// --- Custom Tooltip ---
const CustomTooltip = ({ active, payload, label, isAllTime }) => {
    if (active && payload && payload.length) {
        const gelir = payload.find(p => p.dataKey === 'Gelir (KDV Dahil)');
        const gelirPrj = payload.find(p => p.dataKey === 'Tahmini Gelir');
        const gider = payload.find(p => p.dataKey === 'Gider');
        const mainGelir = gelir || gelirPrj;
        const net = mainGelir && gider ? mainGelir.value - gider.value : null;
        const isProjected = !gelir && gelirPrj;

        return (
            <div style={{
                background: 'rgba(10, 15, 30, 0.93)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '14px',
                padding: '12px 16px',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                minWidth: '190px'
            }}>
                <p style={{ color: '#64748b', fontSize: '10px', fontWeight: 700, marginBottom: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {isAllTime ? label : `${label}. Gün`}
                    {isProjected && <span style={{ marginLeft: '6px', color: '#f59e0b', fontSize: '9px' }}>TAHMİN</span>}
                </p>
                {payload.filter(p => p.value > 0).map((entry, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
                        <span style={{ color: '#94a3b8', fontSize: '11px', flex: 1 }}>{entry.name}:</span>
                        <span style={{ color: entry.color, fontSize: '12px', fontWeight: 700 }}>
                            ₺{Number(entry.value).toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
                        </span>
                    </div>
                ))}
                {net !== null && net !== 0 && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '8px', paddingTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#64748b', fontSize: '11px', flex: 1 }}>Net Kar:</span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: net >= 0 ? '#10b981' : '#f43f5e' }}>
                            {net >= 0 ? '+' : ''}₺{net.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
                        </span>
                    </div>
                )}
            </div>
        );
    }
    return null;
};

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const KDV_RATE = 1.20;
const FUEL_L_PER_100KM = 32;

const Dashboard = () => {
    const { trips, fuelRecords, maintenanceRecords, vehicleInfo, updateVehicleInfo } = useContext(DataContext);

    const now = new Date();
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [isAllTime, setIsAllTime] = useState(false);
    const [editingFuel, setEditingFuel] = useState(false);
    const [fuelInput, setFuelInput] = useState('');

    const activeTrips = useMemo(() => trips.filter(t => !t.deleted), [trips]);
    const activeFuel = useMemo(() => fuelRecords ? fuelRecords.filter(f => !f.deleted) : [], [fuelRecords]);
    const activeMaint = useMemo(() => maintenanceRecords ? maintenanceRecords.filter(m => !m.deleted) : [], [maintenanceRecords]);

    // --- Stat kartları ---
    const totalRevenue = activeTrips.reduce((s, t) => s + (t.tonnage * t.price), 0);
    const pendingTrips = activeTrips.filter(t => t.status === 'Fatura Bekliyor').length;
    const totalTonnage = activeTrips.reduce((s, t) => s + t.tonnage, 0);
    const totalFuelCost = activeFuel.reduce((s, r) => s + r.price, 0);
    const totalMaintenanceCost = activeMaint.reduce((s, r) => s + r.cost, 0);
    const totalExpense = totalFuelCost + totalMaintenanceCost;

    // --- Kalan yakıt hesabı ---
    const fuelCalib = vehicleInfo?.fuelCalibration || null;
    const estimatedRemainingFuel = useMemo(() => {
        if (!fuelCalib) {
            const totalLiters = activeFuel.reduce((s, f) => s + (f.liters || 0), 0);
            const totalKm = activeTrips.reduce((s, t) => s + (Number(t.km) || 0), 0);
            return Math.max(0, totalLiters - (totalKm / 100) * FUEL_L_PER_100KM);
        }
        const calibDate = new Date(fuelCalib.date);
        const fuelAfter = activeFuel.filter(f => f.date && new Date(f.date) >= calibDate).reduce((s, f) => s + (f.liters || 0), 0);
        const kmAfter = activeTrips.filter(t => t.date && new Date(t.date) >= calibDate).reduce((s, t) => s + (Number(t.km) || 0), 0);
        return Math.max(0, (fuelCalib.liters + fuelAfter) - (kmAfter / 100) * FUEL_L_PER_100KM);
    }, [fuelCalib, activeFuel, activeTrips]);

    // Ortalama sefer KM ve tahmini kalan sefer
    const avgTripKm = useMemo(() => {
        const recent = activeTrips.slice(0, 10).filter(t => Number(t.km) > 0);
        return recent.length > 0 ? recent.reduce((s, t) => s + Number(t.km), 0) / recent.length : 0;
    }, [activeTrips]);

    const fuelPerTrip = avgTripKm > 0 ? (avgTripKm / 100) * FUEL_L_PER_100KM : 0;
    const estimatedTripsLeft = fuelPerTrip > 0 ? Math.floor(estimatedRemainingFuel / fuelPerTrip) : 0;

    const handleSaveFuel = async () => {
        const liters = parseFloat(fuelInput);
        if (isNaN(liters) || liters < 0) return;
        const totalKm = activeTrips.reduce((s, t) => s + (Number(t.km) || 0), 0);
        await updateVehicleInfo({ fuelCalibration: { liters, date: new Date().toISOString(), kmAtCalibration: totalKm } });
        setEditingFuel(false);
    };

    const goToPrev = () => { setIsAllTime(false); if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); } else setSelectedMonth(m => m - 1); };
    const goToNext = () => { setIsAllTime(false); if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); } else setSelectedMonth(m => m + 1); };

    // --- Grafik verisi + projeksiyon ---
    const { chartData, activeDays, periodRevenue, periodExpense, prevDailyProfit, hasProjection } = useMemo(() => {
        const todayDate = now.getDate();
        const todayMonth = now.getMonth();
        const todayYear = now.getFullYear();

        if (isAllTime) {
            const monthMap = {};
            const add = (date, inc, exp) => {
                const d = new Date(date);
                const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
                if (!monthMap[key]) monthMap[key] = { income: 0, expense: 0, days: new Set() };
                monthMap[key].income += inc;
                monthMap[key].expense += exp;
                monthMap[key].days.add(date);
            };
            activeTrips.forEach(t => t.date && add(t.date, (t.tonnage * t.price) * KDV_RATE, 0));
            activeFuel.forEach(f => f.date && add(f.date, 0, f.price));
            activeMaint.forEach(m => m.date && add(m.date, 0, m.cost));
            const sorted = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b));
            const data = sorted.map(([key, val]) => {
                const [yr, mo] = key.split('-').map(Number);
                return { name: `${MONTHS_SHORT[mo]} ${yr}`, 'Gelir (KDV Dahil)': Math.round(val.income), Gider: Math.round(val.expense) };
            });
            const totalAD = Object.values(monthMap).reduce((s, v) => s + v.days.size, 0);
            return { chartData: data, activeDays: totalAD, periodRevenue: data.reduce((s, d) => s + d['Gelir (KDV Dahil)'], 0), periodExpense: data.reduce((s, d) => s + d.Gider, 0), prevDailyProfit: null, hasProjection: false };
        }

        // Aylık mod
        const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const isCurrentMonth = selectedMonth === todayMonth && selectedYear === todayYear;
        const lastHistDay = isCurrentMonth ? todayDate : daysInMonth;

        const dayMap = {};
        for (let d = 1; d <= daysInMonth; d++) dayMap[d] = { income: 0, expense: 0 };

        const inMonth = (date) => { if (!date) return false; const d = new Date(date); return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth; };
        const monthTrips = activeTrips.filter(t => inMonth(t.date));
        const monthFuel = activeFuel.filter(f => inMonth(f.date));
        const monthMaint = activeMaint.filter(m => inMonth(m.date));

        const totalKmMonthly = monthTrips.reduce((s, t) => s + (Number(t.km) || 0), 0);
        const totalFuelCostMonthly = monthFuel.reduce((s, f) => s + f.price, 0);
        const totalFuelLitersMonthly = monthFuel.reduce((s, f) => s + (f.liters || 0), 0);
        const useDist = totalKmMonthly > 0 && totalFuelLitersMonthly > 0;

        monthTrips.forEach(t => {
            const day = new Date(t.date).getDate();
            if (!dayMap[day]) return;
            dayMap[day].income += (t.tonnage * t.price) * KDV_RATE;
            if (useDist && Number(t.km) > 0) {
                const litrePrice = totalFuelCostMonthly / totalFuelLitersMonthly;
                dayMap[day].expense += (Number(t.km) / 100) * FUEL_L_PER_100KM * litrePrice;
            }
        });
        if (!useDist) monthFuel.forEach(f => { const day = new Date(f.date).getDate(); if (dayMap[day]) dayMap[day].expense += f.price; });
        monthMaint.forEach(m => { const day = new Date(m.date).getDate(); if (dayMap[day]) dayMap[day].expense += m.cost; });

        // --- Projeksiyon: kalan günler için yakıt bazlı tahmin ---
        // Ortalama aktif gün gelir ve gider
        const activeDaySet = new Set([...monthTrips.map(t => new Date(t.date).getDate()), ...monthFuel.map(f => new Date(f.date).getDate())]);
        const periodRev = monthTrips.reduce((s, t) => s + (t.tonnage * t.price) * KDV_RATE, 0);
        // Tüketim bazlı gider: KM'e göre harcanan yakıt (depoda kalan dahil edilmez)
        const fuelPricePerLitreCurrent = totalFuelLitersMonthly > 0 ? totalFuelCostMonthly / totalFuelLitersMonthly : 0;
        const consumedFuelCurrent = (totalKmMonthly / 100) * FUEL_L_PER_100KM * fuelPricePerLitreCurrent;
        const periodExp = (fuelPricePerLitreCurrent > 0 ? consumedFuelCurrent : monthFuel.reduce((s, f) => s + f.price, 0)) + monthMaint.reduce((s, m) => s + m.cost, 0);

        let data;
        let showProjection = false;

        if (isCurrentMonth && estimatedTripsLeft > 0 && avgTripKm > 0) {
            showProjection = true;
            const remainingDays = daysInMonth - lastHistDay;
            const avgDailyIncome = activeDaySet.size > 0 ? periodRev / activeDaySet.size : 0;
            // Tahmini sefer sayısı kalan günlere eşit dağıtılır
            const tripsPerDay = Math.min(1, estimatedTripsLeft / Math.max(1, remainingDays));
            const fuelPricePerLiter = totalFuelLitersMonthly > 0 ? totalFuelCostMonthly / totalFuelLitersMonthly : (activeFuel.length > 0 ? activeFuel[activeFuel.length - 1]?.price / (activeFuel[activeFuel.length - 1]?.liters || 1) : 2.5);
            const projFuelCostPerDay = tripsPerDay * fuelPerTrip * fuelPricePerLiter;

            data = Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                if (day <= lastHistDay) {
                    return { name: String(day), 'Gelir (KDV Dahil)': Math.round(dayMap[day].income), Gider: Math.round(dayMap[day].expense), 'Tahmini Gelir': undefined, 'Tahmini Gider': undefined };
                } else {
                    // Gelecek günler: projeksiyon
                    const hasTrip = day <= lastHistDay + estimatedTripsLeft;
                    return {
                        name: String(day),
                        'Gelir (KDV Dahil)': undefined,
                        Gider: undefined,
                        'Tahmini Gelir': hasTrip ? Math.round(avgDailyIncome * tripsPerDay) : 0,
                        'Tahmini Gider': hasTrip ? Math.round(projFuelCostPerDay) : 0,
                    };
                }
            });
        } else {
            data = Array.from({ length: lastHistDay }, (_, i) => ({
                name: String(i + 1),
                'Gelir (KDV Dahil)': Math.round(dayMap[i + 1].income),
                Gider: Math.round(dayMap[i + 1].expense),
            }));
        }

        // Geçen ay
        const pMo = selectedMonth === 0 ? 11 : selectedMonth - 1;
        const pYr = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
        const pTrips = activeTrips.filter(t => { if (!t.date) return false; const d = new Date(t.date); return d.getFullYear() === pYr && d.getMonth() === pMo; });
        const pFuel = activeFuel.filter(f => { if (!f.date) return false; const d = new Date(f.date); return d.getFullYear() === pYr && d.getMonth() === pMo; });
        const pMaint = activeMaint.filter(m => { if (!m.date) return false; const d = new Date(m.date); return d.getFullYear() === pYr && d.getMonth() === pMo; });
        const pAD = new Set([...pTrips.map(t => new Date(t.date).getDate()), ...pFuel.map(f => new Date(f.date).getDate())]).size;
        const pRev = pTrips.reduce((s, t) => s + (t.tonnage * t.price) * KDV_RATE, 0);
        // Geçen ay da tüketim bazlı (adil karşılaştırma için)
        const pKm = pTrips.reduce((s, t) => s + (Number(t.km) || 0), 0);
        const pFuelLiters = pFuel.reduce((s, f) => s + (f.liters || 0), 0);
        const pFuelCost = pFuel.reduce((s, f) => s + f.price, 0);
        const pFuelUnitPrice = pFuelLiters > 0 ? pFuelCost / pFuelLiters : 0;
        const pConsumedFuelCost = pFuelUnitPrice > 0 ? (pKm / 100) * FUEL_L_PER_100KM * pFuelUnitPrice : pFuelCost;
        const pExp = pConsumedFuelCost + pMaint.reduce((s, m) => s + m.cost, 0);

        return { chartData: data, activeDays: activeDaySet.size, periodRevenue: periodRev, periodExpense: periodExp, prevDailyProfit: pAD > 0 ? (pRev - pExp) / pAD : null, hasProjection: showProjection };
    }, [activeTrips, activeFuel, activeMaint, selectedMonth, selectedYear, isAllTime, estimatedRemainingFuel, estimatedTripsLeft, avgTripKm, fuelPerTrip]);

    const currentDailyProfit = activeDays > 0 ? (periodRevenue - periodExpense) / activeDays : 0;
    const perfDelta = (prevDailyProfit !== null && prevDailyProfit !== 0) ? ((currentDailyProfit - prevDailyProfit) / Math.abs(prevDailyProfit)) * 100 : null;
    const PerfIcon = perfDelta === null ? Minus : perfDelta >= 0 ? TrendingUp : TrendingDown;
    const perfColor = perfDelta === null ? '#64748b' : perfDelta >= 0 ? '#10b981' : '#ef4444';

    // Yakıt barı rengi
    const maxTank = 700;
    const fuelPct = Math.min(100, Math.max(0, (estimatedRemainingFuel / maxTank) * 100));
    const fuelColor = fuelPct > 40 ? '#10b981' : fuelPct > 20 ? '#f59e0b' : '#ef4444';

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-ios-nav">

            {/* İstatistik Kartları */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                <div className="glass-panel p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-2xl group-hover:bg-brand-500/20 transition-all"></div>
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-[var(--text-secondary)] text-sm font-semibold tracking-wide uppercase">Toplam Brüt Ciro (KDV Dahil)</p>
                        <Wallet className="text-brand-400 opacity-80" size={24} />
                    </div>
                    <h3 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">
                        {totalRevenue > 0 ? `₺${(totalRevenue * 1.20).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₺0'}
                    </h3>
                    <div className="mt-4 text-xs font-medium">
                        {totalRevenue > 0 ? <span className="text-emerald-400/80 bg-emerald-400/10 px-2 py-1 rounded-md">Net Ciro (KDV Hariç): ₺{totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> : <span className="text-slate-500">Henüz veri girilmedi</span>}
                    </div>
                </div>

                <div className="glass-panel p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl group-hover:bg-orange-500/20 transition-all"></div>
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-[var(--text-secondary)] text-sm font-semibold tracking-wide uppercase">Toplam Gider</p>
                        <CreditCard className="text-orange-400 opacity-80" size={24} />
                    </div>
                    <h3 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">
                        {totalExpense > 0 ? `₺${totalExpense.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '₺0'}
                    </h3>
                    <div className="mt-4 text-xs font-medium">
                        {totalExpense > 0 ? <span className="text-orange-400/80 bg-orange-400/10 px-2 py-1 rounded-md">Mazot & Bakım işlemleri</span> : <span className="text-slate-500">Henüz veri girilmedi</span>}
                    </div>
                </div>

                <div className="glass-panel p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all"></div>
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-[var(--text-secondary)] text-sm font-semibold tracking-wide uppercase">Bekleyen Sefer</p>
                        <Clock className="text-purple-400 opacity-80" size={24} />
                    </div>
                    <h3 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">{pendingTrips} <span className="text-lg text-[var(--text-secondary)] font-normal">Adet</span></h3>
                    <div className="mt-4 text-xs font-medium">
                        {pendingTrips > 0 ? <span className="text-purple-400/80 bg-purple-400/10 px-2 py-1 rounded-md">Fatura kesimi bekliyor</span> : <span className="text-slate-500">Aktif sefer bulunmuyor</span>}
                    </div>
                </div>

                <div className="glass-panel p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all"></div>
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-[var(--text-secondary)] text-sm font-semibold tracking-wide uppercase">Toplam Taşınan</p>
                        <Weight className="text-sky-400 opacity-80" size={24} />
                    </div>
                    <h3 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">{totalTonnage.toFixed(2)} <span className="text-lg text-[var(--text-secondary)] font-normal">Ton</span></h3>
                    <div className="mt-4 text-xs font-medium">
                        {totalTonnage > 0 ? <span className="text-sky-400/80 bg-sky-400/10 px-2 py-1 rounded-md">Tüm seferlerin toplamı</span> : <span className="text-slate-500">Henüz veri girilmedi</span>}
                    </div>
                </div>
            </div>

            {/* Grafik Paneli */}
            <div className="glass-panel p-6">

                {/* Başlık Satırı */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold text-lg flex items-center text-[var(--text-primary)]">
                            <Activity className="mr-2 text-brand-400" size={20} />
                            Aylık Gelir/Gider Akışı
                        </h3>

                        {/* Yakıt Pill — grafiğin içinde */}
                        {editingFuel ? (
                            <div className="flex items-center gap-2 bg-[var(--bg-panel)] border border-amber-500/30 rounded-xl px-3 py-1.5">
                                <Fuel size={13} className="text-amber-400 flex-shrink-0" />
                                <input
                                    type="number"
                                    value={fuelInput}
                                    onChange={e => setFuelInput(e.target.value)}
                                    placeholder="Litre"
                                    className="w-20 text-xs bg-transparent text-[var(--text-primary)] focus:outline-none placeholder-slate-600"
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && handleSaveFuel()}
                                />
                                <button onClick={handleSaveFuel} className="text-emerald-400 hover:text-emerald-300"><Check size={13} /></button>
                                <button onClick={() => setEditingFuel(false)} className="text-slate-500 hover:text-slate-300"><X size={13} /></button>
                            </div>
                        ) : (
                            <button
                                onClick={() => { setFuelInput(Math.round(estimatedRemainingFuel).toString()); setEditingFuel(true); }}
                                className="flex items-center gap-2 bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-slate-600 rounded-xl px-3 py-1.5 transition-all group/fuel"
                                title="Depodaki yakıtı düzenle"
                            >
                                <Fuel size={13} style={{ color: fuelColor }} />
                                {/* Mini yakıt barı */}
                                <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${fuelPct}%`, background: fuelColor }} />
                                </div>
                                <span className="text-xs font-semibold" style={{ color: fuelColor }}>
                                    {Math.round(estimatedRemainingFuel)}L
                                </span>
                                <span className="text-slate-600 text-[10px]">·</span>
                                <span className="text-[10px] text-slate-500">~{estimatedTripsLeft} sefer</span>
                            </button>
                        )}
                    </div>

                    {/* Zaman Navigasyonu */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsAllTime(true)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${isAllTime ? 'bg-brand-500/20 text-brand-400 border border-brand-500/40' : 'text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-700'}`}
                        >
                            Tüm Zamanlar
                        </button>
                        <div className="flex items-center gap-1 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl px-1 py-1">
                            <button onClick={goToPrev} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-slate-200"><ChevronLeft size={15} /></button>
                            <span className="text-sm font-semibold text-[var(--text-primary)] px-2 min-w-[110px] text-center">
                                {isAllTime ? '—' : `${MONTHS_TR[selectedMonth]} ${selectedYear}`}
                            </span>
                            <button onClick={goToNext} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-slate-200"><ChevronRight size={15} /></button>
                        </div>
                    </div>
                </div>

                {/* Projeksiyon açıklaması */}
                {hasProjection && (
                    <div className="flex items-center gap-2 mb-4 px-1">
                        <div className="w-6 border-t border-dashed border-amber-500/60" />
                        <p className="text-[11px] text-slate-500">
                            Deponuzdaki yakıtla <span className="text-amber-400 font-semibold">~{estimatedTripsLeft} sefer</span> tahmini kalan ay projeksiyonu gösteriliyor
                        </p>
                    </div>
                )}

                {/* Grafik */}
                <div className="h-[320px] w-full relative">
                    {chartData.every(d => (d['Gelir (KDV Dahil)'] || 0) === 0 && (d.Gider || 0) === 0 && (d['Tahmini Gelir'] || 0) === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <Activity size={32} className="mb-3 opacity-30 animate-pulse" />
                            <p className="font-medium">Bu dönemde veri bulunamadı.</p>
                            <p className="text-sm mt-1 opacity-70">Sefer veya harcama ekledikçe burada görünecektir.</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gradGelir" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.22} />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.01} />
                                    </linearGradient>
                                    <linearGradient id="gradGider" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.18} />
                                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.01} />
                                    </linearGradient>
                                    <linearGradient id="gradPrjGelir" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.16} />
                                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.01} />
                                    </linearGradient>
                                    <linearGradient id="gradPrjGider" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#818cf8" stopOpacity={0.14} />
                                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0.01} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.18} vertical={false} />
                                <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={8} interval={isAllTime ? 'preserveStartEnd' : Math.floor(chartData.length / 8)} />
                                <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `₺${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} dx={-4} />
                                <Tooltip content={<CustomTooltip isAllTime={isAllTime} />} />

                                {/* Gerçek veriler */}
                                <Area type="monotone" dataKey="Gelir (KDV Dahil)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#gradGelir)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls={false} />
                                <Area type="monotone" dataKey="Gider" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#gradGider)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls={false} />

                                {/* Projeksiyon — sadece yakıt girildiğinde */}
                                {hasProjection && (
                                    <>
                                        <Area type="monotone" dataKey="Tahmini Gelir" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3" fillOpacity={1} fill="url(#gradPrjGelir)" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} connectNulls={false} name="Tahmini Gelir" />
                                        <Area type="monotone" dataKey="Tahmini Gider" stroke="#818cf8" strokeWidth={1.5} strokeDasharray="5 3" fillOpacity={1} fill="url(#gradPrjGider)" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} connectNulls={false} name="Tahmini Gider" />
                                    </>
                                )}
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Verimlilik Metrikleri */}
                {!isAllTime && activeDays > 0 && (
                    <div className="mt-5 pt-5 border-t border-[var(--border-color)] grid grid-cols-3 gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-sky-500/10 flex-shrink-0"><CalendarDays size={15} className="text-sky-400" /></div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Aktif Gün</p>
                                <p className="text-base font-bold text-[var(--text-primary)]">{activeDays} <span className="text-xs text-slate-500 font-normal">gün</span></p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-brand-500/10 flex-shrink-0"><BarChart2 size={15} className="text-brand-400" /></div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Günlük Ort. Kar</p>
                                <p className="text-base font-bold text-[var(--text-primary)]">
                                    ₺{currentDailyProfit.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    <span className="text-xs text-slate-500 font-normal"> / gün</span>
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg flex-shrink-0" style={{ background: `${perfColor}15` }}><PerfIcon size={15} style={{ color: perfColor }} /></div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Geçen Aya Göre</p>
                                <p className="text-base font-bold" style={{ color: perfColor }}>
                                    {perfDelta === null ? <span className="text-slate-500 text-xs font-normal">Karşılaştırma yok</span> : `${perfDelta >= 0 ? '+' : ''}${perfDelta.toFixed(1)}%`}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
