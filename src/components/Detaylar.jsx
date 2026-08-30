import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, FileText, Shield, ShieldCheck, Car, Calendar, Plus, Trash2,
    Bell, CheckCircle, CheckCircle2, Clock, X, ChevronDown, Paperclip, User,
    AlertCircle, BookOpen, Banknote, Pencil, ExternalLink, Image, Sparkles, Navigation, XCircle, Eye, Download, Menu,
    Truck, Award, Coins, UserCheck, Megaphone, CheckCheck, Loader2
} from 'lucide-react';
import { DataContext } from '../context/DataContext';
import { auth } from '../services/firebaseConfig';
import FileUpload from './FileUpload';

// ── Sabitler ──────────────────────────────────────────────────────────────────

const PENALTY_TYPES = [
    'Hız İhlali', 'Belge Eksikliği', 'Kırmızı Işık', 'Park Cezası',
    'Akaryakıt İhlali', 'ÖTV İhlali', 'Emniyet Kemeri', 'Diğer'
];

const DOC_TYPES = [
    { key: 'inspection', label: 'Çekici Muayenesi', icon: Truck, warningDays: 45 },
    { key: 'trailerInspection', label: 'Dorse Muayenesi', icon: Car, warningDays: 45 },
    { key: 'insurance', label: 'Çekici Kasko', icon: ShieldCheck, warningDays: 30 },
    { key: 'trailerInsurance', label: 'Dorse Kasko', icon: ShieldCheck, warningDays: 30 },
    { key: 'odp', label: 'Sigorta', icon: FileText, warningDays: 30 },
    { key: 'l1', label: 'Yetki Belgesi', icon: Award, warningDays: 60 },
    { key: 'bandrol', label: 'Bandrol (MTV)', icon: Coins, warningDays: 30 },
    { key: 'srcBelgesi', label: 'SRC Belgesi (Şoför)', icon: UserCheck, warningDays: 60 },
];

// ── Yardımcı Fonksiyonlar ─────────────────────────────────────────────────────

