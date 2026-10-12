import React, { useContext, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DataContext } from '../context/DataContext';
import { sendDiscordAlert } from '../services/discordWebhook';
import { 
    Shield, Trash2, CheckCircle2, AlertTriangle, Users, X, RotateCcw, 
    Search, Calendar, MapPin, MonitorSmartphone, Download, ChevronDown, 
    ChevronUp, Activity, Wallet, Globe, Undo2, Eye, Cpu, Clock, Filter,
    Check, ArrowRight
} from 'lucide-react';

const ACTION_CONFIG = {
    // Finans & Yakıt
    MAZOT_ISKONTO_GUNCELLEME: { label: 'Mazot İskontosu Güncellendi', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
    MAZOT_EKLE: { label: 'Mazot Fişi Eklendi', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
    MAZOT_DUZENLE: { label: 'Mazot Fişi Güncellendi', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
    MAZOT_SİL: { label: 'Mazot Fişi Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    ODEME_EKLE: { label: 'Ödeme Eklendi', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    ODEME_GUNCELLE: { label: 'Ödeme Güncellendi', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    ODEME_SIL: { label: 'Ödeme Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    FATURA_OLUSTUR: { label: 'Fatura Oluşturuldu', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    FATURA_GUNCELLE: { label: 'Fatura Güncellendi', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    FATURA_SIL: { label: 'Fatura Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    CEZA_EKLE: { label: 'Trafik Cezası Eklendi', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    CEZA_SİL: { label: 'Ceza Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    CEZA_DURUM: { label: 'Ceza Durumu Değişti', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    KREDI_SIL: { label: 'Banka Kredisi Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    BORC_SIL: { label: 'Vadesiz Borç Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },

    // Sefer & Operasyon
    SEFER_EKLE: { label: 'Sefer Eklendi', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    SEFER_DUZENLE: { label: 'Sefer Güncellendi', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20' },
    SEFER_SİL: { label: 'Sefer Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    ROTA_EKLE: { label: 'Rota Tanımlandı', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    ROTA_GUNCELLE: { label: 'Rota Güncellendi', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    ROTA_SIL: { label: 'Rota Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    ROTA_KAYDET: { label: 'Canlı Takip Rotası Kaydedildi', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    KAYITLI_ROTA_GUNCELLE: { label: 'Kayıtlı Rota Güncellendi', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    KAYITLI_ROTA_SIL: { label: 'Kayıtlı Rota Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },

    // Bakım & Atölye
    BAKIM_EKLE: { label: 'Bakım Kaydı Eklendi', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    BAKIM_GUNCELLE: { label: 'Bakım Güncellendi', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    BAKIM_SİL: { label: 'Bakım Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    TAMIRCI_EKLE: { label: 'Tamirci Eklendi', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
    TAMIRCI_GUNCELLE: { label: 'Tamirci Güncellendi', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
    TAMIRCI_SIL: { label: 'Tamirci Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    STOK_EKLE: { label: 'Yedek Parça Eklendi', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    STOK_GUNCELLE: { label: 'Stok Güncellendi', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    STOK_SIL: { label: 'Stok Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    KLASOR_EKLE: { label: 'Evrak Klasörü Oluşturuldu', color: 'text-slate-300', bg: 'bg-slate-500/10 border-slate-500/20' },
    KLASOR_SİL: { label: 'Evrak Klasörü Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },

    // Personel & Prim
    PERSONEL_EKLE: { label: 'Personel Eklendi', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20' },
    PERSONEL_GUNCELLE: { label: 'Personel Güncellendi', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20' },
    PERSONEL_SIL: { label: 'Personel Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    ODEME_PIRIM_ONAY: { label: 'Prim Onaylandı', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    ODEME_PIRIM_GUNCELLE: { label: 'Prim Güncellendi', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    ODEME_PIRIM_SIL: { label: 'Prim Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },

    // Güvenlik & Ziyaretçi
    KULLANICI_GIRIS: { label: 'Oturum Açıldı', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
    KULLANICI_CIKIS: { label: 'Çıkış Yapıldı', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
    HATALI_GIRIS: { label: 'Hatalı Giriş', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    ZIYARETCI_GIRIS: { label: 'Ziyaretçi Girişi', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
    KULLANICI_ONAYLA: { label: 'Kullanıcı Onaylandı', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    KULLANICI_RED: { label: 'Kullanıcı Reddedildi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    KULLANICI_EKLE: { label: 'Kullanıcı Eklendi', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    KULLANICI_DUZENLE: { label: 'Kullanıcı Düzenlendi', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    KULLANICI_SIL: { label: 'Kullanıcı Silindi', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },

    // Geri Alma
    GERI_YUKLE: { label: 'Veri Geri Yüklendi', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    GERI_ALINDI: { label: 'Düzenleme Geri Döndürüldü', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
    LOG_TEMIZLE: { label: 'Loglar Temizlendi', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' }
};

const CATEGORIES = [
    { key: 'TUMU', label: 'Tüm Kayıtlar' },
    { key: 'FINANS', label: 'Finans & Yakıt' },
    { key: 'OPERASYON', label: 'Sefer & Rota' },
    { key: 'BAKIM', label: 'Bakım & Stok' },
    { key: 'PERSONEL', label: 'Personel & Prim' },
    { key: 'BORC', label: 'Borç & Kasa' },
    { key: 'GUVENLIK', label: 'Güvenlik & Giriş' },
    { key: 'GERI_ALINABILIR', label: 'Kurtarılabilir İşlemler' }
];

const AdminLog = () => {
    const { adminLog, onlineUsers, restoreData, rollbackEdit, clearLog } = useContext(DataContext);

    const [filter, setFilter] = useState('TUMU');
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [userFilter, setUserFilter] = useState('ALL');

    // Açılır satır (Accordion)
    const [expandedId, setExpandedId] = useState(null);
    const [restoringIds, setRestoringIds] = useState({});

    // Güvenli Temizleme Modalı
    const [isClearModalOpen, setIsClearModalOpen] = useState(false);
    const [clearPassword, setClearPassword] = useState('');
    const [clearError, setClearError] = useState(false);

    // Canlı Radar Modalı (Online Kullanıcı / Misafir İnceleme)
    const [selectedRadarUser, setSelectedRadarUser] = useState(null);

    // Benzersiz kullanıcı listesi
    const uniqueUsers = useMemo(() => {
        const set = new Set();
        adminLog.forEach(l => { if (l.user) set.add(l.user); });
        return Array.from(set).sort();
    }, [adminLog]);

    // Geri Alınabilirlik Durumu Kontrolü
    const canRestore = (entry) => {
        const action = entry.action || '';
        return (action.includes('SİL') || action.includes('SIL')) && entry.meta?.table && entry.meta?.id;
    };

    const canRollback = (entry) => {
        return !!(entry.meta?.before && entry.meta?.table && entry.meta?.id);
    };

    // Filtreleme Mantığı
    const filteredLog = useMemo(() => {
        return adminLog.filter(entry => {
            const action = entry.action || '';

            if (filter === 'FINANS') {
                if (!action.includes('MAZOT') && !action.includes('ODEME') && !action.includes('FATURA') && !action.includes('CEZA') && !action.includes('ISKONTO')) return false;
            } else if (filter === 'OPERASYON') {
                if (!action.includes('SEFER') && !action.includes('ROTA')) return false;
            } else if (filter === 'BAKIM') {
                if (!action.includes('BAKIM') && !action.includes('TAMIRCI') && !action.includes('STOK') && !action.includes('KLASOR')) return false;
            } else if (filter === 'PERSONEL') {
                if (!action.includes('PERSONEL') && !action.includes('PIRIM')) return false;
            } else if (filter === 'BORC') {
                if (!action.includes('KREDI') && !action.includes('BORC')) return false;
            } else if (filter === 'GUVENLIK') {
                if (!action.includes('GIRIS') && !action.includes('CIKIS') && !action.includes('HATALI') && !action.includes('ZIYARETCI') && !action.includes('KULLANICI')) return false;
            } else if (filter === 'GERI_ALINABILIR') {
                if (!canRestore(entry) && !canRollback(entry)) return false;
            }

            if (userFilter !== 'ALL' && entry.user !== userFilter) {
                return false;
            }

            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const metaString = entry.meta ? JSON.stringify(entry.meta).toLowerCase() : '';
                const fullText = `${entry.user || ''} ${entry.detail || ''} ${entry.action || ''} ${metaString}`.toLowerCase();
                if (!fullText.includes(term)) return false;
            }

            if (dateFilter) {
                try {
                    const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
                    if (entryDate !== dateFilter) return false;
                } catch {
                    return false;
                }
            }

            return true;
        });
    }, [adminLog, filter, userFilter, searchTerm, dateFilter]);

    // Geri Yükleme Eylemi
    const handleRestoreItem = async (e, entry) => {
        e.stopPropagation();
        if (!entry.meta?.table || !entry.meta?.id) return;
        setRestoringIds(prev => ({ ...prev, [entry.id]: true }));
        try {
            await restoreData(entry.meta.table, entry.meta.id, entry.meta.record);
        } finally {
            setRestoringIds(prev => ({ ...prev, [entry.id]: false }));
        }
    };

    // Düzenlemeyi Eski Haline Döndürme Eylemi
    const handleRollbackItem = async (e, entry) => {
        e.stopPropagation();
        if (!entry.meta?.table || !entry.meta?.id || !entry.meta?.before) return;
        setRestoringIds(prev => ({ ...prev, [entry.id]: true }));
        try {
            if (rollbackEdit) {
                await rollbackEdit(entry.meta.table, entry.meta.id, entry.meta.before);
            }
        } finally {
            setRestoringIds(prev => ({ ...prev, [entry.id]: false }));
        }
    };

    // Excel Uyumlu CSV Dışa Aktarma
    const handleExportCSV = () => {
        if (filteredLog.length === 0) return;

        const headers = ['Zaman', 'Eylem Kodu', 'Eylem Tanimi', 'Kullanici', 'Detay', 'Koleksiyon', 'Kayit ID', 'Kurtarilabilir'];
        const csvRows = [headers.join(';')];

        filteredLog.forEach(row => {
            const dateStr = new Date(row.timestamp).toLocaleString('tr-TR');
            const metaDef = ACTION_CONFIG[row.action] || { label: row.action };
            const isReversible = (canRestore(row) || canRollback(row)) ? 'Evet' : 'Hayir';

            const values = [
                `"${dateStr}"`,
                `"${row.action || ''}"`,
                `"${metaDef.label || ''}"`,
                `"${row.user || ''}"`,
                `"${(row.detail || '').replace(/"/g, '""')}"`,
                `"${row.meta?.table || ''}"`,
                `"${row.meta?.id || ''}"`,
                `"${isReversible}"`
            ];
            csvRows.push(values.join(';'));
        });

        const csvContent = '\uFEFF' + csvRows.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `denetim_loglari_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSecureClear = async (e) => {
        e.preventDefault();
        if (clearPassword === 'Newrules1.') {
            await clearLog();
            sendDiscordAlert({
                type: 'danger',
                title: 'Denetim Logları Temizlendi',
                description: 'Yönetici tarafından log geçmişi silindi.'
            });
            setIsClearModalOpen(false);
            setClearPassword('');
            setClearError(false);
        } else {
            setClearError(true);
            setTimeout(() => setClearError(false), 2000);
        }
    };

    // Değişiklik farklarını insan diline çeviren yardımcı
    const renderHumanDiff = (before, after) => {
        if (!before || !after) return null;
        const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="bg-[#0c1017] border border-rose-500/20 rounded-xl p-3">
                    <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block mb-2">
                        Önceki Durum
                    </span>
                    <div className="space-y-1">
                        {keys.map(k => {
                            const val = before[k];
                            if (val === undefined || typeof val === 'object') return null;
                            return (
                                <div key={k} className="flex justify-between items-center py-0.5 border-b border-white/[0.04]">
                                    <span className="text-slate-400 capitalize">{k}:</span>
                                    <span className="font-semibold text-slate-200">{String(val)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-[#0c1017] border border-emerald-500/20 rounded-xl p-3">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block mb-2">
                        Güncellenen Durum
                    </span>
                    <div className="space-y-1">
                        {keys.map(k => {
                            const val = after[k];
                            if (val === undefined || typeof val === 'object') return null;
                            return (
                                <div key={k} className="flex justify-between items-center py-0.5 border-b border-white/[0.04]">
                                    <span className="text-slate-400 capitalize">{k}:</span>
                                    <span className="font-semibold text-emerald-400">{String(val)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-3.5 animate-in fade-in duration-300">
            {/* CANLI RADAR VE AKTİF KULLANICILAR ŞERİDİ */}
            {onlineUsers.length > 0 && (
                <div className="bg-[#0d1117] border border-white/[0.08] p-3 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-bold flex items-center gap-2 text-white">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            Canlı Radar ve Çevrimiçi Varlık ({onlineUsers.length})
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">Detay için kullanıcıya tıklayın</span>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none no-scrollbar">
                        {onlineUsers.map(u => {
                            const isGuest = u.role === 'misafir' || u.username === 'Misafir';
                            const isPC = u.device?.toLowerCase().includes('windows') || u.device?.toLowerCase().includes('mac');
                            const hasVpnRisk = !!u.vpnRisk;

                            return (
                                <div 
                                    key={u.id} 
                                    onClick={() => setSelectedRadarUser(u)} 
                                    className={`flex-shrink-0 flex items-center gap-2 bg-[#07090e] hover:bg-slate-800/80 border rounded-xl px-2.5 py-1.5 cursor-pointer transition-all ${
                                        hasVpnRisk ? 'border-amber-500/30' : isGuest ? 'border-violet-500/30' : 'border-emerald-500/20'
                                    }`}
                                >
                                    <div className="relative">
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center border text-[10px] font-bold ${
                                            isGuest 
                                                ? 'bg-violet-500/10 border-violet-500/20 text-violet-400' 
                                                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                        }`}>
                                            {isGuest ? <Eye size={12} /> : <Users size={12} />}
                                        </div>
                                        <div className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
                                            hasVpnRisk ? 'bg-amber-400' : 'bg-emerald-500'
                                        }`} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1">
                                            <p className="text-[11px] font-bold text-white capitalize">{u.username}</p>
                                            <span className="text-[9px] text-slate-400 font-mono">
                                                ({u.deviceType || (isPC ? 'PC' : 'Mobil')})
                                            </span>
                                        </div>
                                        <p className="text-[9px] text-sky-400 font-mono leading-none">{u.ip || '0.0.0.0'}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* SİTENİN GENEL MİMARİSİYLE UYUMLU FİLTRE VE ARAÇ ÇUBUĞU */}
            <div className="bg-[#0d1117] border border-white/[0.08] p-3 rounded-2xl space-y-2.5">
                {/* Kapsül Kategori Butonları */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
                    {CATEGORIES.map(cat => (
                        <button 
                            key={cat.key} 
                            onClick={() => setFilter(cat.key)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                                filter === cat.key 
                                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700' 
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>

                {/* Filtre Kontrolleri */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/[0.04]">
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                        {/* Arama Input */}
                        <div className="relative flex-1 sm:max-w-xs min-w-[160px]">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input 
                                type="text" 
                                placeholder="Log kaydı ara..." 
                                value={searchTerm} 
                                onChange={(e) => setSearchTerm(e.target.value)} 
                                className="w-full h-8 bg-[#07090e] border border-white/[0.08] text-white text-xs rounded-xl pl-8 pr-2 outline-none focus:border-slate-500 transition-colors" 
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer">
                                    <X size={12}/>
                                </button>
                            )}
                        </div>

                        {/* Tarih Seçici */}
                        <div className="relative">
                            <input 
                                type="date" 
                                value={dateFilter} 
                                onChange={(e) => setDateFilter(e.target.value)} 
                                className="h-8 bg-[#07090e] border border-white/[0.08] text-slate-300 text-xs rounded-xl px-2.5 outline-none focus:border-slate-500 transition-colors cursor-pointer" 
                                style={{ colorScheme: 'dark' }}
                            />
                            {dateFilter && (
                                <button onClick={() => setDateFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-400 cursor-pointer">
                                    <X size={12}/>
                                </button>
                            )}
                        </div>

                        {/* Kullanıcı Dropdown */}
                        <div className="relative">
                            <select
                                value={userFilter}
                                onChange={(e) => setUserFilter(e.target.value)}
                                className="h-8 bg-[#07090e] border border-white/[0.08] text-slate-300 text-xs rounded-xl px-2.5 outline-none focus:border-slate-500 transition-colors cursor-pointer"
                            >
                                <option value="ALL">Tüm Kullanıcılar</option>
                                {uniqueUsers.map(u => (
                                    <option key={u} value={u}>@{u}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Dışa Aktar ve Temizle Butonları */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportCSV}
                            title="CSV olarak indir"
                            className="h-8 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                        >
                            <Download size={13} className="text-sky-400" />
                            <span className="hidden sm:inline">Dışa Aktar (CSV)</span>
                            <span className="sm:hidden">CSV</span>
                        </button>

                        <button
                            onClick={() => setIsClearModalOpen(true)}
                            className="h-8 px-3 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                        >
                            <Trash2 size={13} />
                            <span className="hidden sm:inline">Tümünü Sil</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* LOG KAYITLARI LİSTESİ (SİTENİN TABLO MİMARİSİNE UYGUN) */}
            <div className="bg-[#07090e] border border-white/[0.08] rounded-2xl overflow-hidden shadow-xl">
                {filteredLog.length === 0 ? (
                    <div className="p-12 text-center">
                        <CheckCircle2 size={32} className="mx-auto mb-2 text-slate-600" />
                        <p className="text-slate-400 text-xs font-medium">Seçili filtrelere uygun denetim kaydı bulunamadı</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/[0.04]">
                        {filteredLog.map(entry => {
                            const metaDef = ACTION_CONFIG[entry.action] || { label: entry.action, color: 'text-slate-300', bg: 'bg-white/5 border-white/10' };
                            const date = new Date(entry.timestamp);
                            const hasMeta = !!entry.meta && Object.keys(entry.meta).length > 0;
                            const isExpanded = expandedId === entry.id;
                            const isReversible = canRestore(entry);
                            const isRollbackable = canRollback(entry);
                            const isBusy = !!restoringIds[entry.id];

                            return (
                                <div key={entry.id} className="transition-colors">
                                    {/* Ana Satır */}
                                    <div 
                                        onClick={() => hasMeta && setExpandedId(isExpanded ? null : entry.id)}
                                        className={`flex items-start justify-between gap-3 p-3 sm:p-3.5 hover:bg-white/[0.02] ${hasMeta ? 'cursor-pointer' : ''}`}
                                    >
                                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border whitespace-nowrap mt-0.5 flex-shrink-0 ${metaDef.bg} ${metaDef.color}`}>
                                                {metaDef.label}
                                            </span>

                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs sm:text-sm font-medium text-white break-words leading-snug">
                                                    {entry.detail}
                                                </p>

                                                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                    <span className="text-[11px] font-bold text-slate-400">@{entry.user}</span>

                                                    {entry.meta?.ip && (
                                                        <span className="bg-[#0c1017] border border-white/[0.08] px-1.5 py-0.5 rounded text-[10px] text-sky-400 font-mono flex items-center gap-1">
                                                            <Globe size={10} /> {entry.meta.ip}
                                                        </span>
                                                    )}

                                                    {entry.meta?.location && (
                                                        <span className="bg-[#0c1017] border border-white/[0.08] px-1.5 py-0.5 rounded text-[10px] text-amber-400 flex items-center gap-1">
                                                            <MapPin size={10} /> {entry.meta.location}
                                                        </span>
                                                    )}

                                                    {entry.meta?.vpnRisk && (
                                                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1">
                                                            <AlertTriangle size={10} /> VPN / Şüpheli Ağ
                                                        </span>
                                                    )}

                                                    {hasMeta && (
                                                        <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-0.5 hover:text-slate-300">
                                                            <span>Detay</span>
                                                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sağ Taraf: Zaman ve Geri Al / Geri Yükle */}
                                        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
                                            <span className="text-[10px] font-mono text-slate-400">
                                                {date.toLocaleDateString('tr-TR')} {date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>

                                            {/* Tek Dokunuşla Geri Yükle */}
                                            {isReversible && (
                                                <button 
                                                    disabled={isBusy}
                                                    onClick={(e) => handleRestoreItem(e, entry)}
                                                    className="flex items-center gap-1 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2 py-0.5 rounded-lg transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                                                >
                                                    <RotateCcw size={10} />
                                                    <span>{isBusy ? 'Kurtarılıyor...' : 'Geri Yükle'}</span>
                                                </button>
                                            )}

                                            {/* Tek Dokunuşla Eski Haline Döndür */}
                                            {isRollbackable && (
                                                <button 
                                                    disabled={isBusy}
                                                    onClick={(e) => handleRollbackItem(e, entry)}
                                                    className="flex items-center gap-1 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 px-2 py-0.5 rounded-lg transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                                                >
                                                    <Undo2 size={10} />
                                                    <span>{isBusy ? 'Döndürülüyor...' : 'Eski Haline Döndür'}</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* AÇILIR TEMİZ DETAY ÇEKMECESİ (KESİNLİKLE JSON YOK) */}
                                    {isExpanded && hasMeta && (
                                        <div className="border-t border-white/[0.04] bg-[#0c1017]/90 p-3 sm:p-4 space-y-2.5">
                                            {/* Karşılaştırmalı Diff (Eski vs Yeni) */}
                                            {entry.meta.before && entry.meta.after ? (
                                                renderHumanDiff(entry.meta.before, entry.meta.after)
                                            ) : (
                                                /* Bilgi Rozetleri */
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                                    {entry.meta.table && (
                                                        <div className="bg-[#07090e] border border-white/[0.06] p-2 rounded-lg">
                                                            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Koleksiyon</span>
                                                            <span className="text-sky-400 font-mono">{entry.meta.table}</span>
                                                        </div>
                                                    )}
                                                    {entry.meta.id && (
                                                        <div className="bg-[#07090e] border border-white/[0.06] p-2 rounded-lg">
                                                            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Belge Kimliği</span>
                                                            <span className="text-slate-300 font-mono text-[11px] truncate block" title={entry.meta.id}>{entry.meta.id}</span>
                                                        </div>
                                                    )}
                                                    {entry.meta.device && (
                                                        <div className="bg-[#07090e] border border-white/[0.06] p-2 rounded-lg">
                                                            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Cihaz Bilgisi</span>
                                                            <span className="text-slate-200 truncate block">{entry.meta.device}</span>
                                                        </div>
                                                    )}
                                                    {entry.meta.location && (
                                                        <div className="bg-[#07090e] border border-white/[0.06] p-2 rounded-lg">
                                                            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Bağlantı Konumu</span>
                                                            <span className="text-amber-400 truncate block">{entry.meta.location}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* RADAR KULLANICI / MİSAFİR DETAY MODALI */}
            {selectedRadarUser && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-[#07090e] border border-white/10 rounded-2xl w-full max-w-md p-5 sm:p-6 relative shadow-2xl animate-in zoom-in-95 duration-200">
                        <button 
                            onClick={() => setSelectedRadarUser(null)} 
                            className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                        
                        <div className="flex items-center gap-3 mb-4">
                            <div className="relative">
                                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center border border-emerald-500/40 text-emerald-400">
                                    <MonitorSmartphone size={20} />
                                </div>
                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#07090e]" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white capitalize">{selectedRadarUser.username}</h3>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-2 py-0.5 rounded-full font-bold">ÇEVRİMİÇİ</span>
                                    <span className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">{selectedRadarUser.role || 'Şoför'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 bg-[#0c1017] p-3.5 rounded-xl border border-white/[0.06] text-xs">
                            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                                <span className="text-slate-400 flex items-center gap-1.5"><Globe size={13} className="text-sky-400"/> IP Adresi</span>
                                <span className="font-mono font-bold text-sky-400">{selectedRadarUser.ip || '0.0.0.0'}</span>
                            </div>

                            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                                <span className="text-slate-400 flex items-center gap-1.5"><MapPin size={13} className="text-amber-400"/> Konum</span>
                                <span className="font-semibold text-amber-400">{selectedRadarUser.location || 'Bilinmiyor'}</span>
                            </div>

                            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                                <span className="text-slate-400 flex items-center gap-1.5"><MonitorSmartphone size={13}/> Cihaz Tipi</span>
                                <span className="font-semibold text-white">{selectedRadarUser.device || 'Bilinmiyor'}</span>
                            </div>

                            {selectedRadarUser.fingerprintId && (
                                <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                                    <span className="text-slate-400 flex items-center gap-1.5"><Cpu size={13} className="text-violet-400"/> Donanım Kimliği</span>
                                    <span className="font-mono text-violet-400 font-bold">{selectedRadarUser.fingerprintId}</span>
                                </div>
                            )}

                            <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                                <span className="text-slate-400 flex items-center gap-1.5"><Shield size={13}/> VPN / Proxy Durumu</span>
                                <span className={`font-bold ${selectedRadarUser.vpnRisk ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {selectedRadarUser.vpnRisk ? 'Şüpheli / VPN' : 'Temiz'}
                                </span>
                            </div>

                            <div className="flex justify-between items-center py-1.5">
                                <span className="text-slate-400 flex items-center gap-1.5"><Clock size={13}/> Son Sinyal (Heartbeat)</span>
                                <span className="font-mono text-slate-300">
                                    {selectedRadarUser.lastActive ? new Date(selectedRadarUser.lastActive).toLocaleTimeString('tr-TR') : 'Bilinmiyor'}
                                </span>
                            </div>
                        </div>

                        <button 
                            onClick={() => setSelectedRadarUser(null)} 
                            className="mt-4 w-full h-9 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition border border-slate-700 cursor-pointer"
                        >
                            Kapat
                        </button>
                    </div>
                </div>, document.body
            )}

            {/* LOG TEMİZLEME GÜVENLİK MODALI */}
            {isClearModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#07090e] border border-white/10 rounded-2xl w-full max-w-sm p-5 sm:p-6 relative shadow-2xl animate-in zoom-in-95 duration-200">
                        <button 
                            onClick={() => { setIsClearModalOpen(false); setClearPassword(''); setClearError(false); }} 
                            className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                        <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                            <AlertTriangle className="text-rose-400" size={18} /> Log Geçmişini Temizle
                        </h3>
                        <p className="text-xs text-slate-400 mb-4">Tüm aktivite geçmişi geri alınamaz şekilde silinecektir.</p>

                        <form onSubmit={handleSecureClear} className="space-y-3">
                            <div>
                                <label className="block text-[11px] font-medium text-slate-400 mb-1">Güvenlik Şifresi</label>
                                <input
                                    type="password"
                                    autoFocus
                                    required
                                    value={clearPassword}
                                    onChange={e => setClearPassword(e.target.value)}
                                    className={`w-full h-9 bg-[#0c1017] border border-white/10 text-white rounded-xl px-3 text-xs outline-none focus:border-slate-500 ${clearError ? 'border-rose-500 bg-rose-500/5' : ''}`}
                                    placeholder="••••••••"
                                />
                                {clearError && <p className="text-[10px] text-rose-400 mt-1 font-semibold">Hatalı güvenlik şifresi!</p>}
                            </div>
                            <button 
                                type="submit"
                                className="w-full h-9 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-600/20 cursor-pointer"
                            >
                                Onayla ve Tümünü Sil
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminLog;
