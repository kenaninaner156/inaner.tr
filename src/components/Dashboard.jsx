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
    Trash2
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

// --- Custom Tooltip ---
const CustomTooltip = ({ active, payload, label, isAllTime }) => {
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
                        <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: entry.color, flexShrink: 0, boxShadow: `0 0 8px ${entry.color}` }} />
                        <span style={{ color: '#94a3b8', fontSize: '11px', flex: 1 }}>{entry.name}:</span>
                        <span style={{ color: entry.color, fontSize: '12px', fontWeight: 700 }}>
                           {entry.dataKey.includes('Tonaj') ? `${entry.value.toFixed(1)} Ton` : `${entry.value} Adet`}
                        </span>
                    </div>
                ))}
 
                {hasFuel && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ fontSize: '12px' }}>⛽</span>
                        <span style={{ color: '#f59e0b', fontSize: '11px', fontWeight: 700 }}>
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

// --- Custom Fuel Dot Bottom ---
const GlowingFuelDotBottom = (props) => {
    const { cx, cy, payload } = props;
    if (payload['Yakıt (Lt)'] > 0) {
        return (
            <circle cx={cx} cy={cy} r={3} fill="#f59e0b" stroke="#0f172a" strokeWidth={1.5} style={{filter: 'drop-shadow(0px 0px 4px rgba(245,158,11,0.6))'}} />
        );
    }
    return null;
};