const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    const diff = new Date(dateStr) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const statusBadge = (days) => {
    if (days === null) return { label: 'Tarih Yok', color: 'text-slate-500', bg: 'bg-white/[0.04] border-white/10' };
    if (days < 0) return { label: `${Math.abs(days)} gün geçti!`, color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30' };
    if (days <= 30) return { label: `${days} gün kaldı`, color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30' };
    if (days <= 60) return { label: `${days} gün kaldı`, color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' };
    return { label: `${days} gün kaldı`, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' };
};

const formatTimestamp = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

// ── Local Storage Yardımcıları ─────────────────────────────────────────────────

const load = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; } };

// ═══════════════════════════════════════════════════════════════════════════════

const Detaylar = ({ onOpenMenu, isMobile }) => {
    const {
        docs, updateDocs, deleteDocField,
        penalties, addPenalty, deletePenalty, togglePenaltyPaid,
        allDrivers, companyNotifications, acknowledgeNotification, markNotificationAsRead,
        deleteCompanyNotification, clearAllCompanyNotifications
    } = React.useContext(DataContext);

    const [activeTab, setActiveTab] = useState('belgeler');
    const [notifFilter, setNotifFilter] = useState('all'); // 'all' | 'company' | 'penalties' | 'docs'
    const [selectedImage, setSelectedImage] = useState(null);
    const [ackLoadingId, setAckLoadingId] = useState(null);
    const [deletingNotifId, setDeletingNotifId] = useState(null);
    const [isClearingAll, setIsClearingAll] = useState(false);
    const [viewFiles, setViewFiles] = useState(null);

    // Bildirimlerin okundu bilgisini tutan stateler
    const [readDocsNotif, setReadDocsNotif] = useState(() => load('tir_read_docs_notif', {}));
    const [readPenaltiesNotif, setReadPenaltiesNotif] = useState(() => load('tir_read_penalties_notif', []));

    // Belgeler ve tarihler
    const [editingDoc, setEditingDoc] = useState(null);
    const [docForm, setDocForm] = useState({ date: '', notes: '', subType: 'L1', files: [] });

    // Cezalar
    const [showPenaltyForm, setShowPenaltyForm] = useState(false);
    const [editingPenaltyId, setEditingPenaltyId] = useState(null);
    const [penaltyForm, setPenaltyForm] = useState({
        date: new Date().toISOString().split('T')[0],
        driver: '',
        type: 'Hız İhlali',
        amount: '',
        plate: '',
        description: '',
        paid: false,
        files: []
    });

    // ── Bildirim Hesaplama ──────────────────────────────────────────────────────
    React.useEffect(() => {
        const handleSwitch = (e) => {
            if (e.detail === 'detaylar_notifications' || e.detail === 'bildirimler') {
                setActiveTab('bildirimler');
            }
        };
        window.addEventListener('tir_switch_tab', handleSwitch);
        return () => window.removeEventListener('tir_switch_tab', handleSwitch);
    }, []);

    const urgentDocs = DOC_TYPES.filter(dt => {
        const d = docs[dt.key];
        if (d?.isNone) return false;
        if (!d?.date) return false;
        const days = daysUntil(d.date);
        return days !== null && days <= dt.warningDays;
    });

    const unpaidPenalties = penalties.filter(p => !p.paid);

    const unreadDocsCount = urgentDocs.filter(dt => readDocsNotif[dt.key] !== docs[dt.key]?.date).length;
    const unreadPenaltiesCount = unpaidPenalties.filter(p => !readPenaltiesNotif.includes(p.id)).length;
    const totalNotifications = urgentDocs.length + unpaidPenalties.length;

    // ── Handlers ───────────────────────────────────────────────────────────────

    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
        if (tabId === 'belgeler') {
            const newRead = { ...readDocsNotif };
            urgentDocs.forEach(dt => { newRead[dt.key] = docs[dt.key]?.date; });
            setReadDocsNotif(newRead);
            localStorage.setItem('tir_read_docs_notif', JSON.stringify(newRead));
        }
        if (tabId === 'cezalar') {
            const newReadIds = [...new Set([...readPenaltiesNotif, ...unpaidPenalties.map(p => p.id)])];
            setReadPenaltiesNotif(newReadIds);
            localStorage.setItem('tir_read_penalties_notif', JSON.stringify(newReadIds));
        }
    };

    const saveDoc = () => {
        if (!editingDoc) return;
        if (!docForm.date && !docForm.isNone) return;
        updateDocs({ ...docs, [editingDoc]: docForm });
        setEditingDoc(null);
        setDocForm({ date: '', notes: '', subType: 'L1', isNone: false, files: [] });
    };

    const deleteDocEntry = () => {
        if (!editingDoc) return;
        deleteDocField(editingDoc);
        setEditingDoc(null);
        setDocForm({ date: '', notes: '', subType: 'L1', isNone: false, files: [] });
    };

    const openEditDoc = (key) => {
        const existing = docs[key] || { date: '', notes: '', subType: 'L1', isNone: false, files: [] };
        setDocForm({ date: existing.date || '', notes: existing.notes || '', subType: existing.subType || 'L1', isNone: existing.isNone || false, files: existing.files || [] });
        setEditingDoc(key);
    };

    const handleAddPenalty = (e) => {
        e.preventDefault();
        if (editingPenaltyId) {
            deletePenalty(editingPenaltyId);
            addPenalty({ ...penaltyForm, id: Date.now(), amount: parseFloat(penaltyForm.amount) || 0 });
            setEditingPenaltyId(null);
        } else {
            addPenalty({ ...penaltyForm, id: Date.now(), amount: parseFloat(penaltyForm.amount) || 0 });
        }
        setShowPenaltyForm(false);
        setPenaltyForm({ date: new Date().toISOString().split('T')[0], driver: '', type: 'Hız İhlali', amount: '', plate: '', description: '', paid: false, files: [] });
    };

    const togglePaid = (id) => {
        const p = penalties.find(pen => pen.id === id);
        if (p) togglePenaltyPaid(id, p.paid);
    };

    const handleDeletePenalty = (id) => {
        deletePenalty(id);
    };

    const clearNotifications = () => {
        const newReadDocs = {};
        urgentDocs.forEach(dt => { newReadDocs[dt.key] = docs[dt.key]?.date; });
        setReadDocsNotif(newReadDocs);
        localStorage.setItem('tir_read_docs_notif', JSON.stringify(newReadDocs));

        const newReadIds = [...new Set([...readPenaltiesNotif, ...unpaidPenalties.map(p => p.id)])];
        setReadPenaltiesNotif(newReadIds);
        localStorage.setItem('tir_read_penalties_notif', JSON.stringify(newReadIds));

        window.dispatchEvent(new Event('tir_notif_updated'));
    };

    const handleDeleteCompanyNotif = async (notifId, e) => {
        if (e) e.stopPropagation();
        if (!window.confirm('Bu bildirimi kalıcı olarak silmek istediğinize emin misiniz?')) return;
        setDeletingNotifId(notifId);
        try {
            if (deleteCompanyNotification) {
                await deleteCompanyNotification(notifId);
            }
        } catch (err) {
            alert('Bildirim silinemedi: ' + err.message);
        } finally {
            setDeletingNotifId(null);
        }
    };

    const handleClearAllNotifications = async () => {
        const companyCount = (companyNotifications || []).length;
        const totalCount = companyCount + urgentDocs.length + unpaidPenalties.length;
        if (totalCount === 0) return;

        const confirmText = companyCount > 0 
            ? `Tüm bildirimler ve ${companyCount} adet şirket bildirimi kalıcı olarak silinecek. Emin misiniz?`
            : 'Tüm bildirimleri temizlemek istediğinize emin misiniz?';

        if (!window.confirm(confirmText)) return;

        setIsClearingAll(true);
        try {
            if (clearAllCompanyNotifications && companyCount > 0) {
                await clearAllCompanyNotifications();
            }
            clearNotifications();
        } catch (err) {
            alert('Bildirimler silinirken hata oluştu: ' + err.message);
        } finally {
            setIsClearingAll(false);
        }
    };

    const tabs = [
        { 
            id: 'belgeler', 
            label: 'Belgeler & Tarihler', 
            icon: <FileText size={15} />, 
            badge: unreadDocsCount, 
            theme: 'from-blue-600 to-sky-500 border-blue-400/40 shadow-[0_0_15px_rgba(59,130,246,0.35)] text-white', 
            hoverText: 'group-hover:text-blue-400' 
        },
        { 
            id: 'bildirimler', 
            label: 'Bildirimler', 
            icon: <Bell size={15} />, 
            badge: totalNotifications > 0 && (unreadDocsCount + unreadPenaltiesCount) > 0 ? (unreadDocsCount + unreadPenaltiesCount) : 0, 
            theme: 'from-amber-600 to-orange-500 border-amber-400/40 shadow-[0_0_15px_rgba(245,158,11,0.35)] text-white', 
            hoverText: 'group-hover:text-amber-400' 
        },
        { 
            id: 'cezalar', 
            label: 'Cezalar', 
            icon: <AlertTriangle size={15} />, 
            badge: unreadPenaltiesCount, 
            theme: 'from-red-600 to-rose-500 border-red-400/40 shadow-[0_0_15px_rgba(239,68,68,0.35)] text-white', 
            hoverText: 'group-hover:text-red-400' 
        },
    ];

    return (
        <div className="space-y-5 animate-in fade-in duration-500 relative pb-ios-nav">

            {/* ─── ENTEGRE TEK SATIR HEADER BAR ─── */}
            <div 
                className="flex items-center justify-between gap-3 pb-2 border-b border-white/[0.06]"
                style={{
                    paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))'
                }}
            >
                {/* Sol Grup: Hamburger (Mobil) + Başlık */}
                <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                    {isMobile && onOpenMenu && (
                        <button 
                            onClick={onOpenMenu} 
                            className="p-1.5 -ml-1 text-slate-400 hover:text-slate-100 transition-colors flex items-center justify-center cursor-pointer rounded-lg hover:bg-white/5"
                            title="Menüyü Aç"
                        >
                            <Menu size={22} />
                        </button>
                    )}
                    
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap">
                        Ceza & Belgeler
                    </h2>
                </div>

                {/* Sağ Grup: Cezalar sekmesi seçiliyse Ceza Ekle butonu */}
                <AnimatePresence mode="wait">
                    {activeTab === 'cezalar' && (
                        <motion.button
                            key="header-btn-cezalar"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            onClick={() => {
                                setEditingPenaltyId(null);
                                setPenaltyForm({
                                    date: new Date().toISOString().split('T')[0],
                                    driver: '',
                                    type: 'Hız İhlali',
                                    amount: '',
                                    plate: '',
                                    description: '',
                                    paid: false,
                                    files: []
                                });
                                setShowPenaltyForm(true);
                            }}
                            className="h-[36px] px-3.5 sm:px-4 bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 border border-red-400/40 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-[0_0_15px_rgba(239,68,68,0.35)] flex items-center justify-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                        >
                            <Plus size={15} /> <span>Ceza Ekle</span>
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {/* ─── ZARİF OBSİDYEN TAB BAR (Sıfır Çakışma & Dengeli Grid) ─── */}
            <div className="flex items-center w-full z-20 relative">
                <div className="grid grid-cols-3 gap-1 bg-[#0c1017]/90 backdrop-blur-xl p-1.5 rounded-2xl shadow-xl border border-white/[0.08] w-full">
                    {tabs.map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button 
                                key={tab.id} 
                                onClick={() => handleTabChange(tab.id)}
                                className={`relative flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm transition-all duration-200 justify-center whitespace-nowrap outline-none cursor-pointer group ${
                                    isActive ? 'text-white font-bold' : 'text-slate-400 font-medium hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="detaylar-active-tab"
                                        className={`absolute inset-0 bg-gradient-to-r rounded-xl border ${tab.theme}`}
                                        style={{ zIndex: 0 }}
                                        initial={false}
                                        transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                                    />
                                )}

                                <span className={`relative z-10 transition-colors ${isActive ? 'text-white' : `text-slate-400 ${tab.hoverText}`}`}>
                                    {tab.icon}
                                </span>
                                <span className="hidden sm:inline relative z-10 truncate">{tab.label}</span>
                                <span className="sm:hidden relative z-10 truncate">{tab.label.split(' ')[0]}</span>
                                {tab.badge > 0 && (
                                    <span className="relative z-10 bg-white/20 border border-white/30 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center justify-center flex-shrink-0 ml-0.5">
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ─── TAB İÇERİKLERİ ─── */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                >
                    {/* ─── BELGELER & TARİHLER (Dashboard KPI Kart Tasarımı - 4x2 Tam Simetrik) ─── */}
                    {activeTab === 'belgeler' && (
                        <div className="py-3 sm:py-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                                {DOC_TYPES.map(dt => {
                                    const docData = docs[dt.key];
                                    const days = docData?.date ? daysUntil(docData.date) : null;
                                    const isUrgent = docData?.date && days !== null && days <= 30;
                                    const IconComponent = dt.icon;

                                    return (
                                    <div
                                        key={dt.key}
                                        onClick={() => openEditDoc(dt.key)}
                                        className={`glass-panel p-3 sm:p-3.5 relative cursor-pointer hover:border-white/20 hover:-translate-y-0.5 transition-all duration-200 ease-out flex flex-col justify-between overflow-hidden group rounded-2xl border h-full ${
                                            isUrgent ? 'border-red-500/40 bg-red-950/10' : 'border-white/[0.07]'
                                        }`}
                                    >
                                        {/* Arka Plan Soluk Filigran İkonu */}
                                        <div className="absolute -right-2 -bottom-2 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity text-white pointer-events-none">
                                            <IconComponent size={75} />
                                        </div>

                                        {/* 1. Üst Satır: Başlık & Soluk İkon Kutusu */}
                                        <div className="flex justify-between items-center relative z-10 mb-1">
                                            <p className="text-[var(--text-secondary)] text-[11px] sm:text-xs font-bold tracking-wider uppercase group-hover:text-slate-200 transition-colors flex items-center gap-1.5 min-w-0">
                                                <span className="truncate">{dt.label}</span>
                                                {dt.key === 'l1' && docData?.subType && (
                                                    <span className="text-[10px] font-normal text-slate-300 bg-white/[0.06] border border-white/10 px-1.5 py-0.2 rounded flex-shrink-0">
                                                        {docData.subType}
                                                    </span>
                                                )}
                                            </p>
                                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-400 group-hover:text-slate-200 group-hover:bg-white/[0.07] transition-all flex items-center justify-center flex-shrink-0">
                                                <IconComponent size={14} />
                                            </div>
                                        </div>

                                        {/* 2. Orta Satır: Ana Metrik & Tarih */}
                                        <div className="my-0.5 flex items-baseline justify-between relative z-10">
                                            {docData?.isNone ? (
                                                <h3 className="text-lg sm:text-xl font-extrabold text-red-400 tracking-tight">
                                                    Kasko Yok
                                                </h3>
                                            ) : days !== null ? (
                                                <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-tight drop-shadow-sm flex items-baseline gap-1.5">
                                                    <span>{days < 0 ? Math.abs(days) : days}</span>
                                                    <span className={`text-xs font-bold ${
                                                        days < 0 ? 'text-red-400' :
                                                        days <= 30 ? 'text-red-400' :
                                                        days <= 60 ? 'text-amber-400' :
                                                        'text-emerald-400'
                                                    }`}>
                                                        {days < 0 ? 'Gün Geçti!' : 'Gün Kaldı'}
                                                    </span>
                                                </h3>
                                            ) : (
                                                <h3 className="text-xs sm:text-sm font-bold text-slate-500">
                                                    Tarih Girilmedi
                                                </h3>
                                            )}

                                            <span className="text-[11px] sm:text-xs font-mono text-slate-300 bg-white/[0.03] border border-white/[0.06] px-2.5 py-0.5 rounded-lg flex-shrink-0">
                                                {docData?.date ? new Date(docData.date).toLocaleDateString('tr-TR') : '—'}
                                            </span>
                                        </div>

                                        {/* 3. Alt Satır: Sabit Yükseklikli Not & Ek Belge Alanı (Simetriyi Koruyan Yapı) */}
                                        <div className="pt-1.5 border-t border-white/[0.05] flex items-center justify-between text-xs relative z-10 min-h-[20px] sm:min-h-[22px]">
                                            <span className="text-slate-400 italic text-[11px] truncate max-w-[240px]">
                                                {docData?.notes ? `"${docData.notes}"` : <span className="invisible select-none">—</span>}
                                            </span>

                                            {docData?.files?.length > 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setViewFiles({ title: dt.label, files: docData.files });
                                                    }}
                                                    className="text-slate-300 hover:text-white font-bold flex items-center gap-1 bg-white/[0.05] hover:bg-white/10 border border-white/10 px-2 py-0.5 rounded-lg transition-colors cursor-pointer text-[10px] ml-auto flex-shrink-0"
                                                >
                                                    <Paperclip size={10} /> {docData.files.length} Belge
                                                </button>
                                            ) : (
                                                <span className="invisible select-none text-[10px]">—</span>
                                            )}
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ─── CEZALAR (3'lü KPI + Modern Liste) ─── */}
                    {activeTab === 'cezalar' && (() => {
                        const unpaidCount = unpaidPenalties.length;
                        const unpaidTotal = unpaidPenalties.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
                        const paidPenalties = penalties.filter(p => p.paid);
                        const paidCount = paidPenalties.length;
                        const paidTotal = paidPenalties.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
                        const totalCount = penalties.length;
                        const totalAmount = penalties.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

                        return (
                            <div className="space-y-4">
                                {/* ─── 3'LÜ KPI ÖZET KARTLARI (Dashboard Estetiğinde) ─── */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {/* 1. Kart: Bekleyen / Ödenmemiş Ceza */}
                                    <div className="glass-panel p-4 rounded-2xl border border-white/[0.07] relative overflow-hidden flex flex-col justify-between group">
                                        <div className="flex items-center justify-between relative z-10">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Bekleyen Borç</span>
                                            <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-400 flex items-center justify-center">
                                                <AlertCircle size={14} className={unpaidCount > 0 ? 'text-red-400' : 'text-slate-400'} />
                                            </div>
                                        </div>
                                        <div className="mt-2 relative z-10 flex items-baseline justify-between">
                                            <h3 className={`text-xl sm:text-2xl font-extrabold font-mono tracking-tight ${unpaidCount > 0 ? 'text-red-400' : 'text-slate-100'}`}>
                                                ₺{unpaidTotal.toLocaleString('tr-TR')}
                                            </h3>
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${unpaidCount > 0 ? 'bg-red-500/15 text-red-300 border border-red-500/20' : 'bg-white/[0.04] text-slate-400 border border-white/5'}`}>
                                                {unpaidCount} Adet
                                            </span>
                                        </div>
                                    </div>

                                    {/* 2. Kart: Kapatılan / Ödenen Ceza */}
                                    <div className="glass-panel p-4 rounded-2xl border border-white/[0.07] relative overflow-hidden flex flex-col justify-between group">
                                        <div className="flex items-center justify-between relative z-10">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Kapatılan Ceza</span>
                                            <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-400 flex items-center justify-center">
                                                <CheckCircle size={14} className="text-emerald-400/80" />
                                            </div>
                                        </div>
                                        <div className="mt-2 relative z-10 flex items-baseline justify-between">
                                            <h3 className="text-xl sm:text-2xl font-extrabold font-mono tracking-tight text-white">
                                                ₺{paidTotal.toLocaleString('tr-TR')}
                                            </h3>
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                                {paidCount} Adet Ödendi
                                            </span>
                                        </div>
                                    </div>

                                    {/* 3. Kart: Genel Toplam Ceza Yükü */}
                                    <div className="glass-panel p-4 rounded-2xl border border-white/[0.07] relative overflow-hidden flex flex-col justify-between group">
                                        <div className="flex items-center justify-between relative z-10">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Toplam Ceza Hacmi</span>
                                            <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-400 flex items-center justify-center">
                                                <Banknote size={14} className="text-slate-400" />
                                            </div>
                                        </div>
                                        <div className="mt-2 relative z-10 flex items-baseline justify-between">
                                            <h3 className="text-xl sm:text-2xl font-extrabold font-mono tracking-tight text-white">
                                                ₺{totalAmount.toLocaleString('tr-TR')}
                                            </h3>
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-400 border border-white/5">
                                                {totalCount} Ceza
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* ─── CEZA LİSTESİ ─── */}
                                <div className="space-y-2">
                                    {penalties.length === 0 ? (
                                        <div className="p-10 text-center text-slate-500 rounded-2xl border border-white/5 bg-white/[0.01]">
                                            <CheckCircle2 size={32} className="mx-auto mb-2 opacity-30 text-emerald-400" />
                                            <p className="font-semibold text-sm text-slate-300">Kayıtlı ceza bulunmuyor</p>
                                            <p className="text-xs text-slate-500 mt-0.5">Trafik cezalarını sağ üstteki "+ Ceza Ekle" butonundan ekleyebilirsiniz.</p>
                                        </div>
                                    ) : (
                                        penalties.map(p => (
                                            <div
                                                key={p.id}
                                                className={`p-3.5 sm:p-4 rounded-2xl border transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                                    p.paid 
                                                        ? 'bg-white/[0.015] border-white/[0.05] hover:border-white/10 hover:bg-white/[0.03]' 
                                                        : 'bg-red-950/10 border-red-500/20 hover:border-red-500/30'
                                                }`}
                                            >
                                                {/* Sol Kısım: İkon + Detaylar */}
                                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 border ${
                                                        p.paid 
                                                            ? 'bg-white/[0.03] border-white/[0.06] text-slate-400' 
                                                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                                                    }`}>
                                                        <AlertTriangle size={16} />
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight">{p.type}</h4>
                                                            {p.driver && (
                                                                <span className="text-[11px] font-medium text-slate-300 bg-white/[0.04] border border-white/10 px-2 py-0.2 rounded-md flex items-center gap-1">
                                                                    <User size={10} className="opacity-60" /> {p.driver}
                                                                </span>
                                                            )}
                                                            {p.plate && (
                                                                <span className="text-[10px] font-mono text-slate-400 bg-white/[0.03] px-1.5 py-0.2 rounded border border-white/5">
                                                                    {p.plate}
                                                                </span>
                                                            )}
                                                            <span className="text-[11px] font-mono text-slate-500 ml-auto sm:ml-0">
                                                                {p.date ? new Date(p.date).toLocaleDateString('tr-TR') : '—'}
                                                            </span>
                                                        </div>

                                                        {p.description && (
                                                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                                                {p.description}
                                                            </p>
                                                        )}

                                                        {p.files?.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setViewFiles({ title: `${p.type} - ${p.driver || 'Ceza'}`, files: p.files });
                                                                }}
                                                                className="text-[11px] font-medium text-slate-300 hover:text-white mt-1.5 flex items-center gap-1 cursor-pointer bg-white/[0.04] hover:bg-white/10 px-2 py-0.5 rounded-lg border border-white/10 w-fit transition-colors"
                                                            >
                                                                <Paperclip size={11} /> {p.files.length} Belge / Makbuz
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Sağ Kısım: Tutar + Durum + Aksiyonlar */}
                                                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5 flex-shrink-0">
                                                    <div className="text-left sm:text-right">
                                                        <p className="text-base sm:text-lg font-bold font-mono text-white tracking-tight">
                                                            ₺{(parseFloat(p.amount) || 0).toLocaleString('tr-TR')}
                                                        </p>
                                                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded ${
                                                            p.paid 
                                                                ? 'text-emerald-400 bg-emerald-500/10' 
                                                                : 'text-red-400 bg-red-500/10'
                                                        }`}>
                                                            {p.paid ? 'Ödendi' : 'Ödenmedi'}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => togglePaid(p.id)}
                                                            title={p.paid ? 'Ödenmedi olarak işaretle' : 'Ödendi olarak işaretle'}
                                                            className={`p-1.5 rounded-lg transition-colors cursor-pointer border ${
                                                                p.paid
                                                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                                                                    : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-emerald-400 hover:bg-white/10'
                                                            }`}
                                                        >
                                                            <CheckCircle size={14} />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingPenaltyId(p.id);
                                                                setPenaltyForm({
                                                                    date: p.date || new Date().toISOString().split('T')[0],
                                                                    driver: p.driver || '',
                                                                    type: p.type || 'Hız İhlali',
                                                                    amount: p.amount || '',
                                                                    plate: p.plate || '',
                                                                    description: p.description || '',
                                                                    paid: p.paid || false,
                                                                    files: p.files || []
                                                                });
                                                                setShowPenaltyForm(true);
                                                            }}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer border border-transparent hover:border-white/10"
                                                            title="Düzenle"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeletePenalty(p.id)}
                                                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                                            title="Sil"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ─── BİLDİRİMLER (Sade, Kompakt & Minimalist Obsidian Liste) ─── */}
                    {activeTab === 'bildirimler' && (
                        <div className="space-y-3">
                            {/* Üst Filtre & Aksiyon Barı (Sade & Zarif) */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
                                {/* Sade Filtre Butonları */}
                                <div className="flex items-center gap-1 overflow-x-auto py-0.5 custom-scrollbar">
                                    {[
                                        { id: 'all', label: 'Tümü', count: (companyNotifications || []).length + urgentDocs.length + unpaidPenalties.length },
                                        { id: 'company', label: 'Duyurular', count: (companyNotifications || []).length },
                                        { id: 'docs', label: 'Belgeler', count: urgentDocs.length },
                                        { id: 'penalties', label: 'Cezalar', count: unpaidPenalties.length }
                                    ].map(f => {
                                        const isActive = notifFilter === f.id;
                                        return (
                                            <button
                                                key={f.id}
                                                type="button"
                                                onClick={() => setNotifFilter(f.id)}
                                                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                                                    isActive
                                                        ? 'bg-white/10 text-white border border-white/15'
                                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                                                }`}
                                            >
                                                <span>{f.label}</span>
                                                <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                                                    isActive ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-slate-500'
                                                }`}>
                                                    {f.count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Üst Sağ Aksiyonlar */}
                                <div className="flex items-center gap-1.5">
                                    {((companyNotifications || []).length + urgentDocs.length + unpaidPenalties.length) > 0 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={clearNotifications}
                                                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors cursor-pointer font-medium"
                                                title="Tümünü okundu olarak işaretle"
                                            >
                                                <CheckCheck size={13} className="text-slate-400" />
                                                <span>Okundu Say</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={handleClearAllNotifications}
                                                disabled={isClearingAll}
                                                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer font-medium disabled:opacity-50"
                                                title="Tüm bildirimleri kalıcı olarak sil"
                                            >
                                                {isClearingAll ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                <span>Hepsini Sil</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Kompakt Bildirim Listesi */}
                            <div className="space-y-1.5">
                                {/* 1. Şirket Duyuruları ve Görev Bildirimleri */}
                                {(notifFilter === 'all' || notifFilter === 'company') && (companyNotifications || []).map(notif => {
                                    const currentUid = auth.currentUser?.uid;
                                    const myAck = currentUid && notif.acknowledgements ? notif.acknowledgements[currentUid] : null;
                                    const isRead = currentUid && notif.readBy && notif.readBy.includes(currentUid);
                                    const buttons = notif.buttons && Array.isArray(notif.buttons) ? notif.buttons : [];
                                    const isDeleting = deletingNotifId === notif.id;

                                    return (
                                        <div
                                            key={notif.id}
                                            className={`p-3 sm:p-3.5 rounded-xl border transition-all duration-150 ${
                                                isRead 
                                                    ? 'bg-white/[0.015] border-white/[0.05] hover:border-white/10 hover:bg-white/[0.03]' 
                                                    : 'bg-white/[0.03] border-white/15 hover:border-white/20'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2.5">
                                                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                                    {/* Okunmadı Noktası veya Soluk İkon */}
                                                    <div className="mt-1 flex-shrink-0">
                                                        {!isRead ? (
                                                            <span className="block w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
                                                        ) : (
                                                            <span className="block w-1.5 h-1.5 rounded-full bg-slate-600" />
                                                        )}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-baseline gap-2 flex-wrap">
                                                            <h4 className={`text-xs sm:text-sm font-semibold truncate ${isRead ? 'text-slate-300' : 'text-white'}`}>
                                                                {notif.title}
                                                            </h4>
                                                            <span className="text-[11px] text-slate-500 font-mono">
                                                                {notif.createdAt ? new Date(notif.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                                                            </span>
                                                        </div>

                                                        {notif.body && (
                                                            <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap leading-relaxed">
                                                                {notif.body}
                                                            </p>
                                                        )}

                                                        {/* Kompakt Aksiyon Butonları & Onay Durumu */}
                                                        {(buttons.length > 0 || notif.targetTab || myAck) && (
                                                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                                                {notif.targetTab && buttons.length === 0 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (markNotificationAsRead && notif.id) markNotificationAsRead(notif.id);
                                                                            window.dispatchEvent(new CustomEvent('tir_switch_tab', { detail: notif.targetTab }));
                                                                        }}
                                                                        className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/10 text-[11px] font-medium text-slate-300 border border-white/10 transition-colors flex items-center gap-1 cursor-pointer"
                                                                    >
                                                                        <Navigation size={11} />
                                                                        <span>Sayfayı Aç</span>
                                                                        <ExternalLink size={10} className="opacity-50" />
                                                                    </button>
                                                                )}

                                                                {buttons.map((btn, bIdx) => (
                                                                    <button
                                                                        key={btn.id || bIdx}
                                                                        type="button"
                                                                        disabled={ackLoadingId === notif.id}
                                                                        onClick={async () => {
                                                                            if (btn.actionType === 'navigate' && btn.targetTab) {
                                                                                if (markNotificationAsRead && notif.id) markNotificationAsRead(notif.id);
                                                                                window.dispatchEvent(new CustomEvent('tir_switch_tab', { detail: btn.targetTab }));
                                                                            } else if (btn.actionType === 'ack_approved') {
                                                                                setAckLoadingId(notif.id);
                                                                                try {
                                                                                    await acknowledgeNotification(notif.id, 'approved', btn.label);
                                                                                } catch (e) {
                                                                                    alert('Onay iletilemedi: ' + e.message);
                                                                                } finally {
                                                                                    setAckLoadingId(null);
                                                                                }
                                                                            } else if (btn.actionType === 'ack_rejected') {
                                                                                const note = prompt('Sorun açıklaması:');
                                                                                if (note === null) return;
                                                                                setAckLoadingId(notif.id);
                                                                                try {
                                                                                    await acknowledgeNotification(notif.id, 'rejected', note);
                                                                                } catch (e) {
                                                                                    alert('Sorun bildirimi iletilemedi: ' + e.message);
                                                                                } finally {
                                                                                    setAckLoadingId(null);
                                                                                }
                                                                            }
                                                                        }}
                                                                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer bg-white/[0.04] hover:bg-white/10 text-slate-300 border border-white/10"
                                                                    >
                                                                        <span>{btn.label}</span>
                                                                        {btn.actionType === 'navigate' && <ExternalLink size={10} className="opacity-50" />}
                                                                    </button>
                                                                ))}

                                                                {myAck && (
                                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border flex items-center gap-1 ${
                                                                        myAck.status === 'approved'
                                                                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                                                                    }`}>
                                                                        {myAck.status === 'approved' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                                                                        <span>{myAck.status === 'approved' ? 'Onaylandı' : 'Sorun Bildirildi'}</span>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Sil Butonu */}
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeleteCompanyNotif(notif.id, e)}
                                                    disabled={isDeleting}
                                                    className="p-1 text-slate-500 hover:text-red-400 rounded-md transition-colors cursor-pointer flex-shrink-0"
                                                    title="Bildirimi Sil"
                                                >
                                                    {isDeleting ? <Loader2 size={13} className="animate-spin text-red-400" /> : <Trash2 size={13} />}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* 2. Belge ve Muayene Hatırlatıcıları (Kompakt Satır) */}
                                {(notifFilter === 'all' || notifFilter === 'docs') && urgentDocs.map(dt => {
                                    const days = daysUntil(docs[dt.key]?.date);
                                    const IconComponent = dt.icon;
                                    const isExpired = days < 0;

                                    return (
                                        <div 
                                            key={dt.key} 
                                            onClick={() => openEditDoc(dt.key)}
                                            className="p-2.5 sm:p-3 rounded-xl border border-white/[0.05] hover:border-white/15 bg-white/[0.015] hover:bg-white/[0.03] transition-all flex items-center justify-between gap-3 cursor-pointer group"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-7 h-7 rounded-lg bg-white/[0.04] text-slate-400 group-hover:text-slate-200 flex items-center justify-center flex-shrink-0">
                                                    <IconComponent size={14} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-slate-200 truncate">{dt.label}</p>
                                                    <p className="text-[11px] text-slate-500 font-mono">
                                                        Bitiş: {new Date(docs[dt.key]?.date).toLocaleDateString('tr-TR')}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium font-mono flex-shrink-0 ${
                                                isExpired ? 'text-red-400 bg-red-500/10' : days <= 30 ? 'text-amber-400 bg-amber-500/10' : 'text-slate-300 bg-white/[0.04]'
                                            }`}>
                                                {isExpired ? `${Math.abs(days)} gün geçti` : `${days} gün kaldı`}
                                            </span>
                                        </div>
                                    );
                                })}

                                {/* 3. Ödenmemiş Cezalar (Kompakt Satır) */}
                                {(notifFilter === 'all' || notifFilter === 'penalties') && unpaidPenalties.map(p => (
                                    <div 
                                        key={p.id} 
                                        onClick={() => setActiveTab('cezalar')}
                                        className="p-2.5 sm:p-3 rounded-xl border border-white/[0.05] hover:border-white/15 bg-white/[0.015] hover:bg-white/[0.03] transition-all flex items-center justify-between gap-3 cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-7 h-7 rounded-lg bg-white/[0.04] text-slate-400 group-hover:text-slate-200 flex items-center justify-center flex-shrink-0">
                                                <AlertTriangle size={14} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold text-slate-200 truncate">Ceza: {p.type}</p>
                                                <p className="text-[11px] text-slate-500 font-mono">
                                                    {p.driver && `${p.driver} · `}{new Date(p.date).toLocaleDateString('tr-TR')}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="text-xs font-mono font-bold text-slate-200">
                                                ₺{(parseFloat(p.amount) || 0).toLocaleString('tr-TR')}
                                            </span>
                                        </div>
                                    </div>
                                ))}

                                {/* Eğer hiç kayıt yoksa */}
                                {((notifFilter === 'all' && ((companyNotifications || []).length + urgentDocs.length + unpaidPenalties.length) === 0) ||
                                  (notifFilter === 'company' && (!companyNotifications || companyNotifications.length === 0)) ||
                                  (notifFilter === 'docs' && urgentDocs.length === 0) ||
                                  (notifFilter === 'penalties' && unpaidPenalties.length === 0)) && (
                                    <div className="glass-panel p-12 text-center rounded-2xl border border-white/5 text-slate-500">
                                        <CheckCircle2 size={36} className="mx-auto mb-3 opacity-20 text-emerald-400" />
                                        <p className="text-white font-semibold text-sm">Bu kategoride bildirim bulunmuyor</p>
                                        <p className="text-slate-500 text-xs mt-1">Tüm bildirimleriniz temizlendi ve kontrol altında.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* ─── BELGE DÜZENLEME MODALİ ─── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {editingDoc && (
                        <motion.div key="doc-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
                            <motion.div initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 10 }} transition={{ duration: 0.2, ease: "easeOut" }} className="bg-[#0c1017] border border-blue-500/30 rounded-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
                                <button onClick={() => setEditingDoc(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                                    <X size={20} />
                                </button>
                                <h3 className="text-lg sm:text-xl font-bold text-white mb-5 flex items-center gap-2">
                                    <FileText size={20} className="text-blue-400" />
                                    {DOC_TYPES.find(d => d.key === editingDoc)?.label || 'Belge Düzenle'}
                                </h3>

                                <div className="space-y-4">
                                    {(editingDoc === 'insurance' || editingDoc === 'trailerInsurance') && (
                                        <label className="flex items-center gap-2 text-sm text-white bg-white/[0.02] border border-white/[0.06] p-3 rounded-xl cursor-pointer">
                                            <input type="checkbox" checked={docForm.isNone} onChange={e => setDocForm({ ...docForm, isNone: e.target.checked, date: e.target.checked ? '' : docForm.date })} className="accent-blue-500 w-4 h-4 rounded" />
                                            <span className={docForm.isNone ? 'text-red-400 font-bold' : 'font-medium'}>Kasko Yok</span>
                                        </label>
                                    )}

                                    {!docForm.isNone && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Son Geçerlilik Tarihi</label>
                                            <input type="date" required className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-blue-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all" value={docForm.date}
                                                onChange={e => setDocForm({ ...docForm, date: e.target.value })} />
                                        </div>
                                    )}

                                    {editingDoc === 'l1' && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Belge Türü</label>
                                            <div className="flex gap-4 p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                                                <label className="flex items-center gap-2 text-sm text-white cursor-pointer font-bold">
                                                    <input type="radio" name="subType" value="L1" checked={docForm.subType === 'L1'} onChange={e => setDocForm({ ...docForm, subType: e.target.value })} className="accent-blue-500" />
                                                    L1
                                                </label>
                                                <label className="flex items-center gap-2 text-sm text-white cursor-pointer font-bold">
                                                    <input type="radio" name="subType" value="K1" checked={docForm.subType === 'K1'} onChange={e => setDocForm({ ...docForm, subType: e.target.value })} className="accent-blue-500" />
                                                    K1
                                                </label>
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Not (Opsiyonel)</label>
                                        <input type="text" placeholder="Örn: Yenileme yapıldı, poliçe no: ..." className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-blue-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all placeholder:text-slate-600" value={docForm.notes}
                                            onChange={e => setDocForm({ ...docForm, notes: e.target.value })} />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">📎 Belge / Fotoğraf</label>
                                        <FileUpload files={docForm.files} onChange={f => setDocForm({ ...docForm, files: f })} maxSizeMB={5} />
                                    </div>

                                    <div className="flex gap-3 pt-2">
                                        <button onClick={saveDoc} className="flex-1 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 border border-blue-400/40 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 uppercase tracking-wider text-xs sm:text-sm cursor-pointer">
                                            Kaydet
                                        </button>
                                        <button onClick={deleteDocEntry} className="px-4 py-3.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-xl font-bold transition-all cursor-pointer" title="Belgeyi Sil">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ─── CEZA EKLEME / DÜZENLEME MODALİ ─── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {showPenaltyForm && (
                        <motion.div key="penalty-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
                            <motion.div initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 10 }} transition={{ duration: 0.2, ease: "easeOut" }} className="bg-[#0c1017] border border-red-500/30 rounded-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
                                <button onClick={() => setShowPenaltyForm(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                                    <X size={20} />
                                </button>
                                <h3 className="text-lg sm:text-xl font-bold text-white mb-5 flex items-center gap-2">
                                    <AlertTriangle size={20} className="text-red-400" />
                                    {editingPenaltyId ? 'Cezayı Düzenle' : 'Yeni Ceza Kaydı'}
                                </h3>

                                <form onSubmit={handleAddPenalty} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Tarih</label>
                                            <input type="date" required className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-red-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all" value={penaltyForm.date}
                                                onChange={e => setPenaltyForm({ ...penaltyForm, date: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Şoför / Plaka</label>
                                            <div className="relative">
                                                <select className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-red-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all appearance-none cursor-pointer"
                                                    value={penaltyForm.driver} onChange={e => setPenaltyForm({ ...penaltyForm, driver: e.target.value })}>
                                                    <option value="" className="bg-[#0c1017] text-white">Şoför seç / araç</option>
                                                    {(allDrivers || []).map((d, i) => <option key={i} value={d.name} className="bg-[#0c1017] text-white">{d.name}</option>)}
                                                    <option value="Araç (Plakaya)" className="bg-[#0c1017] text-white">Araç (Plakaya)</option>
                                                </select>
                                                <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Ceza Türü</label>
                                            <div className="relative">
                                                <select className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-red-500/50 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none transition-all appearance-none cursor-pointer"
                                                    value={penaltyForm.type} onChange={e => setPenaltyForm({ ...penaltyForm, type: e.target.value })}>
                                                    {PENALTY_TYPES.map(t => <option key={t} value={t} className="bg-[#0c1017] text-white">{t}</option>)}
                                                </select>
                                                <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Tutar (₺)</label>
                                            <input type="number" step="0.01" required placeholder="0.00" className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-red-500/50 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm outline-none transition-all placeholder:text-slate-600" value={penaltyForm.amount}
                                                onChange={e => setPenaltyForm({ ...penaltyForm, amount: e.target.value })} />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Ceza Detayı / Açıklama</label>
                                        <textarea rows={2} placeholder="Örn: Ankara D-100 üzerinde 130km/h hız ihlali..." className="w-full bg-[#0b0e14]/90 border border-white/10 focus:border-red-500/50 rounded-xl px-3.5 py-2 text-sm text-white outline-none resize-none transition-all placeholder:text-slate-600"
                                            value={penaltyForm.description} onChange={e => setPenaltyForm({ ...penaltyForm, description: e.target.value })} />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">📎 Tutanak / Makbuz Fotoğrafı</label>
                                        <FileUpload files={penaltyForm.files} onChange={f => setPenaltyForm({ ...penaltyForm, files: f })} />
                                    </div>

                                    <button type="submit" className="w-full bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 border border-red-400/40 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/40 uppercase tracking-wider text-xs sm:text-sm cursor-pointer mt-2">
                                        {editingPenaltyId ? 'Cezayı Güncelle' : 'Cezayı Kaydet'}
                                    </button>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ─── DOSYA GÖRÜNTÜLEYİCİ MODAL (LIGHTBOX) ─── */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {viewFiles && (
                        <motion.div key="view-files-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                            <motion.div initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 10 }} transition={{ duration: 0.2, ease: "easeOut" }} className="bg-[#0c1017] border border-white/10 rounded-2xl w-full max-w-2xl p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                                <div className="flex justify-between items-center mb-5">
                                    <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                                        <FileText size={20} className="text-blue-400" />
                                        {viewFiles.title} İçin Ekler
                                    </h3>
                                    <button onClick={() => setViewFiles(null)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="space-y-3.5">
                                    {viewFiles.files.map((file, idx) => (
                                        <div key={idx} className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
                                            {file.type && file.type.startsWith('image/') ? (
                                                <div className="bg-black/40 w-full flex justify-center p-4">
                                                    <img src={file.data} alt="Belge/Makbuz" className="max-w-full max-h-[400px] object-contain rounded-lg" />
                                                </div>
                                            ) : (
                                                <div className="p-8 flex flex-col items-center justify-center bg-white/[0.02]">
                                                    <FileText size={48} className="text-slate-500 mb-3" />
                                                    <p className="text-white font-medium">{file.name || 'Belge dosyası'}</p>
                                                </div>
                                            )}

                                            <div className="p-3.5 bg-white/[0.02] border-t border-white/[0.06] flex justify-between items-center">
                                                <span className="text-xs text-slate-400 font-medium truncate max-w-[70%]">{file.name || 'Ek_Belge'}</span>
                                                <a href={file.data} download={file.name || 'Belge'}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors cursor-pointer">
                                                    <Download size={13} /> İndir
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Fotoğraf Büyütme Modal Lightbox */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
                    onClick={() => setSelectedImage(null)}
                >
                    <div className="relative max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/20">
                        <img src={selectedImage} alt="Büyük Görsel" className="max-w-full max-h-[85vh] object-contain rounded-2xl" />
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/90 text-white rounded-full transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Detaylar;
