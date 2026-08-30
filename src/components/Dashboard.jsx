import React, { useContext, useState, useMemo, useEffect } from 'react';
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
    Zap,
    Menu
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
    violet: {
        id: 'violet',
        label: 'Electric Violet',
        seferStroke: '#8b5cf6',
        seferGrad: '#8b5cf6',
        seferGradOpacity: 0.10,
        tonajStroke: '#e2e8f0',
        fuelColor: '#a855f7'
    },
    ice: {
        id: 'ice',
        label: 'Mono Ice',
        seferStroke: '#38bdf8',
        seferGrad: '#38bdf8',
        seferGradOpacity: 0.10,
        tonajStroke: '#f8fafc',
        fuelColor: '#38bdf8'
    },
    cyber: {
        id: 'cyber',
        label: 'Cyber Luxe',
        seferStroke: '#06b6d4',
        seferGrad: '#06b6d4',
        seferGradOpacity: 0.10,
        tonajStroke: '#818cf8',
        fuelColor: '#fbbf24'
    },
    mint: {
        id: 'mint',
        label: 'Neon Mint',
        seferStroke: '#10e794',
        seferGrad: '#10e794',
        seferGradOpacity: 0.10,
        tonajStroke: '#3b82f6',
        fuelColor: '#10e794'
    }
};

// --- Custom Tooltip (Floating Glass Style) ---
const CustomTooltip = ({ active, payload, label, isAllTime, theme }) => {
    if (active && payload && payload.length) {
        const hasFuel = payload[0]?.payload['Yakıt (Lt)'] > 0;
        const fuelAmount = payload[0]?.payload['Yakıt (Lt)'];
        const note = payload[0]?.payload?.note;
 
        return (
            <div style={{
                background: 'rgba(11, 15, 23, 0.94)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px',
                padding: '12px 16px',
                backdropFilter: 'blur(24px)',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85)',
                minWidth: '190px'
            }}>
                <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, marginBottom: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {isAllTime ? label : `${label}. Gün`}
                </p>
                {payload.filter(p => p.value > 0 && p.dataKey !== 'Yakıt (Lt)' && p.dataKey !== 'Yakıt Zemin').map((entry, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
                        <span style={{ color: '#94a3b8', fontSize: '11px', flex: 1 }}>{entry.name}:</span>
                        <span style={{ color: entry.color === '#e2e8f0' ? '#ffffff' : entry.color, fontSize: '12px', fontWeight: 700 }}>
                           {entry.dataKey.includes('Tonaj') ? `${entry.value.toFixed(1)} Ton` : `${entry.value} Adet`}
                        </span>
                    </div>
                ))}
 
                {hasFuel && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontSize: '12px' }}>⛽</span>
                        <span style={{ color: theme?.fuelColor || '#8b5cf6', fontSize: '11px', fontWeight: 700 }}>
                            Yakıt Alındı ({fuelAmount} Lt)
                        </span>
                    </div>
                )}

                {note && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontSize: '12px' }}>📝</span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: '#8b5cf6', fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Günlük Not</span>
                            <span style={{ color: '#ffffff', fontSize: '11px', lineHeight: '1.4' }}>{note}</span>
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