const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const KDV_RATE = 1.20;
const FUEL_L_PER_100KM = 32;

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
 
    // Daily Notes edit state
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [editNoteDay, setEditNoteDay] = useState('');
    const [modalNoteText, setModalNoteText] = useState('');
    const [confirmDeleteNote, setConfirmDeleteNote] = useState(false);
 
    const lastHistDay = useMemo(() => {
        const todayDate = now.getDate();
        const todayMonth = now.getMonth();
        const todayYear = now.getFullYear();
        const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const isCurrentMonth = selectedMonth === todayMonth && selectedYear === todayYear;
        return isCurrentMonth ? todayDate : daysInMonth;
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

    const activeTrips = useMemo(() => trips.filter(t => !t.deleted), [trips]);
    const activeInvoices = useMemo(() => invoices ? invoices.filter(inv => !inv.deleted) : [], [invoices]);
    const activeFuel = useMemo(() => fuelRecords ? fuelRecords.filter(f => !f.deleted) : [], [fuelRecords]);

    // --- Stat kartları ---
    const totalRevenue = activeInvoices.reduce((s, inv) => s + (inv.grandTotal || 0), 0);
    const pendingTrips = activeTrips.filter(t => t.status === 'Fatura Bekliyor').length;
    const completedTrips = activeTrips.filter(t => t.status === 'Fatura Kesildi' || t.status === 'Ödendi').length;
    const totalTonnage = activeTrips.reduce((s, t) => s + t.tonnage, 0);

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
            activeTrips.forEach(t => t.date && add(t.date, 1, t.tonnage || 0, 0));
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
                dayMap[day].tonnage += (t.tonnage || 0);
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
        const periodTotalTonnage = monthTrips.reduce((s, t) => s + (t.tonnage || 0), 0);
 
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
        <div className="space-y-6 animate-in fade-in duration-500 pb-ios-nav">

            {/* İstatistik Kartları */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                <div 
                    onClick={() => setIsProfitModalOpen(true)}
                    className="glass-panel p-6 relative overflow-hidden group cursor-pointer hover:border-violet-500/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all duration-300 transform hover:-translate-y-1"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl group-hover:bg-violet-500/20 transition-all duration-500"></div>
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-[var(--text-secondary)] text-sm font-semibold tracking-wide uppercase group-hover:text-violet-400 transition-colors">Toplam Gelir</p>
                        <Wallet className="text-violet-400 opacity-80 group-hover:scale-110 transition-transform duration-300" size={24} />
                    </div>
                    <h3 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight group-hover:text-white transition-colors">
                        {totalRevenue > 0 ? `₺${totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₺0'}
                    </h3>
                    <div className="mt-4 text-xs font-medium">
                        {totalRevenue > 0 ? <span className="text-violet-400/80 bg-violet-400/10 px-2 py-1.5 rounded-md group-hover:bg-violet-400/20 transition-colors">Kâr Analizini Gör &rarr;</span> : <span className="text-slate-500">Henüz onaylı fatura yok</span>}
                    </div>
                </div>

                <div className="glass-panel p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-[var(--text-secondary)] text-sm font-semibold tracking-wide uppercase">Tamamlanan Sefer</p>
                        <Truck className="text-blue-400 opacity-80" size={24} />
                    </div>
                    <h3 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">
                        {completedTrips} <span className="text-lg text-[var(--text-secondary)] font-normal">Adet</span>
                    </h3>
                    <div className="mt-4 text-xs font-medium">
                        {completedTrips > 0 ? <span className="text-blue-400/80 bg-blue-400/10 px-2 py-1 rounded-md">Tasdiklenmiş ve bitmiş seferler</span> : <span className="text-slate-500">Henüz veri girilmedi</span>}
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
                        <h3 className="font-semibold text-lg flex items-center text-[var(--text-primary)] gap-2 flex-wrap">
                            <Activity className="mr-2 text-violet-400" size={20} />
                            <span>Aylık Operasyon Hacmi</span>
                            {!isAllTime && (
                                <span className="text-[10px] font-normal text-violet-400 bg-violet-400/10 px-2.5 py-0.5 rounded-full select-none tracking-wider">
                                    Düzenlemek için güne çift tıklayın
                                </span>
                            )}
                        </h3>
                    </div>

                    {/* Zaman Navigasyonu */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsAllTime(true)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${isAllTime ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40' : 'text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-700'}`}
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

                {/* Grafik */}
                <div className="h-[320px] w-full relative select-none outline-none focus:outline-none">
                    {chartData.every(d => (d['Sefer Sayısı'] || 0) === 0 && (d['Taşınan Tonaj'] || 0) === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 select-text">
                            <Activity size={32} className="mb-3 opacity-30 animate-pulse" />
                            <p className="font-medium">Bu dönemde veri bulunamadı.</p>
                            <p className="text-sm mt-1 opacity-70">Operasyonlar kaydedildikçe grafiğiniz oluşacaktır.</p>
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
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.01} />
                                    </linearGradient>
                                    <linearGradient id="gradTonaj" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.01} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.18} vertical={false} />
                                <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={8} interval={isAllTime ? 'preserveStartEnd' : Math.floor(chartData.length / 8)} />
                                <YAxis yAxisId="left" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dx={-4} />
                                <YAxis yAxisId="right" orientation="right" hide={true} />
                                <Tooltip content={<CustomTooltip isAllTime={isAllTime} />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />

                                {/* Dual Area Gerçek Vizyon */}
                                <Area yAxisId="right" type="monotone" dataKey="Taşınan Tonaj" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#gradTonaj)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6', style: {filter: 'drop-shadow(0px 0px 5px rgba(59,130,246,0.6))'} }} connectNulls={false} />
                                <Area yAxisId="left" type="monotone" dataKey="Sefer Sayısı" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#gradSefer)" dot={false} activeDot={{ r: 6, strokeWidth: 2, stroke: '#10b981', fill: '#0f172a', style: {filter: 'drop-shadow(0px 0px 8px rgba(16,185,129,0.8))'} }} connectNulls={false} />
                                
                                {/* Zemin Yakıt Noktaları */}
                                <Area yAxisId="left" type="monotone" dataKey="Yakıt Zemin" stroke="none" fill="none" dot={<GlowingFuelDotBottom />} activeDot={false} isAnimationActive={false} />
                            </ComposedChart>
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
                            <div className="p-2 rounded-lg bg-blue-500/10 flex-shrink-0"><Weight size={15} className="text-blue-400" /></div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Günlük Ort. Tonaj</p>
                                <p className="text-base font-bold text-[var(--text-primary)]">
                                    {currentDailyTonnage.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    <span className="text-xs text-slate-500 font-normal"> Ton / gün</span>
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg flex-shrink-0" style={{ background: `${perfColor}15` }}><PerfIcon size={15} style={{ color: perfColor }} /></div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Geçen Aya Göre</p>
                                <p className="text-base font-bold" style={{ color: perfColor }}>
                                    {perfDelta === null ? <span className="text-slate-500 text-xs font-normal">Veri Yok</span> : `${perfDelta >= 0 ? '+' : ''}${perfDelta.toFixed(1)}%`}
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
