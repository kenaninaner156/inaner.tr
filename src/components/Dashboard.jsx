import React, { useContext, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity,
    Wallet,
    Clock,
    Weight,
    ChevronLeft,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    Minus,
    CalendarDays,
    BarChart2,
    Truck,
    Pencil,
    Trash2,
    Droplet,
    Gauge,
    Zap
} from 'lucide-react';
import {
    ComposedChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { DataContext } from '../context/DataContext';
import ProfitAnalysisModal from './ProfitAnalysisModal';

const CHART_THEMES = {
    ice: {
        id: 'ice',
        label: 'Mono Ice',
        seferStroke: '#38bdf8',
        seferGrad: '#38bdf8',
        seferGradOpacity: 0.16,
        tonajStroke: '#f8fafc',
        fuelColor: '#38bdf8'
    },
    cyber: {
        id: 'cyber',
        label: 'Cyber Luxe',
        seferStroke: '#06b6d4',
        seferGrad: '#06b6d4',
        seferGradOpacity: 0.18,
        tonajStroke: '#818cf8',
        fuelColor: '#fbbf24'
    },
    mint: {
        id: 'mint',
        label: 'Neon Mint',
        seferStroke: '#10e794',
        seferGrad: '#10e794',
        seferGradOpacity: 0.18,
        tonajStroke: '#3b82f6',
        fuelColor: '#10e794'
    }
};

// --- Custom Tooltip ---
const CustomTooltip = ({ active, payload, label, isAllTime, theme }) => {
    if (active && payload && payload.length) {
        const hasFuel = payload[0]?.payload['Yakıt (Lt)'] > 0;
        const fuelAmount = payload[0]?.payload['Yakıt (Lt)'];
        const note = payload[0]?.payload?.note;
 
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
                </p>
                {payload.filter(p => p.value > 0 && p.dataKey !== 'Yakıt (Lt)' && p.dataKey !== 'Yakıt Zemin').map((entry, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
                        <span style={{ color: '#94a3b8', fontSize: '11px', flex: 1 }}>{entry.name}:</span>
                        <span style={{ color: entry.color, fontSize: '12px', fontWeight: 700 }}>
                           {entry.dataKey.includes('Tonaj') ? `${entry.value.toFixed(1)} Ton` : `${entry.value} Adet`}
                        </span>
                    </div>
                ))}
 
                {hasFuel && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ fontSize: '12px' }}>⛽</span>
                        <span style={{ color: theme?.fuelColor || '#38bdf8', fontSize: '11px', fontWeight: 700 }}>
                            Yakıt Alındı ({fuelAmount} Lt)
                        </span>
                    </div>
                )}

                {note && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ fontSize: '12px' }}>📝</span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: '#818cf8', fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Günlük Not</span>
                            <span style={{ color: '#e2e8f0', fontSize: '11px', lineHeight: '1.4' }}>{note}</span>
                        </div>
                    </div>
                )}
            </div>
        );
    }
    return null;
};

// --- Custom Clean Fuel Dot Bottom (Glowsuz & Temiz) ---
const GlowingFuelDotBottom = (props) => {
    const { cx, cy, payload, fuelColor } = props;
    if (payload['Yakıt (Lt)'] > 0) {
        return (
            <circle cx={cx} cy={cy} r={2.8} fill={fuelColor || '#38bdf8'} stroke="#0f172a" strokeWidth={1} />
        );
    }
    return null;
};


const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const KDV_RATE = 1.20;
const FUEL_L_PER_100KM = 32;

// Tonaj değerini ton cinsine normalize et (örn: 33100 kg girilmişse 33.1 ton yap)
const parseTonnageInTons = (val) => {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return 0;
    if (num > 200) {
        return num / 1000;
    }
    return num;
};

