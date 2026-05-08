import React, { useState, useMemo } from 'react';
import { X, TrendingUp, TrendingDown, Wallet, Layers, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';

// Haftanın numarası ve yılı hesaplayan yardımcı fonksiyon
const getWeekNumber = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week: weekNo };
};

const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Animasyon varyantları
const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

const ProfitAnalysisModal = ({ isOpen, onClose, data }) => {
    const { invoices = [], fuelRecords = [], maintenanceRecords = [], paymentRecords = [], penalties = [] } = data;
    const [viewMode, setViewMode] = useState('weekly'); 
    const [includeAll, setIncludeAll] = useState(false); 

    const processedData = useMemo(() => {
        const groups = {};

        // Haftalık Mod: Gruplar "Faturalar" baz alınarak oluşturulur
        if (viewMode === 'weekly') {
            invoices.filter(i => !i.deleted).forEach(inv => {
                const key = inv.docId || inv.id;
                let shortLabel = "Belirsiz";
                
                if (inv.startDate && inv.endDate) {
                    const sd = new Date(inv.startDate);
                    const ed = new Date(inv.endDate);
                    if (sd.getMonth() === ed.getMonth()) {
                        shortLabel = `${sd.getDate()}-${ed.getDate()} ${MONTHS_SHORT[sd.getMonth()]}`;
                    } else {
                        shortLabel = `${sd.getDate()} ${MONTHS_SHORT[sd.getMonth()]} - ${ed.getDate()} ${MONTHS_SHORT[ed.getMonth()]}`;
                    }
                }
                
                groups[key] = { 
                    label: shortLabel, 
                    fullLabel: inv.docId || 'Fatura',
                    sortKey: inv.startDate || inv.createdAt || '9999', 
                    gelir: inv.grandTotal || inv.totalAmount || 0, 
                    gider: 0 
                };
            });
        }

        const addToGroup = (dateStr, type, amount) => {
            if (!dateStr || isNaN(amount) || amount === 0) return;
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return;

            let bucketId, label, sortKey, fullLabel;

            if (viewMode === 'monthly') {
                const yr = d.getFullYear();
                const mo = d.getMonth();
                bucketId = `${yr}-${String(mo).padStart(2, '0')}`;
                label = `${MONTHS_SHORT[mo]} ${yr}`;
                fullLabel = label;
                sortKey = bucketId;
            } else {
                const t = d.getTime();
                const activeInvs = invoices.filter(i => !i.deleted);
                const matchingInvoice = activeInvs.find(inv => {
                    if (!inv.startDate || !inv.endDate) return false;
                    const start = new Date(inv.startDate).setHours(0,0,0,0);
                    const end = new Date(inv.endDate).setHours(23,59,59,999);
                    return t >= start && t <= end;
                });

                if (matchingInvoice) {
                    bucketId = matchingInvoice.docId || matchingInvoice.id;
                } else {
                    const { year, week } = getWeekNumber(d);
                    bucketId = `Takvim-Hafta-${year}-${week}`;
                    label = `Hafta ${week}`;
                    fullLabel = `Fatura Dışı (Hafta ${week}, ${year})`;
                    sortKey = `${year}-W${String(week).padStart(2, '0')}`;
                }
            }

            if (!groups[bucketId]) {
                groups[bucketId] = { label: label || bucketId, fullLabel: fullLabel || bucketId, sortKey: sortKey || bucketId, gelir: 0, gider: 0 };
            }

            if (type === 'income') {
                groups[bucketId].gelir += amount;
            } else {
                groups[bucketId].gider += amount;
            }
        };

        if (viewMode === 'monthly') {
            invoices.filter(i => !i.deleted).forEach(inv => {
                const d = inv.endDate || inv.date || inv.createdAt;
                addToGroup(d, 'income', inv.grandTotal || inv.totalAmount || 0);
            });
        }

        fuelRecords.filter(f => !f.deleted).forEach(f => {
            addToGroup(f.date, 'expense', f.price || f.totalCost || 0);
        });

        if (includeAll) {
            paymentRecords.filter(p => !p.deleted && p.type === 'Tahsilat').forEach(pay => addToGroup(pay.date, 'income', pay.amount || 0));
            paymentRecords.filter(p => !p.deleted && p.type === 'Ödeme').forEach(pay => addToGroup(pay.date, 'expense', pay.amount || 0));
            maintenanceRecords.filter(m => !m.deleted).forEach(m => addToGroup(m.date, 'expense', m.totalCost || m.price || 0));
            penalties.filter(p => !p.deleted).forEach(p => addToGroup(p.date || p.createdAt, 'expense', p.amount || p.total || p.cost || 0));
        }

        const sortedArray = Object.values(groups).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

        return sortedArray.map(item => ({
            name: item.label,
            fullName: item.fullLabel,
            Gelir: parseFloat(item.gelir.toFixed(2)),
            Gider: parseFloat(item.gider.toFixed(2)),
            Kar: parseFloat((item.gelir - item.gider).toFixed(2))
        }));

    }, [invoices, fuelRecords, maintenanceRecords, paymentRecords, penalties, viewMode, includeAll]);

    const totals = useMemo(() => {
        return processedData.reduce((acc, curr) => {
            acc.gelir += curr.Gelir;
            acc.gider += curr.Gider;
            acc.kar += curr.Kar;
            return acc;
        }, { gelir: 0, gider: 0, kar: 0 });
    }, [processedData]);

    if (!isOpen) return null;

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const dataPoint = payload[0].payload;
            return (
                <div className="bg-[#0B0E14]/95 border border-white/5 rounded-2xl p-4 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] min-w-[220px]">
                    <p className="text-slate-400 text-[10px] font-bold mb-1 uppercase tracking-widest">{dataPoint.fullName}</p>
                    <p className="text-white text-sm font-semibold mb-4">{label}</p>
                    
                    <div className="space-y-2.5 mb-3 pb-3 border-b border-white/5">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 font-medium">Gelir:</span>
                            <span className="font-semibold text-emerald-400">₺{dataPoint.Gelir.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 font-medium">Gider:</span>
                            <span className="font-semibold text-red-400">₺{dataPoint.Gider.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                    
                    <div className="flex justify-between items-center text-base font-black">
                        <span className="text-slate-300">Net:</span>
                        <span className={dataPoint.Kar >= 0 ? "text-violet-400" : "text-orange-400"}>
                            ₺{dataPoint.Kar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>
            );
        }
        return null;
    };

    const CustomActiveBar = (props) => {
        const { x, y, width, height, fill } = props;
        return (
            <rect 
                x={x} 
                y={y} 
                width={width} 
                height={height} 
                fill={fill}
                rx={4} 
                ry={4} 
                style={{ filter: 'brightness(1.2) contrast(1.1)' }}
            />
        );
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* 1. Global Arka Plan Overlay */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="fixed inset-0 bg-[#030712]/80 backdrop-blur-md z-[99]"
                        onClick={onClose}
                    />

                    {/* 2. Sınırlandırılmış Modal Taşıyıcı (Sidebar alanını hariç tutar) */}
                    <div className="fixed top-0 right-0 bottom-0 left-0 md:left-[288px] z-[100] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
                        
                        {/* 3. Modal İçeriği */}
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.96, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 10 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="bg-[#0B0E14] border border-white/10 rounded-3xl w-full max-w-4xl h-auto max-h-[95vh] flex flex-col shadow-2xl relative pointer-events-auto overflow-hidden"
                        >
                        {/* Soft Glows */}
                        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-[100px] pointer-events-none mix-blend-screen"></div>
                        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none mix-blend-screen"></div>

                        {/* Header (Sabit Yükseklik) */}
                        <div className="flex-none flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 border-b border-white/5 relative z-10 gap-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
                                    <Wallet size={16} className="text-violet-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold tracking-tight text-white leading-tight">
                                        Kâr Analizi
                                    </h2>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Net kazanç özeti.</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                {/* Kapsam Toggle (Ekstra Küçük Minimal Buton) */}
                                <button
                                    onClick={() => setIncludeAll(!includeAll)}
                                    className={`flex items-center px-2.5 py-1 text-[9px] font-bold tracking-wider rounded-full transition-all border ${
                                        includeAll 
                                        ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.1)]' 
                                        : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10 hover:text-white'
                                    }`}
                                >
                                    <Filter size={10} className="mr-1" />
                                    {includeAll ? 'KAPSAMLI' : 'SADECE FATURA'}
                                </button>

                                {/* Periyot Toggle (Ekstra Küçük) */}
                                <div className="bg-white/5 border border-white/5 rounded-full p-0.5 flex">
                                    <button
                                        onClick={() => setViewMode('weekly')}
                                        className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-full transition-all ${viewMode === 'weekly' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Haftalık
                                    </button>
                                    <button
                                        onClick={() => setViewMode('monthly')}
                                        className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-full transition-all ${viewMode === 'monthly' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Aylık
                                    </button>
                                </div>
                                
                                <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-full text-slate-500 hover:text-white hover:bg-white/10 transition-colors bg-white/5 border border-white/5 ml-1">
                                    <X size={12} />
                                </button>
                            </div>
                        </div>

                        {/* İçerik (Esnek ve Scroll Edilebilir) */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar relative z-10 flex flex-col gap-4 sm:gap-6">
                            
                            {/* Özet Kartları (Sabit Yükseklik) */}
                            <motion.div 
                                variants={containerVariants}
                                initial="hidden"
                                animate="visible"
                                className="flex-none grid grid-cols-1 md:grid-cols-3 gap-4"
                            >
                                <motion.div variants={itemVariants} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 sm:p-5 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
                                    <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                                        <TrendingUp size={12} className="text-emerald-500/70" /> 
                                        {includeAll ? 'GELİR (TÜMÜ)' : 'GELİR (FATURA)'}
                                    </p>
                                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">₺{totals.gelir.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</h3>
                                </motion.div>

                                <motion.div variants={itemVariants} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 sm:p-5 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-all"></div>
                                    <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                                        <TrendingDown size={12} className="text-red-500/70" /> 
                                        {includeAll ? 'GİDER (TÜMÜ)' : 'GİDER (YAKIT)'}
                                    </p>
                                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">₺{totals.gider.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</h3>
                                </motion.div>

                                <motion.div variants={itemVariants} className={`bg-white/[0.02] border rounded-2xl p-4 sm:p-5 relative overflow-hidden group ${totals.kar >= 0 ? 'border-violet-500/20' : 'border-orange-500/20'}`}>
                                    <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl transition-all ${totals.kar >= 0 ? 'bg-violet-500/10 group-hover:bg-violet-500/15' : 'bg-orange-500/10 group-hover:bg-orange-500/15'}`}></div>
                                    <p className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-1.5 ${totals.kar >= 0 ? 'text-violet-400' : 'text-orange-400'}`}>
                                        <Layers size={12} /> 
                                        NET KÂR
                                    </p>
                                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">₺{totals.kar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</h3>
                                </motion.div>
                            </motion.div>

                            {/* Grafik (Esnek Yükseklik) */}
                            <motion.div 
                                variants={itemVariants}
                                initial="hidden"
                                animate="visible"
                                className="flex-1 bg-white/[0.01] border border-white/[0.03] rounded-2xl min-h-[250px] relative"
                            >
                                {processedData.length === 0 ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                                        <Wallet size={40} className="opacity-20 mb-3" />
                                        <p className="text-sm font-medium">Bu dönem için veri bulunamadı.</p>
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 p-2 sm:p-4 pb-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={processedData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                                                <defs>
                                                    <linearGradient id="karGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1}/>
                                                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.8}/>
                                                    </linearGradient>
                                                    <linearGradient id="zararGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#f97316" stopOpacity={1}/>
                                                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.8}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" strokeOpacity={0.03} vertical={false} />
                                                <XAxis 
                                                    dataKey="name" 
                                                    stroke="#64748b" 
                                                    fontSize={10} 
                                                    tickLine={false} 
                                                    axisLine={false} 
                                                    dy={10} 
                                                    tick={{ fill: '#64748b' }}
                                                />
                                                <YAxis 
                                                    stroke="#64748b" 
                                                    fontSize={10} 
                                                    tickLine={false} 
                                                    axisLine={false} 
                                                    tickFormatter={(val) => val >= 1000 ? `₺${(val/1000).toFixed(0)}k` : `₺${val}`} 
                                                    tick={{ fill: '#64748b' }}
                                                    width={50}
                                                />
                                                <Tooltip content={<CustomTooltip />} cursor={false} />
                                                
                                                <Bar dataKey="Kar" radius={[4, 4, 4, 4]} maxBarSize={48} activeBar={<CustomActiveBar />}>
                                                    {processedData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.Kar >= 0 ? 'url(#karGrad)' : 'url(#zararGrad)'} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </motion.div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default ProfitAnalysisModal;