const Dashboard = ({ onOpenMenu, onNavigate, isMobile } = {}) => {
    const { trips, invoices, fuelRecords, maintenanceRecords, paymentRecords, penalties, dailyNotes, updateDailyNote } = useContext(DataContext);
    const [isProfitModalOpen, setIsProfitModalOpen] = useState(false);

    const now = new Date();
    
    // Eğer bu ay 5'ten az veri varsa, otomatik olarak bir önceki ayı göster
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const tMonth = now.getMonth();
        const tYear = now.getFullYear();
        const curTrips = (trips || []).filter(t => {
            if (t.deleted || !t.date) return false;
            const d = new Date(t.date);
            return d.getFullYear() === tYear && d.getMonth() === tMonth;
        }).length;
        if (curTrips < 5) {
            return tMonth === 0 ? 11 : tMonth - 1;
        }
        return tMonth;
    });

    const [selectedYear, setSelectedYear] = useState(() => {
        const tMonth = now.getMonth();
        const tYear = now.getFullYear();
        const curTrips = (trips || []).filter(t => {
            if (t.deleted || !t.date) return false;
            const d = new Date(t.date);
            return d.getFullYear() === tYear && d.getMonth() === tMonth;
        }).length;
        if (curTrips < 5 && tMonth === 0) {
            return tYear - 1;
        }
        return tYear;
    });

    const [isAllTime, setIsAllTime] = useState(false);
    const [activeThemeId, setActiveThemeId] = useState('violet');
    const activeTheme = CHART_THEMES[activeThemeId] || CHART_THEMES.violet;
    const [liveDieselPrice, setLiveDieselPrice] = useState(null);

    // Canlı Motorin Fiyatı Çekme (Ankara Bölgesi)
    useEffect(() => {
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

    const recentTrips = useMemo(() => {
        return (activeTrips || [])
            .filter(t => t.date)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 3);
    }, [activeTrips]);

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

    // ─── Mobil Yatay (Landscape) Mod Kontrolü ───
    const [isLandscape, setIsLandscape] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.innerWidth > window.innerHeight && window.innerHeight < 600;
    });

    React.useEffect(() => {
        const checkLandscape = () => {
            setIsLandscape(window.innerWidth > window.innerHeight && window.innerHeight < 600);
        };
        checkLandscape();
        window.addEventListener('resize', checkLandscape);
        window.addEventListener('orientationchange', checkLandscape);
        return () => {
            window.removeEventListener('resize', checkLandscape);
            window.removeEventListener('orientationchange', checkLandscape);
        };
    }, []);

    const currentDailyTrips = activeDays > 0 ? periodTrips / activeDays : 0;
    const currentDailyTonnage = activeDays > 0 ? periodTonnage / activeDays : 0;
    const perfDelta = (prevDailyTrips !== null && prevDailyTrips !== 0) ? ((currentDailyTrips - prevDailyTrips) / prevDailyTrips) * 100 : null;
    const PerfIcon = perfDelta === null ? Minus : perfDelta >= 0 ? TrendingUp : TrendingDown;
    const perfColor = perfDelta === null ? '#64748b' : perfDelta >= 0 ? '#10b981' : '#ef4444';

    const maxTrips = useMemo(() => {
        const mx = Math.max(...chartData.map(d => d['Sefer Sayısı'] || 0), 1);
        return mx;
    }, [chartData]);

    const maxTonnage = useMemo(() => {
        const mx = Math.max(...chartData.map(d => d['Taşınan Tonaj'] || 0), 50);
        return mx;
    }, [chartData]);

    // ─── YATAY (LANDSCAPE) MOD: SADECE GENİŞLETİLMİŞ TAM EKRAN GRAFİK ───
    if (isLandscape) {
        return (
            <div 
                className="h-screen w-screen fixed inset-0 z-50 bg-[#07090e] p-2.5 sm:p-4 flex flex-col justify-between overflow-hidden select-none"
                style={{
                    paddingLeft: 'calc(0.75rem + env(safe-area-inset-left, 0px))',
                    paddingRight: 'calc(0.75rem + env(safe-area-inset-right, 0px))',
                    paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))',
                    paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
                }}
            >
                {/* Yatay Mod Üst Kontrol Çubuğu */}
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#0d1117] border border-white/[0.08] rounded-xl shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
                        <h3 className="font-bold text-xs sm:text-sm text-white tracking-tight truncate">
                            Aylık Operasyon Grafiği
                        </h3>
                    </div>

                    {/* Metrik Özet Rozetleri */}
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-300 shrink-0">
                        <span className="bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700">
                            Aktif: <strong className="text-white">{activeDays}</strong> Gün
                        </span>
                        <span className="bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700">
                            Ort: <strong className="text-white">{currentDailyTonnage.toFixed(1)}</strong> Ton
                        </span>
                        {perfDelta !== null && (
                            <span className={`px-2 py-0.5 rounded-md border ${perfDelta >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                {perfDelta >= 0 ? '↗' : '↘'} %{Math.abs(perfDelta).toFixed(1)}
                            </span>
                        )}
                    </div>

                    {/* Zaman Navigasyonu */}
                    <div className="flex items-center bg-[#07090e] border border-white/10 p-0.5 rounded-lg shrink-0">
                        <button onClick={goToPrev} className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer">
                            <ChevronLeft size={14} />
                        </button>
                        <span className="text-[11px] font-bold text-white px-2 min-w-[70px] text-center whitespace-nowrap">
                            {MONTHS_SHORT[selectedMonth]} {selectedYear}
                        </span>
                        <button onClick={goToNext} className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer">
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>

                {/* Tam Ekran Geniş Grafik */}
                <div className="flex-1 w-full min-h-0 pt-2 pb-2">
                    {chartData.every(d => (d['Sefer Sayısı'] || 0) === 0 && (d['Taşınan Tonaj'] || 0) === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <Activity size={28} className="mb-1 opacity-30 animate-pulse" />
                            <p className="font-medium text-xs">Bu dönemde kayıtlı veri bulunamadı.</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                                data={chartData}
                                margin={{ top: 10, right: 15, left: -25, bottom: 20 }}
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
                                    <linearGradient id="gradSeferLandscape" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={activeTheme.seferGrad} stopOpacity={0.25} />
                                        <stop offset="100%" stopColor={activeTheme.seferGrad} stopOpacity={0.0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.15} vertical={false} />
                                <XAxis 
                                    dataKey="name" 
                                    stroke="#64748b" 
                                    fontSize={10} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    dy={8} 
                                    interval={0} 
                                />
                                <YAxis 
                                    yAxisId="left" 
                                    stroke="#64748b" 
                                    fontSize={10} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    domain={[0, maxTrips <= 2 ? 3 : Math.ceil(maxTrips * 1.15)]}
                                    ticks={maxTrips <= 2 ? [0, 1, 2, 3] : undefined}
                                    allowDecimals={false}
                                />
                                <YAxis 
                                    yAxisId="right" 
                                    orientation="right" 
                                    hide={true} 
                                    domain={[0, Math.max(100, Math.ceil(maxTonnage * 1.15))]} 
                                />
                                <Tooltip content={<CustomTooltip isAllTime={isAllTime} theme={activeTheme} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                
                                <Area 
                                    yAxisId="right" 
                                    type="monotone" 
                                    dataKey="Taşınan Tonaj" 
                                    stroke={activeTheme.tonajStroke} 
                                    strokeWidth={1.8} 
                                    fillOpacity={0} 
                                    fill="none" 
                                    dot={false} 
                                    activeDot={{ r: 3.5, strokeWidth: 1.5, stroke: '#07090e', fill: activeTheme.tonajStroke }} 
                                />
                                <Area 
                                    yAxisId="left" 
                                    type="monotone" 
                                    dataKey="Sefer Sayısı" 
                                    stroke={activeTheme.seferStroke} 
                                    strokeWidth={2} 
                                    fillOpacity={1} 
                                    fill="url(#gradSeferLandscape)" 
                                    dot={false} 
                                    activeDot={{ r: 4, strokeWidth: 1.5, stroke: '#07090e', fill: activeTheme.seferStroke }} 
                                />
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

                {/* Günlük Not Modalı */}
                {createPortal(
                    <AnimatePresence>
                        {isNoteModalOpen && (
                            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => { setIsNoteModalOpen(false); setConfirmDeleteNote(false); }}
                                    className="absolute inset-0 bg-black/80 backdrop-blur-md"
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#07090e] p-4 shadow-2xl"
                                >
                                    <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                                        <CalendarDays size={16} className="text-sky-400" />
                                        {editNoteDay}. Gün Notu
                                    </h4>
                                    <form onSubmit={handleSaveModalNote} className="space-y-3">
                                        <textarea
                                            value={modalNoteText}
                                            onChange={(e) => { setModalNoteText(e.target.value); setConfirmDeleteNote(false); }}
                                            placeholder="Günün operasyon notu..."
                                            rows={2}
                                            autoFocus
                                            className="w-full bg-[#0d1117] border border-white/10 text-white rounded-xl p-2.5 text-xs outline-none focus:border-slate-500 resize-none"
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button type="button" onClick={() => setIsNoteModalOpen(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">İptal</button>
                                            <button type="submit" className="px-4 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl">Kaydet</button>
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
    }

    // ─── DİKEY (PORTRAIT) MOD: DENGELİ GRAFİK & CANLI OPERASYON AKIŞI ───
    return (
        <div 
            className="flex-1 flex flex-col h-full w-full p-2.5 sm:p-4 lg:p-6 overflow-y-auto custom-scrollbar gap-2.5 sm:gap-3 max-w-[1920px] mx-auto pb-6"
            style={{
                paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
            }}
        >
            {/* Mobilde Şık Başlık & Menü Çubuğu */}
            {isMobile && onOpenMenu && (
                <div className="flex items-center justify-between gap-3 pb-1 border-b border-white/[0.06] shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <button 
                            onClick={onOpenMenu} 
                            className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors flex items-center justify-center cursor-pointer rounded-lg hover:bg-white/5"
                            title="Menüyü Aç"
                        >
                            <Menu size={22} />
                        </button>
                        <h2 className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
                            Özet
                        </h2>
                    </div>
                </div>
            )}

            {/* ─── 4'LÜ STRATEJİK KPI ÖZET KARTLARI (MOBİLDE 2x2 KOMPAKT GRID) ─── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5 shrink-0">
                
                {/* 1. KART: Toplam Gelir (Ciro - Tüm Zamanlar) */}
                <div 
                    onClick={() => setIsProfitModalOpen(true)}
                    className="bg-[#07090e] border border-white/[0.08] hover:border-slate-700 p-2.5 sm:p-3 rounded-2xl cursor-pointer transition-all duration-200 flex flex-col justify-between overflow-hidden group shadow-sm"
                >
                    <div className="flex justify-between items-center mb-1">
                        <p className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider group-hover:text-slate-300 transition-colors">
                            Toplam Gelir
                        </p>
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                            <Wallet size={13} />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-base sm:text-lg lg:text-xl font-bold text-white tracking-tight truncate">
                            {totalRevenue > 0 ? `₺${Math.round(totalRevenue).toLocaleString('tr-TR')}` : '₺0'}
                        </h3>
                    </div>
                </div>

                {/* 2. KART: Aylık Yakıt Gideri (Seçili Ay) */}
                <div className="bg-[#07090e] border border-white/[0.08] hover:border-slate-700 p-2.5 sm:p-3 rounded-2xl transition-all duration-200 flex flex-col justify-between overflow-hidden group shadow-sm">
                    <div className="flex justify-between items-center mb-1">
                        <p className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider group-hover:text-slate-300 transition-colors truncate pr-1">
                            Yakıt <span className="text-[9px] text-slate-500 lowercase">({MONTHS_SHORT[selectedMonth]})</span>
                        </p>
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                            <Droplet size={13} />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-base sm:text-lg lg:text-xl font-bold text-white tracking-tight truncate">
                            ₺{Math.round(monthFuelCost).toLocaleString('tr-TR')}
                        </h3>
                    </div>
                </div>

                {/* 3. KART: Ortalama Tüketim (Seçili Ay) */}
                <div className="bg-[#07090e] border border-white/[0.08] hover:border-slate-700 p-2.5 sm:p-3 rounded-2xl transition-all duration-200 flex flex-col justify-between overflow-hidden group shadow-sm">
                    <div className="flex justify-between items-center mb-1">
                        <p className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider group-hover:text-slate-300 transition-colors truncate pr-1">
                            Ort. Tüketim
                        </p>
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                            <Gauge size={13} />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-base sm:text-lg lg:text-xl font-bold text-white tracking-tight flex items-baseline">
                            {monthAvgConsumption ? (
                                <>
                                    <span>{monthAvgConsumption.toFixed(1)}</span>
                                    <span className="text-[10px] sm:text-xs font-bold text-cyan-400 ml-1">L/100km</span>
                                </>
                            ) : (
                                <span className="text-slate-500 text-sm font-normal">—</span>
                            )}
                        </h3>
                    </div>
                </div>

                {/* 4. KART: Güncel Motorin Fiyatı */}
                <div className="bg-[#07090e] border border-white/[0.08] hover:border-slate-700 p-2.5 sm:p-3 rounded-2xl transition-all duration-200 flex flex-col justify-between overflow-hidden group shadow-sm">
                    <div className="flex justify-between items-center mb-1">
                        <p className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider group-hover:text-slate-300 transition-colors truncate pr-1">
                            Güncel Motorin
                        </p>
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                            <Zap size={13} />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-base sm:text-lg lg:text-xl font-bold text-white tracking-tight flex items-baseline">
                            ₺{currentDieselPrice.toFixed(2)}
                            <span className="text-[10px] sm:text-xs font-bold text-emerald-400 ml-1">/ Lt</span>
                        </h3>
                    </div>
                </div>

            </div>

            {/* ─── AYLIK OPERASYON HACMİ GRAFİK PANELİ (DOĞAL & ZARİF BOYUT) ─── */}
            <div className="bg-[#07090e] border border-white/[0.08] p-3 sm:p-4 rounded-2xl shrink-0 flex flex-col justify-between shadow-sm">

                {/* Başlık ve Ay Seçici */}
                <div className="flex items-center justify-between gap-2 shrink-0 pb-1">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm sm:text-base text-white tracking-tight">
                            Aylık Operasyon Hacmi
                        </h3>
                        <span className="text-[10px] text-slate-500 hidden sm:inline">
                            (Yatayda Detaylı 📱)
                        </span>
                    </div>

                    {/* Zaman Navigasyonu */}
                    <div className="flex items-center bg-[#0d1117] border border-white/10 p-0.5 rounded-xl shadow-sm">
                        <button onClick={goToPrev} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all cursor-pointer">
                            <ChevronLeft size={14} />
                        </button>
                        <span className="text-xs sm:text-sm font-semibold text-white px-2.5 min-w-[70px] sm:min-w-[85px] text-center select-none tracking-wide">
                            {selectedYear === now.getFullYear() ? MONTHS_TR[selectedMonth] : `${MONTHS_TR[selectedMonth]} ${selectedYear}`}
                        </span>
                        <button onClick={goToNext} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all cursor-pointer">
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>

                {/* Grafik - Yumuşak ve Geniş Açılı Eğriler (160px Doğal Yükseklik) */}
                <div className="w-full h-[155px] sm:h-[185px] relative select-none outline-none focus:outline-none my-1">
                    {chartData.every(d => (d['Sefer Sayısı'] || 0) === 0 && (d['Taşınan Tonaj'] || 0) === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <Activity size={28} className="mb-1 opacity-30 animate-pulse" />
                            <p className="font-medium text-xs">Bu dönemde veri bulunamadı.</p>
                            <p className="text-[10px] opacity-70">Sefer kaydedildikçe grafik oluşacaktır.</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                                data={chartData}
                                margin={{ top: 8, right: 10, left: -22, bottom: 5 }}
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
                                    <linearGradient id="gradSeferPortrait" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={activeTheme.seferGrad} stopOpacity={0.25} />
                                        <stop offset="100%" stopColor={activeTheme.seferGrad} stopOpacity={0.0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.12} vertical={false} />
                                <XAxis 
                                    dataKey="name" 
                                    stroke="#64748b" 
                                    fontSize={10} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    dy={4} 
                                    interval={isAllTime ? 'preserveStartEnd' : Math.floor(chartData.length / 8)} 
                                />
                                <YAxis 
                                    yAxisId="left" 
                                    stroke="#64748b" 
                                    fontSize={10} 
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
                                <Tooltip content={<CustomTooltip isAllTime={isAllTime} theme={activeTheme} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />

                                {/* Taşınan Tonaj */}
                                <Area 
                                    yAxisId="right" 
                                    type="monotone" 
                                    dataKey="Taşınan Tonaj" 
                                    stroke={activeTheme.tonajStroke} 
                                    strokeWidth={1.5} 
                                    fillOpacity={0} 
                                    fill="none" 
                                    dot={false} 
                                    activeDot={{ r: 3.5, strokeWidth: 1.5, stroke: '#07090E', fill: activeTheme.tonajStroke }} 
                                    connectNulls={false} 
                                />

                                {/* Sefer Sayısı */}
                                <Area 
                                    yAxisId="left" 
                                    type="monotone" 
                                    dataKey="Sefer Sayısı" 
                                    stroke={activeTheme.seferStroke} 
                                    strokeWidth={1.8} 
                                    fillOpacity={1} 
                                    fill="url(#gradSeferPortrait)" 
                                    dot={false} 
                                    activeDot={{ r: 4, strokeWidth: 1.5, stroke: '#07090E', fill: activeTheme.seferStroke }} 
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
                    <div className="pt-2 border-t border-white/[0.06] grid grid-cols-3 gap-2 shrink-0">
                        <div className="flex flex-col items-center justify-center p-1.5 sm:p-2 rounded-xl bg-[#0d1117] border border-white/[0.04] text-center">
                            <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Aktif Gün</span>
                            <span className="text-xs sm:text-sm font-bold text-white mt-0.5">{activeDays} <span className="text-[10px] text-slate-400 font-normal">gün</span></span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-1.5 sm:p-2 rounded-xl bg-[#0d1117] border border-white/[0.04] text-center">
                            <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Günlük Ort.</span>
                            <span className="text-xs sm:text-sm font-bold text-white mt-0.5">
                                {currentDailyTonnage.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                <span className="text-[10px] text-slate-400 font-normal"> Ton</span>
                            </span>
                        </div>
                        <div className="flex flex-col items-center justify-center p-1.5 sm:p-2 rounded-xl bg-[#0d1117] border border-white/[0.04] text-center">
                            <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Geçen Aya</span>
                            <span className={`text-xs sm:text-sm font-bold mt-0.5 ${perfDelta === null ? 'text-slate-400' : perfDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {perfDelta === null ? 'Veri Yok' : `${perfDelta >= 0 ? '+' : ''}%${Math.abs(perfDelta).toFixed(1)}`}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── SON OPERASYONLAR AKIŞI (MODERN FİLO BAKIŞI) ─── */}
            <div className="bg-[#07090e] border border-white/[0.08] p-3 sm:p-4 rounded-2xl shadow-sm flex flex-col gap-2.5 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                            <Truck size={13} />
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight">Son Seferler</h4>
                    </div>
                    {onNavigate && (
                        <button 
                            onClick={() => onNavigate('trips')}
                            className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                            <span>Tümünü Gör</span>
                            <ChevronRight size={13} />
                        </button>
                    )}
                </div>

                {recentTrips.length === 0 ? (
                    <div className="p-3 rounded-xl bg-[#0d1117] border border-white/[0.04] text-center text-xs text-slate-500">
                        Kayıtlı sefer bulunamadı.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {recentTrips.map((trip, idx) => {
                            const dateObj = trip.date ? new Date(trip.date) : null;
                            const isValidDate = dateObj && !isNaN(dateObj.getTime());
                            const dateFormatted = isValidDate ? `${dateObj.getDate()} ${MONTHS_SHORT[dateObj.getMonth()] || ''}` : '—';
                            const routeText = (trip.from && trip.to) ? `${trip.from} → ${trip.to}` : (trip.route || trip.from || trip.to || 'Bölgesel Sefer');
                            const tonnageVal = trip.tonnage ? parseTonnageInTons(trip.tonnage) : null;
                            const rawPrice = trip.price ?? trip.freightPrice;
                            const priceNum = rawPrice !== undefined && rawPrice !== null && rawPrice !== '' ? Number(rawPrice) : null;
                            const validPrice = priceNum !== null && !isNaN(priceNum) && priceNum > 0 ? priceNum : null;

                            return (
                                <div 
                                    key={trip.id || idx}
                                    onClick={() => onNavigate && onNavigate('trips')}
                                    className="flex items-center justify-between p-2 sm:p-2.5 rounded-xl bg-[#0d1117] border border-white/[0.04] hover:border-slate-700 transition-all cursor-pointer group"
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md shrink-0">
                                            {dateFormatted}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-white truncate group-hover:text-sky-400 transition-colors">
                                                {routeText}
                                            </p>
                                            <p className="text-[10px] text-slate-400 truncate">
                                                {trip.driverName || trip.driver || 'Şoför Belirtilmedi'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="text-right shrink-0 pl-2">
                                        {tonnageVal ? (
                                            <p className="text-xs font-bold text-slate-200">
                                                {tonnageVal.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-[10px] text-slate-400 font-normal">Ton</span>
                                            </p>
                                        ) : null}
                                        {validPrice !== null ? (
                                            <p className="text-[10px] font-semibold text-emerald-400">
                                                ₺{validPrice.toLocaleString('tr-TR')}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
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