const Dashboard = () => {
    const { trips, invoices, fuelRecords, maintenanceRecords, paymentRecords, penalties, dailyNotes, updateDailyNote } = useContext(DataContext);
    const [isProfitModalOpen, setIsProfitModalOpen] = useState(false);

    const now = new Date();
    
    // Eğer bu ay 5'ten az veri varsa, otomatik olarak bir önceki ayı göster
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const tMonth = now.getMonth();
        const tYear = now.getFullYear();
        const mTrips = (trips || []).filter(t => !t.deleted && t.date && new Date(t.date).getMonth() === tMonth && new Date(t.date).getFullYear() === tYear);
        const mFuel = (fuelRecords || []).filter(f => !f.deleted && f.date && new Date(f.date).getMonth() === tMonth && new Date(f.date).getFullYear() === tYear);
        if (mTrips.length + mFuel.length < 5) {
            return tMonth === 0 ? 11 : tMonth - 1;
        }
        return tMonth;
    });

    const [selectedYear, setSelectedYear] = useState(() => {
        const tMonth = now.getMonth();
        const tYear = now.getFullYear();
        const mTrips = (trips || []).filter(t => !t.deleted && t.date && new Date(t.date).getMonth() === tMonth && new Date(t.date).getFullYear() === tYear);
        const mFuel = (fuelRecords || []).filter(f => !f.deleted && f.date && new Date(f.date).getMonth() === tMonth && new Date(f.date).getFullYear() === tYear);
        if (mTrips.length + mFuel.length < 5) {
            return tMonth === 0 ? tYear - 1 : tYear;
        }
        return tYear;
    });
    
    const [isAllTime, setIsAllTime] = useState(false);
    const [liveDieselPrice, setLiveDieselPrice] = useState(null);
    const [chartTheme, setChartTheme] = useState(() => localStorage.getItem('dashboard_chart_theme') || 'ice');
    const activeTheme = CHART_THEMES[chartTheme] || CHART_THEMES.ice;

    // Canlı internetten güncel motorin pompa fiyatını çek
    React.useEffect(() => {
        let isMounted = true;
        const fetchLiveFuelPrice = async () => {
            try {
                const res = await fetch('https://hasanadiguzel.com.tr/api/akaryakit/sehir=ANKARA');
                if (res.ok) {
                    const json = await res.json();
                    if (json?.data) {
                        const firstKey = Object.keys(json.data)[0];
                        const item = json.data[firstKey];
                        const motorinValStr = item?.['Motorin(Eurodiesel)_TL/lt'] || item?.['Motorin(Excellium_Eurodiesel)_TL/lt'];
                        if (motorinValStr) {
                            const parsed = parseFloat(motorinValStr.replace(',', '.'));
                            if (!isNaN(parsed) && parsed > 0 && isMounted) {
                                setLiveDieselPrice(parsed);
                            }
                        }
                    }
                }
            } catch (e) {
                // Fallback to local receipt
            }
        };
        fetchLiveFuelPrice();
        return () => { isMounted = false; };
    }, []);
 
    // Daily Notes edit state
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [editNoteDay, setEditNoteDay] = useState('');
    const [modalNoteText, setModalNoteText] = useState('');
    const [confirmDeleteNote, setConfirmDeleteNote] = useState(false);
 
    const activeTrips = useMemo(() => trips.filter(t => !t.deleted), [trips]);
    const activeInvoices = useMemo(() => invoices ? invoices.filter(inv => !inv.deleted) : [], [invoices]);
    const activeFuel = useMemo(() => fuelRecords ? fuelRecords.filter(f => !f.deleted) : [], [fuelRecords]);

    const lastHistDay = useMemo(() => {
        const todayDate = now.getDate();
        const todayMonth = now.getMonth();
        const todayYear = now.getFullYear();
        const isCurrentMonth = selectedMonth === todayMonth && selectedYear === todayYear;
        if (isCurrentMonth) {
            return todayDate;
        }
        return new Date(selectedYear, selectedMonth + 1, 0).getDate();
    }, [selectedMonth, selectedYear, now]);
 
    const handleSaveModalNote = async (e) => {
        if (e) e.preventDefault();
        const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(editNoteDay).padStart(2, '0')}`;
        await updateDailyNote(dateStr, modalNoteText);
        setIsNoteModalOpen(false);
    };

    const handleDeleteModalNote = async () => {
        if (!confirmDeleteNote) {
            setConfirmDeleteNote(true);
            return;
        }
        const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(editNoteDay).padStart(2, '0')}`;
        await updateDailyNote(dateStr, '');
        setIsNoteModalOpen(false);
        setConfirmDeleteNote(false);
    };

    // ─── STAT KARTLARI HESAPLAMALARI ───
    // 1. Kart: Toplam Gelir (Ciro - Tüm Zamanlar / Motivasyon Kartı)
    const totalRevenue = useMemo(() => activeInvoices.reduce((s, inv) => s + (inv.grandTotal || 0), 0), [activeInvoices]);

    // 2. Kart: Seçili Ayın Yakıt Gideri (Tutar ve Litre)
    const monthFuelRecords = useMemo(() => {
        return activeFuel.filter(f => {
            if (!f.date) return false;
            const d = new Date(f.date);
            return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
        });
    }, [activeFuel, selectedMonth, selectedYear]);

    const monthFuelCost = useMemo(() => monthFuelRecords.reduce((s, f) => s + (Number(f.price) || 0), 0), [monthFuelRecords]);
    const monthFuelLiters = useMemo(() => monthFuelRecords.reduce((s, f) => s + (Number(f.liters) || 0), 0), [monthFuelRecords]);

    // 3. Kart: Seçili Ayın Ortalama Yakıt Tüketimi (L/100km)
    const monthAvgConsumption = useMemo(() => {
        const chronological = [...activeFuel].sort((a, b) => new Date(a.date) - new Date(b.date));
        let lastOdo = null;
        let accLiters = 0;
        let monthTotalDist = 0;
        let monthTotalLiters = 0;

        chronological.forEach(r => {
            const isTargetMonth = r.date && new Date(r.date).getFullYear() === selectedYear && new Date(r.date).getMonth() === selectedMonth;

            if (r.odometer && r.odometer > 0 && !r.isPartial) {
                if (lastOdo && r.odometer > lastOdo) {
                    const dist = r.odometer - lastOdo;
                    const ltrs = accLiters + (Number(r.liters) || 0);
                    
                    if (isTargetMonth) {
                        monthTotalDist += dist;
                        monthTotalLiters += ltrs;
                    }
                }
                lastOdo = r.odometer;
                accLiters = 0;
            } else {
                if (lastOdo) {
                    accLiters += (Number(r.liters) || 0);
                }
            }
        });

        return monthTotalDist > 0 ? (monthTotalLiters / monthTotalDist) * 100 : null;
    }, [activeFuel, selectedMonth, selectedYear]);

    // 4. Kart: Güncel Motorin Pompa Fiyatı (TL/Lt - Canlı API / Son Fiş)
    const currentDieselPrice = useMemo(() => {
        if (liveDieselPrice && liveDieselPrice > 0) {
            return liveDieselPrice;
        }
        const sortedWithPrice = [...activeFuel]
            .filter(f => f.price > 0 && f.liters > 0)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        if (sortedWithPrice.length > 0) {
            const latest = sortedWithPrice[0];
            return Number(latest.price) / Number(latest.liters);
        }
        return 44.85;
    }, [liveDieselPrice, activeFuel]);

    const goToPrev = () => { setIsAllTime(false); if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); } else setSelectedMonth(m => m - 1); };
    const goToNext = () => { setIsAllTime(false); if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); } else setSelectedMonth(m => m + 1); };

    // --- Grafik verisi (Mekanik Yenilikler) ---
    const { chartData, activeDays, periodTrips, periodTonnage, prevDailyTrips } = useMemo(() => {
        const todayDate = now.getDate();
        const todayMonth = now.getMonth();
        const todayYear = now.getFullYear();

        if (isAllTime) {
            const monthMap = {};
            const add = (date, tripsCount, tonnage, fuel) => {
                const d = new Date(date);
                const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
                if (!monthMap[key]) monthMap[key] = { trips: 0, tonnage: 0, fuel: 0, days: new Set() };
                monthMap[key].trips += tripsCount;
                monthMap[key].tonnage += tonnage;
                monthMap[key].fuel += fuel;
                monthMap[key].days.add(date);
            };
            activeTrips.forEach(t => t.date && add(t.date, 1, parseTonnageInTons(t.tonnage), 0));
            activeFuel.forEach(f => f.date && add(f.date, 0, 0, f.liters || 0));

            const sorted = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b));
            const data = sorted.map(([key, val]) => {
                const [yr, mo] = key.split('-').map(Number);
                return { name: `${MONTHS_SHORT[mo]} ${yr}`, 'Sefer Sayısı': val.trips, 'Taşınan Tonaj': val.tonnage, 'Yakıt (Lt)': val.fuel, 'Yakıt Zemin': val.fuel > 0 ? 0 : null };
            });
            const totalAD = Object.values(monthMap).reduce((s, v) => s + v.days.size, 0);
            return { chartData: data, activeDays: totalAD, periodTrips: data.reduce((s, d) => s + d['Sefer Sayısı'], 0), periodTonnage: data.reduce((s, d) => s + d['Taşınan Tonaj'], 0), prevDailyTrips: null };
        }

        const dayMap = {};
        for (let d = 1; d <= lastHistDay; d++) dayMap[d] = { trips: 0, tonnage: 0, fuel: 0 };
 
        const inMonth = (date) => { if (!date) return false; const d = new Date(date); return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth; };
        const monthTrips = activeTrips.filter(t => inMonth(t.date));
        const monthFuel = activeFuel.filter(f => inMonth(f.date));
 
        monthTrips.forEach(t => { 
            const day = new Date(t.date).getDate(); 
            if (dayMap[day]) {
                dayMap[day].trips += 1; 
                dayMap[day].tonnage += parseTonnageInTons(t.tonnage);
            }
        });
        monthFuel.forEach(f => {
            const day = new Date(f.date).getDate();
            if (dayMap[day]) {
                dayMap[day].fuel += (f.liters || 0);
            }
        });
 
        const activeDaySet = new Set(monthTrips.map(t => new Date(t.date).getDate()));
        const periodTotalTrips = monthTrips.length;
        const periodTotalTonnage = monthTrips.reduce((s, t) => s + parseTonnageInTons(t.tonnage), 0);
 
        const data = Array.from({ length: lastHistDay }, (_, i) => {
            const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
            return {
                name: String(i + 1),
                'Sefer Sayısı': dayMap[i + 1].trips,
                'Taşınan Tonaj': dayMap[i + 1].tonnage,
                'Yakıt (Lt)': dayMap[i + 1].fuel,
                'Yakıt Zemin': dayMap[i + 1].fuel > 0 ? 0 : null,
                dateStr,
                note: dailyNotes?.[dateStr] || ''
            };
        });
 
        const pMo = selectedMonth === 0 ? 11 : selectedMonth - 1;
        const pYr = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
        const pTrips = activeTrips.filter(t => { if (!t.date) return false; const d = new Date(t.date); return d.getFullYear() === pYr && d.getMonth() === pMo; });
        const pAD = new Set(pTrips.map(t => new Date(t.date).getDate())).size;
 
        return { chartData: data, activeDays: activeDaySet.size, periodTrips: periodTotalTrips, periodTonnage: periodTotalTonnage, prevDailyTrips: pAD > 0 ? pTrips.length / pAD : null };
    }, [activeTrips, activeFuel, selectedMonth, selectedYear, isAllTime, dailyNotes, lastHistDay]);

    const currentDailyTrips = activeDays > 0 ? periodTrips / activeDays : 0;
    const currentDailyTonnage = activeDays > 0 ? periodTonnage / activeDays : 0;
    const perfDelta = (prevDailyTrips !== null && prevDailyTrips !== 0) ? ((currentDailyTrips - prevDailyTrips) / prevDailyTrips) * 100 : null;
    const PerfIcon = perfDelta === null ? Minus : perfDelta >= 0 ? TrendingUp : TrendingDown;
    const perfColor = perfDelta === null ? '#64748b' : perfDelta >= 0 ? '#10b981' : '#ef4444';

    return (
        <div className="h-full flex flex-col justify-between gap-3.5 md:gap-4 animate-in fade-in duration-500 overflow-hidden">

            {/* ─── 4'LÜ STRATEJİK KPI ÖZET KARTLARI ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 md:gap-4 flex-shrink-0">
                
                {/* 1. KART: Toplam Gelir (Ciro - Tüm Zamanlar / Motivasyon) */}
                <div 
                    onClick={() => setIsProfitModalOpen(true)}
                    className="glass-panel p-4 sm:p-5 relative overflow-hidden group cursor-pointer hover:border-violet-500/50 hover:shadow-[0_0_25px_rgba(139,92,246,0.2)] transition-all duration-300 transform hover:-translate-y-0.5 flex flex-col justify-between"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl group-hover:bg-violet-500/20 transition-all duration-500 pointer-events-none"></div>
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[var(--text-secondary)] text-xs font-semibold tracking-wider uppercase group-hover:text-violet-400 transition-colors">
                            Toplam Gelir
                        </p>
                        <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 group-hover:scale-110 transition-transform">
                            <Wallet size={18} />
                        </div>
                    </div>
                    <h3 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)] tracking-tight group-hover:text-white transition-colors">
                        {totalRevenue > 0 ? `₺${Math.round(totalRevenue).toLocaleString('tr-TR')}` : '₺0'}
                    </h3>
                </div>

                {/* 2. KART: Aylık Yakıt Gideri (Seçili Ay) */}
                <div className="glass-panel p-4 sm:p-5 relative overflow-hidden group hover:border-amber-500/40 hover:shadow-[0_0_25px_rgba(245,158,11,0.15)] transition-all duration-300 flex flex-col justify-between">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all duration-500 pointer-events-none"></div>
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[var(--text-secondary)] text-xs font-semibold tracking-wider uppercase group-hover:text-amber-400 transition-colors flex items-center gap-1.5">
                            <span>Yakıt Gideri</span>
                            <span className="text-[10px] font-normal tracking-wide text-slate-500 group-hover:text-amber-400/60 uppercase">
                                {MONTHS_TR[selectedMonth]}
                            </span>
                        </p>
                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
                            <Droplet size={18} />
                        </div>
                    </div>
                    <h3 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)] tracking-tight group-hover:text-white transition-colors">
                        ₺{Math.round(monthFuelCost).toLocaleString('tr-TR')}
                    </h3>
                </div>

                {/* 3. KART: Ortalama Tüketim (Seçili Ay) */}
                <div className="glass-panel p-4 sm:p-5 relative overflow-hidden group hover:border-cyan-500/40 hover:shadow-[0_0_25px_rgba(6,182,212,0.15)] transition-all duration-300 flex flex-col justify-between">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all duration-500 pointer-events-none"></div>
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[var(--text-secondary)] text-xs font-semibold tracking-wider uppercase group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                            <span>Ortalama Tüketim</span>
                            <span className="text-[10px] font-normal tracking-wide text-slate-500 group-hover:text-cyan-400/60 uppercase">
                                {MONTHS_TR[selectedMonth]}
                            </span>
                        </p>
                        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
                            <Gauge size={18} />
                        </div>
                    </div>
                    <h3 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)] tracking-tight group-hover:text-white transition-colors flex items-baseline">
                        {monthAvgConsumption ? (
                            <>
                                <span>{monthAvgConsumption.toFixed(1)}</span>
                                <span className="text-sm font-semibold text-cyan-400 ml-1.5">L/100km</span>
                            </>
                        ) : (
                            <span className="text-lg text-slate-500 font-normal">—</span>
                        )}
                    </h3>
                </div>

                {/* 4. KART: Güncel Motorin Fiyatı */}
                <div className="glass-panel p-4 sm:p-5 relative overflow-hidden group hover:border-emerald-500/40 hover:shadow-[0_0_25px_rgba(16,185,129,0.15)] transition-all duration-300 flex flex-col justify-between">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all duration-500 pointer-events-none"></div>
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[var(--text-secondary)] text-xs font-semibold tracking-wider uppercase group-hover:text-emerald-400 transition-colors">
                            Güncel Motorin
                        </p>
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                            <Zap size={18} />
                        </div>
                    </div>
                    <h3 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)] tracking-tight group-hover:text-white transition-colors flex items-baseline">
                        ₺{currentDieselPrice.toFixed(2)}
                        <span className="text-sm font-semibold text-emerald-400 ml-1.5">/ Lt</span>
                    </h3>
                </div>

            </div>

            {/* Grafik Paneli */}
            <div className="glass-panel p-5 md:p-6 flex-1 flex flex-col justify-between min-h-[420px] overflow-hidden">

                {/* Başlık Satırı */}
                <div className="flex items-center justify-between gap-3 mb-4 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <Activity className="text-sky-400" size={20} />
                        <h3 className="font-semibold text-base md:text-lg text-[var(--text-primary)]">
                            Aylık Operasyon Hacmi
                        </h3>
                    </div>

                    {/* Zaman Navigasyonu */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl px-1.5 py-1">
                            <button onClick={goToPrev} className="p-1 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"><ChevronLeft size={16} /></button>
                            <span className="text-xs md:text-sm font-semibold text-[var(--text-primary)] px-2.5 min-w-[85px] text-center select-none">
                                {selectedYear === now.getFullYear() ? MONTHS_TR[selectedMonth] : `${MONTHS_TR[selectedMonth]} ${selectedYear}`}
                            </span>
                            <button onClick={goToNext} className="p-1 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"><ChevronRight size={16} /></button>
                        </div>
                    </div>
                </div>

                {/* Grafik - Geniş ve Dolduran Yükseklik */}
                <div className="h-[280px] sm:h-[320px] md:h-[360px] lg:h-[400px] xl:h-[440px] w-full relative select-none outline-none focus:outline-none">
                    {chartData.every(d => (d['Sefer Sayısı'] || 0) === 0 && (d['Taşınan Tonaj'] || 0) === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 select-text">
                            <Activity size={32} className="mb-2 opacity-30 animate-pulse" />
                            <p className="font-medium text-sm">Bu dönemde veri bulunamadı.</p>
                            <p className="text-xs mt-0.5 opacity-70">Operasyonlar kaydedildikçe grafiğiniz oluşacaktır.</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                                data={chartData}
                                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                style={{ outline: 'none' }}
                                onDoubleClick={(state) => {
                                    if (!isAllTime && state && state.activeLabel) {
                                        const dayStr = state.activeLabel;
                                        setEditNoteDay(dayStr);
                                        const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${dayStr.padStart(2, '0')}`;
                                        setModalNoteText(dailyNotes?.[dateStr] || '');
                                        setIsNoteModalOpen(true);
                                        setConfirmDeleteNote(false);
                                    }
                                }}
                            >
                                <defs>
                                    <linearGradient id="gradSefer" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={activeTheme.seferGrad} stopOpacity={activeTheme.seferGradOpacity} />
                                        <stop offset="100%" stopColor={activeTheme.seferGrad} stopOpacity={0.0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.18} vertical={false} />
                                <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={6} interval={isAllTime ? 'preserveStartEnd' : Math.floor(chartData.length / 8)} />
                                <YAxis 
                                    yAxisId="left" 
                                    stroke="#475569" 
                                    fontSize={11} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    dx={-4} 
                                    domain={[0, dataMax => Math.max(4, Math.ceil(dataMax * 1.35))]}
                                    allowDecimals={false}
                                />
                                <YAxis 
                                    yAxisId="right" 
                                    orientation="right" 
                                    hide={true} 
                                    domain={[0, dataMax => Math.max(140, Math.ceil(dataMax * 1.35))]}
                                />
                                <Tooltip content={<CustomTooltip isAllTime={isAllTime} theme={activeTheme} />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />

                                {/* Taşınan Tonaj: Havada Süzülen Parlayan İnce Çizgi (Dolgusuz - Çamursuz) */}
                                <Area 
                                    yAxisId="right" 
                                    type="monotone" 
                                    dataKey="Taşınan Tonaj" 
                                    stroke={activeTheme.tonajStroke} 
                                    strokeWidth={1.5} 
                                    fillOpacity={0} 
                                    fill="none" 
                                    dot={false} 
                                    activeDot={{ r: 3.5, strokeWidth: 1.5, stroke: '#0f172a', fill: activeTheme.tonajStroke }} 
                                    connectNulls={false} 
                                />

                                {/* Sefer Sayısı: Ana Dalga (Yumuşak Neon Gradyan) */}
                                <Area 
                                    yAxisId="left" 
                                    type="monotone" 
                                    dataKey="Sefer Sayısı" 
                                    stroke={activeTheme.seferStroke} 
                                    strokeWidth={2.0} 
                                    fillOpacity={1} 
                                    fill="url(#gradSefer)" 
                                    dot={false} 
                                    activeDot={{ r: 4.5, strokeWidth: 1.5, stroke: '#0f172a', fill: activeTheme.seferStroke }} 
                                    connectNulls={false} 
                                />
                                
                                {/* Zemin Yakıt Noktaları */}
                                <Area 
                                    yAxisId="left" 
                                    type="monotone" 
                                    dataKey="Yakıt Zemin" 
                                    stroke="none" 
                                    fill="none" 
                                    dot={<GlowingFuelDotBottom fuelColor={activeTheme.fuelColor} />} 
                                    activeDot={false} 
                                    isAnimationActive={false} 
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Verimlilik Metrikleri */}
                {!isAllTime && activeDays > 0 && (
                    <div className="mt-2.5 pt-2.5 md:mt-3 md:pt-3 border-t border-[var(--border-color)] grid grid-cols-3 gap-3 flex-shrink-0">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-sky-500/10 flex-shrink-0"><CalendarDays size={14} className="text-sky-400" /></div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Aktif Gün</p>
                                <p className="text-sm md:text-base font-bold text-[var(--text-primary)]">{activeDays} <span className="text-xs text-slate-500 font-normal">gün</span></p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-blue-500/10 flex-shrink-0"><Weight size={14} className="text-blue-400" /></div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Günlük Ort. Tonaj</p>
                                <p className="text-sm md:text-base font-bold text-[var(--text-primary)]">
                                    {currentDailyTonnage.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    <span className="text-xs text-slate-500 font-normal"> Ton</span>
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 flex-shrink-0">
                                <PerfIcon size={14} />
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Geçen Aya Göre</p>
                                <p className="text-sm md:text-base font-bold text-[var(--text-primary)]">
                                    {perfDelta === null ? (
                                        <span className="text-slate-400 text-xs font-normal">Veri Yok</span>
                                    ) : (
                                        <span>{perfDelta >= 0 ? '+' : ''}{perfDelta.toFixed(1)}%</span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
 
            {/* Kâr/Zarar Analizi Modalı */}
            <ProfitAnalysisModal 
                isOpen={isProfitModalOpen} 
                onClose={() => setIsProfitModalOpen(false)} 
                data={{ invoices, fuelRecords, maintenanceRecords, paymentRecords, penalties }} 
            />

            {/* Çift Tıklama Günlük Not Modalı */}
            {createPortal(
                <AnimatePresence>
                    {isNoteModalOpen && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                            {/* Backdrop */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => { setIsNoteModalOpen(false); setConfirmDeleteNote(false); }}
                                className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
                            />
                            
                            {/* Modal Card */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                                transition={{ type: "spring", duration: 0.3 }}
                                className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
                                
                                <h4 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                                    <CalendarDays size={18} className="text-violet-400" />
                                    {editNoteDay}. Gün Operasyon Notu
                                </h4>
                                <p className="text-xs text-slate-400 mb-4 uppercase tracking-wider font-medium">
                                    {MONTHS_TR[selectedMonth]} {selectedYear}
                                </p>

                                <form onSubmit={handleSaveModalNote} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">
                                            Not / Açıklama
                                        </label>
                                        <textarea
                                            value={modalNoteText}
                                            onChange={(e) => {
                                                setModalNoteText(e.target.value);
                                                setConfirmDeleteNote(false);
                                            }}
                                            placeholder="Örn: Şoför izinliydi, araç çalışmadı"
                                            rows={3}
                                            autoFocus
                                            className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3.5 py-2.5 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none resize-none transition-all placeholder:text-slate-500"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-3 pt-2">
                                        <div>
                                            {dailyNotes?.[`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(editNoteDay).padStart(2, '0')}`] && (
                                                <button
                                                    type="button"
                                                    onClick={handleDeleteModalNote}
                                                    className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all border ${confirmDeleteNote ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-500/20 scale-105' : 'text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20'}`}
                                                >
                                                    {confirmDeleteNote ? 'Emin misiniz?' : 'Notu Sil'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { setIsNoteModalOpen(false); setConfirmDeleteNote(false); }}
                                                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition-all hover:bg-white/5"
                                            >
                                                İptal
                                            </button>
                                            <button
                                                type="submit"
                                                className="px-5 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-xl transition-all shadow-lg shadow-violet-500/20 hover:shadow-violet-500/35"
                                            >
                                                Kaydet
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export default Dashboard;
