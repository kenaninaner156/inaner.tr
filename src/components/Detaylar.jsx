import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, FileText, Shield, Car, Calendar, Plus, Trash2,
    Bell, CheckCircle, Clock, X, ChevronDown, Paperclip, User,
    AlertCircle, BookOpen, Banknote, Pencil
} from 'lucide-react';
import { DataContext } from '../context/DataContext';
import FileUpload from './FileUpload';

// ── Sabitler ──────────────────────────────────────────────────────────────────

const PENALTY_TYPES = [
    'Hız İhlali', 'Belge Eksikliği', 'Kırmızı Işık', 'Park Cezası',
    'Akaryakıt İhlali', 'ÖTV İhlali', 'Emniyet Kemeri', 'Diğer'
];

const DOC_TYPES = [
    { key: 'inspection', label: 'Çekici Muayenesi', icon: '🔍', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', warningDays: 45 },
    { key: 'trailerInspection', label: 'Dorse Muayenesi', icon: '🔍', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20', warningDays: 45 },
    { key: 'insurance', label: 'Çekici Kasko', icon: '🛡️', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', warningDays: 30 },
    { key: 'trailerInsurance', label: 'Dorse Kasko', icon: '🛡️', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20', warningDays: 30 },
    { key: 'odp', label: 'Sigorta', icon: '📄', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', warningDays: 30 },
    { key: 'l1', label: 'Yetki Belgesi', icon: '📋', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', warningDays: 60 },
    { key: 'bandrol', label: 'Bandrol (MTV)', icon: '🏷️', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', warningDays: 30 },
    { key: 'srcBelgesi', label: 'SRC Belgesi (Şoför)', icon: '👤', color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/20', warningDays: 60 },
];

// ── Yardımcı Fonksiyonlar ─────────────────────────────────────────────────────

const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    const diff = new Date(dateStr) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const statusBadge = (days) => {
    if (days === null) return { label: 'Tarih Yok', color: 'text-slate-500', bg: 'bg-slate-500/10 border-slate-500/20' };
    if (days < 0) return { label: `${Math.abs(days)} gün geçti!`, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' };
    if (days <= 30) return { label: `${days} gün kaldı`, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' };
    if (days <= 60) return { label: `${days} gün kaldı`, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
    return { label: `${days} gün kaldı`, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
};

// ── Local Storage Yardımcıları ─────────────────────────────────────────────────

const load = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; } };

// ═══════════════════════════════════════════════════════════════════════════════

const Detaylar = () => {
    const {
        docs, updateDocs, deleteDocField,
        penalties, addPenalty, deletePenalty, togglePenaltyPaid,
        allDrivers
    } = React.useContext(DataContext);

    const [activeTab, setActiveTab] = useState('belgeler');

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
            // Update existing penalty via deletePenalty + addPenalty (since no updatePenalty exists yet)
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

    const tabs = [
        { id: 'belgeler', label: 'Belgeler & Tarihler', icon: <FileText size={15} />, badge: unreadDocsCount, theme: 'from-blue-500/80 to-blue-600/80 shadow-[0_2px_12px_rgba(59,130,246,0.3)] border-blue-400/30', hoverText: 'group-hover:text-blue-400' },
        { id: 'cezalar', label: 'Cezalar', icon: <AlertTriangle size={15} />, badge: unreadPenaltiesCount, theme: 'from-red-500/80 to-red-600/80 shadow-[0_2px_12px_rgba(239,68,68,0.3)] border-red-400/30', hoverText: 'group-hover:text-red-400' },
        { id: 'bildirimler', label: 'Bildirimler', icon: <Bell size={15} />, badge: totalNotifications > 0 && (unreadDocsCount + unreadPenaltiesCount) > 0 ? (unreadDocsCount + unreadPenaltiesCount) : 0, theme: 'from-amber-500/80 to-amber-600/80 shadow-[0_2px_12px_rgba(245,158,11,0.3)] border-amber-400/30', hoverText: 'group-hover:text-amber-400' },
    ];

    return (
        <div className="space-y-5 animate-in fade-in duration-500 pb-ios-nav">

            {/* Özet Kartları */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="glass-panel p-3 flex items-center gap-3">
                    <div className="bg-red-500/20 p-2 rounded-lg"><AlertTriangle size={16} className="text-red-400" /></div>
                    <div>
                        <p className="text-xs text-[var(--text-secondary)]">Yaklaşan / Geçen</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">{urgentDocs.length}</p>
                    </div>
                </div>
                <div className="glass-panel p-3 flex items-center gap-3">
                    <div className="bg-amber-500/20 p-2 rounded-lg"><Banknote size={16} className="text-amber-400" /></div>
                    <div>
                        <p className="text-xs text-[var(--text-secondary)]">Ödenmemiş Ceza</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">{unpaidPenalties.length}</p>
                    </div>
                </div>
                <div className="glass-panel p-3 flex items-center gap-3">
                    <div className="bg-amber-500/20 p-2 rounded-lg"><Banknote size={16} className="text-amber-400" /></div>
                    <div>
                        <p className="text-xs text-[var(--text-secondary)]">Toplam Ceza Tutarı</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">₺{unpaidPenalties.reduce((s, p) => s + p.amount, 0).toLocaleString('tr-TR')}</p>
                    </div>
                </div>
                <div className="glass-panel p-3 flex items-center gap-3">
                    <div className="bg-emerald-500/20 p-2 rounded-lg"><CheckCircle size={16} className="text-emerald-400" /></div>
                    <div>
                        <p className="text-xs text-[var(--text-secondary)]">Ödenen Ceza</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">{penalties.filter(p => p.paid).length}</p>
                    </div>
                </div>
            </div>

            {/* Tab Bar */}
            <div className="flex bg-[#111113]/80 backdrop-blur-xl p-1.5 rounded-2xl shadow-inner ring-1 ring-black/20 w-full border border-white/5 items-center">
                {tabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all duration-300 flex-1 justify-center whitespace-nowrap outline-none group ${
                                isActive ? 'text-white font-medium' : 'text-slate-400 font-medium hover:text-slate-200'
                            }`}>

                            {/* Hover arka plan */}
                            {!isActive && (
                                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 rounded-xl transition-colors duration-300 -z-10" />
                            )}

                            {/* Aktif pill */}
                            {isActive && (
                                <motion.div
                                    layoutId="detaylar-active-tab"
                                    className={`absolute inset-0 bg-gradient-to-b rounded-xl border ${tab.theme}`}
                                    style={{ zIndex: 0 }}
                                    initial={false}
                                    transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}
                                />
                            )}

                            <span className={`relative z-10 transition-colors duration-300 ${isActive ? 'text-white/90 drop-shadow-md' : `text-slate-500 ${tab.hoverText}`}`}>
                                {tab.icon}
                            </span>
                            <span className="hidden sm:inline relative z-10 drop-shadow-md">{tab.label}</span>
                            <span className="sm:hidden relative z-10 drop-shadow-md">{tab.label.split(' ')[0]}</span>
                            {tab.badge > 0 && (
                                <span className="relative z-10 bg-white/20 border border-white/30 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center justify-center flex-shrink-0 drop-shadow-md">{tab.badge}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ─── TAB İÇERİKLERİ ─── */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
              >
            {activeTab === 'belgeler' && (
                <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {DOC_TYPES.map(dt => {
                            const docData = docs[dt.key];
                            const days = docData?.date ? daysUntil(docData.date) : null;
                            const status = statusBadge(days);
                            return (
                                <div key={dt.key} className={`glass-panel p-4 border ${docData?.date && days !== null && days <= 30 ? 'border-red-500/30' : 'border-[var(--border-color)]'}`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">{dt.icon}</span>
                                            <div>
                                                <p className="text-[var(--text-primary)] font-medium text-sm">
                                                    {dt.label} {dt.key === 'l1' && docData?.subType ? `(${docData.subType})` : ''}
                                                </p>
                                                {docData?.isNone ? (
                                                    <p className="text-xs text-red-400 font-medium tracking-wide">Kasko Yok</p>
                                                ) : docData?.date ? (
                                                    <p className="text-xs text-[var(--text-secondary)]">{new Date(docData.date).toLocaleDateString('tr-TR')}</p>
                                                ) : (
                                                    <p className="text-xs text-slate-600">Tarih girilmedi</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {docData?.isNone ? (
                                                <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-red-500/10 border-red-500/20 text-red-400">
                                                    Kasko Yok
                                                </span>
                                            ) : docData?.date && (
                                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${status.bg} ${status.color}`}>
                                                    {status.label}
                                                </span>
                                            )}
                                            <button onClick={() => openEditDoc(dt.key)}
                                                className="text-slate-500 hover:text-red-400 p-1 rounded transition text-xs border border-[var(--border-color)] hover:border-red-500/30 px-2">
                                                Düzenle
                                            </button>
                                        </div>
                                    </div>
                                    {docData?.notes && (
                                        <p className="text-xs text-slate-500 mt-2 border-t border-[var(--border-color)] pt-2">{docData.notes}</p>
                                    )}
                                    {docData?.files?.length > 0 && (
                                        <p className="text-xs text-red-400 mt-1">📎 {docData.files.length} belge eklendi</p>
                                    )}

                                    {/* Edit Modal (inline) */}
                                    {editingDoc === dt.key && (
                                        <div className="mt-3 border-t border-[var(--border-color)] pt-3 space-y-3">
                                            {(dt.key === 'insurance' || dt.key === 'trailerInsurance') && (
                                                <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] bg-[var(--bg-panel-hover)] border border-[var(--border-color)] p-2 rounded-lg cursor-pointer">
                                                    <input type="checkbox" checked={docForm.isNone} onChange={e => setDocForm({ ...docForm, isNone: e.target.checked, date: e.target.checked ? '' : docForm.date })} className="accent-red-500 w-4 h-4 rounded border-[var(--border-color)] bg-[var(--bg-base)]" />
                                                    <span className={docForm.isNone ? 'text-red-400 font-medium' : ''}>Kasko Yok</span>
                                                </label>
                                            )}
                                            {!docForm.isNone && (
                                                <div>
                                                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Son Geçerlilik Tarihi</label>
                                                    <input type="date" className="w-full glass-input px-3 py-2 text-sm" value={docForm.date}
                                                        onChange={e => setDocForm({ ...docForm, date: e.target.value })} />
                                                </div>
                                            )}
                                            {dt.key === 'l1' && (
                                                <div>
                                                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Belge Türü</label>
                                                    <div className="flex gap-4">
                                                        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                                                            <input type="radio" name="subType" value="L1" checked={docForm.subType === 'L1'} onChange={e => setDocForm({ ...docForm, subType: e.target.value })} className="accent-red-500" />
                                                            L1
                                                        </label>
                                                        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                                                            <input type="radio" name="subType" value="K1" checked={docForm.subType === 'K1'} onChange={e => setDocForm({ ...docForm, subType: e.target.value })} className="accent-red-500" />
                                                            K1
                                                        </label>
                                                    </div>
                                                </div>
                                            )}
                                            <div>
                                                <label className="block text-xs text-[var(--text-secondary)] mb-1">Not (opsiyonel)</label>
                                                <input type="text" placeholder="Örn: Yenileme yapıldı, poliçe no: ..." className="w-full glass-input px-3 py-2 text-sm" value={docForm.notes}
                                                    onChange={e => setDocForm({ ...docForm, notes: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-[var(--text-secondary)] mb-1">📎 Belge / Fotoğraf</label>
                                                <FileUpload files={docForm.files} onChange={f => setDocForm({ ...docForm, files: f })} maxSizeMB={5} />
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={saveDoc} className="flex-1 bg-red-600 hover:bg-red-500 text-[var(--text-primary)] py-2 rounded-lg text-sm font-medium transition">Kaydet</button>
                                                <button onClick={deleteDocEntry} className="px-3 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg text-sm font-medium transition border border-transparent hover:border-red-500/30" title="Belgeyi Sil">
                                                    <Trash2 size={16} />
                                                </button>
                                                <button onClick={() => setEditingDoc(null)} className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition bg-white/5 rounded-lg border border-[var(--border-color)]">İptal</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ─── CEZALAR ─── */}
            {activeTab === 'cezalar' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center gap-4 flex-wrap">
                        <div className="space-y-0.5">
                            <p className="text-[var(--text-primary)] text-sm font-medium">Trafik & Vergi Cezaları</p>
                            <p className="text-slate-500 text-xs">Şoföre veya araca kesilen cezaları kayıt altına alın</p>
                        </div>
                        <button onClick={() => setShowPenaltyForm(!showPenaltyForm)}
                            className="bg-red-600 hover:bg-red-500 text-[var(--text-primary)] px-4 py-2 rounded-lg flex items-center gap-2 font-medium text-sm transition">
                            <Plus size={16} /> Ceza Ekle
                        </button>
                    </div>

                    {/* Ceza Ekleme Formu */}
                    {showPenaltyForm && (
                        <div className="glass-panel p-5 border border-red-500/20">
                            <h4 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-red-400" /> Yeni Ceza Kaydı</h4>
                            <form onSubmit={handleAddPenalty} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-[var(--text-secondary)] mb-1">Tarih</label>
                                        <input type="date" required className="w-full glass-input px-3 py-2 text-sm" value={penaltyForm.date}
                                            onChange={e => setPenaltyForm({ ...penaltyForm, date: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-[var(--text-secondary)] mb-1">Şoför</label>
                                        <div className="relative">
                                            <select className="w-full glass-input px-3 py-2 text-sm bg-[var(--bg-panel-hover)] appearance-none"
                                                value={penaltyForm.driver} onChange={e => setPenaltyForm({ ...penaltyForm, driver: e.target.value })}>
                                                <option value="">Şoför seç / araç</option>
                                                {(allDrivers || []).map((d, i) => <option key={i} value={d.name}>{d.name}</option>)}
                                                <option value="Araç (Plakaya)">Araç (Plakaya)</option>
                                            </select>
                                            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-[var(--text-secondary)] mb-1">Ceza Türü</label>
                                        <div className="relative">
                                            <select className="w-full glass-input px-3 py-2 text-sm bg-[var(--bg-panel-hover)] appearance-none"
                                                value={penaltyForm.type} onChange={e => setPenaltyForm({ ...penaltyForm, type: e.target.value })}>
                                                {PENALTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-[var(--text-secondary)] mb-1">Tutar (₺)</label>
                                        <input type="number" step="0.01" placeholder="0.00" className="w-full glass-input px-3 py-2 text-sm" value={penaltyForm.amount}
                                            onChange={e => setPenaltyForm({ ...penaltyForm, amount: e.target.value })} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Ceza Detayı</label>
                                    <textarea rows={2} placeholder="Örn: Ankara D-100 üzerinde 130km/h hız ihlali, ehliyet puanı kesildi" className="w-full glass-input px-3 py-2 text-sm resize-none"
                                        value={penaltyForm.description} onChange={e => setPenaltyForm({ ...penaltyForm, description: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs text-[var(--text-secondary)] mb-1">📎 Tutanak / Makbuz Fotoğrafı</label>
                                    <FileUpload files={penaltyForm.files} onChange={f => setPenaltyForm({ ...penaltyForm, files: f })} />
                                </div>
                                <div className="flex gap-3">
                                    <button type="submit" className="flex-1 bg-red-600 hover:bg-red-500 text-[var(--text-primary)] py-2.5 rounded-lg font-medium text-sm transition">Cezayı Kaydet</button>
                                    <button type="button" onClick={() => setShowPenaltyForm(false)} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition">İptal</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Ceza Listesi */}
                    <div className="glass-panel overflow-hidden">
                        {penalties.length === 0 ? (
                            <div className="p-8 text-center">
                                <CheckCircle size={28} className="mx-auto mb-3 text-slate-600" />
                                <p className="text-[var(--text-secondary)] font-medium text-sm">Kayıtlı ceza yok</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {penalties.map(p => (
                                    <div key={p.id} className={`p-4 hover:bg-white/5 transition-colors ${p.paid ? 'opacity-60' : ''}`}>
                                        <div className="flex items-start gap-3">
                                            <div className={`p-2 rounded-lg flex-shrink-0 ${p.paid ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                                                <AlertTriangle size={16} className={p.paid ? 'text-emerald-400' : 'text-red-400'} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[var(--text-primary)] font-semibold text-sm">{p.type}</span>
                                                    {p.driver && <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1"><User size={10} /> {p.driver}</span>}
                                                    <span className="text-xs text-slate-500">{new Date(p.date).toLocaleDateString('tr-TR')}</span>
                                                </div>
                                                {p.description && <p className="text-[var(--text-secondary)] text-xs mt-0.5">{p.description}</p>}
                                                {p.files?.length > 0 && <p className="text-red-400 text-xs mt-0.5">📎 {p.files.length} belge</p>}
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className={`font-bold text-sm ${p.paid ? 'text-emerald-400 line-through' : 'text-red-400'}`}>
                                                    ₺{p.amount.toLocaleString('tr-TR')}
                                                </span>
                                                <button onClick={() => togglePaid(p.id)}
                                                    title={p.paid ? 'Ödenmedi olarak işaretle' : 'Ödendi olarak işaretle'}
                                                    className={`p-1.5 rounded-lg transition-all ${p.paid ? 'bg-slate-500/20 text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-400' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}>
                                                    <CheckCircle size={14} />
                                                </button>
                                                <button onClick={() => {
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
                                                    className="p-1.5 rounded-lg text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 transition-all">
                                                    <Pencil size={14} />
                                                </button>
                                                <button onClick={() => handleDeletePenalty(p.id)}
                                                    className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ─── BİLDİRİMLER ─── */}
            {activeTab === 'bildirimler' && (
                <div className="space-y-4">
                    {totalNotifications > 0 && (
                        <div className="flex justify-end">
                            <button onClick={clearNotifications}
                                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all border border-[var(--border-color)]">
                                <X size={12} /> Bildirimleri Okundu İşaretle
                            </button>
                        </div>
                    )}
                    {totalNotifications === 0 ? (
                        <div className="glass-panel p-10 text-center">
                            <CheckCircle size={36} className="mx-auto mb-3 text-emerald-500/50" />
                            <p className="text-[var(--text-primary)] font-semibold">Her şey yolunda!</p>
                            <p className="text-slate-500 text-sm mt-1">Yaklaşan belge yenileme veya ödenmemiş ceza yok.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {urgentDocs.map(dt => {
                                const days = daysUntil(docs[dt.key]?.date);
                                const status = statusBadge(days);
                                return (
                                    <div key={dt.key} className={`glass-panel p-4 flex items-center gap-3 border ${status.bg}`}>
                                        <span className="text-2xl">{dt.icon}</span>
                                        <div className="flex-1">
                                            <p className="text-[var(--text-primary)] font-medium text-sm">{dt.label}</p>
                                            <p className="text-xs text-[var(--text-secondary)]">{new Date(docs[dt.key]?.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                        </div>
                                        <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold flex-shrink-0 ${status.bg} ${status.color}`}>
                                            {status.label}
                                        </span>
                                    </div>
                                );
                            })}
                            {unpaidPenalties.map(p => (
                                <div key={p.id} className="glass-panel p-4 flex items-center gap-3 border border-red-500/20">
                                    <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-[var(--text-primary)] font-medium text-sm">Ödenmemiş Ceza: {p.type}</p>
                                        <p className="text-xs text-[var(--text-secondary)]">{p.driver && `${p.driver} · `}{new Date(p.date).toLocaleDateString('tr-TR')}</p>
                                    </div>
                                    <span className="text-red-400 font-bold text-sm flex-shrink-0">₺{p.amount.toLocaleString('tr-TR')}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
              </motion.div>
            </AnimatePresence>

        </div>
    );
};

export default Detaylar;
